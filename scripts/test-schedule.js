'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ExcelJS = require('exceljs');
const { readSchedule, readMatchList, pageSchedule, outputPathFor } = require('./import-schedule');
const { playerNames, suggestions, matchesForPlayer, matchesForCourt, scoreForMatch, updateScores } = require('../js/schedule');

function scoreTools(fetch) {
  const context = {
    window: {},
    document: { readyState: 'complete', querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: () => '' },
    TextEncoder, TextDecoder, btoa, atob, fetch, setInterval() {}
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../js/tournament.js'), 'utf8');
  vm.runInContext(source.replace('  window.ACTCTournamentScores =', '  window.testWriteMatch = writeMatch;\n  window.testLiveUpdate = liveUpdate;\n  window.ACTCTournamentScores ='), context);
  return { ...context.window.ACTCTournamentScores, courtMgt: context.window.ACTCCourtMgt, writeMatch: context.window.testWriteMatch, liveUpdate: context.window.testLiveUpdate };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function sheet() {
  const workbook = new ExcelJS.Workbook();
  const result = workbook.addWorksheet('All Courts');
  result.addRow(['Timestamp', ...[1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15].map(court => `Court ${court}`)]);
  return result;
}

function matchListSheet() {
  const workbook = new ExcelJS.Workbook();
  const result = workbook.addWorksheet('Match List');
  result.addRow(['开始（估计）', '结束（估计）', '场地', '项目', '小组', '轮次', '球员 1', '球员 2']);
  return result;
}

test('imports blank following times, not-before times and rich-text match cells without inventing times', () => {
  const source = sheet();
  source.addRow(['8:30AM', 'A-A-R1\nBenson Huang [1] vs Frank Zhang']);
  source.addRow([null, { richText: [{ text: 'A-A-R2\n' }, { text: 'Frank Zhang vs Simon Yu' }] }]);
  source.addRow(['Not before\n9:30AM', 'A-A-R3\nBenson Huang [1] vs Simon Yu']);
  const schedule = readSchedule(source);
  assert.equal(schedule.rows[1].time, null);
  assert.equal(schedule.rows[2].time, 'Not before\n9:30AM');
  assert.deepEqual(schedule.rows[1].matches[0], { label: 'A-A-R2', player1: 'Frank Zhang', player2: 'Simon Yu' });
  assert.equal(schedule.rows[0].matches[1], null);
});

test('reads Court 15 from the All Courts matrix', () => {
  const source = sheet();
  source.addRow(['10:00AM', ...Array(12).fill(null), 'Ruby-C-R2\nAlice vs Bob']);

  const schedule = readSchedule(source);
  assert.equal(schedule.courts[12], 15);
  assert.deepEqual(schedule.rows[0].matches[12], {
    label: 'Ruby-C-R2',
    player1: 'Alice',
    player2: 'Bob'
  });
});

test('imports the adjusted workbook Match List and keeps women matches on their reassigned courts', () => {
  const source = matchListSheet();
  source.addRow(['8:00AM', '8:30AM', 3, '女子', 'A', 1, 'Alice', 'Bob']);
  source.addRow(['8:00AM', '8:30AM', 4, '女子', 'A', 1, 'Carol', 'Dana']);
  source.addRow(['8:30AM', '9:00AM', 14, '红宝石', 'B', 2, 'Eve', 'Frank']);

  const schedule = pageSchedule(readMatchList(source));
  assert.deepEqual(schedule.courts, [3, 4, 14]);
  assert.deepEqual(schedule.rows.map(row => row.time), ['8:00AM', '8:30AM']);
  assert.deepEqual(schedule.rows[0].matches, [
    { label: '女子-A组-第1轮', player1: 'Alice', player2: 'Bob', eventId: '2026-womens-singles', group: 'A' },
    { label: '女子-A组-第1轮', player1: 'Carol', player2: 'Dana', eventId: '2026-womens-singles', group: 'A' },
    null
  ]);
  assert.deepEqual(schedule.rows[1].matches, [
    null,
    null,
    { label: '红宝石-B组-第2轮', player1: 'Eve', player2: 'Frank', eventId: '2026-b-ruby', group: 'B' }
  ]);
});

test('imports doubles labels from the All Courts matrix and falls back from legacy Match List headers', () => {
  const source = sheet();
  source.addRow(['8:00AM', '男A双-A组-第1轮\nAlice & Bob vs Carol & Dana', '女双-B组-第1轮\nEve & Fran vs Gia & Hana']);
  const legacy = source.workbook.addWorksheet('Match List');
  legacy.addRow(['Time', 'Court', 'Event', 'Stage', 'Match Label', 'Pair 1', 'Pair 2']);

  assert.equal(require('./import-schedule').hasExpectedMatchListHeaders(legacy), false);
  assert.deepEqual(pageSchedule(readSchedule(source)).rows[0].matches.slice(0, 2), [
    {
      label: '男A双-A组-第1轮',
      player1: 'Alice & Bob',
      player2: 'Carol & Dana',
      eventId: '2026-doubles-a',
      group: 'A'
    },
    {
      label: '女双-B组-第1轮',
      player1: 'Eve & Fran',
      player2: 'Gia & Hana',
      eventId: '2026-doubles-womens',
      group: 'B'
    }
  ]);
});

test('selects the schedule snapshot matching the workbook', () => {
  assert.equal(path.basename(outputPathFor(path.join(__dirname, '../make_draw/example.xlsx'))), '2026-singles.json');
  assert.equal(path.basename(outputPathFor(path.join(__dirname, '../make_draw/doubles_schedule_draft.xlsx'))), '2026-doubles.json');
});

test('rejects invalid workbook headers or match cells rather than silently skipping them', () => {
  const source = sheet();
  source.addRow(['8:30AM', 'Invalid match']);
  assert.throws(() => readSchedule(source), /Expected match label/);
  source.getCell(1, 3).value = 'Court 1';
  assert.throws(() => readSchedule(source), /duplicate court/);
  assert.throws(() => readSchedule(null), /All Courts/);
});

test('rejects invalid or duplicate courts in a Match List', () => {
  const source = matchListSheet();
  source.addRow(['8:00AM', '8:30AM', 7, '女子', 'A', 1, 'Alice', 'Bob']);
  assert.throws(() => readMatchList(source), /Invalid time or court/);

  source.getRow(2).getCell(3).value = 3;
  source.addRow(['8:00AM', '8:30AM', 3, '女子', 'A', 1, 'Carol', 'Dana']);
  assert.throws(() => readMatchList(source), /Duplicate court/);
});

test('imports Court 15 and rejects courts outside the venue allocation', () => {
  const source = matchListSheet();
  source.addRow(['10:00AM', '10:30AM', 15, '红宝石', 'C', 2, 'Alice', 'Bob']);
  assert.deepEqual(readMatchList(source).courts, [15]);

  source.getRow(2).getCell(3).value = 16;
  assert.throws(() => readMatchList(source), /Invalid time or court/);
});

test('ignores court availability notes in the doubles matrix', () => {
  const source = sheet();
  source.addRow(['8:00AM', '男B双-A组-第1轮\nAlice & Bob vs\nCarol & Dana', '场地已关闭',
    ...Array(10).fill(null), '\u0031\u0030:00AM 起可用']);
  const schedule = pageSchedule(readSchedule(source));
  assert.equal(schedule.rows[0].matches[0].eventId, '2026-doubles-b');
  assert.equal(schedule.rows[0].matches[1], null);
  assert.equal(schedule.rows[0].matches[12], null);
});

test('suggests only real, unique players after at least three characters, ignoring case', () => {
  const matches = [
    { player1: 'Benson Huang [1]', player2: 'Frank Zhang' },
    { player1: 'Benson Huang [1]', player2: 'Simon Yu' },
    { player1: 'A1', player2: 'B2' },
    { player1: 'Winner QF1', player2: 'Winner QF2' }
  ];
  const players = playerNames(matches);
  assert.deepEqual(players, ['Benson Huang [1]', 'Frank Zhang', 'Simon Yu']);
  assert.deepEqual(suggestions(players, 'be'), []);
  assert.deepEqual(suggestions(players, ' BEN '), ['Benson Huang [1]']);
  assert.deepEqual(suggestions(players, 'ZHANG'), ['Frank Zhang']);
  assert.deepEqual(suggestions(players, 'xyz'), []);
});

test('personal schedule uses exact player identity and matches both sides in original order', () => {
  const first = { player1: 'Lei Ye', player2: 'Ye Li', time: '8:30AM', court: '7' };
  const second = { player1: 'June Jiang', player2: 'Lei Ye', time: '', court: '8' };
  const unrelated = { player1: 'Lauren Shen', player2: 'Ye Li' };
  assert.deepEqual(matchesForPlayer([first, unrelated, second], 'Lei Ye'), [first, second]);
});

test('page omits womens playoffs and empty rows but preserves group matches and mens matches', () => {
  const group = { label: 'A-R1', player1: 'Alicia Wang', player2: 'Jie Deng' };
  const playoff = { label: 'QF1', player1: 'A1', player2: 'B2' };
  const men = { label: 'Ruby-QF1', player1: 'A1', player2: 'B2' };
  const source = { courts: [1, 7, 8], rows: [
    { time: null, matches: [null, group, null] },
    { time: null, matches: [men, playoff, { ...playoff, label: 'SF1' }] },
    { time: '4:00PM', matches: [null, { ...playoff, label: 'F' }, null] }
  ] };
  assert.deepEqual(pageSchedule(source), { courts: [1, 7, 8], rows: [
    { time: null, matches: [null, { ...group, label: '女子-A组-第1轮', eventId: '2026-womens-singles', group: 'A' }, null] },
    { time: null, matches: [{ ...men, label: '红宝石-QF1' }, null, null] }
  ] });
  assert.equal(source.rows[1].matches[1], playoff);
});

test('localizes all division labels without changing source labels or repeating localized prefixes', () => {
  const source = { courts: [1, 5, 7, 9], rows: [
    { time: '8:30AM', matches: ['Ruby-A-R1', 'Sapphire-B-R2', 'C-R3', 'A-D-R1'].map(label => ({
      label, player1: 'Player One', player2: 'Player Two'
    })) }
  ] };
  const localized = pageSchedule(source);
  assert.deepEqual(localized.rows[0].matches.map(match => match.label),
    ['红宝石-A组-第1轮', '蓝宝石-B组-第2轮', '女子-C组-第3轮', 'A级别-D组-第1轮']);
  assert.deepEqual(localized.rows[0].matches.map(match => [match.eventId, match.group]),
    [['2026-b-ruby', 'A'], ['2026-b-sapphire', 'B'], ['2026-womens-singles', 'C'], ['2026-a-grade', 'D']]);
  assert.equal(source.rows[0].matches[0].label, 'Ruby-A-R1');
  assert.deepEqual(pageSchedule(localized), localized);
});

test('converts previously localized group labels including later rounds without hiding womens matches', () => {
  const source = { courts: [1, 5, 7, 9], rows: [
    { time: null, matches: ['红宝石-A-R1', '蓝宝石-B-R6', '女子-C-R12', 'A级别-D-R3'].map(label => ({
      label, player1: 'Player One', player2: 'Player Two'
    })) }
  ] };
  const localized = pageSchedule(source);
  assert.deepEqual(localized.rows[0].matches.map(match => match.label),
    ['红宝石-A组-第1轮', '蓝宝石-B组-第6轮', '女子-C组-第12轮', 'A级别-D组-第3轮']);
  assert.deepEqual(pageSchedule(localized), localized);
  assert.equal(source.rows[0].matches[2].label, '女子-C-R12');
});

test('court filter preserves scheduled match order without including other or blank courts', () => {
  const first = { player1: 'Alicia Wang', player2: 'Jie Deng', court: '7' };
  const second = { player1: 'Lei Ye', player2: 'June Jiang', court: '7' };
  const other = { player1: 'Haiyan Huang', player2: 'Linda Zhou', court: '8' };
  assert.deepEqual(matchesForCourt([first, other, second], 7), [first, second]);
  assert.deepEqual(matchesForCourt([first, other, second], 13), []);
});

test('a mocked scoreboard submission is read by the schedule with correct table and player score directions', async () => {
  let stored = { matches: { 'RR|B|Alice|Bob': { p: ['Alice', 'Bob'], s: '5-3', w: 'Alice' } } };
  let writes = 0;
  const tools = scoreTools(async (url, options = {}) => {
    assert.ok(url.startsWith('https://api.github.com/repos/example/test/contents/scores/test-event.json'));
    if (options.method === 'PUT') {
      stored = JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8'));
      writes += 1;
      return jsonResponse({ content: { sha: 'next-sha' } });
    }
    if (options.headers.Accept === 'application/vnd.github.raw+json') return jsonResponse(stored);
    return jsonResponse({ sha: 'current-sha', content: Buffer.from(JSON.stringify(stored)).toString('base64') });
  });
  const client = { id: 'test-event', repo: 'example/test', branch: 'test', path: 'scores', scores: { matches: {} } };
  const match = { eventId: 'test-event', group: 'A', player1: 'Alice', player2: 'Bob' };
  const key = tools.pairKey('RR|A', match.player1, match.player2);
  await tools.writeMatch(client, key, { p: ['Bob', 'Alice'], s: '4-6', w: 'Alice' }, 'test submission');
  await updateScores([client], tools);
  assert.equal(writes, 1);
  assert.equal(scoreForMatch(match, client.scores, tools).score, '6-4');
  assert.equal(scoreForMatch(match, client.scores, tools, 'Bob').score, '4-6');
  assert.ok(stored.matches['RR|B|Alice|Bob']);
  assert.equal(scoreForMatch({ ...match, group: 'C' }, client.scores, tools), null);
  assert.equal(scoreForMatch(match, { matches: {} }, tools), null);
});

test('knockout in-progress marks are saved and cancelled without overwriting a concurrently saved score', async () => {
  let stored = { matches: {} };
  let writes = 0;
  const tools = scoreTools(async (url, options = {}) => {
    if (options.method === 'PUT') {
      stored = JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8'));
      writes += 1;
      return jsonResponse({ content: { sha: 'next-sha' } });
    }
    return jsonResponse({ sha: 'current-sha', content: Buffer.from(JSON.stringify(stored)).toString('base64') });
  });
  const client = { id: 'test-event', repo: 'example/test', branch: 'test', path: 'scores' };
  const key = 'KO|1|1';
  await tools.writeMatch(client, key, tools.liveUpdate(key, 'Alice', 'Bob', { p: ['Alice', 'Bob'], live: true, c: '5' }), 'start');
  assert.deepEqual(stored.matches[key], { p: ['Alice', 'Bob'], live: true, c: '5' });
  assert.equal(tools.result(stored.matches, key, 'Alice', 'Bob'), null);
  await tools.writeMatch(client, key, tools.liveUpdate(key, 'Alice', 'Bob', null), 'cancel');
  assert.equal(stored.matches[key], undefined);
  stored.matches[key] = { p: ['Bob', 'Alice'], s: '4-6', w: 'Alice' };
  await assert.rejects(
    tools.writeMatch(client, key, tools.liveUpdate(key, 'Alice', 'Bob', { p: ['Alice', 'Bob'], live: true }), 'late start'),
    error => error.userMessage === '该场比赛已录入比分，请刷新后查看。');
  await assert.rejects(tools.writeMatch(client, key, tools.liveUpdate(key, 'Alice', 'Bob', null), 'late cancel'));
  assert.equal(writes, 2);
  assert.equal(stored.matches[key].w, 'Alice');
});

test('refresh preserves failed event scores and last-read time, updates other events, and handles a cleared score', async () => {
  const tools = scoreTools(async () => { throw new Error('Unexpected fetch'); });
  const old = { matches: { 'RR|A|Alice|Bob': { p: ['Alice', 'Bob'], s: '6-4', w: 'Alice' } } };
  const clients = [
    { id: 'failed', scores: old, loadedAt: 123 },
    { id: 'ok', scores: { matches: {} }, loadedAt: null }
  ];
  await updateScores(clients, { loadScores: async client => {
    if (client.id === 'failed') throw new Error('Network unavailable');
    return old;
  } });
  assert.equal(clients[0].scores, old);
  assert.equal(clients[0].loadedAt, 123);
  assert.equal(clients[0].error, 'Network unavailable');
  assert.equal(clients[1].scores, old);
  assert.ok(clients[1].loadedAt);
  await updateScores(clients, { loadScores: async () => ({ matches: {} }) });
  assert.equal(clients[0].error, '');
  assert.equal(scoreForMatch({ group: 'A', player1: 'Alice', player2: 'Bob' }, clients[0].scores, tools), null);
});

test('shared result matching accepts W/O and RET and rejects scores for changed participants or invalid winners', () => {
  const tools = scoreTools(async () => { throw new Error('Unexpected fetch'); });
  const match = { group: 'A', player1: 'Alice', player2: 'Bob' };
  const key = tools.pairKey('RR|A', 'Alice', 'Bob');
  const scores = { matches: { [key]: { p: ['Bob', 'Alice'], s: '', w: 'Bob', n: 'W/O' } } };
  const walkover = scoreForMatch(match, scores, tools);
  assert.equal(walkover.winner, 'Bob');
  assert.equal(tools.cellText(walkover), 'W/O');
  scores.matches[key] = { p: ['Bob', 'Alice'], s: '2-4', w: 'Alice', n: 'RET' };
  assert.equal(tools.cellText(scoreForMatch(match, scores, tools)), '4-2 ret');
  scores.matches[key].p = ['Carol', 'Alice'];
  assert.equal(scoreForMatch(match, scores, tools), null);
  scores.matches[key] = { p: ['Alice', 'Bob'], s: '6-4', w: 'Carol' };
  assert.equal(scoreForMatch(match, scores, tools), null);
});

test('shared score loading reports CDN fallback, treats 404 as no scores and rejects malformed files', async () => {
  const client = { id: 'test-event', repo: 'example/test', branch: 'test', path: 'scores' };
  const tools = scoreTools(async url => url.startsWith('https://api.github.com') ?
    jsonResponse({}, 429) : jsonResponse({ matches: {} }));
  assert.deepEqual(JSON.parse(JSON.stringify(await tools.loadScores(client))), { matches: {} });
  assert.equal(client.scoreSource, 'cdn');
  const missing = scoreTools(async url => {
    assert.ok(url.startsWith('https://api.github.com'));
    return jsonResponse({}, 404);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await missing.loadScores(client))), { matches: {} });
  assert.equal(client.scoreSource, 'api');
  const malformed = scoreTools(async () => jsonResponse({ matches: [] }));
  await assert.rejects(malformed.loadScores(client), /比分文件格式无效/);
  const unavailable = scoreTools(async url => jsonResponse({}, url.startsWith('https://api.github.com') ? 503 : 404));
  await assert.rejects(unavailable.loadScores(client), /GitHub API 503/);
  const cached = scoreTools(async url => jsonResponse({}, url.startsWith('https://api.github.com') ? 429 : 404));
  await assert.rejects(cached.loadScores({ ...client, scores: { matches: { existing: {} } } }), /缓存比分暂不可用/);
});

test('schedule snapshot identities match current event group players including seed markers', () => {
  const yaml = require('js-yaml');
  const data = require('../_data/schedules/2026-singles.json');
  const events = new Map();
  const matches = data.rows.flatMap(row => row.matches).filter(Boolean);
  for (const match of matches) {
    assert.match(match.eventId, /^2026-/);
    if (!events.has(match.eventId)) events.set(match.eventId, yaml.load(fs.readFileSync(
      path.join(__dirname, '../_data/events', match.eventId + '.yml'), 'utf8')));
    const players = events.get(match.eventId).groups[match.group];
    assert.ok(players.includes(match.player1), match.player1);
    assert.ok(players.includes(match.player2), match.player2);
  }
  const womensMatches = matches.filter(match => match.eventId === '2026-womens-singles');
  assert.equal(matches.length, 99);
  assert.equal(womensMatches.length, 18);
  assert.equal(womensMatches.some(match => ['Heli Yang', 'Pamela Qi'].includes(match.player1)
    || ['Heli Yang', 'Pamela Qi'].includes(match.player2)), false);
  assert.equal(events.size, 4);

  const rubyBMatch = (player1, player2) => data.rows.flatMap(row => row.matches
    .map((match, index) => match && match.eventId === '2026-b-ruby' && match.group === 'B'
      && match.player1 === player1 && match.player2 === player2
      ? { time: row.time, court: data.courts[index] }
      : null)).find(Boolean);
  assert.deepEqual(rubyBMatch('Chenxiao Xu', 'David Cheung'), { time: '8:30AM', court: 1 });
  assert.deepEqual(rubyBMatch('Jifan Zhang', 'David Cheung'), { time: '10:30AM', court: 14 });
  assert.deepEqual(rubyBMatch('Jifan Zhang', 'Chenxiao Xu'), { time: '11:30AM', court: 14 });

  const rubyCourts = { A: 14, B: 14, C: 15, D: 15, E: 1, F: 1, G: 2, H: 2 };
  const toMinutes = time => {
    const [, hours, minutes, meridiem] = /^(\d+):(\d{2})(AM|PM)$/.exec(time);
    return ((Number(hours) % 12) + (meridiem === 'PM' ? 12 : 0)) * 60 + Number(minutes);
  };
  const scheduled = data.rows.flatMap(row => row.matches.map((match, index) => match && ({
    ...match,
    start: row.time,
    court: data.courts[index]
  }))).filter(Boolean);
  const ruby = scheduled.filter(match => match.eventId === '2026-b-ruby');
  for (const match of ruby.filter(match => toMinutes(match.start) >= 600)) {
    assert.equal(match.court, rubyCourts[match.group], `${match.group} at ${match.start}`);
  }
  assert.equal(ruby.find(match => match.group === 'H' && match.label.endsWith('第3轮')).start, '11:30AM');
  for (const court of [1, 2, 14, 15]) {
    const starts = ruby.filter(match => match.court === court && toMinutes(match.start) >= 600)
      .map(match => toMinutes(match.start))
      .sort((a, b) => a - b);
    assert.deepEqual(starts, [600, 630, 660, 690], `Court ${court} should have no idle half-hour slots`);
  }

  const startsByPlayer = new Map();
  for (const match of scheduled) {
    for (const player of [match.player1, match.player2]) {
      const starts = startsByPlayer.get(player) || [];
      starts.push(toMinutes(match.start));
      startsByPlayer.set(player, starts);
    }
    if ([14, 15].includes(match.court)) {
      assert.ok(toMinutes(match.start) >= 600, `Court ${match.court} starts too early`);
      assert.ok(toMinutes(match.start) + 30 <= 960, `Court ${match.court} runs past 4:00PM`);
    }
    assert.notEqual(match.court, 7);
    assert.notEqual(match.court, 8);
  }
  for (const [player, starts] of startsByPlayer) {
    starts.sort((a, b) => a - b);
    for (let index = 1; index < starts.length; index += 1) {
      assert.ok(starts[index] - starts[index - 1] >= 60, `${player} has less than 30 minutes' rest`);
    }
  }
});

test('schedule group rounds follow the event page round-robin order', () => {
  const yaml = require('js-yaml');
  const source = fs.readFileSync(path.join(__dirname, '../js/tournament.js'), 'utf8');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf('  // ---------- GitHub storage')) + '\nwindow.roundRobin = roundRobin; })();', context);
  const data = require('../_data/schedules/2026-singles.json');
  const toMinutes = time => {
    const [, hours, minutes, meridiem] = /^(\d+):(\d{2})(AM|PM)$/.exec(time);
    return ((Number(hours) % 12) + (meridiem === 'PM' ? 12 : 0)) * 60 + Number(minutes);
  };
  const key = (a, b) => [a, b].sort().join('|');
  const groups = new Map();
  for (const row of data.rows) {
    for (const match of row.matches.filter(Boolean)) {
      const id = match.eventId + ' ' + match.group;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({ ...match, start: toMinutes(row.time) });
    }
  }
  assert.equal(groups.size, 28);
  for (const [id, matches] of groups) {
    const [eventId, group] = id.split(' ');
    const config = yaml.load(fs.readFileSync(path.join(__dirname, '../_data/events', eventId + '.yml'), 'utf8'));
    const rounds = context.window.roundRobin(config.groups[group]);
    const slots = [...new Set(matches.map(match => match.start))].sort((a, b) => a - b);
    assert.equal(slots.length, rounds.length, id);
    slots.forEach((start, index) => {
      const scheduled = matches.filter(match => match.start === start);
      assert.deepEqual(scheduled.map(match => key(match.player1, match.player2)).sort(),
        Array.from(rounds[index].pairs, ([a, b]) => key(a, b)).sort(), `${id} slot ${index + 1}`);
      for (const match of scheduled) assert.ok(match.label.endsWith(`第${index + 1}轮`), `${id} ${match.label}`);
    });
  }
});

