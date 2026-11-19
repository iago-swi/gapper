'use strict';
/* Lightloom renderer: hand-written WebGL2, no dependencies.
   Pipeline: MSAA HDR scene -> resolve -> dual-Kawase bloom -> composite
   (shockwaves, chromatic aberration, ACES tonemap, vignette, grain). */

const M4 = {
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  },
  look(e, c, u) {
    let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2];
    let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
    let rx = fy * u[2] - fz * u[1], ry = fz * u[0] - fx * u[2], rz = fx * u[1] - fy * u[0];
    l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    const o = new Float32Array(16);
    o[0] = rx; o[1] = ux; o[2] = -fx; o[4] = ry; o[5] = uy; o[6] = -fy; o[8] = rz; o[9] = uz; o[10] = -fz;
    o[12] = -(rx * e[0] + ry * e[1] + rz * e[2]);
    o[13] = -(ux * e[0] + uy * e[1] + uz * e[2]);
    o[14] = (fx * e[0] + fy * e[1] + fz * e[2]);
    o[15] = 1;
    return { m: o, r: [rx, ry, rz], u: [ux, uy, uz], f: [fx, fy, fz] };
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
};

const GFX = (function () {
  const canvas = document.getElementById('gl');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) return null;

  let hdr = !!gl.getExtension('EXT_color_buffer_float');
  const FOV = 36 * Math.PI / 180;
  const BOX_F = 14, BILL_F = 13, MAX_BOX = 1200, MAX_BILL = 6000, MIPS = 6;

  /* ------------------------------------------------------------ shaders */
  const SKY = `
uniform vec3 uSkyA, uSkyB;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x), mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; mat2 R=mat2(.8,-.6,.6,.8);
  for(int i=0;i<6;i++){ s+=a*vnoise(p); p=R*p*2.02+vec2(17.1,9.2); a*=.5; } return s; }
float starLayer(vec2 p, float t){ vec2 id=floor(p), f=fract(p)-.5; float h=h21(id);
  vec2 o=(vec2(h21(id+7.3),h21(id+13.7))-.5)*.7; float d=length(f-o);
  return smoothstep(.03+.035*h,0.,d)*step(.8,h)*(.5+.5*sin(t*(1.+h*3.)+h*90.)); }
vec3 sky(vec3 d, float t){
  vec2 p=d.xz/(abs(d.y)+.45)*1.25;
  vec2 q=p+vec2(t*.012,-t*.008);
  float n1=fbm(q*1.3);
  float n2=fbm(q*2.1+n1*2.+3.1);
  float n3=fbm(q*1.1-n2*1.5+9.4);
  float m2=smoothstep(.36,.86,n2), m3=smoothstep(.40,.90,n3);
  vec3 c=vec3(.003,.004,.010);
  c+=uSkyA*m2*m2*.20;
  c+=uSkyB*m3*m3*.18;
  c+=(uSkyA+uSkyB)*pow(m2*m3,1.5)*.55;
  c+=vec3(.75,.85,1.)*(starLayer(p*22.,t)*.9+.5*starLayer(p*47.+5.,t));
  return c;
}`;

  const VS_FULL = `#version 300 es
out vec2 vUv;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;

  const FS_SKY = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec3 uR,uU,uF; uniform vec2 uProj; uniform float uTime;
${SKY}
void main(){ vec2 n=vUv*2.-1.; vec3 d=normalize(uF+uR*n.x*uProj.x+uU*n.y*uProj.y); o=vec4(sky(d,uTime),1.); }`;

  const VS_BOX = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 iCenter;
layout(location=3) in vec3 iScale;
layout(location=4) in vec4 iColor;
layout(location=5) in vec4 iParam;
uniform mat4 uVP;
out vec3 vLocal, vN, vWorld, vScale; out vec4 vColor, vParam;
void main(){ vec3 w=iCenter+aPos*iScale; vLocal=aPos; vN=aNormal; vWorld=w; vScale=iScale; vColor=iColor; vParam=iParam; gl_Position=uVP*vec4(w,1.); }`;

  const FS_BOX = `#version 300 es
precision highp float;
in vec3 vLocal, vN, vWorld, vScale; in vec4 vColor, vParam;
uniform vec3 uCam, uTrace; uniform float uTime; uniform vec2 uDims; uniform sampler2D uLight;
out vec4 o;
${SKY}
vec3 spill(vec2 bc){
  vec3 s=vec3(0.);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 uv=(bc+vec2(float(x),float(y))*.75)/uDims; vec2 c=clamp(uv,0.,1.);
    float outside=length((uv-c)*uDims);
    s+=texture(uLight,c).rgb*exp(-outside*2.2);
  }
  return s/9.;
}
void main(){
  int kind=int(vParam.x+.5);
  vec3 V=normalize(uCam-vWorld);
  vec3 N=normalize(vN);
  float fres=pow(1.-max(dot(N,V),0.),4.);
  bool topFace=N.y>.5;
  vec3 col;
  if(kind==0){                       // thread (rail)
    float lit=vParam.y, flash=vParam.z;
    float top=topFace?1.:.5;
    vec3 dim=vec3(.05,.062,.10)*top*1.25+fres*.05;
    float along=vWorld.x+vWorld.z;
    float pulse=.82+.18*sin(along*2.4-uTime*3.2);
    vec3 sc=mix(vColor.rgb,vColor.rgb*vColor.rgb,.65);
    vec3 hot=sc*(1.7*pulse*top+flash*5.)+vec3(1.)*flash*1.2;
    col=mix(dim,hot,lit);
  } else if(kind==1){                // lit square
    float glow=vParam.y, flash=vParam.z;
    if(topFace){
      vec2 q=abs(vLocal.xz)*2.;
      float e=max(q.x,q.y);
      float rim=smoothstep(.80,.97,e);
      float inner=smoothstep(.66,.63,e)*smoothstep(.55,.58,e);
      float sheen=pow(max(0.,sin((vWorld.x+vWorld.z)*1.1-uTime*1.4)),14.);
      float weave=.5+.5*sin(vLocal.x*38.)*sin(vLocal.z*38.);
      vec3 deep=vColor.rgb*vColor.rgb*1.35;
      col=deep*(.30+.45*(1.-e)+weave*.10)+vColor.rgb*(rim*2.0+inner*.6+sheen*.8);
      col+=sky(reflect(-V,N),uTime)*(.3+fres*4.);
    } else {
      float h=vLocal.y+.5;
      col=mix(vColor.rgb*vColor.rgb,vColor.rgb,h)*(.10+1.2*h*h);
    }
    col=col*glow+(vColor.rgb*3.+1.)*flash;
  } else if(kind==2){                // knot (node)
    float lit=vParam.y;
    vec3 sc=mix(vColor.rgb,vColor.rgb*vColor.rgb,.5);
    col=mix(vec3(.055,.068,.11)*(topFace?1.5:.7), sc*(topFace?2.4:1.2)+vec3(.25)*float(topFace), lit);
  } else {                           // slab
    vec3 base=vec3(.010,.013,.024);
    if(topFace){
      vec2 bc=vWorld.xz+uDims*.5;
      vec2 ins=step(vec2(0.),bc)*step(bc,uDims); float in_=ins.x*ins.y;
      vec2 f=fract(bc)-.5; float e=max(abs(f.x),abs(f.y))*2.;
      vec4 lm=texture(uLight,(floor(clamp(bc,vec2(0.),uDims-.001))+.5)/uDims);
      float sides=lm.a;
      float dotc=smoothstep(.055,.03,length(f));
      col=base;
      vec2 g=abs(fract(bc*4.)-.5); float fine=smoothstep(.46,.5,max(g.x,g.y));
      col+=vec3(.02,.026,.045)*fine*.5*in_;
      col+=in_*uTrace*(dotc*.22+sides*sides*.16*(.75+.25*sin(uTime*4.))*smoothstep(1.,.15,e));
      col+=spill(bc)*.45;
      col+=sky(reflect(-V,N),uTime)*(.3+fres*3.);
      vec2 d2=(.5-abs(vLocal.xz))*vScale.xz; float edge=min(d2.x,d2.y);
      col+=uTrace*(.9*smoothstep(.05,.0,edge)+.035*smoothstep(.5,.0,edge));
    } else {
      col=base+uTrace*.35*pow(vLocal.y+.5,3.);
    }
  }
  o=vec4(col,1.);
}`;

  const VS_BILL = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec2 iSize;
layout(location=3) in vec4 iColor;
layout(location=4) in vec4 iParam;
uniform mat4 uVP; uniform vec3 uR, uU;
out vec2 vC; out vec4 vColor, vParam; out float vSeed;
void main(){
  bool flat_=iParam.w>.5;
  vec3 r=flat_?vec3(1.,0.,0.):uR; vec3 u=flat_?vec3(0.,0.,-1.):uU;
  vec3 w=iPos+(aCorner.x*r+aCorner.y*u)*iSize.x;
  vC=aCorner; vColor=iColor; vParam=iParam; vSeed=iSize.y;
  gl_Position=uVP*vec4(w,1.);
}`;

  const FS_BILL = `#version 300 es
precision highp float;
in vec2 vC; in vec4 vColor, vParam; in float vSeed;
uniform float uTime;
out vec4 o;
float sdEll(vec2 p, vec2 c, vec2 r, float ang){ vec2 q=p-c; float cs=cos(ang), sn=sin(ang);
  q=vec2(cs*q.x+sn*q.y,-sn*q.x+cs*q.y); return (length(q/r)-1.)*min(r.x,r.y); }
void main(){
  float r=length(vC); int type=int(vParam.x+.5);
  vec3 col=vec3(0.); float a=0.;
  if(type==0){                       // soft mote
    float g=exp(-r*r*5.)*smoothstep(1.,.55,r); col=vColor.rgb*g*vColor.a;
  } else if(type==1){                // the shuttle
    float core=smoothstep(.22,.06,r);
    float halo=exp(-r*r*6.5);
    float c=cos(uTime*.9), s=sin(uTime*.9); vec2 q=mat2(c,-s,s,c)*vC;
    float rays=exp(-abs(q.x)*36.)*exp(-abs(q.y)*3.2)+exp(-abs(q.y)*36.)*exp(-abs(q.x)*3.2);
    col=(vColor.rgb*(halo*1.5+rays*1.8)+vec3(1.)*core*3.5)*vColor.a*smoothstep(1.,.7,r);
  } else if(type==2){                // moth
    float stun=vParam.z;
    float flap=mix(.42+.58*abs(sin(uTime*11.+vSeed)), .92, stun);
    vec2 p=vec2(abs(vC.x)/flap, vC.y);
    float d=sdEll(p,vec2(.40,.20),vec2(.44,.30),.45);
    d=min(d,sdEll(p,vec2(.27,-.28),vec2(.27,.25),-.3));
    d=min(d,sdEll(p,vec2(0.,0.),vec2(.07,.40),0.));
    float mask=smoothstep(.02,-.02,d);
    float rim=exp(-abs(d)*20.);
    vec2 e=p-vec2(.45,.22);
    float spot=exp(-pow((length(e)-.10)*24.,2.))+smoothstep(.05,.02,length(e));
    vec3 c=mix(vColor.rgb, vec3(.5,.62,.8), stun*.85);
    float flick=mix(1., .45+.25*sin(uTime*40.), stun);
    float clip=smoothstep(1.,.86,max(abs(vC.x),abs(vC.y)));
    col=(c*rim*2.6+c*spot*mask*2.4+c*.05*mask)*flick*vColor.a*clip;
    a=mask*.92*vColor.a;
  } else {                           // ring
    float w=vParam.y;
    float g=exp(-pow((r-.86)/w,2.)); col=vColor.rgb*g*vColor.a;
  }
  o=vec4(col,a);
}`;

  const FS_PRE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThresh;
