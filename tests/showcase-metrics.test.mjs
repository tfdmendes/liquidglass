import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeFrames, summarizeTrials } from '../showcase/metrics.js';

test('Cadence and missed-slot counts include slow frames', () => {
  const result = summarizeFrames([16, 16, 32, 16], [1, 2, 3, 4], 16);
  assert.equal(result.fps, 50);
  assert.equal(result.elapsedMs, 80);
  assert.equal(result.p95FrameMs, 32);
  assert.equal(result.missedSlots, 1);
  assert.equal(result.missedSlotPercent, 20);
  assert.equal(result.meanUpdateMs, 2.5);
});

test('Trial summary reports medians and retains the full range', () => {
  const result = summarizeTrials([40, 60, 50].map(fps => ({ fps, p95FrameMs: 30, meanUpdateMs: 3, missedSlotPercent: 0 })));
  assert.equal(result.fps, 50);
  assert.deepEqual(result.fpsRange, [40, 60]);
});
