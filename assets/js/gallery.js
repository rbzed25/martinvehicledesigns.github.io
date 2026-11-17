// Photo galleries + one shared full-screen lightbox.
// A page can have several galleries (e.g. one per section); the lightbox steps through all of them in page order.
// Markup: <div class="gallery" data-label="Exterior" data-base="../assets/img/997horseman/"
//              data-photos='[{"src","thumb","w","h","caption"}]'></div>
// The lightbox caption is the photo's caption if it has one, otherwise the gallery's data-label.
(() => {
  const galleries = [...document.querySelectorAll('.gallery')];
  if (!galleries.length) return;
  const photos = [];

  // Justified layout: every row exactly fills the gallery width (no open spaces).
  // Photos keep their aspect ratio; the number per row is chosen so row heights stay close to a target.
  // Wide landscape shots (aspect >= 1.5) always get a full row to themselves.
  const GAP = 10;
  const items = []; // {g, btn, ar}

  galleries.forEach(g => {
    const base = g.dataset.base || '';
    const label = g.dataset.label || '';
    const list = [];
    JSON.parse(g.dataset.photos).forEach(p => {
      const i = photos.length;
      photos.push({ src: base + p.src, caption: p.caption || label });
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `Open photo ${i + 1}${p.caption || label ? ': ' + (p.caption || label) : ''}`);
      const img = document.createElement('img');
      img.src = base + p.thumb; img.alt = p.caption || label;
      img.loading = 'lazy'; img.decoding = 'async';
      if (p.w && p.h) { img.width = p.w; img.height = p.h; }
      b.appendChild(img);
      b.addEventListener('click', () => open(i));
      list.push({ btn: b, ar: (p.w && p.h) ? p.w / p.h : 0.75 });
    });
    g._items = list;
  });

  function rowsFor(list, W, target) {
    // Split at forced solo rows, then partition each run optimally (dynamic programming).
    const rows = [];
    let run = [];
    const flush = () => { if (run.length) rows.push(...partition(run, W, target)); run = []; };
    list.forEach(it => { if (it.ar >= 1.5) { flush(); rows.push([it]); } else run.push(it); });
    flush();
    return rows;
  }
  function partition(run, W, target) {
    const n = run.length, MAX = W < 600 ? 2 : 4;
    const cost = new Array(n + 1).fill(Infinity), prev = new Array(n + 1).fill(0);
    cost[0] = 0;
    for (let i = 1; i <= n; i++) {
      let arSum = 0;
      for (let k = 1; k <= Math.min(MAX, i); k++) {
        arSum += run[i - k].ar;
        const h = (W - GAP * (k - 1)) / arSum;
        const c = cost[i - k] + Math.pow((h - target) / target, 2);
        if (c < cost[i]) { cost[i] = c; prev[i] = i - k; }
      }
    }
    const rows = [];
    for (let i = n; i > 0; i = prev[i]) rows.unshift(run.slice(prev[i], i));
    return rows;
  }
  function layout() {
    galleries.forEach(g => {
      const W = g.clientWidth; if (!W) return;
      const target = W < 600 ? 260 : Math.min(420, Math.max(300, W * 0.28));
      g.textContent = '';
      rowsFor(g._items, W, target).forEach(row => {
        const arSum = row.reduce((a, it) => a + it.ar, 0);
        const h = (W - GAP * (row.length - 1)) / arSum;
        const r = document.createElement('div');
        r.className = 'g-row';
        r.style.height = h + 'px';
        row.forEach(it => { it.btn.style.width = (it.ar * h) + 'px'; r.appendChild(it.btn); });
        g.appendChild(r);
      });
    });
  }
  layout();
  let lastW = 0;
  new ResizeObserver(() => {
    const w = galleries[0].clientWidth;
    if (Math.abs(w - lastW) > 2) { lastW = w; layout(); }
  }).observe(galleries[0]);

  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.innerHTML = `
    <div class="lb-top"><span class="lb-count"></span><button type="button" class="lb-close">Close</button></div>
    <div class="lb-stage">
      <img alt="">
      <button type="button" class="lb-nav lb-prev" aria-label="Previous photo">Prev</button>
      <button type="button" class="lb-nav lb-next" aria-label="Next photo">Next</button>
    </div>
    <div class="lb-bottom"><span class="lb-cap muted"></span><span></span></div>`;
  document.body.appendChild(lb);
  const big = lb.querySelector('.lb-stage img');
  const count = lb.querySelector('.lb-count');
  const cap = lb.querySelector('.lb-cap');
  let cur = 0, lastFocus = null;

  function show(i) {
    cur = (i + photos.length) % photos.length;
    const p = photos[cur];
    big.src = p.src; big.alt = p.caption || '';
    count.textContent = `${String(cur + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}`;
    cap.textContent = p.caption || '';
    [cur + 1, cur - 1].forEach(n => { new Image().src = photos[(n + photos.length) % photos.length].src; });
  }
  function open(i) { lastFocus = document.activeElement; show(i); lb.classList.add('open'); document.body.style.overflow = 'hidden'; lb.querySelector('.lb-close').focus(); }
  function close() { lb.classList.remove('open'); document.body.style.overflow = ''; lastFocus && lastFocus.focus(); }

  lb.querySelector('.lb-close').onclick = close;
  lb.querySelector('.lb-prev').onclick = () => show(cur - 1);
  lb.querySelector('.lb-next').onclick = () => show(cur + 1);
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  });
  let sx = null;
  lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
  });
})();
