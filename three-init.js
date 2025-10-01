<!-- Pega esto DESPUÉS de gsap y (si quieres) despues de three.js -->
<script>
/* --------- SimplexNoise (pequeña implementación inline para evitar CDN MIME) ---------
   Fuente adaptada (pequeña versión ES línea) — suficiente para jitter y 2D noise.
*/
class SimplexNoiseInline {
  constructor(r){ r = r || Math.random; this.p = new Uint8Array(256); for (let i=0;i<256;i++) this.p[i]=i; for (let i=255;i>0;i--){ const j=Math.floor(r()*(i+1)); [this.p[i],this.p[j]]=[this.p[j],this.p[i]]; } }
  dot(g,x,y){return g[0]*x+g[1]*y;}
  noise2D(xin, yin){
    // Simple 2D simplex — compact; not super high quality but fine here
    const grad3 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    const F2 = 0.5*(Math.sqrt(3.0)-1.0);
    const G2 = (3.0-Math.sqrt(3.0))/6.0;
    let n0=0, n1=0, n2=0;
    let s = (xin+yin)*F2;
    let i = Math.floor(xin+s), j = Math.floor(yin+s);
    let t = (i+j)*G2;
    let X0 = i - t, Y0 = j - t;
    let x0 = xin - X0, y0 = yin - Y0;
    let i1=0, j1=0;
    if (x0>y0){ i1=1; j1=0; } else { i1=0; j1=1; }
    let x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    let x2 = x0 - 1.0 + 2.0*G2, y2 = y0 - 1.0 + 2.0*G2;
    const ii = i & 255, jj = j & 255;
    const gi0 = this.p[(ii+this.p[jj])&255] % 8;
    const gi1 = this.p[(ii+i1+this.p[(jj+j1)&255])&255] % 8;
    const gi2 = this.p[(ii+1+this.p[(jj+1)&255])&255] % 8;
    let t0 = 0.5 - x0*x0 - y0*y0;
    if (t0>=0){ t0*=t0; n0 = t0*t0 * this.dot(grad3[gi0], x0, y0); }
    let t1 = 0.5 - x1*x1 - y1*y1;
    if (t1>=0){ t1*=t1; n1 = t1*t1 * this.dot(grad3[gi1], x1, y1); }
    let t2 = 0.5 - x2*x2 - y2*y2;
    if (t2>=0){ t2*=t2; n2 = t2*t2 * this.dot(grad3[gi2], x2, y2); }
    return 70.0 * (n0 + n1 + n2);
  }
  noise3D(){ // stub if needed
    return this.noise2D(arguments[0], arguments[1] || 0);
  }
}

/* --------- Helper: detect WebGL availability --------- */
function detectWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return false;
    // optional: test drawing or max texture size to ensure it's not a stub
    return true;
  } catch(e){ return false; }
}

