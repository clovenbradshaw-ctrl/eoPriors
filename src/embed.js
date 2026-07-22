// src/embed.js — the embedding client, pinned to the exact model/version the
// exemplar basis and the phasepost centroids were built in (SPEC.md §5.2, §9).
// A cosine measured against a different embedding space measures nothing, so
// this pin is load-bearing, not a default that can drift.
//
// MODEL: Xenova/paraphrase-multilingual-MiniLM-L12-v2 — the same space
// data/centroids-27.json's vectors live in (vendored from eoreader4.2, itself
// sourced from eo-lexical-analysis-2.0; see that file's `vendored_into`).
//
// Two writers, one embedder, two load paths for the same package:
//   - browser (index.html, no build step): dynamic import of a pinned CDN ESM
//     URL — exactly how eoreader4.2's src/model/embed.js loads it.
//   - Node (the GitHub Action / an agent script): dynamic import of the bare
//     package specifier, resolved from package.json's dependency — no CDN
//     fetch, no network dependency in CI beyond `npm ci`.
// Same model id, same call shape, either way.

const XENOVA_CDN_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17/+esm';
export const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const EMBEDDING_MODEL_REF = `${MODEL_ID}@2.17`; // name@version, as basis_id/measurement records expect

const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

async function loadTransformersModule() {
  if (isNode) return import('@xenova/transformers');
  return import(/* @vite-ignore */ XENOVA_CDN_URL);
}

// createEmbedder — factory, not a singleton: each caller that needs an
// isolated cache (e.g. the static surface vs. a one-shot Action script) gets
// its own pipeline instance.
export const createEmbedder = () => {
  let warming = null;
  let warm = false;
  let pipeline = null;

  return {
    id: 'minilm',
    model: MODEL_ID,
    modelRef: EMBEDDING_MODEL_REF,
    isWarm: () => warm,

    // onProgress receives transformers.js progress events
    // ({ status, file, progress, loaded, total }).
    async warm(onProgress) {
      if (warm) return;
      if (warming) return warming;
      warming = (async () => {
        const mod = await loadTransformersModule();
        pipeline = await mod.pipeline('feature-extraction', MODEL_ID, {
          quantized: true,
          progress_callback: onProgress || undefined,
        });
        warm = true;
      })();
      warming.catch(() => { warming = null; }); // a failed warm stays retryable
      return warming;
    },

    // Mean-pooled, normalized — a unit vector, so cosine similarity reduces to
    // a dot product (src/compress.js relies on this).
    async embed(text) {
      if (!warm) await this.warm();
      const out = await pipeline(String(text), { pooling: 'mean', normalize: true });
      return Float32Array.from(out.data);
    },
  };
};
