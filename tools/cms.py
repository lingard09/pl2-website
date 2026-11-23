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
- 이미지 ↔ 영상 교체 (11.19): 본문의 <img>·자동재생 <video> 는 서로 바꿀 수 있다 (swap_ok 의 예외 자리와
  tools/cms-noswap.json 에 적힌 자리 제외). 목록에 원래 태그의 속성을 넣어 두고, 바꾸면 그 속성을 옮긴 새 태그를
  만든다 (swap_html). 값: {"as": "video", "src", "poster"} 또는 {"as": "img", "src"}.
- 새 페이지 (11.19): 고객사가 관리자에서 만든 상세 페이지. 서버 /cms-data/pages.json 이 원본이고,
  서버(admin/pages.php)와 빌드(cmd_pages)가 같은 틀로 /works/<slug>/index.html 과 Works 목록 카드를 만든다.
  바깥 틀(head·메뉴·바닥글)은 빌드가 상세 11 배포본에서 뽑아 admin/page-skeleton.html 로 둔다 (cmd_skeleton).
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

# 자리별 허용 목록 (tools/cms-swap-check.mjs 가 실제로 바꿔 보고 적는다)
#   noswap: 이미지↔영상으로 바꾸면 모양이 달라지는 자리 / nofit: 높이를 파일 비율에 맞출 수 없는 자리
#   noscale: 크기 단계를 줄 수 없는 자리 (한 줄에 다른 그림과 나란히 있는 칸 등)
try:
    SLOTS = json.load(open(os.path.join(ROOT, "tools", "cms-slots.json"), encoding="utf-8"))
except FileNotFoundError:
    SLOTS = {}
if os.environ.get("CMS_NOSWAP") == "off":  # cms-swap-check.mjs 가 후보 전부를 잴 때
    SLOTS = {}
NOSWAP, NOFIT, NOSCALE = (set(SLOTS.get(k) or []) for k in ("noswap", "nofit", "noscale"))

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
            it = {"kind": kind, "start": start, "raw": raw, "attrs": a, "main": self.main > 0, "sig": sig,
                  "swap": self.swap_ok(tag, a), "inpic": bool(self.stack) and self.stack[-1]["tag"] == "picture"}
            if kind == "vsource":
                it["parent"] = self.stack[-1]["attrs"].get("data-cms")
            self.items.append(it)
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

    def swap_ok(self, tag, a):
        """이미지 ↔ 영상으로 바꿔도 되는 자리인가. JS 가 태그나 위치를 직접 다루는 곳은 뺀다."""
        if self.inlist or self.main <= 0:
            return False  # 로고 목록 · 메뉴 · 바닥글
        if tag == "img":
            if (a.get("src") or "").lower().endswith(".svg") or "data-slot" in a:
                return False  # 아이콘·로고, 상세 01 이미지 띠(wd1-strip.js)
        elif tag == "video":
            if "autoplay" not in a or "data-chapter-video" in a:
                return False  # 재생 버튼·챕터 영상 (video-play.js · wd13-chapters.js)
        else:
            return False
        if "data-pin-media" in a:
            return False
        for e in self.stack:
            ea = e["attrs"]
            cls = (ea.get("class") or "").split()
            if "data-pin" in ea or "data-playing" in ea or "wd-film-frame" in cls or "wd-stack-set" in cls \
                    or any(c.startswith("wd7-code") for c in cls):
                return False  # About 고정 구간 · 재생 버튼 자리 · 상세 01 쌓이는 카드 · 상세 07 코드 화면
        return True

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


ATTR_RE = re.compile(r'\s([^\s"\'>/=]+)(?:="([^"]*)")?')
IMG_ONLY = {"src", "alt", "loading", "decoding", "draggable", "srcset", "sizes", "width", "height"}
VIDEO_ONLY = {"poster", "preload", "autoplay", "muted", "loop", "playsinline", "controls", "width", "height"}


def raw_attrs(raw):
    """시작 태그 → [[이름, 값(원문 그대로) 또는 None], ...] (data-cms 제외)"""
    body = re.sub(r"^<[a-zA-Z0-9]+", "", raw).rstrip(">").rstrip("/")
    return [[m.group(1), m.group(2)] for m in ATTR_RE.finditer(body) if m.group(1) != "data-cms"]


def attrs_html(attrs, drop=()):
    return "".join(f' {n}="{v}"' if v is not None else f" {n}" for n, v in attrs if n not in drop)


def scale_ok(v):
    """크기 % — 30~99 정수 (100 = 원래 크기). lib.php cms_scale_ok · editor.js 와 같게"""
    return type(v) is int and 30 <= v <= 99


