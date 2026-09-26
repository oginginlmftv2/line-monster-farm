'use strict';
/**
 * モンスター詳細ページの「相性のいいアシスト能力」を選ぶ（P15-4b 描画。build-spec 5-12）。
 *
 * 選び方の正は docs/ability-scoring-design.md 5-3。
 *   - 載せるのはアシストのイベントで獲得できる能力（source＝イベント）。閃き・EXトレ・状態変化は載せない
 *   - その体が使える能力だけ：適用条件はオーラ・モン類・主血統（サブ血統を見る能力は無い）。能力全体の条件で判定したうえで、
 *     行ごとの条件（料理人 II の [自身黒]必中 など）が合わない行は点に入れない。
 *     技条件は技DBがあれば実際の技の色・種類・間合い、無ければオーラ一致で代用
 *   - 点はその体に合わせて出し直す（技の色の割合、基礎データの間合い適性からS以上に届く見込み）
 *   - 点の上位 LIMIT 件を選び、番号は振らずに発売が新しい順に並べる（点と順位はページに出さない）
 */

const LIMIT = 5;
const RANK_ORDER = ['M', 'SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
// 育成でSに届く間合い適性（開始時の値）。C も秘伝・育成の書・イベントで届く（2026-09-27 管理者確認）
const REACH_S = new Set(['M', 'SS', 'S', 'A', 'B', 'C']);

/** 適用条件（[自身赤]・[怪物]・[主血統ガリ]・[モノリス種]）。血統は主血統だけを見る */
function applyMatches(apply, monster) {
  if (!apply) return true;
  if (apply.and) return apply.and.every(group => applyMatches(group, monster));
  const hits = [
    ...apply.aura.map(aura => monster.aura === aura),
    ...apply.mon.map(mon => monster.mon === mon),
    ...apply.blood.map(blood => monster.blood === blood),
  ];
  if (!hits.length) return true;
  return apply.op === 'and' ? hits.every(Boolean) : hits.some(Boolean);
}

/** 技条件（＜緑＞技・ちから技・零距離技）。技DBがあれば実際の技、無ければオーラ一致で代用 */
function skillMatches(parsed, monster, ownSkills) {
  const first = parsed.lines.find(line => line.effects.length || /次の効果|以下の効果/.test(line.raw)) || parsed.lines[0];
  const cond = first ? first.skillCond : {};
  if (cond.aura) {
    const colors = cond.aura.split('または');
    const ok = ownSkills.length
      ? ownSkills.some(skill => colors.includes(skill.aura) || (colors.includes('無') && !skill.aura))
      : colors.includes(monster.aura) || colors.includes('無');
    if (!ok) return false;
  }
  if (cond.type && ownSkills.length && !ownSkills.some(skill => skill.skillType === cond.type)) return false;
  if (cond.range && ownSkills.length && !ownSkills.some(skill => skill.range === cond.range[0])) return false;
  return true;
}

const isStateChange = parsed => parsed.lines.some(line => (line.conditions.state || []).includes('状態変化'));

/** ability-score.js の scoreAbility に渡す、その体の事情 */
function monsterContext(ownSkills, basicsEntry) {
  const ctx = {};
  if (ownSkills.length) {
    ctx.auraShare = colors => {
      const list = colors.split('または');
      return ownSkills.filter(skill => list.includes(skill.aura) || (list.includes('無') && !skill.aura)).length / ownSkills.length;
    };
  }
  if (basicsEntry && basicsEntry.range) {
    const ranks = Object.values(basicsEntry.range);
    ctx.bestRange = [...ranks].sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))[0];
    ctx.rangeCount = ranks.filter(rank => REACH_S.has(rank)).length;
  }
  return ctx;
}

/**
 * @param monster      monster-ids.json の1体（aura・mon・blood・id）
 * @param ownSkills    その体が使える技（血統の共通技＋自分の固有技）。技DBが無い血統は []
 * @param basicsEntry  monster-basics.json の1体（無ければ null）
 * @param scoreRows    ability-scores.json の abilities（点の高い順）
 * @param abilityById  abilityId → assist-abilities.json の1件
 * @param cardById     cardId → assist-cards.json の1枚
 */
function recommendAbilities({ monster, ownSkills, basicsEntry, scoreRows, abilityById, cardById, scorer, parser, limit = LIMIT }) {
  const ctx = monsterContext(ownSkills, basicsEntry);
  const seen = new Set();
  const candidates = [];
  for (const row of scoreRows) {
    if (row.source !== 'イベント' || row.power == null || seen.has(row.group)) continue;
    seen.add(row.group);
    const ability = abilityById.get(row.abilityId);
    if (!ability) continue;
    const parsed = parser.parseAbility(ability);
    if (isStateChange(parsed)) continue;
    // 能力全体の適用条件（先頭に出る条件）で使えるかを決め、そのうえで行ごとの条件が合わない行は点に入れない
    // （料理人 II：怪物なら使えるが、必中の行は自身黒だけ）
    if (!applyMatches(parsed.apply, monster) || !skillMatches(parsed, monster, ownSkills)) continue;
    const power = scorer.scoreAbility(parsed, { ...ctx, applyMatches: apply => applyMatches(apply, monster) }).power;
    if (!(power > 0)) continue;
    const card = row.cardId ? cardById.get(row.cardId) || null : null;
    candidates.push({
      abilityId: row.abilityId,
      name: ability.name,
      description: parser.normalize(ability.description),
      categories: row.categories,
      card,
      releasedAt: card && card.releasedAt ? card.releasedAt : null,
      power,
    });
  }
  // 点の上位から選び、表示は発売が新しい順（発売日の無いものは後ろ。同じ日は abilityId の新しい順）
  return candidates
    .sort((a, b) => b.power - a.power || a.abilityId.localeCompare(b.abilityId))
    .slice(0, limit)
    .sort((a, b) => String(b.releasedAt || '').localeCompare(String(a.releasedAt || '')) || b.abilityId.localeCompare(a.abilityId));
}

module.exports = { LIMIT, recommendAbilities, applyMatches, skillMatches, monsterContext, isStateChange };
