// Shared behaviour: menu, scroll reveals, email link assembly, footer year.
(() => {
  // Always open a page at the top (browsers otherwise restore the old scroll position on reload/back),
  // unless the link points at a section like index.html#works.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);

  const toggle = document.querySelector('.menu-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', open);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) toggle.click();
    });
  }

  // Fade sections in as they scroll into view
  const io = 'IntersectionObserver' in window && new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in'));

  // Email is assembled in the browser so the address isn't sitting in the HTML for spam bots
  document.querySelectorAll('[data-email]').forEach(a => {
    const [user, domain] = a.dataset.email.split('|');
    const addr = `${user}@${domain}`;
    a.href = `mailto:${addr}`;
    const t = a.querySelector('[data-email-text]');
    if (t) t.textContent = addr;
  });

  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();
