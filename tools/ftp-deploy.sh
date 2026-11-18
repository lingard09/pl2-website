#!/bin/bash
# dist/ 를 카페24 서버에 올린다 (2026-09-11)
#
#   ./tools/build-dist.sh          # 먼저 dist 를 만들고
#   ./tools/ftp-deploy.sh          # 올린다 (비밀번호는 실행할 때 입력)
#   ./tools/ftp-deploy.sh --code-only   # 영상·webp 빼고 (코드만 고쳤을 때)
#   ./tools/ftp-deploy.sh --no-video    # 영상만 빼고 (이미지는 바뀌었지만 mp4 는 그대로일 때)
#
#   FTP_HOST=... FTP_USER=... FTP_DIR=... ./tools/ftp-deploy.sh   # 값 바꾸려면
#
# --code-only 가 왜 필요한가 (2026-09-24):
#   build-dist.sh 는 rm -rf 후 전부 새로 복사해서 302MB 전 파일의 mtime 이 갱신된다.
#   그러면 mirror --only-newer 가 전부 "새 파일" 로 보고 영상 290MB 까지 다시 올린다.
#   html/css/js 만 고친 배포에서는 --code-only 로 mp4·webp 를 빼면 ~600KB 로 끝난다.
#   에셋(영상·이미지)을 건드린 배포라면 반드시 플래그 없이 전체로 올려라.
#
# 비밀번호는 인자로 받지 않는다 — 명령 히스토리와 프로세스 목록에 남지 않게
# 실행 중에 입력받아 lftp 에 stdin 으로만 넘긴다.
#
# 2026-11-18 부터 사이트 루트(/www)에 올린다. 옛 워드프레스는 웹 루트 밖 /old-site-20261118-005149 로 옮겼다.
#    --delete 는 쓰지 않는다. 서버에 있는 파일을 지우지 않는다.
set -e
cd "$(dirname "$0")/.."

HOST="${FTP_HOST:-pl2std.com}"
USER="${FTP_USER:-pl2studio}"
DIR="${FTP_DIR:-/www}" # 2026-11-18 루트 이전 뒤로는 /www (옛 /www/new 는 서버에 그대로 남아 있다)

EXCLUDE=""
MODE="전체"
if [ "$1" = "--code-only" ]; then
  EXCLUDE="--exclude-glob *.mp4 --exclude-glob *.webp"
  MODE="코드만 (mp4·webp 제외)"
elif [ "$1" = "--no-video" ]; then
  EXCLUDE="--exclude-glob *.mp4"
  MODE="영상 빼고 (mp4 제외)"
elif [ -n "$1" ]; then
  echo "모르는 옵션: $1 (쓸 수 있는 것: --code-only, --no-video)"; exit 1
fi

[ -d dist ] || { echo "dist/ 가 없다. 먼저 ./tools/build-dist.sh 를 돌려라."; exit 1; }

if [ -n "$EXCLUDE" ]; then
  n=$(find dist -type f ! -name '*.mp4' ! -name '*.webp' | wc -l | tr -d ' ')
  # du --files0-from 은 GNU 전용이라 맥에서 안 된다. stat 으로 바이트를 더한다.
  sz=$(find dist -type f ! -name '*.mp4' ! -name '*.webp' -exec stat -f%z {} + 2>/dev/null |
    awk '{t+=$1} END {printf (t>1048576 ? "%.0fM" : "%.0fK"), (t>1048576 ? t/1048576 : t/1024)}')
  [ -n "$sz" ] || sz="?"
else
  n=$(find dist -type f | wc -l | tr -d ' ')
  sz=$(du -sh dist | cut -f1)
fi
echo "모드: $MODE"
echo "올릴 것: $n 개 / $sz"
echo "받는 곳: ftp://$HOST$DIR"
echo

printf "FTP 비밀번호: "
read -rs PASS
echo
[ -n "$PASS" ] || { echo "비밀번호가 비었다."; exit 1; }

# lftp 에 stdin 으로만 넘긴다 (ps 에 노출되지 않는다)
lftp <<EOF
set ftp:ssl-allow no
set net:timeout 20
set net:max-retries 3
set mirror:parallel-transfer-count 4
open -u "$USER","$PASS" "$HOST"
mkdir -p "$DIR"
mirror -R --only-newer --parallel=4 --verbose $EXCLUDE dist "$DIR"
bye
EOF

echo
# CMS (2026-11-19): 빌드한 뒤에 고객사가 /admin/ 에서 저장했다면, 방금 올린 html 이 그 수정을 덮었을 수 있다.
# 빌드 때 받은 content.json 과 지금 서버의 것을 비교해서 다르면 알린다.
SITE_CMS="https://pl2std.com/cms-data/content.json"
NOW=$(mktemp)
code=$(curl -sS -o "$NOW" -w '%{http_code}' --max-time 30 "$SITE_CMS" || echo "000")
if [ "$code" = "404" ] && [ ! -f .cms-last-build.json ]; then
  echo "CMS: 고객사 수정값 없음 — 확인 끝"
elif [ "$code" = "200" ] && [ -f .cms-last-build.json ] && cmp -s "$NOW" .cms-last-build.json; then
  echo "CMS: 빌드 뒤로 고객사 수정 없음 — 확인 끝"
elif [ "$code" = "200" ] || [ "$code" = "404" ]; then
  echo "주의: 빌드한 뒤에 고객사가 관리자 화면에서 내용을 바꿨다."
  echo "      방금 올린 페이지가 그 수정을 덮었을 수 있다 → ./tools/build-dist.sh 후 다시 배포하세요."
else
  echo "주의: $SITE_CMS 를 확인하지 못했다 (응답 $code). 고객사 수정이 덮이지 않았는지 직접 확인하세요."
fi
rm -f "$NOW"

echo
echo "업로드 완료. 확인:"
echo "  http://$HOST${DIR#/www}/index.html"
echo
echo "검증하려면:"
echo "  BASE=http://$HOST${DIR#/www} node tools/verify.mjs"
