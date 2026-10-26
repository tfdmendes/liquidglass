/**
 * glass-webgl.js — the same lens, rendered in WebGL for surfaces an SVG filter cannot bend:
 * a live <video> in Safari (WebKit composites video on the GPU and never hands it to the filter
 * pipeline), or pixels that only exist in a <canvas>.
 *
 * It reuses renderLensMap() from liquid-glass.js, so a lens looks identical on both renderers.
 *
 *   const r = createGlassRenderer(outputCanvas, videoElement);
 *   r.setLenses([{ x: 24, y: 200, width: 56, height: 56, radius: 28 }, …]);
 *   r.start();                   // follow source and lens changes (r.render() draws once)
 *
 * The source is stretched over the whole output canvas, so give the canvas the source's aspect
 * ratio. A cross-origin <video>/<img> needs crossorigin="anonymous" and CORS headers, or WebGL
 * refuses to read it.
 * ImageBitmap sources sleep between changes; canvas and <img> sources stay live because their
 * pixels can change without an event (including animated SVG images)
 */
import { DEFAULTS, renderLensMap } from './liquid-glass.js';

const VERT = `
attribute vec2 aPos;
uniform vec2 uResolution;
varying vec2 vPos;
void main() {
  vPos = aPos;
  vec2 clip = aPos / uResolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

// Positions are in CSS px; mediump cannot address a wide canvas to the pixel, so ask for highp.
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uSource;
uniform sampler2D uMap;
uniform vec2 uCanvas;
uniform vec4 uLens;
uniform vec3 uScale;
varying vec2 vPos;
vec4 src(vec2 p) { return texture2D(uSource, clamp(p / uCanvas, 0.0, 1.0)); }
void main() {
  if (uLens.z <= 0.0) { gl_FragColor = src(vPos); return; }
  vec4 map = texture2D(uMap, (vPos - uLens.xy) / uLens.zw);
  if (map.a <= 0.0) discard;
  vec2 bend = map.rg - 0.5019608;
  float r = src(vPos + bend * uScale.r).r;
  float g = src(vPos + bend * uScale.g).g;
  float b = src(vPos + bend * uScale.b).b;
  float rim = max(0.0, map.b * 2.0 - 1.0039216);
  vec3 color = min(vec3(1.0), vec3(r, g, b) + rim);
  gl_FragColor = vec4(color * map.a, map.a);
}`;

