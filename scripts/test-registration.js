'use strict';

// Simulated Apps Script tests: scripts/registration.gs runs in a VM with in-memory Sheets, Lock, Cache, UrlFetch and
// Mail services. No Google services or network are used.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildConfig, parseEvents } = require('../skills/generate_registration/generate_registration');

const root = path.join(__dirname, '..');
const gsSource = fs.readFileSync(path.join(__dirname, 'registration.gs'), 'utf8');
const includeSource = fs.readFileSync(path.join(root, '_includes', 'registration_form.html'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'js', 'registration.js'), 'utf8');

function makeForms(overrides = {}) {
  const { config } = buildConfig({ year: 2028, events: parseEvents('Mens Singles Grade A=2; Womens Singles=4; Mixed Doubles=4; Seniors Doubles 50-70=4') });
  return { 'test-2028': { ...config, ...overrides } };
}

// Emulates Sheets: one leading apostrophe marks text and is not part of the stored value.
function fakeSheet() {
  const data = [];
  const stored = value => (typeof value === 'string' && value[0] === '\'' ? value.slice(1) : value);
  const width = () => Math.max(0, ...data.map(row => row.length));
  return {
    data,
    getLastRow: () => data.length,
    getDataRange: () => ({ getValues: () => data.map(row => Array.from({ length: width() }, (_, i) => (row[i] === undefined ? '' : row[i]))) }),
    appendRow: row => { data.push(Array.from(row, stored)); },
    getRange: (row, column, rows = 1, columns = 1) => ({
      setValue: value => { (data[row - 1] = data[row - 1] || [])[column - 1] = stored(value); },
      setValues: values => values.forEach((cells, r) => cells.forEach((value, c) => {
        assert(r < rows && c < columns);
        (data[row - 1 + r] = data[row - 1 + r] || [])[column - 1 + c] = stored(value);
      })),
    }),
    setFrozenRows() {},
  };
}

function environment({ forms = makeForms(), quota = 100, fetchCode = 200 } = {}) {
  const sheets = {};
  const cache = new Map();
  const mail = [];
  const state = { fetches: 0, locks: 0, releases: 0 };
  const context = vm.createContext({
    console: { error() {}, log() {} },
    UrlFetchApp: { fetch: () => { state.fetches++; return { getResponseCode: () => fetchCode, getContentText: () => JSON.stringify(forms) }; } },
    CacheService: { getScriptCache: () => ({ get: key => (cache.has(key) ? cache.get(key) : null), put: (key, value) => cache.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { state.locks++; }, releaseLock: () => { state.releases++; } }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: name => sheets[name] || null, insertSheet: name => (sheets[name] = fakeSheet()) }),
      flush() {},
    },
    MailApp: { getRemainingDailyQuota: () => quota, sendEmail: message => mail.push(message) },
    Utilities: { formatDate: () => '2028-10-20 22:00:01' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
  });
  vm.runInContext(gsSource, context);
  const call = (name, parameter) => JSON.parse(context[name]({ parameter }).text);
  const table = () => {
    const [headers, ...rows] = sheets['test-2028'].data;
    return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
  };
  return { context, sheets, mail, state, table, post: p => call('doPost', p), get: p => call('doGet', p) };
}

const AGREE = { agree_rules: 'yes', agree_health: 'yes', agree_insurance: 'yes', agree_liability: 'yes', agree_withdrawal: 'yes', agree_privacy: 'yes' };

function player(n, fields = {}) {
  const base = { surname: 'Li', given: 'Player' + n, birth_year: '1985', origin: '中国大陆 Mainland China', ntrp: '3.5', pro: 'no',
    mobile: '0400 000 00' + n, email: 'p' + n + '@example.com', ...fields };
  return Object.fromEntries(Object.entries(base).map(([key, value]) => ['p' + n + '_' + key, value]));
}

function entry(event, fields = {}) {
  return { form: 'test-2028', event, ...AGREE, ...player(1), ...fields };
}

function pair(event, fields = {}) {
  return entry(event, { ...player(2), agree_partner: 'yes', ...fields });
}

