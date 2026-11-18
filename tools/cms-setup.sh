#!/bin/bash
# CMS 관리자 비밀번호 설정 (2026-11-19)
#
#   ./tools/cms-setup.sh
#
# - 서버에 /www/cms-data/{private,uploads} 폴더를 만들고
# - 관리자 비밀번호의 해시(bcrypt)만 /www/cms-data/private/auth.php 로 올린다 (비밀번호 자체는 어디에도 저장하지 않는다)
# - 비밀번호는 직접 넣거나, 비워 두면 무작위로 만들어 화면에 한 번 보여 준다 → 고객사에 전달
# 비밀번호를 바꿀 때도 이걸 다시 돌리면 된다. FTP 비밀번호·관리자 비밀번호 모두 인자로 받지 않는다.
set -e
cd "$(dirname "$0")/.."

HOST="${FTP_HOST:-pl2std.com}"
USER="${FTP_USER:-pl2studio}"
DIR="${FTP_DIR:-/www}"

command -v htpasswd >/dev/null || { echo "htpasswd 가 없다 (macOS 기본 포함)"; exit 1; }

printf "새 관리자 비밀번호 (비워 두면 무작위로 만든다): "
read -rs ADMIN
echo
if [ -z "$ADMIN" ]; then
  ADMIN=$(LC_ALL=C tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c 14)
  GENERATED=1
else
  printf "한 번 더: "
  read -rs ADMIN2
  echo
  [ "$ADMIN" = "$ADMIN2" ] || { echo "두 비밀번호가 다르다"; exit 1; }
  [ ${#ADMIN} -ge 10 ] || { echo "10자 이상으로 정해 주세요"; exit 1; }
fi

# bcrypt(cost 12). $2y$ 는 PHP password_verify 가 그대로 읽는다. 비밀번호는 stdin 으로만 넘긴다
HASH=$(printf '%s' "$ADMIN" | htpasswd -niB -C 12 admin | cut -d: -f2)
case "$HASH" in '$2y$'*) ;; *) echo "해시를 만들지 못했다"; exit 1 ;; esac

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
printf '<?php exit; ?%s{"hash":"%s","set":"%s"}' '>' "$HASH" "$(date +%Y-%m-%dT%H:%M:%S%z)" > "$TMP/auth.php"

printf "FTP 비밀번호: "
read -rs PASS
echo

{
  printf 'set ftp:ssl-allow no\nset cmd:fail-exit yes\nset net:timeout 20\nopen -u "%s","%s" "%s"\n' "$USER" "$PASS" "$HOST"
  printf 'mkdir -p -f %s/cms-data/private %s/cms-data/uploads\n' "$DIR" "$DIR"
  printf 'put "%s" -o %s/cms-data/private/auth.php\n' "$TMP/auth.php" "$DIR"
  printf 'cls -l %s/cms-data/private/\nbye\n' "$DIR"
} | lftp

echo
echo "설정 완료 — 관리자 화면: https://pl2std.com/admin/"
if [ -n "${GENERATED:-}" ]; then
  echo "새 비밀번호 (지금 한 번만 보여 준다, 고객사에 안전하게 전달): $ADMIN"
fi
