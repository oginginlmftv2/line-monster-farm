#!/usr/bin/env node

const assert = require('assert');
const { renderAssistIndex, validateAptitudes, summaryScores } = require('./build-assist-pages');

const cards = [
  { cardId: 'a-MR-one', name: '新しい&名前', rarity: 'MR', image: 'assist-cards/a-MR-one.jpg' },
  { cardId: 'b-SSR-two', name: 'カードB', rarity: 'SSR', image: 'assist-cards/b-SSR-two.png' },
  { cardId: 'c-MR-three', name: '<カードC>', rarity: 'MR', image: 'assist-cards/c-MR-three.webp' },
];

const source = `<main>
<!-- ASSIST_CARD_LIST:START -->
    <a class="card" data-rarity="MR" href="cards/b-SSR-two.html">古いB</a>
    <a class="card" data-rarity="SSR" href="cards/a-MR-one.html">古いA</a>
    <!-- ASSIST_CARD_LIST:END -->
</main>\n`;

const rendered = renderAssistIndex(source, cards);
const positions = ['b-SSR-two', 'a-MR-one', 'c-MR-three'].map(id => rendered.indexOf(`cards/${id}.html`));
assert(positions.every(position => position >= 0), 'DBの全カードを一覧へ生成する');
assert(positions[0] < positions[1] && positions[1] < positions[2], '実装日が無いカードは既存順を維持し新規カードを末尾へ追加する');
assert(rendered.includes('data-rarity="SSR" href="cards/b-SSR-two.html"'), 'DBのレアリティで既存カードを更新する');
assert(rendered.includes('src="assist-cards/b-SSR-two.png"'), 'DBの画像で既存カードを更新する');
assert(rendered.includes('新しい&amp;名前'), 'カード名をHTMLエスケープする');
assert(rendered.includes('&lt;カードC&gt;'), '追加カードもHTMLエスケープする');
assert.strictEqual((rendered.match(/ASSIST_CARD_LIST:START/g) || []).length, 1, '開始マーカーは保持する');
assert.strictEqual((rendered.match(/ASSIST_CARD_LIST:END/g) || []).length, 1, '終了マーカーは保持する');
console.log('PASS assist一覧: 実装日なしなら既存順を維持し、DB値更新と新規カード末尾追加を行う');

assert.throws(
  () => renderAssistIndex('<main></main>', cards),
  /カード一覧マーカーがありません/,
  'マーカー欠落を拒否する',
);
console.log('PASS assist一覧: マーカー欠落を拒否する');

assert.throws(
  () => renderAssistIndex(source.replace('<!-- ASSIST_CARD_LIST:END -->', '<!-- ASSIST_CARD_LIST:START --><!-- ASSIST_CARD_LIST:END -->'), cards),
  /カード一覧マーカーが重複しています/,
  'マーカー重複を拒否する',
);
console.log('PASS assist一覧: マーカー重複を拒否する');

assert.throws(
  () => renderAssistIndex(source.replace('cards/a-MR-one.html', 'cards/unknown.html'), cards),
  /DB未登録のcardId/,
  'DB未登録カードを拒否する',
);
console.log('PASS assist一覧: DB未登録カードを拒否する');

assert.throws(
  () => renderAssistIndex(source.replace('cards/a-MR-one.html', 'cards/b-SSR-two.html'), cards),
  /cardId重複/,
  '一覧内の重複カードを拒否する',
);
console.log('PASS assist一覧: 重複カードを拒否する');

// 実装日の新しい順に並べ、未設定カードは直前カードの位置を保つ
const datedCards = [
  { cardId: 'n1-MR-new', name: '未設定の新カード', rarity: 'MR', image: 'assist-cards/n1-MR-new.jpg' },
  { cardId: 'd1-MR-old', name: '古い', rarity: 'MR', image: 'assist-cards/d1-MR-old.jpg', releasedAt: '2025/01/31' },
  { cardId: 'd2-MR-mid', name: '中間', rarity: 'MR', image: 'assist-cards/d2-MR-mid.jpg', releasedAt: '2026-03-14' },
  { cardId: 'd3-MR-sub', name: '中間の未設定', rarity: 'MR', image: 'assist-cards/d3-MR-sub.jpg' },
  { cardId: 'd4-MR-newest', name: '最新', rarity: 'MR', image: 'assist-cards/d4-MR-newest.jpg', releasedAt: '2026/08/31' },
];
const datedSource = `<main>
<!-- ASSIST_CARD_LIST:START -->
    <a class="card" data-rarity="MR" href="cards/n1-MR-new.html">未設定</a>
    <a class="card" data-rarity="MR" href="cards/d1-MR-old.html">古い</a>
    <a class="card" data-rarity="MR" href="cards/d2-MR-mid.html">中間</a>
    <a class="card" data-rarity="MR" href="cards/d3-MR-sub.html">中間の未設定</a>
    <a class="card" data-rarity="MR" href="cards/d4-MR-newest.html">最新</a>
    <!-- ASSIST_CARD_LIST:END -->
</main>\n`;
const datedRendered = renderAssistIndex(datedSource, datedCards);
const datedOrder = [...datedRendered.matchAll(/href="cards\/([A-Za-z0-9._-]+)\.html"/g)].map(match => match[1]);
assert.deepStrictEqual(
  datedOrder,
  ['n1-MR-new', 'd4-MR-newest', 'd2-MR-mid', 'd3-MR-sub', 'd1-MR-old'],
  '実装日の新しい順に並べ、未設定カードは直前カードへ追従する',
);
console.log('PASS assist一覧: 実装日の新しい順に並べ替える');

