export async function frameFixture({ runtime, core, clip, animated, pixelRatio }) {
  const { createGlassRenderer } = await import(runtime);
  const { engine } = await import(core);
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) throw new Error('WebGL is not available in this browser');
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = 360;
  sourceCanvas.height = 220;
  const ctx = sourceCanvas.getContext('2d');
  let source, renderer, lens, kind, lastPixels, tracking = false;
  let counts = { draws: 0, sourceUploads: 0, mapUploads: 0, deletedTextures: 0 };
  const originalDraw = gl.drawArrays.bind(gl);
  const originalUpload = gl.texImage2D.bind(gl);
  const originalDelete = gl.deleteTexture.bind(gl);
  gl.drawArrays = (...args) => {
    counts.draws++;
    const result = originalDraw(...args);
    if (tracking) lastPixels = pixels();
    return result;
  };
  gl.texImage2D = (...args) => {
    counts[args.at(-1) === source ? 'sourceUploads' : 'mapUploads']++;
    return originalUpload(...args);
  };
  gl.deleteTexture = (...args) => {
    counts.deletedTextures++;
    return originalDelete(...args);
  };

  function paint(phase = 0) {
    const sky = ctx.createLinearGradient(0, 0, 0, 220);
    sky.addColorStop(0, '#15384d');
    sky.addColorStop(1, '#db8960');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 360, 220);
    ctx.fillStyle = '#f1cd7d';
    ctx.beginPath();
    ctx.arc(285, 50, 23, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#315b65';
    ctx.beginPath();
    ctx.moveTo(0, 150);
    for (let x = 0; x <= 360; x += 8) ctx.lineTo(x, 130 + 27 * Math.sin(x / 55));
    ctx.lineTo(360, 220);
    ctx.lineTo(0, 220);
    ctx.fill();
    ctx.strokeStyle = '#e8d9b4';
    ctx.lineWidth = 1;
    for (let x = 0; x < 360; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 220);
      ctx.stroke();
    }
    ctx.fillStyle = '#f7ede0';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('LIQUID GLASS', 24, 65);
    ctx.font = '14px sans-serif';
    ctx.fillText('Same pixels. Same lens.', 25, 88);
    ctx.fillStyle = '#b44438';
    ctx.fillRect(35 + phase * 180, 158, 54, 38);
  }

  function pixels() {
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return { width: canvas.width, height: canvas.height, data };
  }

  function state(name = 'rest', phase = 0.5) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (name === 'removed') return renderer.setLenses([]);
    const next = { x: w * 0.22, y: h * 0.39, width: w * 0.46, height: h * 0.43, radius: h * 0.21, refraction: 22, chroma: 0.18 };
    if (name === 'pressed') Object.assign(next, { x: w * 0.18, width: w * 0.54, height: h * 0.35, radius: h * 0.175 });
    if (name === 'moving') next.x = w * (0.08 + phase * 0.43);
    if (name === 'settled') next.x = w * 0.42;
    Object.assign(lens, next);
    renderer.setLenses([lens]);
  }

  async function loaded(element, event) {
    if (event === 'loadeddata' && element.readyState >= 2) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); element.removeEventListener(event, done); element.removeEventListener('error', failed); };
      const done = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('Source failed to load')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`${event} timed out`)); }, 6000);
      element.addEventListener(event, done);
      element.addEventListener('error', failed);
    });
  }

  async function setup(type = 'bitmap', options = {}) {
    renderer?.destroy();
    if (source instanceof HTMLVideoElement) { source.pause(); source.remove(); }
    if (source instanceof HTMLImageElement) source.remove();
    if (source instanceof ImageBitmap) source.close();
    kind = type;
    paint();
    if (type === 'canvas') source = sourceCanvas;
    else if (type === 'video') {
      source = document.createElement('video');
      source.muted = true;
      source.playsInline = true;
      source.preload = 'auto';
      source.className = 'source';
      document.body.append(source);
      if (options.fallback) Object.defineProperty(source, 'requestVideoFrameCallback', { value: undefined });
      if (!options.unloaded) {
        source.src = clip;
        await loaded(source, 'loadeddata');
      }
    } else {
      const img = new Image();
      if (type === 'svg') img.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220"><rect width="360" height="220" fill="#ab3020"><animate attributeName="fill" values="#ab3020;#1646bd" calcMode="discrete" dur=".4s" repeatCount="indefinite"/></rect><text x="20" y="100" fill="white" font-size="28">Animated SVG</text></svg>');
      else if (type === 'gif' || type === 'apng') img.src = animated[type];
      else if (!options.unloaded) img.src = sourceCanvas.toDataURL();
      if (!options.unloaded) await img.decode();
      source = type === 'bitmap' ? await createImageBitmap(img) : img;
      if (source instanceof HTMLImageElement) { source.className = 'source'; document.body.append(source); }
    }
    lens = {};
    lastPixels = undefined;
    renderer = createGlassRenderer(canvas, source, { pixelRatio });
    state();
    if (options.start !== false) renderer.start();
    return info();
  }

  function info() {
    return { kind, engine, dpr: devicePixelRatio, width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, videoFrames: typeof source?.requestVideoFrameCallback === 'function', readyState: source?.readyState, paused: source?.paused };
  }

  window.fixture = {
    setup, state, paint, pixels, info, clip, animated, sourceCanvas, createGlassRenderer,
    get lens() { return lens; },
    get source() { return source; }, get renderer() { return renderer; }, gl, canvas,
    counts: () => ({ ...counts }),
    reset: () => { for (const key of Object.keys(counts)) counts[key] = 0; },
    track: (value) => { tracking = value; lastPixels = undefined; },
    last: () => lastPixels,
    capture: () => { renderer.render(); return pixels(); },
    async seek(time) {
      if (source.currentTime === time && source.readyState >= 2) return;
      const done = loaded(source, 'seeked');
      source.currentTime = time;
      await done;
    },
  };
  await setup('bitmap');
  window.fixtureReady = true;
}

