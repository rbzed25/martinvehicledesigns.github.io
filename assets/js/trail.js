// Photo trail: images pop in behind the cursor and fade away in quick succession.
// Set the image list on the .trail element: data-images="a.webp,b.webp,..."
(() => {
  const hero = document.querySelector('.hero');
  const layer = document.querySelector('.trail');
  if (!hero || !layer) return;
  if (matchMedia('(pointer: coarse)').matches) return;               // no mouse on phones/tablets
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const srcs = layer.dataset.images.split(',').map(s => s.trim()).filter(Boolean);
  // Preload so images appear instantly
  srcs.forEach(s => { const i = new Image(); i.src = s; });

  const SPACING = 90;   // px of mouse travel between images
  const LIFE = 900;     // ms each image stays: 0.3s fade in, 0.3s hold, 0.3s fade out (matches the CSS animation)
  const MAX = 14;       // cap on images on screen at once
  let idx = 0, lastX = null, lastY = null;

  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (lastX !== null && Math.hypot(x - lastX, y - lastY) < SPACING) return;
    lastX = x; lastY = y;

    const img = document.createElement('img');
    img.src = srcs[idx++ % srcs.length];
    img.alt = '';
    img.style.left = x + 'px';
    img.style.top = y + 'px';
    img.style.zIndex = idx;
    layer.appendChild(img);
    setTimeout(() => img.remove(), LIFE);
    while (layer.children.length > MAX) layer.firstChild.remove();
  });
  hero.addEventListener('pointerleave', () => { lastX = lastY = null; });
})();