// 評価と距離・地形をdata属性へ埋め込む（Firestoreや旧cards-data.jsを実行時に読まない）
const ratedCards = [
  { cardId: 'r1-MR-full', name: '全項目', rarity: 'MR', image: 'assist-cards/r1-MR-full.jpg',
    ratings: { ikusei: 3, karyo: 1.5, battle: 1.2, ta: 1.1 } },
  { cardId: 'r2-MR-partial', name: '一部null', rarity: 'MR', image: 'assist-cards/r2-MR-partial.jpg',
    ratings: { ikusei: 4, karyo: null, battle: 2.5, ta: null } },
  { cardId: 'r3-MR-none', name: '未評価', rarity: 'MR', image: 'assist-cards/r3-MR-none.jpg', ratings: null },
];
const ratedAptitudes = {
  'r1-MR-full': { dist: '零距離' },
  'r2-MR-partial': { terrain: ['海岸', '砂漠'] },
};
const ratedSource = `<main>
<!-- ASSIST_CARD_LIST:START -->
    <!-- ASSIST_CARD_LIST:END -->
</main>\n`;
const ratedRendered = renderAssistIndex(ratedSource, ratedCards, ratedAptitudes);
assert.deepStrictEqual(summaryScores(ratedCards[0]).sogo, 1.7, '総合評価は4項目平均の小数1桁切り捨て');
assert.deepStrictEqual(summaryScores(ratedCards[0]).itti, 1.9, '一致評価は他オーラモン類を除く3項目平均');
assert(ratedRendered.includes('data-score="1.7" data-dist="零距離" href="cards/r1-MR-full.html"'), '総合評価と距離をdata属性へ埋め込む');
assert(ratedRendered.includes('総合評価 <span class="score-val">1.7</span>') && ratedRendered.includes('一致評価 <span class="itti-val">1.9</span>'), '評価を静的に表示する');
assert(ratedRendered.includes('data-score="3.2" data-terrain="海岸 砂漠" href="cards/r2-MR-partial.html"'), 'nullの項目は平均から除き、地形は空白区切りで埋め込む');
assert(ratedRendered.includes('<a class="card" data-rarity="MR" href="cards/r3-MR-none.html">'), '未評価・未登録のカードにはdata属性を付けない');
assert((ratedRendered.match(/<span class="score-val">-<\/span>/g) || []).length === 1, '未評価カードは「-」表示');
assert(ratedRendered.includes('<span class="rarity rarity-MR">MR</span><span class="card-name">全項目</span>'), 'レアリティ＋カード名を1行で生成する');
console.log('PASS assist一覧: 評価と距離・地形をdata属性へ埋め込む');

const cardById = new Map(ratedCards.map(card => [card.cardId, card]));
assert.throws(() => validateAptitudes({ schemaVersion: 1, cards: { 'zz-MR-unknown': { dist: '零距離' } } }, cardById), /DB未登録のcardId/, 'DB未登録の適性を拒否する');
assert.throws(() => validateAptitudes({ schemaVersion: 1, cards: { 'r1-MR-full': { dist: '超距離' } } }, cardById), /距離が不正/, '不正な距離を拒否する');
assert.throws(() => validateAptitudes({ schemaVersion: 1, cards: { 'r1-MR-full': { terrain: '海岸' } } }, cardById), /地形が不正/, '配列でない地形を拒否する');
assert.throws(() => validateAptitudes({ schemaVersion: 2, cards: {} }, cardById), /schemaVersion 1/, 'schemaVersion違いを拒否する');
console.log('PASS assist一覧: 適性JSONの不正値を拒否する');

console.log('assist一覧生成テスト: 8ケース PASS');
