export async function runChecks(review) {
  const { apis, frames, setup, state, wait, difference, measure } = review;
  const [original, candidate] = apis;
  const result = { assertions: 0, runtime: { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }, pixels: {}, work: {}, limitations: [] };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    result.assertions++;
  };
  const reset = () => apis.forEach((api) => api.reset());
  const track = (value) => apis.forEach((api) => api.track(value));
  const hash = (sample) => {
    let value = 2166136261;
    for (const byte of sample.data) value = Math.imul(value ^ byte, 16777619);
    return value >>> 0;
  };
  function equalPixels(name, samples = apis.map((api) => api.last())) {
    assert(samples.every(Boolean), `${name}: automatic draw did not arrive`);
    const diff = difference(...samples);
    assert(samples[0].data.some((value, index) => index % 4 !== 3 && value > 20), `${name}: output is blank`);
    assert(diff.differingPixels === 0, `${name}: ${diff.differingPixels} pixels differ (max ${diff.maxChannelDelta})`);
    result.pixels[name] = { width: diff.width, height: diff.height, differingPixels: diff.differingPixels, maxChannelDelta: diff.maxChannelDelta, hash: hash(samples[0]) };
  }
  async function automatic(name, action) {
    document.querySelector('#status').textContent = `Checking ${name}…`;
    track(true);
    reset();
    await action();
    await wait(100);
    const deadline = performance.now() + 2000;
    while (apis.some((api) => !api.last()) && performance.now() < deadline) await wait(20);
    equalPixels(name);
    track(false);
  }

  await setup('bitmap');
  result.runtime.engines = apis.map((api) => api.info().engine);
  assert(result.runtime.engines[0] === result.runtime.engines[1] && result.runtime.engines[0] !== 'unknown', 'Expected the same recognized engine for both runtimes');
  equalPixels('initial', apis.map((api) => api.capture()));
  result.work.bitmapIdle = await measure(300);
  assert(result.work.bitmapIdle.original.sourceUploads > 0, 'Baseline idle upload loop was not reproduced');
  assert(result.work.bitmapIdle.candidate.draws === 0 && result.work.bitmapIdle.candidate.sourceUploads === 0, 'Static ImageBitmap did not sleep');
  apis.forEach((api) => { api.renderer.start(); api.renderer.start(); });
  await wait(80);
  assert(candidate.counts().draws === 0, 'Repeated start woke an already running static source');
  for (const name of ['rest', 'pressed', 'moving', 'settled']) await automatic(name, () => state(name));
  await automatic('move', () => apis.forEach((api) => api.renderer.updateLens(0, { x: 30 })));
  assert(candidate.counts().sourceUploads === 0 && candidate.counts().mapUploads === 0, 'Moving a lens uploaded unchanged pixels');
  await automatic('reshape', () => apis.forEach((api) => api.renderer.updateLens(0, { width: 145, radius: 20 })));
  assert(candidate.counts().mapUploads === 1 && candidate.counts().sourceUploads === 0, 'Reshaping should upload one map, without the source');
  await automatic('rapid input', () => {
    for (let i = 0; i < 40; i++) apis.forEach((api) => api.renderer.updateLens(0, { x: i + 20 }));
  });
  assert(candidate.counts().draws === 2, 'Rapid changes should coalesce into one two-quad render');
  reset();
  apis.forEach((api) => api.renderer.updateLens(0, { x: 59 }));
  await wait(80);
  assert(candidate.counts().draws === 0, 'An unchanged lens should not draw');
  await automatic('restore shape', () => state('rest'));
  await automatic('setLenses reuse', () => apis.forEach((api) => api.renderer.setLenses([api.lens])));
  assert(candidate.counts().mapUploads === 0 && candidate.counts().deletedTextures === 0, 'setLenses failed to reuse the existing map');
  await automatic('removed lens', () => state('removed'));
  assert(candidate.counts().deletedTextures === 1, 'Removed lens texture was not released');
  await automatic('restored lens', () => state('rest'));
  result.work.bitmapMoving = await measure(300, true);
  assert(result.work.bitmapMoving.candidate.draws > 0 && result.work.bitmapMoving.candidate.sourceUploads === 0, 'Motion should reuse the immutable source');

  await setup('canvas');
  result.work.canvasLive = await measure(300);
  assert(result.work.canvasLive.candidate.sourceUploads > 0, 'External canvas updates require a live loop');
  await automatic('external canvas mutation', () => apis.forEach((api) => api.paint(0.7)));
  apis.forEach((api) => api.renderer.stop());
  reset();
  apis.forEach((api) => { api.paint(0.2); api.renderer.updateLens(0, { x: 42 }); });
  await wait(80);
  assert(candidate.counts().draws === 0, 'Stopped renderer drew an update automatically');
  equalPixels('stopped explicit render', apis.map((api) => api.capture()));
  assert(candidate.counts().sourceUploads === 1, 'Explicit render while stopped must upload the current canvas');
  apis.forEach((api) => { api.renderer.start(); api.renderer.start(); api.renderer.stop(); api.renderer.stop(); });
  reset();
  await wait(80);
  assert(candidate.counts().draws === 0, 'Repeated start/stop left a frame queued');

  await setup('image', { unloaded: true });
  await automatic('image loading', async () => {
    await Promise.all(apis.map(async (api) => { api.source.src = api.sourceCanvas.toDataURL(); await api.source.decode(); }));
  });
  await automatic('image replacement', async () => {
    await Promise.all(apis.map(async (api) => { api.paint(0.9); api.source.src = api.sourceCanvas.toDataURL(); await api.source.decode(); }));
  });
  result.work.imageElementLive = await measure(200);
  assert(result.work.imageElementLive.candidate.sourceUploads > 0, 'HTMLImageElement must retain continuous semantics');
  for (const kind of ['gif', 'apng', 'svg']) {
    await setup(kind);
    track(true);
    const originalHashes = [], candidateHashes = [];
    for (let i = 0; i < (kind === 'svg' ? 5 : 2); i++) {
      await wait(200);
      const samples = apis.map((api) => api.last());
      equalPixels(`${kind} sample ${i}`, samples);
      originalHashes.push(hash(samples[0]));
      candidateHashes.push(hash(samples[1]));
    }
    result.work[kind] = { originalHashes, candidateHashes, originalUniqueFrames: new Set(originalHashes).size, candidateUniqueFrames: new Set(candidateHashes).size };
    assert(JSON.stringify(originalHashes) === JSON.stringify(candidateHashes), `${kind}: frame progression changed`);
    if (kind === 'svg' && result.runtime.engines[0] === 'blink') assert(new Set(originalHashes).size > 1, 'Animated SVG did not exercise changing WebGL pixels');
    track(false);
  }

  for (const fallback of [false, true]) {
    const label = fallback ? 'videoFallback' : 'videoFrames';
    await setup('video', { fallback });
    result.runtime[label] = candidate.info().videoFrames;
    equalPixels(`${label} paused initial`, apis.map((api) => api.capture()));
    result.work[`${label}Idle`] = await measure(300);
    assert(result.work[`${label}Idle`].candidate.sourceUploads === 0, `${label}: paused video uploaded repeatedly`);
    await automatic(`${label} seek`, () => Promise.all(apis.map((api) => api.seek(0.5))));
    assert(candidate.counts().sourceUploads > 0, `${label}: seek did not upload the new frame`);
    try { await Promise.all(apis.map((api) => api.source.play())); }
    catch (error) { result.limitations.push(`${label}: video play was rejected by the native browser policy: ${error.message}`); continue; }
    result.work[`${label}Playing`] = await measure(350);
    assert(result.work[`${label}Playing`].candidate.sourceUploads > 0, `${label}: playing video stopped updating`);
    if (!fallback && candidate.info().videoFrames) assert(result.work[`${label}Playing`].candidate.sourceUploads < result.work[`${label}Playing`].original.sourceUploads, '12 fps video should upload less often than the baseline animation-frame loop');
    apis.forEach((api) => api.source.pause());
    await automatic(`${label} pause`, () => Promise.all(apis.map((api) => api.seek(0.75))));
    result.work[`${label}AfterPause`] = await measure(250);
    assert(result.work[`${label}AfterPause`].candidate.sourceUploads === 0, `${label}: pause left an upload loop`);
    await Promise.all(apis.map((api) => api.seek(1.85)));
    track(true);
    await Promise.all(apis.map((api) => api.source.play()));
    await wait(400);
    assert(apis.every((api) => api.source.ended), `${label}: end state was not reached`);
    equalPixels(`${label} ended`);
    track(false);
    result.work[`${label}Ended`] = await measure(200);
    assert(result.work[`${label}Ended`].candidate.sourceUploads === 0, `${label}: ended video did not sleep`);
    await automatic(`${label} source replacement`, async () => {
      await Promise.all(apis.map(async (api) => {
        api.source.removeAttribute('src');
        api.source.load();
        api.source.src = api.clip;
        api.source.load();
        const deadline = performance.now() + 5000;
        while (api.source.readyState < 2) { if (performance.now() > deadline) throw new Error('Video replacement timed out'); await wait(20); }
      }));
    });
  }

  await setup('canvas');
  for (const frame of frames) frame.style.transform = 'translateY(2400px)';
  await wait(200);
  reset();
  await wait(120);
  assert(candidate.counts().draws === 0, 'Offscreen renderer did not sleep');
  await automatic('offscreen resume', () => {
    apis.forEach((api) => api.paint(0.4));
    frames.forEach((frame) => { frame.style.transform = ''; });
  });
  apis.forEach((api) => api.canvas.remove());
  await wait(150);
  reset();
  await wait(100);
  assert(candidate.counts().draws === 0, 'Disconnected renderer did not sleep');
  await automatic('reconnection', () => apis.forEach((api) => { api.paint(0.8); api.canvas.ownerDocument.body.prepend(api.canvas); }));
  for (const frame of frames) {
    Object.defineProperty(frame.contentDocument, 'hidden', { configurable: true, value: true });
    frame.contentDocument.dispatchEvent(new frame.contentWindow.Event('visibilitychange'));
  }
  reset();
  await wait(100);
  assert(candidate.counts().draws === 0, 'Hidden-page signal left the renderer running');
  await automatic('visibility resume', () => {
    apis.forEach((api) => api.paint(0.1));
    for (const frame of frames) { delete frame.contentDocument.hidden; frame.contentDocument.dispatchEvent(new frame.contentWindow.Event('visibilitychange')); }
  });
  result.limitations.push('Visibility handling used real visibilitychange events with an overridden document.hidden getter; native background-tab suspension was not reproduced');
  await setup('bitmap');
  await automatic('CSS resize', () => frames.forEach((frame) => { frame.style.width = '90%'; }));
  assert(candidate.info().width === Math.round(candidate.canvas.clientWidth * Math.min(devicePixelRatio, 2)), 'Backing size does not follow CSS size and DPR');
  await automatic('canvas attribute resize', () => apis.forEach((api) => { api.canvas.width += 10; }));
  frames.forEach((frame) => { frame.style.width = ''; });
  await wait(150);
  const loss = candidate.gl.getExtension('WEBGL_lose_context');
  if (loss) {
    const lost = new Promise((resolve) => candidate.canvas.addEventListener('webglcontextlost', resolve, { once: true }));
    loss.loseContext();
    await lost;
    reset();
    await wait(80);
    assert(candidate.counts().draws === 0, 'Context loss left queued draws running');
    track(true);
    const restored = new Promise((resolve) => candidate.canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
    loss.restoreContext();
    await Promise.race([restored, wait(4000).then(() => { throw new Error('WebGL context restore timed out'); })]);
    await wait(150);
    equalPixels('context restored');
    assert(candidate.counts().sourceUploads > 0 && candidate.counts().mapUploads > 0, 'Restored context did not rebuild its textures');
    track(false);
  } else result.limitations.push('WEBGL_lose_context is unavailable in this engine');
  candidate.renderer.updateLens(0, { x: 20 });
  candidate.renderer.destroy();
  reset();
  candidate.renderer.render();
  candidate.renderer.start();
  candidate.renderer.stop();
  candidate.renderer.destroy();
  await wait(100);
  assert(candidate.counts().draws === 0 && candidate.counts().sourceUploads === 0, 'Destroyed renderer accepted queued or later work');
  const occupied = document.createElement('canvas');
  occupied.getContext('2d');
  let unavailable = false;
  try { candidate.createGlassRenderer(occupied, candidate.source); } catch (error) { unavailable = error.message === 'WebGL is not available'; }
  assert(unavailable, 'Unavailable WebGL did not preserve the existing error');
  await setup('bitmap');
  review.compare();
  return result;
}