def size_attrs(attrs, item, drop=()):
    """원래 속성 + 크기 설정. fit = 높이를 파일 비율에 맞춤 (base.css [data-cms-fit]),
    scale = 크기 단계 (CSS scale 속성 — 모션이 쓰는 transform 과 따로 논다, 줄이기만 하므로 남을 덮지 않는다)"""
    attrs = [a for a in attrs if a[0] not in drop]
    parts, flags = [], ""
    fit = item.get("fit")
    if isinstance(fit, dict) and int(fit.get("w") or 0) > 0 and int(fit.get("h") or 0) > 0:
        parts.append(f"--cms-ar: {int(fit['w'])} / {int(fit['h'])}")
        if int(fit.get("mw") or 0) > 0 and int(fit.get("mh") or 0) > 0:
            parts.append(f"--cms-ar-mo: {int(fit['mw'])} / {int(fit['mh'])}")
        flags += " data-cms-fit"
    sc = item.get("scale")
    if scale_ok(sc):
        parts.append(f"scale: {sc}%")
        flags += " data-cms-scale"
    if not parts:
        return attrs_html(attrs)
    style = next((v for n, v in attrs if n == "style"), None)
    attrs = [a for a in attrs if a[0] != "style"]
    st = (style.rstrip(" ;") + "; " if style else "") + "; ".join(parts)
    return attrs_html(attrs) + flags + f' style="{st}"'


def element_html(cid, sw, item):
    form = item.get("as") or sw["tag"]
    if form == sw["tag"]:
        s = f'<{form} data-cms="{cid}"' + size_attrs(sw["attrs"], item)
        return s + " />" if form == "img" else s + ">" + sw["inner"] + "</video>"
    # data-cms-swap: 배포본 CSS(tools/css-swap.py)가 원래 태그의 규칙을 여기에도 건다.
    # width/height 속성은 넣지 않는다 — CSS 가 폭만 정하는 자리에서 속성 높이가 그대로 박힌다
    head = f'<{form} data-cms="{cid}" data-cms-swap'
    if form == "video":
        msrc = item.get("msrc")
        srcs = (f'<source media="(max-width: 599.98px)" src="{esc_attr(msrc)}" type="video/mp4" />' if msrc else "") \
            + f'<source src="{esc_attr(item.get("src") or "")}" type="video/mp4" />'
        return (head + size_attrs(sw["attrs"], item, IMG_ONLY) + f' poster="{esc_attr(item.get("poster") or "")}"'
                + ' autoplay muted loop playsinline preload="metadata">' + srcs + "</video>")
    return head + size_attrs(sw["attrs"], item, VIDEO_ONLY) + f' src="{esc_attr(item.get("src") or "")}" alt="" />'


def swap_html(cid, sw, item):
    """원래 태그 정보(sw)와 값(item)으로 자리를 통째로 만든다. admin/lib.php cms_swap_html 과 같은 결과.
    <picture> 안의 이미지는 <picture> 틀을 남기고, 영상으로 바꾸면 안쪽(모바일 <source> 포함)을 영상 하나로."""
    el = element_html(cid, sw, item)
    w = sw.get("wrap")
    if not w:
        return el
    inner = w["pre"] + el + w["post"] if (item.get("as") or sw["tag"]) == sw["tag"] else el
    return "<picture" + attrs_html(w["attrs"]) + ">" + inner + "</picture>"


def tel_href(t):
    return "tel:" + re.sub(r"[^0-9+]", "", t)


def apply_one(doc, cid, item, meta=None):
    """doc 안의 data-cms="cid" 요소에 item 을 적용한다. 바뀐 doc 과 적용 횟수를 돌려준다."""
    q = re.escape(cid)
    count = 0
    sw = (meta or {}).get("swap")
    if sw:
        # 교체·크기 설정이 있는 자리는 원래 태그 정보로 자리를 통째로 다시 만든다 (되돌릴 때도)
        if sw.get("wrap"):
            pat = re.compile(r'<picture\b[^>]*>(?:(?!</picture>).)*?data-cms="' + q + r'"(?:(?!</picture>).)*?</picture>', re.S)
        else:
            pat = re.compile(r'<img data-cms="' + q + r'"[^>]*>|<video data-cms="' + q + r'"[^>]*>.*?</video>', re.S)
        new = swap_html(cid, sw, item)
        doc, count = pat.subn(lambda _: new, doc)
        if item.get("as"):
            return doc, count
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


# ── 새 페이지 (admin/pages.php 와 같은 결과) ─────────────────────────────

SKELETON_FROM = "11"  # 바깥 틀을 뽑을 상세 페이지 번호 (어두운 테마 · 히어로 fade-black)


def ptext(t):
    return html.escape(norm(t), quote=False)


