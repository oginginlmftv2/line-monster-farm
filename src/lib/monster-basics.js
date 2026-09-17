'use strict';
/**
 * モンスター基礎データ（素質・特徴・地形適性・間合い適性）のスキーマと評価式。
 *
 * ここが唯一の置き場。点数表・加重・得意/苦手の閾値を変えるときはこのファイルと
 * scripts/test-monster-basics.js の期待値だけを直し、node build.js で全ページを再生成する。
 * src/data/monster-basics.json には画面に写る生の値だけを保存し、評価値は保存しない。
 *
 * 設計と較正の経緯は docs/monster-basics-design.md。
 */

// 画面のランク表記。低い順。「+」付きは適性には存在しない（技の評価にはある）。
const RANKS = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];

// ランク→点。育成開始時にランダムで最大2段階上がる（Sは超えない）ため、
// S・A・Bは「Sに届く」でほぼ同価値。C/Dは届きにくく、E以下はほぼ届かない。
const RANK_POINTS = { S: 5.0, A: 4.8, B: 4.5, C: 3.0, D: 2.0, E: 1.0, F: 0.6, G: 0.3 };

// 高い順に並べてから掛ける加重。ほぼ均等で、上位にわずかに寄せる。
// 合計はレア度で固定されているため、評価は実質「B以上がいくつ・D以下がいくつ」を測る。
const RANGE_WEIGHTS = [0.30, 0.28, 0.24, 0.18];
const TERRAIN_WEIGHTS = [0.26, 0.23, 0.20, 0.17, 0.14];

// 得意＝B以上（育成でSに届く）、苦手＝D以下。Cはどちらでもない。
const STRONG_MIN_RANK = 'B';
const WEAK_MAX_RANK = 'D';

const TERRAINS = ['砂漠', '森林', '海岸', '雪山', '火山'];
const RANGES = [
  { key: 'far', label: '遠' },
  { key: 'mid', label: '中' },
  { key: 'near', label: '近' },
  { key: 'zero', label: '零' },
];
const TALENTS = [
  { key: 'life', label: 'ライフ' },
  { key: 'power', label: 'ちから' },
  { key: 'wisdom', label: 'かしこさ' },
  { key: 'accuracy', label: '命中' },
  { key: 'evasion', label: '回避' },
  { key: 'defense', label: '丈夫さ' },
];
// 特徴タブの文字列項目。画面で見た値だけを列挙に足す（推測で増やさない）。
const GROWTH_TYPES = ['早熟', 'ふつう', '晩成'];
const GOOD_EVIL = ['ヨイ', 'ややヨイ', 'ふつう', 'ややワル', 'ワル'];
const SIZES = ['小さい', 'ふつう'];
// 特徴タブのランク項目
const TRAIT_RANK_FIELDS = [
  { key: 'gutsRecovery', label: 'ガッツ回復力' },
  { key: 'moveSpeed', label: '移動速度' },
];
const TRAIT_ENUM_FIELDS = [
  { key: 'growthType', label: '成長タイプ', values: GROWTH_TYPES },
  { key: 'goodEvil', label: 'ヨイワル', values: GOOD_EVIL },
  { key: 'size', label: 'サイズ', values: SIZES },
];

const rankIndex = rank => RANKS.indexOf(rank);
const isRank = value => rankIndex(value) >= 0;

function round1(value) {
  return Math.round(value * 10) / 10;
}

/** 高い順に並べて加重合計する。1つでも欠けていれば null。 */
function scoreRanks(ranks, weights) {
  if (!Array.isArray(ranks) || ranks.length !== weights.length) return null;
  if (!ranks.every(isRank)) return null;
  const points = ranks.map(rank => RANK_POINTS[rank]).sort((a, b) => b - a);
  return round1(points.reduce((sum, point, index) => sum + point * weights[index], 0));
}

function scoreTerrain(terrain) {
  if (!terrain) return null;
  return scoreRanks(TERRAINS.map(name => terrain[name]), TERRAIN_WEIGHTS);
}

function scoreRange(range) {
  if (!range) return null;
  return scoreRanks(RANGES.map(entry => range[entry.key]), RANGE_WEIGHTS);
}

/** [{label, rank}] を得意・苦手に振り分ける。画面と同じ並び順を保つ。 */
function classifyRanks(entries) {
  const strong = entries.filter(entry => rankIndex(entry.rank) >= rankIndex(STRONG_MIN_RANK));
  const weak = entries.filter(entry => rankIndex(entry.rank) <= rankIndex(WEAK_MAX_RANK));
  return { strong, weak };
}

function terrainEntries(terrain) {
  return TERRAINS.map(name => ({ label: name, rank: terrain[name] }));
}

function rangeEntries(range) {
  return RANGES.map(entry => ({ label: entry.label, rank: range[entry.key] }));
}

/** 素質％の合計と最高項目（同率は併記）。 */
function summarizeTalent(talent) {
  const values = TALENTS.map(entry => ({ label: entry.label, value: talent[entry.key] }));
  const total = values.reduce((sum, entry) => sum + entry.value, 0);
  const max = Math.max(...values.map(entry => entry.value));
  return { total, best: values.filter(entry => entry.value === max) };
}

function formatPercent(value) {
  return value > 0 ? `+${value}%` : `${value}%`;
}

function formatScore(value) {
  return value.toFixed(1);
}

