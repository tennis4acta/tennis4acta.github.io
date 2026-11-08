'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { readSchedule, pageSchedule } = require('./import-schedule');
const { playerNames, suggestions, matchesForPlayer, matchesForCourt } = require('../js/schedule');

function sheet() {
  const workbook = new ExcelJS.Workbook();
  const result = workbook.addWorksheet('All Courts');
  result.addRow(['Timestamp', ...Array.from({ length: 13 }, (_, index) => `Court ${index + 1}`)]);
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

test('rejects invalid workbook headers or match cells rather than silently skipping them', () => {
  const source = sheet();
  source.addRow(['8:30AM', 'Invalid match']);
  assert.throws(() => readSchedule(source), /Expected match label/);
  source.getCell(1, 3).value = 'Court 1';
  assert.throws(() => readSchedule(source), /duplicate court/);
  assert.throws(() => readSchedule(null), /All Courts/);
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
    { time: null, matches: [null, group, null] },
    { time: null, matches: [men, null, null] }
  ] });
  assert.equal(source.rows[1].matches[1], playoff);
});

test('court filter preserves scheduled match order without including other or blank courts', () => {
  const first = { player1: 'Alicia Wang', player2: 'Jie Deng', court: '7' };
  const second = { player1: 'Lei Ye', player2: 'June Jiang', court: '7' };
  const other = { player1: 'Haiyan Huang', player2: 'Linda Zhou', court: '8' };
  assert.deepEqual(matchesForCourt([first, other, second], 7), [first, second]);
  assert.deepEqual(matchesForCourt([first, other, second], 13), []);
});
