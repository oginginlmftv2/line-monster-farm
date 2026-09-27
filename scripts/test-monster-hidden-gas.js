#!/usr/bin/env node
/** モンスターCMSの「準備中」（hidden列）を、GASソースを模擬シート上で実行して確認する。 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..');
const HEADERS_WITHOUT_HIDDEN = ['id', 'name', 'aura', 'mon', 'mainBlood', 'subBlood', 'limited', 'limitedLabel', 'image', 'releasedAt', 'explanation', 'formations', 'visibleChars', 'indexable', 'status', 'author', 'createdAt', 'contributors', 'lastEditor', 'updatedAt', 'arrayIndex', 'url'];

// SpreadsheetAppのシートを2次元配列で模擬する（1始まりの行・列）
function mockSheet(rows) {
  const data = rows.map(row => row.slice());
  let maxColumns = Math.max(...data.map(row => row.length));
  const cell = (r, c) => (data[r - 1] && data[r - 1][c - 1] !== undefined ? data[r - 1][c - 1] : '');
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues() {
      if (c + nc - 1 > maxColumns) throw new Error('範囲が列数を超えています');
      return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j)));
    },
    getValue() { return cell(r, c); },
    setValues(values) {
      if (c + nc - 1 > maxColumns) throw new Error('範囲が列数を超えています');
      values.forEach((row, i) => row.forEach((value, j) => {
        while (data.length < r + i) data.push([]);
        data[r + i - 1][c + j - 1] = value;
      }));
      return this;
    },
    setValue(value) { return this.setValues([[value]]); },
    setNumberFormat() { return this; },
    setFontWeight() { return this; },
    setBackground() { return this; },
  });
  return {
    data,
    getRange: range,
    getLastRow: () => data.length,
    getLastColumn: () => Math.max(...data.map(row => row.filter(value => value !== '' && value !== undefined).length)),
    getMaxColumns: () => maxColumns,
    insertColumnsAfter(_, count) { maxColumns += count; },
  };
}

function monsterRow(id, name, arrayIndex, extra = {}) {
  const base = {
    id, name, aura: '黒', mon: '怪物', mainBlood: 'ゴースト', subBlood: 'レアモン', limited: false, limitedLabel: '',
    image: '', releasedAt: '', explanation: '', formations: '', visibleChars: 500, indexable: false, status: 'published',
    author: '', createdAt: '', contributors: '', lastEditor: '', updatedAt: '2026-09-27', arrayIndex, url: '',
  };
  const merged = { ...base, ...extra };
  return HEADERS_WITHOUT_HIDDEN.map(header => merged[header]);
}

function loadGas(sheet, { baseMap = {} } = {}) {
  const context = {
    console,
    Utilities: { formatDate: () => '2026-09-28' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ monsters: [] }) }) },
  };
  vm.createContext(context);
  for (const file of ['00_core.gs', '10_monster.gs', '40_setup.gs']) {
    vm.runInContext(fs.readFileSync(path.join(repo, '_cms/gas', file), 'utf8'), context);
  }
  const editLog = { appendRow() {} };
  Object.assign(context, {
    monSheet_: () => sheet,
    book_: () => ({ getSheetByName: name => (name === 'edit_log' ? editLog : null) }),
    requireScope_: () => ({ nickname: 'tester', role: 'admin' }),
    monBaselineMap_: () => baseMap,
    monBasicsIds_: () => ({}),
    monBloodLists_: () => null,
    monProfileUrlsByNickname_: () => ({}),
    monPredictNewId_: () => '3160',
  });
  return context;
}

const cases = [];
function test(label, fn) { cases.push([label, fn]); }

test('hidden列の追加前でも一覧を読め、全件が公開扱い', () => {
  const sheet = mockSheet([HEADERS_WITHOUT_HIDDEN, monsterRow('3151', 'メレンゲ', 0)]);
  const gas = loadGas(sheet);
  const all = gas.monReadAll_();
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].hidden, false);
});

test('列追加前に準備中へ切り替えるとsetup実行を促して止まる', () => {
  const sheet = mockSheet([HEADERS_WITHOUT_HIDDEN, monsterRow('3151', 'メレンゲ', 0)]);
  const gas = loadGas(sheet);
  assert.throws(() => gas.api_monSave({ id: '3151', baseUpdatedAt: '2026-09-27', hidden: true }), /setup5_upgradeMonsterHiddenColumn/);
});

test('setup5の列追加は1回目に列を足し、2回目は変更なし', () => {
  const sheet = mockSheet([HEADERS_WITHOUT_HIDDEN, monsterRow('3151', 'メレンゲ', 0)]);
  const gas = loadGas(sheet);
  assert.match(gas.monUpgradeHiddenColumn_(), /hidden 列を追加しました/);
  assert.strictEqual(sheet.data[0][22], 'hidden');
  assert.match(gas.monUpgradeHiddenColumn_(), /変更なし/);
});

test('公開済みページがある体は準備中にできない', () => {
  const sheet = mockSheet([HEADERS_WITHOUT_HIDDEN.concat('hidden'), monsterRow('3151', 'メレンゲ', 0).concat('')]);
  const gas = loadGas(sheet, { baseMap: { '3151': 900 } });
  assert.throws(() => gas.api_monSave({ id: '3151', baseUpdatedAt: '2026-09-27', hidden: true }), /公開済みのモンスターは準備中に戻せません/);
});

test('公開状況が取れないときは準備中にできない', () => {
  const sheet = mockSheet([HEADERS_WITHOUT_HIDDEN.concat('hidden'), monsterRow('3160', '新モンスター', 0).concat('')]);
  const gas = loadGas(sheet, { baseMap: null });
  assert.throws(() => gas.api_monSave({ id: '3160', baseUpdatedAt: '2026-09-27', hidden: true }), /page-baseline\.json/);
});

test('未公開の体は準備中にでき、hidden未指定の保存では準備中を保つ', () => {
  const sheet = mockSheet([HEADERS_WITHOUT_HIDDEN.concat('hidden'), monsterRow('3160', '新モンスター', 0).concat('')]);
  const gas = loadGas(sheet, { baseMap: {} });
  const saved = gas.api_monSave({ id: '3160', baseUpdatedAt: '2026-09-27', hidden: true });
  assert.strictEqual(saved.hidden, true);
  assert.strictEqual(sheet.data[1][22], true);
  const kept = gas.api_monSave({ id: '3160', baseUpdatedAt: saved.updatedAt });
  assert.strictEqual(kept.hidden, true);
  assert.strictEqual(sheet.data[1][22], true);
  const released = gas.api_monSave({ id: '3160', baseUpdatedAt: kept.updatedAt, hidden: false });
  assert.strictEqual(released.hidden, false);
  assert.strictEqual(sheet.data[1][22], false);
});

test('新規登録で準備中を指定するとhidden列にtrueを書く', () => {
  const sheet = mockSheet([HEADERS_WITHOUT_HIDDEN.concat('hidden'), monsterRow('3151', 'メレンゲ', 0).concat('')]);
  const gas = loadGas(sheet);
  const created = gas.api_monCreateMonster({ name: '新モンスター', aura: '黒', mon: '怪物', mainBlood: 'ゴースト', subBlood: 'レアモン', hidden: true });
  assert.strictEqual(created.monster.hidden, true);
  assert.strictEqual(sheet.data[2][22], true);
  assert.strictEqual(sheet.data[2].length, HEADERS_WITHOUT_HIDDEN.length + 1);
});

test('公開データでは準備中の体だけ解説DBにhidden: trueのエントリが出る', () => {
  const sheet = mockSheet([
    HEADERS_WITHOUT_HIDDEN.concat('hidden'),
    monsterRow('3151', 'メレンゲ', 0).concat(''),
    monsterRow('3160', '新モンスター', 1).concat(true),
  ]);
  const gas = loadGas(sheet);
  const files = gas.monBuildPublishTextFiles_(gas.monReadAll_());
  const editorial = JSON.parse(files.editorial).monsters;
  assert.deepStrictEqual(Object.keys(editorial), ['3160']);
  assert.strictEqual(editorial['3160'].hidden, true);
  assert(!/hidden/.test(files.monstersData), 'monsters-data.jsへhiddenを書いている');
});

for (const [label, fn] of cases) {
  fn();
  console.log(`PASS ${label}`);
}
console.log(`OK モンスター準備中のGAS ${cases.length}件PASS`);
