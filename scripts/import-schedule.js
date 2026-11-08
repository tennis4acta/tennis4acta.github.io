'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'make_draw', '2026', '111115', 'singles_combined_schedule.xlsx');
const outputPath = path.join(root, '_data', 'schedules', '2026-singles.json');

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
    if (courts.includes(court) || court < 1 || court > 13) throw new Error(`Invalid or duplicate court ${court}.`);
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

function pageSchedule(schedule) {
  const divisions = { Ruby: '红宝石', Sapphire: '蓝宝石', A: 'A级别' };
  const rows = schedule.rows.map(row => ({
    time: row.time,
    matches: row.matches.map((match, index) => {
      if (!match) return null;
      const court = schedule.courts[index];
      let label = match.label;
      if (court === 7 || court === 8) {
        const groupLabel = label.replace(/^女子-/, '');
        if (!/^[A-Z]+-R\d+$/.test(groupLabel)) return null;
        label = '女子-' + groupLabel;
      } else {
        const prefix = label.split('-')[0];
        if (divisions[prefix]) label = divisions[prefix] + label.slice(prefix.length);
      }
      return { ...match, label };
    })
  })).filter(row => row.matches.some(Boolean));
  return { courts: schedule.courts, rows };
}

async function main() {
  const bytes = await fs.readFile(sourcePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const schedule = pageSchedule(readSchedule(workbook.getWorksheet('All Courts')));
  const data = {
    source: { file: path.basename(sourcePath), sheet: 'All Courts', sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
    ...schedule
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Imported ${schedule.rows.length} rows and ${schedule.courts.length} courts into ${outputPath}`);
}

module.exports = { readSchedule, pageSchedule };
if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