test('places fill in order, then later entries queue on the waiting list', () => {
  const env = environment();
  const results = ['A', 'B', 'C', 'D'].map(given => env.post(entry('singles_a', player(1, { given }))));
  assert.deepEqual(results.map(r => [r.ok, r.id, r.status, r.position]), [
    [true, 'test-2028-0001', 'registered', undefined], [true, 'test-2028-0002', 'registered', undefined],
    [true, 'test-2028-0003', 'waitlist', 1], [true, 'test-2028-0004', 'waitlist', 2],
  ]);
  assert.deepEqual(env.get({ form: 'test-2028' }).events.singles_a, { capacity: 2, registered: 2, waitlist: 2 });

  // A withdrawal frees a place, but newcomers still queue behind people already waiting.
  env.sheets['test-2028'].data[1][2] = 'withdrawn';
  const late = env.post(entry('singles_a', player(1, { given: 'E' })));
  assert.deepEqual([late.status, late.position, late.id], ['waitlist', 3, 'test-2028-0005']);
  assert.deepEqual(env.get({ form: 'test-2028' }).events.singles_a, { capacity: 2, registered: 1, waitlist: 3 });
  assert.equal(env.state.locks, env.state.releases);

  const closed = environment({ forms: makeForms({ waitlist: false }) });
  closed.post(entry('singles_a', player(1, { given: 'A' })));
  closed.post(entry('singles_a', player(1, { given: 'B' })));
  assert.deepEqual(closed.post(entry('singles_a', player(1, { given: 'C' }))), { ok: false, error: 'full', event: '男子单打 A级别' });
  assert.equal(closed.table().length, 2);
});

test('one active entry per player per day, across events and partners', () => {
  const env = environment();
  assert.equal(env.post(entry('singles_a')).status, 'registered');
  assert.deepEqual(env.post(entry('singles_w', player(1, { surname: ' player1 ', given: 'LI' }))), { ok: false, error: 'duplicate', event: '男子单打 A级别' });
  assert.equal(env.post(pair('doubles_x', { p1_gender: 'male', p2_gender: 'female', p2_birth_year: '1970' })).status, 'registered');
  // Player 2 of that pair cannot enter another doubles event, even as player 1.
  const clash = env.post(pair('doubles_s', { ...player(1, { given: 'Player2', birth_year: '1970' }), ...player(2, { given: 'Other', birth_year: '1965' }) }));
  assert.deepEqual(clash, { ok: false, error: 'duplicate', event: '混合双打' });
  // Withdrawn entries no longer block.
  env.sheets['test-2028'].data[1][2] = 'withdrawn';
  assert.equal(env.post(entry('singles_w')).status, 'registered');
});

