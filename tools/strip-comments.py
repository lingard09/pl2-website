#!/usr/bin/env python3
"""배포본(dist)의 HTML·CSS 에서 주석을 지운다 (2026-10-17).

소스에는 작업 메모(피그마 노드, 피드백 날짜 등)를 주석으로 남겨 두지만,
배포된 페이지는 누구나 '소스 보기'로 볼 수 있으므로 서버에 올리는 파일에서는 뺀다.

  python3 tools/strip-comments.py dist

- HTML: <!-- ... --> 를 지운다. <script>·<style> 블록 안은 건드리지 않는다.
- CSS : /* ... */ 를 지운다. (문자열 안에 /* 가 있으면 안 되므로 그 경우 멈춘다)
- 주석만 있던 줄은 줄째 지워서 빈 줄이 남지 않게 한다.
- JS 는 문자열 안의 // (URL 등)를 잘못 지울 위험이 있어 손대지 않는다.
"""
import pathlib
import re
import sys

HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
RAW_BLOCK = re.compile(r"(<(script|style)\b[^>]*>.*?</\2>)", re.S | re.I)
CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
CSS_STRING_WITH_COMMENT = re.compile(r"""(["'])[^"'\n]*/\*""")


def tidy(text):
    # 주석을 지우고 남은 공백뿐인 줄을 없애고, 빈 줄이 연달아 생기면 하나로 줄인다
    lines = [line.rstrip() for line in text.split("\n")]
    out = []
    for line in lines:
        if line == "" and out and out[-1] == "":
            continue
        out.append(line)
    return "\n".join(out)


def strip_html(text):
    parts = RAW_BLOCK.split(text)
    # split 결과: [바깥, 블록, 태그명, 바깥, 블록, 태그명, ...]
    result = []
    i = 0
    while i < len(parts):
        result.append(remove_comment_lines(parts[i], HTML_COMMENT))
        if i + 1 < len(parts):
            result.append(parts[i + 1])
        i += 3
    return tidy("".join(result))


def remove_comment_lines(text, pattern):
    # 주석이 줄 전체를 차지하면 줄째 지우고, 줄 중간이면 주석만 지운다
    def repl(m):
        start = text.rfind("\n", 0, m.start()) + 1
        end = text.find("\n", m.end())
        end = len(text) if end == -1 else end
        before = text[start:m.start()]
        after = text[m.end():end]
        if before.strip() == "" and after.strip() == "":
            return "\0"  # 표시만 해 두고 아래에서 줄째 지운다
        return ""

    marked = pattern.sub(repl, text)
    return "\n".join(l for l in marked.split("\n") if "\0" not in l or l.replace("\0", "").strip())


def strip_css(text, name):
    if CSS_STRING_WITH_COMMENT.search(text):
        sys.exit(f"주석 제거 중단: {name} 의 문자열 안에 /* 가 있다")
    return tidy(remove_comment_lines(text, CSS_COMMENT))


def main(root):
    root = pathlib.Path(root)
    n = 0
    for f in root.rglob("*.html"):
        src = f.read_text(encoding="utf-8")
        out = strip_html(src)
        if out != src:
            f.write_text(out, encoding="utf-8")
            n += 1
    for f in root.rglob("*.css"):
        src = f.read_text(encoding="utf-8")
        out = strip_css(src, f.name)
        if out != src:
            f.write_text(out, encoding="utf-8")
            n += 1
    print(f"주석 제거: 파일 {n}개")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "dist")
