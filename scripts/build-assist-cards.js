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

function formatStatValue(value, percent) {
  if (value === null || value === undefined || value === '') return null;
  return `+${String(value).replace(/^\+/, '').replace(/%$/, '')}${percent ? '%' : ''}`;
}

function statRows(entries) {
  return entries
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => ({ label, value: String(value) }));
}

function buildStats(sapoRow, cardType) {
  if (!sapoRow) return [];
  if (sapoRow._type === 'main') {
    return statRows([
      ['応援効果', formatStatValue(sapoRow['応援効果'], true)],
      ['得意率', formatStatValue(sapoRow['得意率'], true)],
      [`初期${cardType}`, formatStatValue(sapoRow['初期ステ+'], false)],
    ]);
  } else if (sapoRow._type === 'sub') {
    return statRows([
      ['体力上限', formatStatValue(sapoRow['体力上限'], false)],
      ['全ステ上限アップ', formatStatValue(sapoRow['全ステ上限アップ'], false)],
      ['チャレンジ効果アップ', formatStatValue(sapoRow['チャレンジ効果アップ'], true)],
    ]);
  } else {
    throw new Error(`SAPO_DATAの_typeが不正です: ${sapoRow._type}`);
  }
}

function buildAccessoryStatus(sapoRow) {
  if (!sapoRow || sapoRow['アクセサリー'] === null || sapoRow['アクセサリー'] === undefined) return 'unknown';
  if (sapoRow['アクセサリー'] === '○') return 'yes';
  throw new Error(`アクセサリーの値が不正です: ${sapoRow['アクセサリー']}`);
}

function buildEvent2(source) {
  if (source.event2 !== null && source.event2 !== undefined && source.event2 !== '') return source.event2;
  if (source.dist !== null && source.dist !== undefined && source.dist !== '') return source.dist;
  if (source.terrain === null || source.terrain === undefined || source.terrain === '') return null;
  const values = Array.isArray(source.terrain) ? source.terrain : [source.terrain];
  return values.filter(Boolean).join(' / ') || null;
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
      event2: buildEvent2(source),
      releasedAt: sapoRow ? normalizeNullable(sapoRow['実装日']) : null,
      accessoryStatus: buildAccessoryStatus(sapoRow),
      stats: buildStats(sapoRow, source.type),
      limitBreak: buildLimitBreak(sapoRow),
      ratings,
      explanation: editorialCard?.explanation || '',
      formations: editorialCard?.formations ? editorialCard.formations : [],
      sapoRef: exact
        ? { sapoIndex: exact.mapping.sapoIndex, type: exact.mapping.type }
        : null,
    };
  });

  return {
    schemaVersion: 3,
    generatedFrom: GENERATED_FROM,
    generatedAt: null,
    counts: {
      cards: cards.length,
      withStats: cards.filter(card => card.stats.length > 0).length,
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