test('server-side validation mirrors the form rules', () => {
  const env = environment();
  const invalid = params => env.post(params).field;
  const { agree_health: _health, ...noHealth } = entry('singles_a');
  assert.equal(invalid(noHealth), 'agree_health');
  assert.equal(invalid(entry('nope')), 'event');
  assert.equal(invalid(entry('singles_a', { p1_birth_year: '2012' })), 'p1_birth_year');
  assert.equal(invalid(entry('singles_a', { p1_birth_year: '1957' })), 'p1_birth_year');
  assert.equal(invalid(pair('doubles_s', { p1_birth_year: '1980' })), 'p1_birth_year');
  assert.equal(invalid(entry('singles_a', { p1_origin: 'Singapore' })), 'p1_origin');
  assert.equal(invalid(entry('singles_a', { p1_pro: 'yes', p1_pro_year: '2010' })), 'p1_pro_detail');
  assert.equal(invalid(entry('singles_a', { p1_pro: 'yes', p1_pro_year: '2029', p1_pro_detail: 'State team' })), 'p1_pro_year');
  assert.equal(invalid(entry('singles_a', { p1_pro: '' })), 'p1_pro');
  assert.equal(invalid(entry('singles_a', { p1_mobile: 'call me' })), 'p1_mobile');
  assert.equal(invalid(entry('singles_a', { p1_email: '' })), 'p1_email');
  assert.equal(invalid(entry('singles_a', { p1_utr: '17' })), 'p1_utr');
  assert.equal(invalid(entry('singles_a', { p1_surname: 'x'.repeat(41) })), 'p1_surname');
  assert.equal(invalid(entry('singles_a', { notes: 'x'.repeat(301) })), 'notes');
  assert.equal(invalid(entry('doubles_s', { p1_birth_year: '1970' })), 'p2_surname');
  assert.equal(invalid(pair('doubles_s', { p1_birth_year: '1970', p2_birth_year: '1970', agree_partner: '' })), 'agree_partner');
  assert.equal(invalid(pair('doubles_s', { p1_birth_year: '1970', ...player(2, { given: 'player1', birth_year: '1970' }) })), 'p2_same');
  assert.equal(invalid(pair('doubles_x', { p1_gender: 'male', p2_gender: 'male' })), 'gender_mix');
  assert.equal(invalid(pair('doubles_x', { p1_gender: 'male' })), 'p2_gender');
  assert.equal(env.sheets['test-2028'], undefined);

  // Optional partner email, pro details, UTR and consents are stored; singles ignore partner fields.
  const ok = env.post(pair('doubles_s', { p1_birth_year: '1970', p2_birth_year: '1960', p2_email: '', p1_utr: '6.25',
    p1_pro: 'yes', p1_pro_year: '1995', p1_pro_detail: '省队', agree_photo: 'yes' }));
  assert.equal(ok.status, 'registered');
  assert.equal(env.post(entry('singles_a', { ...player(2, { surname: '' }) })).status, 'registered');
  const [doubles, singles] = env.table();
  assert.deepEqual([doubles['P1 UTR'], doubles['P1 Pro'], doubles['P1 Pro retired'], doubles['P1 Pro details'], doubles['P2 Email'], doubles['Optional consents']],
    ['6.25', 'yes', '1995', '省队', '', 'photo']);
  assert.deepEqual([singles['P1 Gender'], singles['P2 Surname'], singles['Optional consents']], ['male', '', '']);
  assert.equal(doubles['P1 Gender'], '');
});

test('registration window, unknown forms, honeypot and config caching', () => {
  assert.deepEqual(environment({ forms: makeForms({ status: 'closed' }) }).post(entry('singles_a')), { ok: false, error: 'closed' });
  assert.deepEqual(environment({ forms: makeForms({ opens: '2999-01-01T00:00:00+11:00' }) }).post(entry('singles_a')), { ok: false, error: 'before' });
  assert.deepEqual(environment({ forms: makeForms({ closes: '2001-01-01T00:00:00+11:00' }) }).post(entry('singles_a')), { ok: false, error: 'closed' });
  assert.equal(environment({ forms: makeForms({ status: 'open', closes: '2001-01-01T00:00:00+11:00' }) }).post(entry('singles_a')).status, 'registered');
  assert.equal(environment().get({ form: 'test-2028' }).phase, 'open');

  const env = environment();
  assert.deepEqual(env.post({ ...entry('singles_a'), form: 'other' }), { ok: false, error: 'unknown_form' });
  assert.deepEqual(env.post({ ...entry('singles_a'), form: '../x' }), { ok: false, error: 'unknown_form' });
  assert.deepEqual(env.post({ ...entry('singles_a'), website: 'spam' }), { ok: true, status: 'registered' });
  assert.equal(env.sheets['test-2028'], undefined);
  env.post(entry('singles_a'));
  env.get({ form: 'test-2028' });
  assert.equal(env.state.fetches, 1);
  assert.deepEqual(environment({ fetchCode: 500 }).post(entry('singles_a')), { ok: false, error: 'server' });
});

