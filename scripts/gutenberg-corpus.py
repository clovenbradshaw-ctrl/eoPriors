#!/usr/bin/env python3
"""
gutenberg-corpus.py — build a wide-variety Project Gutenberg text corpus.

Strategy: pull the official catalog (pg_catalog.csv), filter to English
plain-text books, group by subject/bookshelf so the sample spans genres
instead of clustering on whatever's popular, then download until the
running page-count estimate hits --pages.

Usage:
    pip install requests
    python3 scripts/gutenberg-corpus.py --pages 10000 --out ./gutenberg_corpus
    node scripts/run-fold-bridge.mjs --corpus-dir ./gutenberg_corpus

Etiquette: gutenberg.org asks that bulk/automated harvesting use a mirror,
not www.gutenberg.org directly. This script hits www.gutenberg.org for the
catalog (one file) and for each book (one request each, rate-limited below).
For much larger runs (>a few hundred books), switch BASE below to a mirror
from https://www.gutenberg.org/MIRRORS.ALL, or use rsync:
    rsync -av --del aleph.gutenberg.org::gutenberg ./pg-mirror

Corpus text files are never committed to this repo — SPEC.md's ledger holds
events and URIs, not source blobs. Download into a directory outside the
working tree (or one covered by .gitignore) and point run-fold-bridge.mjs
at it. See docs/corpus-sources.md for other corpus sources beyond Gutenberg.
"""

import argparse
import csv
import gzip
import io
import random
import re
import time
from pathlib import Path

import requests

CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz"
BASE = "https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt"
UA = "eoPriors-corpus-builder/1.0 (personal research corpus; contact: set-your-email)"
WORDS_PER_PAGE = 300  # rough plain-text estimate


def fetch_catalog():
    print("Fetching catalog...")
    r = requests.get(CATALOG_URL, headers={"User-Agent": UA}, timeout=60)
    r.raise_for_status()
    raw = gzip.decompress(r.content).decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    rows = [row for row in reader]
    print(f"  {len(rows)} catalog entries")
    return rows


def filter_and_group(rows):
    """Keep English text-type entries with an id and a subject; group by
    top-level subject token so sampling can stratify across genres."""
    groups = {}
    for row in rows:
        if row.get("Language") != "en":
            continue
        if row.get("Type") != "Text":
            continue
        gid = row.get("Text#", "").strip()
        if not gid.isdigit():
            continue
        subjects = row.get("Subjects", "") or row.get("Bookshelves", "") or "Uncategorized"
        # crude top-level bucket: first subject token before " -- " or ","
        key = re.split(r"--|,", subjects)[0].strip() or "Uncategorized"
        groups.setdefault(key, []).append({
            "id": gid,
            "title": row.get("Title", "").strip(),
            "author": row.get("Authors", "").strip(),
            "subject_key": key,
        })
    print(f"  {len(groups)} subject buckets")
    return groups


def stratified_sample(groups, target_books):
    """Round-robin across subject buckets so no single genre dominates."""
    keys = list(groups.keys())
    random.shuffle(keys)
    for k in keys:
        random.shuffle(groups[k])
    picked, seen_ids = [], set()
    i = 0
    while len(picked) < target_books and any(groups[k] for k in keys):
        k = keys[i % len(keys)]
        if groups[k]:
            book = groups[k].pop()
            if book["id"] not in seen_ids:
                picked.append(book)
                seen_ids.add(book["id"])
        i += 1
        if i > target_books * 50:  # safety valve if buckets run dry
            break
    return picked


def download_books(picked, out_dir, target_pages, delay=2.0):
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.csv"
    total_pages = 0
    manifest = []
    for book in picked:
        if total_pages >= target_pages:
            break
        url = BASE.format(id=book["id"])
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=30)
            if r.status_code != 200 or len(r.text) < 500:
                continue
            text = r.text
            words = len(text.split())
            pages = max(1, words // WORDS_PER_PAGE)
            fname = out_dir / f"pg{book['id']}.txt"
            fname.write_text(text, encoding="utf-8")
            total_pages += pages
            manifest.append({**book, "words": words, "est_pages": pages})
            print(f"  [{total_pages:>6}/{target_pages} pages] {book['title'][:60]} "
                  f"({book['subject_key'][:30]})")
        except requests.RequestException as e:
            print(f"  skip {book['id']}: {e}")
        time.sleep(delay)  # be polite

    with open(manifest_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["id", "title", "author", "subject_key", "words", "est_pages"])
        w.writeheader()
        w.writerows(manifest)
    print(f"\nDone. {total_pages} estimated pages across {len(manifest)} books.")
    print(f"Manifest: {manifest_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=10000, help="target total page count")
    ap.add_argument("--out", type=str, default="./gutenberg_corpus")
    ap.add_argument("--delay", type=float, default=2.0, help="seconds between downloads")
    args = ap.parse_args()

    rows = fetch_catalog()
    groups = filter_and_group(rows)
    # over-provision candidates since some downloads will fail/be too short
    est_books_needed = max(20, args.pages // 250)
    picked = stratified_sample(groups, est_books_needed * 3)
    download_books(picked, Path(args.out), args.pages, delay=args.delay)


if __name__ == "__main__":
    main()
