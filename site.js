// Motion und Interaktion der Startseite. Ohne dieses Skript ist die Seite vollstaendig
// lesbar: der Ruhe-Zustand im Markup ist die fertige Ansicht (--p:1, --step:4).
// Jede Bewegung laeuft nur, solange ihr Element sichtbar ist, nie bei reduced motion.
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Pinning nur, wenn die gepinnte Szene wirklich in den Viewport passt.
  const roomy = matchMedia('(min-width: 861px) and (min-height: 600px)');
  const clamp = (v) => Math.max(0, Math.min(1, v));
  // Vor den Szenen deklariert: syncPinning ruft setPhase schon beim Start auf.
  const phases = [...document.querySelectorAll('.os-phases li')];
  const osTrack = document.querySelector('.os-track');

  // ---------- Gepinnte Szenen: Scroll-Fortschritt als Custom Property ----------
  const scenes = [
    { el: document.querySelector('.hero-track'), prop: '--p', scale: 1 },
    { el: document.querySelector('.os-track'), prop: '--step', scale: 4, onStep: setPhase }
  ].filter((s) => s.el);
  let frame;

  function progress(el) {
    const rect = el.getBoundingClientRect();
    const distance = el.offsetHeight - innerHeight;
    return clamp(-rect.top / Math.max(1, distance));
  }
  function update() {
    frame = undefined;
    for (const s of scenes) {
      if (!s.pinned || !s.visible) continue;
      const value = progress(s.el) * s.scale;
      s.el.style.setProperty(s.prop, value.toFixed(4));
      if (s.onStep) s.onStep(value);
    }
  }
  function request() {
    if (frame === undefined) frame = requestAnimationFrame(update);
  }
  function syncPinning() {
    const pin = roomy.matches && !reduced.matches;
    for (const s of scenes) {
      s.pinned = pin;
      s.el.classList.toggle('is-pinned', pin);
      if (!pin) {
        s.el.style.removeProperty(s.prop);
        if (s.onStep) s.onStep(s.scale);
      }
    }
    request();
  }
  const sceneObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const s = scenes.find((x) => x.el === entry.target);
      if (s) s.visible = entry.isIntersecting;
    }
    request();
  });
  scenes.forEach((s) => sceneObserver.observe(s.el));
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request, { passive: true });
  roomy.addEventListener('change', syncPinning);
  reduced.addEventListener('change', syncPinning);
  syncPinning();

  // ---------- AgentOS: aktive Phase folgt dem Scroll, Klick scrollt zur Phase ----------
  function setPhase(step) {
    const active = Math.min(phases.length - 1, Math.floor(step));
    phases.forEach((li, i) => {
      li.classList.toggle('active', i === active);
      li.querySelector('button').setAttribute('aria-current', i === active ? 'step' : 'false');
    });
  }
  phases.forEach((li, i) => li.querySelector('button').addEventListener('click', () => {
    const s = scenes.find((x) => x.el === osTrack);
    if (!s || !s.pinned) { setPhase(i); return; }
    const distance = osTrack.offsetHeight - innerHeight;
    const top = osTrack.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + distance * ((i + 0.55) / phases.length), behavior: reduced.matches ? 'auto' : 'smooth' });
  }));

  // ---------- Ambient: Band und Puls laufen nur sichtbar ----------
  const ambient = [...document.querySelectorAll('[data-ambient]')];
  const ambientObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.dataset.running = String(entry.isIntersecting && !document.hidden);
  });
  ambient.forEach((el) => ambientObserver.observe(el));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ambient.forEach((el) => { el.dataset.running = 'false'; });
  });

  // ---------- Skizzen: einmal aufbauen, dann stehen lassen ----------
  const buildObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-built');
      buildObserver.unobserve(entry.target);
    }
  }, { threshold: 0.45 });
  document.querySelectorAll('[data-build]').forEach((el) => buildObserver.observe(el));

  // ---------- Projekte: Tabs mit Autoplay, Tastatur und Hover pausieren ----------
  const tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const holdMs = 7000;
    let current = 0, started = 0, elapsed = 0, inView = false, held = false, raf;

    function select(i, focus) {
      tabs.forEach((t, j) => {
        const on = j === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
        t.querySelector('.meter').style.transform = 'scaleX(0)';
      });
      panels[i].classList.remove('entering');
      void panels[i].offsetWidth;
      panels[i].classList.add('entering');
      if (focus) tabs[i].focus();
      current = i; elapsed = 0; started = performance.now();
    }
    function tick(now) {
      raf = undefined;
      if (!inView || held || reduced.matches || document.hidden) return;
      const t = elapsed + (now - started);
      tabs[current].querySelector('.meter').style.transform = `scaleX(${clamp(t / holdMs)})`;
      if (t >= holdMs) select((current + 1) % tabs.length);
      raf = requestAnimationFrame(tick);
    }
    function run() {
      if (raf !== undefined) return;
      started = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function pause() {
      if (raf !== undefined) { cancelAnimationFrame(raf); raf = undefined; elapsed += performance.now() - started; }
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => { select(i); held = true; pause(); });
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault(); held = true; pause();
        select((i + d + tabs.length) % tabs.length, true);
      });
    });
    const area = tablist.closest('section');
    area.addEventListener('pointerenter', () => { held = true; pause(); });
    area.addEventListener('pointerleave', () => { held = false; run(); });
    area.addEventListener('focusin', () => { held = true; pause(); });
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      inView ? run() : pause();
    }, { threshold: 0.3 }).observe(area);
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : inView && run()));
    select(0);
  }

  // ---------- Cursor: weiches Licht auf Karten, leichte Parallaxe der Covers ----------
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.role').forEach((card) => card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
    const covers = document.querySelector('.covers');
    if (covers) {
      covers.addEventListener('pointermove', (e) => {
        if (reduced.matches) return;
        const r = covers.getBoundingClientRect();
        covers.style.setProperty('--cx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        covers.style.setProperty('--cy', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
      covers.addEventListener('pointerleave', () => { covers.style.setProperty('--cx', 0); covers.style.setProperty('--cy', 0); });
    }
  }
})();
