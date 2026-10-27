'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { parseArgs } = require('node:util');

function parsePlayers(text) {
  const entries = String(text).replace(/^\uFEFF/, '').split(/[\r\n,;\uFF0C\uFF1B]+/u).map(entry => entry.trim()).filter(Boolean);
  const names = new Set();
  const seeds = new Set();
  return entries.map(entry => {
    const marker = /\s*\[(\d+)\]\s*$/u.exec(entry);
    const name = (marker ? entry.slice(0, marker.index) : entry).trim();
    const seed = marker ? Number(marker[1]) : null;
    if (!name || /[\[\]|]/u.test(name)) throw new Error('Invalid player name or seed notation: ' + entry);
    if (/^bye$/i.test(name)) throw new Error('BYE is reserved for an empty bracket slot.');
    if (names.has(name)) throw new Error('Duplicate player: ' + name);
    if (seed !== null && (!Number.isSafeInteger(seed) || seed < 1)) throw new Error('Seeds must be positive safe integers: ' + entry);
    if (seed !== null && seeds.has(seed)) throw new Error('Duplicate seed [' + seed + '].');
    names.add(name);
    if (seed !== null) seeds.add(seed);
    return { name, seed };
  });
}

function shuffle(items, rng) {
  const shuffled = items.slice();
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = rng(index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function groupLabel(index) {
  let label = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + (value - 1) % 26) + label;
  }
  return label;
}

function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap(seed => [seed, next + 1 - seed]);
  }
  return order;
}

function integer(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new Error(label + ' must be a non-negative integer.');
  }
  return Number(value);
}

function qualifierDraw(groupNames, rng) {
  const count = groupNames.length;
  let size = 2;
  while (size < count * 2) size *= 2;
  const order = seedOrder(size);
  const winnerSlots = groupNames.map((group, index) => order.indexOf(index + 1));
  const byeCount = size - count * 2;
  const winnerByes = Math.min(count, byeCount);
  const half = position => position < size / 2 ? 0 : 1;
  let selectedRunner = null;
  if (count === 5) {
    selectedRunner = groupNames[rng(count)];
    const selectedIndex = groupNames.indexOf(selectedRunner);
    winnerSlots[4] = order.indexOf(selectedIndex === 1 || selectedIndex === 2 ? 6 : 5);
  }
  const slots = Array(size).fill(null);
  winnerSlots.forEach((position, index) => { slots[position] = groupNames[index] + '1'; });
  for (let index = 0; index < winnerByes; index++) slots[winnerSlots[index] ^ 1] = 'BYE';
  const runnerByes = new Set();
  for (const side of [0, 1]) {
    const positions = slots.map((slot, position) => position).filter(position => half(position) === side);
    const placedByes = positions.filter(position => slots[position] === 'BYE').length;
    const needed = size / 2 - count - placedByes;
    const eligible = groupNames.filter((group, index) => half(winnerSlots[index]) !== side);
    const selected = selectedRunner
      ? eligible.filter(group => group === selectedRunner).slice(0, needed)
      : shuffle(eligible, rng).slice(0, needed);
    if (selected.length !== needed) throw new Error('Unable to allocate qualifier byes.');
    for (const group of selected) {
      const position = positions.find(position => slots[position] === null && slots[position ^ 1] === null);
      if (position === undefined) throw new Error('Unable to place a qualifier bye.');
      slots[position] = group + '2';
      slots[position ^ 1] = 'BYE';
      runnerByes.add(group);
    }
  }
  groupNames.forEach((group, index) => {
    if (runnerByes.has(group)) return;
    const position = slots.findIndex((slot, position) => slot === null && half(position) !== half(winnerSlots[index]));
    if (position === -1) throw new Error('Unable to separate group qualifiers.');
    slots[position] = group + '2';
  });
  const pairs = [];
  for (let index = 0; index < size; index += 2) pairs.push([slots[index], slots[index + 1]]);
  return pairs;
}

