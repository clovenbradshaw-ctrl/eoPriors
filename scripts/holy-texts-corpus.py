#!/usr/bin/env python3
"""
holy-texts-corpus.py — pull original-language scriptural texts, per
docs/corpus-sources.md §10 ("Holy texts in original languages").

Four sources, each fetched a different way (no single API covers this
category):
  - Quran (Arabic, Uthmani script) via api.alquran.cloud, which republishes
    the Tanzil Project text (CC BY 3.0 — verbatim copying/redistribution
    permitted, the text itself may not be altered).
  - Hebrew Bible (Tanakh) via the Sefaria API — Hebrew original alongside
    the JPS English translation, book by book.
  - Pali Canon via the SuttaCentral API — Pali root text alongside an
    English translation, for a curated set of well-known suttas (the API
    doesn't expose a single "list everything" endpoint worth crawling here).
  - Greek New Testament: two independent critical editions, SBLGNT (CC BY
    4.0) and Nestle1904 (public domain), pulled by shallow git clone since
    both are published as GitHub repos of per-book XML.

Usage:
    pip install requests
    python3 scripts/holy-texts-corpus.py --out ./holy_texts_corpus
    # or select a subset:
    python3 scripts/holy-texts-corpus.py --sources quran,tanakh --out ./holy_texts_corpus

Corpus text is never committed to this repo (see .gitignore and
docs/corpus-sources.md) — download into a directory outside the working
tree, or one covered by .gitignore.
"""

import argparse
import csv
import json
import shutil
import subprocess
import time
from pathlib import Path

import requests

UA = "eoPriors-corpus-builder/1.0 (personal research corpus; contact: set-your-email)"

# ── Quran ────────────────────────────────────────────────────────────────────
ALQURAN_API = "https://api.alquran.cloud/v1/quran/quran-uthmani"


def fetch_quran(out_dir, manifest):
    print("Quran (Tanzil/alquran.cloud, Uthmani script)...")
    r = requests.get(ALQURAN_API, headers={"User-Agent": UA}, timeout=60)
    r.raise_for_status()
    data = r.json()["data"]
    d = out_dir / "quran"
    d.mkdir(parents=True, exist_ok=True)
    for surah in data["surahs"]:
        text = "\n".join(a["text"] for a in surah["ayahs"])
        fname = d / f"{surah['number']:03d}-{surah['englishName']}.txt"
        fname.write_text(text, encoding="utf-8")
        manifest.append({"source": "quran", "unit": surah["englishName"],
                          "chars": len(text), "path": str(fname)})
    print(f"  {len(data['surahs'])} surahs -> {d}")


# ── Hebrew Bible (Tanakh) via Sefaria ───────────────────────────────────────
SEFARIA_API = "https://www.sefaria.org/api/texts/{ref}?context=0"
TANAKH_BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "I Samuel", "II Samuel", "I Kings", "II Kings",
    "Isaiah", "Jeremiah", "Ezekiel", "Hosea", "Joel", "Amos", "Obadiah",
    "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
    "Zechariah", "Malachi",
    "Psalms", "Proverbs", "Job", "Song of Songs", "Ruth", "Lamentations",
    "Ecclesiastes", "Esther", "Daniel", "Ezra", "Nehemiah",
    "I Chronicles", "II Chronicles",
]


def fetch_tanakh(out_dir, manifest, delay=0.5):
    print("Hebrew Bible (Sefaria API, Hebrew + JPS English per book)...")
    d = out_dir / "tanakh"
    d.mkdir(parents=True, exist_ok=True)
    for book in TANAKH_BOOKS:
        url = SEFARIA_API.format(ref=book.replace(" ", "_"))
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=30)
            if r.status_code != 200:
                print(f"  skip {book}: HTTP {r.status_code}")
                continue
            payload = r.json()
            he = payload.get("he")
            en = payload.get("text")
            fname = d / f"{book.replace(' ', '_')}.json"
            fname.write_text(json.dumps({"book": book, "he": he, "en": en},
                                         ensure_ascii=False, indent=1), encoding="utf-8")
            chars = sum(len(x) for x in _flatten(he)) if he else 0
            manifest.append({"source": "tanakh", "unit": book, "chars": chars, "path": str(fname)})
            print(f"  {book}")
        except requests.RequestException as e:
            print(f"  skip {book}: {e}")
        time.sleep(delay)


