/* Registration form (_includes/registration_form.html): event-specific fields, live places, preview summary and submission
   to the Apps Script backend (scripts/registration.gs). No dependencies. */
(function () {
  'use strict';

  function phaseAt(cfg, now) {
    if (cfg.status === 'closed') return 'closed';
    if (cfg.status === 'open') return 'open';
    if (now < Date.parse(cfg.opens || '')) return 'before';
    if (now >= Date.parse(cfg.closes || '')) return 'closed';
    return 'open';
  }

  // Eligible birth years from the tournament year and the event's (or default) age limits.
  function birthRange(cfg, ev) {
    var age = Object.assign({}, cfg.age, ev && ev.age);
    return { min: cfg.year - age.max, max: cfg.year - age.min };
  }

  // Same player regardless of case, spacing or surname/given-name order; must match identity() in registration.gs.
  function identity(surname, given, year) {
    var norm = function (s) { return String(s || '').normalize('NFKC').toLowerCase().replace(/[\s'’.\-·]/g, ''); };
    return [norm(surname), norm(given)].sort().join('|') + '|' + String(year || '').trim();
  }

  function isFull(ev, st) {
    return !!st && (st.registered >= (st.capacity || ev.capacity) || st.waitlist > 0);
  }

  function placesText(ev, st) {
    var unit = ev.format === 'doubles' ? '对' : '人';
    if (!st) return ev.capacity + unit;
    if (!isFull(ev, st)) return '剩余 ' + Math.max(0, (st.capacity || ev.capacity) - st.registered) + unit;
    return '已满' + (st.waitlist ? '，等候 ' + st.waitlist + unit : '');
  }

  // ---------- Page
  var root = document.querySelector('[data-reg]');
  if (!root) return;
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var cfg = JSON.parse($('[data-reg-config]').textContent);
  var form = $('form');
  var select = form.elements.event;
  var msg = $('.form__msg', form);
  var btn = $('button[type="submit"]', form);
  var done = $('[data-reg-done]');
  var formId = root.dataset.reg;
  var endpoint = form.dataset.endpoint;
  var preview = !endpoint;
  var phase = phaseAt(cfg, Date.now());
  var btnLabel = preview ? '预览提交 Preview' : btn.textContent;
  var events = {};
  var live = null;
  cfg.events.forEach(function (ev) { events[ev.id] = ev; });
  $$('option', select).forEach(function (o) { if (o.value) o.dataset.base = o.textContent; });

  function current() { return events[select.value] || null; }

  function toggle(el, on) {
    el.hidden = !on;
    if ('disabled' in el) el.disabled = !on;
    else $$('input, select, textarea', el).forEach(function (input) { input.disabled = !on; });
  }

  function statusText(ev, st) {
    if (!st) return { before: '尚未开放', closed: '已截止' }[phase] || '开放报名';
    if (!isFull(ev, st)) return placesText(ev, st);
    return cfg.waitlist === false ? '已满' : '已满，可登记等候' + (st.waitlist ? '（' + st.waitlist + '）' : '');
  }

  function renderStatus() {
    cfg.events.forEach(function (ev) {
      var st = live && live[ev.id];
      var option = $('option[value="' + ev.id + '"]', select);
      if (option) option.textContent = option.dataset.base + '（' + placesText(ev, st) + '）';
      var cell = $('[data-event-row="' + ev.id + '"] [data-event-status]');
      if (cell) {
        cell.textContent = statusText(ev, st);
        cell.classList.toggle('is-full', isFull(ev, st));
      }
    });
    var ev = current();
    var line = $('[data-reg-status]');
    var st = ev && live && live[ev.id];
    var full = !!ev && isFull(ev, st);
    line.hidden = !ev;
    line.classList.toggle('is-full', full);
    if (!ev) return;
    var unit = ev.format === 'doubles' ? '对' : '人';
    if (!full) line.textContent = '名额 ' + ev.capacity + unit + (st ? '，' + placesText(ev, st) : '') + '。';
    else if (cfg.waitlist === false) line.textContent = '本项目已报满，暂停报名。This event is full.';
    else line.textContent = '本项目已报满，提交后将列入等候名单' + (st.waitlist ? '（目前 ' + st.waitlist + unit + '等候）' : '') + '。登记等候名单不代表报名成功。Full: new entries join the waiting list.';
    if (!preview && phase === 'open') btn.disabled = full && cfg.waitlist === false;
  }

  function applyEvent() {
    var ev = current();
    var doubles = !!ev && ev.format === 'doubles';
    $$('[data-doubles-only]', form).forEach(function (el) { toggle(el, doubles); });
    $$('[data-mixed-only]', form).forEach(function (el) { toggle(el, !!ev && ev.gender === 'mixed'); });
    $$('legend[data-legend-double]', form).forEach(function (lg) { lg.textContent = doubles ? lg.dataset.legendDouble : lg.dataset.legendSingle; });
    var range = birthRange(cfg, ev);
    $$('input[name$="_birth_year"]', form).forEach(function (input) { input.min = range.min; input.max = range.max; });
    $$('[data-birth-hint]', form).forEach(function (hint) { hint.textContent = '须 ' + range.min + '–' + range.max + ' 年出生 Born ' + range.min + '–' + range.max; });
    $$('[data-utr-label]', form).forEach(function (label) { label.textContent = doubles ? '单/双打 UTR（取较高）Singles/doubles UTR' : '单打 UTR Singles UTR'; });
    $$('[data-req-for]', form).forEach(function (box) { box.hidden = !ev || box.dataset.reqFor !== ev.id; });
    renderStatus();
  }

  function applyPro(prefix) {
    var yes = $('input[name="' + prefix + '_pro"][value="yes"]', form);
    var box = $('[data-pro="' + prefix + '"]', form);
    if (yes && box) toggle(box, yes.checked);
  }

  function loadStatus() {
    if (preview) return;
    fetch(endpoint + (endpoint.indexOf('?') === -1 ? '?' : '&') + 'form=' + encodeURIComponent(formId))
      .then(function (r) { return r.json(); })
      .then(function (res) { if (res && res.ok) { live = res.events || {}; renderStatus(); } })
      .catch(function () {});
  }

  function labelOf(input) {
    var choice = input.closest('.reg-choice');
    var el = choice ? $('legend', choice) : input.closest('label') && $('.reg-l', input.closest('label'));
    return el ? (el.dataset.sum || el.textContent).replace('*', '').trim() : input.name;
  }

  function crossCheck() {
    var ev = current();
    var f = form.elements;
    if (!ev || ev.format !== 'doubles') return '';
    if (identity(f.p1_surname.value, f.p1_given.value, f.p1_birth_year.value) === identity(f.p2_surname.value, f.p2_given.value, f.p2_birth_year.value)) {
      return '两位球员的姓名和出生年份相同，请检查搭档信息。Player and partner details are identical.';
    }
    if (ev.gender === 'mixed' && f.p1_gender.value === f.p2_gender.value) return '混合双打须为一男一女。Mixed doubles needs one man and one woman.';
    return '';
  }

  // Label/value pairs of everything that will be submitted, shown in preview mode and after submitting.
  function collect() {
    var ev = current();
    var rows = [['项目 Event', ev.name + (ev.name_en ? ' · ' + ev.name_en : '')]];
    $$('fieldset.reg-fs', form).forEach(function (fs) {
      if (fs.matches(':disabled')) return;
      var who = fs.dataset.player ? $('legend', fs).textContent + ' · ' : '';
      $$('input:not([type="checkbox"]), select, textarea', fs).forEach(function (input) {
        if (!input.name || input.name === 'event' || input.matches(':disabled') || (input.type === 'radio' && !input.checked)) return;
        var value = input.type === 'radio' ? input.closest('label').textContent.trim() : input.value.trim();
        if (value) rows.push([who + labelOf(input), value]);
      });
    });
    var boxes = $$('input[type="checkbox"]', form).filter(function (box) { return !box.matches(':disabled'); });
    rows.push(['声明 Declarations', '已确认 ' + boxes.filter(function (box) { return box.required; }).length + ' 项必选声明 Required items confirmed']);
    boxes.filter(function (box) { return !box.required; }).forEach(function (box) {
      var text = box.closest('label').textContent.trim();
      rows.push([text.length > 24 ? text.slice(0, 24) + '…' : text, box.checked ? '同意 Yes' : '不同意 No']);
    });
    return rows;
  }

  function errorText(err) {
    var code = err && err.error;
    var contact = cfg.contact_email;
    if (code === 'duplicate') return '该球员已报名同一比赛日的项目' + (err.event ? '「' + err.event + '」' : '') + '。每位球员每个比赛日只能报名一个项目，如需更改请联系 ' + contact + '。';
    if (code === 'full') return '本项目已报满。This event is full.';
    if (code === 'before') return '报名尚未开放。Registration is not open yet.';
    if (code === 'closed') return '报名已截止。Registration has closed.';
    if (code === 'invalid') {
      if (err.field === 'p2_same' || err.field === 'gender_mix') return crossCheck() || '请检查搭档信息。Please check the partner details.';
      var input = err.field && form.elements[err.field];
      var name = /^agree_/.test(err.field || '') ? '声明 Declarations' : input ? labelOf(input instanceof RadioNodeList ? input[0] : input) : '';
      return '提交的信息有误' + (name ? '：' + name : '') + '，请检查后重试。Please check the form and try again.';
    }
    return '提交失败，请检查网络后重试，或发邮件至 ' + contact + '。Submission failed; please try again.';
  }

  function showDone(kind, res, rows) {
    var ev = current();
    var title = $('[data-done-title]');
    var text = $('[data-done-text]');
    var mail = res && res.email === 'sent' ? '确认邮件已发送，如未收到请检查垃圾邮件。' : '';
    if (kind === 'preview') {
      title.textContent = '预览：将提交的信息 Preview';
      text.textContent = '预览模式不会发送数据。连接 Google 表格后，以下信息将保存为一条报名记录。';
    } else if (kind === 'waitlist') {
      title.textContent = '已加入等候名单 Waitlisted';
      text.textContent = '报名编号 ' + (res.id || '') + '，「' + ev.name + '」等候名单第 ' + res.position + ' 位。如有空位，组委会将按先后顺序联系您；登记等候名单不代表报名成功。' + mail;
    } else {
      title.textContent = '报名成功 Registered';
      text.textContent = '报名编号 ' + (res.id || '') + '，项目「' + ev.name + '」。' + mail + (cfg.fee_note || '');
    }
    var dl = $('[data-done-summary]');
    dl.textContent = '';
    rows.forEach(function (row) {
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = row[0];
      dd.textContent = row[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    done.dataset.kind = kind;
    form.hidden = true;
    done.hidden = false;
    done.focus();
    done.scrollIntoView({ block: 'start' });
  }

  function showForm() {
    if (done.dataset.kind && done.dataset.kind !== 'preview') {
      select.value = '';
      $$('input[type="checkbox"]', form).forEach(function (box) { box.checked = false; });
      applyEvent();
    }
    delete done.dataset.kind;
    done.hidden = true;
    form.hidden = false;
  }

  form.addEventListener('change', function (e) {
    var name = e.target.name || '';
    if (name === 'event') applyEvent();
    else if (/^p[12]_pro$/.test(name)) applyPro(name.slice(0, 2));
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    if (!form.reportValidity()) return;
    var problem = crossCheck();
    if (problem) { msg.textContent = problem; return; }
    var rows = collect();
    if (preview) { showDone('preview', null, rows); return; }
    var data = new URLSearchParams(new FormData(form));
    data.set('form', formId);
    btn.disabled = true;
    btn.textContent = '提交中… Submitting';
    // Form-encoded POST is a CORS "simple request", so Apps Script needs no preflight.
    fetch(endpoint, { method: 'POST', body: data })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw res || {};
        showDone(res.status === 'waitlist' ? 'waitlist' : 'registered', res, rows);
        loadStatus();
      })
      .catch(function (err) { msg.textContent = errorText(err); })
      .then(function () { btn.disabled = false; btn.textContent = btnLabel; renderStatus(); });
  });

  $('[data-reg-back]').addEventListener('click', function () {
    showForm();
    select.focus();
  });

  $$('[data-pick]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      showForm();
      if (!select.matches(':disabled')) {
        select.value = a.dataset.pick;
        applyEvent();
      }
      form.scrollIntoView({ block: 'start' });
      select.focus({ preventScroll: true });
    });
  });

  $$('[data-reg-note]').forEach(function (note) {
    note.hidden = preview ? note.dataset.regNote !== 'preview' : note.dataset.regNote !== phase;
  });
  if (!preview && phase !== 'open') {
    $('[data-reg-lock]', form).disabled = true;
    btn.disabled = true;
  }
  btn.textContent = btnLabel;
  var pre = new URLSearchParams(location.search).get('event');
  if (pre && events[pre]) select.value = pre;
  applyEvent();
  applyPro('p1');
  applyPro('p2');
  loadStatus();
})();
