// Registration backend: Google Apps Script bound to a Google Sheet (Extensions > Apps Script).
// Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone, then put the /exec URL in endpoint of
// _data/registration/<id>.yml. Events, places and limits are read from the published site (CONFIG_URL), so edit the
// YAML and push to change them. Each form id gets its own tab. In the Status column, registered and waitlist hold a
// place; anything else (e.g. withdrawn) frees it. Promote a waitlisted entry by changing it to registered.
// See skills/generate_registration/README.md.

const CONFIG_URL = 'https://actc.org.au/registration/forms.json';
const CONFIG_CACHE_SECONDS = 300;
const SEND_CONFIRMATION = true;
const ACTIVE = ['registered', 'waitlist'];
const PLAYER_FIELDS = [
  ['surname', 'Surname'], ['given', 'Given name'], ['english', 'English name'], ['gender', 'Gender'],
  ['birth_year', 'Birth year'], ['origin', 'From'], ['ntrp', 'NTRP'], ['utr', 'UTR'], ['pro', 'Pro'],
  ['pro_year', 'Pro retired'], ['pro_detail', 'Pro details'], ['mobile', 'Mobile'], ['email', 'Email'], ['wechat', 'WeChat'],
];
const HEADERS = ['Timestamp', 'ID', 'Status', 'Event ID', 'Event', 'Day']
  .concat(PLAYER_FIELDS.map(f => 'P1 ' + f[1]), PLAYER_FIELDS.map(f => 'P2 ' + f[1]))
  .concat(['Emergency contact', 'Notes', 'Optional consents', 'Confirmation email']);
const LIMITS = { surname: 40, given: 60, english: 40, origin: 60, ntrp: 20, pro_detail: 120, mobile: 20, email: 120, wechat: 40 };
const MOBILE = /^[0-9 +()\-]{8,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doGet(e) {
  try {
    const id = String((e && e.parameter && e.parameter.form) || '');
    const form = loadForm(id);
    if (!form) return json({ ok: false, error: 'unknown_form' });
    return json({ ok: true, phase: phaseAt(form, Date.now()), events: counts(readTable(sheetFor(id, false)).rows, form) });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  }
}

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.website) return json({ ok: true, status: 'registered' }); // honeypot filled in: silently drop bots
    const id = String(p.form || '');
    const form = loadForm(id);
    if (!form) return json({ ok: false, error: 'unknown_form' });
    const phase = phaseAt(form, Date.now());
    if (phase !== 'open') return json({ ok: false, error: phase });
    const checked = validateEntry(p, form);
    if (checked.error) return json({ ok: false, error: 'invalid', field: checked.error });
    const saved = save(id, form, checked.entry);
    if (saved.error) return json({ ok: false, error: saved.error, event: saved.event });
    const email = SEND_CONFIRMATION ? sendConfirmation(form, checked.entry, saved) : 'off';
    return json({ ok: true, id: saved.id, status: saved.status, position: saved.position, email: email });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  }
}

