'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { parsePlayers, generateDraw, toYaml, seedOrder, groupLabel } = require('./generate_draw');

let yaml;
try { yaml = require('js-yaml'); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const source = fs.readFileSync(path.resolve(__dirname, '../../js/tournament.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source.slice(0, source.indexOf('  // ---------- GitHub storage')) +
  '\nwindow.test = { compute, seedOrder, roundRobin }; })();', context);
const scoreboard = context.window.test;
const firstRandom = () => 0;
const lastRandom = limit => limit - 1;

test('parse mixed delimiters, doubles, BOM and sparse seeds', () => {
  assert.deepEqual(parsePlayers('\uFEFFAmy [1]\r\nBen [4], Carol & Dan; Eve\uFF0CFrank\uFF1BGrace'), [
    { name: 'Amy', seed: 1 }, { name: 'Ben', seed: 4 }, { name: 'Carol & Dan', seed: null },
    { name: 'Eve', seed: null }, { name: 'Frank', seed: null }, { name: 'Grace', seed: null },
  ]);
  assert.throws(() => parsePlayers('Amy [2]; Ben [02]'), /Duplicate seed/);
  assert.throws(() => parsePlayers('Amy; Amy [3]'), /Duplicate player/);
  for (const text of ['Amy [0]', 'Amy [-1]', 'Amy [1.5]', 'Amy [x]', '[1]', 'BYE', 'A|B', 'Amy [9007199254740992]']) {
    assert.throws(() => parsePlayers(text));
  }
});

test('validate group and advance counts before drawing', () => {
  for (const options of [
    { text: '', groups: 1 }, { text: 'A', groups: 0 }, { text: 'A;B', groups: 3 },
    { text: 'A;B;C', groups: 2, advance: 2 }, { text: 'A;B', groups: -1 },
    { text: 'A;B', groups: 1.5 }, { text: 'A;B', groups: 1, advance: -1 },
  ]) assert.throws(() => generateDraw(options));
});

test('balanced groups, all players once, seeds first and group seeds meet last', () => {
  for (let count = 2; count <= 40; count++) {
    for (let groups = 1; groups <= Math.min(count, 9); groups++) {
      for (const seeded of [0, Math.min(count, groups * 2), count]) {
        const text = Array.from({ length: count }, (_, index) => 'P' + index + (index < seeded ? ' [' + (index * 2 + 1) + ']' : '')).join(';');
        const config = generateDraw({ text, groups, advance: 1 }, firstRandom);
        const lists = Object.values(config.groups);
        const sizes = lists.map(list => list.length);
        assert.equal(lists.length, groups);
        assert(Math.max(...sizes) - Math.min(...sizes) <= 1);
        assert.equal(new Set(lists.flat()).size, count);
        assert.equal(lists.flat().length, count);
        for (const list of lists) {
          const seededNames = list.filter(name => Object.hasOwn(config.seeds, name));
          assert.deepEqual(list.slice(0, seededNames.length), seededNames);
          if (seededNames.length === 2) {
            const last = scoreboard.roundRobin(list).at(-1);
            assert(last.pairs.some(pair => pair.includes(seededNames[0]) && pair.includes(seededNames[1])));
          }
        }
        const view = scoreboard.compute({ cfg: config, scores: { matches: {} } });
        assert(view.ko);
      }
    }
  }
});

test('surplus places are randomized rather than always assigned to first groups', () => {
  const options = { text: 'A;B;C;D;E;F;G;H;I;J', groups: 3, advance: 2 };
  const first = generateDraw(options, firstRandom);
  const last = generateDraw(options, lastRandom);
  assert.notDeepEqual(Object.values(first.groups).map(list => list.length), Object.values(last.groups).map(list => list.length));
});

test('eight seeds in five groups leave the top two seeds alone', () => {
  const text = Array.from({ length: 24 }, (_, index) => 'P' + index + (index < 8 ? ' [' + (index + 1) + ']' : '')).join(';');
  for (const rng of [firstRandom, lastRandom]) {
    const config = generateDraw({ text, groups: 5, advance: 2 }, rng);
    assert.equal(config.groups.A.filter(name => Object.hasOwn(config.seeds, name)).length, 1);
    assert.equal(config.groups.B.filter(name => Object.hasOwn(config.seeds, name)).length, 1);
    assert.equal(config.groups.A[0], 'P0 [1]');
    assert.equal(config.groups.B[0], 'P1 [2]');
    assert.deepEqual(Object.values(config.groups).map(group => group.length).sort(), [4, 5, 5, 5, 5]);
  }
});

test('additional seed layers favor lower-seeded groups, not higher-seeded groups', () => {
  const text = Array.from({ length: 24 }, (_, index) => 'P' + index + (index < 13 ? ' [' + (index + 1) + ']' : '')).join(';');
  const config = generateDraw({ text, groups: 5, advance: 2 }, firstRandom);
  assert.deepEqual(Object.values(config.groups).map(group => group.filter(name => Object.hasOwn(config.seeds, name)).length), [2, 2, 3, 3, 3]);
});

test('later seed layers are randomized without changing first-layer protection or group capacities', () => {
  for (const seeded of [8, 13]) {
    const text = Array.from({ length: 24 }, (_, index) => 'P' + index + (index < seeded ? ' [' + (index + 1) + ']' : '')).join(';');
    const first = generateDraw({ text, groups: 5, advance: 2 }, firstRandom);
    const last = generateDraw({ text, groups: 5, advance: 2 }, lastRandom);
    const placements = config => Object.values(config.groups).map(group => group.filter(name => Object.hasOwn(config.seeds, name)));
    const firstSeeds = placements(first);
    const lastSeeds = placements(last);
    assert.notDeepEqual(firstSeeds, lastSeeds);
    assert.deepEqual(firstSeeds.map(group => group.length), lastSeeds.map(group => group.length));
    firstSeeds.forEach((group, index) => assert.equal(group[0], 'P' + index + ' [' + (index + 1) + ']'));
    lastSeeds.forEach((group, index) => assert.equal(group[0], 'P' + index + ' [' + (index + 1) + ']'));
    for (const config of [first, last]) {
      assert.deepEqual(Object.values(config.groups).map(group => group.length).sort(), [4, 5, 5, 5, 5]);
      Object.values(config.groups).forEach(group => {
        const ranks = group.filter(name => Object.hasOwn(config.seeds, name)).map(name => config.seeds[name]);
        assert.deepEqual(ranks, ranks.slice().sort((first, second) => first - second));
      });
    }
  }
});

test('ten qualifiers: all five winners and any randomly selected runner-up receive byes', () => {
  const text = Array.from({ length: 24 }, (_, index) => 'P' + index + (index < 8 ? ' [' + (index + 1) + ']' : '')).join(';');
  for (let selected = 0; selected < 5; selected++) {
    const config = generateDraw({ text, groups: 5, advance: 2 }, limit => limit === 5 ? selected : 0);
    const draw = config.rules.draw;
    const recipients = draw.filter(pair => pair.includes('BYE')).map(pair => pair.find(token => token !== 'BYE')).sort();
    assert.deepEqual(recipients, ['A1', 'B1', 'C1', 'D1', 'E1', groupLabel(selected) + '2'].sort());
    assert.equal(draw.length, 8);
    const slots = draw.flat();
    for (const group of Object.keys(config.groups)) assert.notEqual(slots.indexOf(group + '1') < 8, slots.indexOf(group + '2') < 8);
    assert.equal(slots.indexOf('A1'), 0);
    assert.equal(slots.indexOf('B1'), 8);
    assert.equal(slots.indexOf('C1'), 12);
    assert.equal(slots.indexOf('D1'), 4);
    const view = scoreboard.compute({ cfg: config, scores: { matches: {} } });
    assert.equal(view.ko.rounds[0].matches.filter(match => match.a.bye || match.b.bye).length, 6);
  }
});

test('twelve qualifiers: groups headed by the top four seeds receive the four byes', () => {
  const text = Array.from({ length: 24 }, (_, index) => 'P' + index + (index < 8 ? ' [' + (index + 1) + ']' : '')).join(';');
  const config = generateDraw({ text, groups: 6, advance: 2 }, firstRandom);
  const recipients = config.rules.draw.filter(pair => pair.includes('BYE')).map(pair => pair.find(token => token !== 'BYE')).sort();
  assert.deepEqual(recipients, ['A1', 'B1', 'C1', 'D1']);
  ['A', 'B', 'C', 'D'].forEach((group, index) => assert.equal(config.seeds[config.groups[group][0]], index + 1));
});

test('explicit two-qualifier draws preserve all entrants, bye priorities and opposite halves', () => {
  for (let groups = 1; groups <= 64; groups++) {
    const text = Array.from({ length: groups * 3 }, (_, index) => 'P' + index).join(';');
    const config = generateDraw({ text, groups, advance: 2 }, firstRandom);
    const slots = config.rules.draw.flat();
    const byes = slots.length - groups * 2;
    assert.equal(slots.filter(token => token === 'BYE').length, byes);
    assert.equal(new Set(slots.filter(token => token !== 'BYE')).size, groups * 2);
    config.rules.draw.forEach(pair => assert.notDeepEqual(pair, ['BYE', 'BYE']));
    Object.keys(config.groups).forEach((group, index) => {
      const first = slots.indexOf(group + '1');
      const second = slots.indexOf(group + '2');
      assert(first >= 0 && second >= 0);
      assert.notEqual(first < slots.length / 2, second < slots.length / 2);
      assert.equal(slots[first ^ 1] === 'BYE', index < Math.min(groups, byes));
    });
  }
});

test('direct knockout: seeds get byes first, sparse seed order protected, no bye vs bye', () => {
  for (let count = 2; count <= 64; count++) {
    for (const seeded of [0, Math.floor(count / 2), count]) {
      const entries = Array.from({ length: count }, (_, index) => 'P' + index + (index < seeded ? ' [' + (index * 3 + 2) + ']' : ''));
      const config = generateDraw({ text: entries.reverse().join('\n'), groups: 0, advance: 9 }, firstRandom);
      assert.equal(config.rules.advance, 0);
      assert.equal(Object.keys(config.groups).length, 0);
      const slots = config.rules.draw.flat();
      const byes = slots.length - count;
      assert.equal(slots.filter(name => name === 'BYE').length, byes);
      assert.equal(new Set(slots.filter(name => name !== 'BYE')).size, count);
      for (const pair of config.rules.draw) assert.notDeepEqual(pair, ['BYE', 'BYE']);
      for (let index = 0; index < seeded; index++) {
        const position = slots.indexOf('P' + index + ' [' + (index * 3 + 2) + ']');
        assert.equal(slots[position ^ 1] === 'BYE', index < byes);
      }
      const order = seedOrder(slots.length);
      for (let index = 0; index < seeded; index++) assert.equal(slots.indexOf('P' + index + ' [' + (index * 3 + 2) + ']'), order.indexOf(index + 1));
      assert.deepEqual(order, Array.from(scoreboard.seedOrder(slots.length)));
      const view = scoreboard.compute({ cfg: config, scores: { matches: {} } });
      assert(view.ko);
      assert.equal(view.ko.rounds.length, Math.log2(slots.length));
    }
  }
});

test('group labels and YAML quoting', () => {
  assert.equal(groupLabel(25), 'Z');
  assert.equal(groupLabel(26), 'AA');
  const config = generateDraw({ text: 'A: #1 [1]; "Ben"; true; __proto__', groups: 2, advance: 1, name: 'Test: # event' }, lastRandom);
  const yaml = toYaml(config);
  assert(yaml.includes('name: "Test: # event"'));
  assert(yaml.includes('"A: #1 [1]"'));
  assert(yaml.includes('\\"Ben\\"'));
  assert(yaml.includes('rules:\n  advance: 1'));
  assert(yaml.includes('[1]'));
  assert.equal(config.rules.third_place, true);
  assert.equal(config.rules.show_set_column, true);
});

test('preserve seed labels in groups, draw, metadata and scoreboard participants', () => {
  const text = 'Harper Liu [1]; Morgan Wu [2]; Alex Lin; Charlie Feng';
  const grouped = generateDraw({ text, groups: 2, advance: 1 }, firstRandom);
  assert.equal(grouped.groups.A[0], 'Harper Liu [1]');
  assert.equal(grouped.groups.B[0], 'Morgan Wu [2]');
  assert.equal(grouped.seeds['Harper Liu [1]'], 1);
  assert(scoreboard.compute({ cfg: grouped, scores: { matches: {} } }).groups.A.players.includes('Harper Liu [1]'));
  const direct = generateDraw({ text, groups: 0 }, firstRandom);
  assert(direct.rules.draw.flat().includes('Harper Liu [1]'));
  assert(scoreboard.compute({ cfg: direct, scores: { matches: {} } }).ko.rounds[0].matches.some(match => match.a.name === 'Harper Liu [1]' || match.b.name === 'Harper Liu [1]'));
});

test('independent YAML parser roundtrip and scoreboard consumption', { skip: !yaml }, () => {
  for (const groups of [0, 1, 2, 3]) {
    const config = generateDraw({ text: '\u5f20\u4e09 & \u674e\u56db [1]; Amy [4]; A: # comment; "Ben"; true; YES', groups, advance: 1, name: 'Event: #1' });
    const parsed = yaml.load(toYaml(config));
    assert.deepEqual(parsed, config);
    assert(scoreboard.compute({ cfg: parsed, scores: { matches: {} } }).ko);
  }
});

test('CLI writes UTF-8 YAML, refuses overwrite and rejects duplicate seeds without output', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'actc-draw-'));
  const script = path.join(__dirname, 'generate_draw.js');
  const output = path.join(directory, 'draw.yml');
  const args = [script, '--text', 'Amy [1]; Ben [4]; Carol; Dan; Eve', '--groups', '0', '--output', output];
  try {
    const created = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(created.status, 0, created.stderr);
    const original = fs.readFileSync(output, 'utf8');
    assert(original.includes('groups: {}'));
    assert(original.includes('  draw:'));
    assert.notEqual(spawnSync(process.execPath, args).status, 0);
    assert.equal(fs.readFileSync(output, 'utf8'), original);
    const invalid = path.join(directory, 'invalid.yml');
    const failed = spawnSync(process.execPath, [script, '--text', 'Amy [2]; Ben [2]', '--groups', '1', '--advance', '1', '--output', invalid], { encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Duplicate seed/);
    assert(!fs.existsSync(invalid));
    const players = path.join(directory, 'players.txt');
    fs.writeFileSync(players, '\uFEFFAmy [1]\r\nBen [4]\r\nCarol\r\nDan', 'utf8');
    const grouped = spawnSync(process.execPath, [script, '--players', players, '--groups', '2', '--advance', '1', '--output', path.join(directory, 'groups.yml')], { encoding: 'utf8' });
    assert.equal(grouped.status, 0, grouped.stderr);
    const stdin = spawnSync(process.execPath, [script, '--players', '-', '--groups', '0', '--output', path.join(directory, 'stdin.yml')], { encoding: 'utf8', input: 'Amy;Ben' });
    assert.equal(stdin.status, 0, stdin.stderr);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});