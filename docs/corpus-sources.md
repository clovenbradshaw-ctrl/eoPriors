# Copyright-Free / Openly-Licensed Corpus Sources

Reference catalog for building candidate pools toward the exemplar basis
(SPEC.md §5.2's `basis-select.js` milestone) and, more broadly, any future
corpus-scale reading. Organized by category. Each entry: URL, access method
for an agent, and actual legal status — these are not the same thing, so
they're listed separately. "Public domain" and "openly licensed" (CC-BY, CC0,
etc.) are different legal states: public domain has no copyright at all;
CC-licensed work is still copyrighted but pre-permissioned for reuse under
stated terms (usually attribution). Both are fine for a priors corpus;
conflating them is the kind of thing worth not doing if provenance matters
later — `source.discovered` events (SPEC.md) should record which.

---

## 1. Literature / books — public domain

| Source | URL | Access | Status |
|---|---|---|---|
| Project Gutenberg | https://www.gutenberg.org | Catalog: `gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz`. Per-book: `gutenberg.org/cache/epub/{id}/pg{id}.txt`. OPDS: `gutenberg.org/ebooks/search.opds/` | Public domain (mostly pre-1929 US) |
| Gutenberg mirrors | https://www.gutenberg.org/MIRRORS.ALL | rsync: `rsync -av aleph.gutenberg.org::gutenberg ./mirror` | Same as above — use this instead of hitting gutenberg.org directly for anything beyond a few hundred books |
| Standard Ebooks | https://standardebooks.org | New-releases feed open to all; full-catalog OPDS feed (`standardebooks.org/opds/all`) and bulk zip downloads require Patrons Circle membership or having produced an ebook for them | Public domain, re-edited/cleaned text — better typography and semantic markup than raw Gutenberg, worth it if clean structure matters more than raw volume |
| Internet Archive texts | https://archive.org/details/texts | API: `archive.org/advancedsearch.php`; item download via `archive.org/download/{identifier}/` | Mixed — filter by `licenseurl` or collection; large public-domain subset (older books, government docs) |
| Wikisource | https://wikisource.org | Same MediaWiki API pattern as Wikipedia (`{lang}.wikisource.org/w/api.php`) | Public domain / CC — transcribed primary source texts, different register than Gutenberg fiction (speeches, laws, historical documents) |
| HathiTrust | https://www.hathitrust.org | Gated — requires a research-proposal approval process before rsync access is granted; not a fire-and-forget pull | Public-domain subset available, but budget for the approval step, this isn't instant |

## 2. Encyclopedic / reference

| Source | URL | Access | Status |
|---|---|---|---|
| Wikipedia | https://en.wikipedia.org | API: `en.wikipedia.org/w/api.php` | CC BY-SA |
| Wikidata | https://www.wikidata.org | API: `wikidata.org/w/api.php`; full dumps at https://dumps.wikimedia.org/wikidatawiki/ | CC0 — structured facts rather than prose, useful if eoPriors ever wants entity-relation ground truth rather than text |
| Wikimedia Commons | https://commons.wikimedia.org | API: `commons.wikimedia.org/w/api.php` | Mixed CC/public domain per-file — this is media (images/audio/video), not text; relevant if eoPriors ever needs cross-modal priors, not for a text corpus |
| 1911 Encyclopædia Britannica | via Wikisource: https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica | Wikisource API | Public domain — good contrast set against modern Wikipedia for the same topics (style drift, factual drift over a century) |

## 3. OER / textbooks / courses

| Source | URL | Access | Status |
|---|---|---|---|
| OpenStax | https://openstax.org | No bulk API; books listed at `openstax.org/subjects`, each with a direct PDF/web-view link | CC BY 4.0 |
| LibreTexts | https://libretexts.org | Content organized as MindTouch wikis, scriptable similarly to a wiki API per-library (e.g. `chem.libretexts.org`) | CC BY / mixed |
| MIT OpenCourseWare | https://ocw.mit.edu | No formal bulk API; course pages are static and crawlable, `ocw.mit.edu/courses/` index | CC BY-NC-SA (note: NC clause — not fully "do anything" open, still fine for a reference corpus, just not for commercial redistribution) |
| Open University OpenLearn | https://www.open.edu/openlearn | Course listing at `open.edu/openlearn/free-courses` | CC BY-NC-SA |
| Open Textbook Library | https://open.umn.edu/opentextbooks | Searchable catalog, per-book download links | Mixed CC |
| BCcampus OpenEd | https://opentextbc.ca | Catalog at `opentextbc.ca/collection/` | CC BY mostly |
| OER Commons | https://www.oercommons.org | Search API exists but requires a request for API key | Mixed CC |
| MERLOT | https://www.merlot.org | Browsable catalog, no clean bulk API | Mixed |
| DOAB (Directory of Open Access Books) | https://www.doabooks.org | OAI-PMH metadata feed: `directory.doabooks.org/oai/request` | CC BY / CC BY-SA, peer-reviewed academic books — 94,000+ titles |

