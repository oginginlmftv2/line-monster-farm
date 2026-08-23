#!/usr/bin/env node
/**
 * 現行カードの基本情報、編集情報、SAPO_DATAのexact対応だけをcardId基準で統合する。
 *
 * Usage:
 *   node scripts/build-assist-cards.js
 *   node scripts/build-assist-cards.js --check
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const OUTPUT = 'src/data/assist-cards.json';
const GENERATED_FROM = [
  'cards/cards-data.js',
  'src/data/cards-editorial.json',
  'assist-card-data.js',
  'src/data/_audit/sapo-card-map.json',
];
const STAT_KEYS = [
  'shokiShinmitsudo',
  'accessory',
  'tokuiTre',
  'ouenKouka',
  'tokuiRitsu',
  'shokiStatus',
  'cardTypeSapo',
  'attribute',
  'hpLimit',
  'allStatLimitUp',
  'challengeEffectUp',
];
const LIMIT_BREAK_KEYS = ['1a', '1b', '2a', '2b', '3a', '3b', '4a', '4b'];

function absolute(relativePath) {
  return path.join(REPO, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readJavaScriptValue(relativePath, variableName) {
  const source = readText(relativePath);
  const context = vm.createContext(Object.create(null));
  return new vm.Script(`${source}\n;${variableName}`, { filename: relativePath })
    .runInContext(context, { timeout: 5000 });
}

function nullObject(keys) {
  return Object.fromEntries(keys.map(key => [key, null]));
}

function normalizeNullable(value) {
  return value === undefined ? null : value;
}

function buildStats(sapoRow) {
  const stats = nullObject(STAT_KEYS);
  if (!sapoRow) return stats;

  stats.shokiShinmitsudo = normalizeNullable(sapoRow['初期親密度']);
  if (sapoRow._type === 'main') {
    stats.accessory = normalizeNullable(sapoRow['アクセサリー']);
    stats.tokuiTre = normalizeNullable(sapoRow['得意トレ']);
    stats.ouenKouka = normalizeNullable(sapoRow['応援効果']);
    stats.tokuiRitsu = normalizeNullable(sapoRow['得意率']);
    stats.shokiStatus = normalizeNullable(sapoRow['初期ステ+']);
  } else if (sapoRow._type === 'sub') {
    stats.cardTypeSapo = normalizeNullable(sapoRow['カードタイプ']);
    stats.attribute = normalizeNullable(sapoRow['属性']);
    stats.hpLimit = normalizeNullable(sapoRow['体力上限']);
    stats.allStatLimitUp = normalizeNullable(sapoRow['全ステ上限アップ']);
    stats.challengeEffectUp = normalizeNullable(sapoRow['チャレンジ効果アップ']);
  } else {
    throw new Error(`SAPO_DATAの_typeが不正です: ${sapoRow._type}`);
  }
  return stats;
}

function buildLimitBreak(sapoRow) {
  const result = nullObject(LIMIT_BREAK_KEYS);
  if (!sapoRow) return result;
  for (const key of LIMIT_BREAK_KEYS) {
    result[key] = normalizeNullable(sapoRow[`${key[0]}凸${key[1]}`]);
  }
  return result;
}

function buildDatabase() {
  const cardsData = readJavaScriptValue('cards/cards-data.js', 'cardsData');
  const editorial = readJson('src/data/cards-editorial.json').cards || {};
  const sapoRows = readJavaScriptValue('assist-card-data.js', 'SAPO_DATA');
  const sapoMap = readJson('src/data/_audit/sapo-card-map.json');
  const exactRowsByCard = new Map();

  for (const mapping of sapoMap) {
    if (mapping.matchType !== 'exact') continue;
    if (!Array.isArray(mapping.cardIdCandidates) || mapping.cardIdCandidates.length !== 1) {
      throw new Error(`exact対応のcardId候補が1件ではありません: sapoIndex ${mapping.sapoIndex}`);
    }
    const cardId = mapping.cardIdCandidates[0];
    if (!Object.prototype.hasOwnProperty.call(cardsData, cardId)) {
      throw new Error(`exact対応に未知のcardIdがあります: ${cardId}`);
    }
    if (exactRowsByCard.has(cardId)) {
      throw new Error(`exact対応のcardIdが重複しています: ${cardId}`);
    }
    const sapoRow = sapoRows[mapping.sapoIndex];
    if (!sapoRow || sapoRow._type !== mapping.type) {
      throw new Error(`SAPO_DATAと対応表のtypeが一致しません: sapoIndex ${mapping.sapoIndex}`);
    }
    exactRowsByCard.set(cardId, { mapping, sapoRow });
  }

  const cards = Object.entries(cardsData).map(([cardId, source]) => {
    const editorialCard = editorial[cardId] || null;
    const exact = exactRowsByCard.get(cardId) || null;
    const sapoRow = exact?.sapoRow || null;
    const ratings = editorialCard?.ratings
      ? {
          ikusei: editorialCard.ratings.ikusei,
          karyo: editorialCard.ratings.karyo,
          battle: editorialCard.ratings.battle,
          ta: editorialCard.ratings.ta,
        }
      : null;

    return {
      cardId,
      name: source.name,
      rarity: source.rarity,
      aura: source.oura,
      cardType: source.type,
      monType: normalizeNullable(source.mon),
      image: `assist-cards/${cardId}.${source.ext}`,
      distance: normalizeNullable(source.dist),
      terrain: source.terrain === undefined
        ? []
        : Array.isArray(source.terrain) ? [...source.terrain] : [source.terrain],
      event2: normalizeNullable(source.event2),
      releasedAt: sapoRow ? normalizeNullable(sapoRow['実装日']) : null,
      stats: buildStats(sapoRow),
      limitBreak: buildLimitBreak(sapoRow),
      ratings,
      explanation: editorialCard?.explanation || '',
      formations: editorialCard?.formations ? editorialCard.formations : [],
      sapoRef: exact
        ? { sapoIndex: exact.mapping.sapoIndex, type: exact.mapping.type }
        : null,
      status: 'draft',
    };
  });

  return {
    schemaVersion: 1,
    generatedFrom: GENERATED_FROM,
    generatedAt: null,
    counts: {
      cards: cards.length,
      withStats: cards.filter(card => card.sapoRef !== null).length,
      withExplanation: cards.filter(card => card.explanation !== '').length,
      withFormations: cards.filter(card => card.formations.length > 0).length,
    },
    cards,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check') || args.filter(arg => arg === '--check').length > 1) {
    throw new Error(`未対応の引数です: ${args.join(' ')}`);
  }

  const output = `${JSON.stringify(buildDatabase(), null, 2)}\n`;
  const outputPath = absolute(OUTPUT);
  if (args.includes('--check')) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
    if (current !== output) {
      console.error(`${OUTPUT} に生成差分があります`);
      process.exitCode = 1;
      return;
    }
    console.log(`${OUTPUT} は最新です`);
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`${OUTPUT} を生成しました（${JSON.parse(output).counts.cards}件）`);
}

try {
  main();
} catch (error) {
  console.error(`アシストカードDB生成: FAIL ${error.message}`);
  process.exit(1);
}
