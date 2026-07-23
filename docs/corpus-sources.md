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

## 12. Non-Western / world music (audio)

Honest framing first: genuine public-domain *non-Western* music at real
volume is thin. Most world music is 20th-century-or-later and still under
copyright (artist or estate), and a lot of the historical field-recording
archives that exist were made under colonial-era conditions worth being
aware of, not just extraction-worth-flagging. This complements rather than
duplicates §10's Western classical/sheet-music sources — different musical
traditions, same "audio isn't scripted here yet" caveat.

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
until eoPriors goes cross-modal; see §7's and §10's framing too).

## 13. Mysticism (broad aggregator)

| Source | URL | Access | Status |
|---|---|---|---|
| Internet Sacred Text Archive | https://sacred-texts.com | No API — static HTML, in principle scriptable via a crawl of its own index pages, but the site sits behind Cloudflare bot-challenge (confirmed: a plain scripted request gets a JS challenge page, not content) — a browser-driven fetch or a manual per-page pull is needed, not a bare `requests` crawl | Nearly all public domain — this is the single best broad aggregator for exactly this ask: sections on Gnosticism, Hermetica, Kabbalah, Sufism, Theosophy, Swedenborg, alchemy, Tarot, Freemasonry, plus every major world religion, folklore, and mythology, almost entirely pre-1929 translations |
| Nag Hammadi Library (older PD translations) | via sacred-texts.com and archive.org | Same as above, or via Internet Archive item search | The modern standard English translation (Robinson, 1977+) is still copyrighted — use the earlier public-domain partial translations/fragments instead if strict PD matters |
| Corpus Hermeticum (Mead translation) | https://sacred-texts.com/eso/city/ or Gutenberg | Static text | Public domain (G.R.S. Mead, early 1900s) |

## 14. Holy texts in original languages

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

## 15. Western canon — as complete as public domain allows

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

## 16. Organic / community-authored content — provenance beyond copyright status

Public domain and CC status answer a copyright question, not a composition
question: "who did the composing, not just where the subject matter comes
from." A colonial ethnographer's transcription of a folktale can be
perfectly public domain and still not be organic to the culture — it's the
culture's material run through someone else's selection, translation, and
framing choices. This section separates content a culture produced about
itself from a Western analytical lens laid over that culture's material,
for anyone building a pocket where that distinction matters (not a concern
specific to any one script in this repo — none of §1-15's Gutenberg/
holy-texts/western-canon pulls were curated against this standard, they
were sampled for general prose diversity instead).

**Cut on this standard — real content, but the composing hand isn't the
culture's own**

- **SlaveVoyages** — meticulously documented, but by colonial shipping
  ledgers, not by anything Malagasy, Yoruba, or Kongolese communities
  produced about themselves.
- **Gutenberg-era folklore collections** (Fansler, Day, Theal, Barker &
  Sinclair, and similar 1890s-1930s colonial-officer/missionary
  transcriptions) — the story *content* traces to the culture; the
  selection, translation, and framing are the collector's. Needs
  "collected-by" provenance labeling if used at all, not treatment as the
  tradition's own voice.
- **Global Jukebox Cantometrics** — the songs are real, but what you'd
  actually ingest is Alan Lomax's 37-dimension coding schema applied to
  them: a mid-century American ethnomusicologist's classification system,
  not the tradition describing itself.
- **D-PLACE** (Ethnographic Atlas, SCCS, Pulotu) — same shape, further from
  organic: Murdock's and Binford's coding categories *are* the dataset.
- **Indian court judgments** — a different issue, listed for contrast: real
  and contemporary, but produced within a legal system inherited from
  British colonial administration — not folk wisdom or indigenous
  tradition, so a different category rather than a fit here at all.

**Confirmed organic — self-produced by the culture, or self-selected
literature within the language, public domain or CC0/CC-BY**

| Content | Why it's organic | URL |
|---|---|---|
| Pali Canon + community translations | Ancient root text; translations done and licensed CC0 by the practicing Buddhist community itself, segment-aligned | https://github.com/suttacentral/bilara-data |
| Classical Persian poetry (Hafez, Rumi, Ferdowsi, Saadi) | Self-authored civilizational canon, public domain | https://ganjoor.net · https://github.com/ganjoor · `api.ganjoor.net` |
| Non-European Wikisource editions | Volunteer-selected, self-transcribed public-domain literature by speakers of the language | https://dumps.wikimedia.org (e.g. `tawikisource`, `bnwikisource`, `arwikisource`, `fawikisource`) |
| Digital Library of India scans | Public-domain books written by Indian authors, in Indian languages | https://archive.org/details/digitallibraryindia |
| Common Voice speech | Community-recorded, CC0, dozens of Global South languages | https://commonvoice.mozilla.org/en/datasets |
| StoryWeaver | Contemporary stories authored by writers within the language communities, CC-BY | https://storyweaver.org.in |
| African Storybook / Bloom Library | African-authored, CC-BY/CC | https://www.africanstorybook.org · https://bloomlibrary.org |
| Nupepa | Hawaiian-language newspapers, run by and for Hawaiians, public domain (pre-1930) | https://nupepa.org |
| Niupepa | Māori-run newspapers, same era | https://www.nzdl.org |
| Ulukau | Hawaiian-language digital library | https://ulukau.org |

