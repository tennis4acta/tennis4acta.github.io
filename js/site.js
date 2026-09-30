/* ACTC site behaviour: navigation, theme, countdown/phase, tabs, filters, calendar export, lightbox and legacy widgets. No dependencies. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var cfg = window.ACTC || { days: [], reg: {} };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme ---------- */
  var themeBtn = $('[data-theme-toggle]');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('actc-theme', next); } catch (e) {}
    });
  }
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      var saved = null;
      try { saved = localStorage.getItem('actc-theme'); } catch (err) {}
      if (!saved) root.dataset.theme = e.matches ? 'dark' : 'light';
    });
  }

  /* ---------- Navigation drawer ---------- */
  var navBtn = $('[data-nav-toggle]');
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    if (navBtn) navBtn.setAttribute('aria-expanded', String(open));
  }
  if (navBtn) {
    navBtn.addEventListener('click', function () { setNav(!document.body.classList.contains('nav-open')); });
    $$('#site-nav a').forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 960) setNav(false); });
  }

  /* ---------- Header shadow and back-to-top ---------- */
  var header = $('.site-header');
  var toTop = $('[data-to-top]');
  function onScroll() {
    var y = window.scrollY || 0;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    if (toTop) toTop.classList.toggle('is-on', y > 700);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });

  /* ---------- Scroll reveal ---------- */
  var reveal = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    reveal.forEach(function (el) { io.observe(el); });
  } else {
    reveal.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- Tournament phase and countdown ---------- */
  function ts(s) { return s ? new Date(s).getTime() : NaN; }
  var opens = ts(cfg.reg && cfg.reg.opens);
  var closes = ts(cfg.reg && cfg.reg.closes);
  var days = (cfg.days || []).map(function (d) { return { id: d.id, name: d.name, start: ts(d.start), end: ts(d.end), dateText: d.dateText }; });
  var firstStart = days.length ? days[0].start : NaN;
  var lastEnd = days.length ? days[days.length - 1].end : NaN;

  function phaseAt(now) {
    var o = cfg.reg && cfg.reg.override;
    if (now >= lastEnd) return 'finished';
    if (now >= firstStart) return 'running';
    if (o === 'closed' || o === 'full') return 'closed';
    if (o === 'open') return 'open';
    if (now < opens) return 'before_open';
    if (now < closes) return 'open';
    return 'closed';
  }

  function ctaFor(phase) {
    var url = cfg.reg && cfg.reg.url;
    if (phase === 'open' && url) return { text: '立即报名', href: url, external: /^https?:/.test(url) };
    if (phase === 'before_open') return { text: '报名 ' + (cfg.reg.opensShort || '') + ' 开放', href: '#events' };
    if (phase === 'open') return { text: '查看比赛项目', href: '#events' };
    return null;
  }

  var phase = null;
  function applyPhase() {
    var now = Date.now();
    var p = phaseAt(now);
    if (p !== phase) {
      phase = p;
      root.dataset.phase = p;
      $$('[data-show]').forEach(function (el) { el.hidden = el.dataset.show.split(/\s+/).indexOf(p) === -1; });
      var cta = ctaFor(p);
      var home = location.pathname.replace(/\/index\.html$/, '/') === '/' || document.querySelector('.hero');
      $$('[data-cta]').forEach(function (a) {
        if (!cta) { a.hidden = true; return; }
        a.textContent = cta.text;
        a.setAttribute('href', cta.href.charAt(0) === '#' && !home ? '/' + cta.href : cta.href);
        if (cta.external) { a.target = '_blank'; a.rel = 'noopener'; }
        a.hidden = false;
      });
      var bar = $('[data-cta-bar]');
      if (bar) bar.hidden = !cta || !!$('.hero');
      updateSteps(now);
    }
    updateCountdown(now);
  }

  function updateCountdown(now) {
    var target = NaN, label = '';
    if (phase === 'before_open') { target = opens; label = '距离报名开放'; }
    else if (phase === 'open') { target = closes; label = '距离报名截止'; }
    else if (phase === 'closed') { target = firstStart; label = '距离比赛开始'; }
    $$('[data-countdown]').forEach(function (box) {
      if (isNaN(target)) { box.hidden = true; return; }
      var left = Math.max(0, Math.floor((target - now) / 1000));
      var parts = { d: Math.floor(left / 86400), h: Math.floor(left % 86400 / 3600), m: Math.floor(left % 3600 / 60), s: left % 60 };
      $('[data-cd-label]', box).textContent = label;
      Object.keys(parts).forEach(function (k) {
        var el = $('[data-cd="' + k + '"]', box);
        if (el) el.textContent = k === 'd' ? parts[k] : String(parts[k]).padStart(2, '0');
      });
      box.hidden = false;
    });
  }

  function updateSteps(now) {
    var steps = $$('[data-steps] .step');
    var nextSet = false;
    steps.forEach(function (s) {
      var at = ts(s.dataset.at);
      s.classList.remove('is-done', 'is-next');
      if (at <= now) s.classList.add('is-done');
      else if (!nextSet) { s.classList.add('is-next'); nextSet = true; }
    });
  }

  if (days.length) {
    applyPhase();
    setInterval(function () { if (!document.hidden) applyPhase(); }, 1000);
  }

  /* ---------- Tabs ---------- */
  $$('[data-tabs]').forEach(function (box) {
    var tabs = $$('[role="tab"]', box);
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (n === null) return;
        var target = tabs[(n + tabs.length) % tabs.length];
        select(target); target.focus(); e.preventDefault();
      });
    });
    var initial = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
    if (initial) select(initial);
  });

  /* ---------- Add to calendar (.ics) ---------- */
  function icsStamp(ms) { return new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, ''); }
  function esc(s) { return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
  $$('[data-ics]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ACTC//Tournament//ZH', 'CALSCALE:GREGORIAN'];
      var events = days.map(function (d) { return { title: cfg.title + ' - ' + d.name, start: d.start, end: d.end, uid: 'actc-' + cfg.year + '-' + d.id }; });
      if (!isNaN(opens)) events.push({ title: cfg.title + ' - 报名开放', start: opens, end: opens + 3600000, uid: 'actc-' + cfg.year + '-reg' });
      events.forEach(function (e) {
        lines.push('BEGIN:VEVENT', 'UID:' + e.uid + '@actc.org.au', 'DTSTAMP:' + icsStamp(Date.now()), 'DTSTART:' + icsStamp(e.start), 'DTEND:' + icsStamp(e.end),
          'SUMMARY:' + esc(e.title), 'LOCATION:' + esc(cfg.venue || ''), 'END:VEVENT');
      });
      lines.push('END:VCALENDAR');
      var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'actc-' + cfg.year + '.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  });

  /* ---------- Filterable lists (history) ---------- */
  $$('[data-filter-list]').forEach(function (box) {
    var chips = $$('[data-kind]', box.parentNode).filter(function (c) { return c.tagName === 'BUTTON'; });
    var search = $('[data-search]', box.parentNode);
    var items = $$('[data-item]', box);
    var groups = $$('[data-group]', box);
    var empty = $('[data-empty]', box.parentNode);
    var kind = 'all';
    function run() {
      var q = search ? search.value.trim().toLowerCase() : '';
      var shown = 0;
      items.forEach(function (it) {
        var ok = (kind === 'all' || it.dataset.kind === kind) && (!q || it.textContent.toLowerCase().indexOf(q) !== -1 || (it.dataset.year || '').indexOf(q) !== -1);
        it.hidden = !ok; if (ok) shown++;
      });
      groups.forEach(function (g) { g.hidden = !$$('[data-item]:not([hidden])', g).length; });
      if (empty) empty.hidden = shown > 0;
    }
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        kind = c.dataset.kind;
        chips.forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
        run();
      });
    });
    if (search) search.addEventListener('input', run);
  });

  /* ---------- Content upgrades (legacy pages) ---------- */
  $$('.prose table').forEach(function (t) {
    if (t.parentNode.classList.contains('table-scroll') || t.parentNode.classList.contains('table-responsive')) return;
    var w = document.createElement('div'); w.className = 'table-scroll';
    t.parentNode.insertBefore(w, t); w.appendChild(t);
  });
  $$('.prose iframe:not([loading])').forEach(function (f) { f.loading = 'lazy'; });
  $$('.prose img:not([loading])').forEach(function (i) { i.loading = 'lazy'; i.decoding = 'async'; });
  $$('a[target="_blank"]:not([rel])').forEach(function (a) { a.rel = 'noopener'; });

  /* Carousel (replaces Bootstrap's) */
  $$('.carousel').forEach(function (c) {
    var items = $$('.item', c);
    if (!items.length) return;
    var dots = $$('[data-slide-to]', c);
    var i = Math.max(0, items.findIndex(function (x) { return x.classList.contains('active'); }));
    var timer = null;
    function go(n) {
      i = (n + items.length) % items.length;
      items.forEach(function (it, k) { it.classList.toggle('active', k === i); });
      dots.forEach(function (d, k) { d.classList.toggle('active', k === i); });
    }
    $$('[data-slide]', c).forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); go(i + (a.dataset.slide === 'prev' ? -1 : 1)); });
    });
    dots.forEach(function (d) { d.addEventListener('click', function () { go(+d.dataset.slideTo); }); });
    var x0 = null;
    c.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    c.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    if (c.dataset.ride && !reduceMotion) {
      var start = function () { timer = setInterval(function () { go(i + 1); }, 5000); };
      var stop = function () { clearInterval(timer); };
      start(); c.addEventListener('mouseenter', stop); c.addEventListener('mouseleave', start);
      c.addEventListener('focusin', stop); c.addEventListener('focusout', start);
    }
    go(i);
  });

  /* ---------- Lightbox ---------- */
  var lbItems = [];
  function lbSource(el) {
    if (el.tagName === 'A') return el.getAttribute('href');
    return el.currentSrc || el.src;
  }
  function collect() {
    var list = [];
    $$('[data-lightbox], .prose a[data-gallery], .prose img').forEach(function (el) {
      if (el.tagName === 'IMG') {
        if (el.closest('a[href]') || el.closest('.carousel') || el.closest('.pcard') || el.classList.contains('no-lightbox')) return;
        if (el.naturalWidth && el.naturalWidth < 200) return;
      }
      list.push(el);
    });
    return list;
  }
  function openLightbox(index) {
    var ov = document.createElement('div');
    ov.className = 'lb'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<img alt=""><button class="lb-x" aria-label="关闭">&times;</button><button class="lb-p" aria-label="上一张">&lsaquo;</button><button class="lb-n" aria-label="下一张">&rsaquo;</button><div class="lb-c"></div>';
    var img = $('img', ov), cap = $('.lb-c', ov);
    var cur = index, x0 = null;
    function show(n) {
      cur = (n + lbItems.length) % lbItems.length;
      img.src = lbSource(lbItems[cur]);
      cap.textContent = lbItems.length > 1 ? (cur + 1) + ' / ' + lbItems.length : '';
    }
    function close() { ov.remove(); document.removeEventListener('keydown', key); document.body.style.overflow = ''; }
    function key(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(cur - 1);
      else if (e.key === 'ArrowRight') show(cur + 1);
    }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    $('.lb-x', ov).addEventListener('click', close);
    $('.lb-p', ov).addEventListener('click', function () { show(cur - 1); });
    $('.lb-n', ov).addEventListener('click', function () { show(cur + 1); });
    ov.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    ov.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    if (lbItems.length < 2) { $('.lb-p', ov).hidden = true; $('.lb-n', ov).hidden = true; }
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    document.body.appendChild(ov);
    show(cur);
    $('.lb-x', ov).focus();
  }
  document.addEventListener('click', function (e) {
    var target = e.target.closest && (e.target.closest('[data-lightbox], .prose a[data-gallery]') || e.target.closest('.prose img'));
    if (!target) return;
    lbItems = collect();
    var idx = lbItems.indexOf(target);
    if (idx === -1) return;
    e.preventDefault();
    openLightbox(idx);
  });
})();
