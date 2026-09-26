#!/usr/bin/env node
/**
 * 能力説明文の「読み方」を型ごとに点検する（P15-4b 第2段）。手動実行のみ（build.js からは呼ばない）。
 *
 *   node scripts/audit-ability-reading.js         … 評価対象すべて → docs/ability-reading-audit.md
 *   node scripts/audit-ability-reading.js --new   … 未点検の能力だけ（ability-rubric.json の review より後）を画面に出す
 *
 * 2026-09-27 の仮ビルドで見つかった読み違いの型を機械的に拾う。拾えるのは「読み残し」と「型にはまった書き方」だけで、
 * 読めているのに意味の取り方が違うもの（相手<オーラ緑>技を自分の技と読む等）は、上位の並びを人が見て確かめる。
 * 型の由来と直し方は docs/ability-scoring-design.md の 3-1 と 5章。
 */

const fs = require('fs');
const path = require('path');
const parser = require('../src/lib/ability-parser');
const { computeAbilityScores } = require('../src/lib/ability-score');

const REPO = path.resolve(__dirname, '..');
const OUT_DOC = 'docs/ability-reading-audit.md';
const readJson = file => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8'));

// 数値が無くても正しい（数値を持たない）原子語
const VALUELESS = new Set(['必中', '完全回避', '食いしばり', 'シールド破壊', 'クリ確定', 'クリ無効', '無効化・解除', '相手ガッツ停止', 'オーラ変貌', '封じ', 'バフ付与', 'デバフ付与']);

// 型ごとの検出。戻り値は該当した行の説明（空なら該当なし）
const CHECKS = [
  ['読めずに残った文字列', '効果のある行に3文字以上の読み残し。条件や効果を落としている可能性',
    p => p.lines.filter(l => l.effects.length && l.residual && l.residual.length >= 3).map(l => `「${l.residual}」← ${l.raw}`)],
  ['効果が1つも取れない行', '条件だけの見出し以外で原子語が0件',
    p => p.lines.filter(l => !l.effects.length && l.residual && l.residual.length >= 3 && !/次の効果|以下の効果/.test(l.raw)).map(l => `「${l.residual}」← ${l.raw}`)],
  ['「または」を含む条件', '「AまたはB」を掛け算（かつ）で割り引いている可能性',
    p => p.lines.filter(l => /または/.test(l.raw.replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>/g, '')) && (Object.keys(l.conditions).length + Object.keys(l.skillCond).length) >= 2).map(l => l.raw)],
  ['段階の書き分け', '「1回：」「S以上SS未満：」「2つ以上：」などが並ぶ。どれか1つか、全部効くか',
    p => { const t = p.lines.filter(l => /^[・\s]*(?:\d回|[SAM]+以上(?:[SAM]+未満)?|適性[^：]*|Lv\d+|\d+つ以上|[SAM]+未満)：/.test(l.raw) && l.effects.length); return t.length >= 2 ? t.map(l => l.raw) : []; }],
  ['「AとB」の片方だけ', '「命中と回避ステ」「クリ率とクリダメ」のように2つに効くのに1つしか取れていない可能性',
    p => p.lines.filter(l => /[^\s]+(?:と|＆|&)[^\s]+?<[+-]?\d+%?>/.test(l.raw) && l.effects.length === 1).map(l => l.raw)],
  ['上限・累積の読み落とし', '<最大…>・累積・重複・〜度に があるのに累積として読んでいない',
    p => p.lines.filter(l => /<最大[^>]*>|累積|重複|ごとに|度に/.test(l.raw) && !l.maxStack && !(l.conditions.stack || []).length).map(l => l.raw)],
  ['デメリットの向き', '自身の減少・消費や被ダメの増加。プラスに数えていないか',
    p => p.lines.filter(l => /自身の[^、]*(?:減少|低下|<-)|(?:消費|被ダメ)[^、]{0,6}(?:上昇|増加)/.test(l.raw) && !/相手/.test(l.raw.split(/自身の/)[1] || '')).map(l => `${l.raw} → ${l.effects.map(e => e.atom).join('・')}`)],
  ['数値が読めず既定値', '数値を持つはずの効果が null で、既定値（大上昇＝30%など）で計算されている',
    p => p.lines.flatMap(l => l.effects.filter(e => e.value == null && !VALUELESS.has(e.atom)).map(e => `${e.atom}「${e.text}」← ${l.raw}`))],
  ['付与と回数', '「付与<N回>」。秒数が無ければ試合中ずっと続く（管理者確認）。中身に秒数があるか',
    p => p.lines.filter(l => /付与/.test(l.raw) && typeof l.limit === 'number' && l.duration == null && l.effects.length).map(l => l.raw)],
  ['トリガーが2つ', '1行に「〜時」が2つ以上。片方しか読んでいない可能性',
    p => p.lines.filter(l => (l.raw.match(/発動時|命中時|受けた時|回避時|クリティカル(?:発生)?時|開始時|破壊時|したとき|した時/g) || []).length >= 2).map(l => l.raw)],
];

