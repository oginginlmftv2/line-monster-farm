#!/usr/bin/env node

const assert = require('assert');
const { renderAssistIndex } = require('./build-assist-pages');

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

console.log('assist一覧生成テスト: 6ケース PASS');
