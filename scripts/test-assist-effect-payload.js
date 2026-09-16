#!/usr/bin/env node
'use strict';

/** Claude読取JSON → 検査（check-assist-effect-payload.js）→ CMS貼り付け（ui_assist.html）の往復を検査する。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { checkPayload, toCmsPayload } = require('./check-assist-effect-payload');

const REPO = path.resolve(__dirname, '..');
const EXAMPLE = path.join(REPO, '.claude/skills/assist-effect-capture/examples/c20k-MR-teosu.json');
const UI_SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/ui_assist.html'), 'utf8');
const SCRIPT = UI_SOURCE.match(/<script>([\s\S]*)<\/script>/)[1];

const cardsDoc = { cards: [{ cardId: 'c20k-MR-teosu', name: 'テオス', rarity: 'MR', aura: '黄', monType: '創造' }] };
const effectsDoc = {
  cards: {
    'c20k-MR-teosu': { status: 'draft', effects: [] },
    'a13i-MR-nishiki': {
      status: 'verified',
      effects: [
        { effectId: 'a13i-MR-nishiki-e01', name: 'トレ効果アップ +10%', description: '一緒にトレーニングしたとき、基礎ステータスの上昇量アップ', unlockRank: '無凸', sortOrder: 1, conditional: 0, conditions: null },
        { effectId: 'a13i-MR-nishiki-e02', name: 'モン類ブリーダー・鍛錬', description: 'ブルーダートレ出現率+15%。ブリーダーがトレーニングに出現時、発動中のトレ効果を25%上昇、応援効果+15%', unlockRank: '3凸', sortOrder: 2, conditional: 0, conditions: null },
      ],
    },
  },
};

function example() { return JSON.parse(fs.readFileSync(EXAMPLE, 'utf8')); }
function check(payload) { return checkPayload(payload, { cardsDoc, effectsDoc }); }

// ui_assist.html の関数を最小のstubで動かす。asstParseOcrPastePayload は DOM に触らない純関数。
function uiContext() {
  const context = {
    console, Number, String, Array, Object, Map, Set, Promise, Date, RegExp, Math, JSON, isFinite,
    setTimeout() {}, clearTimeout() {},
    google: { script: { run: {} } },
    document: { body: { classList: { add() {}, remove() {}, toggle() {} } }, querySelectorAll() { return []; }, querySelector() { return null; }, createElement() { return {}; } },
    el() { return { value: '', innerHTML: '', textContent: '', dataset: {}, classList: { toggle() {} } }; },
    esc: value => String(value == null ? '' : value),
    setBusy() {}, show() {}, confirm() { return true; }, alert() {},
    FileReader: function () {}, Blob: function () {},
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    APP_LOCAL_PREVIEW: true,
  };
  vm.createContext(context);
  vm.runInContext(SCRIPT, context, { filename: 'ui_assist.html' });
  return context;
}

let passed = 0;
function test(label, action) {
  try { action(); passed += 1; console.log(`PASS ${label}`); }
  catch (error) { console.error(`FAIL ${label}: ${error.message}`); process.exitCode = 1; }
}

test('テオスの読取例はFAIL 0で通る', () => {
  const issues = check(example());
  assert.deepStrictEqual(issues.fail, []);
  assert.ok(issues.info.some(line => /テオス/.test(line)));
});

test('未知cardIdはFAIL', () => {
  const payload = example();
  payload.cardId = 'zz99-MR-nobody';
  assert.ok(check(payload).fail.some(line => /未知cardId/.test(line)));
});

test('効果名の花マーク・空白付きローマ数字・半角括弧はFAIL', () => {
  const payload = example();
  payload.effects[1].name = '✿モン類ブリーダー +60%';
  payload.effects[6].name = 'アサルトボーナス Ⅱ +1';
  payload.effects[7].description = payload.effects[7].description.replace('（最大10%）', '(最大10%)');
  const fail = check(payload).fail;
  assert.ok(fail.some(line => /花マーク/.test(line)));
  assert.ok(fail.some(line => /ローマ数字の前に空白/.test(line)));
  assert.ok(fail.some(line => /効果8.*説明の表記が規約外/.test(line)));
});

test('効果名の+前の空白と説明の+周りの空白は規約どおりでないとFAIL', () => {
  const payload = example();
  payload.effects[2].name = 'トレ効果アップ+10%';
  payload.effects[9].description = 'ブリーダートレ出現率 +15%\nブリーダーがトレーニングに出現時、発動中のトレ効果を25%上昇、応援効果+15%';
  const fail = check(payload).fail;
  assert.ok(fail.some(line => /効果3.*効果名の表記が規約外/.test(line)));
  assert.ok(fail.some(line => /効果10.*説明の表記が規約外/.test(line)));
});

test('解放ランクが下がる並びはFAIL（コインの誤読を疑う）', () => {
  const payload = example();
  payload.effects[5].unlockRank = '無凸';
  payload.effects[4].unlockRank = '1凸';
  assert.ok(check(payload).fail.some(line => /解放ランクが前の効果より下がっている/.test(line)));
});

test('conditionalと条件の不整合はFAIL、一致文言なのにconditional=0はWARN', () => {
  const payload = example();
  payload.effects[1].conditional = 0;
  payload.effects[7].conditions = null;
  payload.effects[0].conditions.types.push('auraMatch');
  const issues = check(payload);
  assert.ok(issues.fail.some(line => /効果2.*conditional=0 なので conditions は null/.test(line)));
  assert.ok(issues.fail.some(line => /効果8.*conditions \{operator, types\} が必要/.test(line)));
  assert.ok(issues.fail.some(line => /効果1.*条件種別が重複/.test(line)));
  payload.effects[1].conditions = null;
  assert.ok(check(payload).warn.some(line => /効果2.*conditional=0/.test(line)));
});

test('同名の既存効果と説明が違えばWARNし、既存カードの効果が消える場合もWARNする', () => {
  const payload = example();
  const issues = check(payload);
  assert.ok(issues.warn.some(line => /効果10.*同名の既存効果と説明が違う/.test(line)));
  payload.cardId = 'a13i-MR-nishiki';
  cardsDoc.cards.push({ cardId: 'a13i-MR-nishiki', name: '錦', rarity: 'MR', aura: '赤', monType: '獣族' });
  payload.effects = payload.effects.slice(0, 3);
  const rewrite = check(payload);
  assert.ok(rewrite.warn.some(line => /既存効果 1 件が消える/.test(line)));
});

test('同一カード内の name + description + unlockRank 重複はFAIL', () => {
  const payload = example();
  payload.effects.push({ ...payload.effects[11] });
  assert.ok(check(payload).fail.some(line => /重複/.test(line)));
});

test('--emit の形はschemaVersion・source・effects（effectIdなし）', () => {
  const cms = toCmsPayload(example());
  assert.strictEqual(cms.schemaVersion, 1);
  assert.strictEqual(cms.source, 'claude-vision');
  assert.strictEqual(cms.cardId, 'c20k-MR-teosu');
  assert.strictEqual(cms.effects.length, 12);
  assert.deepStrictEqual(Object.keys(cms.effects[0]), ['name', 'description', 'unlockRank', 'conditional', 'conditions']);
  assert.deepStrictEqual(cms.effects[0].conditions, { operator: 'or', types: ['mainBloodlineMatch', 'subBloodlineMatch', 'auraMatch'] });
  assert.strictEqual(cms.effects[2].conditions, null);
});

test('CMSは貼り付けJSONをOCR候補と同じ形へ変換する', () => {
  const context = uiContext();
  // vmの別realmで作られた値なので、JSONへ戻してから比較する
  const candidates = JSON.parse(JSON.stringify(context.asstParseOcrPastePayload(JSON.stringify(toCmsPayload(example())), 'c20k-MR-teosu')));
  assert.strictEqual(candidates.length, 12);
  assert.strictEqual(candidates[0].activationScope, 'conditional');
  assert.deepStrictEqual(candidates[0].activationConditions.expression, {
    operator: 'or', operands: [{ type: 'mainBloodlineMatch' }, { type: 'subBloodlineMatch' }, { type: 'auraMatch' }],
  });
  assert.strictEqual(candidates[0].activationConditions.basis, 'claude-vision');
  assert.deepStrictEqual(candidates[1].activationConditions.expression, { type: 'monTypeMatch' });
  assert.strictEqual(candidates[2].activationScope, 'universal');
  assert.strictEqual(candidates[2].activationConditions, null);
  assert.strictEqual(candidates[6].name, 'アサルトボーナスⅡ +1');
  assert.strictEqual(candidates[6].description, 'ちから、かしこさの素質アップ+1%\n一緒にトレーニングしたとき、ちから、かしこさの上昇量アップ+1');
  assert.deepStrictEqual(candidates[0].issues, []);
  assert.deepStrictEqual(candidates[0].sourceScreenshots, ['teosu-1.png', 'teosu-2.png', 'teosu-3.png', 'teosu-4.png']);
  // 既存の反映処理がそのまま使える形（{operator,types}へ戻せる）
  const toEffect = activation => JSON.parse(JSON.stringify(context.asstOcrConditionsToEffect(activation)));
  assert.deepStrictEqual(toEffect(candidates[0].activationConditions), { operator: 'or', types: ['mainBloodlineMatch', 'subBloodlineMatch', 'auraMatch'] });
  assert.deepStrictEqual(toEffect(candidates[1].activationConditions), { operator: 'and', types: ['monTypeMatch'] });
});

test('CMSは表示中カードと違うcardId・壊れたJSON・ランク逆順・条件不整合を拒否する', () => {
  const context = uiContext();
  const cms = toCmsPayload(example());
  assert.throws(() => context.asstParseOcrPastePayload(JSON.stringify(cms), 'aab-MR-julia'), /表示中のカード/);
  assert.throws(() => context.asstParseOcrPastePayload('{"schemaVersion":1,', 'c20k-MR-teosu'), /JSONとして読めません/);
  assert.throws(() => context.asstParseOcrPastePayload(JSON.stringify({ ...cms, schemaVersion: 2 }), 'c20k-MR-teosu'), /schemaVersion/);
  const reversed = JSON.parse(JSON.stringify(cms));
  reversed.effects[0].unlockRank = '4凸';
  assert.throws(() => context.asstParseOcrPastePayload(JSON.stringify(reversed), 'c20k-MR-teosu'), /解放ランクが前の効果より下がって/);
  const broken = JSON.parse(JSON.stringify(cms));
  broken.effects[0].conditions.types = ['speciesMatch', 'nope'];
  assert.throws(() => context.asstParseOcrPastePayload(JSON.stringify(broken), 'c20k-MR-teosu'), /許可値ではありません/);
  const extra = JSON.parse(JSON.stringify(cms));
  extra.effects[0].effectId = 'c20k-MR-teosu-e01';
  assert.throws(() => context.asstParseOcrPastePayload(JSON.stringify(extra), 'c20k-MR-teosu'), /未対応の項目/);
});

test('貼り付け導線がOCRタブにあり、textareaはverifyの安全条件を満たす', () => {
  assert.match(UI_SOURCE, /id="asst_ocrPasteText"/);
  assert.match(UI_SOURCE, /id="asst_btnPasteOcrJson">貼り付けたJSONを候補にする</);
  assert.match(UI_SOURCE, /el\('asst_btnPasteOcrJson'\)\.onclick=asstPasteOcrJson/);
  assert.doesNotMatch(UI_SOURCE, /<textarea[^>]*(?:json|preview)/i);
});

console.log(`\n${passed} tests passed`);
