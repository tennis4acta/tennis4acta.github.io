'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseEvents, describeEvent, buildConfig, toYaml, pageMarkdown } = require('./generate_registration');

let yaml;
try { yaml = require('js-yaml'); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const script = path.join(__dirname, 'generate_registration.js');
const sample = 'Mens Singles Grade A=16; Mens Singles Grade B=64; Womens Singles=16; Mens Doubles Grade A=12; ' +
  'Mens Doubles Grade B=32; Womens Doubles=20; Seniors Doubles 50-70=10';

test('parse "name=capacity" lists with mixed separators', () => {
  assert.deepEqual(parseEvents('\uFEFFMens Singles Grade A=16\r\nWomens Doubles: 20；中年组双打（50-70岁）：10;;'), [
    { label: 'Mens Singles Grade A', capacity: 16 }, { label: 'Womens Doubles', capacity: 20 }, { label: '中年组双打（50-70岁）', capacity: 10 },
  ]);
  for (const text of ['', 'Mens Singles', '=16', 'Mens Singles=1', 'Mens Singles=513', 'Mens Singles=1.5', 'A Singles=4; a singles=8']) {
    assert.throws(() => parseEvents(text), text);
  }
});

test('infer format, gender, grade and age with 2026-style names and ids', () => {
  const { config, warnings } = buildConfig({ year: 2028, events: parseEvents(sample) });
  assert.deepEqual(warnings, []);
  assert.deepEqual(config.events.map(e => [e.id, e.name, e.name_en, e.format, e.gender, e.capacity, e.requirements]), [
    ['singles_a', '男子单打 A级别', 'Men\'s Singles Grade A', 'singles', 'male', 16, 'singles_a'],
    ['singles_b', '男子单打 B级别', 'Men\'s Singles Grade B', 'singles', 'male', 64, 'singles_b'],
    ['singles_w', '女子单打', 'Women\'s Singles', 'singles', 'female', 16, 'singles_w'],
    ['doubles_a', '男子双打 A级别', 'Men\'s Doubles Grade A', 'doubles', 'male', 12, 'doubles_a'],
    ['doubles_b', '男子双打 B级别', 'Men\'s Doubles Grade B', 'doubles', 'male', 32, 'doubles_b'],
    ['doubles_w', '女子双打', 'Women\'s Doubles', 'doubles', 'female', 20, 'doubles_w'],
    ['doubles_s', '中年组双打（50-70岁）', 'Seniors Doubles (50-70)', 'doubles', 'open', 10, 'doubles_s'],
  ]);
  assert.deepEqual(config.events[6].age, { min: 50, max: 70 });
  assert.equal(config.events[0].age, undefined);
  assert.deepEqual(config.days.map(d => d.id), ['singles', 'doubles']);
  assert.deepEqual(config.events.map(e => e.day), ['singles', 'singles', 'singles', 'doubles', 'doubles', 'doubles', 'doubles']);
});

test('Chinese, bilingual, mixed, open-age and unrecognised names', () => {
  assert.deepEqual(describeEvent('男子单打A级').event, describeEvent('Men’s Singles Grade A').event);
  assert.deepEqual(describeEvent('混双').event, { id: 'doubles_x', name: '混合双打', name_en: 'Mixed Doubles', day: 'doubles', format: 'doubles', gender: 'mixed', requirements: 'doubles_x' });
  const over = describeEvent('Womens Doubles 50+').event;
  assert.deepEqual([over.id, over.name, over.age], ['doubles_ws', '女子中年组双打（50岁以上）', { min: 50 }]);
  const both = describeEvent('男子单打 A级别 红宝石区 | Men\'s Singles Grade A Ruby');
  assert.deepEqual([both.event.id, both.event.name, both.event.name_en, both.event.requirements, both.warnings],
    ['singles_a_ruby', '男子单打 A级别 红宝石区', 'Men\'s Singles Grade A Ruby', 'singles_a', []]);
  const kept = describeEvent('Mens Singles Grade A Sapphire');
  assert.deepEqual([kept.event.id, kept.event.name, kept.event.name_en], ['singles_a_sapphire', 'Mens Singles Grade A Sapphire', '']);
  assert.match(kept.warnings[0], /unrecognised: "Sapphire"/);
  assert.match(describeEvent('Seniors Doubles').warnings[0], /No age range/);
  assert.throws(() => describeEvent('Mens Grade A'), /singles or doubles/);
  assert.throws(() => describeEvent('Singles and Doubles Challenge'), /singles or doubles/);
  assert.throws(() => describeEvent('男子单打 | 女子单打'), /one Chinese and one English/);
  assert.throws(() => buildConfig({ year: 2028, events: parseEvents('Mens Singles Grade A=8; 男子单打 A级别=8') }), /both become event id singles_a/);
  assert.throws(() => buildConfig({ year: 28, events: parseEvents('Mens Singles=8') }), /four-digit year/);
});

test('YAML keeps every field, quotes and declarations', { skip: !yaml }, () => {
  const { config } = buildConfig({ year: 2028, title: 'ACTC: "Cup" #1', events: parseEvents(sample) });
  assert.deepEqual(yaml.load(toYaml(config)), JSON.parse(JSON.stringify(config)));
  const ids = config.declarations.map(d => d.id);
  assert.deepEqual(ids, ['rules', 'health', 'insurance', 'liability', 'withdrawal', 'privacy', 'partner', 'photo']);
  assert.deepEqual(config.declarations.filter(d => !d.required).map(d => d.id), ['photo']);
  assert.deepEqual(config.declarations.filter(d => d.doubles_only).map(d => d.id), ['partner']);
});

test('page front matter for public and hidden test pages', () => {
  const page = pageMarkdown({ id: '2028', year: 2028, title: '2028 ACTC', permalink: '/2028/register/' });
  assert.match(page, /^---\nlayout: page\ntitle: "2028 ACTC 报名表"\n/);
  assert.match(page, /permalink: \/2028\/register\/\n---/);
  assert.doesNotMatch(page, /robots|测试页面/);
  assert.match(page, /\{% include registration_form\.html id="2028" %\}/);
  const hidden = pageMarkdown({ id: 'test-2028', year: 2028, title: '2028 ACTC', permalink: '/test/2028/register/', test: true });
  assert.match(hidden, /robots: noindex, nofollow/);
  assert.match(hidden, /id="test-2028"/);
});

test('CLI writes UTF-8 data and page, supports dry runs and refuses to overwrite', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'actc-registration-'));
  try {
    const list = path.join(root, 'events.txt');
    fs.writeFileSync(list, '\uFEFF男子单打 A级别=16\n女子双打=20\n', 'utf8');
    const dry = spawnSync(process.execPath, [script, '--year', '2028', '--file', list, '--root', root, '--dry-run'], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /name: "男子单打 A级别"/);
    assert.deepEqual(fs.readdirSync(root), ['events.txt']);

    const args = [script, '--year', '2028', '--file', list, '--root', root];
    const created = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(created.status, 0, created.stderr);
    const data = path.join(root, '_data', 'registration', '2028.yml');
    const page = path.join(root, '2028', 'register.md');
    assert.match(fs.readFileSync(data, 'utf8'), /name_en: "Women's Doubles"/);
    assert.match(fs.readFileSync(page, 'utf8'), /permalink: \/2028\/register\//);
    const before = fs.readFileSync(data, 'utf8');
    const again = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /Refusing to overwrite/);
    assert.equal(fs.readFileSync(data, 'utf8'), before);

    const hidden = spawnSync(process.execPath, [script, '--year', '2028', '--events', 'Mixed Doubles=8', '--test', '--root', root], { encoding: 'utf8' });
    assert.equal(hidden.status, 0, hidden.stderr);
    assert.match(fs.readFileSync(path.join(root, 'test', '2028', 'register.md'), 'utf8'), /robots: noindex, nofollow/);
    assert(fs.existsSync(path.join(root, '_data', 'registration', 'test-2028.yml')));

    const invalid = spawnSync(process.execPath, [script, '--year', '2029', '--events', 'Mens Grade A=8', '--root', root], { encoding: 'utf8' });
    assert.notEqual(invalid.status, 0);
    assert(!fs.existsSync(path.join(root, '_data', 'registration', '2029.yml')));
    assert.notEqual(spawnSync(process.execPath, [script, '--year', '2029', '--root', root]).status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
