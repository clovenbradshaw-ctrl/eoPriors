// scripts/lib/stats.mjs — small, generic statistics helpers shared by the
// prior-analysis scripts. Nothing here is specific to folds or cells.

export function mean(xs) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function stddev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

// Pearson correlation coefficient between two equal-length arrays. Returns 0
// (not NaN) when either series has zero variance — a constant series
// correlates with nothing, which is the honest answer, not an error.
export function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = mean(xs), my = mean(ys);
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}
