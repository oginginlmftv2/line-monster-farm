#!/usr/bin/env node
/**
 * 能力評価式の確認（P15-4b 第2段）。管理者と合意した値と強弱の関係（docs/ability-scoring-design.md 3-1）を固定する。
 * 説明文は実データを写した架空の能力で持つ。CMSで説明文が直っても、このテストは壊れない。
 */

const assert = require('assert');
const parser = require('../src/lib/ability-parser');
const { createScorer, computeAbilityScores } = require('../src/lib/ability-score');
const rubric = require('../src/data/ability-rubric.json');

const scorer = createScorer(rubric);
const power = (description, name = 'x', ctx) => scorer.scoreAbility(parser.parseAbility({ abilityId: 'test', name, description }), ctx).power;
const close = (actual, expected, tol = 0.15) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} ≠ ${expected}`);

// --- 物差し：与ダメ上昇Lv1＝1点、1Lv＝1.8%
close(power('与ダメ上昇Lv5'), 5);
close(power('与ダメ上昇<+18%>'), 10);
assert.ok(power('特殊与ダメ上昇Lv5') > power('与ダメ上昇Lv5'), '特殊与ダメは追撃・連撃にも効く');
assert.ok(power('追撃与ダメ<+18%>') < power('与ダメ上昇<+18%>'), '追撃だけは同じ%でも弱い');
close(power('被ダメ低下Lv5'), 5 * rubric.coefficients.defense, 0.05); // 防御は1.5倍
close(power('相手の被ダメ上昇Lv5'), 5);

// --- 命中・回避：M＝1.5。確定（必中・完全回避）は常時の命中率より強く、完全回避は必中の1.5倍
const hit1 = power('次の技が必中Lv1<1回>');
const evade2 = power('完全回避Lv2<1回>');
close(hit1, rubric.coefficients.decisive, 0.5);
assert.ok(evade2 > hit1 * 1.5, '完全回避は必中より強い');
assert.ok(hit1 > power('命中率<+30%>'), '必中1回は常時の命中率+30%より強い');
// 回数の付かない必中は3発で頭打ち。「さらに」の最後の<1回>は効果全体にかかる（俺が仕留める II：最大2発）
assert.ok(power('技発動時、発動技と次の技が必中Lv1') <= rubric.coefficients.decisive * 3 * 0.9 + 0.1);
close(power('技発動時、発動技と次の技が必中Lv1<br>さらにクリティカル発生時、攻撃ステータス10%上昇<1回>'), rubric.coefficients.decisive * 2 * 0.9, 1);
// 「発動技の必中をLv3に上昇」は2本目の必中ではない
const okawari = '技発動時、次の効果が発動<br>・発動技と次の技が必中Lv1<br>・発動技の必中をLv3に上昇';
assert.ok(power(okawari) < power('技発動時、次の効果が発動<br>・発動技と次の技が必中Lv1') * 1.5);

// --- ステ：+100で命中率3%、上げ幅が大きいほど反る。重ねがけは序の全ステ+5%より強い
const jo = power('バトル開始時、次の効果発動<br>・ライフ以外のステータス<+5%>');
const berserk = power('[自身黄または無機]オーラ技命中時、次の効果付与<3回><br>・自身の丈夫さステ<-20%><br>・丈夫さステの<13%>をちから、かしこさ、命中、回避ステに加算<br>・[有利]クリ率とクリダメ<+8%>');
const passion = power('[自身赤]バトル中、次の効果<br>・５以上のガッツダメージを受ける度に自身の回避ステータスと丈夫さステータス＜＋１０％＞＜最大＋４０％＞');
assert.ok(jo < 15, `序の全ステ+5%は弱い: ${jo}`);
assert.ok(berserk > jo * 2 && passion > jo * 2, '重ねがけ・累積は序より強い');

// --- 被ダメカットと条件の範囲：リッピーカット II ＞ リッピーゾーン II
const cutAbility = '[無機][前半]ライフ30%以上、かつ適性S以上の間合いでオーラ技を受けた時、最大ライフ30%以上の被ダメカット、さらに間合い適性SS以上または相手[創造]時連撃ダメージ無効';
const zone = '[無機]残りライフ50%未満で<前衛>技発動時、発動技と次の技が必中Lv1<1回>';
assert.ok(power(cutAbility) > power(zone), 'リッピーカットはリッピーゾーンより強い');

// --- 状態変化：一定時間は20秒。超余裕は超逆上より強く、超逆上は回避低下で0点
const yoyu = power('[状態変化]優勢のとき、一定時間回避率と被ダメが上昇し消費ガッツが低下', '超余裕');
const gyakujo = power('[状態変化]ガッツダメを受けたとき稀に発動し、一定時間ガッツダメ大上昇、ガッツ速度大上昇、回避低下', '超逆上');
assert.strictEqual(gyakujo, 0);
assert.ok(yoyu > gyakujo);

// --- 付与：秒数の無い付与は試合中ずっと続く。装甲はブロックの減り方を平均する
assert.ok(power('[自身黄]次の効果付与<1回><br>・[装甲Lv5（ブロック<-75%>、技を受けた時<15%>ずつ減少）]') > 40, 'ロボトルファイト！IV の装甲は強い');
assert.ok(power('R4以上のオーラ技発動時、次の効果が発動<br>・発動技と同じオーラ種の技性能<40%>上昇を付与<各オーラ種毎に1回>') > 30, '俺は喰らう者だ IV');

// --- 条件：相手の技の色は相手の条件、ランダム付与は割る、段階は段ごとに割り引く
assert.ok(power('[序盤]相手<オーラ緑>技発動後、完全回避Lv2<1回>') < power('[序盤]<オーラ緑>技発動時、完全回避Lv2<1回>'));
// 巫女の占い：3つのうち1つを3回引く＝必中は平均1回。3つ全部が付く扱いにはしない
const miko = power('<白>技発動時、自身に次の効果をランダムで付与<3回><br>強撃Lv2<20秒><br>必中Lv1<1回><br>ブロックLv4<20秒>');
const single = power('<白>技発動時、必中Lv1<1回>');
assert.ok(miko >= single && miko < single * 1.5, `ランダム付与 ${miko} / 必中1回 ${single}`);
assert.ok(power('技を回避した回数に応じて次の効果を付与<各1回><br>・3回：自身に[完全回避Lv4]') < power('技を回避した回数に応じて次の効果を付与<各1回><br>・1回：自身に[完全回避Lv4]'));
// ライフ条件はしきい値で分ける
assert.ok(power('ライフ10%以下で、完全回避Lv2<1回>') < power('ライフ30%以下で、完全回避Lv2<1回>'));

// --- 体ごと：技の色の割合、間合い適性（開始時の値）から届く見込み、B以上の間合いの数
const auraSkill = '<緑>技発動時、完全回避Lv2<1回>';
assert.ok(power(auraSkill, 'x', { auraShare: () => 0.2 }) < power(auraSkill, 'x', { auraShare: () => 0.8 }));
const apt = '適性S以上の間合いで技を受けた時、最大ライフ30%以上の被ダメカット';
assert.ok(power(apt, 'x', { bestRange: 'C', rangeCount: 2 }) < power(apt, 'x', { bestRange: 'B', rangeCount: 2 }), 'Cは届きにくい');
assert.ok(power(apt, 'x', { bestRange: 'B', rangeCount: 1 }) < power(apt, 'x', { bestRange: 'B', rangeCount: 2 }), '1方向だけは割り引く');
close(power(apt, 'x', { bestRange: 'B', rangeCount: 2 }), power(apt, 'x', { bestRange: 'B', rangeCount: 4 }), 0.01);

// --- 集計：同名・同説明は1種、Tier境界は全体の上位10/25/50%
{
  const abilities = [
    { abilityId: 'ab-9001', name: '超根性', description: '[状態変化]残りライフが少ないときに稀に効果発動<br>・通常/追撃/連撃ダメージを受けたときライフ1で耐える<1回>', source: 'イベント' },
    { abilityId: 'ab-9002', name: '超根性', description: '[状態変化]残りライフが少ないときに稀に効果発動・通常/追撃/連撃ダメージを受けたときライフ1で耐える＜１回＞', source: 'イベント' },
    ...Array.from({ length: 18 }, (_, i) => ({ abilityId: `ab-91${String(i).padStart(2, '0')}`, name: `与ダメ${i}`, description: `与ダメ上昇Lv${i + 1}`, source: '閃き' })),
  ];
  const { rows, groups, cut } = computeAbilityScores({ abilities, cards: [], rubric, parser });
  assert.strictEqual(rows.length, 20);
  assert.strictEqual(groups, 19, '超根性の2件は1種');
  assert.ok(cut[1] >= cut[2] && cut[2] >= cut[3]);
  for (const row of rows) assert.ok([1, 2, 3, 4].includes(row.tier));
  assert.ok(rows.every(row => row.reviewed === (row.abilityId <= rubric.review.reviewedThroughAbilityId)));
}

console.log('test-ability-score: OK');
