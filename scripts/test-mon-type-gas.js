#!/usr/bin/env node
/** モン類の文のCMS（_cms/gas/60_mon_type.gs）を、模擬シート上で実行して確認する（P-004 b）。 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..');
const taxonomyText = fs.readFileSync(path.join(repo, 'src/data/taxonomy.json'), 'utf8');
const assistCards = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/assist-cards.json'), 'utf8'));
const publicCard = assistCards.cards.find(card => card.hidden !== true);
const hiddenCard = { cardId: 'zz-hidden-card', name: '準備中カード', rarity: 'MR', hidden: true };
const HEADERS = ['monSlug', 'name', 'sectionsJson', 'cardGroupsJson', 'updatedAt', 'lastEditor', 'editedAt'];

// SpreadsheetAppのシートを2次元配列で模擬する（1始まりの行・列）
function mockSheet(rows) {
  const data = rows.map(row => row.slice());
  const cell = (r, c) => (data[r - 1] && data[r - 1][c - 1] !== undefined ? data[r - 1][c - 1] : '');
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues() {
      return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j)));
    },
    setValues(values) {
      values.forEach((row, i) => row.forEach((value, j) => {
        while (data.length < r + i) data.push([]);
        data[r + i - 1][c + j - 1] = value;
      }));
      return this;
    },
    setNumberFormat() { return this; },
  });
  return {
    data,
    getRange: range,
    getLastRow: () => data.length,
    getLastColumn: () => Math.max(...data.map(row => row.length)),
  };
}

function loadGas(sheet, { today = '2026-10-14' } = {}) {
  let clock = 0;
  const context = {
    console,
    JSON,
    Utilities: { formatDate: (_, __, pattern) => (pattern === 'yyyy-MM-dd' ? today : `2026-10-14T10:00:${String(clock++).padStart(2, '0')}+09:00`) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  };
  vm.createContext(context);
  for (const file of ['00_core.gs', '60_mon_type.gs']) {
    vm.runInContext(fs.readFileSync(path.join(repo, '_cms/gas', file), 'utf8'), context);
  }
  Object.assign(context, {
    book_: () => ({ getSheetByName: name => (name === 'mon_types' ? sheet : null) }),
    requireScope_: scope => {
      assert.strictEqual(scope, 'monster');
      return { nickname: 'tester', role: 'admin' };
    },
    asstFetchJson_: url => {
      if (url.endsWith('/taxonomy.json')) return JSON.parse(taxonomyText);
      if (url.endsWith('/assist-cards.json')) return { cards: assistCards.cards.concat([hiddenCard]) };
      throw new Error(`想定外のURL: ${url}`);
    },
  });
  return context;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

test('シートが無い・空なら公開に taxonomy.json を含めない', () => {
  const noSheet = loadGas(null);
  assert.strictEqual(noSheet.monTypeBuildPublishText_(), null);
  const empty = loadGas(mockSheet([HEADERS]));
  assert.strictEqual(empty.monTypeBuildPublishText_(), null);
});

const sheet = mockSheet([HEADERS]);
const gas = loadGas(sheet);

test('mainの taxonomy.json を取り込み、そのまま書き出すと1バイトも変わらない', () => {
  assert.match(gas.monTypeImportFromMain_(), /6 行を取り込みました/);
  assert.strictEqual(sheet.data.length, 7);
  assert.strictEqual(gas.monTypeBuildPublishText_(), taxonomyText);
});

test('行があるときの取り込みは何もしない（上書きしない）', () => {
  const before = JSON.stringify(sheet.data);
  assert.match(gas.monTypeImportFromMain_(), /取り込みは行いませんでした/);
  assert.strictEqual(JSON.stringify(sheet.data), before);
});

function payloadFor(slug, change = {}) {
  const list = gas.api_monTypeList();
  const row = list.rows.find(item => item.monSlug === slug);
  return {
    monSlug: slug, updatedAt: '2026-10-14', baseEditedAt: row.editedAt,
    sections: JSON.parse(JSON.stringify(row.sections)), cardGroups: JSON.parse(JSON.stringify(row.cardGroups)), ...change,
  };
}

test('一覧はMON_ORDER順で、カード候補に準備中は出ない', () => {
  const list = gas.api_monTypeList();
  assert.deepStrictEqual(list.rows.map(row => row.monSlug), ['souzou', 'genrei', 'mazoku', 'kemono', 'kaibutsu', 'muki']);
  assert.ok(list.cards.some(card => card.cardId === publicCard.cardId));
  assert.ok(!list.cards.some(card => card.cardId === hiddenCard.cardId));
});

test('公開中でない・準備中のカードIDは保存できない', () => {
  for (const cardId of ['no-such-card', hiddenCard.cardId]) {
    const payload = payloadFor('souzou');
    payload.cardGroups[0].cardIds = [cardId];
    assert.throws(() => gas.api_monTypeSave(payload), /公開中のアシストカードにありません/);
  }
  const empty = payloadFor('souzou');
  empty.cardGroups = [{ heading: '師匠カード', cardIds: [] }];
  assert.throws(() => gas.api_monTypeSave(empty), /カードがありません/);
});

test('空の見出し・空の本文・未来の日付は保存できない', () => {
  let payload = payloadFor('souzou');
  payload.sections[0].heading = ' ';
  assert.throws(() => gas.api_monTypeSave(payload), /見出しが空/);
  payload = payloadFor('souzou');
  payload.sections[0].items[0].body = '';
  assert.throws(() => gas.api_monTypeSave(payload), /本文が空/);
  payload = payloadFor('souzou', { updatedAt: '2026-10-15' });
  assert.throws(() => gas.api_monTypeSave(payload), /未来の日付/);
});

test('保存すると本文・掲載カード・最終更新日が書き出しに出る。古い画面からの保存は拒否する', () => {
  const payload = payloadFor('souzou');
  payload.sections[0].items[0].body = '書き換えた本文。';
  payload.sections[0].items[0].subheading = '';
  payload.cardGroups = [{ heading: ' 注目のカード ', cardIds: [publicCard.cardId, publicCard.cardId] }];
  const result = gas.api_monTypeSave(payload);
  assert.strictEqual(result.lastEditor, 'tester');
  const doc = JSON.parse(gas.monTypeBuildPublishText_());
  assert.deepStrictEqual(doc.monTypes.souzou.sections[0].items[0], { subheading: null, body: '書き換えた本文。' });
  assert.deepStrictEqual(doc.monTypes.souzou.cardGroups, [{ heading: '注目のカード', cardIds: [publicCard.cardId] }]);
  assert.strictEqual(doc.monTypes.souzou.updatedAt, '2026-10-14');
  // 他のモン類は変わらない
  assert.deepStrictEqual(doc.monTypes.genrei, JSON.parse(taxonomyText).monTypes.genrei);
  assert.throws(() => gas.api_monTypeSave(payload), /他の人がこのモン類を更新/);
});

test('本文と掲載カードを全部消したモン類は空で書き出す（ページは運営者の文なしで残る）', () => {
  gas.api_monTypeSave(payloadFor('muki', { sections: [], cardGroups: [], updatedAt: '' }));
  const doc = JSON.parse(gas.monTypeBuildPublishText_());
  assert.deepStrictEqual(doc.monTypes.muki.sections, []);
  assert.deepStrictEqual(doc.monTypes.muki.cardGroups, []);
});

test('行が欠けたシートは公開を止める', () => {
  const broken = mockSheet(sheet.data.filter(row => row[0] !== 'kemono'));
  assert.throws(() => loadGas(broken).monTypeBuildPublishText_(), /kemono の行がありません/);
});

console.log(`\n${passed}件 PASS`);
