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
