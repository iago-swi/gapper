window.Gapper = window.Gapper || {};

(function (G) {
  'use strict';

  const VERT_SRC = `#version 300 es
  in vec2 aPos;
  out vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }`;

  // Pass 1: Extract glowing neon regions with saturation boost
  const BRIGHT_FRAG = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uScene;
  out vec4 fragColor;

  void main() {
    vec4 c = texture(uScene, vUv);
    vec3 rgb = c.rgb * c.a;
    float mx = max(rgb.r, max(rgb.g, rgb.b));
    float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float energy = max(mx, lum);
    float mask = smoothstep(0.28, 0.88, energy);
    // Boost vivid neon hues slightly so colored rails radiate beautifully
    float sat = mx - min(rgb.r, min(rgb.g, rgb.b));
    vec3 bloom = rgb * mask * (1.05 + sat * 0.65);
    fragColor = vec4(bloom, 1.0);
  }`;

  // Pass 2 & 3: Separable 9-tap Gaussian Blur
  const BLUR_FRAG = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2 uDir;
  out vec4 fragColor;

  void main() {
    vec3 sum = texture(uTex, vUv).rgb * 0.227027;
    sum += texture(uTex, vUv + uDir * 1.384615).rgb * 0.316216;
    sum += texture(uTex, vUv - uDir * 1.384615).rgb * 0.316216;
    sum += texture(uTex, vUv + uDir * 3.230769).rgb * 0.070270;
    sum += texture(uTex, vUv - uDir * 3.230769).rgb * 0.070270;
    fragColor = vec4(sum, 1.0);
  }`;

  // Pass 4: Final Composite + Procedural Abyssal Aurora Nebula + Perspective Grid + Shockwaves + ACES
  const COMPOSITE_FRAG = `#version 300 es
  precision highp float;
  in vec2 vUv;

  uniform sampler2D uScene;
  uniform sampler2D uBloomTight;
  uniform sampler2D uBloomWide;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uChroma;
  uniform float uOverdrive;
  uniform float uProgress;
  uniform vec2 uPlayerUv;
  uniform vec3 uNebulaA;
  uniform vec3 uNebulaB;
  uniform vec3 uNebulaAccent;
  uniform vec4 uShock0;
  uniform vec4 uShock1;
  uniform vec4 uShock2;
  uniform vec4 uShock3;

  out vec4 fragColor;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.02 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  vec3 acesFilm(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  vec2 applyShock(vec2 uv, vec4 sh, float aspect, inout float ringGlow) {
    if (sh.w <= 0.001) return uv;
    vec2 d = uv - sh.xy;
    vec2 da = vec2(d.x * aspect, d.y);
    float dist = length(da);
    float diff = dist - sh.z;
    float band = exp(-diff * diff * 260.0);
    float strength = sh.w * band;
    vec2 dir = dist > 0.0001 ? (da / dist) : vec2(0.0);
    ringGlow += strength * 0.45;
    return uv - vec2(dir.x / aspect, dir.y) * strength * 0.026;
  }

  // Deep animated abyssal aurora & architectural starfield void
  vec3 renderVoidBackground(vec2 uv, float aspect) {
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 parallax = (uPlayerUv - 0.5) * 0.06;

    // Domain-warped nebula clouds
    vec2 q = p * 1.45 - parallax * 1.4;
    float t = uTime * 0.11;
    float f1 = fbm(q + vec2(t, -t * 0.7));
    float f2 = fbm(q * 1.6 + vec2(f1 * 1.8 - t * 0.9, f1 * 1.2 + t * 0.5));
    float ribbon = smoothstep(0.28, 0.82, f2);

    vec3 colA = mix(uNebulaA, vec3(0.06, 0.22, 0.34), uOverdrive * 0.65);
    vec3 colB = mix(uNebulaB, vec3(0.32, 0.22, 0.04), uOverdrive * 0.75);
    vec3 accent = mix(uNebulaAccent, vec3(1.0, 0.84, 0.32), uOverdrive * 0.75);

    vec3 bg = vec3(0.012, 0.018, 0.038);
    bg += colA * (0.55 + 0.9 * f1);
    bg += colB * ribbon * 0.95;

    // Luminous diagonal aurora veil
    float wave = sin(p.x * 2.4 + p.y * 1.5 + f1 * 3.8 - uTime * 0.38) * 0.5 + 0.5;
    float veil = pow(wave, 4.0) * smoothstep(0.95, 0.1, length(p * vec2(0.75, 1.0)));
    bg += accent * veil * (0.14 + uProgress * 0.10 + uOverdrive * 0.14);

    // Subtle deep perspective architectural grid underneath the floating monolith
    vec2 gp = p - parallax * 1.8;
    float depth = max(0.32, 1.18 - gp.y * 0.55);
    vec2 gridUv = vec2(gp.x / depth, 1.0 / depth + uTime * 0.06) * 5.2;
    vec2 gv = abs(fract(gridUv - 0.5) - 0.5) / max(fwidth(gridUv), vec2(0.002));
    float line = 1.0 - min(min(gv.x, gv.y), 1.0);
    float gridFade = smoothstep(1.25, 0.15, length(p)) * 0.14 * (1.0 - smoothstep(-0.35, 0.45, gp.y) * 0.45);
    bg += accent * line * gridFade;

    // Soft distant starlight / bokeh dust
    vec2 starCell = floor((p - parallax * 0.7) * 26.0);
    vec2 starFrac = fract((p - parallax * 0.7) * 26.0) - 0.5;
    float rnd = hash21(starCell);
    if (rnd > 0.86) {
      vec2 offset = vec2(hash21(starCell + 7.1), hash21(starCell + 19.3)) - 0.5;
      float d = length(starFrac - offset * 0.55);
      float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + rnd * 3.0) + rnd * 62.8);
      float glow = smoothstep(0.11, 0.0, d) * twinkle * 0.42;
      bg += mix(vec3(0.7, 0.9, 1.0), accent, 0.45) * glow;
    }

    // Soft radial aura behind the board center
    float centerGlow = exp(-dot(p * vec2(0.95, 1.25), p * vec2(0.95, 1.25)) * 2.2);
    bg += accent * centerGlow * (0.07 + uProgress * 0.08 + uOverdrive * 0.10);

    return bg;
  }

  void main() {
    float aspect = uResolution.x / max(1.0, uResolution.y);
    float ringGlow = 0.0;

    vec2 uv = vUv;
    uv = applyShock(uv, uShock0, aspect, ringGlow);
    uv = applyShock(uv, uShock1, aspect, ringGlow);
    uv = applyShock(uv, uShock2, aspect, ringGlow);
    uv = applyShock(uv, uShock3, aspect, ringGlow);

    vec3 bg = renderVoidBackground(uv, aspect);

    // Chromatic aberration offset (subtle ambient + punchy impact spikes)
    vec2 fromCenter = uv - 0.5;
    float chromaAmt = (0.00055 + uChroma * 0.0085);
    vec2 chromaVec = fromCenter * chromaAmt;

    vec4 sceneCenter = texture(uScene, uv);
    float sR = texture(uScene, clamp(uv + chromaVec, 0.001, 0.999)).r;
    float sG = sceneCenter.g;
    float sB = texture(uScene, clamp(uv - chromaVec, 0.001, 0.999)).b;
    vec3 sceneRgb = vec3(sR, sG, sB);

    vec3 bloomTight = texture(uBloomTight, uv).rgb;
    vec3 bloomWide = texture(uBloomWide, uv).rgb;

    // Slight horizontal anamorphic shimmer from wide bloom
    vec3 streak = (
      texture(uBloomWide, clamp(uv + vec2(0.016, 0.0), 0.001, 0.999)).rgb +
      texture(uBloomWide, clamp(uv - vec2(0.016, 0.0), 0.001, 0.999)).rgb
    ) * 0.16;

    // Alpha-composite scene over nebula background, then add lush bloom
    vec3 color = mix(bg, sceneRgb, sceneCenter.a);
    color += bloomTight * 0.62;
    color += bloomWide * 0.58 + streak;

    // Subtle glowing shockwave edge highlight
    color += mix(uNebulaAccent, vec3(1.0, 0.92, 0.65), 0.45) * ringGlow * 0.55;

    // Filmic tone mapping for hot-white neon cores without harsh clipping
    color = acesFilm(color * 1.14);

    // Smooth cinema vignette
    float vig = smoothstep(1.22, 0.34, length((vUv - 0.5) * vec2(1.18, 1.05)));
    color *= mix(0.68, 1.0, vig);

    // Micro film-grain dither (eliminates gradient banding)
    float grain = (hash21(gl_FragCoord.xy + fract(uTime * 17.13) * 100.0) - 0.5) * 0.014;
    color = clamp(color + grain, 0.0, 1.0);

    fragColor = vec4(color, 1.0);
  }`;

  class PostFXRenderer {
    constructor(displayCanvas) {
      this.canvas = displayCanvas;
      this.sceneCanvas = document.createElement('canvas');
      this.sceneCtx = this.sceneCanvas.getContext('2d', { alpha: true });

      this.gl = null;
      this.fallbackCtx = null;
      this.ready = false;
      this.width = 1;
      this.height = 1;

      this.programs = {};
      this.vao = null;
      this.sceneTex = null;
      this.fbos = {};

      this._initGL();
    }

    _initGL() {
      const gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance'
      });

      if (!gl) {
        this.fallbackCtx = this.canvas.getContext('2d');
        return;
      }

      try {
        this.gl = gl;
        this.programs.bright = this._createProgram(VERT_SRC, BRIGHT_FRAG);
        this.programs.blur = this._createProgram(VERT_SRC, BLUR_FRAG);
        this.programs.composite = this._createProgram(VERT_SRC, COMPOSITE_FRAG);

        // Fullscreen quad VAO
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this.vao = vao;

        // Scene upload texture
        this.sceneTex = this._createTexture(2, 2);
        this.ready = true;
      } catch (err) {
        console.warn('WebGL2 post-FX fallback:', err);
        this.gl = null;
        this.ready = false;
        this.fallbackCtx = this.canvas.getContext('2d');
      }
    }

    _compileShader(type, src) {
      const gl = this.gl;
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('Shader compile error: ' + log);
      }
      return sh;
    }

    _createProgram(vsSrc, fsSrc) {
      const gl = this.gl;
      const vs = this._compileShader(gl.VERTEX_SHADER, vsSrc);
      const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSrc);
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
      }
      const uniforms = {};
      const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(prog, i);
        if (info) uniforms[info.name] = gl.getUniformLocation(prog, info.name);
      }
      return { prog, u: uniforms };
    }

    _createTexture(w, h) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return tex;
    }

    _createFBO(w, h) {
      const gl = this.gl;
      const tex = this._createTexture(w, h);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo, tex, w, h };
    }

    _destroyFBO(entry) {
      if (!entry || !this.gl) return;
      this.gl.deleteFramebuffer(entry.fbo);
      this.gl.deleteTexture(entry.tex);
    }

    resize(cssWidth, cssHeight, dpr) {
      const w = Math.max(2, Math.floor(cssWidth * dpr));
      const h = Math.max(2, Math.floor(cssHeight * dpr));
      if (w === this.width && h === this.height) return;

      this.width = w;
      this.height = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.sceneCanvas.width = w;
      this.sceneCanvas.height = h;

      if (!this.ready) return;

      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      Object.values(this.fbos).forEach((f) => this._destroyFBO(f));

      const hw = Math.max(2, Math.floor(w * 0.5));
      const hh = Math.max(2, Math.floor(h * 0.5));
      const qw = Math.max(2, Math.floor(w * 0.25));
      const qh = Math.max(2, Math.floor(h * 0.25));

      this.fbos.halfA = this._createFBO(hw, hh);
      this.fbos.halfB = this._createFBO(hw, hh);
      this.fbos.quarterA = this._createFBO(qw, qh);
      this.fbos.quarterB = this._createFBO(qw, qh);
    }

    getSceneContext() {
      return this.sceneCtx;
    }

    present(fxState) {
      if (!this.ready) {
        // Graceful 2D fallback
        const ctx = this.fallbackCtx;
        if (!ctx) return;
        const grad = ctx.createRadialGradient(
          this.width * 0.5, this.height * 0.5, 40,
          this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.7
        );
        grad.addColorStop(0, '#0d1b36');
        grad.addColorStop(1, '#03050c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.drawImage(this.sceneCanvas, 0, 0);
        return;
      }

      const gl = this.gl;
      gl.bindVertexArray(this.vao);

      // Upload 2D scene canvas into WebGL2 texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.sceneCanvas);

      // Pass 1: Bright pass -> halfA
      const bright = this.programs.bright;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.halfA.fbo);
      gl.viewport(0, 0, this.fbos.halfA.w, this.fbos.halfA.h);
      gl.useProgram(bright.prog);
      gl.uniform1i(bright.u.uScene, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 2: Tight Gaussian Blur (H then V) on half-res
      const blur = this.programs.blur;
      gl.useProgram(blur.prog);
      gl.uniform1i(blur.u.uTex, 0);

      // halfA -> halfB (Horizontal, slightly wider for cinema glow)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.halfB.fbo);
      gl.viewport(0, 0, this.fbos.halfB.w, this.fbos.halfB.h);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.halfA.tex);
      gl.uniform2f(blur.u.uDir, 1.45 / this.fbos.halfB.w, 0.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // halfB -> halfA (Vertical)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.halfA.fbo);
      gl.viewport(0, 0, this.fbos.halfA.w, this.fbos.halfA.h);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.halfB.tex);
      gl.uniform2f(blur.u.uDir, 0.0, 1.25 / this.fbos.halfA.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 3: Wide Atmospheric Blur on quarter-res (2 iterations)
      // halfA -> quarterB (H)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.quarterB.fbo);
      gl.viewport(0, 0, this.fbos.quarterB.w, this.fbos.quarterB.h);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.halfA.tex);
      gl.uniform2f(blur.u.uDir, 2.2 / this.fbos.quarterB.w, 0.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // quarterB -> quarterA (V)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.quarterA.fbo);
      gl.viewport(0, 0, this.fbos.quarterA.w, this.fbos.quarterA.h);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.quarterB.tex);
      gl.uniform2f(blur.u.uDir, 0.0, 2.0 / this.fbos.quarterA.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Second wide pass for lush dreamy halo
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.quarterB.fbo);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.quarterA.tex);
      gl.uniform2f(blur.u.uDir, 2.8 / this.fbos.quarterB.w, 0.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.quarterA.fbo);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.quarterB.tex);
      gl.uniform2f(blur.u.uDir, 0.0, 2.4 / this.fbos.quarterA.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 4: Final Screen Composite
      const comp = this.programs.composite;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      gl.useProgram(comp.prog);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(comp.u.uScene, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.halfA.tex);
      gl.uniform1i(comp.u.uBloomTight, 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos.quarterA.tex);
      gl.uniform1i(comp.u.uBloomWide, 2);

      gl.uniform2f(comp.u.uResolution, this.width, this.height);
      gl.uniform1f(comp.u.uTime, fxState.time);
      gl.uniform1f(comp.u.uChroma, fxState.chroma);
      gl.uniform1f(comp.u.uOverdrive, fxState.overdrive);
      gl.uniform1f(comp.u.uProgress, fxState.progress);
      gl.uniform2f(comp.u.uPlayerUv, fxState.playerUvX, 1.0 - fxState.playerUvY);

      const pal = fxState.palette;
      gl.uniform3fv(comp.u.uNebulaA, pal.nebulaA);
      gl.uniform3fv(comp.u.uNebulaB, pal.nebulaB);
      gl.uniform3fv(comp.u.uNebulaAccent, pal.nebulaAccent);

      const sh = fxState.shockwaves;
      for (let i = 0; i < 4; i++) {
        const s = sh[i];
        const loc = comp.u['uShock' + i];
        if (s) {
          gl.uniform4f(loc, s.uvX, 1.0 - s.uvY, s.radius, s.strength);
        } else {
          gl.uniform4f(loc, 0.5, 0.5, 0.0, 0.0);
        }
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }
  }

  G.PostFXRenderer = PostFXRenderer;
})(window.Gapper);