def _flatten(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, list):
        for i in x:
            yield from _flatten(i)


# ── Pali Canon via SuttaCentral ──────────────────────────────────────────────
SUTTACENTRAL_API = "https://suttacentral.net/api/suttas/{uid}/pli"
# A small curated cross-section rather than a full-canon crawl — the API has
# no "list every sutta" endpoint worth scripting against; expand this list as
# needed.
PALI_SUTTAS = [
    "dn1", "dn2", "dn16", "dn22",
    "mn1", "mn10", "mn26", "mn118",
    "sn12.1", "sn56.11",
    "an1.1", "an4.13",
    "dhp1", "dhp2",
]


def fetch_pali_canon(out_dir, manifest, delay=0.5):
    print("Pali Canon (SuttaCentral API, Pali root text + translation)...")
    d = out_dir / "pali_canon"
    d.mkdir(parents=True, exist_ok=True)
    for uid in PALI_SUTTAS:
        url = SUTTACENTRAL_API.format(uid=uid)
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=30)
            if r.status_code != 200:
                print(f"  skip {uid}: HTTP {r.status_code}")
                continue
            payload = r.json()
            fname = d / f"{uid}.json"
            fname.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
            root = payload.get("root_text") or {}
            chars = sum(len(str(v)) for v in root.values()) if isinstance(root, dict) else 0
            manifest.append({"source": "pali_canon", "unit": uid, "chars": chars, "path": str(fname)})
            print(f"  {uid}")
        except requests.RequestException as e:
            print(f"  skip {uid}: {e}")
        time.sleep(delay)


# ── Greek New Testament (two critical editions) via git clone ──────────────
GNT_REPOS = [
    ("sblgnt", "https://github.com/LogosBible/SBLGNT.git", "data"),
    ("nestle1904", "https://github.com/biblicalhumanities/Nestle1904.git", "text"),
]


def fetch_greek_nt(out_dir, manifest):
    print("Greek New Testament (SBLGNT + Nestle1904, git clone)...")
    d = out_dir / "greek_nt"
    d.mkdir(parents=True, exist_ok=True)
    for name, repo, subdir in GNT_REPOS:
        dest = d / name
        if dest.exists():
            shutil.rmtree(dest)
        try:
            subprocess.run(["git", "clone", "--depth", "1", repo, str(dest)],
                            check=True, capture_output=True, timeout=120)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            print(f"  skip {name}: {e}")
            continue
        src = dest / subdir
        files = list(src.rglob("*")) if src.exists() else list(dest.rglob("*"))
        text_files = [f for f in files if f.is_file() and f.suffix.lower() in (".xml", ".txt", ".usx")]
        manifest.append({"source": f"greek_nt/{name}", "unit": repo, "chars": None,
                          "path": str(dest), "files": len(text_files)})
        print(f"  {name}: {len(text_files)} text files -> {dest}")
        shutil.rmtree(dest / ".git", ignore_errors=True)


SOURCES = {
    "quran": fetch_quran,
    "tanakh": fetch_tanakh,
    "pali": fetch_pali_canon,
    "greek_nt": fetch_greek_nt,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=str, default="./holy_texts_corpus")
    ap.add_argument("--sources", type=str, default="quran,tanakh,pali,greek_nt",
                     help="comma-separated subset of: " + ",".join(SOURCES))
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []

    for name in args.sources.split(","):
        name = name.strip()
        fn = SOURCES.get(name)
        if fn is None:
            print(f"Unknown source: {name} (known: {list(SOURCES)})")
            continue
        fn(out_dir, manifest)

    manifest_path = out_dir / "manifest.csv"
    with open(manifest_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["source", "unit", "chars", "path", "files"])
        w.writeheader()
        for row in manifest:
            w.writerow({**{"files": ""}, **row})
    print(f"\nManifest: {manifest_path}")


if __name__ == "__main__":
    main()
