#!/usr/bin/env python3
"""
pull-diverse-corpus.py — pull a small diverse-modality/-language sample to
test whether the fold reader generalizes past English public-domain prose:
source code (multiple paradigms), non-English books (multiple scripts), and
CC-BY news. Small on purpose — this is a probe of modality coverage, not a
corpus build (use gutenberg-corpus.py for volume). See docs/corpus-sources.md
for the full catalog these URLs are drawn from.

Corpus text stays out of git (.gitignore covers the default output dir).

Usage:
    python3 scripts/pull-diverse-corpus.py --out ./diverse_corpus
    node scripts/cross-modal-probe.mjs --corpus-dir ./diverse_corpus
"""

import argparse
import os
import time
import urllib.request

UA = "eoPriors-diverse-probe/1.0 (research corpus)"

# (filename, url, license) — code from raw.githubusercontent, spanning
# paradigms and comment-density (see docs/corpus-sources.md §9).
CODE = [
    ("code_python_flask.py", "https://raw.githubusercontent.com/pallets/flask/main/src/flask/app.py", "BSD-3-Clause"),
    ("code_go_sort.go", "https://raw.githubusercontent.com/golang/go/master/src/sort/sort.go", "BSD-3-Clause"),
    ("code_rust_vec.rs", "https://raw.githubusercontent.com/rust-lang/rust/master/library/alloc/src/vec/mod.rs", "MIT/Apache-2.0"),
    ("code_c_sqlite_btree.c", "https://raw.githubusercontent.com/sqlite/sqlite/master/src/btree.c", "Public domain"),
]

# Non-English Gutenberg (public domain), different languages/scripts (§11).
BOOKS = [
    ("book_fr_verne.txt", "https://www.gutenberg.org/cache/epub/800/pg800.txt", "Public domain"),
    ("book_de_kafka.txt", "https://www.gutenberg.org/cache/epub/22367/pg22367.txt", "Public domain"),
    ("book_es_quijote.txt", "https://www.gutenberg.org/cache/epub/2000/pg2000.txt", "Public domain"),
    ("book_fi_kalevala.txt", "https://www.gutenberg.org/cache/epub/7000/pg7000.txt", "Public domain"),
]


def fetch(out_dir, fname, url, limit_bytes):
    path = os.path.join(out_dir, fname)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read(limit_bytes)
        with open(path, "wb") as f:
            f.write(data)
        print(f"  OK  {fname:32s} {len(data):>7d} bytes")
        return True
    except Exception as e:
        print(f"  ERR {fname:32s} {e}")
        return False
    finally:
        time.sleep(1.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="./diverse_corpus")
    ap.add_argument("--limit-bytes", type=int, default=400_000, help="cap per file (these are probes, not full texts)")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    print("=== source code (paradigm/comment-density diversity) ===")
    for fname, url, _lic in CODE:
        fetch(args.out, fname, url, args.limit_bytes)
    print("=== non-English books (language/script diversity) ===")
    for fname, url, _lic in BOOKS:
        fetch(args.out, fname, url, args.limit_bytes)
    print(f"\nWrote to {args.out}")


if __name__ == "__main__":
    main()
