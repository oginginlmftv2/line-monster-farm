#!/usr/bin/env node
/** ガチャ生成の正常13ケースと、DB検査の破壊10ケースを確認する。 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PICKUP_SLOTS,
  GACHA_GATE_EXPLANATION,
  buildGachaPages,
  resolveBuildNow,
  validateGachaData,
} = require('../build');

const repo = path.resolve(__dirname, '..');
const monsterDoc = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/monster-ids.json'), 'utf8'));
const editorialDoc = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/monsters-editorial.json'), 'utf8'));
const cardDoc = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/assist-cards.json'), 'utf8'));
const editorial = Object.values(editorialDoc.monsters);
const editorialById = new Map(editorial.map(entry => [entry.id, entry]));
const monsters = monsterDoc.monsters
  .filter(monster => String(editorialById.get(monster.id)?.explanation || '').trim())
  .slice(0, PICKUP_SLOTS)
  .map((monster, index) => index === 0 ? { ...monster, name: '<モンスター> & "引用"' } : monster);
const monsterWithoutExplanation = monsterDoc.monsters
  .find(monster => !String(editorialById.get(monster.id)?.explanation || '').trim());
const fixtureMonsters = monsters.concat(monsterWithoutExplanation ? [monsterWithoutExplanation] : []);
const cards = cardDoc.cards
  .filter(card => String(card.explanation || '').trim())
  .slice(0, PICKUP_SLOTS)
  .map((card, index) => index === 0 ? { ...card, name: '<カード> & "引用"' } : card);

assert.strictEqual(monsters.length, PICKUP_SLOTS, '解説つきモンスターのfixtureが不足');
assert(monsterWithoutExplanation, '解説なしモンスターのfixtureが不足');
assert.strictEqual(cards.length, PICKUP_SLOTS, '解説つきカードのfixtureが不足');

const typeDb = { schemaVersion: 1, types: ['神殿祭'] };
const now = '2026-09-10T12:00+09:00';
const pickupMonsters = count => monsters.slice(0, count).map((monster, index) => ({
  id: monster.id,
  rate: 0.5 + index / 10,
}));
const pickupCards = count => cards.slice(0, count).map((card, index) => ({
  cardId: card.cardId,
  rate: 0.75 + index / 10,
}));

function gacha(overrides = {}) {
  return {
    gachaId: '20260901-1',
    name: '<神殿祭> & "第1回"',
    gachaType: '神殿祭',
    image: 'gacha/20260901-1.jpg',
    startAt: '2026-09-01T15:00+09:00',
    endAt: '2026-09-15T14:59+09:00',
    explanation: '解'.repeat(GACHA_GATE_EXPLANATION),
    pickupMonsters: pickupMonsters(PICKUP_SLOTS),
    pickupCards: pickupCards(PICKUP_SLOTS),
    rerollPriority: true,
    publishedAt: '2026-09-01',
    status: 'published',
    ...overrides,
  };
}

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-gacha-build-'));
  fs.mkdirSync(path.join(root, 'gacha'), { recursive: true });
  fs.writeFileSync(path.join(root, 'gacha/20260901-1.jpg'), 'fixture');
  fs.writeFileSync(path.join(root, 'gacha/20260801-1.jpg'), 'fixture');
  fs.writeFileSync(path.join(root, 'gacha/20261001-1.jpg'), 'fixture');
  for (const monster of fixtureMonsters) {
    const detailPath = path.join(root, String(monster.url).replace(/^\//, ''));
    fs.mkdirSync(path.dirname(detailPath), { recursive: true });
    fs.writeFileSync(detailPath, 'fixture');
  }
  return root;
}

function build(root, gachas, outputName = 'out') {
  return buildGachaPages({
    root,
    outputRoot: path.join(root, outputName),
    now,
    gachaDb: { schemaVersion: 1, gachas },
    typeDb,
    monsterDb: fixtureMonsters,
    editorialDb: editorial,
    cardDb: cards,
  });
}

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return files.sort();
}

function pass(number, label) {
  console.log(`PASS 正常${number}: ${label}`);
}

function expectRejected(number, label, mutate, expected) {
  const root = makeRoot();
  try {
    const base = gacha();
    const gachaDb = { schemaVersion: 1, gachas: [base] };
    mutate(gachaDb, base);
    const issues = validateGachaData({ root, gachaDb, typeDb, monsterDb: fixtureMonsters, cardDb: cards });
    const hit = issues.find(issue => expected.test(issue));
    assert(hit, `${label}: 想定した拒否がない: ${issues.join(' / ')}`);
    console.log(`PASS 破壊${number}: ${label} → ${hit}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const root = makeRoot();
try {
  const ended = gacha({
    gachaId: '20260801-1',
    name: '終了済みガチャ',
    image: 'gacha/20260801-1.jpg',
    startAt: '2026-08-01T15:00+09:00',
    endAt: '2026-08-15T14:59+09:00',
    explanation: '',
    pickupMonsters: pickupMonsters(1),
    pickupCards: [],
    publishedAt: '2026-08-01',
  });
  const result = build(root, [gacha(), ended]);
  const outputRoot = path.join(root, 'out');
  const outputFiles = filesUnder(outputRoot);
  assert.deepStrictEqual(outputFiles, [
    'gacha/20260801-1.html',
    'gacha/20260901-1.html',
    'gacha/index.html',
  ]);
  pass(1, '開催中1件・終了1件から詳細2枚と一覧1枚を生成');

  const index = fs.readFileSync(path.join(outputRoot, 'gacha/index.html'), 'utf8');
  assert(index.indexOf('<h2 class="section-title">開催中</h2>') < index.indexOf('<h2 class="section-title">終了</h2>'));
  pass(2, '一覧で開催中と終了を見出し分け');

  assert(index.includes('終了済みガチャ'));
  pass(3, '終了ガチャを一覧へ恒久掲載');

  const activePage = fs.readFileSync(path.join(outputRoot, 'gacha/20260901-1.html'), 'utf8');
  const endedPage = fs.readFileSync(path.join(outputRoot, 'gacha/20260801-1.html'), 'utf8');
  const belowGate = build(root, [gacha({
    explanation: '解'.repeat(GACHA_GATE_EXPLANATION - 1),
  })], 'gate-below');
  const atGate = build(root, [gacha({
    explanation: '解'.repeat(GACHA_GATE_EXPLANATION),
  })], 'gate-at');
  assert.strictEqual(belowGate.pages[0].indexable, false);
  assert(/content="noindex,follow"/.test(belowGate.pages[0].html));
  assert(!/adsbygoogle/.test(belowGate.pages[0].html));
  assert.strictEqual(atGate.pages[0].indexable, true);
  assert(!/name="robots"/.test(atGate.pages[0].html));
  assert(/adsbygoogle/.test(atGate.pages[0].html));
  assert.deepStrictEqual(result.sitemapPages.map(page => page.canonical), [
    'https://line-monster-farm-tetteikouryaku.com/gacha/',
    'https://line-monster-farm-tetteikouryaku.com/gacha/20260901-1.html',
  ]);
  pass(4, '解説文字数が閾値未満ならnoindex、閾値ちょうどならindex対象');

  assert(!/adsbygoogle/.test(endedPage));
  pass(5, '未通過詳細に広告スクリプトなし');

  assert(index.includes('href="20260801-1.html"'));
  pass(6, '未通過詳細にも一覧からリンク');

  const empty = build(root, [], 'empty');
  assert.strictEqual(empty.pages.length, 0);
  assert.deepStrictEqual(filesUnder(path.join(root, 'empty')), []);
  pass(7, '空DBでは詳細・一覧を生成しない');

  build(root, [gacha(), ended], 'deterministic-a');
  build(root, [gacha(), ended], 'deterministic-b');
  const firstFiles = filesUnder(path.join(root, 'deterministic-a'));
  assert.deepStrictEqual(firstFiles, filesUnder(path.join(root, 'deterministic-b')));
  for (const file of firstFiles) {
    assert(fs.readFileSync(path.join(root, 'deterministic-a', file))
      .equals(fs.readFileSync(path.join(root, 'deterministic-b', file))));
  }
  pass(8, '同じ入力・基準時刻の2回生成がバイト一致');

  const partial = gacha({
    gachaId: '20261001-1',
    image: 'gacha/20261001-1.jpg',
    startAt: '2026-10-01T15:00+09:00',
    endAt: '2026-10-15T14:59+09:00',
    publishedAt: '2026-10-01',
    pickupMonsters: pickupMonsters(3),
    pickupCards: pickupCards(2),
  });
  const partialResult = build(root, [partial], 'partial');
  assert.strictEqual(partialResult.pages.length, 1);
  assert(partialResult.indexHtml.includes('10月1日開始'));
  pass(9, '3体・2枚と開始前表示を生成');

  assert(activePage.includes('&lt;神殿祭&gt; &amp; &quot;第1回&quot;'));
  assert(activePage.includes('&lt;モンスター&gt; &amp; &quot;引用&quot;'));
  assert(activePage.includes('&lt;カード&gt; &amp; &quot;引用&quot;'));
  assert(!activePage.includes('<神殿祭>'));
  pass(10, 'DB由来の < > & " をHTMLエスケープ');

  const previousBuildNow = process.env.GACHA_BUILD_NOW;
  const hadBuildNow = Object.prototype.hasOwnProperty.call(process.env, 'GACHA_BUILD_NOW');
  try {
    delete process.env.GACHA_BUILD_NOW;
    const resolved = resolveBuildNow();
    assert(Number.isFinite(Date.parse(resolved)), `有効なISO日時でない: ${resolved}`);
    pass(11, '環境変数未設定時は現在時刻のISO文字列を返す');

    const override = '2026-09-12T03:04:05.000Z';
    process.env.GACHA_BUILD_NOW = override;
    assert.strictEqual(resolveBuildNow(), override);
    pass(12, '環境変数設定時は指定値をそのまま返す');
  } finally {
    if (hadBuildNow) process.env.GACHA_BUILD_NOW = previousBuildNow;
    else delete process.env.GACHA_BUILD_NOW;
  }

  const mixedPickup = gacha({
    pickupMonsters: [
      { id: monsters[0].id, rate: 0.5 },
      { id: monsterWithoutExplanation.id, rate: 0.6 },
    ],
    pickupCards: [],
  });
  const mixedPage = build(root, [mixedPickup], 'mixed-explanation').pages[0].html;
  assert(mixedPage.includes(`href="../${String(monsterWithoutExplanation.url).replace(/^\//, '')}"`));
  assert.strictEqual((mixedPage.match(/>モンスター詳細を見る<\/a>/g) || []).length, 2);
  pass(13, '解説の有無に関係なく既存モンスター詳細へのリンクを表示');

  for (const [label, monsterCount, cardCount] of [
    ['A', 5, 5],
    ['B', 3, 2],
    ['C', 1, 0],
  ]) {
    const measured = gacha({
      explanation: '',
      pickupMonsters: pickupMonsters(monsterCount),
      pickupCards: pickupCards(cardCount),
    });
    const page = build(root, [measured], `measure-${label}`).pages[0];
    console.log(`MEASURE ${label}: 総数 ${page.contentCharacters}字 / テンプレート ${page.templateCharacters}字 / ピックアップ抜粋 ${page.excerptCharacters}字`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

expectRejected(11, 'gachaId形式不正', (doc, base) => { base.gachaId = 'bad'; }, /gachaId形式/);
expectRejected(12, 'gachaId重複', (doc, base) => { doc.gachas.push({ ...base }); }, /gachaIdが重複/);
expectRejected(13, 'startAt > endAt', (doc, base) => { base.startAt = '2026-09-16T15:00+09:00'; }, /startAtがendAtより前でない/);
expectRejected(14, '種別マスタ外', (doc, base) => { base.gachaType = '未知'; }, /gachaTypeがマスタにない/);
expectRejected(15, '未知モンスターID', (doc, base) => { base.pickupMonsters[0].id = '9999'; }, /未知のモンスターID/);
expectRejected(16, '未知cardId', (doc, base) => { base.pickupCards[0].cardId = 'missing-card'; }, /未知のcardId/);
expectRejected(17, '文字列rate', (doc, base) => { base.pickupMonsters[0].rate = '0.5%'; }, /排出率が0超100以下の数値でない/);
expectRejected(18, 'rate 0 / 101', (doc, base) => {
  base.pickupMonsters[0].rate = 0;
  base.pickupCards[0].rate = 101;
}, /排出率が0超100以下の数値でない/);
expectRejected(19, 'ピックアップ6枠', (doc, base) => {
  base.pickupMonsters = Array.from({ length: PICKUP_SLOTS + 1 }, () => ({ ...base.pickupMonsters[0] }));
}, /枠を超過/);
expectRejected(20, 'publishedAt空欄', (doc, base) => { base.publishedAt = ''; }, /publishedなのにpublishedAtが空/);

console.log('OK 正常13件PASS・破壊10件すべて拒否');