test('rows are keyed by header, keep text safe and record confirmation emails', () => {
  const env = environment();
  env.post(entry('singles_a', player(1, { surname: '=HYPERLINK("x")', email: 'same@example.com' })));
  const sheet = env.sheets['test-2028'];
  assert.deepEqual(sheet.data[0].slice(0, 6), ['Timestamp', 'ID', 'Status', 'Event ID', 'Event', 'Day']);
  assert.equal(sheet.data[1][sheet.data[0].indexOf('P1 Surname')], '\'=HYPERLINK("x")');
  assert.equal(env.table()[0]['Confirmation email'], 'sent');
  assert.equal(env.mail[0].to, 'same@example.com');
  assert.match(env.mail[0].subject, /test-2028-0001/);
  assert.match(env.mail[0].body, /已报名 Registered/);

  // Organisers may insert their own columns; new rows still line up by header name.
  sheet.data[0].splice(3, 0, 'Paid');
  sheet.data[1].splice(3, 0, 'yes');
  env.post(pair('doubles_x', { p1_gender: 'female', p2_gender: 'male', p1_email: 'same@example.com', p2_email: 'SAME@example.com' }));
  const row = env.table()[1];
  assert.deepEqual([row.Paid, row['Event ID'], row['P2 Gender'], row.Status], ['', 'doubles_x', 'male', 'registered']);
  assert.equal(env.mail[1].to, 'same@example.com');

  const quiet = environment({ quota: 0 });
  assert.equal(quiet.post(entry('singles_a')).email, 'quota');
  assert.equal(quiet.mail.length, 0);
  assert.equal(quiet.table()[0]['Confirmation email'], 'quota');
});

test('form field names match what the backend reads', () => {
  const env = environment();
  const fields = vm.runInContext('PLAYER_FIELDS', env.context).map(f => f[0]);
  const playerNames = [...includeSource.matchAll(/name="\{\{ p \}\}_([a-z_]+)"/g)].map(m => m[1]);
  assert.deepEqual([...new Set(playerNames)].sort(), [...fields].sort());
  const otherNames = [...includeSource.matchAll(/name="([a-z_]+)"/g)].map(m => m[1]);
  assert.deepEqual(otherNames.sort(), ['emergency', 'event', 'notes', 'website']);
  assert.match(includeSource, /name="agree_\{\{ d\.id \}\}"/);
});

test('client helpers agree with the backend', () => {
  const context = { window: {}, document: { querySelector: () => null } };
  vm.createContext(context);
  vm.runInContext(clientSource.slice(0, clientSource.indexOf('  // ---------- Page')) +
    '\nwindow.test = { phaseAt, birthRange, identity, isFull, placesText }; })();', context);
  const client = context.window.test;
  const server = environment().context;
  const form = makeForms()['test-2028'];
  const seniors = form.events.find(e => e.id === 'doubles_s');
  for (const args of [['Li', 'Ye', '1985'], [' YE ', 'li', 1985], ['O\'Brien-Smith', 'Mary Ann', '1970'], ['ｌｉ', 'ye', '1985']]) {
    assert.equal(client.identity(...args), server.identity(...args));
  }
  assert.equal(client.identity('Li', 'Ye', '1985'), client.identity('ye', ' LI', '1985'));
  assert.deepEqual({ ...client.birthRange(form, seniors) }, { min: 1958, max: 1978 });
  assert.deepEqual({ ...client.birthRange(form, form.events[0]) }, { ...server.birthRange(form, form.events[0]) });
  for (const [patch, now] of [[{}, 0], [{ status: 'closed' }, 0], [{ opens: '2028-10-14T22:00:00+11:00' }, Date.parse('2028-10-14T10:59:59Z')],
    [{ opens: '2028-10-14T22:00:00+11:00' }, Date.parse('2028-10-14T11:00:00Z')], [{ closes: '2028-11-04T17:00:00+11:00' }, Date.parse('2028-11-04T06:00:00Z')]]) {
    assert.equal(client.phaseAt({ ...form, ...patch }, now), server.phaseAt({ ...form, ...patch }, now));
  }
  assert.equal(client.phaseAt({ ...form, opens: '2028-10-14T22:00:00+11:00' }, Date.parse('2028-10-14T10:59:59Z')), 'before');
  assert.equal(client.placesText(form.events[0], { capacity: 2, registered: 1, waitlist: 0 }), '剩余 1人');
  assert.equal(client.placesText(seniors, { capacity: 4, registered: 4, waitlist: 2 }), '已满，等候 2对');
  assert.equal(client.isFull(form.events[0], { capacity: 2, registered: 1, waitlist: 1 }), true);
});