def plines(t):
    """여러 줄 글 → 줄마다 이스케이프, 줄 사이 <br /> (상세 개요·헤더는 모바일에서 맨 <br> 을 끈다 = 자동 줄바꿈)"""
    return " <br />".join(ptext(x) for x in str(t or "").replace("\r", "").split("\n"))


def pkoen(ko, en):
    if norm(en or ""):
        return f'<span data-l="ko">{plines(ko)}</span><span data-l="en" lang="en">{plines(en)}</span>'
    return plines(ko)


def pmedia(m, cls="", extra=""):
    c = f' class="{cls}"' if cls else ""
    if m.get("type") == "video":
        return (f'<video{c}{extra} poster="{esc_attr(m.get("poster") or "")}" autoplay muted loop playsinline preload="metadata">'
                f'<source src="{esc_attr(m.get("src") or "")}" type="video/mp4" /></video>')
    return f'<img{c}{extra} src="{esc_attr(m.get("src") or "")}" alt="" />'


GAPS = (40, 80, 160)  # 글 칸 위·아래 간격 (기본은 섹션 간격 320)
WIDTHS = ("90", "80", "70", "60", "50")  # 한 칸 줄의 폭 (가운데)
SPLITS = ("2-1", "1-2")  # 두 칸 줄의 비율 (기본 1:1)


def pcell(m):
    """줄의 한 칸 — 캡션이 있으면 figure 로 감싼다"""
    el = pmedia(m, "", " data-reveal")
    cap = norm(m["caption"]) if isinstance(m.get("caption"), str) else ""
    if cap:
        return f'<figure class="wdc-fig">{el}<figcaption class="wdc-cap">{ptext(cap)}</figcaption></figure>'
    return el


# ── 인터랙션 블록 (11.20 CMS 피드백, assets/wdc-blocks.css · wdc-blocks.js) ──
# 값은 서버 cms_page_clean 이 검사한 것만 들어온다. 여기서는 모양이 맞지 않으면 조용히 건너뛴다 (PHP 와 같게).

def pimgs(lst):
    """이미지만 (src 가 있는 img) — 순서 그대로"""
    return [m for m in (lst or []) if isinstance(m, dict) and m.get("type") == "img" and isinstance(m.get("src"), str) and m["src"]]


def pimg(m, extra=""):
    return f'<img{extra} src="{esc_attr(m["src"])}" alt="" />'


def pratio(r):
    """[가로, 세로] 정수 → 'W / H' (없거나 이상하면 None)"""
    if isinstance(r, list) and len(r) == 2 and all(type(x) is int and 0 < x <= 20000 for x in r):
        return f"{r[0]} / {r[1]}"
    return None


def ppct(v):
    """0.01% 단위 정수 → '12.34'"""
    return f"{v // 100}.{v % 100:02d}"


def pcard_ok(c):
    return (isinstance(c, dict) and c.get("type") == "img" and isinstance(c.get("src"), str) and c["src"]
            and all(type(c.get(k)) is int for k in ("x", "y", "w")))