export function createGlassRenderer(canvas, source, { pixelRatio } = {}) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) throw new Error('WebGL is not available');

  const video = source instanceof HTMLVideoElement;
  const image = source instanceof HTMLImageElement;
  const bitmap = typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap;
  const videoFrames = video && typeof source.requestVideoFrameCallback === 'function';
  let program, loc, buffer, sourceTexture;
  let lenses = [];
  let frame = 0;
  let videoFrame = 0;
  let videoGeneration = 0;
  let running = false;
  let destroyed = false;
  let contextLost = false;
  let visible = true;
  let dirty = true;
  let sourceDirty = true;
  let hasSource = false;
  let cssWidth = 0;
  let cssHeight = 0;
  let resolution;

  function initialize() {
    program = link(gl, VERT, FRAG);
    gl.useProgram(program);
    loc = {
      aPos: gl.getAttribLocation(program, 'aPos'),
      uResolution: gl.getUniformLocation(program, 'uResolution'),
      uCanvas: gl.getUniformLocation(program, 'uCanvas'),
      uLens: gl.getUniformLocation(program, 'uLens'),
      uScale: gl.getUniformLocation(program, 'uScale'),
      uSource: gl.getUniformLocation(program, 'uSource'),
      uMap: gl.getUniformLocation(program, 'uMap'),
    };
    gl.uniform1i(loc.uSource, 0);
    gl.uniform1i(loc.uMap, 1);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    sourceTexture = createTexture(gl);
    hasSource = false;
    for (const lens of lenses) {
      lens.texture = undefined;
      lens.key = undefined;
    }
  }
  initialize();

  function ratio() {
    return pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
  }

  function lensTexture(lens, r) {
    const key = [r, ...['width', 'height', 'radius', 'bezel', 'curvature', 'ior', 'invert', 'specular', 'specularWidth', 'lightAngle']
      .map((k) => lens[k])].join('|');
    if (lens.texture && lens.key === key) return;
    const { canvas: map } = renderLensMap(lens, r);
    lens.texture ??= createTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, lens.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, map);
    lens.key = key;
  }

  function rect(x, y, w, h) {
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x, y, x + w, y, x, y + h, x, y + h, x + w, y, x + w, y + h]), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function sourceReady() {
    if (video) return source.readyState >= 2;
    if (image) return source.complete && source.naturalWidth > 0;
    return source.width !== 0 && source.height !== 0;
  }

  function draw() {
    if (destroyed || contextLost || gl.isContextLost()) return;
    dirty = false;
    const ready = sourceReady();
    if (!ready && !hasSource) return;
    const r = ratio();
    cssWidth = canvas.clientWidth;
    cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return;
    const bw = Math.round(cssWidth * r);
    const bh = Math.round(cssHeight * r);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      attributes.takeRecords();
    }

    gl.viewport(0, 0, bw, bh);
    gl.uniform2f(loc.uResolution, cssWidth, cssHeight);
    gl.uniform2f(loc.uCanvas, cssWidth, cssHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    if (sourceDirty && ready) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      sourceDirty = false;
      hasSource = true;
    }

    gl.disable(gl.BLEND);
    gl.uniform4f(loc.uLens, 0, 0, 0, 0);
    rect(0, 0, cssWidth, cssHeight);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE1);
    for (const lens of lenses) {
      lensTexture(lens, r);
      gl.bindTexture(gl.TEXTURE_2D, lens.texture);
      const bend = 2 * lens.refraction;
      gl.uniform3f(loc.uScale, bend, bend * (1 + lens.chroma / 2), bend * (1 + lens.chroma));
      gl.uniform4f(loc.uLens, lens.x, lens.y, lens.width, lens.height);
      rect(lens.x, lens.y, lens.width, lens.height);
    }
  }

  function active() {
    return running && !destroyed && !contextLost && !document.hidden && visible;
  }

  function continuous() {
    // Canvas and animated SVG pixels can change without sending an event
    return (!video && !bitmap) || (video && !videoFrames && !source.paused && !source.ended && sourceReady());
  }

  function schedule() {
    if (!active()) return;
    if (!frame && (dirty || continuous())) frame = requestAnimationFrame(tick);
    if (videoFrames && !videoFrame) {
      const generation = videoGeneration;
      videoFrame = source.requestVideoFrameCallback(() => {
        if (generation !== videoGeneration) return;
        videoFrame = 0;
        if (!active()) return;
        sourceDirty = dirty = true;
        draw();
        schedule();
      });
    }
  }

  function tick() {
    frame = 0;
    if (!active()) return;
    if (continuous()) sourceDirty = dirty = true;
    if (dirty) draw();
    schedule();
  }

  function invalidate(upload = false) {
    dirty = true;
    sourceDirty ||= upload;
    schedule();
  }

  function cancel() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (videoFrame) source.cancelVideoFrameCallback?.(videoFrame);
    videoFrame = 0;
    videoGeneration++;
  }

  function stop() {
    running = false;
    cancel();
  }

  function render() {
    // A one-off call must also pick up source changes made while stopped
    sourceDirty = dirty = true;
    draw();
    schedule();
  }

  function sourceChanged(event) {
    if (event.type === 'timeupdate' && videoFrames && !source.paused) return;
    invalidate(true);
  }

  function visibilityChanged() {
    if (document.hidden) cancel();
    else invalidate(!image);
  }

  function resized() {
    invalidate();
  }

  function watchResolution() {
    resolution?.removeEventListener('change', resolutionChanged);
    if (pixelRatio == null) {
      resolution = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      resolution.addEventListener('change', resolutionChanged);
    }
  }

  function resolutionChanged() {
    watchResolution();
    invalidate();
  }

  function lost(event) {
    event.preventDefault();
    contextLost = true;
    cancel();
  }

  function restored() {
    if (destroyed) return;
    contextLost = false;
    initialize();
    invalidate(true);
  }

  const size = new ResizeObserver(resized);
  size.observe(canvas);
  const attributes = new MutationObserver(resized);
  attributes.observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] });
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    const next = entries[entries.length - 1].isIntersecting;
    if (next === visible) return;
    visible = next;
    if (visible) invalidate(!image);
    else cancel();
  }) : null;
  intersection?.observe(canvas);
  const sourceEvents = video
    ? ['loadeddata', 'loadedmetadata', 'canplay', 'play', 'playing', 'pause', 'ended', 'seeking', 'seeked', 'timeupdate', 'emptied', 'resize', 'error']
    : image ? ['load', 'error'] : [];
  for (const event of sourceEvents) source.addEventListener(event, sourceChanged);
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('resize', resized);
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  watchResolution();

  return {
    /** Replace all lenses. Each lens takes the same options as createGlass (DEFAULTS). */
    setLenses(list) {
      if (destroyed) return;
      const next = list.map((input) => {
        const prev = lenses.find((l) => l.input === input);
        return { ...DEFAULTS, ...input, input, texture: prev?.texture, key: prev?.key };
      });
      for (const old of lenses) if (!list.includes(old.input) && old.texture) gl.deleteTexture(old.texture);
      lenses = next;
      invalidate();
    },
    /** Move or reshape one lens; the map is regenerated only when its shape or optics change. */
    updateLens(index, next) {
      if (destroyed) return;
      const changed = Object.keys(next).some((key) => lenses[index][key] !== next[key]);
      Object.assign(lenses[index], next);
      if (changed) invalidate();
    },
    render,
    start() {
      if (destroyed || running) return;
      running = true;
      invalidate(true);
    },
    stop,
    destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      size.disconnect();
      attributes.disconnect();
      intersection?.disconnect();
      resolution?.removeEventListener('change', resolutionChanged);
      for (const event of sourceEvents) source.removeEventListener(event, sourceChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('resize', resized);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      for (const lens of lenses) if (lens.texture) gl.deleteTexture(lens.texture);
      gl.deleteTexture(sourceTexture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}

function createTexture(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}

function link(gl, vs, fs) {
  const program = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}
