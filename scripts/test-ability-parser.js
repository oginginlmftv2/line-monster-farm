#!/usr/bin/env node
/** 能力説明文パーサの確認。合意したルール（docs/ability-scoring-design.md）を固定する。 */

const assert = require('assert');
const p = require('../src/lib/ability-parser');

const parse = (name, description) => p.parseAbility({ abilityId: 'test', name, description });
const atoms = line => line.effects.map(e => e.atom);

// --- 系列と評価対象（I→II、III→IV は上位のみ。II と IV は並列。序破急は3つとも）
{
  const group = p.markSuperseded([
    parse('抗えぬ宿命を追え I', 'x'), parse('抗えぬ宿命を追え II', 'x'),
    parse('抗えぬ宿命を追え III', 'x'), parse('抗えぬ宿命を追え IV', 'x'),
    parse('古代トチカのちから・序', 'x'), parse('古代トチカのちから・破', 'x'), parse('古代トチカのちから・急', 'x'),
    parse('単発能力', 'x'), parse('二段目だけ II', 'x'),
  ]);
  const by = Object.fromEntries(group.map(g => [g.name, g.superseded]));
  assert.deepStrictEqual(by, {
    '抗えぬ宿命を追え I': true, '抗えぬ宿命を追え II': false, '抗えぬ宿命を追え III': true, '抗えぬ宿命を追え IV': false,
    '古代トチカのちから・序': false, '古代トチカのちから・破': false, '古代トチカのちから・急': false,
    '単発能力': false, '二段目だけ II': false,
  });
}

// --- 適用条件（hard）：自身オーラ／モン類／血統、または・かつ
{
  assert.deepStrictEqual(p.classifyBracket('自身赤'), { kind: 'apply', value: { aura: ['赤'], mon: [], blood: [], op: null, raw: '自身赤' } });
  assert.deepStrictEqual(p.classifyBracket('怪物').value.mon, ['怪物']);
  const or = p.classifyBracket('自身赤または主血統ガリ').value;
  assert.deepStrictEqual([or.aura, or.blood, or.op], [['赤'], ['ガリ'], 'or']);
  const or2 = p.classifyBracket('青またはアーク種').value;
  assert.deepStrictEqual([or2.aura, or2.blood, or2.op], [['青'], ['アーク'], 'or']);
  assert.strictEqual(p.classifyBracket('相手黒').kind, 'opponent', '相手依存は適用条件ではない');
  assert.strictEqual(p.classifyBracket('序盤').kind, 'time');
  assert.strictEqual(p.classifyBracket('雪山').kind, 'terrain');
  assert.strictEqual(p.classifyBracket('強撃Lv1').kind, 'grant', '付与バフは条件ではない');
  assert.strictEqual(p.classifyBracket('被ダメ-20%<20秒>').kind, 'grant');
}

// --- 例題：抗えぬ宿命を追え II（ユーザー確認済みの読み）
{
  const a = parse('抗えぬ宿命を追え II', '[青またはアーク種]＜かしこさ＞技命中時、次の効果を発動<br>・ちからの＜２０％＞をかしこさに加算<br>・かしこさ＜１０％＞で＜１回＞追撃<br>・[有利]の時、[被ダメ－２０％＜２０秒＞]を付与＜１回＞');
  assert.deepStrictEqual(a.apply.aura, ['青']);
  assert.deepStrictEqual(a.apply.blood, ['アーク']);
  assert.strictEqual(a.lines[0].trigger, '技命中時');
  assert.strictEqual(a.lines[0].skillCond.type, 'かしこさ');
  assert.deepStrictEqual(atoms(a.lines[1]), ['ステ変換']);
  assert.strictEqual(a.lines[1].effects[0].value, 20);
  // ＜1回＞が追撃に隣接 → ヒット数（毎回）。回数制限ではない
  assert.deepStrictEqual(atoms(a.lines[2]), ['追撃']);
  assert.strictEqual(a.lines[2].effects[0].value, 10);
  assert.strictEqual(a.lines[2].hits, 1);
  assert.strictEqual(a.lines[2].limit, undefined);
  // 行末の＜1回＞ → 試合中1回。付与バフの中身も原子として取れる
  assert.strictEqual(a.lines[3].limit, 1);
  assert.deepStrictEqual(a.lines[3].conditions.stance, ['有利']);
  assert.deepStrictEqual(atoms(a.lines[3]), ['被ダメ低下']);
  assert.strictEqual(a.lines[3].effects[0].granted, true);
  assert.strictEqual(a.lines[3].effects[0].duration, 20);
  assert.strictEqual(a.status, 'full', JSON.stringify(a.lines.map(l => l.residual)));
}

