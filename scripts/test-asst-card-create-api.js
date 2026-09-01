#!/usr/bin/env node
'use strict';

/** P12-19: 新規カード追加専用APIのSpreadsheet/Lock mockテスト。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/20_assist.gs'), 'utf8');
const NOW = '2026-08-30T12:34:56+09:00';
const HEADERS = ['sourceOrder','cardId','name','rarity','aura','cardType','monType','image','event2','releasedAt','accessoryStatus','statsJson','limitBreakJson','ratingsJson','explanation','formationsJson','sapoRefJson','version','updatedAt','updatedBy'];
const LOG_HEADERS = ['timestamp','user','action','result','detail'];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function row(value = {}) {
  const item = Object.assign({
    sourceOrder: 1, cardId: 'a1-MR-existing', name: '既存カード', rarity: 'MR', aura: '赤', cardType: 'ガード', monType: '',
    image: 'assist-cards/a1-MR-existing.jpg', event2: '', releasedAt: '', accessoryStatus: 'unknown', statsJson: '[]',
    limitBreakJson: 'null', ratingsJson: 'null', explanation: '', formationsJson: '[]', sapoRefJson: 'null',
    version: 1, updatedAt: NOW, updatedBy: 'seed',
  }, value);
  return HEADERS.map(key => item[key]);
}

class Sheet {
  constructor(name, rows, harness) { this.name = name; this.rows = rows; this.harness = harness; }
  getLastRow() { return this.rows.length; }
  getRange(rowNumber, column, rowCount, columnCount) {
    return {
      getValues: () => {
        if (this.name === 'cards' && this.harness.corruptAfterAppend && this.harness.cardAppendCount) {
          this.rows[this.rows.length - 1][HEADERS.indexOf('aura')] = '壊れた値';
          this.harness.corruptAfterAppend = false;
        }
        return clone(this.rows.slice(rowNumber - 1, rowNumber - 1 + rowCount).map(values => values.slice(column - 1, column - 1 + columnCount)));
      },
    };
  }
  appendRow(values) {
    this.rows.push(clone(values));
    if (this.name === 'cards') this.harness.cardAppendCount++;
    if (this.name === 'assist_log' && this.harness.failLog) throw new Error('injected log failure');
  }
}

function validPayload(overrides = {}) {
  return Object.assign({ name: '新規カード', rarity: 'SSR', aura: '青', cardType: 'ジャッジ', monType: '幻霊' }, overrides);
}

function makeHarness(options = {}) {
  const state = {
    cards: [HEADERS, ...(options.cardRows || [row({ sourceOrder: 2 }), row({ sourceOrder: 5, cardId: 'c3-SSR-second', name: '別カード', rarity: 'SSR' })])],
    assist_log: [LOG_HEADERS],
  };
  const harness = {
    state, cardAppendCount: 0, corruptAfterAppend: Boolean(options.corruptAfterAppend), failLog: Boolean(options.failLog),
    calls: { auth: 0, lock: 0, release: 0 },
  };
  const sheets = Object.fromEntries(Object.entries(state).map(([name, rows]) => [name, new Sheet(name, rows, harness)]));
  const context = {
    console, JSON, Number, Object, String, Array, Date, Math, RegExp, Map, Set, isNaN, isFinite,
    LockService: { getScriptLock() { return {
      tryLock() {
        harness.calls.lock++;
        if (options.onLock) options.onLock(state);
        return options.lockAvailable !== false;
      },
      releaseLock() { harness.calls.release++; },
    }; } },
    requireScope_(scope) {
      harness.calls.auth++;
      assert.strictEqual(scope, 'assist');
      return { nickname: options.nickname === undefined ? 'tester' : options.nickname, role: 'admin', scopes: ['assist'] };
    },
    book_() { return { getSheetByName: name => sheets[name] || null }; },
    nowIso_() { return NOW; },
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context);
  harness.context = context;
  harness.before = clone(state);
  return harness;
}

let passed = 0;
function test(label, action) { action(); passed++; console.log(`PASS ${label}`); }

test('正しい必須属性で末尾へ1行だけ追加し初期値・応答・ログが仕様どおり', () => {
  const h = makeHarness();
  const result = clone(h.context.api_asstCreateCard(validPayload()));
  assert.deepStrictEqual(result, {
    ok: true, cardId: 'c0001-SSR', sourceOrder: 6, version: 1,
    card: { cardId: 'c0001-SSR', name: '新規カード', rarity: 'SSR', aura: '青', effects: 0, abilities: 0, version: 1 },
  });
  assert.strictEqual(h.state.cards.length, h.before.cards.length + 1);
  assert.deepStrictEqual(h.state.cards.slice(0, -1), h.before.cards);
  const created = Object.fromEntries(HEADERS.map((key, index) => [key, h.state.cards.at(-1)[index]]));
  assert.deepStrictEqual(created, {
    sourceOrder: 6, cardId: 'c0001-SSR', name: '新規カード', rarity: 'SSR', aura: '青', cardType: 'ジャッジ', monType: '幻霊',
    image: '', event2: '', releasedAt: '', accessoryStatus: 'unknown', statsJson: '[]', limitBreakJson: 'null', ratingsJson: 'null',
    explanation: '', formationsJson: '[]', sapoRefJson: 'null', version: 1, updatedAt: NOW, updatedBy: 'tester',
  });
  assert.strictEqual(h.state.assist_log.length, 2);
  assert.deepStrictEqual(h.state.assist_log[1], [NOW, 'tester', 'create-card', 'PASS', 'c0001-SSR sourceOrder=6']);
  assert.deepStrictEqual(h.calls, { auth: 1, lock: 1, release: 1 });
});

test('cardIdは既存連番の最大+1で自動採番し旧形式IDは無視する', () => {
  const fresh = makeHarness();
  assert.strictEqual(fresh.context.api_asstCreateCard(validPayload()).cardId, 'c0001-SSR');
  const serial = makeHarness({ cardRows: [
    row({ sourceOrder: 1 }),
    row({ sourceOrder: 2, cardId: 'c0007-MR', name: '自動採番済み' }),
    row({ sourceOrder: 3, cardId: 'c0003-SSR', name: '自動採番済み2', rarity: 'SSR' }),
  ] });
  const created = serial.context.api_asstCreateCard(validPayload({ rarity: 'MR' }));
  assert.strictEqual(created.cardId, 'c0008-MR');
  assert.match(created.cardId, /^c[0-9]{4}-(?:MR|SSR)$/);
});

test('cardIdをpayloadで指定できない', () => {
  const h = makeHarness();
  assert.throws(() => h.context.api_asstCreateCard(validPayload({ cardId: 'b2-SSR-newcard' })), /未対応/);
});

test('同一name+rarityを拒否し同名別rarityは許可', () => {
  const duplicateName = makeHarness();
  assert.throws(() => duplicateName.context.api_asstCreateCard(validPayload({ name: '既存カード', rarity: 'MR' })), /カード名とレアリティ/);
  const otherRarity = makeHarness();
  assert.strictEqual(otherRarity.context.api_asstCreateCard(validPayload({ name: '既存カード' })).ok, true);
});

test('許可外rarity・許可外aura・許可外cardType・許可外monTypeを拒否', () => {
  for (const [field, value] of [['rarity','SR'],['aura','紫'],['cardType','未知'],['monType','未知']]) {
    const h = makeHarness();
    assert.throws(() => h.context.api_asstCreateCard(validPayload({ [field]: value })));
  }
});

test('必須値空欄・nickname空欄・未知payload項目を拒否', () => {
  const blank = makeHarness();
  assert.throws(() => blank.context.api_asstCreateCard(validPayload({ name: '   ' })), /必須/);
  const control = makeHarness();
  assert.throws(() => control.context.api_asstCreateCard(validPayload({ name: '新規\nカード' })), /制御文字/);
  const nickname = makeHarness({ nickname: ' ' }); assert.throws(() => nickname.context.api_asstCreateCard(validPayload()), /ニックネーム/);
  const unknown = makeHarness(); assert.throws(() => unknown.context.api_asstCreateCard(Object.assign(validPayload(), { sourceOrder: 99 })), /未対応/);
});

test('sourceOrder重複・不正を拒否', () => {
  for (const rows of [[row({ sourceOrder: 1 }), row({ sourceOrder: 1, cardId: 'c3-SSR-other', name: '別カード' })], [row({ sourceOrder: 0 })], [row({ sourceOrder: 'bad' })]]) {
    const h = makeHarness({ cardRows: rows }); assert.throws(() => h.context.api_asstCreateCard(validPayload()), /sourceOrder/);
  }
});

test('ロック競合を拒否し、ロック取得後に追加された連番も再読込で回避する', () => {
  const locked = makeHarness({ lockAvailable: false });
  assert.throws(() => locked.context.api_asstCreateCard(validPayload()), /重なりました/);assert.strictEqual(locked.cardAppendCount, 0);
  const raced = makeHarness({ onLock(state) { state.cards.push(row({ sourceOrder: 6, cardId: 'c0001-SSR', name: '並行追加', rarity: 'SSR' })); } });
  assert.strictEqual(raced.context.api_asstCreateCard(validPayload()).cardId, 'c0002-SSR');
  const racedName = makeHarness({ onLock(state) { state.cards.push(row({ sourceOrder: 6, cardId: 'c0001-SSR', name: '新規カード', rarity: 'SSR' })); } });
  assert.throws(() => racedName.context.api_asstCreateCard(validPayload()), /カード名とレアリティ/);assert.strictEqual(racedName.cardAppendCount, 0);
});

test('行追加後の再検算失敗は再実行禁止の専用エラー', () => {
  const h = makeHarness({ corruptAfterAppend: true });
  assert.throws(() => h.context.api_asstCreateCard(validPayload()), /登録済みとして扱い、再実行しない/);
  assert.strictEqual(h.cardAppendCount, 1);
});

test('行追加後にログだけ失敗しても登録行を残し再実行禁止を案内', () => {
  const h = makeHarness({ failLog: true });
  assert.throws(() => h.context.api_asstCreateCard(validPayload()), /登録済みとして扱い、再実行しない/);
  assert.strictEqual(h.cardAppendCount, 1);assert.strictEqual(h.state.cards.at(-1)[HEADERS.indexOf('cardId')], 'c0001-SSR');
});

console.log(`OK 新規カード追加API ${passed}ケース`);
