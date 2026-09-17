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
  const b = parse('x', '完全回避Lv2＜１回＞、さらに被ダメブロックLv2＜２０秒＞＜１回＞');
  assert.strictEqual(b.lines[0].limit, 1);
  assert.strictEqual(b.lines[0].duration, 20);
  assert.deepStrictEqual(atoms(b.lines[0]).sort(), ['完全回避', '被ダメブロック']);
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

console.log('test-ability-parser: OK');