**A named gap, not papered over**: an open Odu Ifá corpus — a living
Yoruba oral-divination tradition with hundreds of thousands of verses,
about as good a test case for "organic, at volume" as exists — does not
appear to exist online. What's findable is academic secondary literature
*about* Ifá (Abímbọ́lá's editions, journal articles): scholarship, not the
primary corpus, in the open, from its own custodians. If that visible and
that well-resourced a tradition hasn't been self-published in bulk, most
other indigenous-run oral-history archives and native-transcribed
proverb/song collections likely haven't either — worth treating as a real
limit on what an "organic content" pocket can currently contain, not a gap
to keep searching for indefinitely.

None of the 9 confirmed sources above have a puller script in this repo
yet — cataloguing precedes scripting here, same as §14/§15's GRETIL/
ctext.org/Avestan/Sikh/cuneiform rows.

## 17. Formal algebraic systems — cultures' own rule-governed structures

The strongest content sources for meaning-space priors aren't just organic
narratives; they're content where the culture itself imposed rigorous
compositional structure. Formal algebraic systems — astronomical tables with
deterministic computational rules, interlocking calendars using modular
arithmetic, tuning systems with pitch-class constraints, divination corpora
with fixed compositional units — are content already doing something close to
what EO does: treating meaning as compositional structure, not narrative.
These systems share formal properties: discrete entities, rule-governed
transformation, deterministic composition, and cultural meaning tied to the
rules themselves, not just the subject matter.

| System | Source | URL | Access | Format | License / Status | Formal Properties |
|---|---|---|---|---|---|---|
| **Indian astronomical texts (Āryabhaṭīya, 5th c. CE)** | Clark translation (1930) + Shukla & Sarma critical edition (1976) | Wikisource: https://en.wikisource.org/wiki/The_Aryabhatiya_of_Aryabhata<br/>Internet Archive: https://archive.org/details/The_Aryabhatiya_of_Aryabhata_Clark_1930<br/>GRETIL (Sanskrit + commentaries): https://gretil.sub.uni-goettingen.de/gretil.html | Public domain (Clark 1930), free on-demand from IA/Wikisource; GRETIL CC BY-NC-SA 4.0 | Plain text, EPUB, PDF, HTML; Sanskrit originals in TEI-XML (GRETIL) | Public domain / CC BY-NC-SA | 121 verses + commentaries; 4-part structure (astronomy, mathematics, time-reckoning, spherical mechanics); algorithms for root extraction, indeterminate equations, π approximation (3.1416), planetary position calculation via eccentrics/epicycles. Deterministic rules for celestial computation. |
| **Indian astronomical texts (Sūrya Siddhānta, 4th-5th c.)** | Burgess translation (1860) + Gangooly revision (1935) | Internet Archive: https://archive.org/details/surya-siddhanta-english-translation-ebenezer-burgess<br/>Digital Library of India: https://archive.org/details/in.ernet.dli.2015.96668<br/>Wellcome Collection: https://wellcomecollection.org/works/ayyccjsa | Public domain (1860 publication); free download from Internet Archive, DLI | PDF, DJVU, plain text, EPUB | Public domain | 14 chapters; 6,500+ verses; explicit computational recipes for mean/true planetary positions, eclipse prediction, moon phases, rising/setting times, precession accounting. Trigonometric lookup tables (jya/kojya) as primary computational primitives. Rules applicable at any epoch (days since Kali-yuga). |
| **Islamic zīj tables: Al-Khwārizmī (9th c.)** | ISMI database references + Internet Archive sources | ISMI: https://ismi.mpiwg-berlin.mpg.de/text/275957<br/>Internet Archive (Arabic): https://archive.org/details/1342TheAlgebraOfMohammedBenMusaAlKwarizmiInArabic | Open access database entry + archival manuscript references; 4 surviving Latin translations (Bodleian, Oxford, etc.) | Database metadata + scanned manuscripts (TIFF/JP2); Latin translations available via Internet Archive | Open access / archival | 37 chapters, 116 tabular datasets; calendrical conversion algorithms, sine tables, astronomical lookup tables, astrological data. Rule-governed computation; deterministic; composable (chained table lookups). |
| **Islamic zīj tables: Al-Qānūn al-Masʿūdī (Al-Bīrūnī, 11th c.)** | Original Arabic + modern editions | Qatar Digital Library: https://www.qdl.qa/en/archive/81055/vdc_100022880536.0x000001<br/>Internet Archive: https://archive.org/details/kitabalqanunalma02biru<br/>Usul Platform: https://usul.ai/t/al-qanun-al-masudi/29 | CC-licensed (QDL), public domain (IA Hyderabad 1954), platform access | Digital page images (QDL), PDF/EPUB/text (IA), searchable platform (Usul) | CC BY (QDL) / Archival (IA) | Comprehensive synthesis of Ptolemaic + 3 centuries of Islamic observations; theoretical derivations + tabular functions; algebraic innovations (cubic equation solutions); trigonometric refinement (solar apogee ≠ precession); "square-and-multiply" algorithm for efficient computation. |
| **Islamic zīj tables: Ulugh Beg's Zij-i Sulṭānī (15th c.)** | Multiple critical editions | World Digital Library: https://www.wdl.org/en/item/3951/<br/>Stanford web-edition: https://web.stanford.edu/~fparviz/zij.html<br/>Digital Bodleian: https://digital.bodleian.ox.ac.uk/objects/25a75a60-04a1-4937-980a-5192fd4ee933/<br/>Internet Archive (star catalogue): https://archive.org/details/cu31924012303800 | CC-licensed (varies per edition, WDL); Stanford comparative interface; Bodleian sample CC-BY-NC 4.0; IA star catalogue public domain | Digital page images, Persian/Arabic/Latin/French editions, interactive web interface | Mixed (CC/public domain) | 1,018 star positions in 48 constellations; 240 geographical localities (longitude/latitude tables); first independent re-measurement (15th c. observations, not Ptolemaic precession); over 200 extant manuscript copies (demonstrates standardization). Deterministic algorithms for coordinate conversion and visibility prediction. |
| **Chinese astronomical treatises (tianwen zhi from Twenty-Four Histories)** | Originals + translations via ctext.org | Chinese Text Project (ctext.org): https://ctext.org<br/>Metadata + individual treatises via `ctext.org/search` | API access (free key required); structured data CC BY-NC-SA; search accessible to all | XML/HTML markup with parallel classical Chinese + English translation | CC BY-NC-SA (structured data) | Systematic records of celestial observations, comets, lunar eclipses, planetary positions across Han/Tang/Song/Ming dynasties; rule-governed documentation of astrological interpretation tied to celestial geometry. Format: event-log style (date, phenomenon, interpretation). Deterministic mapping from observed celestial state to cosmological significance. |
| **Balinese Pawukon calendar** | Academic analyses + digital implementations | SAKA Museum Knowledge Center: https://www.sakamuseum.org/en/collection<br/>Balinese Calendar Rust library: https://github.com/SHA888/balinese-calendar<br/>BalineseDate.js: https://github.com/peradnya/balinese-date-js-lib<br/>Cambridge Press ref: Reingold & Dershowitz, *Calendrical Calculations* Ch. 12 | Open-source implementations (Apache-2.0, MIT); museum collection (public by reservation); academic chapter (subscription) | Rust/JavaScript source code with TypeScript types; museum archives (lontar manuscripts scans); Cambridge chapter text | Apache-2.0 / MIT / Academic | 210-day cycle from 10 concurrent wara (1–10 day cycles); LCM(5,7,30)=210 composition. Interlocked with 12-month Sasih lunar cycle (420-day Pawukon year). Pure arithmetic, repeating indefinitely without years. Deterministic rules for ceremonial timing (Otonan every 210 days). Validated against 50+ lontar Wariga manuscripts. |
| **Maya Tzolkin/Haab Calendar Round** | Academic analysis + Smithsonian resources | Living Maya Time (Smithsonian NMAI): https://maya.nmai.si.edu/calendar/calendar-system<br/>arXiv: https://arxiv.org/pdf/1312.1456 (Chanier, Mayan Long Count)<br/>Math Assoc. America: https://old.maa.org/press/periodicals/convergence/maya-calendar-conversions<br/>University of Delaware: https://www.eecis.udel.edu/~mills/maya.html | Open educational resource (Smithsonian); arXiv pre-print freely available | Interactive converter, PDF educational resources, plain text, HTML | Public domain / CC BY (Smithsonian) / Freely available | Tzolk'in (13×20=260-day sacred calendar); Haab (18×20+5=365-day solar calendar); Calendar Round is LCM(260,365)=18,980-day cycle (52 Haab = 73 Tzolk'in). Long Count integrates via LCM(260,365,360). Deterministic permutation of coefficients (1–13) with day names (20). Dresden Codex encodes Venus-cycle calculation tables (583.92-day cycle with leap-correction). |
| **Indian Raga system** | Rāga Junglism (community DB) + Chromatone | Rāga Junglism: https://ragajunglism.org/ragas/masterlist/<br/>Chromatone interactive: https://chromatone.center/theory/scales/raga/<br/>Chromatone GitHub: https://github.com/chromatone/chromatone.center<br/>Computational ethnomusicology: https://www.researchgate.net/publication/228885219_Raga_Mining | Community-stewarded (Rāga Junglism); open-source (Chromatone); academic paper freely available | Interactive web database, YAML data repository, NPM package, ResearchGate pre-print | Community-maintained (educational stewardship) / Open-source | 1,000+ catalogued Hindustani ragas with: pitch-set notation (22 srutis per octave; 72 melakarta foundation ragas in Carnatic tradition), arohana/avarohana (ascending/descending patterns), pakad (characteristic melodic phrases), rasa associations. Computational verification that arohana/avarohana suffice to classify from audio. Deterministic pitch classes + rule-governed melodic sequences. |
| **Arabic/Turkish Maqam system** | ORD-CC32 Zenodo dataset | Zenodo: https://zenodo.org/records/15682346<br/>arXiv: https://arxiv.org/abs/2506.14503<br/>TAQS.IM scales guide: https://taqs.im/scales/ | CC-licensed open-access dataset (Zenodo); TAQS.IM community-maintained | Audio metadata (CSV/JSON with pitch histograms), TAQS.IM interactive HTML | CC-licensed (Zenodo) / Community stewardship (TAQS.IM) | ORD-CC32: 1,932 recordings from 1932 Cairo Congress (first systematic international documentation); 7 regional traditions (Egypt, Iraq, Syria, Turkey, Morocco, Tunisia, Algeria). Maqam specifies: pitch set (24-tone Arabs, 53-comma Turkish), seyir (ascending/descending melodic movement rules), emphasis/ornament patterns, mood associations. 60+ named maqams with discrete pitch sets and melodic pathway rules. Deterministic constrained melodic space. |
| **Gamelan tuning systems (Slendro/Pelog)** | Ableton tuning library + Sumarsam pedagogy | Ableton: https://tuning.ableton.com/sundanese-gamelan/intro-to-sundanese-gamelan/<br/>Sumarsam (Wesleyan faculty): https://sumarsam.faculty.wesleyan.edu/files/2023/01/1_Introduction_to_Javanese_Gamelan.pdf<br/>Gamelan Son of Lion: https://www.gamelan.org/sonoflion/GSOLspecs.html | Open educational resource (Ableton); faculty pedagogy (free); ensemble archive | Interactive tuning specs (Hz values), PDF lecture notes, HTML guide | Ableton open educational / Faculty public stewardship | Salendro: 5-tone per octave (S-G-P-L-T), near-equal intervals, stretched octaves. Pelog: 7-tone per octave (S-G-P-U-L-T-O). Octave-division algorithm encodes tuning via instrument construction; deterministic interval spacing; ombak (beating patterns) account for inharmonicity. Mode exclusivity (Salendro XOR Pelog except modulation). Sumarsam (AKSI trained, Winslow-Kaplan Professor) bridges oral tradition with pedagogy—codifies intervallic patterns as taught within tradition, not imposed analytically. |

All nine systems above share formal properties: deterministic rules for
composition, discrete compositional units (pitch classes, calendar cycles,
astronomical positions), fixed transformation laws, and cultural meaning tied
to the rules themselves — not narrative content, but structure-as-meaning.
Unlike §16's organic-provenance sources (which prioritize who did the
composing), these prioritize systems that are themselves already algebraic:
cultures that encoded compositional structure into mathematical or musical
procedure.

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
  and **`scripts/shakespeare-corpus.py`** (this repo) cover the newer §14/§15
  sources — original-language scripture, classical/patristic texts, and the
  complete works of Shakespeare respectively. Each writes its own
  `manifest.csv` in the same shape as the Gutenberg script.
  **`scripts/consolidate-corpus.mjs`** flattens all of the above (plus
  journalism and diverse) into one directory `run-fold-bridge.mjs`/
  `crossval-fold-priors.mjs` can read in a single pass, normalizing the two
  holy-texts formats they can't parse as prose directly (Tanakh JSON, Greek
  NT XML) — see that script's header for exactly what it includes/excludes
  and why.
