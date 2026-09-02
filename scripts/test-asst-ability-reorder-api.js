#!/usr/bin/env node
'use strict';

/** カード内の能力並び替えAPI（api_asstReorderCardAbilities）のSpreadsheet/Lock mockテスト。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const ASSIST_SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/20_assist.gs'), 'utf8');
const NOW = '2026-09-02T12:34:56+09:00';
const HEADERS = {
  cards: ['sourceOrder','cardId','name','rarity','aura','cardType','monType','image','event2','releasedAt','accessoryStatus','statsJson','limitBreakJson','ratingsJson','explanation','formationsJson','sapoRefJson','version','updatedAt','updatedBy'],
  assist_effects: ['cardId','effectId','name','description','unlockRank','sortOrder','updatedAt','updatedBy'],
  abilities: ['sourceOrder','abilityId','legacyId','cardId','sourceName','name','description','source','rarity','tagsJson','sortOrder','linkStatus','flagsJson','status','version','updatedAt','updatedBy'],
  ability_external_refs: ['provider','candidateKey','externalNumericId','firstSeenSha','lastSeenSha','externalFingerprint','comparisonFingerprint','externalSnapshotJson','disposition','abilityId','importedAt','importedBy','decidedAt','decidedBy','reviewFlagsJson','note','version'],
  assist_log: ['timestamp','user','action','result','detail'],
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function cardRow(cardId = 'c0001-MR', sourceOrder = 1) {
  return [sourceOrder, cardId, 'カード' + sourceOrder, 'MR', '赤', 'ガード', '', 'assist-cards/' + cardId + '.jpg', '', '', 'unknown', '[]', 'null', '{"ikusei":null,"karyo":null,"battle":null,"ta":null}', '', '[]', 'null', 1, NOW, 'seed'];
}
function abilityRow(overrides = {}) {
  const value = Object.assign({
    sourceOrder: 1, abilityId: 'ab-0001', legacyId: '', cardId: 'c0001-MR', sourceName: 'カード1', name: '能力1',
    description: '説明1', source: 'イベント', rarity: 'MR', tagsJson: '[]', sortOrder: 1, linkStatus: 'resolved',
    flagsJson: '[]', status: 'verified', version: 1, updatedAt: NOW, updatedBy: 'seed',
  }, overrides);
  return HEADERS.abilities.map(key => value[key] === undefined ? '' : value[key]);
}

class Sheet {
  constructor(name, rows, harness) { this.name = name; this.rows = rows; this.harness = harness; }
  getLastRow() { return this.rows.length; }
  getDataRange() { return { getValues: () => clone(this.rows) }; }
  getRange(row, column, rowCount, columnCount) {
    return {
      getValues: () => clone(this.rows.slice(row - 1, row - 1 + rowCount).map(values => values.slice(column - 1, column - 1 + columnCount))),
      setValues: values => {
        this.harness.maybeFail(this.name, 'setValues');
        for (let r = 0; r < rowCount; r++) {
          if (!this.rows[row - 1 + r]) this.rows[row - 1 + r] = [];
          for (let c = 0; c < columnCount; c++) this.rows[row - 1 + r][column - 1 + c] = values[r][c];
        }
      },
    };
  }
  appendRow(values) { this.rows.push(clone(values)); }
}

function makeHarness(options = {}) {
  const abilities = options.abilities || [
    abilityRow({ sourceOrder: 1, abilityId: 'ab-0001', name: '能力1', sortOrder: 1 }),
    abilityRow({ sourceOrder: 2, abilityId: 'ab-0002', name: '能力2', sortOrder: 2 }),
    abilityRow({ sourceOrder: 3, abilityId: 'ab-0003', name: '能力3', sortOrder: 3 }),
  ];
  const state = {
    cards: [HEADERS.cards, cardRow()],
    assist_effects: [HEADERS.assist_effects],
    abilities: [HEADERS.abilities, ...abilities],
    ability_external_refs: [HEADERS.ability_external_refs],
    assist_log: [HEADERS.assist_log],
  };
  const harness = {
    state,
    calls: { lock: 0, release: 0, auth: 0 },
    failure: options.failure ? Object.assign({ used: false, count: 0 }, options.failure) : null,
    maybeFail(sheet, op) {
      if (!this.failure || this.failure.used || this.failure.sheet !== sheet || this.failure.op !== op) return;
      this.failure.count++;
      if (this.failure.count < (this.failure.after || 1) + 1) return;
      this.failure.used = true;
      throw new Error(`injected ${sheet} ${op}`);
    },
  };
  const sheets = Object.fromEntries(Object.entries(state).map(([name, rows]) => [name, new Sheet(name, rows, harness)]));
  const context = {
    console, Map, Set, JSON, Number, Object, String, Array, Date, Math, RegExp, isNaN, isFinite,
    LockService: { getScriptLock() { return { tryLock() { harness.calls.lock++; return options.lockAvailable !== false; }, releaseLock() { harness.calls.release++; } }; } },
    requireScope_(scope) { harness.calls.auth++; assert.strictEqual(scope, 'assist'); return { nickname: 'tester', role: 'admin', scopes: ['assist'] }; },
    book_() { return { getSheetByName: name => sheets[name] || null }; },
    nowIso_() { return NOW; },
    Utilities: { formatDate(value) { return new Date(value).toISOString(); } },
  };
  vm.createContext(context);
  vm.runInContext(ASSIST_SOURCE, context);
  harness.context = context;
  harness.before = clone(state);
  return harness;
}

function orders(harness) {
  return harness.state.abilities.slice(1).map(row => [row[HEADERS.abilities.indexOf('abilityId')], row[HEADERS.abilities.indexOf('sortOrder')]]);
}
function expectedFrom(harness) {
  return harness.state.abilities.slice(1)
    .filter(row => row[HEADERS.abilities.indexOf('linkStatus')] === 'resolved')
    .map(row => ({ abilityId: row[HEADERS.abilities.indexOf('abilityId')], sortOrder: Number(row[HEADERS.abilities.indexOf('sortOrder')]) }));
}

let passed = 0;
function test(label, action) { action(); passed++; console.log(`PASS ${label}`); }

test('2と3を入れ替えても連番を保ったまま保存できる', () => {
  const h = makeHarness();
  const result = h.context.api_asstReorderCardAbilities({
    cardId: 'c0001-MR', abilityIds: ['ab-0001', 'ab-0003', 'ab-0002'], expected: expectedFrom(h),
  });
  assert.deepStrictEqual(clone(result), { ok: true, cardId: 'c0001-MR', changed: 2 });
  assert.deepStrictEqual(orders(h), [['ab-0001', 1], ['ab-0002', 3], ['ab-0003', 2]]);
  const versions = h.state.abilities.slice(1).map(row => row[HEADERS.abilities.indexOf('version')]);
  assert.deepStrictEqual(versions, [1, 2, 2]);
  assert.strictEqual(h.state.assist_log.length, 2);
  assert.strictEqual(h.state.assist_log[1][3], 'PASS');
  assert.strictEqual(h.calls.lock, 1);
  assert.strictEqual(h.calls.release, 1);
});

test('先頭へ移動しても1からの連番になる', () => {
  const h = makeHarness();
  h.context.api_asstReorderCardAbilities({ cardId: 'c0001-MR', abilityIds: ['ab-0003', 'ab-0001', 'ab-0002'], expected: expectedFrom(h) });
  assert.deepStrictEqual(orders(h), [['ab-0001', 2], ['ab-0002', 3], ['ab-0003', 1]]);
});

test('並びが同じなら書き込まない', () => {
  const h = makeHarness();
  const result = h.context.api_asstReorderCardAbilities({ cardId: 'c0001-MR', abilityIds: ['ab-0001', 'ab-0002', 'ab-0003'], expected: expectedFrom(h) });
  assert.strictEqual(result.changed, 0);
  assert.deepStrictEqual(clone(h.state.abilities), h.before.abilities);
});

test('件数不足・他カード・重複・未知IDを拒否する', () => {
  const h = makeHarness();
  const expected = expectedFrom(h);
  assert.throws(() => h.context.api_asstReorderCardAbilities({ cardId: 'c0001-MR', abilityIds: ['ab-0001', 'ab-0002'], expected: expected.slice(0, 2) }), /全件を渡してください/);
  assert.throws(() => h.context.api_asstReorderCardAbilities({ cardId: 'c0001-MR', abilityIds: ['ab-0001', 'ab-0001', 'ab-0002'], expected: expected }), /重複/);
  assert.throws(() => h.context.api_asstReorderCardAbilities({ cardId: 'c0001-MR', abilityIds: ['ab-0001', 'ab-0002', 'ab-9999'], expected: expected }), /resolved能力ではありません/);
  assert.throws(() => h.context.api_asstReorderCardAbilities({ cardId: 'unknown-MR', abilityIds: ['ab-0001'], expected: [{ abilityId: 'ab-0001', sortOrder: 1 }] }), /cardIdが不正/);
  assert.deepStrictEqual(clone(h.state), h.before);
});

test('未対応キー・型不正を拒否する', () => {
  const h = makeHarness();
  const expected = expectedFrom(h);
  for (const payload of [
    null, [], { cardId: 'c0001-MR' }, { cardId: 'c0001-MR', abilityIds: [], expected: [] },
    { cardId: 'c0001-MR', abilityIds: ['ab-0001', 'ab-0002', 'ab-0003'], expected, extra: 1 },
    { cardId: 'c0001-MR', abilityIds: ['ab-0001', 'ab-0002', 'ab-0003'], expected: [{ abilityId: 'ab-0001', sortOrder: 1, note: 'x' }, ...expected.slice(1)] },
    { cardId: 'c0001-MR', abilityIds: ['ab-0001', 'ab-0002', 'ab-0003'], expected: [{ abilityId: 'ab-0001', sortOrder: '1' }, ...expected.slice(1)] },
  ]) assert.throws(() => h.context.api_asstReorderCardAbilities(payload));
  assert.deepStrictEqual(clone(h.state), h.before);
});

test('expectedが現在の並びと違えば拒否する（同時編集検知）', () => {
  const h = makeHarness();
  assert.throws(() => h.context.api_asstReorderCardAbilities({
    cardId: 'c0001-MR', abilityIds: ['ab-0003', 'ab-0002', 'ab-0001'],
    expected: [{ abilityId: 'ab-0001', sortOrder: 3 }, { abilityId: 'ab-0002', sortOrder: 2 }, { abilityId: 'ab-0003', sortOrder: 1 }],
  }), /並び順が変わっています/);
  assert.deepStrictEqual(clone(h.state), h.before);
});

test('unlinked能力は対象にせず、resolvedだけを並べ替える', () => {
  const h = makeHarness({ abilities: [
    abilityRow({ sourceOrder: 1, abilityId: 'ab-0001', sortOrder: 1 }),
    abilityRow({ sourceOrder: 2, abilityId: 'ab-0002', sortOrder: 2 }),
    abilityRow({ sourceOrder: 3, abilityId: 'ab-0003', cardId: '', sortOrder: '', linkStatus: 'unlinked' }),
  ] });
  h.context.api_asstReorderCardAbilities({ cardId: 'c0001-MR', abilityIds: ['ab-0002', 'ab-0001'], expected: expectedFrom(h) });
  assert.deepStrictEqual(orders(h), [['ab-0001', 2], ['ab-0002', 1], ['ab-0003', '']]);
});

test('ロック競合では何も書かない', () => {
  const h = makeHarness({ lockAvailable: false });
  assert.throws(() => h.context.api_asstReorderCardAbilities({ cardId: 'c0001-MR', abilityIds: ['ab-0003', 'ab-0002', 'ab-0001'], expected: expectedFrom(h) }), /重なりました/);
  assert.deepStrictEqual(clone(h.state), h.before);
});

test('途中の書込み失敗は書いた行を元に戻す', () => {
  const h = makeHarness({ failure: { sheet: 'abilities', op: 'setValues', after: 1 } });
  assert.throws(() => h.context.api_asstReorderCardAbilities({
    cardId: 'c0001-MR', abilityIds: ['ab-0003', 'ab-0002', 'ab-0001'], expected: expectedFrom(h),
  }), /元に戻しました/);
  assert.deepStrictEqual(clone(h.state.abilities), h.before.abilities);
  assert.strictEqual(h.state.assist_log[1][3], 'FAIL');
  assert.strictEqual(h.calls.release, 1);
});

console.log(`\nOK 能力並び替えAPI ${passed}ケース`);