def pfx_block(b):
    """인터랙션 블록 html (모르는 종류·빈 블록이면 None)"""
    t = b.get("type")
    cap = norm(b["caption"]) if isinstance(b.get("caption"), str) else ""
    if t == "strip":
        items = pimgs(b.get("items"))
        if len(items) < 3:
            return None
        n = len(items)
        copies = -(-10 // n)  # 칸이 화면을 채우도록 10장 이상이 될 때까지 반복
        imgs = "".join(pimg(m) for m in items)
        imgs += "".join(pimg(m, ' data-dup aria-hidden="true"') for _ in range(copies - 1) for m in items)
        x = (f'<section class="wdc-strip" data-wdc-strip data-steps="{n - 1}" style="--steps: {n - 1}">'
             '<div class="wdc-strip-pin" data-reveal><div class="wdc-strip-band"><div class="wdc-strip-track">'
             + imgs + "</div></div>")
        if cap:
            x += f'<p class="wdc-strip-cap">{ptext(cap)}</p>'
        return x + "</div></section>"
    if t == "stack":
        sets = [pimgs(s)[:3] for s in (b.get("sets") or []) if isinstance(s, list)]
        sets = [s for s in sets if s][:5]
        if not sets:
            return None
        x = f'<section class="wdc-stack" data-wdc-stack style="--sets: {len(sets)}"><div class="wdc-stack-pin"><div class="wdc-stack-stage">'
        for j, s in enumerate(sets):
            x += f'<div class="wdc-stack-set{" wdc-stack-set--up" if j else ""}">' + "".join(pimg(m, ' decoding="async"') for m in s) + "</div>"
        return x + "</div></div></section>"
    if t == "compare":
        bf, af = pimgs([b.get("before")]), pimgs([b.get("after")])
        if not bf or not af:
            return None
        ar = pratio(b.get("ratio"))
        return (f'<section class="wdc-compare" data-reveal style="--pos: 50%{"; aspect-ratio: " + ar if ar else ""}">'
                + pimg(af[0], ' class="wdc-compare-after" draggable="false"')
                + '<div class="wdc-compare-before" aria-hidden="true">' + pimg(bf[0], ' draggable="false"') + "</div>"
                + '<div class="wdc-compare-handle" role="slider" tabindex="0" aria-label="전후 비교 경계" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">'
                '<button type="button" class="wdc-compare-btn wdc-compare-btn--prev" aria-label="경계를 왼쪽으로" tabindex="-1"></button>'
                '<button type="button" class="wdc-compare-btn wdc-compare-btn--next" aria-label="경계를 오른쪽으로" tabindex="-1"></button>'
                "</div></section>")
    if t == "wipe":
        a, c = pimgs([b.get("a")]), pimgs([b.get("b")])
        if not a or not c:
            return None
        ar = pratio(b.get("ratio"))
        st = f' style="aspect-ratio: {ar}; --ar: {ar}"' if ar else ""
        x = (f'<figure class="wdc-wipe" data-reveal><div class="wdc-wipe-scroll" data-wdc-wipe><div class="wdc-wipe-pin"{st}>'
             + pimg(a[0]) + pimg(c[0]) + "</div></div>")
        if cap:
            x += f'<figcaption class="wdc-cap">{ptext(cap)}</figcaption>'
        return x + "</figure>"
    if t == "slide":
        items = pimgs(b.get("items"))[:8]
        if len(items) < 2:
            return None
        ar = pratio(b.get("ratio"))
        st = f' style="aspect-ratio: {ar}"' if ar else ""
        return (f'<section class="wdc-slide-scroll" data-wdc-slide style="--steps: {len(items) - 1}"><div class="wdc-slide">'
                f'<div class="wdc-slide-window"{st}><div class="wdc-slide-track">'
                + "".join(pimg(m) for m in items) + pimg(items[0], ' aria-hidden="true"')
                + '</div></div><div class="wdc-slide-dots" aria-hidden="true">'
                + "".join('<span class="is-active"></span>' if i == 0 else "<span></span>" for i in range(len(items)))
                + "</div></div></section>")
    if t == "chapters":
        chs = [c for c in (b.get("list") or []) if isinstance(c, dict)][:6]
        out = []
        for c in chs:
            cards = [k for k in (c.get("cards") or []) if pcard_ok(k)][:6]
            x = '<section class="wdc-ch-sec"><div class="wdc-ch-cards">'
            x += "".join(pimg(k, f' class="wdc-ch-card" style="left:{ppct(k["x"])}%;top:{ppct(k["y"])}%;width:{ppct(k["w"])}%"') for k in cards)
            x += '</div><div class="wdc-ch-mo" data-wdc-swipe><div class="wdc-ch-mo-track">'
            x += "".join(pimg(k, ' loading="lazy"') for k in cards)
            x += '</div></div><div class="wdc-ch-text"><p class="wdc-ch-head">'
            if norm(c.get("num") or ""):
                x += f'<span>{ptext(c["num"])}</span>'
            x += f'<span>{ptext(c.get("title") or "")}</span></p>'
            if norm(c.get("ko") or ""):
                x += f'<p class="wdc-ch-desc">{pkoen(c.get("ko"), c.get("en"))}</p>'
            out.append(x + "</div></section>")
        if not out:
            return None
        return '<section class="wdc-ch" data-wdc-ch>' + "".join(out) + "</section>"
    return None


FX_TYPES = ("strip", "stack", "compare", "wipe", "slide", "chapters")


# ── 이미지·영상 배치 (11.23 CMS 피드백, 피그마 4532:21171) ──
# 유형(kind): single 한 개 · two 2열 · multi 2~4열. 열(cols)마다 폭 w(%), 열 안에 항목을 위에서부터 쌓는다.
# 항목: 이미지·영상 또는 글. 크기 w(열 폭의 %), 위 간격 gap(1920 기준 px — 첫 항목이면 시작 높이), 정렬 x(l/c/r).
# 값은 서버 cms_p_clean_grid 가 검사한 것만 들어온다 (admin/pages.php cms_p_grid 와 바이트 같게).

def pint(v, d):
    return v if type(v) is int else d


def pgrid_item(it):
    if not isinstance(it, dict):
        return None
    xa = it.get("x")
    al = f" wdc-it--{xa}" if xa in ("c", "r") else ""
    st = f' style="--iw: {pint(it.get("w"), 100)}; --ig: {pint(it.get("gap"), 0)}"'
    if it.get("type") == "text":
        ti, ko = str(it.get("title") or ""), str(it.get("ko") or "")
        if not norm(ti) and not norm(ko):
            return None
        x = f'<div class="wdc-it wdc-it--text{al}"{st}>'
        if norm(ti):
            x += f'<h2 class="wd-head-title">{ptext(ti)}</h2>'
        if norm(ko):
            x += f'<p class="wd-head-desc">{pkoen(ko, it.get("en"))}</p>'
        return x + "</div>"
    if it.get("type") in ("img", "video") and isinstance(it.get("src"), str) and it["src"]:
        cap = norm(it["caption"]) if isinstance(it.get("caption"), str) else ""
        x = f'<figure class="wdc-it{al}"{st}>' + pmedia(it, "", " data-reveal")
        if cap:
            x += f'<figcaption class="wdc-cap">{ptext(cap)}</figcaption>'
        return x + "</figure>"
    return None


def pgrid(b):
    kind = b.get("kind")
    if kind not in ("single", "two", "multi"):
        return None
    cols = [c for c in (b.get("cols") or []) if isinstance(c, dict)][:4]
    if not cols:
        return None
    body, any_item = "", False
    for c in cols:
        its = [x for x in (pgrid_item(it) for it in (c.get("items") or [])) if x]
        any_item = any_item or bool(its)
        body += f'<div class="wdc-col" style="--w: {pint(c.get("w"), 100)}">' + "".join(its) + "</div>"
    if not any_item:
        return None
    cls = f"wdc-grid wdc-grid--{kind}"
    if b.get("eq") is True:
        cls += " wdc-grid--eq"
    if b.get("align") in ("c", "r"):
        cls += f" wdc-grid--{b['align']}"
    return f'<div class="{cls}" style="--n: {len(cols)}; --gap: {pint(b.get("gap"), 12)}">' + body + "</div>"


def page_main(p):
    # 배경 (11.23): 흰색이면 상세 03·04 처럼 라이트 테마 + 히어로만 어둡게 (page_html 이 body 클래스를 바꾼다)
    hero_cls = "wd-hero--dark" if p.get("theme") == "light" else "wd-hero--fade-black"
    out = ['<div class="wd-container">', '<section class="wd-top">', f'<div class="wd-hero {hero_cls}">']
    out.append(pmedia(p.get("hero") or {}, "wd-hero-media"))
    out.append('<div class="wd-hero-dim" aria-hidden="true"></div>')
    head = '<div class="wd-hero-title"><div class="wd-hero-head">'
    if norm(p.get("brand") or ""):
        head += f'<span class="wd-hero-brand">{ptext(p["brand"])}</span>'
    head += f'<h1 class="wd-hero-h1">{plines(p.get("title"))}</h1></div>'
    tags = [t for t in (p.get("tags") or []) if norm(t)]
    if tags:
        head += '<div class="wd-hero-tags">' + "".join(f'<span class="wd-tag">{ptext(t)}</span>' for t in tags) + "</div>"
    out.append(head + "</div>")
    out.append("</div>")
    intro = p.get("intro") or {}
    if norm(intro.get("title") or "") or norm(intro.get("ko") or ""):
        x = '<div class="wd-intro">'
        if norm(intro.get("title") or ""):
            x += f'<p class="wd-intro-title">{ptext(intro["title"])}</p>'
        if norm(intro.get("ko") or ""):
            x += f'<p class="wd-intro-desc">{pkoen(intro.get("ko"), intro.get("en"))}</p>'
        out.append(x + "</div>")
    out.append("</section>")
    inlist = False
    for b in p.get("blocks") or []:
        t = b.get("type")
        if t == "grid":
            x = pgrid(b)
            if not x:
                continue
            if not inlist:
                out.append('<section class="wdc-list">')
                inlist = True
            out.append(x)
            continue
        if t == "media":
            items = [m for m in (b.get("items") or []) if m and m.get("src")][:2]
            if not items:
                continue
            if not inlist:
                out.append('<section class="wdc-list">')
                inlist = True
            cls = f"wdc-row wdc-row--{len(items)}"
            lay = b.get("layout")
            if (len(items) == 1 and lay in WIDTHS) or (len(items) == 2 and lay in SPLITS):
                cls += f" wdc-row--{lay}"
            out.append(f'<div class="{cls}">' + "".join(pcell(m) for m in items) + "</div>")
            continue
        if inlist:
            out.append("</section>")
            inlist = False
        if t == "text":
            cls = "wdc-text"
            for k, pre in (("above", "t"), ("below", "b")):
                if type(b.get(k)) is int and b[k] in GAPS:  # PHP in_array(…, true) 와 같게 (정수만)
                    cls += f" wdc-text--{pre}{b[k]}"
            al = {"l": "left", "r": "right"}.get(b.get("align"), "center")
            x = f'<section class="{cls}"><div class="wd-head wd-head--{al}">'
            if norm(b.get("title") or ""):
                x += f'<h2 class="wd-head-title">{ptext(b["title"])}</h2>'
            if norm(b.get("ko") or ""):
                x += f'<p class="wd-head-desc">{pkoen(b.get("ko"), b.get("en"))}</p>'
            out.append(x + "</div></section>")
        elif t == "film" and re.match(r"^[0-9]{5,12}$", str(b.get("vimeo") or "")):
            out.append('<section class="wd-film">'
                       f'<h2 class="wd-head-title wd-film-title">{ptext(b.get("title") or "Watch the Full Film")}</h2>'
                       f'<div class="wd-film-frame" data-playing="false" data-vimeo="{b["vimeo"]}">'
                       f'<img src="{esc_attr(b.get("poster") or "")}" alt="" />'
                       '<button type="button" class="wd-film-play" aria-label="영상 재생"></button></div></section>')
        elif t in FX_TYPES:
            x = pfx_block(b)
            if x:
                out.append(x)
    if inlist:
        out.append("</section>")
    out.append("</div>")
    return "\n".join(out)


def page_title_plain(p):
    return " ".join(norm(x) for x in str(p.get("title") or "").replace("\r", "").split("\n") if norm(x))


def page_html(p, skeleton):
    title = page_title_plain(p)
    desc = norm(p.get("desc") or "") or norm(str((p.get("intro") or {}).get("ko") or "").replace("\n", " "))[:120] or title
    hero = p.get("hero") or {}
    og = hero.get("poster") if hero.get("type") == "video" else hero.get("src")
    rep_ = {
        "{{TITLE}}": esc_attr(title),
        "{{DESC}}": esc_attr(desc),
        "{{OG}}": esc_attr("https://pl2std.com" + (og or "/assets/og/og-default.jpg")),
        "{{SLUG}}": p["slug"],
        "{{MAIN}}": page_main(p),
    }
    if p.get("theme") == "light":
        skeleton = skeleton.replace('<body class="wd-body">', '<body class="wd-body wd-body--light">', 1)
    # 한 번에 바꾼다 (넣은 글에 {{...}} 가 있어도 다시 바뀌지 않게)
    return re.sub(r"\{\{(TITLE|DESC|OG|SLUG|MAIN)\}\}", lambda m: rep_[m.group(0)], skeleton)


def card_html(p):
    c = p.get("card") or {}
    m = c.get("media") or p.get("hero") or {}
    size = c.get("size") if c.get("size") in ("s", "m", "l") else "m"
    brand = f'<p class="wk-card-brand">{ptext(p["brand"])}</p>' if norm(p.get("brand") or "") else ""
    return (f'<a class="wk-card wk-card--{size}" data-cms-page="{p["id"]}" href="{p["slug"]}/">'
            + pmedia(m, "wk-card-media")
            + f'<div class="wk-card-overlay">{brand}<p class="wk-card-project">{ptext(page_title_plain(p))}</p></div></a>')


def public_pages(pages):
    """Works 목록에 나갈 페이지 — 공개된 것, 새로 만든 순서(최신 먼저)"""
    lst = [p for p in (pages or []) if p.get("status") == "public"]
    return sorted(lst, key=lambda p: str(p.get("created") or ""), reverse=True)


CARD_START = re.compile(r'<(a|article) class="wk-card[^"]*"')
CARD_GAP = re.compile(r"\s*(?:<!--.*?-->\s*)*", re.S)
PAGE_CARD = re.compile(r'<a class="wk-card[^"]*" data-cms-page="')


def split_cols(doc):
    """Works 목록 html → (앞, [왼쪽 카드들, 오른쪽 카드들], [각 열 뒤]) — 모양이 다르면 None"""
    parts = doc.split('<div class="wk-col">')
    if len(parts) != 3:
        return None
    cols, rests = [], []
    for part in parts[1:]:
        pos, cards = 0, []
        while True:
            pos = CARD_GAP.match(part, pos).end()
            if part.startswith("</div>", pos):
                break
            m = CARD_START.match(part, pos)
            if not m:
                return None
            end = part.find("</" + m.group(1) + ">", pos)
            if end < 0:
                return None
            end += len(m.group(1)) + 3
            cards.append(part[pos:end])
            pos = end
        cols.append(cards)
        rests.append(part[pos:])
    return parts[0], cols, rests


def card_key(c):
    """카드 이름표: 새 페이지 = p:<id>, 기존 카드 = 안에 있는 첫 data-cms id"""
    m = re.search(r'data-cms-page="([^"]+)"', c) or re.search(r'data-cms="([^"]+)"', c)
    if not m:
        return None
    return ("p:" if "data-cms-page" in m.group(0) else "") + m.group(1)


def works_order(data):
    """pages.json 의 works.cols — [[왼쪽 카드 이름표…], [오른쪽 …]] (없거나 모양이 틀리면 빈 순서)"""
    w = data.get("works") if isinstance(data, dict) else None
    cols = w.get("cols") if isinstance(w, dict) else None
    if not isinstance(cols, list) or len(cols) != 2 or not all(isinstance(c, list) for c in cols):
        return [[], []]
    return [[k for k in c if isinstance(k, str)] for c in cols]


def works_with_cards(doc, pages, order=None):
    """Works 목록 html 에 새 페이지 카드를 넣고 카드 순서를 맞춘다.
    - 순서(order)에 있는 카드는 그 열·그 차례로
    - 순서에 없는 새 페이지 카드는 맨 위에, 최신부터 왼쪽·오른쪽 번갈아
    - 순서에 없는 기존 카드는 원래 열 맨 끝에 (원래 차례대로)"""
    sp = split_cols(doc)
    if not sp:
        return doc
    head, cols, rests = sp
    order = order or [[], []]
    static = [[c for c in col if not PAGE_CARD.match(c)] for col in cols]
    pub = public_pages(pages)
    pcard = {"p:" + p["id"]: card_html(p) for p in pub}
    smap = {}
    for col in static:
        for c in col:
            k = card_key(c)
            if k and k not in smap:
                smap[k] = c
    listed = set(order[0]) | set(order[1])
    out = [[], []]
    for i, p in enumerate([p for p in pub if "p:" + p["id"] not in listed]):
        out[i % 2].append(pcard["p:" + p["id"]])
    used = set()
    for ci in (0, 1):
        for k in order[ci]:
            if k in used:
                continue
            c = pcard.get(k) or smap.get(k)
            if c:
                out[ci].append(c)
                used.add(k)
    for ci, col in enumerate(static):
        for c in col:
            k = card_key(c)
            if k is None or k not in used:
                out[ci].append(c)
                if k:
                    used.add(k)
    return (head + '<div class="wk-col">' + "".join("\n" + c for c in out[0]) + "\n" + rests[0]
            + '<div class="wk-col">' + "".join("\n" + c for c in out[1]) + "\n" + rests[1])


def cmd_skeleton(dist):
    """상세 11 배포본(적용 전)에서 바깥 틀을 뽑아 admin/page-skeleton.html 로 둔다"""
    pages = json.load(open(os.path.join(dist, "admin", "cms-index.json"), encoding="utf-8"))["pages"]
    src = next(p for p in pages if p.get("num") == SKELETON_FROM)
    t = open(os.path.join(dist, src["file"]), encoding="utf-8").read()
    t = re.sub(r"<!--.*?-->\s*", "", t, flags=re.S)
    def sub(pat, new, flags=0):
        nonlocal t
        t2, n = re.subn(pat, lambda _: new, t, flags=flags)
        assert n >= 1, pat
        t = t2
    sub(r"<title>.*?</title>", "<title>{{TITLE}} | PL2 Creative Studio</title>", re.S)
    t = re.sub(r'(<meta\s+name="description"\s+content=")[^"]*"', r'\g<1>{{DESC}}"', t, flags=re.S)
    t = re.sub(r'(<meta\s+property="og:title"\s+content=")[^"]*"', r'\g<1>{{TITLE}} | PL2 Creative Studio"', t, flags=re.S)
    t = re.sub(r'(<meta\s+property="og:description"\s+content=")[^"]*"', r'\g<1>{{DESC}}"', t, flags=re.S)
    t = re.sub(r'(<meta property="og:url" content=")[^"]*"', r'\g<1>https://pl2std.com/works/{{SLUG}}/"', t)
    t = re.sub(r'(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*"', r'\g<1>{{OG}}"', t)
    sub(r'\s*<link rel="stylesheet" href="[^"]*works-detail-' + SKELETON_FROM + r'\.css" />', "")
    sub(r'<main class="wd-main">.*?</main>', '<main class="wd-main">\n{{MAIN}}\n</main>', re.S)
    sub(r'<script src="([^"]*)wd' + str(int(SKELETON_FROM)) + r'-slider\.js"></script>', "")
    t = re.sub(r'<script src="([^"]*)top-btn\.js"></script>', r'<script src="\1top-btn.js"></script>\n    <script src="\1video-play.js"></script>\n    <script src="\1wdc-blocks.js"></script>', t)
    # 인터랙션 블록 (11.20) 스타일: 공용 works-detail.css 바로 뒤
    t, n = re.subn(r'(<link rel="stylesheet" href="([^"]*)works-detail\.css" />)', r'\1\n    <link rel="stylesheet" href="\2wdc-blocks.css" />', t)
    assert n == 1, "works-detail.css 링크"
    t = re.sub(r'(<img) data-cms="d' + SKELETON_FROM + r'-[0-9]+"( class="top-btn-arrow")', r"\1\2", t)
    assert "{{MAIN}}" in t and "{{TITLE}}" in t and "{{DESC}}" in t and "{{OG}}" in t and "{{SLUG}}" in t
    assert not re.search(r'data-cms="d[0-9]', t)
    with open(os.path.join(dist, "admin", "page-skeleton.html"), "w", encoding="utf-8") as fh:
        fh.write(t)
    print("새 페이지 틀: admin/page-skeleton.html")


def cmd_pages(dist, pages_path, content_path=None):
    """서버의 pages.json 으로 새 페이지 html 과 Works 카드를 dist 에 만든다 (메뉴·바닥글 고친 값도 적용)"""
    data = json.load(open(pages_path, encoding="utf-8"))
    pages = data.get("pages") or []
    skeleton = open(os.path.join(dist, "admin", "page-skeleton.html"), encoding="utf-8").read()
    items = {}
    if content_path and os.path.exists(content_path):
        items = json.load(open(content_path, encoding="utf-8")).get("items") or {}
    idx = json.load(open(os.path.join(dist, "admin", "cms-index.json"), encoding="utf-8"))["ids"]
    made = []
    for p in public_pages(pages):
        doc = page_html(p, skeleton)
        for cid in dict.fromkeys(re.findall(r'data-cms="(g-[0-9]+)"', doc)):
            if cid in items and cid in idx:
                doc, _ = apply_one(doc, cid, items[cid], idx[cid])
        d = os.path.join(dist, "works", p["slug"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as fh:
            fh.write(doc)
        made.append(p["slug"])
    wp = os.path.join(dist, "works", "index.html")
    w = open(wp, encoding="utf-8").read()
    with open(wp, "w", encoding="utf-8") as fh:
        fh.write(works_with_cards(w, pages, works_order(data)))
    sm = os.path.join(dist, "sitemap.xml")
    if made and os.path.exists(sm):
        x = open(sm, encoding="utf-8").read()
        add = "".join(f"  <url><loc>https://pl2std.com/works/{s}/</loc></url>\n" for s in made if f"/works/{s}/<" not in x)
        with open(sm, "w", encoding="utf-8") as fh:
            fh.write(x.replace("</urlset>", add + "</urlset>"))
    print(f"새 페이지: {len(made)}개" + (f" ({', '.join(made)})" if made else ""))


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
                if it.get("swap") and cid not in NOSWAP:
                    tag = re.match(r"<([a-zA-Z0-9]+)", it["raw"]).group(1).lower()
                    sw = {"tag": tag, "attrs": raw_attrs(it["raw"])}
                    st = it["start"] + len(it["raw"])
                    if tag == "video":
                        sw["inner"] = text[st:text.index("</video>", st)]
                    if it.get("inpic"):
                        ps = text.rindex("<picture", 0, it["start"])
                        pe = text.index(">", ps) + 1
                        pc = text.index("</picture>", st)
                        sw["wrap"] = {"attrs": raw_attrs(text[ps:pe]), "pre": text[pe:it["start"]], "post": text[st:pc]}
                        for kid in re.findall(r'data-cms="([^"]+)"', sw["wrap"]["pre"] + sw["wrap"]["post"]):
                            e.setdefault("children", []).append(kid)
                            ids.setdefault(kid, {"files": [rel], "kind": "msource"})["parent"] = cid
                    e["swap"] = sw
                    e["fit"] = cid not in NOFIT
                    e["scale"] = cid not in NOSCALE
                if it.get("parent"):
                    e["parent"] = it["parent"]
                a = it["attrs"]
                base = {}
                for k in ("src", "srcset", "poster", "data-vimeo"):
                    if k in a:
                        v = a[k]
                        if k != "data-vimeo" and not re.match(r"^(/|https?:)", v):
                            v = "/" + posixpath.normpath(posixpath.join(posixpath.dirname(rel), v)).lstrip("./")
                        base[k] = v
                e["base"] = base
    for cid, e in ids.items():
        if e.get("parent") in ids and cid not in ids[e["parent"]].get("children", []):
            ids[e["parent"]].setdefault("children", []).append(cid)
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
        # 이미지↔영상 자리를 먼저 (원래 태그로 되돌린 뒤에 안쪽 <source> 의 고친 값이 다시 들어가야 한다)
        lst.sort(key=lambda x: 0 if idx[x[0]].get("swap") else 1)
        for cid, item in lst:
            doc, n = apply_one(doc, cid, item, idx[cid])
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
    elif cmd == "skeleton":
        cmd_skeleton(sys.argv[2])
    elif cmd == "pages":
        cmd_pages(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    else:
        print(__doc__)
        sys.exit(2)
