'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/tournament.js'), 'utf8');
const boundary = source.indexOf('  // ---------- GitHub storage');
assert(boundary > 0);
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source.slice(0, boundary) +
  '\nwindow.test = { roundRobin, seedOrder, autoDraw, computeGroup, computeKO, compute, result, setsToScore, woSets, scheduleCourts }; })();', context);
const { roundRobin, seedOrder, autoDraw, computeGroup, computeKO, compute, result, setsToScore, woSets, scheduleCourts } = context.window.test;

for (let count = 2; count <= 32; count++) {
  const players = Array.from({ length: count }, (_, index) => 'P' + index);
  const rounds = roundRobin(players);
  const pairs = new Set();
  const byes = [];
  assert.equal(rounds.length, count % 2 ? count : count - 1);
  for (const round of rounds) {
    const seen = new Set();
    for (const [first, second] of round.pairs) {
      assert(!seen.has(first) && !seen.has(second));
      seen.add(first); seen.add(second);
      const key = [first, second].sort().join('|');
      assert(!pairs.has(key)); pairs.add(key);
    }
    if (round.bye) {
      assert(!seen.has(round.bye));
      byes.push(round.bye);
    }
  }
  assert.equal(pairs.size, count * (count - 1) / 2);
  assert(rounds.at(-1).pairs.some(pair => pair.includes(players[0]) && pair.includes(players[1])));
  if (count % 2) {
    assert.equal(byes.length, count);
    assert.equal(new Set(byes).size, count);
  }
}

for (let count = 1; count <= 64; count++) {
  const groups = Array.from({ length: count }, (_, index) => 'G' + index + '_');
  const slots = autoDraw(groups, 2).flat();
  for (const group of groups) {
    assert.equal(slots.filter(slot => slot === group + '1').length, 1);
    assert.equal(slots.filter(slot => slot === group + '2').length, 1);
    assert.notEqual(slots.indexOf(group + '1') < slots.length / 2, slots.indexOf(group + '2') < slots.length / 2);
  }
  const seeded = seedOrder(slots.length);
  groups.forEach((group, index) => assert.equal(slots.indexOf(group + '1'), seeded.indexOf(index + 1)));
}

for (const size of [8, 16, 32, 64]) {
  const order = seedOrder(size);
  for (let first = 1; first <= 8; first++) {
    for (let second = first + 1; second <= 8; second++) {
      const round = Math.floor(Math.log2(order.indexOf(first) ^ order.indexOf(second))) + 1;
      const earliest = Math.log2(size) - (second <= 2 ? 0 : second <= 4 ? 1 : 2);
      assert(round >= earliest);
    }
  }
}

const rules = { advance: 2, draw: [['A1', 'B1'], ['A2', 'B2']] };
const groups = {
  A: computeGroup('A', ['A-first', 'A-second'], {}, rules),
  B: computeGroup('B', ['B-first', 'B-second'], {}, rules),
};
const ko = computeKO({ groups: { A: [], B: [] }, rules }, groups, {});
assert.equal(ko.rounds[0].matches[0].a.label, 'A组第1名');
assert.equal(ko.rounds[0].matches[0].b.label, 'B组第1名');
const completed = computeGroup('A', ['A-first', 'A-second'], {
  'RR|A|A-first|A-second': { p: ['A-second', 'A-first'], s: '4-6', w: 'A-first' },
}, rules);
assert(completed.complete);
assert.equal(completed.ranked[0], 'A-first');
assert.equal(completed.games[0].r.score, '6-4');

const direct = compute({
  cfg: { groups: {}, rules: { advance: 0, draw: [['Alice', 'BYE'], ['Bob', 'Carol']] } },
  scores: { matches: {} },
});
assert(direct.ko);
assert.equal(Object.keys(direct.groups).length, 0);
assert.equal(direct.ko.rounds[1].matches[0].a.name, 'Alice');
assert.equal(direct.ko.rounds[0].matches[1].playable, true);
assert.equal(compute({ cfg: { groups: { A: ['Alice', 'Bob'] }, rules: { advance: 0 } }, scores: { matches: {} } }).ko, null);

