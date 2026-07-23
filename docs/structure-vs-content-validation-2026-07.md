# Structure vs. Content Surprise: Cross-Modal Validation

Date: 2026-07-23

## Hypothesis

The theoretical argument posits an asymmetry between **structure surprise** (operator/grain evidence) and **content surprise** (embedding-based semantics):

- **Structure** has a "universal floor" due to eoreader4.2's closed-form 27-cell geometry (no fitting required). Operator/grain evidence should generalize across modalities and category boundaries because the 27-cell grammar is built into the text parser's core logic.
- **Content** lacks this universal floor. Embedding space (xenova/transformers MiniLM L12v2, 384-dim) is fitted to the current domain. When pooled past genre or modality, content-cell correlation should collapse faster than structure-cell correlation.

**Prediction**: When pairwise correlations are computed for two categories (fiction/non-fiction or prose/code), the observed gap statistic (same-category mean − cross-category mean) should be **larger for structure than for content**, because content's lack of a universal floor causes its correlation to degrade more when categories are mixed.

## Method

Two parallel experiments, each using a permutation-gap statistic:

1. **Genre Experiment** (52 Gutenberg books, fiction/non-fiction split)
   - 52 books: 18 fiction, 34 non-fiction
   - ~20 spans per book, ~300 sentence max per book = ~1040 total spans
   - Both channels measured for each span: fold (structure) and content (embedding)
   - Pairwise Pearson correlations across all 52 books → 1326 unique pairs
   - Gap = mean(fiction/fiction + non-fiction/non-fiction) − mean(fiction/non-fiction)
   - Permutation test: shuffle category labels 2000 times, record null distribution, compute p-value

2. **Cross-Modal Experiment** (10-file diverse corpus, prose/code split)
   - 10 files: 6 prose (English + non-English), 4 code (Python, Go, Rust, C)
   - ~150 spans per file, ~10 files = ~1500 spans
   - Same channel measurement and permutation approach
   - Pairwise Pearson correlations → 45 unique pairs
   - Gap = mean(prose/prose + code/code) − mean(prose/code)
   - Permutation test: 2000 label shuffles
   - **Small-N caveat**: Only 10 files; permutation test has less statistical power than genre experiment