/**
 * monster-basics.json を検証する。エラー文の配列を返す（空なら合格）。
 * 素質・地形・間合いはグループ単位で全項目そろっているか空かのどちらかにする。
 * 特徴タブの項目は1つずつ任意。
 */
function validateMonsterBasics(basicsJson, idsJson) {
  const errors = [];
  if (!basicsJson || typeof basicsJson !== 'object') return ['monster-basics.json が読めません'];
  if (basicsJson.schemaVersion !== 1) errors.push(`schemaVersion が 1 ではない: ${basicsJson.schemaVersion}`);
  const monsters = basicsJson.monsters;
  if (!Array.isArray(monsters)) return errors.concat(['monsters が配列ではありません']);
  const byId = new Map((idsJson.monsters || []).map(monster => [monster.id, monster]));
  const allowedKeys = new Set([
    'id', 'name', 'talent', 'terrain', 'range', 'capturedAt',
    ...TRAIT_RANK_FIELDS.map(field => field.key),
    ...TRAIT_ENUM_FIELDS.map(field => field.key),
  ]);
  // 配列はID昇順で保存する（出力を決定的にするため。オブジェクトのキー順は数値風キーで崩れる）
  const ids = monsters.map(entry => entry && entry.id);
  const sorted = [...ids].sort();
  if (ids.some((id, index) => id !== sorted[index])) {
    errors.push('monsters がID昇順に並んでいない（import スクリプトで書き直すこと）');
  }
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) errors.push(`monsters に重複ID: ${[...new Set(duplicates)].join(', ')}`);
  for (const entry of monsters) {
    const id = entry && entry.id;
    const at = `monster-basics.json ${id}`;
    if (!entry || typeof entry !== 'object') { errors.push(`monster-basics.json: オブジェクトではない要素がある`); continue; }
    if (!/^\d{4}$/.test(String(id))) { errors.push(`${at}: IDが4桁ではない`); continue; }
    const monster = byId.get(id);
    if (!monster) { errors.push(`${at}: monster-ids.json に無いID`); continue; }
    if (entry.name !== monster.name) errors.push(`${at}: name「${entry.name}」がID「${monster.name}」と一致しない`);
    for (const key of Object.keys(entry)) {
      if (!allowedKeys.has(key)) errors.push(`${at}: 未知の項目「${key}」`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.capturedAt || ''))) {
      errors.push(`${at}: capturedAt が YYYY-MM-DD ではない`);
    }
    if (entry.talent != null) {
      for (const field of TALENTS) {
        const value = entry.talent[field.key];
        if (!Number.isInteger(value)) errors.push(`${at}: talent.${field.key}（${field.label}）が整数％ではない: ${value}`);
      }
      for (const key of Object.keys(entry.talent)) {
        if (!TALENTS.some(field => field.key === key)) errors.push(`${at}: talent に未知の項目「${key}」`);
      }
    }
    if (entry.terrain != null) {
      for (const name of TERRAINS) {
        if (!isRank(entry.terrain[name])) errors.push(`${at}: terrain.${name} がランク（${RANKS.join('/')}）ではない: ${entry.terrain[name]}`);
      }
      for (const key of Object.keys(entry.terrain)) {
        if (!TERRAINS.includes(key)) errors.push(`${at}: terrain に未知の地形「${key}」`);
      }
    }
    if (entry.range != null) {
      for (const field of RANGES) {
        if (!isRank(entry.range[field.key])) errors.push(`${at}: range.${field.key}（${field.label}）がランクではない: ${entry.range[field.key]}`);
      }
      for (const key of Object.keys(entry.range)) {
        if (!RANGES.some(field => field.key === key)) errors.push(`${at}: range に未知の間合い「${key}」`);
      }
    }
    for (const field of TRAIT_RANK_FIELDS) {
      const value = entry[field.key];
      if (value != null && !isRank(value)) errors.push(`${at}: ${field.key}（${field.label}）がランクではない: ${value}`);
    }
    for (const field of TRAIT_ENUM_FIELDS) {
      const value = entry[field.key];
      if (value != null && !field.values.includes(value)) {
        errors.push(`${at}: ${field.key}（${field.label}）が列挙外: 「${value}」。画面で確認した値なら src/lib/monster-basics.js の列挙へ追加する`);
      }
    }
    const hasAnything = entry.talent != null || entry.terrain != null || entry.range != null
      || TRAIT_RANK_FIELDS.some(field => entry[field.key] != null)
      || TRAIT_ENUM_FIELDS.some(field => entry[field.key] != null);
    if (!hasAnything) errors.push(`${at}: 項目が1つもない`);
  }
  return errors;
}

module.exports = {
  RANKS,
  RANK_POINTS,
  RANGE_WEIGHTS,
  TERRAIN_WEIGHTS,
  STRONG_MIN_RANK,
  WEAK_MAX_RANK,
  TERRAINS,
  RANGES,
  TALENTS,
  GROWTH_TYPES,
  GOOD_EVIL,
  SIZES,
  TRAIT_RANK_FIELDS,
  TRAIT_ENUM_FIELDS,
  isRank,
  scoreRanks,
  scoreTerrain,
  scoreRange,
  classifyRanks,
  terrainEntries,
  rangeEntries,
  summarizeTalent,
  formatPercent,
  formatScore,
  validateMonsterBasics,
};
