#!/usr/bin/env node
'use strict';

/** カード編集「能力」タブの状態切り替え・並び替えを、最小DOMのstubで検査する。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const COMMON_SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/ui_common.html'), 'utf8');
const UI_SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/ui_assist.html'), 'utf8');
const COMMON_SCRIPT = COMMON_SOURCE.match(/<script>([\s\S]*)<\/script>/)[1];
const SCRIPT = UI_SOURCE.match(/<script>([\s\S]*)<\/script>/)[1];

function ability(abilityId, name, sortOrder, status = 'verified') {
  return {
    abilityId, legacyId: null, cardId: 'aab-MR-julia', sourceName: 'ジュリア', name,
    description: '説明', source: 'イベント', rarity: 'MR', tags: [], sortOrder,
    linkStatus: 'resolved', flags: [], status,
  };
}

function node() {
  return {
    innerHTML: '', textContent: '', value: '', disabled: false, checked: false, hidden: false,
    dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll() { return []; }, querySelector() { return null; },
  };
}

function harness(options = {}) {
  const elements = new Map();
  const calls = [];
  const microtasks = [];
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const abilities = options.abilities || [
    ability('ab-1090', '根性の一撃', 1),
    ability('ab-1091', '鉄壁の守り', 2),
    ability('ab-1093', '不屈の闘志', 3, 'draft'),
  ];
  const runner = {
    success: null, failure: null,
    withSuccessHandler(callback) { this.success = callback; return this; },
    withFailureHandler(callback) { this.failure = callback; return this; },
    api_asstGetAbility(abilityId) {
      calls.push({ name: 'api_asstGetAbility', payload: abilityId });
      const found = abilities.filter(item => item.abilityId === abilityId)[0];
      this.success({ ability: JSON.parse(JSON.stringify(found)), version: 3 });
    },
    api_asstSaveAbility(payload) {
      calls.push({ name: 'api_asstSaveAbility', payload: JSON.parse(JSON.stringify(payload)) });
      if (options.saveError) { this.failure(new Error(options.saveError)); return; }
      this.success({ ok: true, version: payload.version + 1 });
    },
    api_asstReorderCardAbilities(payload) {
      calls.push({ name: 'api_asstReorderCardAbilities', payload: JSON.parse(JSON.stringify(payload)) });
      if (options.reorderError) { this.failure(new Error(options.reorderError)); return; }
      this.success({ ok: true, cardId: payload.cardId, changed: 2 });
    },
    api_asstGetCard(cardId) {
      calls.push({ name: 'api_asstGetCard', payload: cardId });
      this.success({ card: { cardId, name: 'ジュリア', rarity: 'MR' }, version: 1, effects: [], abilities });
    },
  };
  const context = {
    console, Number, String, Array, Object, Map, Set, Promise, Date, RegExp, Math, JSON, isFinite,
    setTimeout(fn) { microtasks.push(fn); return microtasks.length; },
    clearTimeout() {},
    google: { script: { run: runner } },
    document: { body: { classList: { add() {}, remove() {}, toggle() {} } }, querySelectorAll() { return []; }, querySelector() { return null; }, createElement() { return node(); } },
    el: getElement,
    esc: value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
    setBusy() {}, show(message, isError) { calls.push({ name: 'show', payload: { message, isError: Boolean(isError) } }); },
    confirm() { return options.confirm === false ? false : true; },
    prompt() { return null; }, alert() {},
    FileReader: function () {}, Blob: function () {},
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
  };
  const showStub = context.show;
  const escStub = context.esc;
  vm.createContext(context);
  vm.runInContext(COMMON_SCRIPT, context, { filename: 'ui_common.html' });
  Object.assign(context, {
    el: getElement, esc: escStub, setBusy() {}, show: showStub,
    call(name, args, onSuccess) {
      calls.push({ name, payload: JSON.parse(JSON.stringify(args[0])) });
      if (name === 'api_asstGetCard') onSuccess({ card: { cardId: args[0], name: 'ジュリア', rarity: 'MR' }, version: 1, effects: [], abilities });
      else throw new Error('予期しないcall: ' + name);
    },
  });
  vm.runInContext(SCRIPT, context, { filename: 'ui_assist.html' });
  context.asstRenderEditor = () => {};
  context.asstRenderList = () => {};
  context.ASST.selectedId = 'aab-MR-julia';
  context.ASST.tab = 'abilities';
  context.ASST.detail = { card: { cardId: 'aab-MR-julia', name: 'ジュリア', rarity: 'MR' }, version: 1, effects: [], abilities };
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return { context, calls, abilities, settle, html: () => context.asstRenderAbilities(context.ASST.detail) };
}

let passed = 0;
const tests = [];
function test(label, action) { tests.push({ label, action }); }

test('状態を切り替えただけではAPIを呼ばず、未保存として表示する', async () => {
  const h = harness();
  h.context.asstSetAbilityStatus('ab-1090', 'draft');
  assert.strictEqual(h.calls.length, 0);
  assert.match(h.html(), /未保存: 確認済み（verified） → 下書き（draft）/);
  assert.match(h.html(), /未保存: 状態 1件/);
  assert.doesNotMatch(h.html(), /id="asst_btnSaveAbilityChanges" disabled/);
});

test('元の値へ戻すと未保存ではなくなる', async () => {
  const h = harness();
  h.context.asstSetAbilityStatus('ab-1090', 'draft');
  h.context.asstSetAbilityStatus('ab-1090', 'verified');
  assert.strictEqual(h.context.asstAbilityStatusChangedIds(h.context.ASST.detail).length, 0);
  assert.match(h.html(), /id="asst_btnSaveAbilityChanges" disabled/);
});

test('複数件の状態変更を1件ずつ最新versionで保存する', async () => {
  const h = harness();
  h.context.asstSetAbilityStatus('ab-1090', 'draft');
  h.context.asstSetAbilityStatus('ab-1093', 'verified');
  h.context.asstSaveAbilityChanges();
  await h.settle();
  const names = h.calls.map(call => call.name).filter(name => name !== 'show');
  assert.deepStrictEqual(names, [
    'api_asstGetAbility', 'api_asstSaveAbility',
    'api_asstGetAbility', 'api_asstSaveAbility',
    'api_asstGetCard',
  ]);
  assert.strictEqual(h.calls[1].payload.version, 3);
  assert.strictEqual(h.calls[1].payload.ability.status, 'draft');
  assert.strictEqual(h.calls[3].payload.ability.status, 'verified');
  assert.strictEqual(h.context.ASST.abilityStatusEdits, null);
});

test('状態と並び順を両方変えたら状態を先に保存し、並び順は1回だけ送る', async () => {
  const h = harness();
  h.context.asstSetAbilityStatus('ab-1090', 'draft');
  h.context.asstMoveAbility('ab-1093', -1);
  h.context.asstSaveAbilityChanges();
  await h.settle();
  const names = h.calls.map(call => call.name).filter(name => name !== 'show');
  assert.deepStrictEqual(names, ['api_asstGetAbility', 'api_asstSaveAbility', 'api_asstReorderCardAbilities', 'api_asstGetCard']);
  const reorder = h.calls[2].payload;
  assert.deepStrictEqual(reorder.abilityIds, ['ab-1090', 'ab-1093', 'ab-1091']);
  assert.deepStrictEqual(reorder.expected, [
    { abilityId: 'ab-1090', sortOrder: 1 }, { abilityId: 'ab-1091', sortOrder: 2 }, { abilityId: 'ab-1093', sortOrder: 3 },
  ]);
});

test('状態保存が失敗したら並び順を送らず、失敗を表示する', async () => {
  const h = harness({ saveError: '他の編集が保存済みです。' });
  h.context.asstSetAbilityStatus('ab-1090', 'draft');
  h.context.asstMoveAbility('ab-1093', -1);
  h.context.asstSaveAbilityChanges();
  await h.settle();
  const names = h.calls.map(call => call.name);
  assert(!names.includes('api_asstReorderCardAbilities'));
  const shown = h.calls.filter(call => call.name === 'show');
  assert.strictEqual(shown.length, 1);
  assert.strictEqual(shown[0].payload.isError, true);
  assert.match(shown[0].payload.message, /失敗 1件/);
  assert.match(shown[0].payload.message, /他の編集が保存済みです。/);
});

test('確認ダイアログでキャンセルしたら何も送らない', async () => {
  const h = harness({ confirm: false });
  h.context.asstSetAbilityStatus('ab-1090', 'draft');
  h.context.asstSaveAbilityChanges();
  await h.settle();
  assert.strictEqual(h.calls.length, 0);
  assert.strictEqual(h.context.asstAbilityStatusChangedIds(h.context.ASST.detail).length, 1);
});

test('変更を取り消すと状態も並び順も元へ戻る', async () => {
  const h = harness();
  h.context.asstSetAbilityStatus('ab-1090', 'draft');
  h.context.asstMoveAbility('ab-1093', -1);
  h.context.asstResetAbilityChanges();
  assert.strictEqual(h.context.ASST.abilityStatusEdits, null);
  assert.strictEqual(h.context.ASST.abilityOrder, null);
  assert.match(h.html(), /id="asst_btnSaveAbilityChanges" disabled/);
});

test('保存中は選択とボタンを操作させない', async () => {
  const h = harness();
  h.context.asstSetAbilityStatus('ab-1090', 'draft');
  h.context.ASST.abilitySaving = true;
  assert.match(h.html(), /id="asst_btnSaveAbilityChanges" disabled/);
  assert.match(h.html(), /data-ability-status="ab-1090"[^>]* disabled/);
  assert.match(h.html(), /保存中です。/);
});

(async () => {
  for (const item of tests) { await item.action(); passed++; console.log(`PASS ${item.label}`); }
  console.log(`\nOK 能力タブUI ${passed}ケース`);
})();