// --- 「追撃を＜1回＞与える」もヒット数（合意済み）
{
  const a = parse('スプーキーチェイサー II', '・丈夫さ＜１０％＞の追撃を＜１回＞与える');
  assert.strictEqual(a.lines[0].hits, 1);
  assert.strictEqual(a.lines[0].limit, undefined);
  const b = parse('モノダスチェイサー II', '・かしこさステの＜５％＞で追撃＜３回＞');
  assert.strictEqual(b.lines[0].hits, 3);
  const c = parse('重撃', '[魔族]ちから技命中時、連撃Lv1×1回');
  assert.strictEqual(c.lines[0].hits, 1);
  assert.deepStrictEqual(atoms(c.lines[0]), ['連撃']);
}

// --- 行末の＜N回＞は発動回数制限、秒数は継続
{
  const a = parse('x', '[前半]＜白＞技命中時、【シールド】を破壊＜１回＞');
  assert.strictEqual(a.lines[0].limit, 1);
  assert.deepStrictEqual(atoms(a.lines[0]), ['シールド破壊']);
  assert.strictEqual(a.lines[0].skillCond.aura, '白');
  // 「、さらに」の後ろは別の行（後ろの条件が前の効果にかからない。前の条件は ability-score.js が引き継ぐ）
  const b = parse('x', '完全回避Lv2＜１回＞、さらに被ダメブロックLv2＜２０秒＞＜１回＞');
  assert.strictEqual(b.lines.length, 2);
  assert.strictEqual(b.lines[0].limit, 1);
  assert.deepStrictEqual(atoms(b.lines[0]), ['完全回避']);
  assert.ok(/^さらに/.test(b.lines[1].raw));
  assert.strictEqual(b.lines[1].limit, 1);
  assert.strictEqual(b.lines[1].duration, 20);
  assert.deepStrictEqual(atoms(b.lines[1]), ['被ダメブロック']);
}

// --- 技条件（soft）：＜赤＞技は適用条件ではなく skillCond
{
  const a = parse('x', '＜オーラ赤＞技命中時、展開中のシールドを破壊＜１回＞');
  assert.strictEqual(a.apply, null);
  assert.strictEqual(a.lines[0].skillCond.aura, '赤');
  const b = parse('x', '[自身青] R4以上のオーラ技発動時、次の効果が発動');
  assert.strictEqual(b.lines[0].skillCond.rank, 4);
  assert.strictEqual(b.lines[0].trigger, '技発動時');
}

// --- ステ上昇は stats で大分類が決まる
{
  const a = parse('x', '[魔族]回避ステータスを３％上昇');
  assert.deepStrictEqual(atoms(a.lines[0]), ['ステ上昇']);
  assert.deepStrictEqual(a.lines[0].effects[0].stats, ['回避']);
  assert.deepStrictEqual(p.categoriesOf(a), ['回避・防御']);
  const b = parse('x', 'ライフを除く全ステータスを１０％上昇');
  assert.deepStrictEqual(p.categoriesOf(b).sort(), ['命中', '回避・防御', '火力']);
  const c = parse('x', '[自身黒][序盤]ライフの１０％を攻撃ステータスに加算');
  assert.deepStrictEqual(p.categoriesOf(c), ['火力']);
}

// --- 状況条件（散文）
{
  const a = parse('x', '[自身青][序盤]相手よりかしこさが高いと、命中率上昇Lv2');
  assert.ok(a.lines[0].conditions.compare);
  assert.deepStrictEqual(a.lines[0].conditions.time, ['序盤']);
  const b = parse('x', '残りライフが少ないほど攻撃ステータス上昇＜最大２０％＞');
  assert.ok(b.lines[0].conditions.life);
  assert.strictEqual(b.lines[0].effects[0].value, 20);
}

// --- 抽出できない行は residual に残り、status が落ちる
{
  const a = parse('超本気', '[状態変化]相手ライフが少ない時、一定時間さまざま強化され、効果終了後、虚脱状態になる');
  assert.notStrictEqual(a.status, 'full');
  assert.ok(a.lines[0].residual.length > 0);
}

