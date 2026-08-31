#!/usr/bin/env node
/** ガチャ生成・統合の正常ケースと、DB検査の破壊ケースを確認する。 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { buildAssistPages, buildCardArtifact } = require('./build-assist-pages');
const {
  PICKUP_SLOTS,
  GACHA_GATE_EXPLANATION,
  buildGachaPages,
  replaceMarkerBlock,
  resolveBuildNow,
  selectRerollGacha,
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
    image: 'gacha-banner/20260901-1.jpg',
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
  fs.mkdirSync(path.join(root, 'gacha-banner'), { recursive: true });
  fs.writeFileSync(path.join(root, 'gacha-banner/20260901-1.jpg'), 'fixture');
  fs.writeFileSync(path.join(root, 'gacha-banner/20260801-1.jpg'), 'fixture');
  fs.writeFileSync(path.join(root, 'gacha-banner/20261001-1.jpg'), 'fixture');
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

const indexTemplate = `${Array.from({ length: 100 }, (_, i) => `before-${i}`).join('\n')}
const rows = [
// GACHA:UPDATES:START
old update
// GACHA:UPDATES:END
];
<!-- GACHA:NAV:START -->
old nav
<!-- GACHA:NAV:END -->
<!-- GACHA:PICKUP:MONSTER:START -->
old monster
<!-- GACHA:PICKUP:MONSTER:END -->
<!-- GACHA:PICKUP:CARD:START -->
old card
<!-- GACHA:PICKUP:CARD:END -->
${Array.from({ length: 100 }, (_, i) => `after-${i}`).join('\n')}`;
const rerollTemplate = `${Array.from({ length: 100 }, (_, i) => `reroll-before-${i}`).join('\n')}
<!-- GACHA:REROLL:START -->
old reroll
<!-- GACHA:REROLL:END -->
${Array.from({ length: 100 }, (_, i) => `reroll-after-${i}`).join('\n')}`;

function buildIntegrated(root, gachas, outputName) {
  return buildGachaPages({
    root,
    outputRoot: path.join(root, outputName),
    now,
    gachaDb: { schemaVersion: 1, gachas },
    typeDb,
    monsterDb: fixtureMonsters,
    editorialDb: editorial,
    cardDb: cards,
    indexSource: indexTemplate,
    rerollSource: rerollTemplate,
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
    image: 'gacha-banner/20260801-1.jpg',
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
    image: 'gacha-banner/20261001-1.jpg',
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

  const emptyIntegrated = buildIntegrated(root, [], 'integrated-empty');
  assert.strictEqual(emptyIntegrated.outputs.length, 0);
  assert.deepStrictEqual(filesUnder(path.join(root, 'integrated-empty')), []);
  pass(14, '空DBではマーカー区間を1バイトも変更しない');

  const integrated = buildIntegrated(root, [gacha(), ended], 'integrated');
  assert(integrated.integratedIndex.includes('gacha/20260901-1.html'));
  assert(integrated.integratedIndex.includes('GACHA:PICKUP:MONSTER:START'));
  assert(integrated.integratedIndex.includes('GACHA:PICKUP:CARD:START'));
  assert(integrated.integratedIndex.includes('href="gacha/"'));
  assert(integrated.integratedReroll.includes('cards/'));
  pass(15, 'published 1件以上でindexとrerollの各マーカー区間を置換');

  const outsideProbe = replaceMarkerBlock(indexTemplate, 'NAV', 'replacement', 'html', 'index.html');
  const startMarker = '<!-- GACHA:NAV:START -->';
  const endMarker = '<!-- GACHA:NAV:END -->';
  assert.strictEqual(outsideProbe.slice(0, outsideProbe.indexOf(startMarker)), indexTemplate.slice(0, indexTemplate.indexOf(startMarker)));
  assert.strictEqual(outsideProbe.slice(outsideProbe.indexOf(endMarker)), indexTemplate.slice(indexTemplate.indexOf(endMarker)));
  assert(outsideProbe.startsWith(Array.from({ length: 100 }, (_, i) => `before-${i}`).join('\n')));
  assert(outsideProbe.endsWith(Array.from({ length: 100 }, (_, i) => `after-${i}`).join('\n')));
  pass(16, 'マーカー外と前後100行が1バイトも変化しない');

  const secondCurrent = gacha({
    gachaId: '20260901-2', name: '同時開催ガチャ', image: 'gacha-banner/20260801-1.jpg', rerollPriority: false,
  });
  const multiple = buildIntegrated(root, [gacha(), secondCurrent], 'multiple-current');
  assert(multiple.integratedIndex.includes('<h3 class="pickup-gacha-title">&lt;神殿祭&gt; &amp; &quot;第1回&quot;</h3>'));
  assert(multiple.integratedIndex.includes('<h3 class="pickup-gacha-title">同時開催ガチャ</h3>'));
  pass(17, '複数の開催中ガチャをガチャごとのセクションに分割');

  const endedOnly = buildIntegrated(root, [ended], 'ended-only');
  assert(endedOnly.integratedIndex.includes('現在開催中のガチャはありません'));
  assert.strictEqual(endedOnly.integratedReroll, rerollTemplate);
  assert(endedOnly.integratedIndex.includes('終了済みガチャ'));
  pass(18, '開催中0件ではピックアップをフォールバックにしrerollは更新せず履歴を保持');

  assert.strictEqual(selectRerollGacha([gacha({ rerollPriority: false }), { ...secondCurrent, rerollPriority: true }], now).gachaId, secondCurrent.gachaId);
  pass(19, 'rerollPriority=trueが1件ならそのガチャを選定');
  const olderPriority = gacha({ gachaId: '20260801-1', image: 'gacha-banner/20260801-1.jpg', startAt: '2026-08-01T15:00+09:00', endAt: '2026-09-12T14:59+09:00' });
  assert.strictEqual(selectRerollGacha([olderPriority, gacha()], now).gachaId, '20260901-1');
  pass(20, 'rerollPriority=trueが2件ならstartAtが新しい方を選定');
  const noPriority = [gacha({ rerollPriority: false }), secondCurrent];
  assert.strictEqual(selectRerollGacha(noPriority, now).gachaId, '20260901-1');
  pass(21, 'rerollPriorityが全件falseならstartAt最新・同時はgachaId昇順で選定');
  assert.strictEqual(selectRerollGacha([ended], now), null);
  pass(22, 'reroll候補0件では選定せず区間を変更しない');

  const historyOrder = buildIntegrated(root, [ended, gacha()], 'history-order').integratedIndex;
  assert(historyOrder.indexOf('2026.09.01') < historyOrder.indexOf('2026.08.01'));
  pass(23, '更新履歴をpublishedAt降順にし終了ガチャも残す');

  const appearance = require('../build').renderGachaAppearances([ended, gacha()], 'monster', monsters[0].id, '../../../');
  assert(appearance.includes('登場ガチャ') && appearance.includes('20260901-1.html') && appearance.includes('20260801-1.html'));
  assert(appearance.indexOf('20260901-1.html') < appearance.indexOf('20260801-1.html'));
  pass(24, 'ピックアップされたモンスター詳細向け登場ガチャをstartAt降順で生成');
  assert.strictEqual(require('../build').renderGachaAppearances([gacha()], 'monster', '9999', '../../../'), '');
  pass(25, '登場ガチャ0件ではセクションを出力しない');

  const detA = buildIntegrated(root, [gacha(), secondCurrent], 'integrated-det-a');
  const detB = buildIntegrated(root, [gacha(), secondCurrent], 'integrated-det-b');
  assert.strictEqual(detA.integratedIndex, detB.integratedIndex);
  assert.strictEqual(detA.integratedReroll, detB.integratedReroll);
  pass(26, '同じ入力・同じ基準時刻のページ統合結果がバイト一致');

  const cardById = new Map([[cards[0].cardId, { ...cards[0], formations: [] }]]);
  const cardAppearance = require('../build').renderGachaAppearances([gacha()], 'card', cards[0].cardId, '../');
  const cardLinked = buildCardArtifact(
    { ...cards[0], formations: [] }, [], [], cardById, cardAppearance
  ).html;
  assert(cardLinked.includes('登場ガチャ') && cardLinked.includes('../gacha/20260901-1.html'));
  assert(cardLinked.indexOf('登場ガチャ') < cardLinked.indexOf('アシストカード一覧へ戻る'));
  pass(27, 'カードテンプレート由来の登場ガチャ逆リンクを一覧導線直前へ生成');

  const cardWithoutAppearance = buildCardArtifact(
    { ...cards[0], formations: [] }, [], [], cardById
  ).html;
  assert(!cardWithoutAppearance.includes('登場ガチャ'));
  pass(28, '該当ガチャ0件のカードには登場ガチャセクションを出力しない');

  assert.strictEqual(buildAssistPages({ dryRun: true }).count, cardDoc.cards.length);
  pass(29, 'gachaAppearancesFor未指定でもbuild-assist-pagesを空文字扱いで実行');

  const noMonsterExcerpt = buildIntegrated(root, [gacha({
    pickupMonsters: [{ id: monsterWithoutExplanation.id, rate: 0.5 }],
    pickupCards: [],
  })], 'no-monster-excerpt').integratedIndex;
  assert(!noMonsterExcerpt.includes('<div class="pickup-desc"></div>'));
  pass(30, '解説のないモンスターピックアップに空のpickup-descを出力しない');

  const blankCard = { ...cards[0], cardId: 'blank-card', name: '解説なしカード', explanation: '' };
  const noCardExcerpt = buildGachaPages({
    root,
    outputRoot: path.join(root, 'no-card-excerpt'),
    now,
    gachaDb: { schemaVersion: 1, gachas: [gacha({
      pickupMonsters: [], pickupCards: [{ cardId: blankCard.cardId, rate: 0.5 }],
    })] },
    typeDb,
    monsterDb: fixtureMonsters,
    editorialDb: editorial,
    cardDb: cards.concat(blankCard),
    indexSource: indexTemplate,
    rerollSource: rerollTemplate,
  }).integratedIndex;
  assert(!noCardExcerpt.includes('<div class="pickup-desc"></div>'));
  pass(31, '解説のないカードピックアップに空のpickup-descを出力しない');

  const shiftedStart = gacha({ startAt: '2026-09-08T15:00+09:00' });
  const shiftedIssues = validateGachaData({
    root,
    gachaDb: { schemaVersion: 1, gachas: [shiftedStart] },
    typeDb,
    monsterDb: fixtureMonsters,
    cardDb: cards,
  });
  assert.deepStrictEqual(shiftedIssues, []);
  pass(32, 'publishedはgachaIdの日付部とstartAtがずれていても他の検査を満たせば受理');

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

for (const [number, label, source] of [
  [21, 'STARTが無い', '<!-- GACHA:X:END -->'],
  [22, 'ENDが無い', '<!-- GACHA:X:START -->'],
  [23, 'STARTとENDの順序が逆', '<!-- GACHA:X:END -->\n<!-- GACHA:X:START -->'],
  [24, '同じマーカーが2組ある', '<!-- GACHA:X:START -->\n<!-- GACHA:X:END -->\n<!-- GACHA:X:START -->\n<!-- GACHA:X:END -->'],
]) {
  assert.throws(() => replaceMarkerBlock(source, 'X', 'new', 'html', 'fixture.html'), /fixture\.html.*GACHA:X/);
  console.log(`PASS 破壊${number}: ${label} → replaceMarkerBlockがthrow`);
}

{
  const verifySource = fs.readFileSync(path.join(repo, 'scripts/verify.js'), 'utf8');
  const verifier = verifySource.match(/function gachaBuildPostprocessIssues\(buildSource\) \{[\s\S]*?\n\}/);
  assert(verifier, 'verify.jsのカード後処理検査を抽出できない');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${verifier[0]}; this.check = gachaBuildPostprocessIssues;`, context);
  const brokenBuild = "function integrateCardGachaAppearances(cardId) { return fs.readFileSync('cards/' + cardId + '.html'); }";
  const postprocessIssues = context.check(brokenBuild);
  assert(postprocessIssues.some(issue => /後処理差し込み/.test(issue)));
  assert(postprocessIssues.some(issue => /cards\/\*\.html/.test(issue)));
  console.log(`PASS 破壊25: build.jsへのカード後処理差し込み復活を検査17が拒否 → ${postprocessIssues.join(' / ')}`);
}

console.log('OK 正常32件PASS・破壊15件すべて拒否');