const liveCfg = { groups: {}, rules: { advance: 0, draw: [['Alice', 'Bob'], ['Carol', 'Dave']] } };
const liveRec = { p: ['Bob', 'Alice'], live: true, c: '5' };
let live = compute({ cfg: liveCfg, scores: { matches: { 'KO|1|1': liveRec, 'KO|2|1': { p: ['Alice', 'Carol'], live: true } } } }).ko;
assert.equal(live.rounds[0].matches[0].live.court, '5');
assert.equal(live.rounds[0].matches[0].r, null);
assert.equal(live.rounds[0].matches[1].live, null);
assert.equal(live.rounds[1].matches[0].live, null);
assert.equal(result({ 'KO|1|1': liveRec }, 'KO|1|1', 'Alice', 'Bob'), null);
live = compute({ cfg: liveCfg, scores: { matches: { 'KO|1|1': { p: ['Alice', 'Carol'], live: true, c: '5' } } } }).ko;
assert.equal(live.rounds[0].matches[0].live, null);
live = compute({ cfg: liveCfg, scores: { matches: { 'KO|1|1': { p: ['Alice', 'Bob'], s: '6-4', w: 'Alice', live: true, c: '5' } } } }).ko;
assert.equal(live.rounds[0].matches[0].live, null);
assert.equal(live.rounds[1].matches[0].a.name, 'Alice');

const row = (a, b, mtb) => ({ a, b, mtb: !!mtb });
assert.equal(setsToScore([row('5', '2')]).score, '5-2');
assert.equal(setsToScore([row(' 6', '04'), row('3', '6'), row('10', '8', true), row('', '')]).score, '6-4 3-6 [10-8]');
assert.equal(setsToScore([row('', '')]).score, '');
assert.match(setsToScore([row('5', '')]).error, /第1盘/);
assert.match(setsToScore([row('', ''), row('6', '4')]).error, /第1盘/);
assert.match(setsToScore([row('6', '4'), row('3', '3')]).error, /第2盘.*相同/);
assert.match(setsToScore([row('100', '4')]).error, /第1盘/);
assert.match(setsToScore([row('6.5', '4')]).error, /第1盘/);

const woRules = (wo_score) => ({ points: { win: 1, loss: 0, wo_loss: 0 }, tiebreakers: ['wins', 'games_won', 'game_diff', 'h2h'], wo_score });
const woMatches = {
  'RR|A|A|B': { p: ['B', 'A'], s: '', w: 'A', n: 'W/O' },
  'RR|A|A|C': { p: ['C', 'A'], s: '5-3', w: 'C' },
  'RR|A|B|C': { p: ['B', 'C'], s: '5-2', w: 'B' },
};
let woGroup = computeGroup('A', ['A', 'B', 'C'], woMatches, woRules(undefined));
assert.equal(woGroup.ranked.join(), 'C,B,A');
assert.equal(woGroup.st.A.gw, 3);
woGroup = computeGroup('A', ['A', 'B', 'C'], woMatches, woRules('5-0'));
assert.equal(woGroup.ranked.join(), 'A,C,B');
assert.equal([woGroup.st.A.gw, woGroup.st.A.gl, woGroup.st.A.sw, woGroup.st.B.gw, woGroup.st.B.gl, woGroup.st.B.sl].join(), '8,5,1,5,7,1');
assert.equal(woGroup.games.find((g) => g.key === 'RR|A|A|B').r.score, '');
assert.equal(computeGroup('A', ['A', 'B', 'C'], woMatches, woRules({ 3: '6-0', 4: '5-0' })).st.A.gw, 9);
assert.equal(computeGroup('A', ['A', 'B', 'C'], woMatches, woRules({ 4: '5-0' })).st.A.gw, 3);
assert.equal(woSets('0-5', 3), null);
assert.equal(woSets('bad', 3), null);
assert.equal(woSets('6-4 [10-8]', 3).ga, 7);

const rrLive = computeGroup('A', ['A', 'B', 'C'], {
  'RR|A|A|B': { p: ['B', 'A'], live: true, c: '9' },
  'RR|A|A|C': { p: ['A', 'B'], live: true, c: '3' },
  'RR|A|B|C': { p: ['B', 'C'], s: '5-2', w: 'B', live: true },
}, woRules());
const rrGame = (key) => rrLive.games.find((g) => g.key === key);
assert.equal(rrGame('RR|A|A|B').live.court, '9');
assert.equal(rrGame('RR|A|A|B').r, null);
assert.equal(rrGame('RR|A|A|C').live, null);
assert.equal(rrGame('RR|A|B|C').live, null);
assert.equal(rrLive.done, 1);
const courts = scheduleCourts({ courts: [1, 14], rows: [
  { time: '8:00AM', matches: [{ eventId: 'ev', group: 'A', player1: 'B', player2: 'A' }, { eventId: 'other', group: 'A', player1: 'A', player2: 'C' }] },
  { time: '8:30AM', matches: [null, { eventId: 'ev', group: 'A', player1: 'A', player2: 'C' }] },
] }, 'ev');
assert.equal([...courts].join(';'), 'RR|A|A|B,1;RR|A|A|C,14');
assert.equal(scheduleCourts(null, 'ev').size, 0);

console.log('PASS: round robin 2-32 players; opposite halves 1-64 groups; seed positions; manual draw; existing scores; KO in-progress marks; per-set score entry; W/O full score; round-robin live marks and scheduled courts.');