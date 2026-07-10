/* ============================================================
   Módulo2 — camada de animação (GSAP + ScrollTrigger)
   Movimento arquitetônico: preciso, suave, sem exagero.
   Fallback: sem JS / sem GSAP / movimento reduzido => tudo visível.
   ============================================================ */
(function () {
  var docEl = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Remove o estado .anim => revela todo o conteúdo sem animar.
  function revealAll() { docEl.classList.remove('anim'); }

  if (reduce || !window.gsap || !window.ScrollTrigger) { revealAll(); return; }

  gsap.registerPlugin(ScrollTrigger);
  var EASE = 'power3.out';

  /* ---------- 1. HERO — abertura orquestrada no load ---------- */
  var heroTL = gsap.timeline({ defaults: { ease: EASE } });
  // .fromTo com destino explícito (o CSS deixa estes elementos em opacity:0
  // sob .anim, então .from os manteria invisíveis — o destino seria 0).
  heroTL
    .set('.hero__bg img', { scale: 1.16, transformOrigin: '50% 50%' })
    .to('.hero__bg img', { scale: 1.04, duration: 2.6, ease: 'power2.out' }, 0)
    .fromTo('.hero__pill', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .7, stagger: .1 }, 0.2)
    .set('.hero h1', { opacity: 1 }, 0.3)
    .fromTo('.hero h1',
      { clipPath: 'inset(0 0 100% 0)', y: 26 },
      { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1.1 }, 0.3)
    .fromTo('.hero__lead', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .8 }, 0.75)
    .fromTo('.hero__cta > *', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .7, stagger: .12 }, 0.9);

  /* ---------- 2. HERO — parallax suave no scroll ---------- */
  gsap.to('.hero__bg img', {
    yPercent: 16, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
  });
  gsap.to('.hero__copy', {
    yPercent: -9, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
  });

  /* ---------- 3. Header condensa ao rolar ---------- */
  ScrollTrigger.create({
    start: 'top -64',
    toggleClass: { targets: '.header', className: 'header--scrolled' }
  });

  /* ---------- 4. Reveal genérico em lote (com stagger por grupo) ---------- */
  gsap.set('.reveal', { y: 30 });
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%',
    onEnter: function (batch) {
      gsap.to(batch, {
        opacity: 1, y: 0, duration: .9, ease: EASE,
        stagger: .12, overwrite: true, clearProps: 'transform'
      });
    }
  });

  /* ---------- 5. Obras — settle "Ken Burns" na entrada ---------- */
  gsap.utils.toArray('.obra__img img').forEach(function (img) {
    gsap.set(img, { scale: 1.14 });
    ScrollTrigger.create({
      trigger: img, start: 'top 86%', once: true,
      onEnter: function () {
        gsap.to(img, { scale: 1, duration: 1.2, ease: 'power2.out', clearProps: 'transform' });
      }
    });
  });

  /* ---------- 6. Processo — assinatura: o trilho se desenha ---------- */
  if (document.querySelector('.steps')) {
    gsap.set('.step__dot', { scale: 0, transformOrigin: 'center' });
    gsap.set('.step__bar', { scaleX: 0, transformOrigin: 'left center' });
    gsap.timeline({ scrollTrigger: { trigger: '.steps', start: 'top 75%' } })
      .to('.step__dot', { scale: 1, duration: .42, stagger: .18, ease: 'back.out(2)' })
      .to('.step__bar', { scaleX: 1, duration: .55, stagger: .18, ease: 'power2.out' }, 0.18);
  }

  /* ---------- 7. Métricas — contagem crescente ---------- */
  gsap.utils.toArray('.metric b').forEach(function (el) {
    var raw = el.textContent.trim();
    var m = raw.match(/^(\D*)(\d+)(\D*)$/);
    if (!m) return; // valores não numéricos (ex.: "SC · PR")
    var prefix = m[1], target = parseInt(m[2], 10), suffix = m[3];
    var counter = { v: 0 };
    el.textContent = prefix + '0' + suffix;
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: function () {
        gsap.to(counter, {
          v: target, duration: 1.5, ease: 'power2.out',
          onUpdate: function () { el.textContent = prefix + Math.round(counter.v) + suffix; }
        });
      }
    });
  });

  /* ---------- Recalibra posições após carregar fontes/imagens ---------- */
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();

/* ============================================================
   Lightbox das obras — independente do GSAP.
   Funciona com mouse, teclado (Esc / setas) e movimento reduzido.
   ============================================================ */
(function () {
  var lb = document.getElementById('lightbox');
  if (!lb) return;
  var triggers = Array.prototype.slice.call(document.querySelectorAll('.obra__img'));
  if (!triggers.length) return;

  var imgEl = document.getElementById('lbImg');
  var capEl = document.getElementById('lbCap');
  var countEl = document.getElementById('lbCount');
  var btnClose = document.getElementById('lbClose');
  var btnPrev = document.getElementById('lbPrev');
  var btnNext = document.getElementById('lbNext');

  // Cada obra pode ter várias fotos (data-photos). Navegação de prev/next
  // fica restrita às fotos da MESMA obra — não passa para a obra seguinte.
  var groups = triggers.map(function (t) {
    var name = t.getAttribute('data-name') || '';
    var meta = t.getAttribute('data-meta') || '';
    var photos;
    try { photos = JSON.parse(t.getAttribute('data-photos') || '[]'); }
    catch (e) { photos = []; }
    if (!photos.length) {
      var inner = t.querySelector('img');
      photos = [{ src: inner ? inner.src : '', alt: inner ? inner.alt : '' }];
    }
    return { name: name, meta: meta, photos: photos };
  });

  var activeGroup = null, idx = 0, lastFocus = null;

  function render() {
    var photo = activeGroup.photos[idx];
    imgEl.src = photo.src;
    imgEl.alt = photo.alt || '';
    capEl.innerHTML = '<b>' + activeGroup.name + '</b>' + (photo.caption || activeGroup.meta);
    var multi = activeGroup.photos.length > 1;
    countEl.textContent = multi ? (idx + 1) + ' / ' + activeGroup.photos.length : '';
    btnPrev.style.display = multi ? '' : 'none';
    btnNext.style.display = multi ? '' : 'none';
  }
  function open(i) {
    activeGroup = groups[i]; idx = 0;
    lastFocus = document.activeElement; render();
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    btnClose.focus();
  }
  function close() {
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function go(d) {
    var n = activeGroup.photos.length;
    idx = (idx + d + n) % n; render();
  }

  triggers.forEach(function (t, i) {
    t.addEventListener('click', function () { open(i); });
  });
  btnClose.addEventListener('click', close);
  btnPrev.addEventListener('click', function () { go(-1); });
  btnNext.addEventListener('click', function () { go(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  });
})();
