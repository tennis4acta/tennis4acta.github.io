'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ExcelJS = require('exceljs');
const { readSchedule, readMatchList, pageSchedule } = require('./import-schedule');
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
  vm.runInContext(source.replace('  window.ACTCTournamentScores =', '  window.testWriteMatch = writeMatch;\n  window.ACTCTournamentScores ='), context);
  return { ...context.window.ACTCTournamentScores, writeMatch: context.window.testWriteMatch };
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
  assert.deepEqual(rubyBMatch('Jifan Zhang', 'Chenxiao Xu'), { time: '10:30AM', court: 14 });
  assert.deepEqual(rubyBMatch('Chenxiao Xu', 'David Cheung'), { time: '8:30AM', court: 1 });
  assert.deepEqual(rubyBMatch('Jifan Zhang', 'David Cheung'), { time: '11:30AM', court: 14 });

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
