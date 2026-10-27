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
  '\nwindow.test = { roundRobin, seedOrder, autoDraw, computeGroup, computeKO }; })();', context);
const { roundRobin, seedOrder, autoDraw, computeGroup, computeKO } = context.window.test;

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

console.log('PASS: round robin 2-32 players; opposite halves 1-64 groups; seed positions; manual draw; existing scores.');