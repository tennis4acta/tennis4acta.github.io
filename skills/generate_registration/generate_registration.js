'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const ROOT = path.resolve(__dirname, '../..');
const CJK = /[\u3400-\u9fff]/u;
const ORIGINS = ['中国大陆 Mainland China', '香港 Hong Kong', '澳门 Macau', '台湾 Taiwan'];
const DAY_NAMES = { singles: '单打 Singles', doubles: '双打 Doubles' };
const DECLARATIONS = [
  { id: 'rules', required: true, text: '我已阅读并遵守参赛规程及所报项目的参赛要求，确认本人（双打为两位球员）符合参赛资格，所填信息真实准确。I have read the rules and event requirements, confirm eligibility (both players for doubles), and the information above is accurate.' },
  { id: 'health', required: true, text: '健康承诺：本人身体状况良好、适合参赛，并对自身健康负责。Health: I am fit to compete and responsible for my own health.' },
  { id: 'insurance', required: true, text: '运动保险：本人已自行购买有效的运动类人身意外伤害保险。Insurance: I hold valid personal accident insurance that covers playing tennis.' },
  { id: 'liability', required: true, text: '免责声明：本人自行承担参赛及使用场地的风险；赛事主办方、工作人员及场地方不对任何伤亡、财物遗失或损坏承担责任。Liability: I play at my own risk; the organisers, officials and venue are not liable for death, injury, or loss of or damage to property.' },
  { id: 'withdrawal', required: true, text: '退赛与退款：报名后不得擅自更换球员；须在报名截止前通知组委会退赛并获核准，方可退还报名费。Withdrawal: no player substitutions; entry fees are refunded only for withdrawals approved before registration closes.' },
  { id: 'privacy', required: true, text: '个人信息：同意组委会收集以上信息，仅用于本届赛事的报名、资格审核、分组、联络及公布赛程成绩（姓名会出现在网站的分组和成绩中）。Privacy: my details are used only for entries, eligibility checks, draws, contact and publishing draws/results (names appear on the website).' },
  { id: 'partner', required: true, doubles_only: true, text: '我已征得搭档同意，代其提交以上信息并作出上述声明。I have my partner\'s consent to submit their details and make these declarations on their behalf.' },
  { id: 'photo', required: false, text: '（可选）同意赛会在官网及微信群发布含本人（及搭档）的比赛照片和视频。(Optional) Photos and videos of me (and my partner) may be published on the club website and WeChat groups.' },
];

const AGE_RANGE = /(\d{2})\s*(?:-|–|—|~|～|至|到)\s*(\d{2})/u;
const AGE_OVER = /(\d{2})\s*(?:\+|岁以上)|\bover\s*(\d{2})\b/iu;
const GRADE = /\bgrade\s*([a-z])\b|\b([a-z])\s*grade\b|([a-z])\s*级/iu;

function parseEvents(text) {
  const entries = String(text).replace(/^\uFEFF/, '').split(/[\r\n;\uFF1B]+/u).map(entry => entry.trim()).filter(Boolean);
  if (!entries.length) throw new Error('No events given. Use "Event name=capacity", separated by ";" or new lines.');
  const names = new Set();
  return entries.map(entry => {
    const match = /^(.*?)\s*[=:\uFF1A\uFF1D]\s*(\d+)\s*$/u.exec(entry);
    if (!match || !match[1].trim()) throw new Error('Expected "Event name=capacity": ' + entry);
    const label = match[1].trim();
    const capacity = Number(match[2]);
    if (!Number.isSafeInteger(capacity) || capacity < 2 || capacity > 512) throw new Error('Capacity must be a whole number from 2 to 512: ' + entry);
    if (names.has(label.toLowerCase())) throw new Error('Duplicate event: ' + label);
    names.add(label.toLowerCase());
    return { label, capacity };
  });
}

