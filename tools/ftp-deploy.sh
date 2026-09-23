#!/bin/bash
# dist/ 를 카페24 서버에 올린다 (2026-09-11)
#
#   ./tools/build-dist.sh          # 먼저 dist 를 만들고
#   ./tools/ftp-deploy.sh          # 올린다 (비밀번호는 실행할 때 입력)
#   ./tools/ftp-deploy.sh --code-only   # 영상·webp 빼고 (코드만 고쳤을 때)
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
# ⚠️ 기존 워드프레스를 건드리지 않으려고 하위 경로(/www/new)에만 올린다.
#    --delete 는 쓰지 않는다. 서버에 있는 파일을 지우지 않는다.
set -e
cd "$(dirname "$0")/.."

HOST="${FTP_HOST:-pl2std.com}"
USER="${FTP_USER:-pl2studio}"
DIR="${FTP_DIR:-/www/new}"

EXCLUDE=""
MODE="전체"
if [ "$1" = "--code-only" ]; then
  EXCLUDE="--exclude-glob *.mp4 --exclude-glob *.webp"
  MODE="코드만 (mp4·webp 제외)"
elif [ -n "$1" ]; then
  echo "모르는 옵션: $1 (쓸 수 있는 것: --code-only)"; exit 1
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
echo "업로드 완료. 확인:"
echo "  http://$HOST${DIR#/www}/index.html"
echo
echo "검증하려면:"
echo "  BASE=http://$HOST${DIR#/www} node tools/verify.mjs"
