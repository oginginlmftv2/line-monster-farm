#!/usr/bin/env node
/**
 * スクショから転記したTSVをモンスター基礎データDBへ取り込む。
 *
 *   node scripts/import-monster-basics-tsv.js
 *   node scripts/import-monster-basics-tsv.js --dry
 *
 * src/data/_source/monster-basics-<血統slug>.tsv を全部読み、src/data/monster-basics.json を
 * まるごと書き直す（技DBの import-skills-tsv.js と同じ方式）。
 *
 * - シートにはモンスター名で書く。IDへの変換はここで行い、推測しない
 * - 行の血統がファイル名の血統slugと違えばFAIL（別血統のシートへ書いた事故を止める）
 * - 同じモンスターが2行あればFAIL
 * - 素質6項目・地形5項目・間合い4項目は「全部埋める」か「全部空」のどちらか。
 *   特徴タブの項目（ガッツ回復力・移動速度・成長タイプ・ヨイワル・サイズ）は1つずつ任意
 * - 評価値は保存しない。build.js が src/lib/monster-basics.js の式で毎回計算する
 */

const fs = require('fs');
const path = require('path');
const {
  TERRAINS, RANGES, TALENTS, TRAIT_RANK_FIELDS, TRAIT_ENUM_FIELDS, validateMonsterBasics,
} = require('../src/lib/monster-basics');

const REPO = path.resolve(__dirname, '..');
const DB = 'src/data/monster-basics.json';
const IDS = 'src/data/monster-ids.json';
const SOURCE_DIR = 'src/data/_source';
const TEMPLATE = 'monster-basics-template.tsv';
const FILE_PATTERN = /^monster-basics-([a-z0-9-]+)\.tsv$/;
const TALENT_PATTERN = /^[+-]?\d+%?$/;

const EXPECTED_HEADER = [
  'name',
  ...TALENTS.map(field => field.key),
  ...TRAIT_RANK_FIELDS.map(field => field.key),
  ...TRAIT_ENUM_FIELDS.map(field => field.key),
  ...TERRAINS,
  ...RANGES.map(field => field.label),
  'capturedAt',
];

function readTsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  const rel = path.relative(REPO, file);
  if (!lines.length) throw new Error(`${rel}: 中身がありません`);
  const header = lines[0].split('\t').map(cell => cell.trim());
  if (header.join('\t') !== EXPECTED_HEADER.join('\t')) {
    throw new Error(`${rel}: ヘッダーが ${TEMPLATE} と一致しません\n  期待: ${EXPECTED_HEADER.join(' | ')}\n  実際: ${header.join(' | ')}`);
  }
  return lines.slice(1).map((line, index) => {
    const cells = line.split('\t');
    const row = { _file: rel, _line: index + 2 };
    header.forEach((key, column) => { row[key] = (cells[column] || '').trim(); });
    return row;
  });
}

function collectSourceFiles() {
  const dir = path.join(REPO, SOURCE_DIR);
  return fs.readdirSync(dir)
    .filter(name => FILE_PATTERN.test(name) && name !== TEMPLATE)
    .sort()
    .map(name => ({ file: path.join(dir, name), slug: name.match(FILE_PATTERN)[1] }));
}

function parseTalent(value, label, at, errors) {
  if (!TALENT_PATTERN.test(value)) {
    errors.push(`${at}: ${label} が整数％ではない: 「${value}」`);
    return null;
  }
  return parseInt(value.replace('%', ''), 10);
}

