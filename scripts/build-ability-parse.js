#!/usr/bin/env node
/**
 * アシスト能力の説明文を src/lib/ability-parser.js で構造化し、
 *   src/data/_audit/ability-parse.json   … 全件の解析結果（評価対象フラグつき）
 *   docs/ability-parse-coverage.md       … カバレッジ表と未抽出行の一覧
 * を書き出す。手動実行のみ（build.js からは呼ばない）。
 *
 *   node scripts/build-ability-parse.js
 *   node scripts/build-ability-parse.js --dry
 *
 * 評価値は出さない（build.js が src/lib/ability-score.js で src/data/ability-scores.json を作る）。
 */

const fs = require('fs');
const path = require('path');
const parser = require('../src/lib/ability-parser');

const REPO = path.resolve(__dirname, '..');
const ABILITIES = 'src/data/assist-abilities.json';
const CARDS = 'src/data/assist-cards.json';
const OUT_JSON = 'src/data/_audit/ability-parse.json';
const OUT_DOC = 'docs/ability-parse-coverage.md';

function count(list, keyOf) {
  const map = {};
  for (const item of list) { const k = keyOf(item); if (k == null) continue; map[k] = (map[k] || 0) + 1; }
  return Object.entries(map).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function table(header, rows) {
  return [`| ${header.join(' | ')} |`, `|${header.map((_, i) => (i === 0 ? '---' : '---:')).join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
}

function md(s) { return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }

function main() {
  const dry = process.argv.includes('--dry');
  const abilities = JSON.parse(fs.readFileSync(path.join(REPO, ABILITIES), 'utf8')).abilities;
  const cards = JSON.parse(fs.readFileSync(path.join(REPO, CARDS), 'utf8')).cards;
  const cardById = new Map(cards.map(c => [c.cardId, c]));

  const parsed = parser.markSuperseded(abilities.map(a => {
    const p = parser.parseAbility(a);
    const card = cardById.get(a.cardId);
    return {
      ...p,
      cardId: a.cardId || null,
      releasedAt: card && card.releasedAt ? card.releasedAt : null,
      source: a.source,
      categories: parser.categoriesOf(p),
      // 監査JSONを軽くする：効果の照合文字列は落とす（raw 行に残っている）
      lines: p.lines.map(l => ({ ...l, effects: l.effects.map(({ text, ...e }) => e) })),
      lineStatus: p.lines.map(l => (l.residual === '' ? (l.effects.length || l.grants.length ? 'full' : 'empty') : (l.effects.length ? 'partial' : 'none'))),
    };
  }));
  const target = parsed.filter(p => !p.superseded);

  const json = {
    schemaVersion: 1,
    note: 'scripts/build-ability-parse.js が生成（手動実行）。src/lib/ability-parser.js の語彙で assist-abilities.json を構造化した監査用データ。手で編集しない。',
    generatedFrom: ABILITIES,
    counts: {
      abilities: parsed.length,
      target: target.length,
      status: Object.fromEntries(count(target, p => p.status)),
    },
    abilities: parsed,
  };

  // ---- ドキュメント
  const lines = [];
  lines.push('# 能力説明文の構造化カバレッジ');
  lines.push('');
  lines.push(`生成: \`node scripts/build-ability-parse.js\`（元データ \`${ABILITIES}\` ${parsed.length}件）。`);
  lines.push('語彙とルールは `docs/ability-scoring-design.md`。このファイルは生成物なので手で直さず、パーサを直して再生成する。');
  lines.push('');
  lines.push('## 1. 評価対象と抽出状況');
  lines.push('');
  lines.push('評価対象＝系列の上位だけ（I→II、III→IV は上位のみ。II と IV は並列。序・破・急は3つとも）。');
  lines.push('');
  const st = s => (Object.fromEntries(count(s, p => p.status)));
  const stT = st(target), stA = st(parsed);
  lines.push(table(['区分', '件数', '全行抽出', '一部抽出', '抽出なし'], [
    ['評価対象', target.length, stT.full || 0, stT.partial || 0, stT.none || 0],
    ['全件（下位段階を含む）', parsed.length, stA.full || 0, stA.partial || 0, stA.none || 0],
  ]));
  lines.push('');
  lines.push('- 全行抽出：すべての効果行で原子語が取れ、残り文字列が無い');
  lines.push('- 一部抽出：原子語は取れたが、条件や言い回しの一部が残り文字列に残る（評価に使える行は多い）');
  lines.push('- 抽出なし：原子語が1つも取れない。固有ギミックか語彙漏れ。`ability-overrides.json` の候補');
  lines.push('');
  const dated = target.filter(p => p.releasedAt);
  const recent = dated.filter(p => p.releasedAt >= '2025/09/01');
  lines.push(`評価対象のうちカード日付あり ${dated.length}件、直近1年（2025/09〜） ${recent.length}件。`);
  lines.push('');
  lines.push('## 2. 大分類・原子語の分布（評価対象）');
  lines.push('');
  lines.push(table(['大分類', '件数'], count(target.flatMap(p => p.categories), c => c)));
  lines.push('');
  lines.push(table(['原子語', '出現行数'], count(target.flatMap(p => p.lines.flatMap(l => l.effects)), e => e.atom)));
  lines.push('');
  lines.push('## 3. 条件・トリガーの分布（評価対象）');
  lines.push('');
  const applyRows = count(target.filter(p => p.apply), p => {
    const a = p.apply; const parts = [];
    if (a.aura.length) parts.push('オーラ:' + a.aura.join('/'));
    if (a.mon.length) parts.push('モン類:' + a.mon.join('/'));
    if (a.blood.length) parts.push('血統:' + a.blood.join('/'));
    return (a.op ? `${a.op} ` : '') + parts.join(' ');
  });
  lines.push(`適用条件（hard）あり ${target.filter(p => p.apply).length}件 ／ なし ${target.filter(p => !p.apply).length}件。`);
  lines.push('');
  lines.push(table(['適用条件', '件数'], applyRows.slice(0, 40)));
  lines.push('');
  lines.push(table(['トリガー', '行数'], count(target.flatMap(p => p.lines), l => l.trigger)));
  lines.push('');
  const scRows = count(target.flatMap(p => p.lines.flatMap(l => Object.entries(l.skillCond).map(([k, v]) => `${k}=${v}`))), s => s);
  lines.push(table(['技条件', '行数'], scRows));
  lines.push('');
  const condRows = count(target.flatMap(p => p.lines.flatMap(l => Object.entries(l.conditions).flatMap(([k, vs]) => vs.map(v => `${k}: ${v}`)))), s => s);
  lines.push(table(['状況条件', '行数'], condRows.slice(0, 60)));
  lines.push('');
  lines.push(table(['回数・秒数', '行数'], [
    ['ヒット数あり（追撃・連撃に隣接する＜N回＞）', target.flatMap(p => p.lines).filter(l => l.hits != null).length],
    ['発動回数制限あり（それ以外の＜N回＞）', target.flatMap(p => p.lines).filter(l => typeof l.limit === 'number').length],
    ['何回でも', target.flatMap(p => p.lines).filter(l => l.limit === 'unlimited').length],
    ['継続秒数あり', target.flatMap(p => p.lines).filter(l => typeof l.duration === 'number').length],
    ['上限回数あり（最大N回まで・累積）', target.flatMap(p => p.lines).filter(l => l.maxStack != null).length],
  ]));
  lines.push('');
  lines.push('## 4. ヒット数と読んだ行（要確認）');
  lines.push('');
  lines.push('「追撃・連撃に隣接する＜N回＞＝ヒット数（トリガーごとに毎回）、それ以外＝試合中の発動回数制限」のルールで振り分けた。');
  lines.push('');
  lines.push(table(['能力', '行', 'ヒット数', '回数制限'], target.flatMap(p => p.lines.filter(l => l.hits != null).map(l => [md(p.name), md(l.raw), l.hits, l.limit == null ? '—' : md(l.limit)]))));
  lines.push('');
  lines.push('## 5. 抽出なし（評価対象）');
  lines.push('');
  lines.push(table(['能力', '行', '残り'], target.filter(p => p.status === 'none').flatMap(p => p.lines.map(l => [md(p.name), md(l.raw), md(l.residual)]))));
  lines.push('');
  lines.push('## 6. 一部抽出の残り文字列（評価対象・頻度順）');
  lines.push('');
  const resid = count(target.flatMap(p => p.lines.filter(l => l.residual)), l => l.residual);
  lines.push(table(['残り文字列', '行数'], resid.map(([k, v]) => [md(k), v])));
  lines.push('');
  lines.push('## 7. 一部抽出の行（評価対象）');
  lines.push('');
  lines.push(table(['能力', '行', '取れた原子語', '残り'], target.filter(p => p.status === 'partial').flatMap(p => p.lines.filter(l => l.residual).map(l => [md(p.name), md(l.raw), md(l.effects.map(e => `${e.atom}${e.value != null ? '=' + e.value + (e.unit || '') : ''}`).join('、') || '—'), md(l.residual)]))));
  lines.push('');

  console.log(`解析 ${parsed.length}件 / 評価対象 ${target.length}件 / 全行抽出 ${stT.full || 0} / 一部 ${stT.partial || 0} / なし ${stT.none || 0}`);
  if (dry) { console.log('--dry のため書き込みません'); return; }
  // 1能力1行（差分を読めるようにしつつ、整形JSONの1.7MBを避ける）
  const body = json.abilities.map(a => `    ${JSON.stringify(a)}`).join(',\n');
  const head = JSON.stringify({ ...json, abilities: undefined }, null, 2).replace(/\n}$/, '');
  fs.writeFileSync(path.join(REPO, OUT_JSON), `${head},\n  "abilities": [\n${body}\n  ]\n}\n`);
  fs.writeFileSync(path.join(REPO, OUT_DOC), `${lines.join('\n')}\n`);
  console.log(`書き込み ${OUT_JSON} / ${OUT_DOC}`);
}

if (require.main === module) main();
