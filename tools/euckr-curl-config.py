"""lftp mirror 가 'Illegal byte sequence' 로 못 받은 파일(EUC-KR 파일명)을 curl 로 받기 위한 설정을 만든다.

  python3 -I tools/euckr-curl-config.py <mirror-errors.log> <로컬 백업 폴더> <FTP 호스트>

맥 lftp 는 iconv 없이 빌드돼 ftp:charset cp949 가 안 된다 (2026-11-17).
서버에는 원래 바이트 그대로(퍼센트 인코딩) 요청하고, 로컬에는 cp949 → UTF-8 로 바꾼 이름으로 저장한다.
출력은 curl -K 설정 형식 (url/output 쌍). 이미 받은 파일은 건너뛴다.
"""
import os
import sys
from urllib.parse import quote_from_bytes

log, local, host = sys.argv[1], sys.argv[2], sys.argv[3]
prefix = b"mirror: " + local.encode() + b"/www/"
suffix = b": Illegal byte sequence"


def conf(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


seen = set()
with open(log, "rb") as f:
    for line in f:
        line = line.rstrip(b"\r\n")
        if not (line.startswith(prefix) and line.endswith(suffix)):
            continue
        rel = line[len(prefix) : -len(suffix)]
        if rel in seen:
            continue
        seen.add(rel)
        out = os.path.join(local, "www", rel.decode("cp949"))
        if os.path.exists(out):
            continue
        # %2F = 로그인 폴더와 상관없이 절대 경로 /www/...
        print("url = " + conf("ftp://%s/%%2Fwww/%s" % (host, quote_from_bytes(rel, safe=b"/"))))
        print("output = " + conf(out))
