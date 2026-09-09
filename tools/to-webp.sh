#!/bin/bash
# assets/*.jpg 를 webp 로 변환하고 HTML 참조를 바꾼다 (2026-09-09)
#
#   ./tools/to-webp.sh            # 변환 + HTML 교체
#   ./tools/to-webp.sh --revert   # HTML 을 .jpg 로 되돌린다 (webp 파일은 남는다)
#
# 품질 82 — SSIM 0.982 로 육안 구분이 안 되고 용량은 38% 가 된다.
# q88 은 용량이 33% 더 큰데 SSIM 개선이 0.4%p 뿐이라 쓰지 않는다.
#
# 원본 jpg 는 지우지 않는다. png(12장 336KB)·svg 는 작아서 건드리지 않는다.
# CSS 에는 jpg 참조가 없다 (svg 4개 + icon-scroll-top.png 뿐).
set -e
cd "$(dirname "$0")/.."

if [ "$1" = "--revert" ]; then
  n=$(grep -ohE '(src|poster)="[^"]*\.webp"' *.html | wc -l | tr -d ' ')
  perl -pi -e 's{((?:src|poster)="[^"]*)\.webp"}{$1.jpg"}g' *.html
  echo "되돌림: $n 곳 → .jpg"
else
  echo "변환 중..."
  n=0
  for f in assets/*.jpg; do
    cwebp -q 82 -quiet "$f" -o "${f%.jpg}.webp"
    n=$((n + 1))
  done
  o=$(du -ck assets/*.jpg | tail -1 | cut -f1)
  w=$(du -ck assets/*.webp | tail -1 | cut -f1)
  printf "%d장 변환: %.1fMB → %.1fMB (%.0f%%)\n" \
    "$n" "$(echo "scale=2;$o/1024" | bc)" "$(echo "scale=2;$w/1024" | bc)" \
    "$(echo "scale=1;$w*100/$o" | bc)"

  c=$(grep -ohE '(src|poster)="[^"]*\.jpg"' *.html | wc -l | tr -d ' ')
  perl -pi -e 's{((?:src|poster)="[^"]*)\.jpg"}{$1.webp"}g' *.html
  echo "HTML 교체: $c 곳 → .webp"
fi

echo
echo "현재 HTML 참조:"
grep -ohE '(src|poster)="[^"]*\.(jpg|webp|png)"' *.html |
  grep -oE '\.(jpg|webp|png)"' | sort | uniq -c
