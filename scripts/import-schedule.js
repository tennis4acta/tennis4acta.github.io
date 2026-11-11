'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'make_draw', '2026', '111115', 'singles_combined_schedule.xlsx');
const outputPath = path.join(root, '_data', 'schedules', '2026-singles.json');
const MATCH_LIST_HEADERS = ['开始（估计）', '结束（估计）', '场地', '项目', '小组', '轮次', '球员 1', '球员 2'];
const MATCH_LIST_EVENTS = {
  红宝石: '2026-b-ruby',
  蓝宝石: '2026-b-sapphire',
  A级别: '2026-a-grade',
  女子: '2026-womens-singles'
};

function cellText(cell) {
  const value = cell.value;
  if (value === null || value === '') return null;
  if (typeof value === 'string') return value.replace(/\r\n?/g, '\n').trim() || null;
  if (value && Array.isArray(value.richText)) {
    return value.richText.map(part => part.text).join('').replace(/\r\n?/g, '\n').trim() || null;
  }
  throw new Error(`Unsupported cell value at ${cell.address}; use text rather than formulas or numbers.`);
}

function readSchedule(sheet) {
  if (!sheet) throw new Error('Workbook must contain the All Courts sheet.');
  if (cellText(sheet.getCell(1, 1)) !== 'Timestamp') throw new Error('Expected Timestamp in A1.');
  const courts = [];
  for (let column = 2; column <= sheet.columnCount; column += 1) {
    const header = cellText(sheet.getCell(1, column));
    const match = /^Court (\d+)$/.exec(header || '');
    if (!match) throw new Error(`Invalid court header at column ${column}.`);
    const court = Number(match[1]);
    if (courts.includes(court) || court < 1 || court > 15 || court === 7 || court === 8) {
      throw new Error(`Invalid or duplicate court ${court}.`);
    }
    courts.push(court);
  }
  if (courts.length !== 13) throw new Error('Expected all 13 courts.');
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const time = cellText(row.getCell(1));
    const matches = courts.map((court, index) => {
      const cell = row.getCell(index + 2);
      const text = cellText(cell);
      if (!text) return null;
      const lines = text.split('\n');
      const players = lines.slice(1).join(' ').split(' vs ');
      if (lines.length < 2 || players.length !== 2 || players.some(player => !player.trim())) {
        throw new Error(`Expected match label and player1 vs player2 at ${cell.address}.`);
      }
      return { label: lines[0], player1: players[0].trim(), player2: players[1].trim() };
    });
    if (time || matches.some(Boolean)) rows.push({ time, matches });
  }
  if (!rows.length) throw new Error('Schedule has no matches.');
  return { courts, rows };
}

function readMatchList(sheet) {
  if (!sheet) throw new Error('Workbook must contain the Match List sheet.');
  const headers = MATCH_LIST_HEADERS.map((_, index) => cellText(sheet.getCell(1, index + 1)));
  if (headers.some((header, index) => header !== MATCH_LIST_HEADERS[index])) {
    throw new Error('Match List headers do not match the expected format.');
  }

  const courts = new Set();
  const rowsByTime = new Map();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.values.slice(1, MATCH_LIST_HEADERS.length + 1).every(value => value === null || value === undefined || value === '')) continue;

    const time = cellText(row.getCell(1));
    const court = row.getCell(3).value;
    const division = cellText(row.getCell(4));
    const group = cellText(row.getCell(5));
    const round = row.getCell(6).value;
    const player1 = cellText(row.getCell(7));
    const player2 = cellText(row.getCell(8));
    if (!time || !Number.isInteger(court) || court < 1 || court > 15 || court === 7 || court === 8) {
      throw new Error(`Invalid time or court at Match List row ${rowNumber}.`);
    }
    if (!MATCH_LIST_EVENTS[division] || !/^[A-Z]+$/.test(group || '') || !Number.isInteger(round) || round < 1) {
      throw new Error(`Invalid event, group or round at Match List row ${rowNumber}.`);
    }
    if (!player1 || !player2) throw new Error(`Missing player at Match List row ${rowNumber}.`);

    const rowMatches = rowsByTime.get(time) || new Map();
    if (rowMatches.has(court)) throw new Error(`Duplicate court ${court} at ${time}.`);
    rowMatches.set(court, {
      label: `${division}-${group}组-第${round}轮`,
      player1,
      player2
    });
    rowsByTime.set(time, rowMatches);
    courts.add(court);
  }
  if (!rowsByTime.size) throw new Error('Match List has no matches.');

  const courtList = [...courts].sort((a, b) => a - b);
  return {
    courts: courtList,
    rows: [...rowsByTime].map(([time, rowMatches]) => ({
      time,
      matches: courtList.map(court => rowMatches.get(court) || null)
    }))
  };
}

function pageSchedule(schedule) {
  const divisions = { Ruby: '红宝石', Sapphire: '蓝宝石', A: 'A级别' };
  const events = MATCH_LIST_EVENTS;
  const rows = schedule.rows.map(row => ({
    time: row.time,
    matches: row.matches.map((match, index) => {
      if (!match) return null;
      const court = schedule.courts[index];
      let label = match.label;
      if (label.startsWith('女子-') || court === 7 || court === 8) {
        const groupLabel = label.replace(/^女子-/, '');
        if (!/^(?:[A-Z]+-R\d+|[A-Z]+组-第\d+轮)$/.test(groupLabel)) return null;
        label = '女子-' + groupLabel;
      } else {
        const prefix = label.split('-')[0];
        if (divisions[prefix]) label = divisions[prefix] + label.slice(prefix.length);
      }
      label = label.replace(/-([A-Z]+)-R(\d+)$/, '-$1组-第$2轮');
      const group = /-([A-Z]+)组-第\d+轮$/.exec(label);
      if (!group) return { ...match, label };
      const eventId = events[label.split('-')[0]];
      if (!eventId) throw new Error(`Unknown schedule division: ${label}`);
      return { ...match, label, eventId, group: group[1] };
    })
  })).filter(row => row.matches.some(Boolean));
  return { courts: schedule.courts, rows };
}

async function main(inputPath = process.argv[2] ? path.resolve(root, process.argv[2]) : sourcePath) {
  const bytes = await fs.readFile(inputPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const matchList = workbook.getWorksheet('Match List');
  const schedule = pageSchedule(matchList
    ? readMatchList(matchList)
    : readSchedule(workbook.getWorksheet('All Courts')));
  const data = {
    source: { file: path.basename(inputPath), sheet: matchList ? 'Match List' : 'All Courts', sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
    ...schedule
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Imported ${schedule.rows.length} rows and ${schedule.courts.length} courts into ${outputPath}`);
}

module.exports = { readSchedule, readMatchList, pageSchedule };
if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
