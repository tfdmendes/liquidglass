export function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarizeFrames(intervals, updates, refreshMs) {
  const elapsedMs = intervals.reduce((sum, value) => sum + value, 0);
  const missedSlots = intervals.reduce((sum, value) => sum + Math.max(0, Math.round(value / refreshMs) - 1), 0);
  return {
    frames: intervals.length, elapsedMs, fps: elapsedMs ? intervals.length * 1000 / elapsedMs : 0,
    p95FrameMs: percentile(intervals, 0.95), medianFrameMs: percentile(intervals, 0.5),
    meanUpdateMs: updates.length ? updates.reduce((sum, value) => sum + value, 0) / updates.length : 0,
    p95UpdateMs: percentile(updates, 0.95), missedSlots,
    missedSlotPercent: intervals.length ? missedSlots / (intervals.length + missedSlots) * 100 : 0,
  };
}

export function summarizeTrials(trials) {
  return ['fps', 'p95FrameMs', 'meanUpdateMs', 'missedSlotPercent'].reduce((result, key) => {
    const values = trials.map(trial => trial[key]);
    result[key] = percentile(values, 0.5);
    result[`${key}Range`] = [Math.min(...values), Math.max(...values)];
    return result;
  }, {});
}
