#!/usr/bin/env python3
"""CMS(고객사 직접 수정) 빌드 도구 (2026-11-19)

  python3 tools/cms.py ids              소스 html 의 편집 단위에 data-cms="..." 를 붙인다 (새로 생긴 것만)
  python3 tools/cms.py check            data-cms 가 빠진 편집 단위가 있으면 실패 (build-dist.sh 가 부른다)
  python3 tools/cms.py index dist       dist/admin/cms-index.json — 페이지 목록·id 가 들어 있는 파일·원래 값
  python3 tools/cms.py apply dist FILE  content.json(고객사가 고친 값)을 dist html 에 적용한다

편집 단위
- 글: 안에 글자와 <br> 만 있는 가장 안쪽 요소 (p, h1, span, a, li …). 한글/영문(data-l), PC/모바일 문구(wd-t-pc/mo)는
  각각 따로 된 요소라 각자 편집 단위가 된다.
- 이미지: <img src>, <picture><source srcset> (모바일 이미지)
- 영상: <video poster>, <video><source src>, 비메오 자리 [data-vimeo]
- 로고 목록: data-cms-list="logos" 가 달린 요소 (About 로고 띠) 하나가 통째로 한 단위. 안의 로고는 따로 단위가 아니다.
  값 {"rows": [[{"src", "alt"}, ...], [...]]} — 저장하면 두 줄을 새로 만든다 (logos_html).

id
- 페이지 본문: 페이지 코드 + 번호 (d13-042). 번호는 한 번 붙으면 바뀌지 않는다 → 고객사 수정값이 엉뚱한 곳에 붙지 않는다.
- 메뉴(nav.gnb)·바닥글(footer): 모든 페이지에 똑같이 들어 있으므로 같은 것끼리 같은 id(g-007) — 한 번 고치면 전 페이지에 반영.

적용 규칙은 서버의 admin/lib.php (cms_apply_*) 와 똑같아야 한다. 고치면 둘 다 고친다.
"""
import html
import json
import os
import posixpath
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = {  # 소스 파일 → 페이지 코드
    "index.html": "home",
    "works.html": "works",
    "about.html": "about",
    "contact.html": "contact",
    **{f"works-detail-{i:02d}.html": f"d{i:02d}" for i in range(1, 15)},
}

VOID = {"br", "img", "source", "meta", "link", "input", "hr", "wbr", "col", "area", "base", "embed", "param", "track"}
SKIP = {"script", "style", "head", "title", "template", "svg", "noscript"}

# <br> 종류 (base.css): 둘 다 / 모바일만 / PC만. 그 밖의 클래스(wd10-br-mo 등)는 그대로 지킨다.
BR_RE = re.compile(r"<br\b([^>]*)/?>", re.I)
CLASS_RE = re.compile(r'\bclass="([^"]*)"')


