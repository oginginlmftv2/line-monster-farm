#!/usr/bin/env node
/** P12-8 アシストCMSのtest境界と3DB構造を検証する。 */

const fs = require('fs');
const path = require('path');

const SOURCE_FILES = [
  '_cms/assist-gas/コード.gs',
  '_cms/assist-gas/index.html',
  '_cms/assist-gas/README.md',
];
const DATA_FILES = [
  'src/data/assist-cards.json',
  'src/data/assist-effects.json',
  'src/data/assist-abilities.json',
];

const ALLOWED = {
  rarity: new Set(['MR', 'SSR']),
  aura: new Set(['赤', '緑', '黄', '白', '黒', '青']),
  monType: new Set(['幻霊', '無機', '創造', '獣族', '魔族', '怪物']),
  cardStatus: new Set(['draft', 'verified', 'published', 'retired']),
  unlockRank: new Set(['無凸', '1凸', '2凸', '3凸', '4凸']),
  abilitySource: new Set(['イベント', '閃き', 'EXトレ']),
  linkStatus: new Set(['resolved', 'ambiguous', 'unlinked']),
  abilityStatus: new Set(['draft', 'verified']),
};

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function json(root, relative) {
  return JSON.parse(read(root, relative).replace(/^\uFEFF/, ''));
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every(value => b.has(value));
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function validateRoot(root) {
  const issues = [];
  for (const relative of [...SOURCE_FILES, ...DATA_FILES]) {
    if (!fs.existsSync(path.join(root, relative))) issues.push(`必須ファイルがない: ${relative}`);
  }
  if (issues.length) return issues;

  const gas = read(root, SOURCE_FILES[0]);
  const html = read(root, SOURCE_FILES[1]);
  const guide = read(root, SOURCE_FILES[2]);

  if (Buffer.byteLength(gas) > 100 * 1024) issues.push('コード.gsが100KBを超えている');
  if (!/prop_\('ENVIRONMENT'\)\s*!==\s*'test'/.test(gas)) issues.push('ENVIRONMENT=testの強制検査がない');
  if (!/P12-8 ASSIST CMS TEST/.test(gas)) issues.push('testスプレッドシートのマーカー検査がない');
  if (!/releasedAt:\s*dateCell_\(row\.releasedAt\)/.test(gas)) issues.push('SheetsのDateをYYYY/MM/DDへ戻す処理がない');
  if (!/withStats:\s*cards\.filter\(function \(card\) \{ return hasNonNullValue_\(card\.stats\); \}\)\.length/.test(gas)) {
    issues.push('withStatsが非null値を持つカードだけを数えていない');
  }
  for (const sheet of ['members', 'cards', 'assist_effects', 'abilities', 'capture_queue', 'publish_log']) {
    if (!new RegExp(`['"]${sheet}['"]`).test(gas)) issues.push(`必須シート定義がない: ${sheet}`);
  }
  for (const fn of [
    'setup1_createSheets', 'setup2_registerMe', 'setup3_importFromMain', 'setup4_check',
    'doGet', 'api_bootstrap', 'api_getCard', 'api_saveCard', 'api_saveEffects',
    'api_getAbility', 'api_saveAbility', 'api_export', 'validateDocuments_',
  ]) {
    if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(gas)) issues.push(`必須関数がない: ${fn}`);
  }

  const forbiddenSource = [
    [/GITHUB_TOKEN/, 'GitHub token参照'],
    [/CMS_PUBLISH_TOKEN/, '本番CMS token参照'],
    [/cms\/(?:assist-)?publish/, '公開ブランチ参照'],
    [/api\.github\.com/, 'GitHub API参照'],
    [/git\/refs|actions\/workflows/i, 'GitHub公開処理'],
    [/DriveApp/, 'P12-9前のDrive処理'],
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, 'メールアドレス直書き'],
    [/(?:ghp|github_pat)_[A-Za-z0-9_]{10,}/, 'tokenらしき文字列'],
  ];
  for (const [pattern, label] of forbiddenSource) {
    if (pattern.test(`${gas}\n${html}\n${guide}`)) issues.push(`testソースに禁止対象: ${label}`);
  }
  if (!/GitHubへのpush、公開サイト更新、本番モンスターCMS/.test(gas)) {
    issues.push('コード.gsに非公開境界の宣言がない');
  }
  if (!/P12-8では本番データ変更を避けるため同居させない/.test(guide)) {
    issues.push('READMEに独立testスプレッドシート方針がない');
  }
  if (!/<span class="test">TEST<\/span>/.test(html)) issues.push('管理画面にTEST表示がない');

  const calledApis = [...html.matchAll(/call\(['"](api_[A-Za-z0-9_]+)['"]/g)].map(match => match[1]);
  for (const api of new Set(calledApis)) {
    if (!new RegExp(`function\\s+${api}\\s*\\(`).test(gas)) issues.push(`HTMLから未定義APIを呼んでいる: ${api}`);
  }

  let cardsDoc;
  let effectsDoc;
  let abilitiesDoc;
  try {
    cardsDoc = json(root, DATA_FILES[0]);
    effectsDoc = json(root, DATA_FILES[1]);
    abilitiesDoc = json(root, DATA_FILES[2]);
  } catch (error) {
    issues.push(`3DBのJSON解析に失敗: ${error.message}`);
    return issues;
  }
  if (cardsDoc.schemaVersion !== 1 || !Array.isArray(cardsDoc.cards)) {
    issues.push('カードDBのschemaVersion/cardsが不正');
    return issues;
  }
  if (effectsDoc.schemaVersion !== 1 || !effectsDoc.cards || Array.isArray(effectsDoc.cards)) {
    issues.push('効果DBのschemaVersion/cardsが不正');
    return issues;
  }
  if (abilitiesDoc.schemaVersion !== 1 || !Array.isArray(abilitiesDoc.abilities)) {
    issues.push('能力DBのschemaVersion/abilitiesが不正');
    return issues;
  }

  const cardIds = cardsDoc.cards.map(card => card.cardId);
  const cardIdSet = new Set(cardIds);
  const duplicateCardIds = duplicates(cardIds);
  if (duplicateCardIds.length || cardIds.some(cardId => !cardId)) issues.push(`cardId重複または空欄: ${duplicateCardIds.join(', ')}`);
  for (const card of cardsDoc.cards) {
    if (!card.name || !card.image || !card.cardType) issues.push(`${card.cardId}: カード必須文字列が空欄`);
    if (!ALLOWED.rarity.has(card.rarity)) issues.push(`${card.cardId}: rarity不正`);
    if (!ALLOWED.aura.has(card.aura)) issues.push(`${card.cardId}: aura不正`);
    if (card.monType !== null && !ALLOWED.monType.has(card.monType)) issues.push(`${card.cardId}: monType不正`);
    if (!ALLOWED.cardStatus.has(card.status)) issues.push(`${card.cardId}: status不正`);
    if (!Array.isArray(card.terrain) || !Array.isArray(card.formations)) issues.push(`${card.cardId}: terrain/formations不正`);
  }

  const effectCardIds = new Set(Object.keys(effectsDoc.cards));
  if (!sameSet(cardIdSet, effectCardIds)) issues.push('効果DBのcardId集合がカードDBと不一致');
  const effectIds = [];
  for (const [cardId, group] of Object.entries(effectsDoc.cards)) {
    if (!group || !Array.isArray(group.effects)) { issues.push(`${cardId}: effectsが配列でない`); continue; }
    if (group.effects.length === 0 && group.status !== 'draft') issues.push(`${cardId}: 空effectsはdraft必須`);
    if (group.effects.length > 0 && group.status !== 'verified') issues.push(`${cardId}: 効果ありはverified必須`);
    group.effects.forEach((effect, index) => {
      effectIds.push(effect.effectId);
      if (!effect.effectId || !effect.name || !effect.description) issues.push(`${cardId}: 効果必須文字列が空欄`);
      if (!ALLOWED.unlockRank.has(effect.unlockRank)) issues.push(`${effect.effectId}: unlockRank不正`);
      if (effect.sortOrder !== index + 1) issues.push(`${effect.effectId}: sortOrder不連続`);
    });
  }
  const duplicateEffectIds = duplicates(effectIds);
  if (duplicateEffectIds.length) issues.push(`effectId重複: ${duplicateEffectIds.slice(0, 5).join(', ')}`);

  const abilityIds = [];
  const legacyIds = [];
  const resolvedOrders = new Map();
  for (const ability of abilitiesDoc.abilities) {
    abilityIds.push(ability.abilityId);
    legacyIds.push(ability.legacyId);
    if (!ability.abilityId || !ability.sourceName || !ability.name || !ability.description) {
      issues.push(`${ability.abilityId}: 能力必須文字列が空欄`);
    }
    if (!ALLOWED.abilitySource.has(ability.source)) issues.push(`${ability.abilityId}: source不正`);
    if (!ALLOWED.linkStatus.has(ability.linkStatus)) issues.push(`${ability.abilityId}: linkStatus不正`);
    if (!ALLOWED.abilityStatus.has(ability.status)) issues.push(`${ability.abilityId}: status不正`);
    if (!Array.isArray(ability.tags) || !Array.isArray(ability.flags)) issues.push(`${ability.abilityId}: tags/flags不正`);
    if (ability.linkStatus === 'resolved') {
      if (!cardIdSet.has(ability.cardId)) issues.push(`${ability.abilityId}: resolvedのcardId不正`);
      if (!Number.isInteger(ability.sortOrder)) issues.push(`${ability.abilityId}: resolvedのsortOrder不正`);
      if (!resolvedOrders.has(ability.cardId)) resolvedOrders.set(ability.cardId, []);
      resolvedOrders.get(ability.cardId).push(ability.sortOrder);
    } else if (ability.cardId !== null || ability.sortOrder !== null) {
      issues.push(`${ability.abilityId}: resolved以外はcardId/sortOrder null必須`);
    }
  }
  const duplicateAbilityIds = duplicates(abilityIds);
  const duplicateLegacyIds = duplicates(legacyIds);
  if (duplicateAbilityIds.length) issues.push(`abilityId重複: ${duplicateAbilityIds.slice(0, 5).join(', ')}`);
  if (duplicateLegacyIds.length) issues.push(`legacyId重複: ${duplicateLegacyIds.slice(0, 5).join(', ')}`);
  for (const [cardId, orders] of resolvedOrders) {
    const sorted = [...orders].sort((a, b) => a - b);
    if (sorted.some((order, index) => order !== index + 1)) issues.push(`${cardId}: resolved能力sortOrder不連続`);
  }

  return issues;
}

function runCli() {
  const rootArgIndex = process.argv.indexOf('--root');
  const root = rootArgIndex >= 0 ? path.resolve(process.argv[rootArgIndex + 1]) : process.cwd();
  const quiet = process.argv.includes('--quiet');
  const issues = validateRoot(root);
  if (!quiet || issues.length) {
    console.log(issues.length ? `FAIL アシストCMS検査 ${issues.length}件` : 'PASS アシストCMS test境界・3DB構造');
    for (const issue of issues) console.log(`  - ${issue}`);
  }
  if (issues.length) process.exitCode = 1;
}

if (require.main === module) runCli();

module.exports = { validateRoot };