## 4. Pre-aggregated bulk datasets (fastest path if you want ingestible text, not a crawl)

| Source | URL | Access | Status |
|---|---|---|---|
| Common Pile v0.1 | https://huggingface.co/datasets/common-pile | `datasets` library or direct parquet download per-subset (e.g. `common-pile/doab`, `common-pile/arxiv_papers`) | 8TB spanning 30 sources including research papers, code, books, encyclopedias, educational materials, and audio transcripts, all openly licensed, already deduped and license-filtered — closest thing to "someone already did the work" for exactly this kind of corpus |
| RedPajama | https://huggingface.co/datasets/togethercomputer/RedPajama-Data-1T | HF `datasets` | Recreation of LLaMA's mixture — includes CommonCrawl, so filter to just the Books/Wikipedia/ArXiv subsets if you want to stay strictly public-domain/open |

Note huggingface.co is outside this sandbox's allowed egress — same constraint
as gutenberg.org/wikipedia.org, run any HF pulls locally.

## 5. Academic / scientific papers

| Source | URL | Access | Status |
|---|---|---|---|
| arXiv | https://arxiv.org | Bulk access is S3 requester-pays (`arxiv.org/help/bulk_data`); API exists for metadata/search but automated scraping of the main site is explicitly disallowed | Author-retained copyright, but arXiv's own bulk-access terms permit this use |
| PubMed Central OA subset | https://www.ncbi.nlm.nih.gov/pmc/tools/openftlist/ | FTP bulk download, filtered to the explicitly open-access subset | CC BY / CC0 (subset only — PMC as a whole is not all open) |
| PLOS | https://www.plos.org | API at `api.plos.org` | CC BY — all PLOS articles are open by default, simpler than PMC's mixed-license problem |
| CORE | https://core.ac.uk | API, requires free API key | Mixed — aggregator across repositories, license varies per work |

## 6. US government / legal (federal works are public domain by statute)

| Source | URL | Access | Status |
|---|---|---|---|
| Library of Congress | https://www.loc.gov | JSON API on most `loc.gov` collection pages (`?fo=json`) | Public domain (federal) / mixed for donated collections |
| Chronicling America (historic newspapers) | https://chroniclingamerica.loc.gov | API + stable URL pattern, documented at `chroniclingamerica.loc.gov/about/api/` | Public domain |
| GovInfo | https://www.govinfo.gov | Bulk data + API, `govinfo.gov/bulkdata` | Public domain (federal) |
| CourtListener / Free Law Project | https://www.courtlistener.com | REST API + full bulk data exports at `courtlistener.com/help/api/bulk-data/` | Public domain (US court opinions) — good structural-prior source: dense argumentative prose, formal citation structure, contested claims by design |
| SEC EDGAR | https://www.sec.gov/edgar | Full-text search API + bulk filings at `sec.gov/edgar/sec-api-documentation` | Public domain (federal filings) |
| Federal Register | https://www.federalregister.gov | API at `federalregister.gov/developers/documentation/api/v1` | Public domain |

## 7. Images / media (if eoPriors ever goes cross-modal)

| Source | URL | Access | Status |
|---|---|---|---|
| NASA Image and Video Library | https://images.nasa.gov | API at `images.nasa.gov/docs/images.nasa.gov_api_docs.pdf` | Public domain |
| Smithsonian Open Access | https://www.si.edu/openaccess | API, `api.si.edu` | CC0 |
| Met Museum Open Access | https://www.metmuseum.org/art/collection/search | API docs at `metmuseum.github.io` | CC0 |
| Rijksmuseum | https://www.rijksmuseum.nl/en/rijksstudio | API at `data.rijksmuseum.nl` | CC0 for public-domain works in the collection |

## 8. News / current reporting

Real professional news is the one category where "royalty-free" is genuinely
hard to find — copyright is the business model, so almost nothing here is
comparable in volume to the Gutenberg/Wikipedia sources. What actually
qualifies, not what merely sounds like it does:

