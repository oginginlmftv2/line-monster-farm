#!/usr/bin/env node
/**
 * モンスター詳細「相性のいいアシスト能力」の選び方の確認（build-spec 5-12・docs/ability-scoring-design.md 5-3）。
 * 能力とカードは架空のデータで持つ。CMSで説明文やカードが変わっても、このテストは壊れない。
 */

const assert = require('assert');
const parser = require('../src/lib/ability-parser');
const { createScorer } = require('../src/lib/ability-score');
const { recommendAbilities, applyMatches, LIMIT } = require('../src/lib/ability-recommend');
const rubric = require('../src/data/ability-rubric.json');

const scorer = createScorer(rubric);
let seq = 0;
const abilities = [];
const cards = [];
function add(name, description, { source = 'イベント', releasedAt = null } = {}) {
  const abilityId = `ab-${String(9000 + (++seq)).padStart(4, '0')}`;
  const cardId = releasedAt ? `test-${seq}` : null;
  abilities.push({ abilityId, name, description, source, cardId });
  if (cardId) cards.push({ cardId, name: `カード${seq}`, rarity: 'MR', releasedAt });
  return abilityId;
}
// 赤・獣族・主血統キュービの体に使えるもの／使えないもの
const redA = add('赤の必中', '[自身赤]技発動時、次の技が必中Lv1<1回>', { releasedAt: '2025/01/10' });
const beastB = add('獣族の完全回避', '[獣族]技発動時、完全回避Lv2<1回>', { releasedAt: '2026/05/01' });
const anyC = add('誰でも与ダメ', '与ダメ上昇Lv7', { releasedAt: '2026/07/01' });
const anyD = add('誰でも被ダメ低下', '被ダメ低下Lv6', { releasedAt: '2024/03/01' });
const anyE = add('誰でも命中', '命中率上昇Lv5', { releasedAt: '2025/09/01' });
const anyF = add('イベント報酬のクリ率', 'クリ率上昇Lv2');
const weakG = add('弱い与ダメ', '[終盤]与ダメ上昇Lv1<1回>', { releasedAt: '2026/08/01' });
const blue = add('青の必中', '[自身青]技発動時、次の技が必中Lv1<1回>', { releasedAt: '2026/08/01' });
const subBlood = add('サブ血統ロード', '[ロード種]完全回避Lv2<1回>', { releasedAt: '2026/08/01' });
const flash = add('閃きの完全回避', '完全回避Lv2<1回>', { source: '閃き', releasedAt: '2026/08/01' });
const state = add('超根性', '[状態変化]残りライフが少ないときに稀に効果発動<br>・通常/追撃/連撃ダメージを受けたときライフ1で耐える<1回>');
const greenSkill = add('緑技の完全回避', '<緑>技発動時、完全回避Lv2<1回>', { releasedAt: '2026/08/01' });

const { computeAbilityScores } = require('../src/lib/ability-score');
const { rows } = computeAbilityScores({ abilities, cards, rubric, parser });
const base = {
  scoreRows: rows,
  abilityById: new Map(abilities.map(a => [a.abilityId, a])),
  cardById: new Map(cards.map(c => [c.cardId, c])),
  scorer,
  parser,
};
const tamamo = { id: '9999', name: 'テスト', aura: '赤', mon: '獣族', blood: 'キュービ', subBlood: 'ロード' };

// --- 上位5件・イベントのみ・状態変化と閃きを除く・使えない能力を除く
const picked = recommendAbilities({ monster: tamamo, ownSkills: [], basicsEntry: null, ...base });
const ids = picked.map(item => item.abilityId);
assert.strictEqual(LIMIT, 5);
assert.strictEqual(picked.length, 5);
for (const excluded of [blue, subBlood, flash, state, greenSkill, weakG]) assert.ok(!ids.includes(excluded), `${excluded} は載らない`);
for (const included of [redA, beastB, anyC, anyD, anyE]) assert.ok(ids.includes(included), `${included} が載る`);
assert.ok(!ids.includes(anyF), '点の上位5件に入らないものは載らない');

// --- 表示は発売が新しい順（発売日の無いものは後ろ）
const dates = picked.map(item => item.releasedAt || '');
assert.deepStrictEqual(dates, [...dates].sort((a, b) => b.localeCompare(a)));

// --- 血統は主血統だけを見る（サブ血統を見る能力は無い）
assert.strictEqual(applyMatches(parser.parseAbility({ abilityId: 'x', name: 'x', description: '[ロード種]完全回避Lv2<1回>' }).apply, tamamo), false);
assert.strictEqual(applyMatches(parser.parseAbility({ abilityId: 'x', name: 'x', description: '[キュービ種]完全回避Lv2<1回>' }).apply, tamamo), true);
// 並んだ適用条件は「かつ」
assert.strictEqual(applyMatches(parser.parseAbility({ abilityId: 'x', name: 'x', description: '[無機][自身赤]完全回避Lv2<1回>' }).apply, tamamo), false);

// --- 技DBがあれば技の色で判定（オーラが赤でも緑の技を持っていれば緑技の条件を満たす）
const withGreen = recommendAbilities({ monster: tamamo, ownSkills: [{ aura: '緑', skillType: 'ちから', range: '近' }], basicsEntry: null, ...base, limit: 20 });
assert.ok(withGreen.some(item => item.abilityId === greenSkill), '緑の技を持つ体には緑技の能力が載る');

// --- 適用条件は行ごと（料理人 II：怪物なら使えるが、必中の行は自身黒だけ）
{
  const ryouri = parser.parseAbility({ abilityId: 'x', name: '料理人 II', description: '[怪物]<有利>技発動時、次の効果が発動<br>・クリティカル確定<br>・相手に[丈夫さ<-30%><20秒>]を付与<1回><br>・[自身黒]必中Lv1<1回>' });
  const { applyMatches: match } = require('../src/lib/ability-recommend');
  const scoreFor = monster => scorer.scoreAbility(ryouri, { applyMatches: apply => match(apply, monster) }).power;
  const blackMonster = { aura: '黒', mon: '怪物', blood: 'ゴースト' };
  const redMonster = { aura: '赤', mon: '怪物', blood: 'ゴースト' };
  const beast = { aura: '黒', mon: '獣族', blood: 'キュービ' };
  assert.ok(scoreFor(blackMonster) > scoreFor(redMonster) * 4, '必中は黒の怪物だけ');
  assert.ok(scoreFor(redMonster) > 0, '黒以外の怪物もクリ確定などは使える');
  assert.strictEqual(scoreFor(beast), 0, '怪物でなければ見出しごと使えない');
  // 評価式は行ごとに判定する（執事の心得・序：黒でなくても前半の点は入る）。ページに載せるかは能力全体の条件でも絞る
  const shitsuji = parser.parseAbility({ abilityId: 'x', name: '執事の心得・序', description: 'バトル開始時、ライフ以外のステータス<+5%><br>[自身黒]この効果中、ライフ50%以上で技発動時、[有利以外]完全回避Lv2<1回>' });
  assert.ok(scorer.scoreAbility(shitsuji, { applyMatches: apply => match(apply, redMonster) }).power > 0);
}

console.log('test-ability-recommend: OK');
