#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SOURCE_FILE = 'src/data/_source/cardAbilities-assignments.txt';
const OUTPUT_FILE = 'src/data/card-ability-assignments.json';
const CARDS_FILE = 'cards/cards-data.js';
const IMAGES_DIR = 'assist-abilities';

const read = relative => fs.readFileSync(path.join(REPO, relative), 'utf8');

function cardIdsInSourceOrder() {
  return [...read(CARDS_FILE).matchAll(/^\s*'([^']+)'\s*:/gm)].map(match => match[1]);
}

function parseAssignments() {
  const assignments = new Map();
  const indexes = new Map();
  let currentCardId = null;
  let pendingIndex = null;

  for (const rawLine of read(SOURCE_FILE).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === '(array)' || line === '(string)') continue;

    if (/^\d+$/.test(line)) {
      if (!currentCardId) throw new Error(`cardIdより前に配列indexがあります: ${line}`);
      if (pendingIndex !== null) throw new Error(`index ${pendingIndex} にファイル名がありません`);
      pendingIndex = Number(line);
      continue;
    }

    const filenameMatch = line.match(/^"([^"]+)"$/);
    if (filenameMatch) {
      if (!currentCardId || pendingIndex === null) {
        throw new Error(`cardIdまたはindexの無いファイル名です: ${line}`);
      }
      assignments.get(currentCardId).push(filenameMatch[1]);
      indexes.get(currentCardId).push(pendingIndex);
      pendingIndex = null;
      continue;
    }

    if (pendingIndex !== null) throw new Error(`index ${pendingIndex} にファイル名がありません`);
    if (assignments.has(line)) throw new Error(`cardIdが重複しています: ${line}`);
    currentCardId = line;
    assignments.set(currentCardId, []);
    indexes.set(currentCardId, []);
  }

  if (pendingIndex !== null) throw new Error(`最終index ${pendingIndex} にファイル名がありません`);

  for (const [cardId, cardIndexes] of indexes) {
    const expected = cardIndexes.map((_, index) => index);
    if (cardIndexes.some((value, index) => value !== expected[index])) {
      throw new Error(`${cardId} の配列indexが0からの連番ではありません: ${cardIndexes.join(', ')}`);
    }
  }

  return assignments;
}

function main() {
  const cardIds = cardIdsInSourceOrder();
  const cardIdSet = new Set(cardIds);
  const parsed = parseAssignments();
  const unknownCardIds = [...parsed.keys()].filter(cardId => !cardIdSet.has(cardId));
  if (unknownCardIds.length) {
    throw new Error(`cards-data.jsに無いcardId: ${unknownCardIds.join(', ')}`);
  }

  const orderedAssignments = {};
  for (const cardId of cardIds) {
    if (parsed.has(cardId)) orderedAssignments[cardId] = parsed.get(cardId);
  }

  const referenced = Object.values(orderedAssignments).flat();
  const referencedSet = new Set(referenced);
  const imageFiles = fs.readdirSync(path.join(REPO, IMAGES_DIR))
    .filter(filename => filename.toLowerCase().endsWith('.jpg'))
    .sort();
  const imageFileSet = new Set(imageFiles);
  const missingImages = [...referencedSet].filter(filename => !imageFileSet.has(filename)).sort();
  if (missingImages.length) throw new Error(`存在しない画像参照: ${missingImages.join(', ')}`);

  const output = {
    schemaVersion: 1,
    generatedFrom: 'Firestore cardAbilities/assignments（管理画面表示の手動コピー）',
    sourceFile: SOURCE_FILE,
    exportedAt: '2026-08-23',
    counts: {
      cards: Object.keys(orderedAssignments).length,
      assignments: referenced.length,
      referencedImages: referencedSet.size,
    },
    assignments: orderedAssignments,
  };
  fs.writeFileSync(path.join(REPO, OUTPUT_FILE), `${JSON.stringify(output, null, 2)}\n`);

  const unassignedCards = cardIds.filter(cardId => !parsed.has(cardId));
  const unreferencedImages = imageFiles.filter(filename => !referencedSet.has(filename));
  const imageCards = new Map();
  for (const [cardId, filenames] of Object.entries(orderedAssignments)) {
    for (const filename of new Set(filenames)) {
      if (!imageCards.has(filename)) imageCards.set(filename, []);
      imageCards.get(filename).push(cardId);
    }
  }
  const sharedImages = [...imageCards]
    .filter(([, assignedCards]) => assignedCards.length > 1)
    .sort(([left], [right]) => left.localeCompare(right));

  console.log(`生成: ${OUTPUT_FILE}`);
  console.log(`cardId: ${output.counts.cards}件`);
  console.log(`割当: ${output.counts.assignments}件`);
  console.log(`参照画像: ${output.counts.referencedImages}種`);
  console.log(`assist-abilities/ のjpg: ${imageFiles.length}枚`);
  console.log(`存在しない画像参照: ${missingImages.length}件`);
  console.log(`cards-data.jsに無いcardId: ${unknownCardIds.length}件`);
  console.log(`配列indexの欠番・重複: 0件`);
  console.log(`割当が無い現行カード: ${unassignedCards.length}件`);
  for (const cardId of unassignedCards) console.log(`  ${cardId}`);
  console.log(`どのカードからも参照されない画像: ${unreferencedImages.length}枚`);
  for (const filename of unreferencedImages) console.log(`  ${filename}`);
  console.log(`複数カードで共有される画像: ${sharedImages.length}枚`);
  for (const [filename, assignedCards] of sharedImages) {
    console.log(`  ${filename}: ${assignedCards.join(', ')}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
