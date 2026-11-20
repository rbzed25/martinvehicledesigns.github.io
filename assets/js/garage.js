// Home page 3D garage: first-person view of the shop; click a project to fly the camera over and inspect it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Edit here: camera positions (metres, Blender X / Z-up becomes three.js X / Y-up, -Y)
// `cam` is where the camera sits, `look` is the point it aims at.
// `nodes` are the object names from Blender that should be clickable for that project.
// ---------------------------------------------------------------------------
// `fov` = horizontal field of view in degrees for that view (smaller = more zoomed in).
const OVERVIEW = { cam: [0.24, 1.7, 4.49], look: [0.75, 1.35, -7.0], fov: 65 }; // matches the Blender viewport shot
const OVERVIEW_PHONE = { cam: [0.48, 1.65, 4.89], look: [0.95, 1.35, -7.0], fov: 78 }; // used on tall, narrow screens
const WORKS = [
  {
    key: '992', title: '992 TT Cup', meta: '2025 · BBi Autosport',
    href: 'projects/992-cup.html',
    nodes: ['HERO_porsche_992cup_glb'],
    cam: [1.3, 1.3, -3.7], look: [0.8, 0.55, -7.4],
  },
  {
    key: '997', title: '997 Turbo CUP', meta: '2026 · Horseman manifold',
    href: 'projects/997-turbo-cup.html',
    nodes: ['997HorsemanManifold', '997Horseman_IntercoolerOutletDuct_Driver_Try420'],
    cam: [-1.95, 2.05, -2.3], look: [-3.1, 1.72, -2.4],
  },
  {
    key: 'datsun', title: 'Datsun 280Z', meta: 'Personal build · since 2019',
    href: null, // no write-up page yet
    nodes: ['HERO_datsun_240z_glb'],
    cam: [0.9, 1.6, 0.0], look: [3.2, 2.35, -3.3],
  },
];
// Placeholder objects from the Blender file that should not show on the site.
const HIDE = [/^PROXY_/];
// The drop from the name screen: the garage is underground. The camera starts FALL_HEIGHT metres above the
// overview spot, looking straight ahead, and drops straight down (no turning) as the page scrolls.
// The roof hides itself while the camera is above it, so the camera passes down through it.
const FALL_HEIGHT = 7.0;
const ROOF = [/^ENV_ceiling/, /^ENV_beam/, /^ENV_purlin/];
const ROOF_BOTTOM = 4.45;      // metres; the roof is hidden while the camera is above this height
// The room is baked in Blender (Diffuse bake with direct + indirect + color): every room surface shows its finished
// look from that image, exactly as Blender rendered it. The image is stored scaled down by BAKE_SCALE.
// Objects whose names start with these are not baked: they're lit live so their reflections move with the camera.
const NOT_BAKED = /^(HERO_|997|SIL_|PROXY_|PRP_mag)/; // magazines keep their sharp cover images
const BAKE_SCALE = 2.0;          // must match the scale used when the image was exported
const BAKE_BRIGHTNESS = 1.0;     // overall brightness of the baked room
// Live lighting for the cars and 997 parts, to sit in with the baked room:
const LAMP_STRENGTH = 3;         // one lamp under each ceiling bulb, for the cars' highlights
const LAMP_COLOR = 0xffe6c7;
const CAR_REFLECTIONS = 1.0;     // strength of the garage reflections on cars and metal parts
// Cars reflect the garage itself: a 360° snapshot of the baked room taken from this spot (metres) when the page loads.
const REFLECTION_PROBE = [1.2, 1.3, -4.0];
// Photo finish applied over the whole 3D view
const GRADE = {
  exposure: 0.95,    // overall brightness
  saturation: 0.86,  // 1 = as baked, lower = less saturated
  warmth: -0.03,     // negative cools the orange cast slightly
  contrast: 1.08,    // 1 = as baked
  bloom: 0.35,       // glow around the bulbs and bright highlights
  vignette: 0.32,    // darkening toward the edges of the screen
  grain: 0.03,       // film grain
};
// Material colors that Blender couldn't export (they were made with shader nodes). Matched to the Blender render.
const MATERIAL_FIXES = {
  EXT_Carpaint_Inst:     { color: '#1b1c1e', metalness: 0.4, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.18 }, // 992 body
};
// Datsun body panels use a material Blender exported without its paint, so they get the paint directly.
const DATSUN = { node: 'HERO_datsun_240z_glb', materials: ['MAT_table_planks', 'Bodyunrefunblend1Mtl', 'Bodyunrefunblend11Mtl'],
  paint: { color: '#cf8607', metalness: 0.1, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.18 } };
