#!/bin/bash
# HTML 의 영상 경로를 R2 주소로 바꾼다 / 되돌린다 (2026-09-09)
#
#   ./tools/r2-swap.sh https://pub-xxxx.r2.dev     # assets/  →  R2
#   ./tools/r2-swap.sh --revert                    # R2  →  assets/  (로컬로 복귀)
#
# 이미지·CSS·폰트는 그대로 두고 <video>/<source> 의 mp4 만 바꾼다.
# 도메인이 확정되면 이 스크립트를 그 주소로 다시 돌리면 된다 (몇 초).
set -e
cd "$(dirname "$0")/.."

if [ "$1" = "--revert" ]; then
  # 어떤 http(s) 주소로 바뀌어 있든 전부 assets/ 로 되돌린다
  n=$(grep -oE 'src="https?://[^"]*/[^"/]*\.mp4"' *.html | wc -l | tr -d ' ')
  perl -pi -e 's{src="https?://[^"]*/([^"/]*\.mp4)"}{src="assets/$1"}g' *.html
  echo "되돌림: $n 곳 → assets/"
else
  BASE="${1:?R2 공개 주소를 넘겨라 — 예: ./tools/r2-swap.sh https://pub-xxxx.r2.dev}"
  BASE="${BASE%/}" # 끝의 / 제거
  n=$(grep -o 'src="assets/[^"]*\.mp4"' *.html | wc -l | tr -d ' ')
  perl -pi -e "s{src=\"assets/([^\"]*\\.mp4)\"}{src=\"$BASE/\$1\"}g" *.html
  echo "교체: $n 곳 → $BASE/"
fi

echo
echo "현재 상태:"
grep -ohE 'src="[^"]*\.mp4"' *.html | perl -pe 's{src="(.*)/[^/]*\.mp4"}{$1/}' | sort | uniq -c