| Source | URL | Access | Status | Caveat |
|---|---|---|---|---|
| Voice of America | https://www.voanews.com | Site scrape / RSS feeds | Public domain (all text/audio/video produced *exclusively* by VOA) | VOA pages also embed AFP/AP/Reuters wire material, which stays fully copyrighted and isn't distinguishable without filtering by byline/source tag — don't bulk-scrape without that filter |
| Wikinews | https://en.wikinews.org | MediaWiki API (`en.wikinews.org/w/api.php`), same pattern as Wikipedia | CC BY 2.5, original collaborative reporting | Low volume — small, volunteer-written, not a wire-service substitute |
| EU Commission press corner | https://ec.europa.eu/commission/presscorner | Site + API | CC BY 4.0 by default (2011 Commission reuse decision) | Institutional press releases, not independent journalism — reads like government comms |
| US federal agency press releases | whitehouse.gov, state.gov, NASA news, etc. | Site scrape | Public domain (federal works) | Same genre issue — official statements, not third-party reporting |
| Historic newspapers | Chronicling America / Internet Archive (see §6) | API | Public domain, pre-1929ish | The only *volume* source, but it's history, not current news |
| GDELT Project | https://www.gdeltproject.org | Open dataset | Open | Structured event/entity metadata extracted from news, **not** the article prose — useful for an entity-registry layer, not a prose corpus |
| CC-NEWS (Common Crawl News) | https://commoncrawl.org/blog/news-dataset-available | Common Crawl bulk | Legally murky | A scrape of copyrighted publisher content used under an implicit research norm, **not** an actual license grant — a rights posture you'd be choosing deliberately, not one that's clear. Do not bucket with Gutenberg/CC-BY sources |

Honest takeaway: current, professionally-reported news at real volume with
clean rights mostly does not exist as a corpus. The closest legitimate analogs
are government/institutional communications (VOA, EU, federal agencies), which
read like official statements rather than journalism, or GDELT's structured
metadata rather than prose.

## 9. Source code (highly-respected repositories, diverse languages/paradigms)

Code is a genuinely different modality from prose — different token
distributions, different structure, a real test of whether the reader's
operator vocabulary generalizes past natural language. Almost all of these are
OSI-approved licenses (permissive or copyleft); a priors corpus is fine under
either, but record which per `source.discovered`. Pull via
`raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}` (confirmed reachable
from this sandbox) or the GitHub API (`api.github.com`, also reachable).

| Repo | URL | Language / paradigm | License |
|---|---|---|---|
| torvalds/linux | https://github.com/torvalds/linux | C, systems/kernel | GPL-2.0 |
| sqlite/sqlite (mirror) | https://github.com/sqlite/sqlite | C, extremely disciplined style | Public domain |
| python/cpython | https://github.com/python/cpython | C + Python, language runtime | PSF |
| rust-lang/rust | https://github.com/rust-lang/rust | Rust, systems | MIT/Apache-2.0 |
| golang/go | https://github.com/golang/go | Go, idiomatic-by-design | BSD-3-Clause |
| microsoft/TypeScript | https://github.com/microsoft/TypeScript | TypeScript, compiler | Apache-2.0 |
| apache/spark | https://github.com/apache/spark | Scala/Java, big-data | Apache-2.0 |
| pallets/flask | https://github.com/pallets/flask | Python, small idiomatic web | BSD-3-Clause |
| ggerganov/llama.cpp | https://github.com/ggerganov/llama.cpp | C++, numeric/ML | MIT |
| fptn? / SICP-style Scheme, e.g. racket/racket | https://github.com/racket/racket | Scheme/Racket, functional | MIT/Apache-2.0 |
| haskell/ghc (mirror) | https://github.com/ghc/ghc | Haskell, pure functional | BSD-3-Clause |
| postgres/postgres (mirror) | https://github.com/postgres/postgres | C, database, dense comments | PostgreSQL license |

Diversity axes worth spanning deliberately: paradigm (imperative C, functional
Haskell/Scheme, OO Java), domain (kernel, web, numeric, compiler), and
comment-density (SQLite/Postgres are heavily prose-commented; competitive-style
code is nearly comment-free) — the last matters because the reader's operator
extraction leans partly on natural-language cues in comments.

## 10. Audio / music (sheet music + recordings — the true cross-modal test)