/** 1行を monster-basics.json の1件へ変換する。 */
function rowToEntry(row, slug, idsJson, errors) {
  const at = `${row._file}:${row._line}`;
  const name = row.name;
  if (!name) { errors.push(`${at}: name が空`); return null; }
  const candidates = idsJson.monsters.filter(monster => monster.name === name);
  if (candidates.length !== 1) {
    errors.push(`${at}: 「${name}」が monster-ids.json で${candidates.length ? '複数' : '見つからない'}`);
    return null;
  }
  const monster = candidates[0];
  if (monster.bloodSlug !== slug) {
    errors.push(`${at}: 「${name}」は${monster.blood}種（${monster.bloodSlug}）。このファイルは ${slug} 用`);
    return null;
  }
  const entry = { id: monster.id, name };

  const talentValues = TALENTS.map(field => row[field.key]);
  const talentFilled = talentValues.filter(value => value !== '').length;
  if (talentFilled === TALENTS.length) {
    entry.talent = {};
    TALENTS.forEach((field, index) => {
      entry.talent[field.key] = parseTalent(talentValues[index], field.label, at, errors);
    });
  } else if (talentFilled > 0) {
    errors.push(`${at}: 素質は6項目すべて埋めるか、すべて空にする（${talentFilled}/6）`);
  }

  for (const field of TRAIT_RANK_FIELDS) if (row[field.key] !== '') entry[field.key] = row[field.key];
  for (const field of TRAIT_ENUM_FIELDS) if (row[field.key] !== '') entry[field.key] = row[field.key];

  const terrainValues = TERRAINS.map(name => row[name]);
  const terrainFilled = terrainValues.filter(value => value !== '').length;
  if (terrainFilled === TERRAINS.length) {
    entry.terrain = {};
    TERRAINS.forEach((terrain, index) => { entry.terrain[terrain] = terrainValues[index]; });
  } else if (terrainFilled > 0) {
    errors.push(`${at}: 地形適性は5項目すべて埋めるか、すべて空にする（${terrainFilled}/5）`);
  }

  const rangeValues = RANGES.map(field => row[field.label]);
  const rangeFilled = rangeValues.filter(value => value !== '').length;
  if (rangeFilled === RANGES.length) {
    entry.range = {};
    RANGES.forEach((field, index) => { entry.range[field.key] = rangeValues[index]; });
  } else if (rangeFilled > 0) {
    errors.push(`${at}: 間合い適性は4項目すべて埋めるか、すべて空にする（${rangeFilled}/4）`);
  }

  entry.capturedAt = row.capturedAt;
  return { id: monster.id, entry };
}

function buildDb(sources, idsJson) {
  const errors = [];
  const seen = new Map();
  const monsters = {};
  for (const { file, slug } of sources) {
    for (const row of readTsv(file)) {
      const converted = rowToEntry(row, slug, idsJson, errors);
      if (!converted) continue;
      const at = `${row._file}:${row._line}`;
      if (seen.has(converted.id)) {
        errors.push(`${at}: 「${row.name}」が ${seen.get(converted.id)} と重複`);
        continue;
      }
      seen.set(converted.id, at);
      monsters[converted.id] = converted.entry;
    }
  }
  const ordered = Object.keys(monsters).sort().map(id => monsters[id]);
  const db = {
    schemaVersion: 1,
    note: 'スクショから転記した生の値だけを持つ。評価値は保存せず build.js が src/lib/monster-basics.js で計算する。手で編集せず src/data/_source/monster-basics-*.tsv を直して scripts/import-monster-basics-tsv.js を実行する。',
    monsters: ordered,
  };
  errors.push(...validateMonsterBasics(db, idsJson));
  return { db, errors };
}

function main() {
  const dry = process.argv.includes('--dry');
  const idsJson = JSON.parse(fs.readFileSync(path.join(REPO, IDS), 'utf8'));
  const sources = collectSourceFiles();
  if (!sources.length) {
    console.error(`${SOURCE_DIR} に monster-basics-<血統slug>.tsv がありません`);
    process.exit(1);
  }
  const { db, errors } = buildDb(sources, idsJson);
  if (errors.length) {
    console.error(`FAIL ${errors.length}件`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  const count = db.monsters.length;
  const groups = { 素質: 0, 地形: 0, 間合い: 0 };
  for (const entry of db.monsters) {
    if (entry.talent) groups.素質 += 1;
    if (entry.terrain) groups.地形 += 1;
    if (entry.range) groups.間合い += 1;
  }
  console.log(`読み込み ${sources.length}ファイル / モンスター ${count}体（素質 ${groups.素質} / 地形 ${groups.地形} / 間合い ${groups.間合い}）`);
  if (dry) { console.log('--dry のため書き込みません'); return; }
  fs.writeFileSync(path.join(REPO, DB), `${JSON.stringify(db, null, 2)}\n`);
  console.log(`書き込み ${DB}`);
}

if (require.main === module) main();

module.exports = { EXPECTED_HEADER, readTsv, rowToEntry, buildDb, collectSourceFiles };
