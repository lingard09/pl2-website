#!/bin/bash
# 신규 사이트를 pl2std.com/new → pl2std.com/ 으로 이전한다 (2026-11-17, 고객사 요청)
#
#   ./tools/build-dist.sh
#   ./tools/ftp-migrate-root.sh      # 비밀번호는 실행할 때 한 번 입력
#
# 순서:
#   1) /www 목록을 보여준다
#   2) 기존 사이트 파일을 로컬로 내려받는다 (~/Documents/pl2-server-backup-<시각>/www, /www/new 는 git 에 있어서 뺀다)
#   3) 확인(y)을 받은 뒤 기존 파일을 웹 루트 밖 /old-site-<시각> 으로 옮긴다 (지우지 않는다)
#      웹 루트 안(/www/old-site)에 두면 옛 워드프레스 관리자 화면이 계속 외부에 열려 있게 되어 밖으로 뺀다.
#      /www/new 와 /www/.well-known(SSL 인증)은 그대로 둔다.
#   4) dist 를 /www 에 올린다
#
# 되돌리기: /www 의 새 파일을 치우고 /old-site-<시각> 안의 것을 /www 로 다시 옮기면 된다.
#           (DB 는 건드리지 않으므로 워드프레스는 파일만 돌려놓으면 그대로 살아난다)
set -e
cd "$(dirname "$0")/.."

HOST="${FTP_HOST:-pl2std.com}"
USER="${FTP_USER:-pl2studio}"
STAMP=$(date +%Y%m%d-%H%M%S)
OLD="/old-site-$STAMP"
# 이어받기: BACKUP_DIR=~/Documents/pl2-server-backup-... ./tools/ftp-migrate-root.sh (받은 파일은 건너뛴다)
LOCAL="${BACKUP_DIR:-$HOME/Documents/pl2-server-backup-$STAMP}"
KEEP_RE='^(new|\.well-known|\.|\.\.)$'

[ -d dist ] || { echo "dist/ 가 없다. 먼저 ./tools/build-dist.sh 를 돌려라."; exit 1; }

printf "FTP 비밀번호: "
read -rs PASS
echo
[ -n "$PASS" ] || { echo "비밀번호가 비었다."; exit 1; }

ftp() { # stdin 의 lftp 명령을 접속한 상태로 실행한다 (비밀번호는 ps 에 안 보인다)
  { printf 'set ftp:ssl-allow no\nset cmd:fail-exit yes\nset net:timeout 20\nset net:max-retries 3\nopen -u "%s","%s" "%s"\n' "$USER" "$PASS" "$HOST"; cat; echo bye; } | lftp
}

echo "── 1) 서버 /www 목록"
# 카페24 는 cls 결과를 "/www/." "/www/index.php" 처럼 전체 경로로 준다 (11.17 첫 이전 시도가 mv "/www//www/." 로 실패).
# 폴더로 들어가서 목록을 받고, 혹시 붙어 오는 경로·끝 슬래시도 떼어 이름만 남긴다.
ALL=$(printf 'cd /www\ncls -1a\n' | ftp | sed 's#/$##; s#^/www/##; s#^.*/##' | grep -v '^$' || true)
LIST=$(printf '%s\n' "$ALL" | grep -Ev "$KEEP_RE" || true)
[ -n "$LIST" ] || { echo "옮길 파일이 없다 (목록을 못 읽었거나 비어 있음). 중단."; exit 1; }
echo "$LIST" | sed 's/^/  /'
echo "  (그대로 둠: new, .well-known)"
echo

echo "── 2) 기존 사이트 내려받기 → $LOCAL/www (이미 받은 파일은 건너뜀)"
mkdir -p "$LOCAL/www"
LOG="$LOCAL/mirror-errors.log"
# 파일 하나라도 못 받으면 lftp 가 실패로 끝난다 (11.17 첫 실행이 여기서 조용히 멈췄다).
# 멈추지 않고 경고만 하고, 아래 서버·로컬 개수 비교로 판단한다.
if ! ftp 2> "$LOG" <<EOF
set cmd:fail-exit no
set mirror:parallel-transfer-count 4
mirror --parallel=4 --exclude-glob new/ --exclude-glob .well-known/ /www "$LOCAL/www"
EOF
then
  echo "  ⚠ 일부 파일을 못 받았다. 오류 ($LOG):"
  tail -15 "$LOG" | sed 's/^/    /'
fi
# 2016년 업로드 이미지 1,395개는 파일명이 EUC-KR(cp949)라 맥에 그 이름으로 저장이 안 된다
# ("Illegal byte sequence", 11.17). 맥 lftp 는 파일명 인코딩 변환(iconv)이 없어서
# curl 로 원래 바이트 이름을 요청하고 UTF-8 이름으로 저장한다 (tools/euckr-curl-config.py).
NBAD=$(LC_ALL=C grep -ac ': Illegal byte sequence$' "$LOG" || true)
if [ "${NBAD:-0}" -gt 0 ]; then
  echo "  한글(EUC-KR) 파일명 ${NBAD}개 → curl 로 이름을 바꿔서 받는다"
  CONF=$(python3 -I tools/euckr-curl-config.py "$LOG" "$LOCAL" "$HOST")
  if [ -n "$CONF" ]; then
    esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
    # 비밀번호는 설정(stdin)으로만 넘긴다
    { printf 'user = "%s:%s"\n' "$(esc "$USER")" "$(esc "$PASS")"; printf '%s\n' "$CONF"; } |
      curl -K - --ftp-method nocwd --create-dirs --retry 2 -sS 2> "$LOCAL/curl-errors.log" || true
    [ -s "$LOCAL/curl-errors.log" ] && { echo "  ⚠ curl 오류 ($LOCAL/curl-errors.log):"; tail -5 "$LOCAL/curl-errors.log" | sed 's/^/    /'; }
  fi
fi
n=$(find "$LOCAL/www" -type f | wc -l | tr -d ' ')
sn=$(ftp <<< 'find /www' 2>/dev/null | grep -v '/$' | grep -Ev '^/www/(new|\.well-known)/' | wc -l | tr -d ' ')
echo "  서버 파일 $sn 개 / 받은 파일 $n 개 / $(du -sh "$LOCAL/www" | cut -f1)"
[ "$n" -gt 0 ] || { echo "백업이 비었다. 중단."; exit 1; }
[ "$n" = "$sn" ] || echo "  ⚠ 개수가 다르다. n 으로 멈추고 BACKUP_DIR=$LOCAL 로 다시 실행하면 빠진 것만 받는다."
echo

echo "── 3) 위 목록을 /www 밖 $OLD 로 옮긴다 (지우지 않음)"
printf "진행할까요? (y 입력) "
read -r ok
[ "$ok" = "y" ] || { echo "중단. 서버는 바뀌지 않았다 (로컬 백업만 남음)."; exit 1; }
{
  echo "mkdir $OLD"
  echo "$LIST" | while IFS= read -r f; do printf 'mv "/www/%s" "%s/%s"\n' "$f" "$OLD" "$f"; done
  echo "cls -1a /www"
} | ftp
echo

echo "── 4) 새 사이트 올리기 → /www"
ftp <<EOF
set mirror:parallel-transfer-count 4
mirror -R --parallel=4 --verbose dist /www
EOF

echo
echo "이전 완료."
echo "  새 사이트: http://$HOST/"
echo "  기존 파일: 서버 $OLD , 로컬 $LOCAL/www"
echo "  검증: BASE=http://$HOST node tools/verify.mjs"