function main() {
  const onlyNew = process.argv.includes('--new');
  const abilities = readJson('src/data/assist-abilities.json').abilities;
  const rubric = readJson('src/data/ability-rubric.json');
  const { rows } = computeAbilityScores({ abilities, cards: readJson('src/data/assist-cards.json').cards, rubric, parser });
  const byId = new Map(abilities.map(a => [a.abilityId, a]));
  // 同名・同説明は1つにまとめ、点の高い順に順位を付ける
  const seen = new Set();
  const list = [];
  for (const row of rows) {
    if (seen.has(row.group)) continue;
    seen.add(row.group);
    if (onlyNew && row.reviewed) continue;
    list.push({ row, rank: seen.size, p: parser.parseAbility(byId.get(row.abilityId)) });
  }
  const results = CHECKS.map(([title, why, fn]) => ({
    title, why,
    hits: list.map(item => ({ item, lines: fn(item.p) })).filter(h => h.lines.length),
  }));

  if (onlyNew) {
    console.log(`未点検の能力 ${list.length}種（${rubric.review.reviewedThroughAbilityId} より後）`);
    for (const { row, rank } of list) console.log(`  ${row.abilityId} ${row.name}  ${row.power}点（${rank}位・Tier${row.tier}）`);
    for (const r of results) {
      if (!r.hits.length) continue;
      console.log(`\n■ ${r.title}（${r.hits.length}種）: ${r.why}`);
      for (const h of r.hits) console.log(`  ${h.item.row.name}\n    ${h.lines.join('\n    ')}`);
    }
    console.log('\n点検が済んだら ability-rubric.json の review.reviewedThroughAbilityId を最後の abilityId に進める');
    return;
  }

  const md = s => String(s).replace(/\|/g, '／').replace(/\n/g, ' ');
  let out = '# 能力の読み方の点検\n\n';
  out += '生成: `node scripts/audit-ability-reading.js`（手動実行）。生成物なので手で直さず、パーサか評価式を直して再生成する。\n';
  out += '型の由来は 2026-09-27 の仮ビルドで見つかった読み違い（`docs/ability-scoring-design.md` 3-1・5章）。\n';
  out += '拾えるのは読み残しと型どおりの書き方だけで、該当しても正しく読めているもの（ルールで処理済み）を含む。\n\n';
  out += '| 型 | 該当 | うち上位100位 |\n|---|---:|---:|\n';
  for (const r of results) out += `| ${r.title} | ${r.hits.length} | ${r.hits.filter(h => h.item.rank <= 100).length} |\n`;
  for (const r of results) {
    out += `\n## ${r.title}（${r.hits.length}種）\n\n${r.why}\n\n| 順位 | 点 | 能力 | 該当 |\n|---:|---:|---|---|\n`;
    for (const h of r.hits) out += `| ${h.item.rank} | ${h.item.row.power ?? '保留'} | ${md(h.item.row.name)} | ${h.lines.map(md).join('<br>')} |\n`;
  }
  fs.writeFileSync(path.join(REPO, OUT_DOC), out);
  console.log(`${OUT_DOC} を書き出した（${list.length}種）`);
  for (const r of results) console.log(`  ${r.title} ${r.hits.length}種（上位100位 ${r.hits.filter(h => h.item.rank <= 100).length}）`);
}

main();