test('event configs with a schedule get a default court for every round-robin match', () => {
  const yaml = require('js-yaml');
  const source = fs.readFileSync(path.join(__dirname, '../js/tournament.js'), 'utf8');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf('  // ---------- GitHub storage')) +
    '\nwindow.t = { roundRobin, scheduleCourts, pairKey }; })();', context);
  const { roundRobin, scheduleCourts, pairKey } = context.window.t;
  const dir = path.join(__dirname, '../_data/events');
  const checked = {};
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.yml'))) {
    const config = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!config || !config.schedule) continue;
    const id = file.replace(/\.yml$/, '');
    const schedule = JSON.parse(fs.readFileSync(path.join(__dirname, '../_data/schedules', config.schedule + '.json'), 'utf8'));
    const courts = scheduleCourts(schedule, id);
    for (const [group, players] of Object.entries(config.groups)) {
      for (const round of roundRobin(players)) {
        for (const [a, b] of round.pairs) {
          assert.match(courts.get(pairKey('RR|' + group, a, b)) || '', /^\d+$/, `${id} ${group} ${a} vs ${b}`);
          checked[config.schedule] = (checked[config.schedule] || 0) + 1;
        }
      }
    }
  }
  assert.equal(checked['2026-singles'], 99);
  assert.equal(checked['2026-doubles'], 93);
  assert.equal(checked['test-2026-score-update'], 12);
});

