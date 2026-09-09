#!/bin/bash
# dist/ 전체를 R2 버킷에 올려 테스트 사이트를 만든다 (2026-09-09)
#
#   ./tools/build-dist.sh              # 먼저 dist 를 만들고
#   ./tools/r2-deploy.sh pl2-assets    # 통째로 올린다
#
# 먼저 인증:  npx wrangler login
#
# r2.dev 공개 주소는 Cloudflare 가 "개발용" 으로 못박은 것이라 접속이 몰리면
# 429 로 스로틀링된다. 검토·테스트용으로만 쓴다 — 정식 오픈은 카페24 FTP 다.
set -e

BUCKET="${1:?버킷 이름을 넘겨라 — 예: ./tools/r2-deploy.sh pl2-assets}"
JOBS="${JOBS:-8}"          # 동시 업로드 개수
cd "$(dirname "$0")/.."

[ -d dist ] || { echo "dist/ 가 없다. 먼저 ./tools/build-dist.sh 를 돌려라."; exit 1; }

# 확장자 → Content-Type (브라우저가 제대로 해석하도록 반드시 지정한다)
ctype() {
  case "${1##*.}" in
    html) echo "text/html; charset=utf-8" ;;
    css)  echo "text/css; charset=utf-8" ;;
    js)   echo "application/javascript; charset=utf-8" ;;
    webp) echo "image/webp" ;;
    png)  echo "image/png" ;;
    jpg|jpeg) echo "image/jpeg" ;;
    svg)  echo "image/svg+xml" ;;
    mp4)  echo "video/mp4" ;;
    woff2) echo "font/woff2" ;;
    woff) echo "font/woff" ;;
    *)    echo "application/octet-stream" ;;
  esac
}
export -f ctype
export BUCKET

upload_one() {
  rel="${1#dist/}"
  npx --yes wrangler r2 object put "$BUCKET/$rel" \
    --file="$1" --content-type="$(ctype "$1")" --remote >/dev/null 2>&1 \
    && echo "ok $rel" || echo "FAIL $rel"
}
export -f upload_one

total=$(find dist -type f | wc -l | tr -d ' ')
echo "$total 개 파일을 $BUCKET 에 올린다 (동시 $JOBS 개)"
echo

# 작은 파일부터 올려 사이트가 먼저 뜨게 하고, 큰 영상은 뒤로 미룬다
find dist -type f -not -name '*.mp4' | sort > /tmp/r2-small.$$
find dist -type f -name '*.mp4' | sort > /tmp/r2-big.$$

run() {
  local list="$1" label="$2"
  local n; n=$(wc -l < "$list" | tr -d ' ')
  echo "── $label ($n개)"
  # shellcheck disable=SC2016
  xargs -P "$JOBS" -I{} bash -c 'upload_one "$@"' _ {} < "$list" |
    awk -v n="$n" '/^FAIL/ {f++; print "  " $0} {c++; if (c % 20 == 0) printf "  %d/%d\n", c, n}
                   END {printf "  %d/%d 완료", c, n; if (f) printf "  (실패 %d)", f; print ""}'
}

run /tmp/r2-small.$$ "사이트 파일"
run /tmp/r2-big.$$   "영상"
rm -f /tmp/r2-small.$$ /tmp/r2-big.$$

echo
echo "완료. Cloudflare 대시보드에서 버킷 → Settings → Public access →"
echo "R2.dev subdomain 을 켜면 주소가 나온다."
echo "  https://pub-xxxxxxxx.r2.dev/index.html"