The strongest validation of "compression not embeddings" (SPEC.md's central
bet): a WAV of a symphony and a Gutenberg novel flowing through the *same*
core. Needs a modality-specific perceiver eoPriors doesn't have yet (§ the
perceiver-contract work), so this is a build-ahead source list, not a
plug-in-today one.

| Source | URL | Content | Status |
|---|---|---|---|
| IMSLP / Petrucci Library | https://imslp.org | Sheet music (PDF/MusicXML) + many public-domain recordings | Public domain / CC (per-file; IMSLP marks each) — the canonical classical-scores archive |
| Musopen | https://musopen.org | Public-domain recordings + sheet music | Public domain / CC (403 from this sandbox as of last check — pull locally) |
| archive.org audio | https://archive.org/details/audio | Recordings, incl. Live Music Archive + 78rpm/public-domain sets | Mixed — filter by `licenseurl`; large PD/CC subset |
| MutopiaProject | https://www.mutopiaproject.org | Sheet music as LilyPond source + MIDI/PDF | Public domain / CC — LilyPond source is itself a text modality worth its own read |
| Wikimedia Commons (audio) | https://commons.wikimedia.org | Recordings, MIDI, some MusicXML | Mixed CC/PD per-file |
| MAESTRO dataset | https://magenta.tensorflow.org/datasets/maestro | Paired piano audio + aligned MIDI | CC BY-NC-SA — the NC clause applies |

Formats matter for the perceiver design: **MusicXML/LilyPond/MIDI are symbolic**
(discrete events, closer to text — the easiest first non-text perceiver),
while **WAV/FLAC are raw signal** (where the "bytes are bytes, a compression
statistic runs on any modality" claim gets its hardest test). Start symbolic,
then signal.

## 11. Multi-language (the same reader, other languages)

eoreader4.2's `tools/bootstrap-read.mjs` explicitly supports a `--lang` flag
and deposits per-language "sediment," so the reader is designed to be pointed
at non-English text. Testing the fold signal across languages checks whether
the operator vocabulary is genuinely structural or quietly English-specific.

| Source | URL | Languages | Status |
|---|---|---|---|
| Project Gutenberg (non-English) | https://www.gutenberg.org | French, German, Finnish, Dutch, Italian, Spanish, Portuguese, … (filter catalog by `Language`) | Public domain — same access pattern as the English path, just a different `Language` filter in `scripts/gutenberg-corpus.py` |
| Wikisource (per language) | `{lang}.wikisource.org` | ~70 languages | Public domain / CC |
| Wikipedia (per language) | `{lang}.wikipedia.org/w/api.php` | ~300 languages | CC BY-SA |
| OPUS (open parallel corpora) | https://opus.nlpl.eu | 100s of languages, aligned translations | Mixed open — aligned pairs let you test the SAME content read in two languages |
| Tatoeba | https://tatoeba.org | 400+ languages, sentence-level | CC BY 2.0 — short sentences, good for quick cross-language coverage |
| Leipzig Corpora Collection | https://wortschatz.uni-leipzig.de/en/download | 250+ languages, news/web/wiki subsets | CC BY-NC — NC clause |

Non-Latin scripts (Japanese, Arabic, Chinese) are the sharper test: the
reader's segmentation (`segment.js`) splits on terminal punctuation and blank
lines, assumptions that don't hold for scripts without spaces or with different
sentence delimiters — expect that to surface as the first thing to fix.

---

## Practical notes

- **Gated vs. instant**: Gutenberg, Wikipedia, arXiv metadata, most government
  sources — instant, no approval needed. HathiTrust and OER Commons's API both
  require an application/key first; don't script against these expecting
  same-day results.
- **NC clauses aren't nothing**: MIT OCW and OpenLearn are CC BY-NC-SA — fine
  for a research/priors corpus, but if eoPriors output or any derivative ever
  gets commercialized, that clause is the one to check first.
- **Common Pile is genuinely the shortcut** if the goal is volume with
  correctness already handled — it's a peer-reviewed, license-audited
  aggregation of most of section 3 and 5 above in one place. The tradeoff is
  you inherit their curation choices instead of making your own about which
  OER repos or which arXiv subset to include.
- **`scripts/gutenberg-corpus.py`** (this repo) implements the section-1
  Gutenberg path end to end: catalog fetch, subject-stratified sampling,
  rate-limited download, manifest.csv. It's the one source in this table
  that's actually wired up and tested against `scripts/run-fold-bridge.mjs`
  as of this writing.
