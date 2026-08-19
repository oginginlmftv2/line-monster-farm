#!/usr/bin/env node
/**
 * CMSがシートから送った予測IDと、generate-ids.jsの採番結果を照合する。
 *
 * 採番ロジックはここに持たない。正はgenerate-ids.jsであり、このスクリプトは
 * 2つの出力が名前・ID・arrayIndexまで一致することだけを検査する。
 *
 * Usage:
 *   node scripts/verify-cms-ids.js
 *   node scripts/verify-cms-ids.js <predictions.json> <monster-ids.json>
 */

const fs = require('fs');
const path = require('path');

const REPO = process.cwd();
const predictionPath = path.resolve(
  REPO,
  process.argv[2] || 'src/data/cms-id-predictions.json',
);
const generatedPath = path.resolve(
  REPO,
  process.argv[3] || 'src/data/monster-ids.json',
);

function readJson(file, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`${label}が見つかりません: ${path.relative(REPO, file)}`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label}のJSONが壊れています: ${error.message}`);
  }
}

function validateRows(root, label, errors) {
  if (!root || !Array.isArray(root.monsters)) {
    errors.push(`${label}のmonstersが配列ではありません`);
    return [];
  }
  if (root.count !== root.monsters.length) {
    errors.push(`${label}のcount不一致: count=${root.count} / monsters=${root.monsters.length}`);
  }

  const names = new Set();
  const ids = new Set();
  const indexes = new Set();
  root.monsters.forEach((monster, position) => {
    const name = typeof monster.name === 'string' ? monster.name.trim() : '';
    const id = typeof monster.id === 'string' ? monster.id : '';
    const arrayIndex = monster.arrayIndex;
    if (!name) errors.push(`${label}に名前が空の行があります（位置${position}）`);
    if (!/^\d{4}$/.test(id)) {
      errors.push(`${label}に4桁でないIDがあります: ${id || '（空）'}（${name || `位置${position}`}）`);
    }
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0) {
      errors.push(`${label}のarrayIndexが不正です: ${arrayIndex}（${name || `位置${position}`}）`);
    }
    if (name && names.has(name)) errors.push(`${label}で名前が重複しています: ${name}`);
    if (id && ids.has(id)) errors.push(`${label}でIDが重複しています: ${id}`);
    if (Number.isInteger(arrayIndex) && indexes.has(arrayIndex)) {
      errors.push(`${label}でarrayIndexが重複しています: ${arrayIndex}`);
    }
    names.add(name);
    ids.add(id);
    indexes.add(arrayIndex);
  });
  if (indexes.size === root.monsters.length) {
    for (let index = 0; index < root.monsters.length; index++) {
      if (!indexes.has(index)) {
        errors.push(`${label}のarrayIndexが0からの連番ではありません: 欠番=${index}`);
        break;
      }
    }
  }
  return root.monsters;
}

function main() {
  const predictionsRoot = readJson(predictionPath, 'CMS予測ID');
  const generatedRoot = readJson(generatedPath, '採番結果');
  const errors = [];
  const predictions = validateRows(predictionsRoot, 'CMS予測ID', errors);
  const generated = validateRows(generatedRoot, '採番結果', errors);

  if (predictions.length !== generated.length) {
    errors.push(`件数不一致: シート=${predictions.length} / 採番結果=${generated.length}`);
  }

  const generatedByName = new Map(generated.map(monster => [monster.name, monster]));
  const predictedNames = new Set(predictions.map(monster => monster.name));

  for (const predicted of predictions) {
    const actual = generatedByName.get(predicted.name);
    if (!actual) {
      errors.push(`採番結果に存在しないモンスター: ${predicted.name}（シートID=${predicted.id}）`);
      continue;
    }
    if (predicted.id !== actual.id) {
      errors.push(`ID不一致: シート=${predicted.id} / 採番結果=${actual.id}（${predicted.name}）`);
    }
    if (predicted.arrayIndex !== actual.arrayIndex) {
      errors.push(`arrayIndex不一致: シート=${predicted.arrayIndex} / 採番結果=${actual.arrayIndex}`
        + `（${predicted.name}）`);
    }
  }

  for (const actual of generated) {
    if (!predictedNames.has(actual.name)) {
      errors.push(`シート予測IDに存在しないモンスター: ${actual.name}（採番結果=${actual.id}）`);
    }
  }

  if (errors.length) {
    errors.slice(0, 30).forEach(error => console.error(`ERROR ${error}`));
    if (errors.length > 30) console.error(`ERROR ほか${errors.length - 30}件`);
    console.error(`ID検算: FAIL ${errors.length}件`);
    process.exit(1);
  }

  console.log(`ID検算: PASS ${predictions.length}体（シート予測ID = generate-ids.js採番結果）`);
}

try {
  main();
} catch (error) {
  console.error(`ID検算: FAIL ${error.message}`);
  process.exit(1);
}