function describeEvent(label) {
  const parts = String(label).split('|').map(part => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 2) throw new Error('Use one name, or "中文名 | English name": ' + label);
  const text = parts.join(' ');
  const isDoubles = /doubles|双打|混双/iu.test(text);
  if (isDoubles === /singles|单打/iu.test(text)) {
    throw new Error('Cannot tell whether "' + label + '" is singles or doubles; include Singles/Doubles or 单打/双打.');
  }
  const format = isDoubles ? 'doubles' : 'singles';
  const gender = /mixed|混合|混双/iu.test(text) ? 'mixed'
    : /\bwom[ae]n(?:['’]?s)?\b|\bladies\b|\bgirls?\b|女/iu.test(text) ? 'female'
      : /\bm[ae]n(?:['’]?s)?\b|\bboys?\b|男/iu.test(text) ? 'male' : 'open';
  const gradeMatch = GRADE.exec(text);
  const grade = gradeMatch ? (gradeMatch[1] || gradeMatch[2] || gradeMatch[3]).toUpperCase() : '';
  const range = AGE_RANGE.exec(text);
  const over = AGE_OVER.exec(text);
  const age = range && Number(range[1]) < Number(range[2]) ? { min: Number(range[1]), max: Number(range[2]) }
    : over ? { min: Number(over[1] || over[2]) } : null;
  const seniors = Boolean(age) || /senior|veteran|masters|中年|元老|长青/iu.test(text);
  const open = /\bopen\b|公开/iu.test(text);
  const residual = text
    .replace(new RegExp(AGE_RANGE.source, 'gu'), ' ')
    .replace(new RegExp(AGE_OVER.source, 'giu'), ' ')
    .replace(/\bgrade\s*[a-z]\b|\b[a-z]\s*grade\b|[a-z]\s*级别?/giu, ' ')
    .replace(/\b(?:m[ae]n|wom[ae]n)(?:['’]?s)?\b|\b(?:ladies|girls?|boys?|mixed|open|seniors?|veterans?|masters|singles|doubles)\b/giu, ' ')
    .replace(/男子|女子|混合|混双|单打|双打|中年|元老|长青|公开|组|岁|以上/gu, ' ')
    .replace(/[\s()（）·,，.&/+-]+/gu, ' ')
    .trim();

  const ageZh = age ? '（' + (age.max ? age.min + '-' + age.max + '岁' : age.min + '岁以上') + '）' : '';
  const ageEn = age ? ' (' + (age.max ? age.min + '-' + age.max : age.min + '+') + ')' : '';
  const zh = ({ male: '男子', female: '女子', mixed: '混合' }[gender] || (open ? '公开组' : '')) + (seniors ? '中年组' : '') +
    (isDoubles ? '双打' : '单打') + (grade ? ' ' + grade + '级别' : '') + ageZh;
  const en = [{ male: 'Men\'s', female: 'Women\'s', mixed: 'Mixed' }[gender] || (open ? 'Open' : ''), seniors ? 'Seniors' : '',
    isDoubles ? 'Doubles' : 'Singles'].filter(Boolean).join(' ') + (grade ? ' Grade ' + grade : '') + ageEn;

  const warnings = [];
  let name = zh;
  let nameEn = en;
  if (parts.length === 2) {
    name = parts.find(part => CJK.test(part));
    nameEn = parts.find(part => !CJK.test(part));
    if (!name || !nameEn) throw new Error('With "|", give one Chinese and one English name: ' + label);
  } else if (residual) {
    name = label;
    nameEn = '';
    warnings.push('Kept "' + label + '" as typed (unrecognised: "' + residual + '"); add the other-language name in the YAML or use "中文名 | English name".');
  }
  if (seniors && !age) warnings.push('No age range found in "' + label + '"; add age: {min, max} to the event in the YAML if it is age-limited.');

  const suffix = ({ female: 'w', mixed: 'x' }[gender] || '') + (seniors ? 's' : '') + grade.toLowerCase();
  const base = format + '_' + (suffix || (gender === 'male' ? 'm' : 'open'));
  const slug = residual.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const event = { id: slug ? base + '_' + slug : base, name, name_en: nameEn, day: format, format, gender };
  if (age) event.age = age;
  event.requirements = base;
  return { event, warnings };
}

function buildConfig({ year, title, events }) {
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2100) throw new Error('Year must be a four-digit year such as 2028.');
  const warnings = [];
  const sources = new Map();
  const list = events.map(({ label, capacity }) => {
    const described = describeEvent(label);
    const event = described.event;
    if (sources.has(event.id)) {
      throw new Error('"' + sources.get(event.id) + '" and "' + label + '" both become event id ' + event.id +
        '; make the names distinguishable, e.g. "男子单打 A级别 红宝石区 | Men\'s Singles Grade A Ruby".');
    }
    sources.set(event.id, label);
    warnings.push(...described.warnings);
    const { requirements, ...rest } = event;
    return { ...rest, capacity, requirements };
  });
  const days = [...new Set(list.map(event => event.day))].map(id => ({ id, name: DAY_NAMES[id], date_text: '' }));
  return {
    config: {
      year,
      title: title || year + ' ACTC 华人网球大奖赛',
      endpoint: '',
      status: '',
      opens: '',
      opens_text: '',
      closes: '',
      closes_text: '',
      waitlist: true,
      contact_email: 'info@actc.org.au',
      rules_url: '/#rules',
      fee_note: '报名费及付款方式将另行公布。Entry fees and payment details will be announced separately.',
      age: { min: 17, max: 70 },
      origins: ORIGINS.slice(),
      days,
      events: list,
      declarations: DECLARATIONS.map(declaration => ({ ...declaration })),
    },
    warnings,
  };
}

function scalar(value) {
  return JSON.stringify(value).replace(/[\u0085\u2028\u2029]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
}

function toYaml(config) {
  const lines = [
    '# Registration form generated by skills/generate_registration (see its README). Edit freely: the page',
    '# (_includes/registration_form.html) and the Apps Script backend (scripts/registration.gs, which reads',
    '# /registration/forms.json) both use this file. Changes reach the backend within about 15 minutes.',
    'year: ' + config.year,
    'title: ' + scalar(config.title),
    '# Apps Script web app /exec URL. Empty = preview mode: the form can be filled in, but nothing is sent.',
    'endpoint: ' + scalar(config.endpoint),
    '# status: "" = automatic from opens/closes; "open" or "closed" overrides them. Datetimes are ISO strings with',
    '# the Sydney offset, e.g. "2028-10-14T22:00:00+11:00"; *_text is the wording shown to visitors.',
  ];
  for (const key of ['status', 'opens', 'opens_text', 'closes', 'closes_text']) lines.push(key + ': ' + scalar(config[key]));
  lines.push(
    '# true: once an event is full, further entries join its waiting list in order. false: reject them.',
    'waitlist: ' + scalar(config.waitlist),
    'contact_email: ' + scalar(config.contact_email),
    'rules_url: ' + scalar(config.rules_url),
    'fee_note: ' + scalar(config.fee_note),
    '# Age is the tournament year minus the birth year. An event may override it with its own age: {min, max}.',
    'age: ' + scalar(config.age),
    'origins: ' + scalar(config.origins),
    '# One entry per player per day. date_text is optional wording, e.g. "11月14日（周日）".',
    'days:',
  );
  config.days.forEach(day => lines.push('  - ' + scalar(day)));
  lines.push(
    '# capacity counts players for singles and pairs for doubles. gender: male | female | mixed | open.',
    '# requirements: key under requirements in _data/tournament.yml, listed under the selected event when present.',
    'events:',
  );
  for (const event of config.events) {
    lines.push('  - id: ' + scalar(event.id));
    for (const key of ['name', 'name_en', 'day', 'format', 'gender', 'capacity', 'age', 'requirements']) {
      if (event[key] !== undefined) lines.push('    ' + key + ': ' + scalar(event[key]));
    }
  }
  lines.push('# Checkboxes before submitting. required: must be ticked; doubles_only: shown for doubles events only.', 'declarations:');
  for (const declaration of config.declarations) {
    lines.push('  - id: ' + scalar(declaration.id), '    required: ' + scalar(Boolean(declaration.required)));
    if (declaration.doubles_only) lines.push('    doubles_only: true');
    lines.push('    text: ' + scalar(declaration.text));
  }
  return lines.join('\n') + '\n';
}

function pageMarkdown({ id, year, title, permalink, test }) {
  const lines = ['---', 'layout: page', 'title: ' + scalar(title + ' 报名表'), 'description: "Registration 报名"', 'permalink: ' + permalink];
  if (test) lines.push('robots: noindex, nofollow');
  lines.push('---', '');
  if (test) lines.push('<p class="note"><strong>测试页面：</strong>此页面仅用于预览 ' + year + ' 报名表，不是正式报名。</p>', '');
  lines.push('{% include registration_form.html id="' + id + '" %}', '');
  return lines.join('\n');
}

function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    year: { type: 'string' }, events: { type: 'string' }, file: { type: 'string' }, title: { type: 'string' },
    test: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, root: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node skills/generate_registration/generate_registration.js --year 2028 --events "Mens Singles Grade A=16; Womens Doubles=20" [--title "..."] [--test] [--dry-run]');
    console.log('Use --file events.txt (or --file - for UTF-8 stdin) instead of --events. --test writes a hidden /test/<year>/register/ page.');
    return;
  }
  if (!/^\d{4}$/.test(values.year || '')) throw new Error('--year must be a four-digit year such as 2028.');
  if ((values.events === undefined) === (values.file === undefined)) throw new Error('Give exactly one of --events or --file.');
  const year = Number(values.year);
  const text = values.events !== undefined ? values.events : fs.readFileSync(values.file === '-' ? 0 : values.file, 'utf8');
  const { config, warnings } = buildConfig({ year, title: values.title, events: parseEvents(text) });
  const id = (values.test ? 'test-' : '') + year;
  const permalink = (values.test ? '/test/' : '/') + year + '/register/';
  const yamlText = toYaml(config);
  const page = pageMarkdown({ id, year, title: config.title, permalink, test: values.test });
  warnings.forEach(warning => console.warn('Warning: ' + warning));
  if (values['dry-run']) {
    process.stdout.write(yamlText + '\n' + page);
    return;
  }
  const root = path.resolve(values.root || ROOT);
  const dataFile = path.join(root, '_data', 'registration', id + '.yml');
  const pageFile = path.join(root, ...(values.test ? ['test', String(year)] : [String(year)]), 'register.md');
  for (const file of [dataFile, pageFile]) {
    if (fs.existsSync(file)) throw new Error('Refusing to overwrite existing file: ' + file);
  }
  for (const [file, content] of [[dataFile, yamlText], [pageFile, page]]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' });
    console.log('Created ' + path.relative(process.cwd(), file));
  }
  console.log('Page: ' + permalink + (values.test ? ' (noindex test page)' : ''));
  config.events.forEach(event => console.log('  ' + event.id + ': ' + event.name + (event.name_en ? ' / ' + event.name_en : '') +
    ', ' + event.capacity + (event.format === 'doubles' ? ' pairs' : ' players') + ', ' + event.gender));
}

module.exports = { parseEvents, describeEvent, buildConfig, toYaml, pageMarkdown, main };

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