3. **Cell Set Consistency**
   - Fold channel restricted to `contentCellKeys` (excludes EVA_Binding_Lens, REC_Making_Lens because reading.js fires them unconditionally on every span, carrying no genre/modality signal for structure).
   - Content channel reported in two views:
     - **contentAll27**: all 27 cells, no exclusion (content's natural default)
     - **contentMatchedExclusion**: same 25 cells as fold (for strict comparison)
   - All three channels scored against identical permutation label shuffles (one shared set), so observed gaps and p-values are directly comparable.

## Results

### Genre Experiment

| Channel | Observed Gap | Null Mean | p-Value | Significant (p<0.05)? |
|---------|--------------|-----------|---------|----------------------|
| Fold (structure) | 0.0147 | 0.0008 | 0.1829 | **No** |
| Content-all27 | -0.0145 | -0.0001 | 0.6302 | **No** |
| Content-matched | -0.0118 | -0.0002 | 0.5897 | **No** |

**Comparison metrics:**
- `foldGapMinusContentAll27Gap` = 0.0292 ✓ (positive, supports hypothesis)
- `foldGapMinusContentMatchedGap` = 0.0265 ✓ (positive, supports hypothesis)

**Interpretation:**
Fold gap is slightly larger than content gap (by ~0.03), consistent with the prediction that content collapses faster. However, neither channel detects genre discrimination at p<0.05; the effect is present only as a small gap on a non-significant signal. Both structure and content show minimal fiction/non-fiction distinction in this 52-book Gutenberg corpus.

---

### Cross-Modal Experiment

| Channel | Observed Gap | Null Mean | p-Value | Significant (p<0.05)? |
|---------|--------------|-----------|---------|----------------------|
| Fold (structure) | 0.0763 | 0.0003 | **0.0465** | **Yes** |
| Content-all27 | 1.1026 | 0.0069 | **0.006** | **Yes** |
| Content-matched | 1.0066 | 0.0065 | **0.006** | **Yes** |

**Comparison metrics:**
- `foldGapMinusContentAll27Gap` = −1.0263 ✗ (negative, contradicts hypothesis)
- `foldGapMinusContentMatchedGap` = −0.9303 ✗ (negative, contradicts hypothesis)

**Interpretation:**
**Content gap is dramatically larger than fold gap** (by ~1.0 absolute difference). All three channels detect prose/code discrimination, but structure shows a much weaker effect (p=0.0465, gap=0.0763) than content (p=0.006, gap≈1.1). This directly contradicts the hypothesis: embedding-based content actually generalizes *better* to the prose/code boundary than eoreader4.2's structure signal does.

---

## Finding

The **cross-modal result reverses the hypothesis**, revealing an unexpected asymmetry:

1. **On fiction/non-fiction (genre)**: Fold gap marginally larger than content gap, weakly supporting the hypothesis—but both gaps are tiny and non-significant.

2. **On prose/code (cross-modal)**: Content gap is 14× larger than fold gap, strongly contradicting the hypothesis. Embedding-based content discriminates prose from code far more sharply than operator/grain structure does.

### Why might content outperform structure on the prose/code boundary?

**Structural difference between prose and code**: Prose and code differ not just semantically but *grammatically*—they have different operator/grain distributions by construction. The eoreader4.2 parser is designed primarily for natural-language text; code is syntactically alien to it (no traditional sentence structure, different lexicon, different density of operators like DEF/SYN). The fold channel, being tightly coupled to the text parser's assumptions, may struggle to find consistent structure in code.

**Embedding universality**: The MiniLM model (paraphrase-multilingual-MiniLM-L12-v2) is trained on diverse multilingual data, including potentially code-adjacent text (e.g., documentation, technical writing). Its embedding space may capture cross-modal semantic features that the structure signal cannot, precisely because embedding training didn't assume a specific modality.

**Small-N effect on cross-modal**: The cross-modal experiment has only 10 files (4 code, 6 prose) and 45 pairs. The large gap and strong p-value are real, but low statistical power means the estimate carries more uncertainty than the 52-book genre experiment.

---

## Conclusion

The hypothesis—that structure has a universal floor and content should collapse faster when pooled across categories—is **weakly supported on fiction/non-fiction but strongly contradicted on prose/code**. 

In the prose/code contrast, embedding-based content *actually generalizes better* than structure does. This suggests:

- **Structure is modality-specific**: eoreader4.2's operator/grain evidence is tuned for text and degrades on code.
- **Content is modality-agnostic**: Embeddings trained on diverse text capture universal semantic features that apply across prose and code.

The asymmetry is real, but inverted: content's lack of fitting/geometry is an advantage on cross-modal tasks, not a liability.

---

## Experimental Record

- **Genre experiment**: `/scripts/content-vs-structure-genre-experiment.mjs`
  - Corpus: `/gutenberg_corpus/` (52 .txt files + manifest.csv)
  - Command: `node scripts/content-vs-structure-genre-experiment.mjs --corpus-dir ./gutenberg_corpus --spans-per-book 20 --max-sentences 300 --permutations 2000`
  - Output: `/tmp/claude-0/-home-user/91c6b05a-4c59-5e48-acf6-3b79efc6b2d0/scratchpad/genre-result.json`

- **Cross-modal experiment**: `/scripts/content-vs-structure-cross-modal-experiment.mjs`
  - Corpus: `/diverse_corpus/` (10 files: 6 prose, 4 code)
  - Command: `node scripts/content-vs-structure-cross-modal-experiment.mjs --corpus-dir ./diverse_corpus --max-sentences 150 --permutations 2000`
  - Output: `/tmp/claude-0/-home-user/91c6b05a-4c59-5e48-acf6-3b79efc6b2d0/scratchpad/cross-modal-result.json`

Both experiments ran on the remote execution environment with @xenova/transformers MiniLM model (Xenova/paraphrase-multilingual-MiniLM-L12-v2, 384-dim) and eoreader4.2 v1.0.0 structure channel.
