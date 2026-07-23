#!/usr/bin/env python3
"""
pull-journalism-corpus.py — pull public-domain investigative journalism.

As of 2026-01-01 the US public domain covers everything published through
1930 (95-year term), so public-domain journalism is essentially the
muckraking era — Tarbell, Steffens, Riis, Baker, Reed, Bly, Sinclair — the
founders of American narrative/investigative nonfiction, not filler. These
are the canonical works, pulled from Project Gutenberg (already transcribed,
not raw OCR — cleanest signal-to-noise of the available sources; see
docs/corpus-sources.md §8). Every title here was published pre-1930 and is
confirmed public domain; Gutenberg hosts only PD works, so the status is
doubly clean.

For newspaper-page VOLUME (millions of pages, structurally PD), point a
harvester at Chronicling America instead (docs/corpus-sources.md §6) — this
script is the high-quality, low-volume book-form corpus.

Corpus text stays out of git (.gitignore covers the default output dir).

Usage:
    python3 scripts/pull-journalism-corpus.py --out ./journalism_corpus
    node scripts/cross-modal-probe.mjs --corpus-dir ./journalism_corpus
"""

import argparse
import csv
import os
import time
import urllib.request

UA = "eoPriors-journalism/1.0 (public-domain muckraking corpus)"

# (gutenberg_id, filename, "Author, Title (year)") — all pre-1930, US public domain.
WORKS = [
    (60692, "tarbell_standard_oil.txt", "Tarbell, The History of the Standard Oil Company (1904)"),
    (54710, "steffens_shame_of_cities.txt", "Steffens, The Shame of the Cities (1904)"),
    (45502, "riis_how_other_half_lives.txt", "Riis, How the Other Half Lives (1890)"),
    (59899, "bly_ten_days_madhouse.txt", "Bly, Ten Days in a Mad-House (1887)"),
    (3076, "reed_ten_days_shook_world.txt", "Reed, Ten Days That Shook the World (1919)"),
    (140, "sinclair_the_jungle.txt", "Sinclair, The Jungle (1906)"),
    (34847, "baker_following_color_line.txt", "Baker, Following the Color Line (1908)"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="./journalism_corpus")
    ap.add_argument("--delay", type=float, default=2.0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    manifest = []
    for gid, fname, desc in WORKS:
        url = f"https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.txt"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            data = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")
            with open(os.path.join(args.out, fname), "w", encoding="utf-8") as f:
                f.write(data)
            words = len(data.split())
            manifest.append({"id": gid, "title": desc, "author": "muckraker", "subject_key": "journalism", "words": words, "est_pages": max(1, words // 300)})
            print(f"  OK {fname:36s} {words:>7d} words  {desc}")
        except Exception as e:
            print(f"  ERR {fname}: {e}")
        time.sleep(args.delay)

    with open(os.path.join(args.out, "manifest.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["id", "title", "author", "subject_key", "words", "est_pages"])
        w.writeheader()
        w.writerows(manifest)
    print(f"\nWrote {len(manifest)} works to {args.out}")


if __name__ == "__main__":
    main()