const SILHOUETTE_MATERIAL = 'MAT_silhouette'; // ghost cars: dark with a glowing outline
const SILHOUETTE_RIM = 0xd8dbe0;
const FLY_TIME = 1.6;          // seconds per camera move
const LOOK_AROUND = 0.12;      // how far the overview view follows the mouse (radians)
const H_FOV = 78;              // horizontal field of view for the close-up views (kept the same on any screen shape)
// ---------------------------------------------------------------------------

const section = document.getElementById('works');
const host = section && section.querySelector('.garage');
if (host) start();

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
}

function start() {
  if (!webglOK()) return; // the 2D slider stays
  section.classList.add('has-garage');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = host.querySelector('.garage-canvas');
  const tip = host.querySelector('.garage-tip');
  const panel = host.querySelector('.garage-panel');
  const back = host.querySelector('.garage-back');
  const list = host.querySelector('.garage-list');
  const bar = host.querySelector('.garage-bar');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.AgXToneMapping; // same look as Blender's default view transform
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f0f0f);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // placeholder until the garage loads



  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 120);
  const v3 = a => new THREE.Vector3(...a);
  const home = { cam: v3(OVERVIEW.cam), look: v3(OVERVIEW.look), fov: OVERVIEW.fov };
  const setHome = () => {
    const o = host.clientWidth / Math.max(1, host.clientHeight) < 0.8 ? OVERVIEW_PHONE : OVERVIEW;
    home.cam.set(...o.cam); home.look.set(...o.look); home.fov = o.fov || H_FOV;
  };
  setHome();
  camera.position.copy(home.cam);
  const look = home.look.clone();
  camera.lookAt(look);

  // ---- photo finish: bloom, color grade, vignette and grain ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), GRADE.bloom, 0.6, 1.6);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass({ // before tone mapping (linear light)
    uniforms: { tDiffuse: { value: null }, exposure: { value: GRADE.exposure }, saturation: { value: GRADE.saturation }, warmth: { value: GRADE.warmth } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float exposure, saturation, warmth; varying vec2 vUv;
      void main(){ vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb * exposure;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, saturation);
        c *= vec3(1.0 + warmth, 1.0, 1.0 - warmth);
        gl_FragColor = vec4(c, t.a); }`,
  }));
  composer.addPass(new OutputPass()); // tone mapping + screen colors
  const finish = new ShaderPass({ // after tone mapping (screen colors)
    uniforms: { tDiffuse: { value: null }, contrast: { value: GRADE.contrast }, vignette: { value: GRADE.vignette }, grain: { value: GRADE.grain }, seed: { value: 0 }, aspect: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast, vignette, grain, seed, aspect; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
        c = (c - 0.5) * contrast + 0.5;
        vec2 d = (vUv - 0.5) * vec2(aspect, 1.0); c *= 1.0 - vignette * smoothstep(0.35, 1.05, length(d));
        c += (hash(gl_FragCoord.xy) - 0.5) * grain;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`,
  });
  composer.addPass(finish);

  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.addEventListener('change', requestRender);

  // ---- state ----
  let mode = 'overview';          // overview | flying | inspect
  let current = null;             // WORKS entry being inspected
  let fly = null;                 // active camera move
  const pointer = new THREE.Vector2(9, 9);
  const lookOffset = new THREE.Vector2(); // overview mouse follow, eased
  const lookAim = new THREE.Vector2();
  let hovered = null;
  let baseFov = 60;
  let fallP = 1, wasFalling = false, landStart = -1;
  const roofParts = [];
  const drop = new THREE.Vector3();
  const workMeshes = new Map();   // key -> meshes (for hover glow)

  // ---- project buttons (also make every project reachable by keyboard and on small phones) ----
  WORKS.forEach(w => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = w.title; b.dataset.key = w.key;
    b.addEventListener('click', () => inspect(w));
    list.appendChild(b);
  });
  back.addEventListener('click', goHome);
  addEventListener('keydown', e => { if (e.key === 'Escape' && mode !== 'overview') goHome(); });

  // ---- size ----
  // vertical field of view that gives the wanted horizontal one on this screen shape
  function vFov(h) {
    const hf = THREE.MathUtils.degToRad(h);
    return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / camera.aspect)), 20, 100);
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
    finish.uniforms.aspect.value = w / Math.max(1, h);
    camera.aspect = w / h;
    setHome();
    baseFov = vFov(home.fov);
    if (mode === 'inspect') camera.fov = vFov(H_FOV);
    else if (mode === 'overview') camera.fov = baseFov;
    camera.updateProjectionMatrix();
    if (mode === 'overview') aimOverview();
    requestRender();
  }
  new ResizeObserver(resize).observe(host);

  // ---- render on demand; only while the section is on screen ----
  let visible = false, needs = true, raf = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) requestRender(); }, { threshold: 0 }).observe(host);
  addEventListener('scroll', requestRender, { passive: true });
  // 0 = works section just below the screen (top of the fall), 1 = works fills the screen (landed)
  function scrollProgress() {
    const top = host.getBoundingClientRect().top;
    return THREE.MathUtils.clamp(1 - top / Math.max(1, innerHeight), 0, 1);
  }
  function requestRender() { needs = true; if (!raf && visible) raf = requestAnimationFrame(frame); }
  const clock = new THREE.Clock();
  function frame() {
    raf = 0;
    const dt = Math.min(clock.getDelta(), 0.05);
    let busy = false;

    if (mode !== 'overview' && !reduceMotion && scrollProgress() < 0.9) resetHome();
    if (mode === 'flying' && fly) { busy = stepFly() || busy; }
    else if (mode === 'overview') {
      const p = reduceMotion ? 1 : scrollProgress();
      if (p < 0.97) wasFalling = true;
      if (p >= 0.999 && wasFalling) { landStart = performance.now(); wasFalling = false; }
      fallP = p;
      host.classList.toggle('is-landed', p >= 0.999);
      if (p < 0.999) { applyFall(p); lookAim.set(0, 0); lookOffset.set(0, 0); }
      else {
        lookOffset.lerp(lookAim, 1 - Math.pow(0.001, dt));
        if (lookOffset.distanceTo(lookAim) > 1e-4) busy = true;
        aimOverview();
        busy = applyLanding() || busy;
      }
    } else if (mode === 'inspect') {
      busy = controls.update() || busy;
    }

    if (needs || busy) { finish.uniforms.seed.value = (performance.now() % 1000) / 10; composer.render(); needs = false; }
    if (busy) requestRender();
  }

  // Camera during the drop: same view direction the whole way, only the height changes with the scroll.
  function applyFall(p) {
    drop.set(0, (1 - p) * FALL_HEIGHT, 0);
    camera.position.copy(home.cam).add(drop);
    look.copy(home.look).add(drop);
    camera.lookAt(look);
    const f = baseFov + 6 * Math.sin(Math.PI * p); // slight widening mid-fall for a sense of speed
    if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
    setRoof(camera.position.y);
  }
  // Landing: the camera dips like knees bending on impact, then settles.
  function applyLanding() {
    if (camera.fov !== baseFov) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    setRoof(camera.position.y);
    if (landStart < 0) return false;
    const t = (performance.now() - landStart) / 1000;
    if (t > 1.2) { landStart = -1; aimOverview(); return false; }
    const dip = -0.5 * Math.exp(-5.5 * t) * Math.sin(9 * t);
    camera.position.y += dip;
    look.y += dip * 1.6;
    camera.lookAt(look);
    return true;
  }
  let roofShown = true;
  function setRoof(y) {
    const show = y < ROOF_BOTTOM;
    if (show === roofShown) return;
    roofShown = show;
    roofParts.forEach(o => { o.visible = show; });
  }

  function aimOverview() {
    // yaw/pitch the overview look-at point a little toward the mouse
    const dir = home.look.clone().sub(home.cam);
    const dist = dir.length(); dir.normalize();
    const yaw = -lookOffset.x * LOOK_AROUND, pitch = lookOffset.y * LOOK_AROUND * 0.6;
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    dir.applyAxisAngle(right, pitch);
    look.copy(home.cam).addScaledVector(dir, dist);
    camera.position.copy(home.cam);
    camera.lookAt(look);
  }

  // ---- camera moves ----
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function flyTo(toCam, toLook, toFov, done) {
    const fromCam = camera.position.clone();
    const fromLook = mode === 'inspect' ? controls.target.clone() : look.clone();
    // gentle arc: lift the middle of the path a little so the camera floats over furniture
    const mid = fromCam.clone().lerp(toCam, 0.5);
    mid.y += Math.min(0.6, fromCam.distanceTo(toCam) * 0.06);
    fly = { fromCam, mid, toCam, fromLook, toLook, fromFov: camera.fov, toFov, t: 0, start: performance.now(), dur: reduceMotion ? 0.001 : FLY_TIME, done };
    controls.enabled = false;
    mode = 'flying';
    requestRender();
  }
  function stepFly() {
    fly.t = Math.min(1, (performance.now() - fly.start) / 1000 / fly.dur); // time-based, so slow devices skip frames instead of slowing down
    const k = ease(fly.t), u = 1 - k;
    // quadratic bezier for position, straight blend for the aim point
    camera.position.set(
      u * u * fly.fromCam.x + 2 * u * k * fly.mid.x + k * k * fly.toCam.x,
      u * u * fly.fromCam.y + 2 * u * k * fly.mid.y + k * k * fly.toCam.y,
      u * u * fly.fromCam.z + 2 * u * k * fly.mid.z + k * k * fly.toCam.z,
    );
    look.copy(fly.fromLook).lerp(fly.toLook, k);
    camera.lookAt(look);
    camera.fov = fly.fromFov + (fly.toFov - fly.fromFov) * k;
    camera.updateProjectionMatrix();
    if (fly.t >= 1) { const d = fly.done; fly = null; d(); return false; }
    return true;
  }

  function inspect(w) {
    if (!ready) return;
    host.classList.add('has-interacted');
    setHover(null);
    current = w;
    hidePanel();
    list.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.key === w.key)));
    flyTo(v3(w.cam), v3(w.look), vFov(H_FOV), () => {
      mode = 'inspect';
      host.classList.add('is-inspecting');
      // let the viewer orbit a little around the object
      controls.target.copy(v3(w.look));
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      controls.minAzimuthAngle = sph.theta - 0.6;
      controls.maxAzimuthAngle = sph.theta + 0.6;
      controls.minPolarAngle = Math.max(0.2, sph.phi - 0.35);
      controls.maxPolarAngle = Math.min(Math.PI - 0.2, sph.phi + 0.3);
      controls.enabled = true;
      controls.update();
      showPanel(w);
    });
  }

  function goHome() {
    if (mode === 'overview') return;
    hidePanel();
    host.classList.remove('is-inspecting');
    list.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', 'false'));
    lookOffset.set(0, 0); lookAim.set(0, 0);
    flyTo(home.cam.clone(), home.look.clone(), baseFov, () => { mode = 'overview'; current = null; requestRender(); });
  }

  function resetHome() { // instant, used when the visitor scrolls away mid-inspection
    fly = null; controls.enabled = false; mode = 'overview'; current = null;
    hidePanel(); host.classList.remove('is-inspecting');
    list.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', 'false'));
  }

  function showPanel(w) {
    panel.querySelector('[data-title]').textContent = w.title;
    panel.querySelector('[data-meta]').textContent = w.meta;
    const link = panel.querySelector('[data-link]'), soon = panel.querySelector('[data-soon]');
    if (w.href) { link.href = w.href; link.hidden = false; soon.hidden = true; }
    else { link.hidden = true; soon.hidden = false; }
    panel.hidden = false; back.hidden = false;
    requestAnimationFrame(() => panel.classList.add('is-on'));
  }
  function hidePanel() { panel.classList.remove('is-on'); panel.hidden = true; back.hidden = true; }

  // ---- hover + click ----
  // Each project gets invisible pick boxes around its parts: fast to test and easier to hit than thin tubes.
  const ray = new THREE.Raycaster();
  const boxes = []; // { box, work }
  const hitPt = new THREE.Vector3();
  function pick() {
    ray.setFromCamera(pointer, camera);
    let best = null, bestD = Infinity;
    for (const b of boxes) {
      if (ray.ray.intersectBox(b.box, hitPt)) {
        const d = hitPt.distanceToSquared(ray.ray.origin);
        if (d < bestD) { bestD = d; best = b.work; }
      }
    }
    return best;
  }
  function setHover(w) {
    if (hovered === w) return;
    if (hovered) glow(hovered, false);
    hovered = w;
    if (w) glow(w, true);
    canvas.style.cursor = w ? 'pointer' : '';
    tip.classList.toggle('is-on', !!w);
    if (w) tip.textContent = w.title;
    requestRender();
  }
  function glow(w, on) {
    (workMeshes.get(w.key) || []).forEach(m => {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mat => {
        if (!mat.emissive) return;
        if (on) { mat.userData.e0 = mat.userData.e0 || mat.emissive.clone(); mat.emissive.setRGB(0.08, 0.08, 0.08); }
        else if (mat.userData.e0) mat.emissive.copy(mat.userData.e0);
      });
    });
  }

  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return r;
  }
  canvas.addEventListener('pointermove', e => {
    if (!ready || e.pointerType === 'touch' || fallP < 0.999) return;
    const r = setPointer(e);
    if (mode === 'overview') { lookAim.set(pointer.x, pointer.y); requestRender(); }
    if (mode !== 'overview') { setHover(null); return; }
    const w = pick();
    setHover(w);
    if (w) tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
  });
  canvas.addEventListener('pointerleave', () => { setHover(null); lookAim.set(0, 0); requestRender(); });

  // a click is a press + release without much movement (so orbit drags don't count)
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!down || !ready || fallP < 0.999) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 6 || mode === 'flying') return;
    setPointer(e);
    const w = pick();
    if (w && w !== current) inspect(w);
    else if (!w && mode === 'inspect' && e.pointerType !== 'touch') { /* clicking empty space keeps the view */ }
  });

  // ---- load the model ----
  let ready = false, sceneRoot = null;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const onLoad = gltf => {
    sceneRoot = gltf.scene;
    sceneRoot.traverse(o => { if (HIDE.some(rx => rx.test(o.name))) o.visible = false; });
    sceneRoot.children.forEach(o => { if (ROOF.some(rx => rx.test(o.name))) roofParts.push(o); });
    roofShown = true;
    WORKS.forEach(w => {
      const meshes = [];
      w.nodes.forEach(n => {
        const node = sceneRoot.getObjectByName(n);
        if (!node) { console.warn('garage: missing object', n); return; }
        node.traverse(o => {
          if (!o.isMesh) return;
          // own copy of materials so the hover glow only lights this project
          o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
          meshes.push(o);
        });
        node.updateWorldMatrix(true, true);
        boxes.push({ box: new THREE.Box3().setFromObject(node).expandByScalar(0.03), work: w });
      });
      workMeshes.set(w.key, meshes);
    });
    sceneRoot.updateMatrixWorld(true);
    const baked = applyBake(sceneRoot);
    liveLighting(sceneRoot);
    scene.add(sceneRoot);
    baked.then(() => captureReflections(sceneRoot));
    ready = true;
    host.classList.add('is-ready');
    resize();
    // upload everything to the GPU now so the first camera move doesn't stutter
    renderer.compile(scene, camera);
    requestRender();
  };
  // ---- reflections: a 360° snapshot of the baked garage, so the cars and metal parts reflect the real room ----
  function captureReflections(root) {
    const hidden = [];
    root.traverse(o => { if (o.isMesh && o.visible) for (let p = o; p; p = p.parent) if (NOT_BAKED.test(p.name) && !/^PRP_mag/.test(p.name)) { o.visible = false; hidden.push(o); break; } });
    const old = scene.environment;
    scene.environment = null;
    const rt = pmrem.fromScene(scene, 0.02, 0.1, 60, { size: 256, position: new THREE.Vector3(...REFLECTION_PROBE) });
    hidden.forEach(o => { o.visible = true; });
    scene.environment = rt.texture;
    if (old && old !== rt.texture) old.dispose();
    requestRender();
  }

  // ---- Blender bake on the room ----
  function applyBake(root) {
    if (!host.dataset.bake) return Promise.resolve();
    let loaded; const done = new Promise(r => { loaded = r; });
    const tex = new THREE.TextureLoader().load(host.dataset.bake, () => { requestRender(); loaded(); }, undefined, () => loaded());
    tex.flipY = false;                 // glTF texture convention
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.channel = 1;                   // the second UV map ("Lightmap" in Blender)
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const k = BAKE_SCALE * BAKE_BRIGHTNESS;
    const made = new Map();
    root.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.uv1) return;
      for (let p = o; p; p = p.parent) if (NOT_BAKED.test(p.name)) return;
      const bake = m => {
        if (!made.has(m)) {
          made.set(m, new THREE.MeshBasicMaterial({
            map: tex, color: new THREE.Color(k, k, k), side: m.side,
            transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, name: m.name,
          }));
        }
        return made.get(m);
      };
      o.material = Array.isArray(o.material) ? o.material.map(bake) : bake(o.material);
    });
    return done;
  }

  // ---- live-lit objects: fix colors Blender couldn't export, tone reflections, add the ceiling lamps ----
  function liveLighting(root) {
    const rim = new THREE.ShaderMaterial({
      uniforms: { rim: { value: new THREE.Color(SILHOUETTE_RIM) } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 rim; varying vec3 vN; varying vec3 vV;
        void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = smoothstep(0.55, 0.95, f);
          gl_FragColor = vec4(rim * f * 0.9 + vec3(0.008), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    root.traverse(o => {
      if (!o.isMesh) return;
      const fix = m => {
        if (!m) return m;
        if (m.name === SILHOUETTE_MATERIAL) return rim;
        let f = MATERIAL_FIXES[m.name];
        if (f && f.clearcoat !== undefined && !m.isMeshPhysicalMaterial) {
          const p = new THREE.MeshPhysicalMaterial({ name: m.name, map: m.map || null, normalMap: m.normalMap || null, side: m.side });
          p.userData.fixed = false; m = p;
        }
        if (f && !m.userData.fixed) {
          if (f.clearcoat !== undefined) { m.clearcoat = f.clearcoat; m.clearcoatRoughness = f.clearcoatRoughness; }
          if (f.color) m.color.set(f.color);
          if (f.metalness !== undefined) m.metalness = f.metalness;
          if (f.roughness !== undefined) m.roughness = f.roughness;
          m.userData.fixed = true;
        }
        if (!m.isMeshBasicMaterial && 'envMapIntensity' in m) m.envMapIntensity = CAR_REFLECTIONS;
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
    });
    const datsun = root.getObjectByName(DATSUN.node);
    if (datsun) {
      const paint = new THREE.MeshPhysicalMaterial({ ...DATSUN.paint, color: new THREE.Color(DATSUN.paint.color), envMapIntensity: CAR_REFLECTIONS });
      datsun.traverse(o => {
        if (!o.isMesh) return;
        const swap = m => (m && DATSUN.materials.includes(m.name) ? Object.assign(paint.clone(), { map: m.map || null }) : m);
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      });
    }
    root.traverse(o => {
      if (!/^LGT_.*_bulb$/.test(o.name)) return;
      const l = new THREE.PointLight(LAMP_COLOR, LAMP_STRENGTH, 0, 2);
      o.getWorldPosition(l.position); l.position.y -= 0.12;
      scene.add(l);
    });
  }

  const onError = err => {
    console.error('garage: could not load the 3D scene', err);
    section.classList.remove('has-garage'); // fall back to the slider
  };
  const onProgress = e => {
    if (e.lengthComputable && e.total) bar.querySelector('span').style.width = `${(e.loaded / e.total) * 100}%`;
    else bar.classList.add('is-indeterminate');
  };

  const begin = () => {
    if (host.dataset.modelJs) { // preview host: model split into base64 modules
      bar.classList.add('is-indeterminate');
      Promise.all(host.dataset.modelJs.split(',').map(u => import(new URL(u, location.href).href))).then(ms => {
        const bin = Uint8Array.from(atob(ms.map(m => m.default).join('')), c => c.charCodeAt(0));
        loader.parse(bin.buffer, '', onLoad, onError);
      }).catch(onError);
    } else {
      loader.load(host.dataset.model, onLoad, onProgress, onError);
    }
  };
  // start downloading once the page itself has loaded, so the name screen comes up first
  if (document.readyState === 'complete') begin(); else addEventListener('load', begin, { once: true });
  resize();
}