class Scan(HTMLParser):
    """편집 단위를 찾는다. 결과: [(kind, start_offset, starttag_text, attrs, inner_or_None, in_main, sig)]"""

    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.text = text
        self.lines = [0]
        for m in re.finditer("\n", text):
            self.lines.append(m.end())
        self.stack = []
        self.items = []
        self.skip = 0
        self.main = 1  # 1 이상 = 페이지 고유, 0 = 메뉴·바닥글 안(공용)
        self.inlist = 0  # 로고 목록 안 = 따로 편집 단위가 아니다

    def off(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def chain(self):
        # 공용(메뉴·바닥글) 비교용: 어느 뿌리 안인지만 본다. 중간 구조(About 바닥글의 div.ft-inner 등)나
        # <body> 클래스는 페이지마다 달라서 넣으면 같은 바닥글이 다른 것으로 잡힌다
        root = "page"
        for e in self.stack:
            if e["tag"] == "footer":
                root = "footer"
            elif e["tag"] == "nav" and "gnb" in (e["attrs"].get("class") or "").split():
                root = "gnb"
        return root

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        start = self.off()
        raw = self.get_starttag_text()
        if self.skip:
            if tag in SKIP and tag not in VOID:
                self.skip += 1
            return
        if self.stack:
            self.stack[-1]["kids"].append(tag)
        islist = "data-cms-list" in a and tag not in VOID
        if islist:
            self.items.append({"kind": a["data-cms-list"], "start": start, "raw": raw, "attrs": a, "main": self.main > 0,
                               "sig": ("list", self.chain(), a["data-cms-list"])})
        if self.inlist:
            pass
        elif tag in ("img",) or (tag == "source" and self.stack and self.stack[-1]["tag"] in ("picture", "video")) \
                or tag == "video" or (tag != "source" and "data-vimeo" in a):
            kind = {"img": "img", "source": "source", "video": "video"}.get(tag, "vimeo")
            if tag == "source":
                kind = "msource" if self.stack[-1]["tag"] == "picture" else "vsource"
            sig = (kind, self.chain(), a.get("src") or a.get("srcset") or a.get("poster") or a.get("data-vimeo") or "")
            self.items.append({"kind": kind, "start": start, "raw": raw, "attrs": a, "main": self.main > 0, "sig": sig})
        if tag in SKIP and tag not in VOID:
            self.skip = 1
            return
        if tag in VOID:
            return
        if tag == "footer" or (tag == "nav" and "gnb" in (a.get("class") or "").split()):
            self.main -= 1  # 메뉴·바닥글 = 공용
        self.stack.append({"tag": tag, "attrs": a, "start": start, "raw": raw, "kids": [], "text": "",
                           "chain": self.chain(), "main": self.main > 0, "inner_start": start + len(raw),
                           "inlist": self.inlist > 0, "islist": islist})
        if islist:
            self.inlist += 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_data(self, d):
        if not self.skip and self.stack:
            self.stack[-1]["text"] += d

    def handle_entityref(self, n):
        self.handle_data("&" + n + ";")

    def handle_charref(self, n):
        self.handle_data("&#" + n + ";")

    def handle_endtag(self, tag):
        if self.skip:
            if tag in SKIP:
                self.skip -= 1
            return
        end = self.off()
        while self.stack:
            e = self.stack.pop()
            if e["tag"] == "footer" or (e["tag"] == "nav" and "gnb" in (e["attrs"].get("class") or "").split()):
                self.main += 1
            if e["islist"]:
                self.inlist -= 1
                for it in self.items:
                    if it["start"] == e["start"]:
                        it["inner"] = self.text[e["inner_start"]:end]
            txt = e["text"].strip()
            others = [k for k in e["kids"] if k != "br"]
            if txt and not others and not e["inlist"]:
                inner = self.text[e["inner_start"]:end] if e["tag"] == tag else None
                if inner is not None:
                    ntext = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", inner)).split())
                    self.items.append({"kind": "text", "start": e["start"], "raw": e["raw"], "attrs": e["attrs"],
                                       "main": e["main"], "sig": ("text", e["chain"], e["tag"], e["attrs"].get("class") or "", ntext), "inner": inner})
            if e["tag"] == tag:
                break


def scan(text):
    p = Scan(text)
    p.feed(text)
    p.close()
    return sorted(p.items, key=lambda i: i["start"])


def src_files():
    return [(f, PAGES[f]) for f in PAGES if os.path.exists(os.path.join(ROOT, f))]


def cmd_ids(write=True):
    """data-cms 가 없는 편집 단위에 id 를 붙인다. write=False 면 빠진 개수만 센다."""
    docs = {}
    shared = {}  # sig → id (메뉴·바닥글)
    used = {}  # page code → 쓰인 번호
    gmax = 0
    for f, code in src_files():
        text = open(os.path.join(ROOT, f), encoding="utf-8").read()
        items = scan(text)
        docs[f] = (text, items)
        used.setdefault(code, set())
        for it in items:
            cid = it["attrs"].get("data-cms")
            if not cid:
                continue
            if cid.startswith("g-"):
                shared.setdefault(it["sig"], cid)
                gmax = max(gmax, int(cid[2:]))
            else:
                used[code].add(int(cid.split("-")[1]))
    missing = 0
    for f, code in src_files():
        text, items = docs[f]
        n = max(used[code] or {0})
        inserts = []
        for it in items:
            if it["attrs"].get("data-cms"):
                continue
            missing += 1
            if it["main"]:
                n += 1
                cid = f"{code}-{n:03d}"
            else:
                cid = shared.get(it["sig"])
                if not cid:
                    gmax += 1
                    cid = f"g-{gmax:03d}"
                    shared[it["sig"]] = cid
            m = re.match(r"<[a-zA-Z0-9]+", it["raw"])
            inserts.append((it["start"] + m.end(), f' data-cms="{cid}"'))
        if write and inserts:
            for pos, s in sorted(inserts, reverse=True):
                text = text[:pos] + s + text[pos:]
            with open(os.path.join(ROOT, f), "w", encoding="utf-8") as fh:
                fh.write(text)
            print(f"{f}: {len(inserts)}개 붙임")
    return missing


# ── 적용 (admin/lib.php 와 같은 규칙) ─────────────────────────────

ALLOWED_BR = re.compile(r"^[a-z0-9 -]*$")
WS = re.compile(r"[\x20\x09\x0A\x0B\x0C\x0D]+")  # ASCII 공백 6개만. \v 를 쓰면 안 된다 — PHP(PCRE, 바이트 모드)에서
# \v 는 0x85 까지 잡는데 그 바이트가 한글 UTF-8 안에 들어 있어 글자가 쪼개졌다 (2026-11-19). 세 곳(cms.py · lib.php · editor.js) 모두 같은 목록


def norm(t):
    return WS.sub(" ", str(t)).strip(" ")


def esc_attr(v):
    # PHP htmlspecialchars(ENT_QUOTES) 와 같은 결과 (' → &#039;)
    return html.escape(str(v)).replace("&#x27;", "&#039;")


def text_html(item):
    """{"lines": [...], "breaks": [...]} → 안쪽 html. 글자는 이스케이프, <br> 클래스는 정해진 글자만."""
    lines = item.get("lines") or [""]
    breaks = item.get("breaks") or []
    out = []
    for i, line in enumerate(lines):
        out.append(html.escape(norm(line), quote=False))
        if i < len(lines) - 1:
            cls = breaks[i] if i < len(breaks) else ""
            cls = cls if ALLOWED_BR.match(cls or "") else ""
            out.append(f' <br class="{cls}" />' if cls else " <br />")
    return "".join(out)


LOGO_FILL = 9  # 한 줄의 앞 절반에 로고가 이만큼은 있어야 넓은 화면에서 띠가 비지 않는다 (원래 9개씩)
SAFE_SRC = re.compile(r"^(/[A-Za-z0-9._/-]+|https://[A-Za-z0-9._/-]+)$")


def logos_html(item):
    """{"rows": [[{"src", "alt"}...], [...]]} → 로고 띠 안쪽 html (두 줄). admin/lib.php cms_logos_html 과 같은 결과.
    줄마다 [보이는 로고 + 모자라면 반복(숨김)] 한 벌 + 그 한 벌 전체 복제(숨김) → CSS 가 -50% 로 무한 루프"""
    rows = item.get("rows") or []
    out = ["\n"]
    for r in range(2):
        row = [x for x in (rows[r] if r < len(rows) and isinstance(rows[r], list) else []) if isinstance(x, dict) and SAFE_SRC.match(str(x.get("src") or ""))]
        out.append('          <div class="ab-brands-row">\n')
        half = []
        if row:
            reps = max(1, -(-LOGO_FILL // len(row)))
            for k in range(reps):
                for x in row:
                    half.append((x, k == 0))
        for copy in range(2):
            for x, vis in half:
                show = vis and copy == 0
                alt = esc_attr(norm(x.get("alt") or "")) if show else ""
                hidden = "" if show else ' aria-hidden="true"'
                out.append(f'            <div class="ab-brand"{hidden}>\n              <img src="{esc_attr(x["src"])}" alt="{alt}" />\n            </div>\n')
        out.append("          </div>\n")
    out.append("        ")
    return "".join(out)


def tel_href(t):
    return "tel:" + re.sub(r"[^0-9+]", "", t)


def apply_one(doc, cid, item):
    """doc 안의 data-cms="cid" 요소에 item 을 적용한다. 바뀐 doc 과 적용 횟수를 돌려준다."""
    q = re.escape(cid)
    count = 0
    if "rows" in item:
        pat = re.compile(r'(<([a-zA-Z0-9]+) data-cms="' + q + r'"[^>]*>)(.*?)(</\2>)', re.S)

        def rep_list(m):
            nonlocal count
            count += 1
            return m.group(1) + logos_html(item) + m.group(4)

        doc = pat.sub(rep_list, doc)
    elif "lines" in item:
        pat = re.compile(r'(<([a-zA-Z0-9]+) data-cms="' + q + r'"[^>]*>)(.*?)(</\2>)', re.S)

        def rep(m):
            nonlocal count
            count += 1
            tag, inner = m.group(1), m.group(3)
            lead = re.match(r"[\x20\x09\x0A\x0B\x0C\x0D]*", inner).group(0)
            trail = re.search(r"[\x20\x09\x0A\x0B\x0C\x0D]*$", inner).group(0)
            new = text_html(item)
            plain = " ".join(norm(x) for x in (item.get("lines") or []))
            if re.search(r'\bhref="tel:', tag):
                tag = re.sub(r'\bhref="tel:[^"]*"', lambda _: f'href="{esc_attr(tel_href(plain))}"', tag)
            elif re.search(r'\bhref="mailto:', tag):
                tag = re.sub(r'\bhref="mailto:[^"]*"', lambda _: f'href="mailto:{esc_attr(plain)}"', tag)
            if item.get("href") and re.match(r"^(https?://|mailto:|tel:)", item["href"]):
                tag = re.sub(r'\bhref="[^"]*"', lambda _: f'href="{esc_attr(item["href"])}"', tag)
            return tag + lead + new + trail + m.group(4)

        doc = pat.sub(rep, doc)
    else:
        pat = re.compile(r'<[a-zA-Z0-9]+ data-cms="' + q + r'"[^>]*>')

        def rep(m):
            nonlocal count
            count += 1
            tag = m.group(0)
            for attr in ("src", "srcset", "poster", "data-vimeo"):
                if attr in item and item[attr] is not None:
                    val = esc_attr(item[attr])
                    if re.search(r"\b" + attr + r'="', tag):
                        tag = re.sub(r"(\s)" + attr + r'="[^"]*"', lambda mm: f'{mm.group(1)}{attr}="{val}"', tag)
            return tag

        doc = pat.sub(rep, doc)
    return doc, count


def html_files(dist):
    for d, _, fs in os.walk(dist):
        if os.path.relpath(d, dist).split(os.sep)[0] in ("admin", "cms-data"):
            continue
        for f in fs:
            if f.endswith(".html"):
                yield os.path.join(d, f)


def cmd_index(dist):
    """dist 의 data-cms 를 모아 admin/cms-index.json 을 만든다 (적용 전 원래 값 = 되돌리기 기준)."""
    pages, ids = [], {}
    for path in sorted(html_files(dist)):
        rel = os.path.relpath(path, dist).replace(os.sep, "/")
        text = open(path, encoding="utf-8").read()
        found = re.findall(r'data-cms="([^"]+)"', text)
        if not found:
            continue
        title = re.search(r"<title>(.*?)</title>", text, re.S)
        route = rel[: -len("index.html")] if rel.endswith("index.html") else rel
        pages.append({"file": rel, "route": route, "title": html.unescape(title.group(1).strip()) if title else rel})
        for it in scan(text):
            cid = it["attrs"].get("data-cms")
            if not cid:
                continue
            e = ids.setdefault(cid, {"files": [], "kind": it["kind"]})
            if rel not in e["files"]:
                e["files"].append(rel)
            if "base" in e:
                continue
            if it["kind"] == "logos":
                rows = []
                for part in re.split(r'<div class="ab-brands-row">', it["inner"])[1:]:
                    row = []
                    for m in re.finditer(r'<div class="ab-brand">\s*(<img\b[^>]*>)', part):
                        tag = m.group(1)
                        src = re.search(r'\ssrc="([^"]*)"', tag).group(1)
                        alt = re.search(r'\salt="([^"]*)"', tag)
                        if not re.match(r"^(/|https?:)", src):
                            src = "/" + posixpath.normpath(posixpath.join(posixpath.dirname(rel), src)).lstrip("./")
                        row.append({"src": src, "alt": html.unescape(alt.group(1)) if alt else ""})
                    rows.append(row)
                e["base"] = {"rows": rows}
            elif it["kind"] == "text":
                inner = it["inner"]
                parts = BR_RE.split(inner)
                # BR_RE.split 은 [글, br속성, 글, br속성, ...]
                lines = [norm(html.unescape(re.sub(r"<[^>]+>", "", p))) for p in parts[0::2]]
                breaks = []
                for attrs in parts[1::2]:
                    m = CLASS_RE.search(attrs or "")
                    breaks.append(m.group(1) if m else "")
                e["base"] = {"lines": lines, "breaks": breaks}
                href = it["attrs"].get("href")
                if href and re.match(r"^https?://", href):
                    e["base"]["href"] = href
            else:
                a = it["attrs"]
                base = {}
                for k in ("src", "srcset", "poster", "data-vimeo"):
                    if k in a:
                        v = a[k]
                        if k != "data-vimeo" and not re.match(r"^(/|https?:)", v):
                            v = "/" + posixpath.normpath(posixpath.join(posixpath.dirname(rel), v)).lstrip("./")
                        base[k] = v
                e["base"] = base
    # 관리자 화면의 페이지 목록 순서: 홈 → Works → About → Contact → 상세 01~14 (pretty-urls.py 의 ROUTES 순서)
    order = {}
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("pretty_urls", os.path.join(ROOT, "tools", "pretty-urls.py"))
        pu = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(pu)
        routes = list(pu.ROUTES.values())
        first = ["", "works/", "about/", "contact/"]
        order = {r: i for i, r in enumerate(first + [r for r in routes if r not in first])}
        for p in pages:
            src = [k for k, v in pu.ROUTES.items() if v == p["route"]]
            m = re.match(r"works-detail-(\d+)\.html$", src[0]) if src else None
            if m:
                p["num"] = m.group(1)
    except Exception as e:  # 순서만의 문제라 실패해도 빌드는 계속
        print("  (페이지 순서를 정하지 못함:", e, ")")
    pages.sort(key=lambda p: order.get(p["route"], 999))
    out = os.path.join(dist, "admin", "cms-index.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"pages": pages, "ids": ids}, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"CMS 목록: 페이지 {len(pages)}개 · 편집 단위 {len(ids)}개 → admin/cms-index.json")


def cmd_apply(dist, content_path):
    data = json.load(open(content_path, encoding="utf-8"))
    items = data.get("items") or {}
    if not items:
        print("CMS 수정값: 없음")
        return
    idx = json.load(open(os.path.join(dist, "admin", "cms-index.json"), encoding="utf-8"))["ids"]
    changed, orphan = 0, []
    byfile = {}
    for cid, item in items.items():
        if cid not in idx:
            orphan.append(cid)
            continue
        for rel in idx[cid]["files"]:
            byfile.setdefault(rel, []).append((cid, item))
    for rel, lst in byfile.items():
        path = os.path.join(dist, rel)
        doc = open(path, encoding="utf-8").read()
        for cid, item in lst:
            doc, n = apply_one(doc, cid, item)
            changed += n
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(doc)
    print(f"CMS 수정값 적용: {len(items)}개 항목 → {changed}곳")
    if orphan:
        print(f"  경고: 소스에서 사라진 id {len(orphan)}개는 건너뜀: {', '.join(orphan[:10])}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "ids":
        n = cmd_ids(write=True)
        print(f"새로 붙인 편집 단위: {n}개")
    elif cmd == "check":
        n = cmd_ids(write=False)
        if n:
            print(f"data-cms 가 없는 편집 단위 {n}개 — python3 tools/cms.py ids 를 돌리고 커밋하세요")
            sys.exit(1)
    elif cmd == "index":
        cmd_index(sys.argv[2])
    elif cmd == "apply":
        cmd_apply(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(2)
