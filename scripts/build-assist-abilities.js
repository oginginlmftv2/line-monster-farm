#!/usr/bin/env node
/**
 * lMfDB_abilities.json の全能力を、監査済み対応表のcardId基準で能力DBへ変換する。
 * 入力文字列と配列順を変更せず、未解決・曖昧・重複候補もすべて保持する。
 *
 * Usage:
 *   node scripts/build-assist-abilities.js
 *   node scripts/build-assist-abilities.js --check
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const OUTPUT = 'src/data/assist-abilities.json';
const GENERATED_FROM = [
  'lMfDB_abilities.json',
  'src/data/_audit/ability-card-map.json',
  'src/data/assist-cards.json',
];
const LINK_STATUSES = new Set(['resolved', 'ambiguous', 'unlinked']);

function absolute(relativePath) {
  return path.join(REPO, relativePath);
}

function readJson(relativePath) {
  const text = fs.readFileSync(absolute(relativePath), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function buildDatabase() {
  const sourceAbilities = readJson('lMfDB_abilities.json');
  const mappings = readJson('src/data/_audit/ability-card-map.json');
  const assistCards = readJson('src/data/assist-cards.json');
  if (!Array.isArray(sourceAbilities) || !Array.isArray(mappings)
      || !Array.isArray(assistCards.cards)) {
    throw new Error('入力ファイルの配列構造が不正です');
  }

  const cardIds = assistCards.cards.map(card => card.cardId);
  const cardIdSet = new Set(cardIds);
  if (cardIdSet.size !== cardIds.length
      || cardIds.some(cardId => typeof cardId !== 'string' || !cardId)) {
    throw new Error('assist-cards.json のcardIdに空欄または重複があります');
  }

  const mappingsById = new Map();
  for (const mapping of mappings) {
    if (!Number.isInteger(mapping.abilityId) || mappingsById.has(mapping.abilityId)) {
      throw new Error(`対応表のabilityIdが不正または重複しています: ${mapping.abilityId}`);
    }
    if (!LINK_STATUSES.has(mapping.linkStatus)) {
      throw new Error(`対応表のlinkStatusが不正です: ${mapping.abilityId}`);
    }
    if (mapping.linkStatus === 'resolved') {
      if (typeof mapping.cardId !== 'string' || !cardIdSet.has(mapping.cardId)) {
        throw new Error(`resolved対応に未知のcardIdがあります: ${mapping.abilityId}`);
      }
    } else if (mapping.cardId !== null) {
      throw new Error(`resolved以外の対応にcardIdがあります: ${mapping.abilityId}`);
    }
    mappingsById.set(mapping.abilityId, mapping);
  }

  const sourceIds = sourceAbilities.map(ability => ability.id);
  if (sourceIds.some(id => !Number.isInteger(id)) || new Set(sourceIds).size !== sourceIds.length) {
    throw new Error('元能力のidに整数以外または重複があります');
  }
  const missingMappings = sourceIds.filter(id => !mappingsById.has(id));
  const extraMappings = mappings.filter(mapping => !sourceIds.includes(mapping.abilityId));
  if (missingMappings.length || extraMappings.length) {
    throw new Error(`能力と対応表のID集合が不一致です（欠落 ${missingMappings.length} / 余分 ${extraMappings.length}）`);
  }

  const duplicateKeys = sourceAbilities.map(ability => JSON.stringify([
    ability.name,
    ability.desc,
    ability.card,
  ]));
  const duplicateKeyCounts = duplicateKeys.reduce((counts, key) => {
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const sortOrders = new Map();

  const abilities = sourceAbilities.map((source, index) => {
    const mapping = mappingsById.get(source.id);
    if (typeof source.card !== 'string' || !source.card
        || mapping.sourceName !== source.card) {
      throw new Error(`元能力と対応表のsourceNameが一致しません: ${source.id}`);
    }
    if (!Array.isArray(source.tags)) {
      throw new Error(`元能力のtagsが配列ではありません: ${source.id}`);
    }

    let sortOrder = null;
    if (mapping.linkStatus === 'resolved') {
      sortOrder = (sortOrders.get(mapping.cardId) || 0) + 1;
      sortOrders.set(mapping.cardId, sortOrder);
    }

    return {
      abilityId: `ab-${String(source.id).padStart(4, '0')}`,
      legacyId: source.id,
      cardId: mapping.linkStatus === 'resolved' ? mapping.cardId : null,
      sourceName: source.card,
      name: source.name,
      description: source.desc,
      source: source.source,
      rarity: source.rarity === undefined ? null : source.rarity,
      tags: source.tags,
      sortOrder,
      linkStatus: mapping.linkStatus,
      flags: duplicateKeyCounts.get(duplicateKeys[index]) > 1
        ? ['duplicate-candidate'] : [],
      status: 'verified',
    };
  });

  const statusCount = linkStatus => abilities
    .filter(ability => ability.linkStatus === linkStatus).length;
  return {
    schemaVersion: 1,
    generatedFrom: GENERATED_FROM,
    generatedAt: null,
    counts: {
      abilities: abilities.length,
      resolved: statusCount('resolved'),
      ambiguous: statusCount('ambiguous'),
      unlinked: statusCount('unlinked'),
      duplicateCandidates: abilities
        .filter(ability => ability.flags.includes('duplicate-candidate')).length,
    },
    abilities,
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
  console.log(`${OUTPUT} を生成しました（${database.counts.abilities}能力）`);
}

try {
  main();
} catch (error) {
  console.error(`アシスト能力DB生成: FAIL ${error.message}`);
  process.exit(1);
}