function loadForm(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
  const cache = CacheService.getScriptCache();
  let text = cache.get('forms');
  if (!text) {
    const res = UrlFetchApp.fetch(CONFIG_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Config ' + CONFIG_URL + ' returned ' + res.getResponseCode());
    text = res.getContentText();
    try { cache.put('forms', text, CONFIG_CACHE_SECONDS); } catch (err) { console.error(err); }
  }
  const forms = JSON.parse(text);
  return Object.prototype.hasOwnProperty.call(forms, id) ? forms[id] : null;
}

function phaseAt(form, now) {
  if (form.status === 'closed') return 'closed';
  if (form.status === 'open') return 'open';
  if (now < Date.parse(form.opens || '')) return 'before';
  if (now >= Date.parse(form.closes || '')) return 'closed';
  return 'open';
}

function birthRange(form, ev) {
  const age = Object.assign({}, form.age, ev && ev.age);
  return { min: form.year - age.max, max: form.year - age.min };
}

// Same player regardless of case, spacing or surname/given-name order; must match identity() in js/registration.js.
function identity(surname, given, year) {
  const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s'’.\-·]/g, '');
  return [norm(surname), norm(given)].sort().join('|') + '|' + String(year || '').trim();
}

function validateEntry(p, form) {
  const ev = (form.events || []).filter(item => item.id === p.event)[0];
  if (!ev) return { error: 'event' };
  const doubles = ev.format === 'doubles';
  const range = birthRange(form, ev);
  const players = [];
  for (let n = 1; n <= (doubles ? 2 : 1); n++) {
    const pre = 'p' + n + '_';
    const pl = {};
    PLAYER_FIELDS.forEach(f => { pl[f[0]] = String(p[pre + f[0]] || '').trim(); });
    for (const key in LIMITS) {
      if (pl[key].length > LIMITS[key]) return { error: pre + key };
    }
    if (!pl.surname) return { error: pre + 'surname' };
    if (!pl.given) return { error: pre + 'given' };
    if (ev.gender === 'mixed') {
      if (pl.gender !== 'male' && pl.gender !== 'female') return { error: pre + 'gender' };
    } else {
      pl.gender = ev.gender === 'male' || ev.gender === 'female' ? ev.gender : '';
    }
    if (!/^\d{4}$/.test(pl.birth_year) || +pl.birth_year < range.min || +pl.birth_year > range.max) return { error: pre + 'birth_year' };
    if ((form.origins || []).indexOf(pl.origin) === -1) return { error: pre + 'origin' };
    if (!pl.ntrp) return { error: pre + 'ntrp' };
    if (pl.utr && !(/^\d{1,2}(\.\d{1,2})?$/.test(pl.utr) && +pl.utr >= 1 && +pl.utr <= 16.5)) return { error: pre + 'utr' };
    if (pl.pro === 'yes') {
      if (!/^\d{4}$/.test(pl.pro_year) || +pl.pro_year < 1950 || +pl.pro_year > form.year) return { error: pre + 'pro_year' };
      if (!pl.pro_detail) return { error: pre + 'pro_detail' };
    } else if (pl.pro === 'no') {
      pl.pro_year = '';
      pl.pro_detail = '';
    } else {
      return { error: pre + 'pro' };
    }
    if (!MOBILE.test(pl.mobile)) return { error: pre + 'mobile' };
    if ((n === 1 || pl.email) && !EMAIL.test(pl.email)) return { error: pre + 'email' };
    players.push(pl);
  }
  if (doubles) {
    const [a, b] = players;
    if (identity(a.surname, a.given, a.birth_year) === identity(b.surname, b.given, b.birth_year)) return { error: 'p2_same' };
    if (ev.gender === 'mixed' && a.gender === b.gender) return { error: 'gender_mix' };
  }
  const optional = [];
  for (const d of form.declarations || []) {
    if (d.doubles_only && !doubles) continue;
    const agreed = p['agree_' + d.id] === 'yes';
    if (d.required && !agreed) return { error: 'agree_' + d.id };
    if (!d.required && agreed) optional.push(d.id);
  }
  const emergency = String(p.emergency || '').trim();
  const notes = String(p.notes || '').trim();
  if (emergency.length > 100) return { error: 'emergency' };
  if (notes.length > 300) return { error: 'notes' };
  return { entry: { event: ev, players: players, emergency: emergency, notes: notes, optional: optional } };
}

function statusOf(row) {
  return String(row['Status'] || '').trim().toLowerCase();
}

function rowKeys(row) {
  return [1, 2].filter(n => row['P' + n + ' Surname'] !== undefined && String(row['P' + n + ' Surname']).trim())
    .map(n => identity(row['P' + n + ' Surname'], row['P' + n + ' Given name'], row['P' + n + ' Birth year']));
}

// New entries wait while anyone is already waiting, so a freed place goes to the waiting list in order.
function decide(rows, form, entry) {
  const ev = entry.event;
  const keys = entry.players.map(pl => identity(pl.surname, pl.given, pl.birth_year));
  const dayOf = row => {
    const known = (form.events || []).filter(item => item.id === String(row['Event ID']))[0];
    return known ? known.day : String(row['Day']);
  };
  const active = rows.filter(row => ACTIVE.indexOf(statusOf(row)) !== -1);
  const clash = active.filter(row => dayOf(row) === ev.day).filter(row => rowKeys(row).some(k => keys.indexOf(k) !== -1))[0];
  if (clash) return { error: 'duplicate', event: String(clash['Event']) };
  const same = active.filter(row => String(row['Event ID']) === ev.id);
  const registered = same.filter(row => statusOf(row) === 'registered').length;
  const waiting = same.length - registered;
  if (registered < ev.capacity && waiting === 0) return { status: 'registered' };
  if (form.waitlist === false) return { error: 'full', event: ev.name };
  return { status: 'waitlist', position: waiting + 1 };
}

function counts(rows, form) {
  const out = {};
  (form.events || []).forEach(ev => { out[ev.id] = { capacity: ev.capacity, registered: 0, waitlist: 0 }; });
  rows.forEach(row => {
    const count = out[String(row['Event ID'])];
    const status = statusOf(row);
    if (count && ACTIVE.indexOf(status) !== -1) count[status]++;
  });
  return out;
}

function nextId(rows, formId) {
  const prefix = formId + '-';
  let max = 0;
  rows.forEach(row => {
    const id = String(row['ID'] || '');
    if (id.indexOf(prefix) === 0) max = Math.max(max, Number(id.slice(prefix.length)) || 0);
  });
  return prefix + String(max + 1).padStart(4, '0');
}

function sheetFor(id, create) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(id);
  if (!sheet && create) {
    sheet = book.insertSheet(id);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Rows as objects keyed by header, so organisers can add or move columns without breaking the script.
function readTable(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return { headers: [], rows: [] };
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const rows = values.slice(1).map(cells => {
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
  return { headers: headers, rows: rows };
}

function ensureHeaders(sheet, headers) {
  if (!headers.length) {
    sheet.appendRow(HEADERS);
    return HEADERS.slice();
  }
  const missing = HEADERS.filter(h => headers.indexOf(h) === -1);
  if (missing.length) sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  return headers.concat(missing);
}

function save(formId, form, entry) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = sheetFor(formId, true);
    const table = readTable(sheet);
    const result = decide(table.rows, form, entry);
    if (result.error) return result;
    result.id = nextId(table.rows, formId);
    const headers = ensureHeaders(sheet, table.headers);
    const record = {
      'Timestamp': Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyy-MM-dd HH:mm:ss'),
      'ID': result.id, 'Status': result.status, 'Event ID': entry.event.id, 'Event': entry.event.name, 'Day': entry.event.day,
      'Emergency contact': entry.emergency, 'Notes': entry.notes, 'Optional consents': entry.optional.join(', '),
      'Confirmation email': SEND_CONFIRMATION ? 'pending' : 'off',
    };
    entry.players.forEach((pl, i) => PLAYER_FIELDS.forEach(f => { record['P' + (i + 1) + ' ' + f[1]] = pl[f[0]]; }));
    sheet.appendRow(headers.map(h => (Object.prototype.hasOwnProperty.call(record, h) ? asText(record[h]) : '')));
    SpreadsheetApp.flush();
    result.sheet = sheet;
    result.row = sheet.getLastRow();
    result.column = headers.indexOf('Confirmation email') + 1;
    return result;
  } finally {
    lock.releaseLock();
  }
}

function confirmationText(form, entry, saved) {
  const ev = entry.event;
  const names = entry.players.map(pl => pl.surname + ' ' + pl.given + (pl.english ? ' (' + pl.english + ')' : '')).join(' / ');
  const waitlist = saved.status === 'waitlist';
  return {
    subject: '[ACTC] ' + (waitlist ? '等候名单登记 Waitlist' : '报名确认 Entry received') + ' ' + saved.id + ' ' + ev.name,
    body: [
      names + '，您好：',
      '',
      '我们已收到您的' + form.title + '报名。We have received your entry.',
      '',
      '报名编号 Entry ID：' + saved.id,
      '项目 Event：' + ev.name + (ev.name_en ? ' / ' + ev.name_en : ''),
      '状态 Status：' + (waitlist
        ? '等候名单第 ' + saved.position + ' 位 Waitlist #' + saved.position + '。如有空位，组委会将按先后顺序联系您；登记等候名单不代表报名成功。'
        : '已报名 Registered'),
      '球员 Player(s)：' + names,
      '',
      form.fee_note || '',
      '如需更改或退赛，请回复本邮件或联系 ' + form.contact_email + '。To change or withdraw, reply to this email.',
      '',
      '澳洲华人网球会 Australian Chinese Tennis Club',
    ].join('\n'),
  };
}

function sendConfirmation(form, entry, saved) {
  const to = entry.players.map(pl => pl.email).filter((mail, i, all) => mail && all.findIndex(m => m.toLowerCase() === mail.toLowerCase()) === i);
  let status = 'sent';
  try {
    if (MailApp.getRemainingDailyQuota() < to.length) {
      status = 'quota';
    } else {
      const text = confirmationText(form, entry, saved);
      MailApp.sendEmail({ to: to.join(','), subject: text.subject, body: text.body, name: 'ACTC', replyTo: form.contact_email });
    }
  } catch (err) {
    console.error(err);
    status = 'failed';
  }
  try {
    if (saved.column > 0) saved.sheet.getRange(saved.row, saved.column).setValue(status);
  } catch (err) {
    console.error(err);
  }
  return status;
}

// Leading apostrophe stores the value as text in Sheets; a second one survives CSV export so Excel
// won't evaluate values starting with = + - @ as formulas.
function asText(v) {
  v = String(v === undefined || v === null ? '' : v);
  return v ? "'" + (/^[=+\-@]/.test(v) ? "'" + v : v) : '';
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
