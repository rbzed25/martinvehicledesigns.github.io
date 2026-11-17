// Interactive 3D model viewer (three.js).
// Markup: <div class="viewer" data-model="../assets/models/992cup.glb" data-size-mb="20"
//              data-groups='[{"id":"body","label":"Body panels"}, ...]'></div>
// Parts panel: every top-level node in the GLB that carries extras {label, group} becomes a
// show/hide toggle, listed under its group (rows with the same label are toggled together).
// Optional: data-color="#8f949b" paints the whole model in one satin-metal finish instead of its own colors.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const host = document.querySelector('.viewer');
if (host) init(host);

function init(host) {
  const url = host.dataset.model;
  const sizeMB = parseFloat(host.dataset.sizeMb || '0');
  const groupDefs = host.dataset.groups ? JSON.parse(host.dataset.groups) : [];

  host.insertAdjacentHTML('beforeend', `
    <div class="viewer-loading"><div><span class="vl-text">Loading 3D model</span><div class="bar"><i></i></div></div></div>
    <div class="viewer-tag" hidden></div>
    <aside class="viewer-parts" hidden aria-label="Show or hide parts"></aside>
    <div class="viewer-ui">
      <span class="hint">Drag to rotate · Scroll to zoom · Right-drag to pan · Click a part to name it · Double-click to focus</span>
      <span class="tools">
        <button type="button" data-act="parts" aria-pressed="false" hidden>Parts</button>
        <button type="button" data-act="spin" aria-pressed="true">Auto-rotate</button>
        <button type="button" data-act="reset">Reset view</button>
        <button type="button" data-act="full">Full screen</button>
      </span>
    </div>`);
  const loadText = host.querySelector('.vl-text');
  const bar = host.querySelector('.bar i');
  const tag = host.querySelector('.viewer-tag');
  const panel = host.querySelector('.viewer-parts');
  const partsBtn = host.querySelector('[data-act="parts"]');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(1, 2, 1.5);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x222222, 0.35));

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 1.2;
  controls.autoRotate = host.dataset.autorotate !== 'off';   // on by default
  host.querySelector('[data-act="spin"]').setAttribute('aria-pressed', controls.autoRotate);
  controls.zoomToCursor = true;

  let home = null, model = null, dirty = true;
  const parts = [];        // {obj, label, group}
  controls.addEventListener('change', () => { dirty = true; });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    // When the parts panel is open on a wide screen, shift the picture left so the car isn't hidden behind it
    const pw = (panel && !panel.hidden && w > 760) ? panel.offsetWidth + 24 : 0;
    camera.aspect = (w + pw) / h;
    if (pw) camera.setViewOffset(w + pw, h, pw, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(host);
  resize();

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const onLoad = gltf => {
    model = gltf.scene;
    if (host.dataset.color) {
      const finish = new THREE.MeshStandardMaterial({
        color: new THREE.Color(host.dataset.color), metalness: 0.55, roughness: 0.38, side: THREE.DoubleSide
      });
      model.traverse(o => { if (o.isMesh) o.material = finish; });
    }
    // Transparent parts (e.g. ghosted body scans) shouldn't hide what's behind them
    model.traverse(o => {
      if (o.isMesh && o.material.transparent) { o.material.depthWrite = false; o.renderOrder = 1; }
    });
    model.children.forEach(o => {
      const ex = o.userData || {};
      if (ex.group) parts.push({ obj: o, label: ex.label || o.name, group: ex.group });
    });
    scene.add(model);

    // Centre the model and frame it
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const radius = size.length() / 2;
    camera.near = radius / 200; camera.far = radius * 50; camera.updateProjectionMatrix();
    controls.minDistance = radius * 0.05;
    controls.maxDistance = radius * 6;
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.62;
    const dir = new THREE.Vector3(1, 0.45, 1.25).normalize();
    home = { pos: dir.multiplyScalar(dist), target: new THREE.Vector3() };
    // Custom starting view: data-view="px,py,pz | tx,ty,tz" (captured with Shift+V)
    if (host.dataset.view) {
      const [pp, tt] = host.dataset.view.split('|').map(s => s.split(',').map(Number));
      if (pp && pp.length === 3 && pp.every(isFinite)) home.pos = new THREE.Vector3(...pp);
      if (tt && tt.length === 3 && tt.every(isFinite)) home.target = new THREE.Vector3(...tt);
    }
    goHome();
    if (parts.length && host.dataset.parts !== 'off') buildPanel();
    host.classList.add('ready');
    dirty = true;
  };
  const onProgress = xhr => {
    const total = xhr.lengthComputable ? xhr.total : sizeMB * 1048576;
    if (total) {
      const pct = Math.min(100, Math.round(xhr.loaded / total * 100));
      bar.style.width = pct + '%';
      loadText.textContent = `Loading 3D model · ${pct}%`;
    }
  };
  const onError = err => {
    console.error(err);
    loadText.textContent = 'The 3D model could not be loaded';
  };
  if (host.dataset.modelJs) {
    // Preview host can't serve .glb, so there the model is embedded in a JS module
    import(new URL(host.dataset.modelJs, location.href).href).then(m => {
      const bin = Uint8Array.from(atob(m.default), c => c.charCodeAt(0));
      loader.parse(bin.buffer, '', onLoad, onError);
    }).catch(onError);
  } else {
    loader.load(url, onLoad, onProgress, onError);
  }

  // ---------- Parts panel ----------
  function buildPanel() {
    const order = groupDefs.map(g => g.id);
    const groups = [...new Set(parts.map(p => p.group))]
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    let html = `<div class="vp-head"><span>Parts</span><span class="vp-actions">
        <button type="button" data-all="1">Show all</button></span></div>`;
    groups.forEach(g => {
      const def = groupDefs.find(d => d.id === g) || { label: g };
      const rows = [...new Set(parts.filter(p => p.group === g).map(p => p.label))];
      html += `<div class="vp-group" data-group="${g}">
        <label class="vp-ghead"><input type="checkbox" checked data-g="${g}"><span>${def.label}</span>
          ${def.quick ? `<button type="button" class="vp-only" data-only="${g}" title="Show only this group">Only</button>` : ''}</label>
        ${rows.map(l => `<label class="vp-row"><input type="checkbox" checked data-g="${g}" data-l="${l}"><span>${l}</span></label>`).join('')}
      </div>`;
    });
    panel.innerHTML = html;
    partsBtn.hidden = false;

    panel.addEventListener('change', e => {
      const cb = e.target; if (cb.type !== 'checkbox') return;
      const g = cb.dataset.g, l = cb.dataset.l;
      parts.filter(p => p.group === g && (!l || p.label === l)).forEach(p => { p.obj.visible = cb.checked; });
      syncPanel(); dirty = true;
    });
    panel.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault();
      if (b.dataset.all) parts.forEach(p => { p.obj.visible = true; });
      if (b.dataset.only) parts.forEach(p => { p.obj.visible = p.group === b.dataset.only; });
      syncPanel(); dirty = true;
    });
    // Start with the panel open on wide screens
    if (host.clientWidth > 900) togglePanel(true);
  }
  function syncPanel() {
    panel.querySelectorAll('.vp-row input').forEach(cb => {
      cb.checked = parts.some(p => p.group === cb.dataset.g && p.label === cb.dataset.l && p.obj.visible);
    });
    panel.querySelectorAll('.vp-ghead input').forEach(cb => {
      const ps = parts.filter(p => p.group === cb.dataset.g);
      const on = ps.filter(p => p.obj.visible).length;
      cb.checked = on > 0; cb.indeterminate = on > 0 && on < ps.length;
    });
  }
  function togglePanel(force) {
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    partsBtn.setAttribute('aria-pressed', open);
    resize();
  }

  function goHome() {
    if (!home) return;
    camera.position.copy(home.pos);
    controls.target.copy(home.target);
    controls.update();
    dirty = true;
  }

  // ---------- Picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    if (!model) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const visibleParts = model.children.filter(o => o.visible);
    // Skip see-through parts so clicks reach the parts inside them
    return ray.intersectObjects(visibleParts, true).find(h => !(h.object.material && h.object.material.opacity < 0.5)) || null;
  }
  // Double-click a surface to orbit around that point
  renderer.domElement.addEventListener('dblclick', e => {
    const hit = pick(e);
    if (hit) { controls.target.copy(hit.point); controls.update(); }
  });
  // Single click (not a drag) names the part under the cursor
  let downAt = null, tagTimer = null;
  renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
    const hit = pick(e);
    clearTimeout(tagTimer);
    if (!hit) { tag.hidden = true; return; }
    let o = hit.object; while (o.parent && o.parent !== model) o = o.parent;
    const p = parts.find(q => q.obj === o);
    if (!p) { tag.hidden = true; return; }
    const def = groupDefs.find(d => d.id === p.group);
    tag.innerHTML = `<span class="muted">${def ? def.label : ''}</span>${p.label}`;
    const r = host.getBoundingClientRect();
    tag.style.left = (e.clientX - r.left + 14) + 'px';
    tag.style.top = (e.clientY - r.top + 14) + 'px';
    tag.hidden = false;
    tagTimer = setTimeout(() => { tag.hidden = true; }, 2500);
  });

  // Hidden helper for the site owner: Shift+V copies the current camera view as a data-view attribute.
  document.addEventListener('keydown', e => {
    if (!(e.shiftKey && (e.key === 'V' || e.key === 'v')) || !model) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const f = v => v.toArray().map(n => n.toFixed(3)).join(',');
    const line = `data-view="${f(camera.position)} | ${f(controls.target)}"`;
    const done = ok => {
      clearTimeout(tagTimer);
      tag.innerHTML = `<span class="muted">${ok ? 'View copied to clipboard' : 'Copy this line'}</span><input class="vt-copy" readonly value='${line}'>`;
      tag.style.left = '16px'; tag.style.top = '16px'; tag.style.pointerEvents = 'auto';
      tag.hidden = false;
      const inp = tag.querySelector('input'); inp.focus(); inp.select();
      tagTimer = setTimeout(() => { tag.hidden = true; tag.style.pointerEvents = ''; }, 15000);
    };
    try { navigator.clipboard.writeText(line).then(() => done(true), () => done(false)); } catch (_) { done(false); }
  });

  host.querySelector('.tools').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'reset') goHome();
    if (act === 'parts') togglePanel();
    if (act === 'spin') {
      controls.autoRotate = !controls.autoRotate;
      b.setAttribute('aria-pressed', controls.autoRotate);
    }
    if (act === 'full') {
      if (document.fullscreenElement) document.exitFullscreen();
      else host.requestFullscreen?.();
    }
  });

  // Only render when something changed, to keep laptops cool
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(host);
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    controls.update();
    if (dirty || controls.autoRotate) { renderer.render(scene, camera); dirty = false; }
  });
}
