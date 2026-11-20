// Home page: snap between the name screen and the works slider, and run the slider's next arrow.
(() => {
  document.documentElement.classList.add('snap');
  const section = document.getElementById('works');
  const root = document.querySelector('.works-slider');
  if (!section || !root) return;

  // Moving between the name screen and the works is one animated "drop":
  // going down accelerates like a fall (the 3D garage camera falls in step with it), going up eases back.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = document.documentElement;
  const hero = document.querySelector('.hero-text');
  const cue = document.querySelector('.scroll-cue');
  let anim = null;
  function glide(target) {
    if (anim) return;
    const from = scrollY, dist = target - from;
    if (Math.abs(dist) < 2) return;
    const down = dist > 0;
    const dur = reduce ? 0 : (down ? 1300 : 1000);
    // fall: ease-in (keeps speeding up until it lands); rise: ease-in-out
    const ease = down ? (t => t * t * t * 0.4 + t * t * 0.6) : (t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2));
    html.classList.remove('snap'); // snapping would fight the animation
    html.style.scrollBehavior = 'auto';
    const t0 = performance.now();
    anim = true;
    const step = now => {
      const t = dur ? Math.min(1, (now - t0) / dur) : 1;
      scrollTo(0, from + dist * ease(t));
      if (t < 1) requestAnimationFrame(step);
      else { anim = null; html.classList.add('snap'); html.style.scrollBehavior = ''; }
    };
    requestAnimationFrame(step);
  }
  const atHero = () => scrollY < section.offsetTop - 2;
  const atWorks = () => scrollY > 2 && scrollY <= section.offsetTop + 2;

  addEventListener('wheel', e => {
    if (e.ctrlKey || Math.abs(e.deltaY) < 4) return;
    let target = null;
    if (e.deltaY > 0 && atHero()) target = section.offsetTop;
    else if (e.deltaY < 0 && atWorks()) target = 0;
    if (target === null) return;
    e.preventDefault();
    glide(target);
  }, { passive: false });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (['ArrowDown', 'PageDown', ' '].includes(e.key) && atHero()) { e.preventDefault(); glide(section.offsetTop); }
    else if (['ArrowUp', 'PageUp'].includes(e.key) && atWorks()) { e.preventDefault(); glide(0); }
  });
  document.querySelectorAll('a[href="#works"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); glide(section.offsetTop); }));

  // The name screen is the ground: it stays solid and slides up out of the way like a surface lifting off,
  // revealing the garage below. Only the "Works" hint fades.
  if (hero) {
    let ticking = false;
    const fade = () => {
      ticking = false;
      const p = Math.min(1, Math.max(0, scrollY / Math.max(1, section.offsetTop)));
      if (cue) cue.style.opacity = String(Math.max(0, 1 - p * 3));
      // the shadow under the ground fades out on landing so it doesn't darken the top of the garage view
      document.querySelector('.hero').style.setProperty('--ground-shadow', (0.85 * (1 - Math.pow(p, 4))).toFixed(3));
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(fade); } }, { passive: true });
    fade();
  }

  const slides = [...root.querySelectorAll('.slide')];
  const cur = root.querySelector('[data-cur]'), total = root.querySelector('[data-total]');
  const pad = n => String(n).padStart(2, '0');
  let i = 0;
  if (total) total.textContent = pad(slides.length);
  slides.forEach((s, k) => s.setAttribute('aria-label', `${k + 1} of ${slides.length}`));

  function show(n) {
    slides[i].classList.remove('is-active');
    slides[i].querySelectorAll('a').forEach(a => a.tabIndex = -1);
    i = (n + slides.length) % slides.length;
    slides[i].classList.add('is-active');
    slides[i].querySelectorAll('a').forEach(a => a.removeAttribute('tabindex'));
    if (cur) cur.textContent = pad(i + 1);
    const nextImg = slides[(i + 1) % slides.length].querySelector('img');
    if (nextImg) nextImg.loading = 'eager'; // preload the one after
  }
  slides.forEach((s, k) => { if (k) s.querySelectorAll('a').forEach(a => a.tabIndex = -1); });
  if (slides.length < 2) root.querySelector('.slide-next')?.remove();

  root.querySelector('.slide-next')?.addEventListener('click', () => show(i + 1));
  document.addEventListener('keydown', e => {
    if (section.classList.contains('has-garage')) return;
    const r = section.getBoundingClientRect();
    if (Math.abs(r.top) > innerHeight / 2) return; // only while the slider is on screen
    if (e.key === 'ArrowRight') show(i + 1);
    if (e.key === 'ArrowLeft') show(i - 1);
  });
  // Swipe on phones
  let x0 = null;
  root.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
  });
})();
