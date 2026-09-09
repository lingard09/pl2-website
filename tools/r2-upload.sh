#!/bin/bash
# assets/*.mp4 를 R2 버킷에 올린다 (2026-09-09)
#
#   ./tools/r2-upload.sh <버킷이름>
#   ./tools/r2-upload.sh pl2-assets
#
# 먼저 인증이 필요하다:  npx wrangler login
# 이미 올라간 파일도 그대로 덮어쓴다 (같은 이름 = 같은 내용이라 안전).
set -e

BUCKET="${1:?버킷 이름을 인자로 넘겨라 — 예: ./tools/r2-upload.sh pl2-assets}"
cd "$(dirname "$0")/.."

total=$(ls assets/*.mp4 | wc -l | tr -d ' ')
i=0
for f in assets/*.mp4; do
  i=$((i + 1))
  name=$(basename "$f")
  size=$(echo "scale=1; $(stat -f%z "$f") / 1048576" | bc)
  printf "[%2d/%d] %-22s %6s MB  " "$i" "$total" "$name" "$size"
  npx wrangler r2 object put "$BUCKET/$name" \
    --file="$f" \
    --content-type=video/mp4 \
    --remote >/dev/null 2>&1 && echo "✓" || { echo "✗ 실패"; exit 1; }
done

echo
echo "$total 개 업로드 완료."
echo "다음: 대시보드에서 공개 접근을 켜고, 그 주소로 ./tools/r2-swap.sh <주소> 를 돌린다."