test('2026-1122 court management config aligns with doubles events, schedule courts, and page include', () => {
  const yaml = require('js-yaml');
  const { elapsedText, sortPlayableForCourt, filterPlayableMatches } = require('../js/court-mgt');
  const rawCm = yaml.load(fs.readFileSync(path.join(__dirname, '../_data/courts/2026-1122.yml'), 'utf8'));
  const schedule = JSON.parse(fs.readFileSync(path.join(__dirname, '../_data/schedules', rawCm.schedule + '.json'), 'utf8'));
  assert.deepEqual(rawCm.courts.map(c => Number(c.id)), [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(rawCm.courts.map(c => Number(c.id)), schedule.courts);
  assert.equal(rawCm.events.length, 4);
  for (const ev of rawCm.events) {
    const cfg = yaml.load(fs.readFileSync(path.join(__dirname, '../_data/events', ev.id + '.yml'), 'utf8'));
    assert.equal(cfg.court_mgt, '2026-1122', ev.id);
    assert.equal(cfg.schedule, '2026-doubles', ev.id);
  }
  const pageMd = fs.readFileSync(path.join(__dirname, '../2026/mgt/court_1122.md'), 'utf8');
  assert.match(pageMd, /\{%\s*include court_mgt\.html id="2026-1122"\s*%\}/);

  const now = Date.parse('2026-11-22T01:35:00Z');
  assert.equal(elapsedText('2026-11-22T01:34:40Z', now), '刚刚开赛');
  assert.equal(elapsedText('2026-11-22T01:10:00Z', now), '已进行 25 分钟');
  assert.equal(elapsedText('2026-11-22T00:20:00Z', now), '已进行 1 小时 15 分钟');

  const sorted = sortPlayableForCourt([
    { eventId: 'b', stage: 'rr', plannedCourt: '5', scheduleSeq: 1, roundNo: 1, busyConflict: null },
    { eventId: 'a', stage: 'ko', plannedCourt: '', scheduleSeq: 100, roundNo: 1, busyConflict: null },
    { eventId: 'c', stage: 'rr', plannedCourt: '3', scheduleSeq: 50, roundNo: 2, busyConflict: null },
    { eventId: 'd', stage: 'rr', plannedCourt: '3', scheduleSeq: 0, roundNo: 1, busyConflict: { court: '1' } },
  ], '3');
  assert.deepEqual(sorted.map(m => m.eventId), ['c', 'a', 'b', 'd']);
  assert.equal(filterPlayableMatches([
    { eventId: '2026-doubles-b', eventLabel: '男子双打 B级别', eventShort: '男B双', roundText: 'D组 · 第1轮', a: 'Wujian Gao & Fanning Meng', b: 'Patrick Zhang & Andrew Tan', plannedCourt: '6' },
  ], '2026-doubles-b', 'wujian').length, 1);
});

test('court management sync shows RR and playoff matches, blocks occupied courts across events, and releases on score save', async () => {
  const yaml = require('js-yaml');
  const rawCm = yaml.load(fs.readFileSync(path.join(__dirname, '../_data/courts/2026-1122.yml'), 'utf8'));
  const schedule = JSON.parse(fs.readFileSync(path.join(__dirname, '../_data/schedules/2026-doubles.json'), 'utf8'));
  const store = {};
  let writes = 0;
  const tools = scoreTools(async (url, options = {}) => {
    const m = /\/contents\/scores\/([^?]+)\.json/.exec(url);
    assert.ok(m, url);
    const id = decodeURIComponent(m[1]);
    if (options.method === 'PUT') {
      store[id] = JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8'));
      writes += 1;
      return jsonResponse({ content: { sha: 'sha-' + writes } });
    }
    if (!store[id]) return jsonResponse({ message: 'Not Found' }, 404);
    if (options.headers && options.headers.Accept === 'application/vnd.github.raw+json') return jsonResponse(store[id]);
    return jsonResponse({ sha: 'sha-' + id, content: Buffer.from(JSON.stringify(store[id])).toString('base64') });
  });
  const cm = tools.courtMgt.normalizeCourtMgt({
    id: '2026-1122',
    courts: rawCm.courts,
    schedule,
    events: rawCm.events.map(ev => ({
      ...ev,
      cfg: yaml.load(fs.readFileSync(path.join(__dirname, '../_data/events', ev.id + '.yml'), 'utf8')),
    })),
  });
  const makeClient = id => ({ id, repo: 'example/test', branch: 'master', path: 'scores', scores: { matches: {} } });
  const clientB = makeClient('2026-doubles-b');
  const clientW = makeClient('2026-doubles-womens');
  const clientA = makeClient('2026-doubles-a');

  // 1. Start Men's B Group D Round 1 on Court 6.
  const bP1 = 'Wujian Gao & Fanning Meng', bP2 = 'Patrick Zhang & Andrew Tan';
  const bKey = tools.pairKey('RR|D', bP1, bP2);
  clientB.scores = await tools.writeMatch(clientB, bKey, { p: [bP1, bP2], live: true, c: '6', t: '2026-11-22T00:00:00Z' }, 'live b');

  // 2. Attempting to assign Women's Doubles Group A Round 1 to occupied Court 6 fails validation & blocks write.
  const wP1 = 'Zijun Xia & Zilan Wu [1]', wP2 = 'Jenny Wan & Jiayu Gao';
  const wKey = tools.pairKey('RR|A', wP1, wP2);
  await assert.rejects(
    () => tools.writeMatch(clientW, wKey, tools.liveUpdate(wKey, wP1, wP2, { p: [wP1, wP2], live: true, c: '6' }, latest => {
      const check = tools.courtMgt.checkCourtAssignment('6', { eventId: clientW.id, key: wKey, a: wP1, b: wP2 }, cm, {
        '2026-doubles-b': clientB.scores,
        '2026-doubles-womens': { matches: latest },
      });
      if (!check.ok) throw Object.assign(new Error(check.message), { userMessage: check.message });
    }), 'live w conflict'),
    /6号场 已被占用.*男B双.*D组 · 第1轮/
  );
  assert.equal(writes, 1);

  // 3. Complete Men's A Group A & B so QF1 (A1 vs B2) is determined, then start Playoff QF1 on Court 1.
  const aCfg = cm.events.find(e => e.id === '2026-doubles-a').cfg;
  for (const gName of ['A', 'B']) {
    const ps = aCfg.groups[gName];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const k = tools.pairKey('RR|' + gName, ps[i], ps[j]);
        clientA.scores = await tools.writeMatch(clientA, k, { p: [ps[i], ps[j]], s: '6-3', w: ps[i] }, 'rr done');
      }
    }
  }
  const koView = tools.courtMgt.compute({ cfg: aCfg, scores: clientA.scores }).ko;
  const qf1 = koView.rounds[0].matches[0];
  assert.equal(qf1.playable, true);
  clientA.scores = await tools.writeMatch(clientA, qf1.key, { p: [qf1.a.name, qf1.b.name], live: true, c: '1', t: '2026-11-22T02:30:00Z' }, 'ko live');

  let board = tools.courtMgt.buildCourtBoard(cm, {
    '2026-doubles-a': clientA.scores,
    '2026-doubles-b': clientB.scores,
    '2026-doubles-womens': clientW.scores,
  });
  assert.equal(board.busy, 2);
  assert.equal(board.free, 11);
  assert.equal(board.courts.find(c => c.id === '6').matches[0].roundText, 'D组 · 第1轮');
  assert.equal(board.courts.find(c => c.id === '1').matches[0].roundText, '四分之一决赛 · 第1场');

  // 4. Enter scores for both matches -> Court 6 and Court 1 automatically release, allowing Women's match to use Court 6.
  clientB.scores = await tools.writeMatch(clientB, bKey, { p: [bP1, bP2], s: '5-3', w: bP1 }, 'score b');
  clientA.scores = await tools.writeMatch(clientA, qf1.key, { p: [qf1.a.name, qf1.b.name], s: '5-2', w: qf1.a.name }, 'score qf1');
  board = tools.courtMgt.buildCourtBoard(cm, {
    '2026-doubles-a': clientA.scores,
    '2026-doubles-b': clientB.scores,
    '2026-doubles-womens': clientW.scores,
  });
  assert.equal(board.busy, 0);
  assert.equal(board.free, 13);
  assert.equal(tools.courtMgt.checkCourtAssignment('6', { eventId: clientW.id, key: wKey, a: wP1, b: wP2 }, cm, {
    '2026-doubles-b': clientB.scores,
  }).ok, true);
});
