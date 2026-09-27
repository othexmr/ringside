"""Create portable, redacted evidence copies without changing lab receipts."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import tarfile
import gzip

HERE=Path(__file__).resolve().parent
LAB=HERE.parents[1]
DEST=HERE/'bench/results/tool-eval-logs'
MANIFEST=[]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def redact(text):
    text=re.sub(r'/Users/[^\s"\x27<>]+', '<local-path>', text)
    text=re.sub(r'/home/spark-[^\s"\x27<>]+', '<host-path>', text)
    text=re.sub(r'\b(?:192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)\b', '<private-ip>', text)
    text=re.sub(r'\bspark-0[1-4]\b','<rank-host>',text)
    text=text.replace('iMac-4.local','<client-host>')
    return text


def copy(source,target):
    raw=source.read_bytes();text=redact(raw.decode())
    target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
    MANIFEST.append(dict(source=str(source.relative_to(LAB)),original_sha256=sha(raw),export=str(target.relative_to(DEST)),export_sha256=sha(target.read_bytes()),redacted=text.encode()!=raw))


def main():
    raise SystemExit("Legacy exporter retired to prevent schema rollback. Use build_evidence.py --progress REVIEW_JSON [--sync RELEASE_CHECKOUT].")


if __name__=='__main__':main()
