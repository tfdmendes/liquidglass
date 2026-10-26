import assert from 'node:assert/strict';

export function comparePixels(left, right) {
  assert.ok(left.width === right.width && left.height === right.height, 'Capture dimensions differ');
  let pixels = 0, maxChannelDelta = 0;
  for (let i = 0; i < left.data.length; i += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(left.data[i + channel] - right.data[i + channel]);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      changed ||= delta > 0;
    }
    if (changed) pixels++;
  }
  return { pixels, maxChannelDelta, totalPixels: left.width * left.height };
}