// --- 第2段の読み直し（2026-09-27。docs/ability-scoring-design.md 3-1）
// 仮ビルドで見つかった読み違いを1件ずつ固定する。能力追加で語彙を触るときはここが壊れないことを確かめる
{
  const line = s => p.parseLine(p.normalize(s));
  const eff = s => line(s).effects.map(e => [e.atom, e.value, e.unit]);
  // ダメージ上昇系：特殊・追撃だけ・%表記・相手に付与・自分の被ダメ上昇（デメリット）
  assert.deepStrictEqual(eff('・特殊与ダメ<+10%>'), [['与ダメ上昇', 10, '%']]);
  assert.deepStrictEqual(eff('追撃与ダメ<+25%>'), [['与ダメ上昇', 25, '%']]);
  assert.deepStrictEqual(eff('相手に被ダメ上昇8%<20秒><1回>'), [['相手被ダメ上昇', 8, '%']]);
  assert.deepStrictEqual(eff('・残りライフが多いほど被ダメージ上昇<最大40%>'), [['自身被ダメ上昇', 40, '%']]);
  // 「AとB」は両方に効く
  assert.deepStrictEqual(eff('・命中と回避ステ<+10%>').map(e => e[0]), ['ステ上昇', 'ステ上昇']);
  assert.deepStrictEqual(eff('[前半]命中率と回避率<+30%>').map(e => e[0]).sort(), ['命中率上昇', '回避率上昇']);
  assert.deepStrictEqual(eff('・[有利]クリ率とクリダメ<+8%>').map(e => e[0]).sort(), ['クリダメ上昇', 'クリ率上昇']);
  // 累積の上限は上限の値で持つ
  const passion = line('・5以上のガッツダメージを受ける度に自身の回避ステータスと丈夫さステータス＜＋１０％＞＜最大＋４０％＞');
  assert.deepStrictEqual(passion.effects.map(e => [e.stats[0], e.value]), [['回避', 40], ['丈夫さ', 40]]);
  assert.deepStrictEqual(passion.conditions.stack, ['度に']);
  // 適用条件が並ぶと「かつ」、直前が「相手」なら相手の条件
  const both = line('[無機][自身黒]バトル開始時、次の効果を発動');
  assert.strictEqual(both.apply.and.length, 2);
  const rip = line('間合い適性SS以上または相手[創造]時連撃ダメージ無効');
  assert.strictEqual(rip.apply, null);
  assert.deepStrictEqual(rip.conditions.opponent, ['相手創造']);
  assert.deepStrictEqual(atoms(rip), ['無効化・解除']);
  // 相手<オーラ緑>技は相手の技の色（自分の技条件ではない）
  const rose = line('[序盤]相手<オーラ緑>技発動後、回避25%分の【シールド】を展開する<20秒><1回>');
  assert.strictEqual(rose.skillCond.aura, undefined);
  assert.ok(rose.conditions.opponentAura);
  // 「最大ライフ<20%>以上の被ダメ軽減」はライフ条件ではなく被ダメカット
  const cut = line('・[前半]最大ライフ<20%>以上の被ダメ軽減');
  assert.strictEqual(cut.conditions.life, undefined);
  assert.deepStrictEqual(eff('・[前半]最大ライフ<20%>以上の被ダメ軽減'), [['被ダメ低下', 20, '%']]);
  // 見出しのトリガーが2つ：先が見出しの効果、後ろが後続行
  const lupinus = line('[自身緑または獣族]バトル開始時、回避ステ<+400>、技回避時、次の効果');
  assert.deepStrictEqual([lupinus.trigger, lupinus.childTrigger], ['バトル開始時', '回避時']);
  // 一定時間は20秒、相手技命中時は被ダメ時
  assert.strictEqual(line('[状態変化]優勢のとき、一定時間回避率と被ダメが上昇し消費ガッツが低下').duration, 20);
  assert.strictEqual(line('[自身黄]相手技命中時、次の技にちからステータスの10%の追撃ダメージ').trigger, '被ダメ時');
  // 段階・ランダム・相手の行動不能・間合い適性に応じて
  assert.deepStrictEqual(line('・3回：自身に[完全回避Lv4]').conditions.stage, ['3回：']);
  assert.ok(line('[自身白]<白>技発動時、自身に次の効果をランダムで付与<3回>').conditions.random);
  assert.ok(line('[怪物]相手が技使用・移動のいずれか不可の時、次の効果').conditions.opponentDisabled);
  assert.strictEqual(line('[自身黒][序盤]間合い適性に応じて最大ライフの割合で特殊ダメージカット').skillCond.aptitude, 'S以上');
  // 1つのステを複数のステへ加算、自身のステ低下はデメリット
  assert.deepStrictEqual(eff('・自身の丈夫さステ<-20%>'), [['自身ステ低下', 20, '%']]);
  assert.deepStrictEqual(atoms(line('・丈夫さステの<13%>をちから、かしこさ、命中、回避ステに加算')), ['ステ変換']);
  // 「攻撃ステ上昇<最大+40%>」の短い書き方（威力全開）
  assert.deepStrictEqual(eff('・バトル中の技の発動回数に応じて攻撃ステ上昇<最大+40%>'), [['ステ上昇', 40, '%']]);
  // 「、さらに」「>さらに」は別の行
  assert.strictEqual(parse('x', '回避25%分の【シールド】を展開する<20秒><1回>さらに自身[有利]の時、その技に対し完全回避Lv2<1回>').lines.length, 2);
}

console.log('test-ability-parser: OK');