void main(){
  vec3 c=texture(uTex,vUv).rgb*4.;
  c+=texture(uTex,vUv+uTexel).rgb+texture(uTex,vUv-uTexel).rgb;
  c+=texture(uTex,vUv+vec2(uTexel.x,-uTexel.y)).rgb+texture(uTex,vUv-vec2(uTexel.x,-uTexel.y)).rgb;
  c/=8.;
  float br=max(max(c.r,c.g),c.b);
  c*=max(br-uThresh,0.)/max(br,1e-4);
  o=vec4(min(c,vec3(24.)),1.);
}`;

  const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec3 c=texture(uTex,vUv).rgb*4.;
  c+=texture(uTex,vUv+uTexel).rgb+texture(uTex,vUv-uTexel).rgb;
  c+=texture(uTex,vUv+vec2(uTexel.x,-uTexel.y)).rgb+texture(uTex,vUv-vec2(uTexel.x,-uTexel.y)).rgb;
  o=vec4(c/8.,1.);
}`;

  const FS_UP = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 h=uTexel;
  vec3 c=texture(uTex,vUv+vec2(-h.x*2.,0.)).rgb+texture(uTex,vUv+vec2(h.x*2.,0.)).rgb
        +texture(uTex,vUv+vec2(0.,h.y*2.)).rgb+texture(uTex,vUv+vec2(0.,-h.y*2.)).rgb;
  c+=(texture(uTex,vUv+vec2(-h.x,h.y)).rgb+texture(uTex,vUv+h).rgb
     +texture(uTex,vUv+vec2(h.x,-h.y)).rgb+texture(uTex,vUv-h).rgb)*2.;
  o=vec4(c/12.,1.);
}`;

  const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom; uniform vec2 uRes;
uniform float uTime, uChroma, uGlitch, uFade, uFlash, uBloomStr, uExposure;
uniform vec4 uShock[4];
float h1(float n){ return fract(sin(n*127.1)*43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
void main(){
  vec2 uv=vUv; float asp=uRes.x/uRes.y;
  for(int i=0;i<4;i++){
    vec4 s=uShock[i]; vec2 d=uv-s.xy; d.x*=asp; float l=length(d);
    float w=l-s.z; float k=exp(-w*w*700.)*s.w;
    vec2 dir=d/max(l,1e-4); dir.x/=asp; uv+=dir*k*.024;
  }
  if(uGlitch>0.001){
    float band=floor(uv.y*26.+uTime*31.);
    float on=step(.55,h1(band+floor(uTime*19.)));
    uv.x+=(h1(band)-.5)*.055*uGlitch*on;
  }
  vec2 c=uv-.5; float r2=dot(c,c);
  vec2 off=c*(uChroma*.03+.0022)*(.6+r2*2.4);
  vec3 col=vec3(texture(uScene,uv+off).r, texture(uScene,uv).g, texture(uScene,uv-off).b);
  vec3 bl=vec3(texture(uBloom,uv+off*1.5).r, texture(uBloom,uv).g, texture(uBloom,uv-off*1.5).b);
  col+=bl*uBloomStr;
  col+=uFlash*vec3(.9,.95,1.)*.6;
  col*=uExposure;
  float pk=max(col.r,max(col.g,col.b));
  vec3 hp=col/max(pk,1e-4)*aces(vec3(pk)).r;
  col=mix(aces(col),hp,.5);
  col=pow(col,vec3(1./2.2));
  col*=1.-smoothstep(.12,.95,r2)*.85;
  col+=(h2(uv*uRes+fract(uTime)*91.7)-.5)*.022;
  o=vec4(col*uFade,1.);
}`;

  /* ------------------------------------------------------------ helpers */
  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s), src); throw new Error('shader'); }
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); throw new Error('link'); }
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  const pSky = program(VS_FULL, FS_SKY), pBox = program(VS_BOX, FS_BOX), pBill = program(VS_BILL, FS_BILL);
  const pPre = program(VS_FULL, FS_PRE), pDown = program(VS_FULL, FS_DOWN), pUp = program(VS_FULL, FS_UP), pComp = program(VS_FULL, FS_COMP);

  /* cube geometry (36 verts, pos + normal) */
  const cube = [];
  const FACES = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  for (const [n, u, v] of FACES) {
    const c = (a, b) => [n[0] * .5 + u[0] * a + v[0] * b, n[1] * .5 + u[1] * a + v[1] * b, n[2] * .5 + u[2] * a + v[2] * b];
    const q = [c(-.5, -.5), c(.5, -.5), c(.5, .5), c(-.5, .5)];
    for (const i of [0, 1, 2, 0, 2, 3]) cube.push(...q[i], ...n);
  }

  const fullVAO = gl.createVertexArray();

  const boxVAO = gl.createVertexArray(); gl.bindVertexArray(boxVAO);
  const cubeBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cube), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  const boxInst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, boxInst); gl.bufferData(gl.ARRAY_BUFFER, MAX_BOX * BOX_F * 4, gl.DYNAMIC_DRAW);
  [[2, 3, 0], [3, 3, 12], [4, 4, 24], [5, 4, 40]].forEach(([loc, n, off]) => {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, BOX_F * 4, off); gl.vertexAttribDivisor(loc, 1);
  });

  const billVAO = gl.createVertexArray(); gl.bindVertexArray(billVAO);
  const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const billInst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, billInst); gl.bufferData(gl.ARRAY_BUFFER, MAX_BILL * BILL_F * 4, gl.DYNAMIC_DRAW);
  [[1, 3, 0], [2, 2, 12], [3, 4, 20], [4, 4, 36]].forEach(([loc, n, off]) => {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, BILL_F * 4, off); gl.vertexAttribDivisor(loc, 1);
  });
  gl.bindVertexArray(null);

  const lightTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  /* ------------------------------------------------------------ targets */
  let W = 0, H = 0, msaa = null, scene = null, mips = [], quality = 1;

  function target(w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }
  function free() {
    if (msaa) { gl.deleteFramebuffer(msaa.fb); gl.deleteRenderbuffer(msaa.c); gl.deleteRenderbuffer(msaa.d); }
    for (const t of [scene, ...mips]) if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
    msaa = scene = null; mips = [];
  }
  function build() {
    free();
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const c = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, c);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, hdr ? gl.RGBA16F : gl.RGBA8, W, H);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c);
    const d = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, d);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
    msaa = { fb, c, d };
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    scene = target(W, H);
    const ok2 = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if ((!ok || !ok2) && hdr) { hdr = false; return build(); }
    let w = W, h = H;
    for (let i = 0; i < MIPS; i++) { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); mips.push(target(w, h)); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    let w = Math.max(2, Math.floor(canvas.clientWidth * dpr)), h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    const cap = 2560 * 1440; if (w * h > cap) { const k = Math.sqrt(cap / (w * h)); w = Math.floor(w * k); h = Math.floor(h * k); }
    if (w === W && h === H) return false;
    W = canvas.width = w; H = canvas.height = h; build(); return true;
  }
  resize();

  /* ------------------------------------------------------------ camera */
  const cam = { eye: [0, 8, 8], vp: null, r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1] };
  function setCamera(eye, center) {
    const P = M4.persp(FOV, W / H, 0.1, 200), L = M4.look(eye, center, [0, 1, 0]);
    cam.eye = eye; cam.vp = M4.mul(P, L.m); cam.r = L.r; cam.u = L.u; cam.f = L.f;
  }
  function project(x, y, z) {
    const m = cam.vp, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w * .5 + .5, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * .5 + .5];
  }

  /* ------------------------------------------------------------ frame */
  function fsPass(p, tgt, tex, tw, th) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fb : null);
    gl.viewport(0, 0, tgt ? tgt.w : W, tgt ? tgt.h : H);
    gl.useProgram(p.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(p.u.uTex, 0); gl.uniform2f(p.u.uTexel, 1 / tw, 1 / th);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function render(f) {
    const t = f.time, pal = f.pal;
    gl.bindFramebuffer(gl.FRAMEBUFFER, msaa.fb); gl.viewport(0, 0, W, H);
    gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // sky
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
    gl.bindVertexArray(fullVAO); gl.useProgram(pSky.p);
    const th = Math.tan(FOV / 2);
    gl.uniform3fv(pSky.u.uR, cam.r); gl.uniform3fv(pSky.u.uU, cam.u); gl.uniform3fv(pSky.u.uF, cam.f);
    gl.uniform2f(pSky.u.uProj, th * W / H, th); gl.uniform1f(pSky.u.uTime, t);
    gl.uniform3fv(pSky.u.uSkyA, pal.skyA); gl.uniform3fv(pSky.u.uSkyB, pal.skyB);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // boxes
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE);
    gl.useProgram(pBox.p); gl.bindVertexArray(boxVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, boxInst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.boxes, 0, f.nBox * BOX_F);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lightTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, f.dims[0], f.dims[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, f.light);
    gl.uniform1i(pBox.u.uLight, 0);
    gl.uniformMatrix4fv(pBox.u.uVP, false, cam.vp); gl.uniform3fv(pBox.u.uCam, cam.eye);
    gl.uniform3fv(pBox.u.uTrace, pal.trace); gl.uniform1f(pBox.u.uTime, t); gl.uniform2f(pBox.u.uDims, f.dims[0], f.dims[1]);
    gl.uniform3fv(pBox.u.uSkyA, pal.skyA); gl.uniform3fv(pBox.u.uSkyB, pal.skyB);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, f.nBox);

    // billboards (premultiplied: alpha 0 = additive, alpha 1 = occluding)
    gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(pBill.p); gl.bindVertexArray(billVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, billInst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.bills, 0, f.nBill * BILL_F);
    gl.uniformMatrix4fv(pBill.u.uVP, false, cam.vp); gl.uniform3fv(pBill.u.uR, cam.r); gl.uniform3fv(pBill.u.uU, cam.u);
    gl.uniform1f(pBill.u.uTime, t);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, f.nBill);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

    // resolve MSAA
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaa.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scene.fb);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    // bloom
    gl.bindVertexArray(fullVAO);
    gl.useProgram(pPre.p); gl.uniform1f(pPre.u.uThresh, hdr ? 0.85 : 0.55);
    fsPass(pPre, mips[0], scene.tex, W, H);
    for (let i = 1; i < MIPS; i++) fsPass(pDown, mips[i], mips[i - 1].tex, mips[i - 1].w, mips[i - 1].h);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = MIPS - 2; i >= 0; i--) fsPass(pUp, mips[i], mips[i + 1].tex, mips[i + 1].w, mips[i + 1].h);
    gl.disable(gl.BLEND);

    // composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(pComp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.tex); gl.uniform1i(pComp.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mips[0].tex); gl.uniform1i(pComp.u.uBloom, 1);
    gl.uniform2f(pComp.u.uRes, W, H); gl.uniform1f(pComp.u.uTime, t);
    gl.uniform1f(pComp.u.uChroma, f.chroma); gl.uniform1f(pComp.u.uGlitch, f.glitch);
    gl.uniform1f(pComp.u.uFade, f.fade); gl.uniform1f(pComp.u.uFlash, f.flash);
    gl.uniform1f(pComp.u.uBloomStr, hdr ? 0.32 : 0.5); gl.uniform1f(pComp.u.uExposure, 1.05);
    gl.uniform4fv(pComp.u.uShock, f.shocks);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  // drop internal resolution one notch (used when the frame rate sags); returns false at the floor
  function lowerQuality() { if (quality <= 0.5) return false; quality = Math.max(0.5, quality * 0.8); resize(); return true; }

  return { FOV, BOX_F, BILL_F, MAX_BOX, MAX_BILL, resize, lowerQuality, setCamera, project, render, aspect: () => W / H, canvas };
})();
