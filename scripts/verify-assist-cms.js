#!/usr/bin/env node
/** P12-8 アシストCMSのtest境界と3DB構造を検証する。 */

const fs = require('fs');
const path = require('path');

const SOURCE_FILES = [
  '_cms/assist-gas/コード.gs',
  '_cms/assist-gas/index.html',
  '_cms/assist-gas/README.md',
  'scripts/assist-effect-ocr.js',
  'scripts/test-assist-effect-ocr.js',
];
const DATA_FILES = [
  'src/data/assist-cards.json',
  'src/data/assist-effects.json',
  'src/data/assist-abilities.json',
];

const ALLOWED = {
  rarity: new Set(['MR', 'SSR']),
  aura: new Set(['赤', '緑', '黄', '白', '黒', '青']),
  cardType: new Set([
    'ガード', 'かしこさ', 'ジャッジ', 'アサルト', '回避', '師匠',
    'ちから', 'テクニック', '友人', '丈夫さ', 'インパクト', 'フォース',
    '命中', 'メンタル', 'フィジカル', 'クイック', 'サバイブ', 'ライバル',
    'ルミナス', 'バイタル', 'フォーカス', 'タフネス', 'ライフ', 'アキュメン',
  ]),
  monType: new Set(['幻霊', '無機', '創造', '獣族', '魔族', '怪物']),
  unlockRank: new Set(['無凸', '1凸', '2凸', '3凸', '4凸']),
  abilitySource: new Set(['イベント', '閃き', 'EXトレ']),
  linkStatus: new Set(['resolved', 'ambiguous', 'unlinked']),
  abilityStatus: new Set(['draft', 'verified']),
  accessoryStatus: new Set(['unknown', 'yes', 'no']),
};
const RATING_KEYS = ['ikusei', 'karyo', 'battle', 'ta'];

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
  const effectOcr = read(root, SOURCE_FILES[3]);

  if (Buffer.byteLength(gas) > 100 * 1024) issues.push('コード.gsが100KBを超えている');
  if (!/prop_\('ENVIRONMENT'\)\s*!==\s*'test'/.test(gas)) issues.push('ENVIRONMENT=testの強制検査がない');
  if (!/P12-8 ASSIST CMS TEST/.test(gas)) issues.push('testスプレッドシートのマーカー検査がない');
  if (!/releasedAt:\s*dateCell_\(row\.releasedAt\)/.test(gas)) issues.push('SheetsのDateをYYYY/MM/DDへ戻す処理がない');
  if (!/withStats:\s*cards\.filter\(function \(card\) \{ return card\.stats\.length > 0; \}\)\.length/.test(gas)) {
    issues.push('withStatsが入力済みstats配列だけを数えていない');
  }
  for (const sheet of ['members', 'cards', 'assist_effects', 'abilities', 'publish_log']) {
    if (!new RegExp(`['"]${sheet}['"]`).test(gas)) issues.push(`必須シート定義がない: ${sheet}`);
  }
  for (const fn of [
    'setup1_createSheets', 'setup2_registerMe', 'setup3_importFromMain', 'setup4_check', 'setup5_createAssistImageFolder',
    'doGet', 'api_bootstrap', 'api_getCard', 'api_saveCard', 'api_saveEffects',
    'api_getAbility', 'api_saveAbility', 'api_export', 'validateDocuments_',
    'api_ocrEffectImage', 'api_uploadCardImage',
  ]) {
    if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(gas)) issues.push(`必須関数がない: ${fn}`);
  }

  const forbiddenSource = [
    [/GITHUB_TOKEN/, 'GitHub token参照'],
    [/CMS_PUBLISH_TOKEN/, '本番CMS token参照'],
    [/cms\/(?:assist-)?publish/, '公開ブランチ参照'],
    [/api\.github\.com/, 'GitHub API参照'],
    [/git\/refs|actions\/workflows/i, 'GitHub公開処理'],
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
  if (/jsonField\s*\(|効果（JSON配列）|（JSON）/.test(html)) issues.push('管理画面にJSON直接入力が残っている');
  if (/地形適性|renderTerrainFields|name=["']terrain["']/.test(html)) issues.push('管理画面に不要な地形適性入力が残っている');
  if (/距離適性|f_distance/.test(html)) issues.push('管理画面に不要な距離適性入力が残っている');
  if (/cardStatus|状態すべて|card\.status/.test(html)) issues.push('管理画面に不要なカードstatusが残っている');
  for (const fn of [
    'renderAccessoryField', 'collectRatings', 'collectStats', 'collectFormations',
    'collectEffects', 'collectTags', 'sourceManagedField',
  ]) {
    if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(html)) issues.push(`構造化フォーム関数がない: ${fn}`);
  }
  if (!/var original=state\.ability\.tags\|\|\[\]/.test(html)) issues.push('能力タグの既存順序を保持していない');
  if (!/activationScope:\s*'unknown'/.test(effectOcr) || !/verified:\s*false/.test(effectOcr) || /verified:\s*true/.test(effectOcr)) {
    issues.push('効果OCR候補が背景未判定または未確認で開始しない');
  }
  if (!/conditional/.test(effectOcr) || !/universal/.test(effectOcr) || !/yellowBias/.test(effectOcr)) {
    issues.push('効果OCRに黄・金色条件付き／白背景汎用の画像判定がない');
  }
  if (!/extractActivationConditions/.test(effectOcr) || !/activationConditions/.test(effectOcr) ||
      !/mainBloodlineMatch/.test(effectOcr) || !/subBloodlineMatch/.test(effectOcr) ||
      !/auraMatch/.test(effectOcr) || !/monTypeMatch/.test(effectOcr) ||
      !/speciesMatch/.test(effectOcr) || !/operator:\s*hasOr\s*\?\s*'or'\s*:\s*'and'/.test(effectOcr)) {
    issues.push('効果OCRに全体発動条件5種またはOR条件の保持がない');
  }
  if (!/detectUnlockRank/.test(effectOcr) || !/blueMarkers/.test(effectOcr)) {
    issues.push('効果OCRに青丸数の解放段階判定がない');
  }
  if (!/mergeScreenshotCandidates/.test(effectOcr) || !/sourceScreenshots/.test(effectOcr)) {
    issues.push('効果OCRにスクロール画像重複の統合がない');
  }
  if (!/tabButton\('ocr','効果OCR'/.test(html) || !/id="ocrFiles"[^>]+multiple/.test(html) ||
      !/function\s+runEffectOcr\s*\(/.test(html) || !/function\s+collectOcrCandidates\s*\(/.test(html) ||
      !/function\s+applyOcrCandidates\s*\(/.test(html) || !/function\s+populateOcrConditionFields\s*\(/.test(html) ||
      !/activation\?\s*'conditional'\s*:\s*'universal'/.test(html)) {
    issues.push('test CMSに複数画像OCR・候補レビュー画面がない');
  }
  if (!/function\s+api_ocrEffectImage\s*\(/.test(gas) || !/DOCUMENT_TEXT_DETECTION/.test(gas) ||
      !/languageHints:\s*\['ja'\]/.test(gas) || !/optionalProp_\('GOOGLE_CLOUD_VISION_API_KEY'\)/.test(gas)) {
    issues.push('test GASにScript Properties経由の日本語Vision OCRがない');
  }
  const assistImageFolderBlock = gas.match(/function\s+assistImageFolder_\s*\([\s\S]*?(?=function\s+api_uploadCardImage\s*\()/);
  const cardImageUploadBlock = gas.match(/function\s+api_uploadCardImage\s*\([\s\S]*?(?=function\s+api_ocrEffectImage\s*\()/);
  const setup5Block = gas.match(/function\s+setup5_createAssistImageFolder\s*\([\s\S]*?(?=\/\/ ---------------------------------------------------------------- 認証)/);
  if (!/function\s+api_uploadCardImage\s*\(/.test(gas) || !/ASSIST_IMAGE_FOLDER_ID/.test(gas) ||
      !/DriveApp\.getFolderById/.test(gas) ||
      !(assistImageFolderBlock && /optionalProp_\('ASSIST_IMAGE_FOLDER_ID'\)/.test(assistImageFolderBlock[0]) &&
        /return root;/.test(assistImageFolderBlock[0]) && !/getFoldersByName|createFolder/.test(assistImageFolderBlock[0])) ||
      !(setup5Block && /optionalProp_\('ASSIST_IMAGE_FOLDER_ID'\)/.test(setup5Block[0]) &&
        /DriveApp\.getFolderById/.test(setup5Block[0]) && !/DriveApp\.createFolder/.test(setup5Block[0])) ||
      !/CARD_IMAGE_MAX_BYTES\s*=\s*2 \* 1024 \* 1024/.test(gas) ||
      !(cardImageUploadBlock && /isExpectedImage_\(bytes, mimeType\)/.test(cardImageUploadBlock[0])) ||
      !/oldFile\.setTrashed\(true\)/.test(gas) || !/file\.setTrashed\(false\)/.test(gas) ||
      !/imagePath\s*=\s*'assist-cards\/'/.test(gas) ||
      !/id="f_imageFile"/.test(html) || !/id="btnUploadCardImage"/.test(html) ||
      !/function\s+uploadCardImage\s*\(/.test(html) || !/version:state\.detail\.version/.test(html) ||
      !/file\.size>2\*1024\*1024/.test(html)) {
    issues.push('カード画像をtest Driveへ安全にアップロードする経路がない');
  }
  if (!/headers:\s*\{\s*['"]x-goog-api-key['"]:\s*apiKey\s*\}/.test(gas) ||
      /images:annotate\?key=/.test(gas)) {
    issues.push('Vision APIキーがURLではなくx-goog-api-keyヘッダーで送信されていない');
  }
  if (!/function\s+reserveOcrDailyUsage_\s*\(/.test(gas) ||
      !/positiveIntProp_\('OCR_DAILY_LIMIT'\)/.test(gas) ||
      !/getProperty\('OCR_DAILY_USAGE'\)/.test(gas) ||
      !/setProperty\('OCR_DAILY_USAGE'/.test(gas) ||
      !/LockService\.getScriptLock\(\)/.test(gas) ||
      !/var usage = reserveOcrDailyUsage_\(\);[\s\S]*UrlFetchApp\.fetch/.test(gas)) {
    issues.push('OCR_DAILY_LIMITの日次上限をVision送信前に競合なく強制していない');
  }
  if (/capture_queue|SHEET_CAPTURE_QUEUE|api_(?:saveEffectOcrCandidates|getEffectOcrCapture|reviewEffectOcrCapture)/.test(gas + html)) {
    issues.push('撤去済みcapture_queueまたは永続化APIが残っている');
  }
  if (!/if\(!types\.length\)throw new Error/.test(html) ||
      !/if\(!source\)throw new Error/.test(html)) {
    issues.push('黄色背景の条件付き候補を発動条件未選択のまま進行できる');
  }
  if (!/id="ocrSourceConfirmed"/.test(html) || !/if\(!el\('ocrSourceConfirmed'\)\.checked\)throw new Error/.test(html) ||
      !/候補を破棄/.test(html) || !/ブラウザ内に保持/.test(html)) {
    issues.push('OCR候補が原画像確認なしで反映できる、またはブラウザ内一時保持になっていない');
  }
  if (!/function\s+ocrBreederDependency\s*\(/.test(html) || !/breeder-dependency/.test(html) ||
      !/モン類ブリーダー/.test(effectOcr) || !/オーラブリーダー/.test(effectOcr) ||
      !/basis:\s*'breeder-dependency'/.test(effectOcr)) {
    issues.push('モン類・オーラブリーダー派生効果の一致条件を保持できない');
  }
  if (!/fieldset\.ocr-candidate\.conditional/.test(html) || !/class="busy-overlay"/.test(html) ||
      !/#message\.show/.test(html) || !/--message-bottom/.test(html) ||
      !/actions\?actions\.offsetHeight:0/.test(html) || !/OCR処理中/.test(html)) {
    issues.push('OCR候補の条件背景・処理中表示・下部通知がない');
  }
  const ocrApiBlock = gas.match(/function\s+api_ocrEffectImage\s*\([\s\S]*?(?=function\s+api_getCard\s*\()/);
  if (ocrApiBlock && /DriveApp/.test(ocrApiBlock[0])) issues.push('OCR原画像をDriveへ保存している');
  if (!/limitBreakJson:\s*jsonCell_\(currentCard\.limitBreak\)/.test(gas) ||
      !/sapoRefJson:\s*jsonCell_\(currentCard\.sapoRef\)/.test(gas) ||
      !/flagsJson:\s*row\.flagsJson/.test(gas)) {
    issues.push('参照専用項目をサーバー側で保持していない');
  }
  if (!/inList_\(card\.cardType,\s*CARD_TYPES/.test(gas) ||
      !/validateImagePath_\(card,\s*true\)/.test(gas) ||
      !/validateReleasedAt_\(card\.releasedAt/.test(gas) ||
      !/validateRatings_\(card\.ratings/.test(gas) ||
      !/concat\(validateImageFiles_\(docs\.cards\.cards\)\)/.test(gas)) {
    issues.push('カード保存・exportの必須値検査が不足');
  }

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
  if (cardsDoc.schemaVersion !== 3 || !Array.isArray(cardsDoc.cards)) {
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
    if (!ALLOWED.cardType.has(card.cardType)) issues.push(`${card.cardId}: cardType不正`);
    if (card.monType !== null && !ALLOWED.monType.has(card.monType)) issues.push(`${card.cardId}: monType不正`);
    if (!ALLOWED.accessoryStatus.has(card.accessoryStatus)) issues.push(`${card.cardId}: accessoryStatus不正`);
    if ('distance' in card || 'terrain' in card || 'status' in card) issues.push(`${card.cardId}: 削除済みカード項目が残存`);
    if (!Array.isArray(card.formations)) issues.push(`${card.cardId}: formations不正`);
    if (card.event2 !== null && (typeof card.event2 !== 'string' || !card.event2.trim())) issues.push(`${card.cardId}: event2不正`);
    const expectedImage = new RegExp(`^assist-cards/${card.cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(?:jpg|jpeg|png|webp)$`, 'i');
    if (!expectedImage.test(card.image || '') || !fs.existsSync(path.join(root, card.image || ''))) issues.push(`${card.cardId}: imageパスまたは実在不正`);
    if (card.releasedAt !== null) {
      const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(card.releasedAt);
      const date = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (!match || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3])) issues.push(`${card.cardId}: releasedAt不正`);
    }
    if (card.ratings !== null && (!card.ratings || Object.keys(card.ratings).sort().join() !== [...RATING_KEYS].sort().join() ||
        Object.values(card.ratings).some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > 5)))) {
      issues.push(`${card.cardId}: ratingsの構造が不正`);
    }
    if (!Array.isArray(card.stats) || ![0, 3].includes(card.stats.length) ||
        card.stats.some(row => !row || typeof row.label !== 'string' || !row.label.trim() ||
          typeof row.value !== 'string' || !/^\+\d+(?:\.\d+)?%?$/.test(row.value)) ||
        duplicates((card.stats || []).map(row => row && row.label)).length) {
      issues.push(`${card.cardId}: statsの構造が不正`);
    }
  }
  const ruri = cardsDoc.cards.find(card => card.cardId === 'b17h-MR-ruri');
  if (!ruri || ruri.cardType !== 'アキュメン') issues.push('ルリのcardTypeはアキュメン必須');
  const withStats = cardsDoc.cards.filter(card => card.stats.length > 0).length;
  if (!cardsDoc.counts || cardsDoc.counts.withStats !== withStats) issues.push('counts.withStatsがstats配列と不一致');
  for (const card of cardsDoc.cards) {
    if (!Array.isArray(card.formations)) continue;
    card.formations.forEach((formation, index) => {
      if (!formation || !formation.title || !Array.isArray(formation.cards) || formation.cards.length !== 5) {
        issues.push(`${card.cardId}: formation ${index + 1}の構造が不正`);
        return;
      }
      if (formation.cards.some(cardId => cardId && !cardIdSet.has(cardId)) ||
          (formation.rental && !cardIdSet.has(formation.rental))) {
        issues.push(`${card.cardId}: formation ${index + 1}に未知cardId`);
      }
    });
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
    else if ([...ability.tags, ...ability.flags].some(value => typeof value !== 'string' || !value.trim()) ||
        duplicates(ability.tags).length || duplicates(ability.flags).length) {
      issues.push(`${ability.abilityId}: tags/flagsの値または重複が不正`);
    }
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
