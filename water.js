/* ==========================================================
   Water background
   Top-down view of a still pool. Drops land at random, and each
   sends out a ring of waves that fades as it spreads. Rendered
   per-pixel in a WebGL fragment shader, so it stays sharp at any
   resolution. Click or move the mouse to add your own drops.
   ========================================================== */
(() => {
  'use strict';

  const canvas = document.getElementById('water');
  if (!canvas) return;

  const MAX_DROPS = 10;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance'
  });
  if (!gl) { canvas.hidden = true; return; }

  /* ---------- Shaders ---------- */
  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const FRAG = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    uniform vec2  uRes;
    uniform float uTime;
    uniform vec3  uBg;
    uniform vec3  uTint;
    uniform float uLight;
    uniform vec3  uDrops[${MAX_DROPS}];   // x, y, start time

    const float SPEED = 0.088;   // wave front speed (screen heights per second)
    const float FREQ  = 150.0;   // wave number at the front
    const float CHIRP = 62.0;    // waves behind the front get shorter, like real capillary ripples
    const float HS    = 0.0021;  // surface height scale

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Surface: returns (height, slope.x, slope.y, curvature), summed over every live drop
    vec4 surface(vec2 p) {
      float h = 0.0;
      vec2  g = vec2(0.0);
      float lap = 0.0;

      for (int i = 0; i < ${MAX_DROPS}; i++) {
        vec3 d = uDrops[i];
        float t = uTime - d.z;
        if (t > 0.0 && t < 14.0) {
          vec2  v = p - d.xy;
          float r = length(v) + 1e-4;
          vec2  dir = v / r;
          float amp = 0.65 + 0.7 * hash(d.xy * 37.0 + d.z);

          // Wave packet travelling outward: sharp leading edge, long decaying tail
          float x = r - (SPEED * t + 0.006);
          if (x < 0.02 && x > -0.95) {
            float behind = max(-x, 0.0);
            float front  = smoothstep(0.02, -0.012, x);
            float env    = exp(-behind * 3.2) * front;
            float life   = exp(-t * 0.26) * (1.0 - smoothstep(10.0, 14.0, t));
            float spread = 1.0 / sqrt(0.25 + r * 7.0);
            float a      = amp * env * life * spread;

            float k     = FREQ - 2.0 * CHIRP * x;
            float phase = FREQ * x - CHIRP * x * x;
            float s = sin(phase), c = cos(phase);

            h   += a * s * HS;
            g   += dir * (a * k * c * HS);
            lap += -a * k * k * s * HS;
          }

          // Splash crown: a tight raised ring right after impact
          float u  = (r - 0.010 - 0.06 * t) / 0.0075;
          float cr = exp(-u * u) * exp(-t * 4.2) * amp;
          h += cr * 0.0016;
          g += dir * (-2.0 * u / 0.0075 * cr * 0.0016);
        }
      }

      // A faint, slow swell so the water is never perfectly flat
      float w = uTime * 0.32;
      vec2 k1 = vec2( 3.1,  1.7), k2 = vec2(-2.3,  3.9), k3 = vec2(5.2, -1.1);
      g += k1 * (0.0060 * cos(dot(k1, p) + w))
         + k2 * (0.0050 * cos(dot(k2, p) - w * 1.3))
         + k3 * (0.0035 * cos(dot(k3, p) + w * 0.8));

      return vec4(h, g, lap);
    }

    // Light on the pool floor, focused by the surface (animated caustic web)
    float caustic(vec2 p, float t) {
      vec2 q = p * 4.2;
      vec2 i = q;
      float c = 1.0;
      for (int n = 0; n < 4; n++) {
        float tt = t * (1.0 - 3.5 / float(n + 1));
        i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / max(length(vec2(q.x / (sin(i.x + tt) / 0.005), q.y / (cos(i.y + tt) / 0.005))), 1e-3);
      }
      c = 1.17 - pow(c / 4.0, 1.4);
      return clamp(pow(abs(c), 8.0), 0.0, 1.0);
    }

    void main() {
      vec2 frag = gl_FragCoord.xy;
      vec2 uv   = frag / uRes;
      vec2 p    = (frag - 0.5 * uRes) / uRes.y;

      vec4  s   = surface(p);
      vec2  g   = s.yz;
      float lap = s.w;

      vec3 n = normalize(vec3(-g, 1.0));
      vec3 V = vec3(0.0, 0.0, 1.0);
      vec3 L = normalize(vec3(-0.45, 0.55, 0.70));
      vec3 R = reflect(-V, n);

      // Highlights: a sharp sun glint plus a broad soft sheen
      float rl    = max(dot(R, L), 0.0);
      float glint = pow(rl, 260.0);
      float sheen = pow(rl, 14.0);
      float slope = smoothstep(0.0, 0.5, length(g));   // steeper water reflects more

      // What the ripples do to the light on the floor: concave patches focus it
      float focus = clamp(-lap * 0.010, -1.0, 1.0);
      float cst   = caustic(p + g * 1.6, uTime * 0.16 + 23.0);

      float glow = smoothstep(1.15, 0.0, distance(uv, vec2(0.5, 1.05)));
      float vig  = mix(0.86, 1.0, smoothstep(1.3, 0.35, length(uv - 0.5) * 1.3));

      vec3 col;
      if (uLight < 0.5) {
        vec3 deep = uBg * 0.82;
        col  = deep;
        col += uTint * 0.030 * glow;                                  // light falling from above
        col += uTint * cst * (0.045 + 0.040 * glow);                  // caustics on the floor
        col += uTint * max(focus, 0.0) * 0.20;                        // focused light under crests
        col -= deep  * max(-focus, 0.0) * 0.30;                       // shadow where light spreads
        col += uTint * (dot(n, L) - L.z) * 0.55;                      // soft ripple shading
        col += mix(uTint, vec3(1.0), 0.65) * (sheen * slope * 0.09 + glint * 0.70);
        col *= vig;
      } else {
        vec3 water = mix(uBg, uTint * 0.85 + 0.15, 0.05 + 0.04 * glow);
        col  = water;
        col -= (1.0 - uTint) * cst * 0.030;
        col -= (1.0 - uTint) * max(focus, 0.0) * 0.06;
        col += vec3(max(-focus, 0.0)) * 0.015;
        col -= (1.0 - uTint) * max(L.z - dot(n, L), 0.0) * 0.55;
        col += vec3(sheen * slope * 0.035 + glint * 0.22);
        col *= mix(0.97, 1.0, vig);
      }

      // Fine noise so the soft gradients never band
      col += (hash(frag + fract(uTime) * 91.7) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  /* ---------- State ---------- */
  const drops = new Float32Array(MAX_DROPS * 3);
  for (let i = 0; i < MAX_DROPS; i++) drops[i * 3 + 2] = -1000;
  let head = 0;

  let program = null;
  let loc = {};
  let rafId = 0;
  let quality = 1;
  let staticMode = reduceMotion.matches;
  const startedAt = performance.now();
  const bg = [0.06, 0.08, 0.1];
  const tint = [0.49, 0.72, 1];
  let isLight = 0;

  const now = () => (performance.now() - startedAt) / 1000;

  /* ---------- GL setup ---------- */
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Water shader error:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function setup() {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Water program error:', gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    // One triangle that covers the whole screen
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    ['uRes', 'uTime', 'uBg', 'uTint', 'uLight', 'uDrops'].forEach(name => {
      loc[name] = gl.getUniformLocation(program, name);
    });
    return true;
  }

  /* ---------- Theme colours (read from the CSS tokens) ---------- */
  function hexToRgb(hex) {
    let h = hex.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    if (Number.isNaN(n) || h.length !== 6) return null;
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  function readTheme() {
    const css = getComputedStyle(document.documentElement);
    const b = hexToRgb(css.getPropertyValue('--bg'));
    const a = hexToRgb(css.getPropertyValue('--accent'));
    if (b) { bg[0] = b[0]; bg[1] = b[1]; bg[2] = b[2]; }
    if (a) { tint[0] = a[0]; tint[1] = a[1]; tint[2] = a[2]; }
    isLight = document.documentElement.dataset.theme === 'light' ? 1 : 0;
  }

  /* ---------- Sizing ---------- */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  /* ---------- Drops ---------- */
  function addDrop(x, y, start) {
    drops[head * 3] = x;
    drops[head * 3 + 1] = y;
    drops[head * 3 + 2] = start;
    head = (head + 1) % MAX_DROPS;
  }

  function randomDrop(start) {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    addDrop((Math.random() - 0.5) * aspect * 1.05, (Math.random() - 0.5) * 1.05, start);
  }

  function dropAtPointer(clientX, clientY) {
    const h = Math.max(1, canvas.clientHeight);
    addDrop((clientX - canvas.clientWidth / 2) / h, -(clientY - h / 2) / h, now());
  }

  // Start with rings already spreading so the page never opens on flat water
  function seed(base, ages) {
    ages.forEach(age => randomDrop(base - age));
  }

  /* ---------- Drawing ---------- */
  function draw(time) {
    gl.uniform2f(loc.uRes, canvas.width, canvas.height);
    gl.uniform1f(loc.uTime, time);
    gl.uniform3fv(loc.uBg, bg);
    gl.uniform3fv(loc.uTint, tint);
    gl.uniform1f(loc.uLight, isLight);
    gl.uniform3fv(loc.uDrops, drops);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let nextDrop = 0;
  let frames = 0;
  let last = 0;
  let acc = 0;

  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    const t = now();

    if (t >= nextDrop) {
      randomDrop(t);
      nextDrop = t + 0.9 + Math.random() * 1.1;
    }

    // If frames are slow, quietly lower the render resolution
    if (last) {
      acc += ts - last;
      if (++frames === 60) {
        if (acc / frames > 26 && quality > 0.55) { quality *= 0.8; resize(); }
        frames = 0;
        acc = 0;
      }
    }
    last = ts;

    draw(t);
  }

  function start() {
    cancelAnimationFrame(rafId);
    readTheme();
    resize();
    if (staticMode) {
      // One calm still frame: several rings caught mid-spread
      for (let i = 0; i < MAX_DROPS; i++) drops[i * 3 + 2] = -1000;
      head = 0;
      seed(6, [5.4, 4.3, 3.2, 2.1, 1.0, 0.4]);
      draw(6);
      return;
    }
    seed(now(), [6.5, 4.6, 3.1, 1.6, 0.5]);
    nextDrop = now() + 0.6;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }

  /* ---------- Wire up ---------- */
  if (!setup()) { canvas.hidden = true; return; }
  start();

  new ResizeObserver(() => {
    resize();
    if (staticMode) draw(6);
  }).observe(canvas);

  new MutationObserver(() => {
    readTheme();
    if (staticMode) draw(6);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  reduceMotion.addEventListener('change', e => {
    staticMode = e.matches;
    start();
  });

  window.addEventListener('pointerdown', e => {
    if (staticMode || e.button > 0) return;
    dropAtPointer(e.clientX, e.clientY);
  }, { passive: true });

  let lastMove = 0, lx = -999, ly = -999;
  window.addEventListener('pointermove', e => {
    if (staticMode || e.pointerType !== 'mouse') return;
    const t = performance.now();
    if (t - lastMove < 450 || Math.hypot(e.clientX - lx, e.clientY - ly) < 70) return;
    lastMove = t; lx = e.clientX; ly = e.clientY;
    dropAtPointer(e.clientX, e.clientY);
  }, { passive: true });

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    cancelAnimationFrame(rafId);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    loc = {};
    if (setup()) start();
  });
})();