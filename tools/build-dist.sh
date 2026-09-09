#!/bin/bash
# 카페24에 올릴 파일만 dist/ 로 추린다 (2026-09-09)
#
#   ./tools/build-dist.sh
#
# 빼는 것: 원본 jpg(webp 로 대체됨) · NOTES.md · tools/ · .git
# 넣는 것: html · css · js · webp · png · svg · 폰트 · mp4
#
# dist/ 는 .gitignore 에 있다. FTP 로 올릴 때 이 폴더 내용만 올리면 된다.
set -e
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist/assets dist/fonts

cp *.html dist/
cp assets/*.css assets/*.js dist/assets/
cp assets/*.webp assets/*.png assets/*.svg dist/assets/
cp assets/*.mp4 dist/assets/
cp fonts/* dist/fonts/

# 원본 jpg 가 섞여 들어가지 않았는지 확인 (webp 로 대체했으므로 있으면 안 된다)
if ls dist/assets/*.jpg >/dev/null 2>&1; then
  echo "경고: dist 에 jpg 가 들어갔다"; exit 1
fi

# HTML 이 참조하는 파일이 전부 있는지 확인
missing=0
for f in dist/*.html; do
  while read -r ref; do
    [ -e "dist/$ref" ] || { echo "빠짐: $ref ($(basename $f))"; missing=$((missing + 1)); }
  done < <(grep -ohE '(src|href|poster)="(assets|fonts)/[^"]*"' "$f" |
    sed -E 's/^[a-z]*="//; s/"$//' | sort -u)
done
[ "$missing" -gt 0 ] && { echo "참조 누락 ${missing}건"; exit 1; }

echo "dist/ 준비 완료 — 참조 누락 0건"
echo
du -sh dist
echo
printf "%-10s %s\n" "html" "$(ls dist/*.html | wc -l | tr -d ' ')개"
for e in css js webp png svg mp4; do
  n=$(ls dist/assets/*.$e 2>/dev/null | wc -l | tr -d ' ')
  s=$(du -ch dist/assets/*.$e 2>/dev/null | tail -1 | cut -f1)
  [ "$n" != "0" ] && printf "%-10s %s개  %s\n" "$e" "$n" "$s"
done
printf "%-10s %s개  %s\n" "fonts" "$(ls dist/fonts | wc -l | tr -d ' ')" "$(du -ch dist/fonts | tail -1 | cut -f1)"
