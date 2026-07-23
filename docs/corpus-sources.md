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
| Wikipedia | https://en.wikipedia.org | API: `en.wikipedia.org/w/api.php`. Static dumps: https://dumps.wikimedia.org/enwiki/ for bulk | CC BY-SA |
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

## 8. Non-Western / world music (audio)

Honest framing first: genuine public-domain *non-Western* music at real
volume is thin. Most world music is 20th-century-or-later and still under
copyright (artist or estate), and a lot of the historical field-recording
archives that exist were made under colonial-era conditions worth being
aware of, not just extraction-worth-flagging.

| Source | URL | Access | Status |
|---|---|---|---|
| Internet Archive — Great 78 Project | https://archive.org/details/78rpm | Bulk via `archive.org/advancedsearch.php`, filter to this collection | Public domain (pre-1929 recordings, global — includes early non-Western commercial recordings, not just American) |
| Association for Cultural Equity (Alan Lomax Archive) | https://culturalequity.org | Streaming + some downloadable field recordings | Explicitly CC-licensed for the digitized field recordings (global folk/traditional music, many non-Western) — check per-collection, some restricted |
| Wikimedia Commons audio | https://commons.wikimedia.org/wiki/Category:Audio_files_of_music | Same MediaWiki API as Commons images | CC/public domain per-file, includes user-contributed traditional-instrument and regional-music recordings — small but genuinely diverse |
| Free Music Archive | https://freemusicarchive.org | API at `freemusicarchive.org/api` | CC-licensed contemporary music across genres, includes non-Western/world categories — living-artist CC releases, not historical/ethnographic |
| ccMixter | https://ccmixter.org | API available | CC-licensed, mostly remix/Western electronic — lower relevance here, listed for completeness |

