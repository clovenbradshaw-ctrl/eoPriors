#!/usr/bin/env python3
"""
western-canon-corpus.py — pull classical and patristic texts, per
docs/corpus-sources.md §11 ("Western canon — as complete as public domain
allows").

Two sources, both plain static HTML with no API, crawled directly:
  - The Latin Library (thelatinlibrary.com) — original-language Latin texts,
    author index -> per-author pages/directories -> per-work pages.
  - CCEL (ccel.org) — English translations of patristic/medieval Christian
    texts, fetched from a curated list of well-known works (CCEL has no
    "list everything" index worth crawling; expand CCEL_WORKS as needed).

Perseus / Open Greek and Latin is deliberately NOT scripted here: its CTS API
endpoint is unreliable to script against directly and its GitHub repos
(canonical-greekLit, canonical-latinLit) are large enough that a `git clone
--depth 1` per repo is the practical path — do that by hand if you need it,
same spirit as arXiv's bulk-access carve-out in docs/corpus-sources.md.

Usage:
    pip install requests
    python3 scripts/western-canon-corpus.py --out ./western_canon_corpus

Corpus text is never committed to this repo (see .gitignore) — download
into a directory outside the working tree, or one covered by .gitignore.
"""

import argparse
import csv
import re
import time
from pathlib import Path
from urllib.parse import urljoin

import requests

UA = "eoPriors-corpus-builder/1.0 (personal research corpus; contact: set-your-email)"

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"[ \t]+")


def html_to_text(html):
    # Strip <head>/<script>/<style> blocks, then all remaining tags — good
    # enough for these two sites' plain markup, no bs4 dependency needed.
    html = re.sub(r"(?is)<(head|script|style)[^>]*>.*?</\1>", "", html)
    text = TAG_RE.sub(" ", html)
    text = (text.replace("&amp;", "&").replace("&nbsp;", " ")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"'))
    lines = [WS_RE.sub(" ", ln).strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def get(url, timeout=30):
    return requests.get(url, headers={"User-Agent": UA}, timeout=timeout)


# ── The Latin Library ───────────────────────────────────────────────────────
LATIN_LIBRARY = "https://www.thelatinlibrary.com/"
LINK_RE = re.compile(r'href="([^"]+)"')


def latin_library_index():
    r = get(LATIN_LIBRARY + "index.html")
    r.raise_for_status()
    links = LINK_RE.findall(r.text)
    # keep same-site relative links only: author "*.html"/".shtml" pages or
    # author "*/" directories; drop nav/meta/mailto/absolute-external links.
    out = []
    for href in links:
        if href.startswith(("http:", "https:", "mailto:", "#")):
            continue
        if href.endswith((".css", ".ico")):
            continue
        out.append(href)
    return sorted(set(out))


def fetch_latin_library(out_dir, manifest, max_authors=None, delay=1.0):
    print("The Latin Library (original Latin texts)...")
    d = out_dir / "latin_library"
    d.mkdir(parents=True, exist_ok=True)
    entries = latin_library_index()
    if max_authors:
        entries = entries[:max_authors]
    for entry in entries:
        base = urljoin(LATIN_LIBRARY, entry)
        pages = [base]
        if entry.endswith("/"):
            try:
                r = get(base)
                if r.status_code == 200:
                    sub = [urljoin(base, h) for h in LINK_RE.findall(r.text)
                           if h.endswith((".html", ".shtml")) and not h.startswith(("http:", "https:"))]
                    pages = sub or pages
            except requests.RequestException as e:
                print(f"  skip dir {entry}: {e}")
                continue
        author_key = entry.strip("/").replace("/", "_") or "index"
        for page_url in pages:
            try:
                r = get(page_url)
                if r.status_code != 200 or len(r.text) < 200:
                    continue
                text = html_to_text(r.text)
                if len(text) < 200:
                    continue
                fname_stub = page_url.rstrip("/").rsplit("/", 1)[-1] or author_key
                fname = d / f"{author_key}__{fname_stub}.txt".replace("/", "_")
                fname.write_text(text, encoding="utf-8")
                manifest.append({"source": "latin_library", "unit": f"{author_key}/{fname_stub}",
                                  "chars": len(text), "path": str(fname)})
            except requests.RequestException as e:
                print(f"  skip {page_url}: {e}")
            time.sleep(delay)
        print(f"  {entry}: {len(pages)} page(s)")


# ── CCEL — curated patristic/medieval works ─────────────────────────────────
CCEL_WORKS = [
    ("augustine", "confess", "Augustine — Confessions"),
    ("augustine", "city", "Augustine — City of God"),
    ("aquinas", "summa", "Aquinas — Summa Theologica"),
    ("athanasius", "incarnation", "Athanasius — On the Incarnation"),
    ("anselm", "basic_works", "Anselm — Basic Works (Proslogion etc.)"),
    ("bunyan", "pilgrim", "Bunyan — Pilgrim's Progress"),
    ("kempis", "imitation", "Thomas à Kempis — Imitation of Christ"),
]
CCEL_BASE = "https://ccel.org/ccel/{author}/{work}.txt"


def fetch_ccel(out_dir, manifest, delay=1.0):
    print("CCEL (patristic/medieval Christian texts, English)...")
    d = out_dir / "ccel"
    d.mkdir(parents=True, exist_ok=True)
    for author, work, label in CCEL_WORKS:
        url = CCEL_BASE.format(author=author, work=work)
        try:
            r = get(url)
            if r.status_code != 200 or len(r.text) < 200:
                print(f"  skip {label}: HTTP {r.status_code}")
                continue
            fname = d / f"{author}__{work}.txt"
            fname.write_text(r.text, encoding="utf-8")
            manifest.append({"source": "ccel", "unit": label, "chars": len(r.text), "path": str(fname)})
            print(f"  {label}")
        except requests.RequestException as e:
            print(f"  skip {label}: {e}")
        time.sleep(delay)


SOURCES = {"latin_library": fetch_latin_library, "ccel": fetch_ccel}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=str, default="./western_canon_corpus")
    ap.add_argument("--sources", type=str, default="latin_library,ccel",
                     help="comma-separated subset of: " + ",".join(SOURCES))
    ap.add_argument("--max-authors", type=int, default=None,
                     help="cap Latin Library author entries (index has ~150; useful for a quick sample)")
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []

    for name in args.sources.split(","):
        name = name.strip()
        if name == "latin_library":
            fetch_latin_library(out_dir, manifest, max_authors=args.max_authors, delay=args.delay)
        elif name == "ccel":
            fetch_ccel(out_dir, manifest, delay=args.delay)
        else:
            print(f"Unknown source: {name} (known: {list(SOURCES)})")

    manifest_path = out_dir / "manifest.csv"
    with open(manifest_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["source", "unit", "chars", "path"])
        w.writeheader()
        w.writerows(manifest)
    print(f"\nManifest: {manifest_path}")


if __name__ == "__main__":
    main()
