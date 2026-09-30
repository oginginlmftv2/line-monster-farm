#!/usr/bin/env node
/**
 * 能力評価の点検レポート（スキル ability-score-review が使う。手動実行のみ・build.js からは呼ばない）。
 *
 *   node scripts/ability-review-report.js                 … origin/main と比べて点・Tierが変わった能力＋未点検の能力
 *   node scripts/ability-review-report.js --base <ref>    … 比べる相手の git ref
 *   node scripts/ability-review-report.js ab-1263 ab-1265 … 指定した能力の内訳だけ（差分表も出す）
 *
 * 出すもの（管理者が点の妥当性を確かめるため。docs/ability-scoring-design.md 5-1）
 *   1. 点・Tierの差分表（前 → 後）
 *   2. 能力ごとに説明文の全文と採点の内訳（基礎値 × 条件の補正 × 回数・稼働率 × 累積・効果量・逓減 ＝ 点）
 * 先に node build.js を回して src/data/ability-scores.json を新しくしておくこと。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const parser = require('../src/lib/ability-parser');
const { createScorer } = require('../src/lib/ability-score');

const REPO = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8'));
const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const base = baseIdx >= 0 ? args[baseIdx + 1] : 'origin/main';
const only = args.filter((a, i) => /^ab-\d+$/.test(a) && i !== baseIdx + 1);

const rubric = readJson('src/data/ability-rubric.json');
const scorer = createScorer(rubric);
const abilities = readJson('src/data/assist-abilities.json').abilities;
const abilityById = new Map(abilities.map(a => [a.abilityId, a]));
const now = readJson('src/data/ability-scores.json');
let before = null;
try {
  before = JSON.parse(execFileSync('git', ['show', `${base}:src/data/ability-scores.json`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch (e) {
  console.error(`${base} の ability-scores.json が読めないので差分は出しません`);
}
const beforeById = new Map((before ? before.abilities : []).map(r => [r.abilityId, r]));

const fmt = n => (n == null ? '-' : Math.round(n * 100) / 100);
const tier = t => (t == null ? '-' : 'Tier' + t);
const changed = now.abilities.filter(r => {
  const b = beforeById.get(r.abilityId);
  return !b || b.power !== r.power || b.tier !== r.tier;
});

let out = '';
out += `## 点・Tierの差分（${base} → 作業中）\n\n`;
if (!changed.length) out += '変化なし\n';
else {
  const cut = c => (c ? `${c['1']}・${c['2']}・${c['3']}点` : '-');
  out += `Tier境界（1/2/3）：${cut(before && before.tierCut)} → ${cut(now.tierCut)}\n\n`;
  out += '| ID | 能力 | 出どころ | 点 | Tier |\n|---|---|---|---:|---|\n';
  // 点が同じでTier境界が動いただけのものは表に並べず、最後に1行でまとめる
  const tierOnly = changed.filter(r => { const b = beforeById.get(r.abilityId); return b && b.power === r.power; });
  for (const r of changed.filter(r => !tierOnly.includes(r))) {
    const b = beforeById.get(r.abilityId);
    out += `| ${r.abilityId} | ${r.name} | ${r.source || '-'} | ${b ? fmt(b.power) : '新規'} → ${fmt(r.power)} | ${b ? tier(b.tier) : '-'} → ${tier(r.tier)} |\n`;
  }
  if (tierOnly.length) out += `\n点は同じでTier境界の移動だけで動いたもの ${tierOnly.length}件：${tierOnly.map(r => `${r.name}（${tier(beforeById.get(r.abilityId).tier)}→${tier(r.tier)}）`).join('、')}\n`;
}

// 内訳を出す能力：指定があればそれだけ。無ければ未点検＋点が変わった能力（Tierだけ動いたものは除く）
const targets = only.length ? only : [...new Set([
  ...now.abilities.filter(r => !r.reviewed).map(r => r.abilityId),
  ...changed.filter(r => { const b = beforeById.get(r.abilityId); return !b || b.power !== r.power; }).map(r => r.abilityId),
])];
// 同名・同説明（超根性など）は代表の1件だけ
const seenGroup = new Set();
const rowById = new Map(now.abilities.map(r => [r.abilityId, r]));

const condText = d => {
  const list = [];
  for (const [k, v] of Object.entries(d.conditions || {})) if (v && v.length) list.push(`${k}:${v.join('・')}`);
  for (const [k, v] of Object.entries(d.skillCond || {})) if (v != null && v !== false) list.push(`技${k}:${Array.isArray(v) ? v.join('・') : v}`);
  return list.join(' / ') || 'なし';
};

out += '\n## 採点の内訳\n\n物差し：与ダメ上昇Lv1＝1点（1Lv＝1.8%）。点＝基礎値 × 補正（条件×技条件×トリガー、下限' + rubric.modifiers.floor + '）× 回数・稼働率 × 累積・効果量 × 同じ効果の逓減\n';
for (const id of targets) {
  const ability = abilityById.get(id);
  const row = rowById.get(id);
  if (!ability) continue;
  if (row && seenGroup.has(row.group)) continue;
  if (row) seenGroup.add(row.group);
  const parsed = parser.parseAbility(ability);
  const result = scorer.scoreAbility(parsed);
  const b = beforeById.get(id);
  out += `\n### ${ability.name}（${id}・${ability.source || '-'}）　${b ? fmt(b.power) + ' → ' : ''}**${fmt(result.power)}点**・${row ? tier(row.tier) : '-'}\n\n`;
  out += '```\n' + parser.normalize(ability.description) + '\n```\n\n';
  if (!result.parts.length) { out += '効果が1つも取れていない（0点）\n'; continue; }
  out += '| 効果 | 基礎値 | 条件・トリガー | 補正 | 回数・稼働率 | 累積・効果量・逓減 | 点 |\n|---|---:|---|---|---:|---|---:|\n';
  for (const p of result.parts) {
    const d = p.detail || {};
    const factor = p.penalty ? '（デメリットは補正しない）'
      : `条件${fmt(d.cond)}×技${fmt(d.skill)}×${d.trigger || 'トリガーなし'}${fmt(d.triggerMod)}${d.random !== 1 ? `×ランダム${fmt(d.random)}` : ''}${d.floored ? '（下限' + rubric.modifiers.floor + '）' : ''} ＝ ${fmt(d.factor)}`;
    const qty = `${fmt(d.qty)}（${d.kind === 'event' ? '回' : '稼働率'}${d.duration != null ? '・' + d.duration + '秒' : ''}${d.limit != null ? '・<' + (typeof d.limit === 'object' ? JSON.stringify(d.limit) : d.limit) + '回>' : ''}）`;
    const boosts = [d.stackBoost !== 1 && `累積×${fmt(d.stackBoost)}`, d.ramp !== 1 && `段階×${fmt(d.ramp)}`, d.randomDecisive !== 1 && `ランダム必中×${fmt(d.randomDecisive)}`, d.amplify !== 1 && `効果量×${fmt(d.amplify)}`, d.decay != null && d.decay !== 1 && `逓減×${d.decay}`].filter(Boolean).join(' ') || '-';
    out += `| ${p.text || p.atom}（${p.atom}） | ${fmt(d.base)} | ${condText(d)} | ${factor} | ${qty} | ${boosts} | ${fmt(p.lv)} |\n`;
  }
  out += `\n合計 **${fmt(result.power)}**\n`;
}
process.stdout.write(out);
