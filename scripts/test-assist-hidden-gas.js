#!/usr/bin/env node
/** アシストCMSの「準備中」（cardsシートのhidden列）を、GASソースを模擬シート上で実行して確認する。 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..');
const NOW = '2026-09-28T12:00:00+09:00';

function loadGas({ rows, headerHidden = true, pageStatus = 404 }) {
  const context = { console, JSON, Number, Object, String, Array, Date, Math, RegExp, Map, Set, isNaN, isFinite };
  vm.createContext(context);
  for (const file of ['20_assist.gs', '23_assist_hidden.gs']) {
    vm.runInContext(fs.readFileSync(path.join(repo, '_cms/gas', file), 'utf8'), context);
  }
  const headers = context.ASST_HEADERS[context.ASST_SHEET_CARDS];
  const written = [];
  const fetched = [];
  const sheet = {
    getMaxColumns: () => headers.length + 5,
    getRange(rowNumber, column, rowCount = 1, columnCount = 1) {
      return {
        getValue: () => (rowNumber === 1 && column === headers.indexOf('hidden') + 1 && headerHidden ? 'hidden' : ''),
        setValues: values => { written.push({ rowNumber, column, values }); },
      };
    },
  };
  Object.assign(context, {
    asstRequireUser_: () => ({ nickname: 'tester', role: 'admin' }),
    asstAcquireScriptLock_: () => ({}),
    asstReleaseScriptLock_: () => {},
    asstRows_: () => rows.map((row, index) => ({ ...row, _row: index + 2 })),
    asstSheet_: () => sheet,
    asstAppendLog_: () => {},
    asstDriveImageByName_: () => ({ bytes: [] }),
    nowIso_: () => NOW,
    UrlFetchApp: { fetch: url => { fetched.push(url); return { getResponseCode: () => pageStatus }; } },
  });
  return { gas: context, headers, written, fetched };
}

function cardRow(overrides = {}) {
  return {
    sourceOrder: 1, cardId: 'c0093-SSR', name: '新カード', rarity: 'SSR', aura: '白', cardType: '命中', monType: '怪物',
    image: '', event2: '', releasedAt: '', accessoryStatus: 'unknown', statsJson: '[]', limitBreakJson: 'null',
    ratingsJson: 'null', explanation: '', formationsJson: '[]', sapoRefJson: 'null', version: 1, updatedAt: NOW,
    updatedBy: 'seed', hidden: '', ...overrides,
  };
}

function savePayload(gas, row, cardOverrides = {}) {
  return { cardId: row.cardId, version: 1, card: { ...gas.asstCardFromRow_(row), ...cardOverrides } };
}

function writtenHidden(env) {
  return env.written.at(-1).values[0][env.headers.indexOf('hidden')];
}

const cases = [];
function test(label, fn) { cases.push([label, fn]); }

test('公開データのカードには準備中のときだけhidden: trueが付く', () => {
  const { gas } = loadGas({ rows: [] });
  assert.strictEqual(gas.asstCardFromRow_(cardRow({ hidden: true })).hidden, true);
  assert(!('hidden' in gas.asstCardFromRow_(cardRow({ hidden: '' }))));
  assert(!('hidden' in gas.asstCardFromRow_(cardRow({ hidden: false }))));
});

test('画像が空なら準備中・公開済みとも画像検査を通る（サイトはNO IMAGE）', () => {
  const { gas } = loadGas({ rows: [] });
  assert.doesNotThrow(() => gas.asstValidateImagePath_({ cardId: 'c0093-SSR', image: '', hidden: true }, true));
  assert.doesNotThrow(() => gas.asstValidateImagePath_({ cardId: 'c0093-SSR', image: '' }, true));
  assert.throws(() => gas.asstValidateImagePath_({ cardId: 'c0093-SSR', image: 'assist-cards/other.jpg' }, false), /画像パス必須/);
  assert.deepStrictEqual(Array.from(gas.asstValidateImageFiles_([{ cardId: 'c0093-SSR', image: '', hidden: true }], {})), []);
});

test('新規登録で準備中を指定するとhidden列にtrueを書き、応答にも返す', () => {
  const { gas } = loadGas({ rows: [] });
  const card = gas.asstCreateCardPayload_({ name: '新カード', rarity: 'SSR', aura: '白', cardType: '命中', monType: '怪物', hidden: true });
  assert.strictEqual(card.hidden, true);
  card.cardId = 'c0093-SSR';
  const values = gas.asstCardCreateRow_(card, 1, NOW, 'tester');
  assert.strictEqual(values[gas.ASST_HEADERS[gas.ASST_SHEET_CARDS].indexOf('hidden')], true);
  const plain = gas.asstCreateCardPayload_({ name: '別カード', rarity: 'MR', aura: '赤', cardType: 'ガード', monType: null });
  assert.strictEqual(gas.asstCardCreateRow_({ ...plain, cardId: 'c0094-MR' }, 2, NOW, 'tester')[gas.ASST_HEADERS[gas.ASST_SHEET_CARDS].indexOf('hidden')], '');
});

test('未公開カードは準備中にでき、画像が空でも保存できる', () => {
  const row = cardRow();
  const env = loadGas({ rows: [row], pageStatus: 404 });
  const result = env.gas.api_asstSaveCard(savePayload(env.gas, row, { hidden: true }));
  assert.strictEqual(result.hidden, true);
  assert.strictEqual(writtenHidden(env), true);
  assert.match(env.fetched[0], /\/cards\/c0093-SSR\.html$/);
});

test('mainに詳細ページがあるカードは準備中にできない', () => {
  const row = cardRow({ image: 'assist-cards/c0093-SSR.jpg' });
  const env = loadGas({ rows: [row], pageStatus: 200 });
  assert.throws(() => env.gas.api_asstSaveCard(savePayload(env.gas, row, { hidden: true })), /公開済みのカードは準備中に戻せません/);
  assert.strictEqual(env.written.length, 0);
});

test('公開状況を確認できないときは準備中にできない', () => {
  const row = cardRow({ image: 'assist-cards/c0093-SSR.jpg' });
  const env = loadGas({ rows: [row], pageStatus: 500 });
  assert.throws(() => env.gas.api_asstSaveCard(savePayload(env.gas, row, { hidden: true })), /公開状況を確認できない/);
});

test('hidden列が無い状態で準備中へ切り替えるとsetup実行を促して止まる', () => {
  const row = cardRow();
  const env = loadGas({ rows: [row], headerHidden: false });
  assert.throws(() => env.gas.api_asstSaveCard(savePayload(env.gas, row, { hidden: true })), /setup5_upgradeAssistCardHiddenColumn/);
});

test('hidden未指定の保存は準備中を保ち、falseを送ると外れる', () => {
  const row = cardRow({ hidden: true });
  const env = loadGas({ rows: [row] });
  const payload = savePayload(env.gas, row);
  delete payload.card.hidden;
  assert.strictEqual(env.gas.api_asstSaveCard(payload).hidden, true);
  assert.strictEqual(writtenHidden(env), true);
  assert.strictEqual(env.fetched.length, 0, '準備中のままなら公開状況を問い合わせない');
  const released = env.gas.api_asstSaveCard(savePayload(env.gas, cardRow({ hidden: true, image: 'assist-cards/c0093-SSR.jpg' }), { hidden: false }));
  assert.strictEqual(released.hidden, false);
  assert.strictEqual(writtenHidden(env), '');
});

test('画像未登録のまま準備中を外して保存できる', () => {
  const row = cardRow({ hidden: true });
  const env = loadGas({ rows: [row] });
  const released = env.gas.api_asstSaveCard(savePayload(env.gas, row, { hidden: false }));
  assert.strictEqual(released.hidden, false);
});

for (const [label, fn] of cases) {
  fn();
  console.log(`PASS ${label}`);
}
console.log(`OK アシスト準備中のGAS ${cases.length}件PASS`);
