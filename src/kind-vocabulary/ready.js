// src/kind-vocabulary/ready.js — publication readiness gate for the
// kind-vocabulary channel (docs/03-prior-spec-kind-vocabulary.md §3.4).
//
// isReady is a pure function: it takes already-computed inputs (median
// n_steps over the pocket's entity histories, per-seed split recovery
// results, and coreference fragmentation) and returns a verdict with named
// reasons for every failing check. It does not run induction, does not read
// eoreader5's EntityHistory@1/EntityKindCandidate@1 objects directly — the
// caller (eoreader5-side or a build script here) is responsible for reducing
// those into the shape below. See the TODO at the bottom for the real
// integration point, which depends on eoreader5's induceEntityKind output.
//
// A candidateChannel has the shape:
//   {
//     entityHistories: { medianNSteps: number },
//     splits: [
//       {
//         seed: string | number,
//         recovered: boolean,               // did this seed's split recover the kind at all?
//         transferGain: number,              // held-out transfer gain for this split
//         membershipNullTransferGain: number,// the membership_null's transfer gain to clear
//         relativeEffectHoldout: number,     // relative effect measured on holdout, not fit
//       },
//       ...
//     ],
//     coreferenceFragmentation: number,      // reported fragmentation fraction, 0..1
//   }
//
// thresholds has the shape:
//   {
//     minStepFloor: number,                 // the 9-step floor itself
//     minMedianNStepsAboveFloor: number,     // how far above the floor the median must sit
//     minIndependentSplits: number,          // >= 3 per spec
//     minRelativeEffectHoldout: number,
//     maxCoreferenceFragmentation: number,
//   }

const DEFAULT_THRESHOLDS = Object.freeze({
  minStepFloor: 9,
  minMedianNStepsAboveFloor: 3,
  minIndependentSplits: 3,
  minRelativeEffectHoldout: 0,
  maxCoreferenceFragmentation: 0.35,
});

export function isReady(candidateChannel, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const reasons = [];

  const medianNSteps = candidateChannel?.entityHistories?.medianNSteps;
  const requiredMedian = t.minStepFloor + t.minMedianNStepsAboveFloor;
  if (typeof medianNSteps !== 'number' || medianNSteps < requiredMedian) {
    reasons.push({
      check: 'median_n_steps_above_floor',
      pass: false,
      detail: `median n_steps ${medianNSteps ?? 'missing'} must be >= ${requiredMedian} (floor ${t.minStepFloor} + margin ${t.minMedianNStepsAboveFloor})`,
    });
  }

  const splits = Array.isArray(candidateChannel?.splits) ? candidateChannel.splits : [];
  const seeds = new Set(splits.map((s) => s.seed));
  if (seeds.size < t.minIndependentSplits) {
    reasons.push({
      check: 'min_independent_splits',
      pass: false,
      detail: `only ${seeds.size} independent seeded splits, need >= ${t.minIndependentSplits}`,
    });
  }

  const notRecovered = splits.filter((s) => !s.recovered);
  if (splits.length === 0 || notRecovered.length > 0) {
    reasons.push({
      check: 'kind_recovers_across_splits',
      pass: false,
      detail: splits.length === 0
        ? 'no splits reported'
        : `kind did not recover in splits: ${notRecovered.map((s) => s.seed).join(', ')}`,
    });
  }

  const belowNull = splits.filter((s) => !(s.transferGain > s.membershipNullTransferGain));
  if (splits.length === 0 || belowNull.length > 0) {
    reasons.push({
      check: 'transfer_gain_clears_membership_null',
      pass: false,
      detail: splits.length === 0
        ? 'no splits reported'
        : `held-out transfer gain did not clear the membership null in splits: ${belowNull.map((s) => s.seed).join(', ')}`,
    });
  }

  const belowRelativeEffect = splits.filter((s) => !(s.relativeEffectHoldout >= t.minRelativeEffectHoldout));
  if (splits.length === 0 || belowRelativeEffect.length > 0) {
    reasons.push({
      check: 'relative_effect_floor_met_on_holdout',
      pass: false,
      detail: splits.length === 0
        ? 'no splits reported'
        : `relative-effect floor (${t.minRelativeEffectHoldout}) not met on holdout in splits: ${belowRelativeEffect.map((s) => s.seed).join(', ')}`,
    });
  }

  const fragmentation = candidateChannel?.coreferenceFragmentation;
  if (typeof fragmentation !== 'number' || fragmentation >= t.maxCoreferenceFragmentation) {
    reasons.push({
      check: 'coreference_fragmentation_below_threshold',
      pass: false,
      detail: `coreference fragmentation ${fragmentation ?? 'missing'} must be < ${t.maxCoreferenceFragmentation}`,
    });
  }

  return { ready: reasons.length === 0, reasons };
}

// Pipeline/assembly-level helper: given the PriorSnapshot channel list a
// build was otherwise going to publish, include 'kind-vocabulary' only if
// isReady says so, and omit it (rather than publish an unready channel)
// otherwise. This is the seam a build script or eoreader5-side assembler
// calls after computing candidateChannel for a pocket.
export function selectPriorSnapshotChannels(baseChannels, candidateChannel, thresholds = {}) {
  const { ready } = isReady(candidateChannel, thresholds);
  const withoutKindVocabulary = baseChannels.filter((channel) => channel !== 'kind-vocabulary');
  return ready ? [...withoutKindVocabulary, 'kind-vocabulary'] : withoutKindVocabulary;
}

// TODO(eoreader5 04-engine-spec-entity-kinds.md): once induceEntityKind and
// EntityKindCandidate@1 are stable, add a reducer here (or in eoreader5) that
// turns a real EntityKindCandidate@1 + its per-seed split records into the
// candidateChannel shape isReady expects, so this gate can run against real
// induction output rather than the hand-built fixtures in
// test/kind-vocabulary.test.js.
