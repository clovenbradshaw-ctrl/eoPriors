#!/usr/bin/env python3
"""
shakespeare-corpus.py — pull the complete works of Shakespeare, per
docs/corpus-sources.md §11 addendum.

Best single source: the Folger Shakespeare Library digital texts
(https://shakespeare.folger.edu) — free, scholarly-edited, public domain,
and published as a one-shot "Complete Set" bulk download (no API/crawl
needed, no GitHub-org guessing required):
    TXT : https://flgr.sh/txtfssAlltxt  (~2MB zip)
    XML : https://flgr.sh/txtfssAllxml  (~22MB zip, structured TEI-ish XML
          per play/poem — richer than flat text if markup matters)

Fallback: Project Gutenberg's Complete Works (single plain-text etext, less
clean than Folger's XML but zero setup) — id 100,
https://www.gutenberg.org/cache/epub/100/pg100.txt — used automatically if
the Folger fetch fails.

Usage:
    pip install requests
    python3 scripts/shakespeare-corpus.py --out ./shakespeare_corpus
    python3 scripts/shakespeare-corpus.py --out ./shakespeare_corpus --format xml

Corpus text is never committed to this repo (see .gitignore) — download
into a directory outside the working tree, or one covered by .gitignore.
"""

import argparse
import csv
import io
import zipfile
from pathlib import Path

import requests

UA = "eoPriors-corpus-builder/1.0 (personal research corpus; contact: set-your-email)"

FOLGER_URLS = {
    "txt": "https://flgr.sh/txtfssAlltxt",
    "xml": "https://flgr.sh/txtfssAllxml",
}
GUTENBERG_FALLBACK = "https://www.gutenberg.org/cache/epub/100/pg100.txt"


def fetch_folger(out_dir, fmt, manifest):
    url = FOLGER_URLS[fmt]
    print(f"Folger Shakespeare Library — Complete Set ({fmt})...")
    r = requests.get(url, headers={"User-Agent": UA}, timeout=120)
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    d = out_dir / "folger"
    d.mkdir(parents=True, exist_ok=True)
    zf.extractall(d)
    for name in zf.namelist():
        if name.endswith("/"):
            continue
        p = d / name
        manifest.append({"source": "folger", "unit": name,
                          "chars": p.stat().st_size if p.exists() else None, "path": str(p)})
    print(f"  {len([n for n in zf.namelist() if not n.endswith('/')])} files -> {d}")
    return True


def fetch_gutenberg_fallback(out_dir, manifest):
    print("Falling back to Project Gutenberg Complete Works (single file)...")
    r = requests.get(GUTENBERG_FALLBACK, headers={"User-Agent": UA}, timeout=60)
    r.raise_for_status()
    d = out_dir / "gutenberg"
    d.mkdir(parents=True, exist_ok=True)
    fname = d / "pg100-complete-works.txt"
    fname.write_text(r.text, encoding="utf-8")
    manifest.append({"source": "gutenberg", "unit": "Complete Works (pg100)",
                      "chars": len(r.text), "path": str(fname)})
    print(f"  -> {fname}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=str, default="./shakespeare_corpus")
    ap.add_argument("--format", choices=["txt", "xml"], default="txt")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []

    try:
        fetch_folger(out_dir, args.format, manifest)
    except (requests.RequestException, zipfile.BadZipFile) as e:
        print(f"  Folger fetch failed ({e}), falling back to Gutenberg.")
        fetch_gutenberg_fallback(out_dir, manifest)

    manifest_path = out_dir / "manifest.csv"
    with open(manifest_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["source", "unit", "chars", "path"])
        w.writeheader()
        w.writerows(manifest)
    print(f"\nManifest: {manifest_path}")


if __name__ == "__main__":
    main()
