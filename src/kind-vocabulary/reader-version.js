// src/kind-vocabulary/reader-version.js — reader-version coupling for the
// kind-vocabulary channel (docs/03-prior-spec-kind-vocabulary.md §3.3).
//
// Reader-version coupling for this channel is total: a KindVocabulary@1
// payload's schema/vocabulary/parameter shape is defined by whatever version
// of eoreader5's induceEntityKind produced it, so a reader running a
// different version MUST refuse the channel rather than attempt to interpret
// it. The actual engine-side refusal lives in eoreader5; this is the pure
// predicate both sides can share/test against.

export function validateReaderVersion(payload, readerVersion) {
  if (typeof readerVersion !== 'string' || readerVersion.length === 0) {
    return { valid: false, reason: 'reader_version to check against must be a non-empty string' };
  }
  if (!payload || typeof payload.reader_version !== 'string' || payload.reader_version.length === 0) {
    return { valid: false, reason: 'payload is missing a reader_version field' };
  }
  if (payload.reader_version !== readerVersion) {
    return {
      valid: false,
      reason: `reader_version mismatch: channel was built for "${payload.reader_version}", engine is running "${readerVersion}"`,
      channelReaderVersion: payload.reader_version,
      engineReaderVersion: readerVersion,
    };
  }
  return { valid: true, reason: null };
}

// Throwing counterpart for call sites that need to refuse loudly (acceptance
// test §6.3: "reader_version mismatch is refused loudly, with the mismatch
// named in the error"). Delegates to validateReaderVersion so both call
// styles share one predicate.
export function assertReaderVersion(payload, readerVersion) {
  const result = validateReaderVersion(payload, readerVersion);
  if (!result.valid) {
    throw new Error(`KindVocabulary reader_version refused: ${result.reason}`);
  }
  return result;
}
