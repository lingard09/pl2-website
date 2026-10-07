#!/usr/bin/env python3
"""dist/ 의 평평한 html 을 "확장자 없는 주소" 구조로 바꾼다 (2026-10-07).

  works-detail-01.html  →  works/generative-ai-image/index.html  (주소: /new/works/generative-ai-image/)
  works.html            →  works/index.html                      (주소: /new/works/)
  about.html, contact.html 도 같은 식. index.html 은 그대로 맨 위.

서버 설정(.htaccess 리라이트) 없이 폴더 + index.html 만으로 주소에서 .html 이 사라진다.
- 페이지 안의 assets/ · fonts/ 경로와 페이지끼리의 링크를 새 위치 기준 상대 경로로 고친다.
- 예전 주소(works-detail-01.html 등)는 새 주소로 넘겨 주는 짧은 페이지로 남긴다
  (이미 공유된 링크가 깨지지 않게. FTP 에 남아 있는 옛 파일도 이걸로 덮인다).

build-dist.sh 가 부른다:  python3 tools/pretty-urls.py dist
"""
import os
import posixpath
import re
import sys

# 원본 파일 → 새 주소(폴더). 프로젝트 주소는 여기서만 정한다.
ROUTES = {
    "index.html": "",
    "works.html": "works/",
    "about.html": "about/",
    "contact.html": "contact/",
    "works-detail-01.html": "works/generative-ai-image/",
    "works-detail-02.html": "works/last-delivery/",
    "works-detail-03.html": "works/haruharu/",
    "works-detail-04.html": "works/samsung-internet/",
    "works-detail-05.html": "works/shinsegae-duty-free/",
    "works-detail-06.html": "works/evercell/",
    "works-detail-07.html": "works/developer-platform/",
    "works-detail-08.html": "works/smartthings/",
    "works-detail-09.html": "works/matier/",
    "works-detail-10.html": "works/cj-milano-olympics/",
    "works-detail-11.html": "works/hanwha-esports/",
}

ATTR = re.compile(r'\b(href|src|poster)="([^"]*)"')

# 공유 미리보기(og:image 등)는 절대 주소여야 카톡·슬랙·페이스북이 읽는다.
# 사이트 위치가 바뀌면(예: /new/ → 루트) SITE_URL 만 바꿔 빌드한다.
# pl2std.com 은 SSL 인증서가 없어(호스팅 기본 자체서명) https 로 쓰면 이미지를 못 가져간다
# (2026-10-07 실서버 확인). 인증서를 달면 https 로 바꾼다.
SITE_URL = os.environ.get("SITE_URL", "http://pl2std.com/new/").rstrip("/") + "/"
OG_IMAGE = re.compile(r'(<meta (?:property="og:image"|name="twitter:image") content=")assets/')


def link_to(from_dir, target_dir):
    """from_dir 페이지에서 target_dir 페이지로 가는 상대 주소 (항상 / 로 끝난다)"""
    rel = posixpath.relpath(target_dir or ".", from_dir or ".")
    return "./" if rel == "." else rel + "/"


def rewrite(html, page_dir):
    up = "../" * page_dir.count("/")

    def fix(m):
        attr, url = m.group(1), m.group(2)
        if url.startswith(("assets/", "fonts/")):
            return f'{attr}="{up}{url}"'
        path, sep, frag = url.partition("#")
        if path in ROUTES:
            return f'{attr}="{link_to(page_dir, ROUTES[path])}{sep}{frag}"'
        if re.fullmatch(r"[\w-]+\.html", path):  # 아직 없는 페이지(privacy 등)도 맨 위 기준으로
            return f'{attr}="{up}{url}"'
        return m.group(0)

    html = ATTR.sub(fix, html)
    html = OG_IMAGE.sub(lambda m: m.group(1) + SITE_URL + "assets/", html)
    # 이 페이지의 정식 주소
    og_url = f'    <meta property="og:url" content="{SITE_URL}{page_dir}" />\n'
    return html.replace('    <meta name="twitter:card"', og_url + '    <meta name="twitter:card"', 1)


def redirect_page(target):
    return f"""<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url={target}" />
    <link rel="canonical" href="{target}" />
    <title>PL2 Creative Studio</title>
    <script>location.replace("{target}" + location.hash);</script>
  </head>
  <body>
    <a href="{target}">PL2 Creative Studio</a>
  </body>
</html>
"""


def main(dist):
    for src, route in ROUTES.items():
        path = os.path.join(dist, src)
        with open(path, encoding="utf-8") as f:
            html = f.read()
        out = os.path.join(dist, route, "index.html")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            f.write(rewrite(html, route))
        if src != "index.html":
            with open(path, "w", encoding="utf-8") as f:
                f.write(redirect_page(route))
    print(f"주소 정리: 페이지 {len(ROUTES)}개 → 폴더 구조 (예전 .html 주소는 넘겨주기 페이지)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "dist")