/* --------- Main init that branches to WebGL or Canvas2D fallback --------- */
(function(){
  const canUseWebGL = detectWebGL();
  const panel = document.getElementById('threeWrap');
  const canvas = document.getElementById('threeCanvas');
  const noise = new SimplexNoiseInline();

  // state shared by both renderers, updated by GSAP scroll
  const state = { hue:0.55, rotX:0, rotY:0, wobble:0 };

  // Scroll mapping (same mapping for both)
  const proxy = { p: 0 };
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    gsap.to(proxy, {
      p: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.7
      },
      onUpdate() {
        const prog = proxy.p;
        const hue = 0.05 + prog * 0.85;
        const rx = Math.sin(prog * Math.PI * 2) * 0.12;
        const ry = Math.cos(prog * Math.PI * 1.7) * 0.18;
        const wob = Math.abs(Math.sin(prog * Math.PI * 2)) * 0.9;
        gsap.to(state, { hue, rotX: rx, rotY: ry, wobble: wob, duration: 0.6, ease: 'power2.out' });
      }
    });
  }

  if (canUseWebGL && typeof THREE !== 'undefined') {
    // ---------- THREE.JS renderer (original path) ----------
    try {
      const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 16/9, 0.1, 100);
      camera.position.set(0,0,3.6);

      const amb = new THREE.AmbientLight(0xffffff, 0.6); scene.add(amb);
      const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(3,3,5); scene.add(dir);

      const detail = window.innerWidth < 980 ? 3 : 5;
      const geo = new THREE.IcosahedronGeometry(1.05, detail);
      const basePos = new Float32Array(geo.attributes.position.array);
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.6,0.78,0.52), metalness:0.25, roughness:0.35, emissive:0x001b1b });
      const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);

      const mandelUniforms = { u_time:{value:0}, u_zoom:{value:1.8}, u_offset:{value:new THREE.Vector2(-0.5,0)}, u_aspect:{value:1} };
      const mandelVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
      const mandelFS = 'precision highp float; varying vec2 vUv; uniform float u_time; uniform float u_zoom; uniform vec2 u_offset; uniform float u_aspect; vec3 palette(float t){ return vec3(0.5+0.5*cos(6.2831*(t+vec3(0.0,0.33,0.67)))); } void main(){ vec2 uv=vUv-0.5; uv.x *= u_aspect; vec2 c = uv * u_zoom + u_offset; vec2 z = c; int it=0; for(int i=0;i<120;i++){ float x = (z.x*z.x - z.y*z.y) + c.x; float y = (2.0*z.x*z.y) + c.y; z = vec2(x,y); if(dot(z,z) > 16.0){ it=i; break; } } float t = float(it)/120.0; vec3 col = palette(t); gl_FragColor = vec4(col,1.0); }';
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(4,2.4,1,1), new THREE.ShaderMaterial({ uniforms: mandelUniforms, vertexShader: mandelVS, fragmentShader: mandelFS, transparent:true, opacity:0.95 }));
      plane.position.set(0,0,-1.6); scene.add(plane);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6,0.02,12,120), new THREE.MeshBasicMaterial({ color:0xffffff, opacity:0.035, transparent:true }));
      ring.rotation.x = Math.PI * 0.35; scene.add(ring);

      // Resize
      function resizeThree(){
        const r = panel.getBoundingClientRect();
        const w = Math.max(100, Math.floor(r.width));
        const h = Math.max(100, Math.floor(r.height));
        renderer.setSize(w, h, false);
        camera.aspect = w/h; camera.updateProjectionMatrix();
        mandelUniforms.u_aspect.value = w/h;
      }
      const ro = new ResizeObserver(resizeThree); ro.observe(panel); resizeThree();

      // Animation loop
      const clock = new THREE.Clock();
      function animateThree(){
        const t = clock.getElapsedTime();
        mandelUniforms.u_time.value = t;
        const pos = geo.attributes.position;
        for(let i=0;i<pos.count;i++){
          const ix = i*3; const bx = basePos[ix], by = basePos[ix+1], bz = basePos[ix+2];
          const n = noise.noise3D(bx*1.4 + t*0.6, by*1.2 + t*0.7, bz*1.1 + t*0.5) || noise.noise2D(bx*1.4 + t*0.6, by*1.2 + t*0.7);
          const disp = n * 0.06 * (1 + state.wobble);
          pos.array[ix]   = bx + disp * (0.9 - Math.abs(by));
          pos.array[ix+1] = by + disp * (0.9 - Math.abs(bx));
          pos.array[ix+2] = bz + disp * 0.9;
        }
        pos.needsUpdate = true;
        mesh.rotation.x = 0.15 * Math.sin(t*0.6) + state.rotX;
        mesh.rotation.y += 0.004 + state.rotY * 0.01;
        mat.color.setHSL(state.hue % 1, 0.78, 0.52);
        renderer.render(scene, camera);
        requestAnimationFrame(animateThree);
      }
      animateThree();

      // expose for debugging
      window.__threeInstance = { renderer, scene, camera, mesh, plane };

      return; // success path
    } catch(e) {
      console.warn('Three.js init failed, falling back to Canvas2D. Error:', e);
      // fall through to canvas2D fallback
    }
  }

  // ---------- Canvas2D fallback (when WebGL not available) ----------
  // Use the same canvas element (we'll use 2D context). This ensures something visible.
  canvas.getContext && (function(){
    const ctx = canvas.getContext('2d');
    function resize2D(){
      const r = panel.getBoundingClientRect();
      canvas.width = Math.max(100, Math.floor(r.width));
      canvas.height = Math.max(100, Math.floor(r.height));
      // scale for DPR
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ro2 = new ResizeObserver(resize2D); ro2.observe(panel); resize2D();

    let tStart = performance.now();
    function drawFallback(){
      const now = performance.now();
      const t = (now - tStart) / 1000;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);

      // clear with subtle background
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = 'rgba(0,6,16,0.06)';
      ctx.fillRect(0,0,w,h);

      // pick hue from state
      const hue = (state.hue % 1) * 360;
      // draw a blurry radial "core"
      const grd = ctx.createRadialGradient(w*0.5, h*0.5, 20, w*0.5, h*0.5, Math.max(w,h)*0.9);
      grd.addColorStop(0, `hsla(${hue},80%,60%,0.25)`);
      grd.addColorStop(0.4, `hsla(${(hue+60)%360},70%,45%,0.12)`);
      grd.addColorStop(1, `rgba(0,0,0,0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0,0,w,h);

      // draw a noisy blob outline using simplex noise
      ctx.save();
      ctx.translate(w*0.5, h*0.5);
      const radius = Math.min(w,h) * 0.24 * (1 + 0.06 * Math.sin(t*0.9));
      ctx.beginPath();
      const steps = 80;
      for(let i=0;i<=steps;i++){
        const a = (i / steps) * Math.PI * 2;
        const nx = Math.cos(a), ny = Math.sin(a);
        const n = noise.noise2D(nx * 1.6 + t*0.4, ny * 1.9 + t*0.6);
        const r = radius + n * 10 * (1 + state.wobble);
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `hsla(${hue},85%,60%,0.9)`;
      ctx.shadowBlur = 18; ctx.shadowColor = `hsla(${hue},85%,60%,0.55)`;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // small rotating rings (simulate ring)
      ctx.save();
      ctx.translate(w*0.5, h*0.5);
      ctx.rotate(t * 0.14 + state.rotY * 0.8);
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.arc(0,0, radius*1.9, 0, Math.PI*2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `hsla(${(hue+40)%360},70%,55%,0.6)`;
      ctx.stroke();
      ctx.restore();

      requestAnimationFrame(drawFallback);
    }
    drawFallback();
  })();

})(); // end self-invoking
</script>
