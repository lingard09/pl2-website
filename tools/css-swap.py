#!/usr/bin/env python3
"""CMS 이미지 ↔ 영상 교체용 CSS 변환 (2026-11-19, build-dist.sh 가 dist/assets/*.css 에 돌린다)

사이트 CSS 는 '.wd5-grid img { object-fit: cover }' 처럼 태그 이름으로 모양을 잡는 곳이 많다.
고객사가 관리자에서 이미지 자리를 영상으로 바꾸면 그 규칙이 영상에 걸리지 않아 모양이 달라진다.
그래서 배포본 CSS 에서만, img 가 들어간 선택자마다 'video[data-cms-swap]' 판을,
video 가 들어간 선택자마다 'img[data-cms-swap]' 판을 같은 규칙에 덧붙인다 (원본 CSS 는 그대로).
data-cms-swap 은 tools/cms.py swap_html 이 바꾼 요소에만 단다.

  python3 tools/css-swap.py dist/assets/*.css
"""
import re
import sys

TAG = re.compile(r"(^|[\s>+~(,])(img|video)(?=$|[\s.#:\[>+~),])")
SWAP = {"img": "video:where([data-cms-swap])", "video": "img:where([data-cms-swap])"}  # :where = 원래 규칙과 같은 우선순위


def split_top(sel):
    out, depth, cur = [], 0, ""
    for ch in sel:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


def variants(sel):
    """선택자 하나 → 덧붙일 선택자들 (img/video 를 각각 상대 태그 + data-cms-swap 으로)"""
    out = []
    for tag in ("img", "video"):
        if not any(m.group(2) == tag for m in TAG.finditer(sel)):
            continue
        v = TAG.sub(lambda m: m.group(1) + (SWAP[tag] if m.group(2) == tag else m.group(2)), sel)
        if v != sel:
            out.append(v)
    return out


def transform(css):
    out, i, n = [], 0, len(css)
    stack = []  # 블록 종류: "kf"(@keyframes 안) · "at" · "rule"
    head_start = 0
    added = 0
    while i < n:
        if css.startswith("/*", i):
            j = css.find("*/", i + 2)
            j = n if j < 0 else j + 2
            i = j
            continue
        ch = css[i]
        if ch == '"' or ch == "'":
            j = i + 1
            while j < n and css[j] != ch:
                j += 2 if css[j] == "\\" else 1
            i = j + 1
            continue
        if ch == "{":
            head = css[head_start:i]
            hs = head.strip()
            in_kf = bool(stack) and stack[-1] == "kf"
            if hs.startswith("@"):
                stack.append("kf" if re.match(r"@(-webkit-)?keyframes", hs) else "at")
            elif in_kf:
                stack.append("rule")
            else:
                stack.append("rule")
                # 주석을 뺀 선택자 목록
                plain = re.sub(r"/\*.*?\*/", "", head, flags=re.S)
                sels = [s.strip() for s in split_top(plain) if s.strip()]
                extra = []
                for s in sels:
                    for v in variants(s):
                        if v not in sels and v not in extra:
                            extra.append(v)
                if extra:
                    head_new = head.rstrip() + ",\n" + ",\n".join(extra) + head[len(head.rstrip()):]
                    out.append((head_start, i, head_new))
                    added += len(extra)
            head_start = i + 1
        elif ch == "}":
            if stack:
                stack.pop()
            head_start = i + 1
        elif ch == ";" and (not stack or stack[-1] != "rule"):
            head_start = i + 1  # @import, @charset 등 블록 없는 at 규칙
        i += 1
    # 바꿀 머리를 뒤에서부터 넣는다
    reps = [x for x in out if isinstance(x, tuple)]
    for a, b, new in sorted(reps, reverse=True):
        css = css[:a] + new + css[b:]
    return css, added


def main(paths):
    total = 0
    for p in paths:
        css = open(p, encoding="utf-8").read()
        new, n = transform(css)
        if n:
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(new)
        total += n
    print(f"CSS 이미지↔영상 선택자 {total}개 덧붙임")


if __name__ == "__main__":
    main(sys.argv[1:])