function generateDraw({ text, groups, advance = 0, name = 'Tennis event' }, rng = randomInt) {
  const players = parsePlayers(text);
  const groupCount = integer(groups, 'Group count');
  const qualifiers = integer(advance, 'Advance count');
  if (!players.length) throw new Error('At least one player or team is required.');
  if (groupCount > players.length) throw new Error('Group count cannot exceed player count.');
  if (!groupCount && players.length < 2) throw new Error('Direct knockout requires at least two players or teams.');
  if (groupCount && qualifiers > Math.floor(players.length / groupCount)) {
    throw new Error('Advance count cannot exceed the smallest group size.');
  }
  if (!String(name).trim()) throw new Error('Event name cannot be empty.');

  const seeded = players.filter(player => player.seed !== null).sort((first, second) => first.seed - second.seed);
  const unseeded = shuffle(players.filter(player => player.seed === null), rng);
  const playerLabel = player => player.seed === null ? player.name : player.name + ' [' + player.seed + ']';
  const config = {
    name: String(name).trim(),
    groups: {},
    seeds: Object.fromEntries(seeded.map(player => [playerLabel(player), player.seed])),
    rules: {
      advance: groupCount ? qualifiers : 0,
      points: { win: 1, loss: 0, wo_loss: 0 },
      tiebreakers: ['points', 'h2h', 'set_diff', 'game_diff'],
      third_place: true,
      show_set_column: true,
      score_hint: '6-4 / 6-4 3-6 [10-8]',
    },
  };

  if (!groupCount) {
    const ordered = seeded.concat(unseeded);
    let size = 2;
    while (size < ordered.length) size *= 2;
    const slots = seedOrder(size).map(rank => ordered[rank - 1] ? playerLabel(ordered[rank - 1]) : 'BYE');
    config.rules.draw = [];
    for (let index = 0; index < slots.length; index += 2) {
      config.rules.draw.push([slots[index], slots[index + 1]]);
    }
    return config;
  }

  const indices = Array.from({ length: groupCount }, (_, index) => index);
  const sizes = indices.map(() => Math.floor(players.length / groupCount));
  const extra = players.length % groupCount;
  shuffle(indices, rng).slice(0, extra).forEach(index => sizes[index]++);
  const lists = indices.map(() => []);
  const seedCounts = indices.map(() => 0);
  const seedTargets = [];
  seeded.forEach((player, index) => {
    const available = indices.filter(group => seedCounts[group] < sizes[group]);
    const minimum = Math.min(...available.map(group => seedCounts[group]));
    const priority = index < groupCount ? available : available.slice().reverse();
    const target = priority.find(group => seedCounts[group] === minimum);
    seedTargets.push(target);
    seedCounts[target]++;
  });
  for (let offset = groupCount; offset < seedTargets.length; offset += groupCount) {
    const layer = shuffle(seedTargets.slice(offset, offset + groupCount), rng);
    seedTargets.splice(offset, layer.length, ...layer);
  }
  seeded.forEach((player, index) => lists[seedTargets[index]].push(playerLabel(player)));
  for (const index of indices) {
    while (lists[index].length < sizes[index]) lists[index].push(playerLabel(unseeded.pop()));
    config.groups[groupLabel(index)] = lists[index];
  }
  if (qualifiers === 2) config.rules.draw = qualifierDraw(Object.keys(config.groups), rng);
  return config;
}

function scalar(value) {
  return JSON.stringify(value).replace(/[\u0085\u2028\u2029]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
}

function toYaml(config) {
  const groups = Object.entries(config.groups);
  const lines = ['name: ' + scalar(config.name), groups.length ? 'groups:' : 'groups: {}'];
  groups.forEach(([group, players]) => lines.push('  ' + scalar(group) + ': ' + scalar(players)));
  lines.push('seeds: ' + scalar(config.seeds), 'rules:');
  for (const [key, value] of Object.entries(config.rules)) {
    if (key === 'draw') {
      lines.push('  draw:');
      value.forEach(pair => lines.push('    - ' + scalar(pair)));
    } else {
      lines.push('  ' + key + ': ' + scalar(value));
    }
  }
  return lines.join('\n') + '\n';
}

function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    players: { type: 'string' }, text: { type: 'string' }, groups: { type: 'string' },
    advance: { type: 'string' }, name: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node skills/generate_draw/generate_draw.js --players players.txt --groups N --advance J --output event.yml [--name "Event"]');
    console.log('Use --text "Amy [1]; Ben [2]; Carol" instead of --players, or --players - for UTF-8 stdin.');
    return;
  }
  if (values.groups === undefined || !values.output) throw new Error('--groups and --output are required.');
  if (values.players !== undefined && values.text !== undefined) throw new Error('Choose --players or --text, not both.');
  if (values.players === undefined && values.text === undefined) throw new Error('--players or --text is required.');
  if (integer(values.groups, 'Group count') > 0 && values.advance === undefined) throw new Error('--advance is required for group play (0 means no knockout).');
  const output = path.resolve(values.output);
  if (!/\.yml$/i.test(output)) throw new Error('Output must have a .yml extension.');
  if (fs.existsSync(output)) throw new Error('Refusing to overwrite existing file: ' + output);
  const root = path.resolve(__dirname, '../..');
  const eventDirectory = path.join(root, '_data/events');
  if (path.relative(eventDirectory, path.dirname(output)) === '') {
    const id = path.basename(output).slice(0, -4);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Event id must use lowercase letters, digits and hyphens.');
    if (fs.existsSync(path.join(root, 'events/scores', id + '.json'))) throw new Error('Existing scores found for event: ' + id);
  }
  const text = values.text !== undefined ? values.text : fs.readFileSync(values.players === '-' ? 0 : values.players, 'utf8');
  const config = generateDraw({ text, groups: values.groups, advance: values.advance, name: values.name });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, toYaml(config), { encoding: 'utf8', flag: 'wx' });
  console.log('Created ' + output);
  console.log(Object.keys(config.groups).length ? 'Group sizes: ' + Object.values(config.groups).map(group => group.length).join(', ') : 'Knockout slots: ' + config.rules.draw.length * 2);
}

module.exports = { parsePlayers, generateDraw, toYaml, seedOrder, groupLabel, main };

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}