export async function reviewFixture(payload, frameCode, checks) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const frames = [...document.querySelectorAll('iframe')];
  const status = document.querySelector('#status');
  let replay = 0;
  for (let i = 0; i < frames.length; i++) {
    const args = { runtime: payload.runtimes[i], core: payload.cores[i], clip: payload.clip, animated: payload.animated };
    frames[i].srcdoc = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#15384d}canvas{display:block;width:100%;height:220px}.source{position:absolute;left:0;top:0;width:1px;height:1px;opacity:.02;pointer-events:none}</style><canvas aria-label="Glass renderer output"></canvas><script type="module">(${frameCode})(${JSON.stringify(args).replaceAll('<', '\\u003c')}).catch(e=>{document.body.textContent=e.message;window.fixtureError=e.stack})<\/script>`;
  }
  const deadline = performance.now() + 8000;
  while (!frames.every((frame) => frame.contentWindow.fixtureReady)) {
    const error = frames.find((frame) => frame.contentWindow.fixtureError);
    if (error) throw new Error(error.contentWindow.fixtureError);
    if (performance.now() > deadline) throw new Error('Renderer fixtures did not become ready');
    await wait(20);
  }
  const apis = frames.map((frame) => frame.contentWindow.fixture);
  const summary = (api) => JSON.stringify(api.counts());
  function stopReplay() { cancelAnimationFrame(replay); replay = 0; }
  function state(name, phase) { for (const api of apis) api.state(name, phase); }
  async function setup(kind, options) { stopReplay(); await Promise.all(apis.map((api) => api.setup(kind, options))); await wait(100); }
  function imageData(sample) {
    const out = document.createElement('canvas');
    out.width = sample.width;
    out.height = sample.height;
    const data = out.getContext('2d').createImageData(sample.width, sample.height);
    const row = sample.width * 4;
    for (let y = 0; y < sample.height; y++) data.data.set(sample.data.subarray(y * row, (y + 1) * row), (sample.height - 1 - y) * row);
    out.getContext('2d').putImageData(data, 0, 0);
    return out;
  }
  function difference(a, b) {
    if (!a || !b || a.width !== b.width || a.height !== b.height) throw new Error('Pixel sample dimensions differ');
    let differingPixels = 0, maxChannelDelta = 0;
    const data = new Uint8Array(a.data.length);
    for (let i = 0; i < data.length; i += 4) {
      let changed = false;
      for (let c = 0; c < 4; c++) {
        const delta = Math.abs(a.data[i + c] - b.data[i + c]);
        maxChannelDelta = Math.max(maxChannelDelta, delta);
        changed ||= delta > 0;
        data[i + c] = Math.min(255, delta * 8);
      }
      data[i + 3] = 255;
      if (changed) differingPixels++;
    }
    return { width: a.width, height: a.height, differingPixels, maxChannelDelta, data };
  }
  function compare() {
    const samples = apis.map((api) => api.capture());
    const diff = difference(...samples);
    document.querySelector('#difference').replaceChildren(imageData(diff));
    document.querySelector('#overlay').replaceChildren(...samples.map(imageData));
    document.querySelector('#pixel-result').textContent = `${diff.differingPixels} differing pixels / ${diff.width * diff.height}; max channel delta ${diff.maxChannelDelta}`;
    return { width: diff.width, height: diff.height, differingPixels: diff.differingPixels, maxChannelDelta: diff.maxChannelDelta };
  }
  async function measure(ms = 1000, moving = false) {
    stopReplay();
    await wait(150);
    for (const api of apis) api.reset();
    const start = performance.now();
    if (moving) {
      const step = (now) => {
        const phase = Math.min(1, (now - start) / ms);
        state('moving', phase);
        for (const api of apis) if (api.info().kind === 'canvas') api.paint(phase);
        if (phase < 1) replay = requestAnimationFrame(step);
      };
      replay = requestAnimationFrame(step);
    }
    await wait(ms);
    stopReplay();
    const result = { elapsedMs: performance.now() - start, original: apis[0].counts(), candidate: apis[1].counts() };
    document.querySelectorAll('.counts').forEach((node, i) => { node.textContent = summary(apis[i]); });
    document.querySelector('#measurement').textContent = JSON.stringify(result, null, 2);
    return result;
  }
  window.review = { apis, frames, setup, state, wait, compare, difference, measure, stopReplay };
  window.runWebGLChecks = () => checks(window.review);
  document.querySelector('#source').addEventListener('change', async (event) => { await setup(event.target.value); compare(); status.textContent = 'Ready'; });
  for (const button of document.querySelectorAll('[data-state]')) button.addEventListener('click', async () => { stopReplay(); state(button.dataset.state); await wait(80); compare(); });
  document.querySelector('#replay').onclick = async () => { await measure(1200, true); state('settled'); await wait(80); compare(); };
  document.querySelector('#measure').onclick = () => measure();
  document.querySelector('#compare').onclick = compare;
  document.querySelector('#start').onclick = () => apis.forEach((api) => api.renderer.start());
  document.querySelector('#stop').onclick = () => { stopReplay(); apis.forEach((api) => api.renderer.stop()); };
  document.querySelector('#play').onclick = async () => { if (apis[0].info().kind === 'video') await Promise.all(apis.map((api) => api.source.play())); };
  document.querySelector('#pause').onclick = async () => { if (apis[0].info().kind !== 'video') return; apis.forEach((api) => api.source.pause()); await Promise.all(apis.map((api) => api.seek(0.5))); await wait(100); compare(); };
  document.querySelector('#blend').oninput = (event) => { document.querySelector('#overlay').style.setProperty('--blend', event.target.value); };
  document.querySelector('#check').onclick = async () => {
    status.textContent = 'Checking…';
    try { const result = await window.runWebGLChecks(); status.textContent = `${result.assertions} assertions passed`; document.querySelector('#measurement').textContent = JSON.stringify(result, null, 2); }
    catch (error) { status.textContent = error.message; throw error; }
  };
  compare();
  window.reviewReady = true;
  status.textContent = 'Ready';
  if (new URLSearchParams(location.search).has('check')) {
    try { window.webglResults = await window.runWebGLChecks(); status.textContent = `${window.webglResults.assertions} assertions passed`; }
    catch (error) { window.webglResults = { error: error.message, stack: error.stack }; status.textContent = error.message; }
  }
}
