#!/bin/bash
# 카페24에 올릴 파일만 dist/ 로 추린다 (2026-09-09)
#
#   ./tools/build-dist.sh
#
# 빼는 것: 원본 jpg(webp 로 대체됨) · NOTES.md · tools/ · .git
# 넣는 것: html · css · js · webp · png · svg · 폰트 · mp4
#
# dist/ 는 .gitignore 에 있다. FTP 로 올릴 때 이 폴더 내용만 올리면 된다.
#
# 빌드 전에 로컬이 GitHub main 과 같은지 확인한다 (2026-09-29).
#   pull 이 덜 된 채로 빌드해서 옛 파일이 실서버에 올라간 일이 있었다.
#   main 이 아니거나 / 커밋 안 한 변경이 있거나 / origin/main 과 다르면 멈춘다.
#   일부러 그 상태로 빌드하려면:  SKIP_GIT_CHECK=1 ./tools/build-dist.sh
set -e
cd "$(dirname "$0")/.."

if [ "${SKIP_GIT_CHECK:-}" != "1" ]; then
  stop() {
    echo "빌드 중단: $1"
    echo "  $2"
    echo "  (확인을 건너뛰려면 SKIP_GIT_CHECK=1 ./tools/build-dist.sh)"
    exit 1
  }

  branch=$(git rev-parse --abbrev-ref HEAD)
  [ "$branch" = "main" ] ||
    stop "지금 브랜치가 main 이 아니다 ($branch)" "git checkout main && git pull"

  [ -z "$(git status --porcelain)" ] ||
    stop "커밋 안 한 변경이 있다 (GitHub 에 없는 내용이 올라간다)" "git status 로 확인"

  git fetch -q origin main ||
    stop "GitHub 에서 main 을 가져오지 못했다 (네트워크 확인)" "git fetch origin main"

  behind=$(git rev-list --count HEAD..origin/main)
  ahead=$(git rev-list --count origin/main..HEAD)
  [ "$behind" = "0" ] ||
    stop "로컬 main 이 GitHub 보다 커밋 ${behind}개 뒤처져 있다" "git pull"
  [ "$ahead" = "0" ] ||
    stop "푸시 안 한 커밋이 ${ahead}개 있다" "git push"

  echo "git 확인: main = origin/main ($(git log --oneline -1))"
  echo
fi

# CMS: 편집 단위마다 data-cms id 가 붙어 있어야 고객사 수정값이 제자리에 들어간다 (2026-11-19, tools/cms.py)
python3 tools/cms.py check

rm -rf dist
mkdir -p dist/assets dist/fonts