If the goal is genuine breadth of *musical tradition* rather than volume,
the Lomax archive and Great 78 Project are the two worth prioritizing —
everything else here skews Western-contemporary despite the CC license.
Not scripted here (audio, not text — out of scope for a text-priors corpus
until eoPriors goes cross-modal; see §7's framing too).

## 9. Mysticism (broad aggregator)

| Source | URL | Access | Status |
|---|---|---|---|
| Internet Sacred Text Archive | https://sacred-texts.com | No API — static HTML, in principle scriptable via a crawl of its own index pages, but the site sits behind Cloudflare bot-challenge (confirmed: a plain scripted request gets a JS challenge page, not content) — a browser-driven fetch or a manual per-page pull is needed, not a bare `requests` crawl | Nearly all public domain — this is the single best broad aggregator for exactly this ask: sections on Gnosticism, Hermetica, Kabbalah, Sufism, Theosophy, Swedenborg, alchemy, Tarot, Freemasonry, plus every major world religion, folklore, and mythology, almost entirely pre-1929 translations |
| Nag Hammadi Library (older PD translations) | via sacred-texts.com and archive.org | Same as above, or via Internet Archive item search | The modern standard English translation (Robinson, 1977+) is still copyrighted — use the earlier public-domain partial translations/fragments instead if strict PD matters |
| Corpus Hermeticum (Mead translation) | https://sacred-texts.com/eso/city/ or Gutenberg | Static text | Public domain (G.R.S. Mead, early 1900s) |

## 10. Holy texts in original languages

This is the category where "original language" and "public domain
English translation" are different assets — listing the original-language
critical-edition sources specifically, since that's what was asked for.

| Tradition | Source | URL | Access | Status |
|---|---|---|---|---|
| Hebrew Bible (Tanakh) | Sefaria | https://www.sefaria.org | Full API, `sefaria.org/api/texts/` | Hebrew original + Aramaic Talmud + commentaries, mixed CC/public domain per-text, clearly marked per work |
| Hebrew Bible (critical text) | Westminster Leningrad Codex via Tanach.us | https://tanach.us | Downloadable XML | Public domain digitization of the Leningrad Codex |
| Greek New Testament | SBLGNT | https://sblgnt.com | Direct download, also mirrored on GitHub (`github.com/LogosBible/SBLGNT`) | Licensed CC BY 4.0 |
| Greek New Testament (older critical text) | Nestle 1904 | https://github.com/biblicalhumanities/Nestle1904 | GitHub repo, plain text/XML | Public domain |
| Greek Septuagint (LXX) | CCAT, U Penn | https://ccat.sas.upenn.edu/nets/lxx/ | Static download | Public domain (Rahlfs-based editions) |
| Quran | Tanzil Project | https://tanzil.net/download | Direct download, multiple script variants (Uthmani/Simple), also API — `api.alquran.cloud` republishes the same Tanzil-licensed text over a plain JSON API, easier to script against than Tanzil's own download page | CC BY 3.0 — verbatim copying and redistribution permitted, but the sacred text itself may not be altered |
| Vedas / Sanskrit corpus | GRETIL | https://gretil.sub.uni-goettingen.de | Static file listing, direct TEI/plain-text download | Open access academic repository — original Devanagari and transliterated Sanskrit across the full range of classical texts, not just Vedas |
| Pali Canon (Tipitaka) | SuttaCentral | https://suttacentral.net | API at `suttacentral.net/api` | Pali originals + parallel translations, texts released CC0 |
| Pali Canon (alternate) | Vipassana Research Institute | https://www.tipitaka.org | Static download | Free for use, maintained by VRI |
| Chinese classics (Tao Te Ching, Analects, I Ching, etc.) | Chinese Text Project (ctext.org) | https://ctext.org | API requires free key (`ctext.org/tools/api`); bulk/full-text export needs an academic subscription | CC BY-NC-SA for structured data — original Chinese plus paired English translations, largest single repository for this tradition |
| Chinese Buddhist Canon | CBETA | https://www.cbeta.org | Downloadable XML editions | Open access, original Chinese Buddhist canon (Taishō edition digitization) |
| Avesta (Zoroastrian) | avesta.org | https://www.avesta.org | Static text | Public domain, original Avestan plus translations |
| Guru Granth Sahib (Sikh) | SriGranth | https://www.srigranth.org | Searchable, some export | Original Gurmukhi text, free access — check specific reuse terms before bulk pull, less clearly PD-marked than the others here |
| Sumerian/Akkadian literature (Epic of Gilgamesh, etc.) | ETCSL (Oxford) | https://etcsl.orinst.ox.ac.uk | Static academic archive | Original transliterated cuneiform-derived text plus translation, open access |
| Cuneiform tablets (broader) | CDLI | https://cdli.mpiwg-berlin.mpg.de | API + bulk data | Open access digital library of cuneiform texts across traditions |

Practical note: several of these (ctext.org, SriGranth) gate their *bulk*
export behind a key or subscription even though browsing/API access is
free — same "instant vs. gated" distinction as §1's HathiTrust entry.
Don't assume free API access implies free bulk-download access.

`scripts/holy-texts-corpus.py` (this repo) wires up four of the rows above
end to end: Quran (via the alquran.cloud API), Tanakh (via the Sefaria API,
Hebrew + JPS English per book), a curated cross-section of the Pali Canon
(via the SuttaCentral API), and both Greek NT critical editions — SBLGNT
and Nestle 1904 — via shallow `git clone` of their GitHub repos. The
Sanskrit (GRETIL), Chinese (ctext.org/CBETA), Avestan, Sikh, and
cuneiform (ETCSL/CDLI) rows are catalogued but not yet scripted.

## 11. Western canon — as complete as public domain allows

Gutenberg, Standard Ebooks, and Wikisource (§1–2) already carry a lot of
this, but they're incomplete and unstructured for it — no guaranteed
coverage of, say, every Platonic dialogue or every Church Father. These are
the sources built specifically to be exhaustive within a domain of the
Western canon, plus one curation list to check your coverage against, and
one more single-author corpus (Shakespeare) that's big enough to deserve
its own row.

**Shakespeare**

| Source | URL | Access | Status |
|---|---|---|---|
| Folger Shakespeare Library digital texts | https://shakespeare.folger.edu | Scholarly-edited, structured TEI-XML per play, mirrored on GitHub (`github.com/folgerdigitaltexts`); simplest path is the site's own "Complete Set" bulk download — confirmed working direct links: `https://flgr.sh/txtfssAlltxt` (plain text, ~2MB zip) and `https://flgr.sh/txtfssAllxml` (XML, ~22MB zip) | Free, public domain, scholarly apparatus may carry its own copyright — use the play text, not the introductions, if strict PD matters |
| Project Gutenberg Complete Works | https://www.gutenberg.org/ebooks/100 | Single plain-text etext (`gutenberg.org/cache/epub/100/pg100.txt`) | Public domain — less clean than Folger's XML but zero setup; used as the automatic fallback in `scripts/shakespeare-corpus.py` if the Folger fetch fails |

`scripts/shakespeare-corpus.py` (this repo) pulls the Folger Complete Set
by default and falls back to the Gutenberg single-file edition automatically.

**Classical Greek and Latin (originals + translations)**

| Source | URL | Access | Status |
|---|---|---|---|
| Perseus Digital Library / Open Greek and Latin | https://www.perseus.tufts.edu · https://www.opengreekandlatin.org | CTS API at `cts.perseids.org/api/cts`; also full TEI-XML GitHub repos per OGL | Primary Greek/Latin texts are public domain, released under CC BY-NC-SA 3.0; modern annotations/translations under CC BY-SA 4.0 — Scaife Viewer alone hosts 2,412 works across 3,192 editions, roughly 32M words of Greek and 16M of Latin |
| PHI Latin Texts (Packard Humanities Institute) | https://latin.packhum.org | Searchable, scriptable via page requests | Free access, one of the most complete Latin corpora available (inscriptions included, not just literary texts) |
| The Latin Library | https://www.thelatinlibrary.com | Static HTML, directly crawlable | Public domain / freely distributed, good backup/cross-check against PHI |
| Internet Classics Archive (MIT) | https://classics.mit.edu | Static HTML | Public domain 19th/early-20th-c. English translations of ~440 Greek/Roman/Chinese/Persian classical works |
| Bibliotheca Augustana | https://www.hs-augsburg.de/~harsch/augustana.html | Static HTML, organized by language/period | Public domain, unusually broad — Greek, Latin, and also medieval/early-modern German, French, Italian, English texts in one place |

**Patristic / medieval Christian**

| Source | URL | Access | Status |
|---|---|---|---|
| Christian Classics Ethereal Library | https://ccel.org | Static + some bulk (`ccel.org/downloads`) | Public domain — the single best aggregator for Augustine, Aquinas, the Church Fathers, medieval mystics, and classic Protestant/Catholic theology in English translation |
| Documenta Catholica Omnia | https://www.documentacatholicaomnia.eu | Static PDF/HTML archive | Public domain, strong on original Latin patristic and scholastic texts (Migne's Patrologia Latina/Graeca scans) |

`scripts/western-canon-corpus.py` (this repo) wires up two of the rows
above: The Latin Library (crawled from its author index down to per-work
pages) and a curated set of CCEL works. Perseus/OGL is deliberately not
scripted — its CTS endpoint is unreliable to hit directly and its GitHub
repos are large enough that a manual `git clone --depth 1` is the practical
path, same carve-out as arXiv's bulk-access note in §5. PHI, Internet
Classics Archive, and Bibliotheca Augustana are catalogued but not yet
scripted.

**Modern national canons (non-English Western)**

| Source | URL | Access | Status |
|---|---|---|---|
| Gallica (Bibliothèque nationale de France) | https://gallica.bnf.fr | IIIF API + OAI-PMH bulk metadata harvest | Mixed — large public-domain French literary/historical holdings, check per-item rights (some 20th-c. material still restricted) |
| Zeno.org | https://www.zeno.org | Static, well-organized by author/period | Public domain — large German-language literary/philosophical archive (Goethe, Kant, Nietzsche, Schiller, etc. in original German) |
| Projekt Gutenberg-DE | https://www.projekt-gutenberg.org | Static HTML | Public domain German texts, distinct project from the English Gutenberg |
| Liber Liber | https://www.liberliber.it | Static + bulk catalog download | Public domain, the Italian equivalent — Dante, Machiavelli, etc. in original Italian |
| Biblioteca Virtual Miguel de Cervantes | https://www.cervantesvirtual.com | Static, searchable | Mixed PD/open — the major Spanish-language literary archive |

**Curation checklist**

The Harvard Classics ("Dr. Eliot's Five-Foot Shelf," 1909) is fully public
domain and already assembled as a 51-volume reading list spanning
philosophy, science, religion, and literature — useful as a checklist to
verify coverage rather than a source to re-scrape, since virtually every
volume in it is individually available on Gutenberg already (search the
catalog for "Harvard Classics"). The later "Great Books of the Western
World" (Britannica/Adler, 1952) list is a good second checklist for
20th-century-adjacent gaps, but the specific Britannica *edition* text
(introductions, the Syntopicon) is still copyrighted — use the list of
included works, not that edition's apparatus, and source each work from
public-domain translations elsewhere on this list.

**Explicitly excluded — not actually free, don't script against these**

- Thesaurus Linguae Graecae (TLG, UC Irvine) — subscription-gated, the
  academic-standard Greek corpus but not open
- Loeb Classical Library — still under Harvard University Press copyright,
  not public domain despite being the most common bilingual edition
  professors assign

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
  rate-limited download, manifest.csv. It's the source in this table
  that's wired up and tested against `scripts/run-fold-bridge.mjs`.
- **`scripts/holy-texts-corpus.py`**, **`scripts/western-canon-corpus.py`**,
  and **`scripts/shakespeare-corpus.py`** (this repo) cover the newer §10/§11
  sources — original-language scripture, classical/patristic texts, and the
  complete works of Shakespeare respectively. Each writes its own
  `manifest.csv` in the same shape as the Gutenberg script; none of the
  three have been wired into `run-fold-bridge.mjs` yet.
