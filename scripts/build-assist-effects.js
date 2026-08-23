#!/usr/bin/env node
/**
 * assist-effect-data.js の効果を、assist-cards.json のcardId順で効果DBへ変換する。
 * 効果文字列と元の配列順は変更しない。
 *
 * Usage:
 *   node scripts/build-assist-effects.js
 *   node scripts/build-assist-effects.js --check
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const OUTPUT = 'src/data/assist-effects.json';
const GENERATED_FROM = ['assist-effect-data.js', 'src/data/assist-cards.json'];

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

function buildDatabase() {
  const assistCards = readJson('src/data/assist-cards.json');
  if (!Array.isArray(assistCards.cards)) {
    throw new Error('assist-cards.json のcardsが配列ではありません');
  }

  const source = readJavaScriptValue('assist-effect-data.js', 'ASSIST_EFFECT_DATA');
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('ASSIST_EFFECT_DATAがオブジェクトではありません');
  }

  const cardIds = assistCards.cards.map(card => card.cardId);
  const cardIdSet = new Set(cardIds);
  if (cardIdSet.size !== cardIds.length || cardIds.some(cardId => typeof cardId !== 'string' || !cardId)) {
    throw new Error('assist-cards.json のcardIdに空欄または重複があります');
  }

  const unknownSourceIds = Object.keys(source).filter(cardId => !cardIdSet.has(cardId));
  if (unknownSourceIds.length) {
    throw new Error(`assist-cards.jsonに無いcardIdがあります: ${unknownSourceIds.join(', ')}`);
  }

  const cards = {};
  let effectCount = 0;
  let cardsWithEffects = 0;

  for (const cardId of cardIds) {
    const sourceEffects = Object.prototype.hasOwnProperty.call(source, cardId) ? source[cardId] : [];
    if (!Array.isArray(sourceEffects)) {
      throw new Error(`${cardId} の効果が配列ではありません`);
    }

    const effects = sourceEffects.map((effect, index) => ({
      effectId: `${cardId}-e${String(index + 1).padStart(2, '0')}`,
      name: effect.name,
      description: effect.desc,
      unlockRank: effect.totsujou,
      sortOrder: index + 1,
    }));

    if (effects.length) cardsWithEffects++;
    effectCount += effects.length;
    cards[cardId] = {
      status: effects.length ? 'verified' : 'draft',
      effects,
    };
  }

  return {
    schemaVersion: 1,
    generatedFrom: GENERATED_FROM,
    generatedAt: null,
    counts: {
      cards: cardIds.length,
      cardsWithEffects,
      cardsDraft: cardIds.length - cardsWithEffects,
      effects: effectCount,
    },
    cards,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check') || args.filter(arg => arg === '--check').length > 1) {
    throw new Error(`未対応の引数です: ${args.join(' ')}`);
  }

  const database = buildDatabase();
  const output = `${JSON.stringify(database, null, 2)}\n`;
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
  console.log(`${OUTPUT} を生成しました（${database.counts.cards}カード / ${database.counts.effects}効果）`);
}

try {
  main();
} catch (error) {
  console.error(`アシスト効果DB生成: FAIL ${error.message}`);
  process.exit(1);
}