cp *.html dist/
cp assets/*.css assets/*.js dist/assets/
cp assets/*.webp assets/*.png assets/*.svg dist/assets/
cp -r assets/og dist/assets/ # 공유 미리보기 이미지 (jpg — 메신저 호환 때문에 webp 가 아니다)
cp assets/*.mp4 dist/assets/
cp fonts/* dist/fonts/
# 서버 루트에 그대로 있어야 하는 파일 (구글·네이버 서치콘솔 소유 확인, 2026-11-17 루트 이전 때 옛 서버에서 가져옴)
# robots.txt, new/.htaccess(옛 /new/ 주소 → 루트 301) 처럼 숨김 파일·하위 폴더도 그대로 복사한다
cp -R site-root/. dist/

# 원본 jpg 가 섞여 들어가지 않았는지 확인 (webp 로 대체했으므로 있으면 안 된다)
if ls dist/assets/*.jpg >/dev/null 2>&1; then
  echo "경고: dist 에 jpg 가 들어갔다"; exit 1
fi

# 주소에서 .html 을 없앤다: works-detail-01.html → works/generative-ai-image/ (2026-10-07)
# 페이지를 폴더/index.html 로 옮기고 경로·링크를 고친다. 주소 목록은 tools/pretty-urls.py.
# 미리보기용으로 평평한 구조가 필요하면:  PRETTY_URLS=0 ./tools/build-dist.sh
if [ "${PRETTY_URLS:-1}" != "0" ]; then
  python3 tools/pretty-urls.py dist

  # 검색엔진용 sitemap.xml — 폴더/index.html 로 된 페이지를 전부 넣는다 (2026-11-18 루트 이전)
  SITE="${SITE_URL:-https://pl2std.com/}"
  SITE="${SITE%/}/"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    (cd dist && find . -name index.html | sed 's#^\./##; s#index\.html$##' | sort) |
      while read -r p; do echo "  <url><loc>${SITE}${p}</loc></url>"; done
    echo '</urlset>'
  } > dist/sitemap.xml
fi

# CMS (2026-11-19) — 관리자 화면(/admin/)과, 고객사가 서버에서 고친 내용 반영.
#   고객사가 /admin/ 에서 저장하면 서버의 /cms-data/content.json 과 해당 html 이 바뀐다.
#   우리가 새로 배포할 때 그 html 을 덮어쓰지 않도록, 빌드할 때 서버의 content.json 을 받아 dist 에 먼저 적용한다.
#   - cms-index.json 은 적용 "전" 원래 값으로 만든다 (관리자 화면의 '원래대로' 기준)
#   - 받은 content.json 은 .cms-last-build.json 에 남긴다 → ftp-deploy.sh 가 배포 뒤 서버 것과 같은지 비교
#   - 서버에 접속이 안 되면 멈춘다 (수정값 없이 배포하면 고객사 수정이 지워진다). 일부러 건너뛰려면 CMS_OFFLINE=1
cp -R admin dist/admin
python3 tools/cms.py index dist
SITE_CMS="${SITE_URL:-https://pl2std.com/}"
SITE_CMS="${SITE_CMS%/}/cms-data/content.json"
rm -f .cms-last-build.json
if [ "${CMS_OFFLINE:-}" = "1" ]; then
  echo "CMS 수정값: 받지 않음 (CMS_OFFLINE=1)"
else
  code=$(curl -sS -o .cms-last-build.json -w '%{http_code}' --max-time 30 "$SITE_CMS") ||
    { echo "빌드 중단: $SITE_CMS 를 받지 못했다 (네트워크 확인, 일부러 건너뛰려면 CMS_OFFLINE=1)"; exit 1; }
  if [ "$code" = "200" ]; then
    python3 tools/cms.py apply dist .cms-last-build.json
  elif [ "$code" = "404" ]; then
    rm -f .cms-last-build.json
    echo "CMS 수정값: 아직 없음 (서버에 content.json 이 없다)"
  else
    echo "빌드 중단: $SITE_CMS 응답 $code"; exit 1
  fi
fi

# 배포본 HTML·CSS 에서 주석을 지운다 (2026-10-17). 누구나 '소스 보기'로 볼 수 있어서
# 작업 메모는 저장소에만 남기고 서버에는 올리지 않는다.
python3 tools/strip-comments.py dist

# HTML 이 참조하는 파일·페이지가 전부 있는지 확인 (각 html 위치 기준 상대 경로)
missing=0
while read -r f; do
  dir=$(dirname "$f")
  while read -r ref; do
    case "$ref" in */) ref="${ref}index.html" ;; esac
    case "$ref" in privacy.html|terms.html|*/privacy.html|*/terms.html) continue ;; esac # 아직 없는 페이지
    [ -e "$dir/$ref" ] || { echo "빠짐: $ref (${f#dist/})"; missing=$((missing + 1)); }
  done < <({
    grep -ohE '(src|href|poster)="[^"#:]*"' "$f" | sed -E 's/^[a-z]*="//; s/"$//'
    # <picture> 의 srcset 도 본다 (2026-11-07: 여기서 빠져 모바일 전용 이미지 404 를 못 잡았다)
    grep -ohE 'srcset="[^"]*"' "$f" | sed -E 's/^srcset="//; s/"$//' | tr ',' '\n' | awk '{print $1}'
  } | grep -v '^$' | sort -u)
done < <(find dist -name '*.html')
[ "$missing" -gt 0 ] && { echo "참조 누락 ${missing}건"; exit 1; }

echo "dist/ 준비 완료 — 참조 누락 0건"
echo
du -sh dist
echo
printf "%-10s %s\n" "html" "$(find dist -name '*.html' | wc -l | tr -d ' ')개"
for e in css js webp png svg mp4; do
  n=$(ls dist/assets/*.$e 2>/dev/null | wc -l | tr -d ' ')
  s=$(du -ch dist/assets/*.$e 2>/dev/null | tail -1 | cut -f1)
  [ "$n" != "0" ] && printf "%-10s %s개  %s\n" "$e" "$n" "$s"
done
printf "%-10s %s개  %s\n" "fonts" "$(ls dist/fonts | wc -l | tr -d ' ')" "$(du -ch dist/fonts | tail -1 | cut -f1)"
