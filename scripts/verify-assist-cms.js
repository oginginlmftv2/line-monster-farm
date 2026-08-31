#!/usr/bin/env node
/** 統合アシストCMSのソース境界と3DB構造を検証する。 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { LMFDB_CARD_MAP_FILE, LMFDB_CARD_MAP_SCHEMA_VERSION, renderLmfdbCardMap } = require('./lmfdb-card-map');

const SOURCE_FILES = [
  '_cms/gas/20_assist.gs',
  '_cms/gas/ui_assist.html',
  '_cms/gas/README.md',
  'scripts/assist-effect-ocr.js',
  'scripts/test-assist-effect-ocr.js',
];
const SUPPORT_FILES = {
  core: '_cms/gas/00_core.gs',
  monsterGas: '_cms/gas/10_monster.gs',
  publishGas: '_cms/gas/30_publish.gs',
  lmfdbWriteGas: '_cms/gas/25_lmfdb_write.gs',
  setupGas: '_cms/gas/40_setup.gs',
  shell: '_cms/gas/index.html',
  commonHtml: '_cms/gas/ui_common.html',
  monsterHtml: '_cms/gas/ui_monster.html',
};
const DATA_FILES = [
  'src/data/assist-cards.json',
  'src/data/assist-effects.json',
  'src/data/assist-abilities.json',
];
// 対応表はbuild.jsの生成物なので、公開経路3本が生成物として許可している必要がある。
const GENERATED_SOURCE_VERIFIERS = [
  'scripts/verify-assist-source.js',
  'scripts/verify-cms-source.js',
  'scripts/verify-gacha-source.js',
];
const LMFDB_FIXED_FIXTURE = 'scripts/fixtures/lmfdb-abilities-dad5d301.json.gz';
const LMFDB_AUDIT_UI_TEST = 'scripts/test-asst-lmfdb-audit-ui.js';
const LMFDB_CREATE_API_TEST = 'scripts/test-asst-lmfdb-create-api.js';
const LMFDB_WRITE_SAFETY_TEST = 'scripts/test-asst-lmfdb-write-safety.js';
const CARD_CREATE_API_TEST = 'scripts/test-asst-card-create-api.js';
const CARD_IMAGE_FLOW_TEST = 'scripts/test-asst-card-image-flow.js';
const ASSIST_PAGE_BUILDER = 'scripts/build-assist-pages.js';
const ASSIST_INDEX_BUILD_TEST = 'scripts/test-assist-index-build.js';
const ASSIST_SOURCE_VERIFIER = 'scripts/verify-assist-source.js';

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
  abilitySource: new Set(['イベント', '閃き', 'EXトレ', '伝授']),
  abilityRarity: new Set(['MR', 'SSR', 'SR', 'その他']),
  linkStatus: new Set(['resolved', 'ambiguous', 'unlinked']),
  abilityStatus: new Set(['draft', 'verified']),
  accessoryStatus: new Set(['unknown', 'yes', 'no']),
};
const RATING_KEYS = ['ikusei', 'karyo', 'battle', 'ta'];
const MIGRATED_ABILITY_COUNT = 1079;
const MIGRATED_ABILITY_RECORDS_SHA256 = '85d909c797f7852e6c817b99b6908a9ec1592e9915cf460e71ee53062d7b8da3';

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

function filesUnder(root, relative) {
  const absolute = path.join(root, relative);
  const result = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(root, child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

function functionBlock(source, name) {
  const pattern = new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?(?=\\nfunction\\s+|$)`);
  const match = source.match(pattern);
  return match ? match[0] : '';
}

function validateRoot(root) {
  const issues = [];
  for (const relative of [...SOURCE_FILES, ...Object.values(SUPPORT_FILES), ...DATA_FILES, LMFDB_CARD_MAP_FILE, LMFDB_FIXED_FIXTURE, LMFDB_AUDIT_UI_TEST, LMFDB_CREATE_API_TEST, LMFDB_WRITE_SAFETY_TEST, CARD_CREATE_API_TEST, CARD_IMAGE_FLOW_TEST, ASSIST_PAGE_BUILDER, ASSIST_INDEX_BUILD_TEST, ASSIST_SOURCE_VERIFIER]) {
    if (!fs.existsSync(path.join(root, relative))) issues.push(`必須ファイルがない: ${relative}`);
  }
  if (issues.length) return issues;

  const gas = read(root, SOURCE_FILES[0]);
  const html = read(root, SOURCE_FILES[1]);
  const guide = read(root, SOURCE_FILES[2]);
  const effectOcr = read(root, SOURCE_FILES[3]);
  const core = read(root, SUPPORT_FILES.core);
  const monsterGas = read(root, SUPPORT_FILES.monsterGas);
  const publishGas = read(root, SUPPORT_FILES.publishGas);
  const lmfdbWriteGas = read(root, SUPPORT_FILES.lmfdbWriteGas);
  const setupGas = read(root, SUPPORT_FILES.setupGas);
  const shell = read(root, SUPPORT_FILES.shell);
  const commonHtml = read(root, SUPPORT_FILES.commonHtml);
  const monsterHtml = read(root, SUPPORT_FILES.monsterHtml);
  const allAssistGas = `${core}\n${gas}\n${lmfdbWriteGas}\n${setupGas}`;
  const assistPageBuilder = read(root, ASSIST_PAGE_BUILDER);
  const lmfdbWriteSafetyTest = read(root, LMFDB_WRITE_SAFETY_TEST);
  const cardCreateApiTest = read(root, CARD_CREATE_API_TEST);
  const cardImageFlowTest = read(root, CARD_IMAGE_FLOW_TEST);
  const assistIndexBuildTest = read(root, ASSIST_INDEX_BUILD_TEST);
  const assistSourceVerifier = read(root, ASSIST_SOURCE_VERIFIER);
  const abilityBuildBlock = functionBlock(gas, 'asstBuildDocuments_');
  const assistExportBlock = functionBlock(gas, 'api_asstExport');
  const assistPublishBlock = functionBlock(publishGas, 'api_asstPublish');
  const auditApiBlock = functionBlock(gas, 'api_asstAuditExternalAbilities');
  const auditFunctionNames = [...gas.matchAll(/function\s+(asstAudit[A-Za-z0-9_]*|api_asstAuditExternalAbilities)\s*\(/g)]
    .map(match => match[1]);
  const auditSource = auditFunctionNames.map(name => functionBlock(gas, name)).join('\n');
  const auditUiFunctionNames = [...html.matchAll(/function\s+(asst[A-Za-z0-9_]*Audit[A-Za-z0-9_]*)\s*\(/g)].map(match => match[1]);
  const auditUiSource = auditUiFunctionNames.map(name => functionBlock(html, name)).join('\n');
  const auditDetailOpenBlock = functionBlock(html, 'asstOpenAuditDetail');
  const auditPreviewBlock = functionBlock(html, 'asstBuildAuditPreview');
  const auditValidationBlock = functionBlock(html, 'asstAuditDraftIssues');
  const auditReadOnlyBlock = functionBlock(html, 'asstAuditReadOnly');
  const cardCreateApiBlock = functionBlock(gas, 'api_asstCreateCard');
  const cardCreatePayloadBlock = functionBlock(gas, 'asstCreateCardPayload_');
  const cardCreateSourceOrderBlock = functionBlock(gas, 'asstValidateCardSourceOrders_');
  const cardCreateUiBlock = [
    'asstOpenCreateCard', 'asstRenderCreateCardForm', 'asstCollectCreateCard', 'asstCreateCard',
  ].map(name => functionBlock(html, name)).join('\n');

  if (Buffer.byteLength(gas) > 100 * 1024) issues.push('20_assist.gsが100KBを超えている');
  if (!/ENVIRONMENT は production または rehearsal/.test(core)) {
    issues.push('環境値の検査がない');
  }
  if (!/BOOK_MARKER_PREFIX/.test(core) ||
      !/getSheetByName\(SHEET_MEMBERS\)[\s\S]{0,200}getRange\('A1'\)\.getNote\(\)/.test(core)) {
    issues.push('環境マーカーをmembersシートのA1から読んでいない');
  }
  if (/getSheets\(\)\[0\]/.test(core)) issues.push('シート順に依存する参照が残っている');
  if (!/releasedAt:\s*asstDateCell_\(row\.releasedAt\)/.test(gas)) issues.push('SheetsのDateをYYYY/MM/DDへ戻す処理がない');
  if (!/withStats:\s*cards\.filter\(function \(card\) \{ return card\.stats\.length > 0; \}\)\.length/.test(gas)) {
    issues.push('withStatsが入力済みstats配列だけを数えていない');
  }
  for (const sheet of ['members', 'cards', 'assist_effects', 'abilities', 'assist_log', 'assist_publish_log']) {
    if (!new RegExp(`['"]${sheet}['"]`).test(`${core}\n${gas}`)) issues.push(`必須シート定義がない: ${sheet}`);
  }
  const externalRefHeaders = [
    'provider', 'candidateKey', 'externalNumericId', 'firstSeenSha', 'lastSeenSha',
    'externalFingerprint', 'comparisonFingerprint', 'externalSnapshotJson', 'disposition',
    'abilityId', 'importedAt', 'importedBy', 'decidedAt', 'decidedBy', 'reviewFlagsJson',
    'note', 'version',
  ];
  const externalRefHeaderLiteral = `[${externalRefHeaders.map(value => `'${value}'`).join(',')}]`;
  if (!/ASST_SHEET_ABILITY_EXTERNAL_REFS\s*=\s*['"]ability_external_refs['"]/.test(gas) ||
      !gas.includes(`ASST_HEADERS[ASST_SHEET_ABILITY_EXTERNAL_REFS] = ${externalRefHeaderLiteral};`) ||
      !gas.includes(`var ASST_EXTERNAL_REF_HEADERS = ${externalRefHeaderLiteral};`)) {
    issues.push('ability_external_refsの列名または順序が設計第13章と不一致');
  }
  for (const fn of ['asstLegacyId_', 'asstNextAbilityId_', 'asstAssertAbilityIdAvailable_', 'asstAbilityToSheetRow_', 'asstExternalRefFromRow_', 'asstValidateExternalRefRows_', 'asstValidateAbilityRecord_']) {
    if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(gas)) issues.push(`能力schema基盤の必須関数がない: ${fn}`);
  }
  if (!/ASST_ABILITY_SOURCES\s*=\s*\['イベント','閃き','EXトレ','伝授'\]/.test(gas) ||
      !/ASST_ABILITY_RARITIES\s*=\s*\['MR','SSR','SR','その他'\]/.test(gas)) {
    issues.push('能力専用source/rarity許可値が設計と不一致');
  }
  if (/ability_external_refs|ASST_SHEET_ABILITY_EXTERNAL_REFS/.test(abilityBuildBlock + assistExportBlock + assistPublishBlock)) {
    issues.push('ability_external_refsが公開3DBまたはGitHub送信対象へ混入');
  }
  for (const fn of [
    'setup1_createSheets', 'setup2_registerMe', 'setup3_importAssistFromMain', 'setup4_checkAll', 'setup5_createAssistImageFolder',
    'doGet', 'api_bootstrapShell', 'api_asstBootstrap', 'api_asstCreateCard', 'api_asstGetCard', 'api_asstSaveCard', 'api_asstSaveEffects',
    'api_asstGetAbility', 'api_asstSaveAbility', 'api_asstExport', 'asstValidateDocuments_',
    'api_asstOcrEffectImage', 'api_asstUploadCardImage', 'api_asstAuditExternalAbilities',
    'api_asstCreateAbilityFromExternalCandidate', 'api_asstSetExternalCandidateDisposition',
  ]) {
    if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(allAssistGas)) issues.push(`必須関数がない: ${fn}`);
  }
  if (!/ASST_CARD_ID_MAX_LENGTH\s*=\s*64/.test(gas) || !/ASST_CARD_ID_MAX_LENGTH=64/.test(html) ||
      !cardCreatePayloadBlock || !/var allowed = \['cardId','name','rarity','aura','cardType','monType'\]/.test(cardCreatePayloadBlock) ||
      !/\^\[a-z\]\[a-z0-9\]\*-\(MR\|SSR\)-\[a-z0-9\]\+\$/.test(cardCreatePayloadBlock) ||
      !/idMatch\[1\] !== rarity/.test(cardCreatePayloadBlock) || !/\\u0000-\\u001f/.test(cardCreatePayloadBlock) ||
      !/asstInList_\(payload\.rarity, ASST_RARITIES/.test(cardCreatePayloadBlock) ||
      !/asstInList_\(payload\.aura, ASST_AURAS/.test(cardCreatePayloadBlock) ||
      !/asstInList_\(payload\.cardType, ASST_CARD_TYPES/.test(cardCreatePayloadBlock) ||
      !/asstInList_\(payload\.monType, ASST_MON_TYPES/.test(cardCreatePayloadBlock)) {
    issues.push('新規カードのcardId上限・形式・制御文字・rarity一致・許可値の全面検査が不足');
  }
  if (!cardCreateApiBlock || !/asstRequireUser_\(\)/.test(cardCreateApiBlock) || !/user\.nickname/.test(cardCreateApiBlock) ||
      !/asstCreateCardPayload_\(payload\)/.test(cardCreateApiBlock) || !/asstAcquireScriptLock_\(\)/.test(cardCreateApiBlock) ||
      !/var rows = asstRows_\(ASST_SHEET_CARDS\)/.test(cardCreateApiBlock) || !/asstValidateCardSourceOrders_\(rows\)/.test(cardCreateApiBlock) ||
      !/asstAssertNewCardAvailable_\(card, rows\)/.test(cardCreateApiBlock) || !/maxSourceOrder \+ 1/.test(cardCreateApiBlock) ||
      (cardCreateApiBlock.match(/appendRow\(/g) || []).length !== 1 || /asstRewriteSheet_|githubRequest_|UrlFetchApp|DriveApp/.test(cardCreateApiBlock) ||
      !/asstVerifyCreatedCard_\(card\.cardId, sourceOrder, values\)/.test(cardCreateApiBlock) ||
      !/asstAppendLog_\(user, 'create-card', 'PASS'/.test(cardCreateApiBlock) ||
      !/登録済みとして扱い、再実行しないでください/.test(cardCreateApiBlock) ||
      !cardCreateSourceOrderBlock || !/Number\.isSafeInteger/.test(cardCreateSourceOrderBlock) || !/seen\[order\]/.test(cardCreateSourceOrderBlock)) {
    issues.push('新規カード追加専用APIの認証・lock後再検査・末尾1行append・再検算・再実行禁止境界が不足');
  }
  if (!/id="asst_btnCreateCard" disabled>＋ 新規カード</.test(html) ||
      !/el\('asst_btnCreateCard'\)\.disabled=false/.test(html) ||
      !/ローカルプレビューでは新規カードを登録できません/.test(html) ||
      !/新規行として保存されますが、サイトにはまだ公開されません/.test(cardCreateUiBlock) ||
      !/api_asstCreateCard/.test(cardCreateUiBlock) || !/ASST\.cards\.push\(result\.card\)/.test(cardCreateUiBlock) ||
      !/asst_summary/.test(cardCreateUiBlock) || !/asstOpenCard\(result\.cardId/.test(cardCreateUiBlock) ||
      !/画像を追加し、必要項目を編集してください/.test(cardCreateUiBlock) ||
      !/mobile-back/.test(cardCreateUiBlock) || !/cardIdは作成後に変更できません/.test(cardCreateUiBlock)) {
    issues.push('新規カードUIのbootstrap無効化・ローカル禁止・確認・一覧反映・既存編集導線が不足');
  }
  const cardCreateTestMarkers = [
    '初期値・応答・ログが仕様どおり', 'cardId重複', '同一name+rarity', '同名別rarity',
    'cardId形式', 'rarity部分不一致', '許可外rarity', '許可外aura', '許可外cardType', '許可外monType',
    '必須値空欄', 'nickname空欄', 'sourceOrder重複・不正', 'ロック競合', 'ロック取得後の同一cardId追加',
    '行追加後の再検算失敗', 'ログだけ失敗', '再実行禁止',
  ];
  if (cardCreateTestMarkers.some(marker => !cardCreateApiTest.includes(marker))) {
    issues.push('新規カード追加APIの成功・拒否・競合・追加後失敗mockテストが不足');
  }
  const rewriteSheetBlock = functionBlock(setupGas, 'asstRewriteSheet_');
  if (!rewriteSheetBlock || /deleteRows\s*\(/.test(rewriteSheetBlock)) {
    issues.push('asstRewriteSheet_はdeleteRowsでデータ行を全削除しない');
  }
  if (!rewriteSheetBlock || !/insertRowsAfter\s*\(/.test(rewriteSheetBlock) ||
      !/clearContent\s*\(/.test(rewriteSheetBlock) || !/setValues\s*\(/.test(rewriteSheetBlock)) {
    issues.push('asstRewriteSheet_は行数確保・既存領域消去・書き込みを順に行う');
  }

  const forbiddenDomainSource = [
    [/GITHUB_TOKEN/, 'GitHub token参照'],
    [/CMS_PUBLISH_TOKEN/, '本番CMS token参照'],
    [/cms\/(?:assist-)?publish/, '公開ブランチ参照'],
    [/git\/refs|actions\/workflows/i, 'GitHub公開処理'],
  ];
  const domainSource = `${gas}\n${lmfdbWriteGas}\n${html}\n${monsterGas}\n${monsterHtml}`;
  for (const [pattern, label] of forbiddenDomainSource) {
    if (pattern.test(domainSource)) issues.push(`ドメインソースに禁止対象: ${label}`);
  }
  const allowedGitHubReadUrl = 'https://api.github.com/repos/futsalife24-bot/lMfDB/git/ref/heads/main';
  const githubApiReferences = domainSource.match(/https:\/\/api\.github\.com\/[A-Za-z0-9_./-]+/g) || [];
  if (githubApiReferences.some(url => url !== allowedGitHubReadUrl)) {
    issues.push('ドメインソースに許可外のGitHub API参照');
  }
  if (/api\.github\.com/.test(domainSource.replaceAll(allowedGitHubReadUrl, ''))) {
    issues.push('ドメインソースに禁止対象: GitHub API参照');
  }
  if (!auditApiBlock || !/asstRequireUser_\(\)/.test(auditApiBlock) ||
      !/asstAuditPayload_\(payload\)/.test(auditApiBlock) ||
      !/asstAuditResolveExternalSha_\(input\.externalSha\)/.test(auditApiBlock) ||
      !/asstAuditReadLocal_\(\)/.test(auditApiBlock)) {
    issues.push('外部能力監査APIの認証・入力・SHA固定・ローカル読取境界が不足');
  }
  if (!/ASST_LMFDB_RAW_BASE\s*=\s*'https:\/\/raw\.githubusercontent\.com\/futsalife24-bot\/lMfDB\/'/.test(gas) ||
      !/ASST_LMFDB_RAW_PATH\s*=\s*'\/data\/abilities\.json'/.test(gas) ||
      !/ASST_LMFDB_MAIN_REF_URL\s*=\s*'https:\/\/api\.github\.com\/repos\/futsalife24-bot\/lMfDB\/git\/ref\/heads\/main'/.test(gas)) {
    issues.push('lMfDB取得先がmain解決URLと固定SHA raw URL定数に限定されていない');
  }
  if (!/var allowed = \['externalSha','page','pageSize'\]/.test(gas) ||
      /clientUrl|payload\.url|payload\[['"]url['"]\]/.test(auditSource)) {
    issues.push('外部能力監査APIのpayloadがexternalSha/page/pageSizeだけに限定されていない');
  }
  const auditForbidden = /appendRow\s*\(|setValue(?:s)?\s*\(|clearContent\s*\(|deleteRows\s*\(|PropertiesService|CacheService|LockService|ScriptApp|DriveApp|githubRequest_|api_asstCreateAbilityFromExternalCandidate|api_asstSetExternalCandidateDisposition/;
  if (auditForbidden.test(auditSource)) issues.push('外部能力監査APIの読取専用境界に書込み・ロック・永続化処理が混入');
  if (!/id="asst_btnExternalAbilityAudit"[^>]*>外部能力DBを確認</.test(html) ||
      !/api_asstAuditExternalAbilities\(payload\)/.test(auditUiSource) ||
      !/var payload=\{page:page,pageSize:ASST_AUDIT_PAGE_SIZE\}/.test(auditUiSource) ||
      !/if\(ASST\.audit\.externalSha\)payload\.externalSha=ASST\.audit\.externalSha/.test(auditUiSource) ||
      !/if\(latest\)\{ASST\.audit\.externalSha=null/.test(auditUiSource) ||
      !/APP_LOCAL_PREVIEW/.test(auditUiSource) || !/ASST_AUDIT_PAGE_SIZE=50/.test(html)) {
    issues.push('外部能力監査UIの入口・固定SHA・50件ページング・ローカル無効化が不足');
  }
  if (/localStorage|sessionStorage|document\.cookie|CacheStorage|caches\.|PropertiesService|CacheService/.test(auditUiSource)) {
    issues.push('外部能力監査UIが結果をブラウザまたはGASへ永続化している');
  }
  const auditUiWithoutAllowedWrites = auditUiSource
    .replaceAll('api_asstCreateAbilityFromExternalCandidate', '')
    .replaceAll('api_asstSetExternalCandidateDisposition', '');
  if (/fetch\s*\(|XMLHttpRequest|raw\.githubusercontent\.com|api\.github\.com/.test(auditUiSource) ||
      /api_asst(?:Save|Create|Set|Publish|Export|Upload|Ocr)/.test(auditUiWithoutAllowedWrites)) {
    issues.push('外部能力監査UIが許可外の外部取得・書込みAPIを呼んでいる');
  }
  const auditUiRequiredText = [
    '外部コミットSHA', '外部JSON SHA-256', 'auditVersion', 'auditStatus', 'safetyVerdict',
    'blockReasons', 'reviewReasons', '外部件数', 'ローカル件数', 'カード対応候補数',
    '未紐付け候補数', 'ID再利用疑い数', '既存内容差分数', '表記違い数',
    '重複内容一致数', '外部欠落観測数', '処置済み件数', '処置済みを表示',
    '現在ページ', '総ページ', '総候補数', '登録可能候補',
  ];
  if (auditUiRequiredText.some(value => !html.includes(value)) ||
      !/\['representationOnly','表記違い',false\]/.test(html) ||
      !/\['duplicate_local_content_match','重複内容一致',false\]/.test(html) ||
      !/\['missing_upstream_observation','外部欠落観測',false\]/.test(html) ||
      !/esc\(name\|\|'—'\)/.test(auditUiSource) || !/esc\(sourceName\|\|'—'\)/.test(auditUiSource)) {
    issues.push('外部能力監査UIのサマリー・候補表示・折りたたみ・エスケープが不足');
  }
  const auditDetailFunctions = [
    'asstOpenAuditDetail', 'asstReturnFromAuditDetail', 'asstAuditEditable', 'asstRenderAuditOriginal',
    'asstRenderAuditComparison', 'asstRenderAuditRegistration', 'asstAuditDraftIssues',
    'asstBuildAuditPreview', 'asstRenderAuditFinalPreview', 'asstDiscardAuditDetail',
    'asstBindAuditDetail',
  ];
  const auditDetailText = [
    '詳細を確認', '外部能力候補の詳細', '外部原文なし', '完全一致した既存abilityId',
    'NFKC一致した既存abilityId', '同一legacyId比較のabilityId', 'changedFields',
    'normalizedChangedFields', '比較用NFKC', '登録予定値', '保存時にサーバー採番',
    'なし（null）', 'この段階では公開されない', '明示選択してください',
    'クライアント検査は将来のサーバー検査の代わりではありません',
    '最終プレビューを確認', 'まだ保存されていません',
  ];
  if (auditDetailFunctions.some(name => !new RegExp(`function\\s+${name}\\s*\\(`).test(html)) ||
      auditDetailText.some(value => !html.includes(value)) ||
      !/data-audit-detail/.test(html) || !/data-audit-category/.test(html)) {
    issues.push('外部能力候補の詳細・比較・編集プレビューが不足');
  }
  if (/google\.script|api_asstAuditExternalAbilities|\bcall\s*\(/.test(auditDetailOpenBlock) ||
      !/response\.candidates\[index\]/.test(auditDetailOpenBlock)) {
    issues.push('候補詳細が現在のAPI応答だけを使わず再取得している');
  }
  if (!/registration:\{sourceName:d\.sourceName,name:d\.name,description:d\.description,source:d\.source,rarity:d\.rarity,tags:d\.tags\.slice\(\),linkStatus:d\.linkStatus,cardId:/.test(auditPreviewBlock) ||
      !/confirmations:\{originalCompared:/.test(auditPreviewBlock) ||
      /abilityId|legacyId|sourceOrder|sortOrder|status|flags|version|updatedAt|updatedBy|disposition|comparisonFingerprint/.test(auditPreviewBlock)) {
    issues.push('外部能力候補の最終プレビュー契約に不足または内部キー混入');
  }
  if (!/\['イベント','閃き','EXトレ','伝授'\]/.test(auditValidationBlock) ||
      !/\['MR','SSR','SR','その他'\]/.test(auditValidationBlock) ||
      !/\['resolved','unlinked'\]/.test(auditValidationBlock) ||
      !/制御文字/.test(auditValidationBlock) || !/<br>以外/.test(auditValidationBlock) ||
      !/ID再利用疑い/.test(auditValidationBlock) || !/draft・未公開/.test(auditValidationBlock)) {
    issues.push('外部能力候補のクライアントプレビュー検査が不足');
  }
  if (!/esc\(label\)/.test(auditReadOnlyBlock) || !/esc\(asstAuditDisplayValue\(value\)\)/.test(auditReadOnlyBlock) ||
      /id=["']\s*['"]?\+.*candidateKey|id=["']\s*['"]?\+.*external/.test(auditUiSource) ||
      /<textarea[^>]*(?:json|preview)/i.test(html)) {
    issues.push('外部能力候補の詳細描画・DOM識別子・JSON編集欄の安全条件が不足');
  }
  const createApiBlock = functionBlock(lmfdbWriteGas, 'api_asstCreateAbilityFromExternalCandidate');
  const dispositionApiBlock = functionBlock(lmfdbWriteGas, 'api_asstSetExternalCandidateDisposition');
  const compensationBlock = functionBlock(lmfdbWriteGas, 'asstLmfdbCompensate_');
  const journalAppendBlock = functionBlock(lmfdbWriteGas, 'asstLmfdbJournalAppend_');
  const journalUpdateBlock = functionBlock(lmfdbWriteGas, 'asstLmfdbJournalUpdate_');
  if (!createApiBlock || !dispositionApiBlock ||
      !/ASST_LMFDB_CREATE_KEYS/.test(lmfdbWriteGas) || !/ASST_LMFDB_REGISTRATION_KEYS/.test(lmfdbWriteGas) ||
      !/ASST_LMFDB_CONFIRMATION_KEYS/.test(lmfdbWriteGas) || !/asstLmfdbCurrentAudit_\(input\.payload\)/.test(createApiBlock) ||
      !/asstNextAbilityId_/.test(createApiBlock) || !/status:\s*'draft'/.test(createApiBlock) ||
      !/legacyId:\s*null/.test(createApiBlock) || !/asstLmfdbCompensate_\(journal\)/.test(createApiBlock)) {
    issues.push('外部候補追加専用APIの入力契約・再監査・採番・draft・補償境界が不足');
  }
  if (/function\s+asstLmfdb(?:SnapshotSheet_|RestoreSnapshots_)\s*\(/.test(lmfdbWriteGas) ||
      !journalAppendBlock || !journalUpdateBlock || !compensationBlock ||
      !/rowNumber:\s*sheet\.getLastRow\(\) \+ 1/.test(journalAppendBlock) ||
      !/beforeValues:\s*beforeValues\.slice\(\)/.test(journalUpdateBlock) ||
      !/afterValues\.slice\(\)/.test(journalUpdateBlock) ||
      !/journal\.entries\.slice\(\)\.reverse\(\)/.test(compensationBlock) ||
      !/matches\.length !== 1/.test(compensationBlock) ||
      !/matches\[0\]\.rowNumber !== entry\.rowNumber/.test(compensationBlock) ||
      (compensationBlock.match(/asstLmfdbSameValues_\(matches\[0\]\.values, entry\.values\)/g) || []).length < 2 ||
      !/deleteRow\(entry\.rowNumber\)/.test(compensationBlock) ||
      !/asstLmfdbSameValues_\(matches\[0\]\.values, entry\.beforeValues\)/.test(compensationBlock) ||
      !/重大エラー: 補償検算失敗。全保存・公開を停止し、再実行せず、保存前の本番bookコピーと比較/.test(compensationBlock)) {
    issues.push('lMfDB補償が対象行限定の操作ジャーナル・一意確認・重大停止条件を満たさない');
  }
  if (compensationBlock && (/getDataRange\(\)\.getValues\(\)/.test(compensationBlock) ||
      /while[\s\S]{0,120}getLastRow/.test(compensationBlock) || /snapshot/i.test(compensationBlock))) {
    issues.push('lMfDB補償に全シートsnapshot復元またはgetLastRow超過行の一律削除がある');
  }
  const safetyMarkers = [
    'after-abilities-append', 'after-new-ref-append', 'after-existing-ref-update',
    'after-assist-log-append', '補償中も別abilityId・candidateKey・log・既存行更新を完全に保持',
    '追加能力を一意確認できない', '追加refを一意確認できない', '追加logを一意確認できない',
    'deleteRow失敗', 'ref復元setValues失敗', '補償後検算失敗', '本番bookコピーと比較',
  ];
  if (safetyMarkers.some(marker => !lmfdbWriteSafetyTest.includes(marker))) {
    issues.push('段階4-6の操作ジャーナル・無関係行保全・補償失敗mock破壊テストが不足');
  }
  if (!/ASST_LMFDB_ALLOWED_DISPOSITIONS\s*=\s*\['ignored','duplicate','unsupported','id_reused'\]/.test(lmfdbWriteGas) ||
      !/asstLmfdbCurrentAudit_\(input\.payload\)/.test(dispositionApiBlock) ||
      /ASST_SHEET_ABILITIES[\s\S]*?(?:appendRow|setValues)/.test(dispositionApiBlock)) {
    issues.push('外部候補処置APIの許可値・再監査・abilities非変更境界が不足');
  }
  const assistLockFunctions = [
    ['api_asstUploadCardImage', gas], ['api_asstCreateCard', gas], ['api_asstSaveCard', gas], ['api_asstSaveEffects', gas],
    ['api_asstSaveAbility', gas], ['api_asstCreateAbilityFromExternalCandidate', lmfdbWriteGas],
    ['api_asstSetExternalCandidateDisposition', lmfdbWriteGas], ['api_asstPublish', publishGas],
  ];
  if (!/function\s+asstAcquireScriptLock_\s*\([\s\S]*?tryLock\(1\)/.test(gas) ||
      assistLockFunctions.some(([name, source]) => !/asstAcquireScriptLock_\(\)/.test(functionBlock(source, name))) ||
      !/asstAcquireScriptLock_\(\)/.test(functionBlock(gas, 'asstReserveOcrDailyUsage_'))) {
    issues.push('アシスト保存・OCR予約・公開が共通ScriptLockの即時拒否規則へ統一されていない');
  }
  if (assistLockFunctions.some(([name, source]) => {
    const block = functionBlock(source, name);
    return (block.match(/asstAcquireScriptLock_\(\)/g) || []).length !== 1 ||
      (block.match(/asstReleaseScriptLock_\(lock\)/g) || []).length !== 1;
  })) {
    issues.push('アシスト保存・候補処理・公開にScriptLockの二重取得・二重解放または解放欠落がある');
  }
  if (!/ability\.linkStatus === 'resolved'\s*&& ability\.status === 'verified'/.test(assistPageBuilder) ||
      !/buildCardArtifact\(card, effects, abilityData\.abilities/.test(assistPageBuilder)) {
    issues.push('draft resolved能力が生成HTML・本文量・index判定から除外されていない');
  }
  if (!/renderAssistIndex\(assistIndex, cards\)/.test(assistPageBuilder) ||
      !/currentIds\.map\(id => cardById\.get\(id\)\)[\s\S]*\.concat\(cards\.filter/.test(assistPageBuilder) ||
      !/const orderedCards = sortByReleasedAt\(baseCards\)/.test(assistPageBuilder) ||
      !/実装日が無いカードは既存順を維持し新規カードを末尾へ追加する/.test(assistIndexBuildTest) ||
      !/実装日の新しい順に並べ、未設定カードは直前カードへ追従する/.test(assistIndexBuildTest) ||
      !/const GENERATED_FILES = new Set\(\[[^\]]*'assist\.html'[^\]]*'sitemap\.xml'[^\]]*\]\)/.test(assistSourceVerifier)) {
    issues.push('assist.htmlを3DBから実装日降順（未設定は直前カードへ追従）で生成する経路が不足');
  }
  if (!/return ability\.linkStatus === 'resolved' && ability\.status === 'verified'/.test(functionBlock(gas, 'asstPublicPageAbilities_')) ||
      !/asstPublicPageAbilities_\(docs\.abilities\.abilities\)/.test(assistPublishBlock)) {
    issues.push('GAS公開前検査がdraft resolved能力を公開ページ対象から除外していない');
  }
  if (!/getDataRange\(\)\.getValues\(\)/.test(functionBlock(gas, 'asstAuditReadLocal_')) ||
      !/\[ASST_SHEET_CARDS, ASST_SHEET_ABILITIES, ASST_SHEET_ABILITY_EXTERNAL_REFS\]/.test(functionBlock(gas, 'asstAuditReadLocal_'))) {
    issues.push('外部能力監査APIがcards/abilities/ability_external_refsを各1回の範囲読取に限定していない');
  }
  try {
    const cardMap = json(root, LMFDB_CARD_MAP_FILE);
    const expected = renderLmfdbCardMap(json(root, 'src/data/assist-cards.json').cards);
    if (!cardMap || cardMap.schemaVersion !== LMFDB_CARD_MAP_SCHEMA_VERSION || !Array.isArray(cardMap.mappings)) {
      issues.push('lmfdb-card-map.jsonの構造が不正');
    } else if (read(root, LMFDB_CARD_MAP_FILE) !== expected) {
      issues.push('src/data/lmfdb-card-map.jsonがsrc/data/assist-cards.jsonの生成結果と不一致');
    }
    // カード追加のたびに人手更新が必要な凍結hashへ戻さない。
    if (/ASST_LMFDB_CARD_MAP_SHA256/.test(gas)) {
      issues.push('GASへカード対応表の固定hashが再混入');
    }
    if (!/return \{ map: map, sha256: asstSha256_\(JSON\.stringify\(mappings\)\) \};/
      .test(functionBlock(gas, 'asstAuditCardMap_'))) {
      issues.push('GASの対応表がcardsシートからの射影とcardMapSha256の報告になっていない');
    }
    if (!/LMFDB_CARD_MAP_FILE,\s*\n\s*renderLmfdbCardMap\(inputs\.assistCards\)/.test(read(root, 'build.js'))
      || !GENERATED_SOURCE_VERIFIERS.every(file => read(root, file).includes(`'${LMFDB_CARD_MAP_FILE}'`))) {
      issues.push('build.jsが対応表を生成し公開経路が生成物として許可する構成になっていない');
    }
  } catch (error) {
    issues.push(`lMfDBカード対応表の検査に失敗: ${error.message}`);
  }
  const cmsSource = filesUnder(root, '_cms').map(relative => read(root, relative)).join('\n');
  for (const [pattern, label] of [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, 'メールアドレス直書き'],
    [/(?:ghp|github_pat)_[A-Za-z0-9_]{10,}/, 'tokenらしき文字列'],
  ]) {
    if (pattern.test(cmsSource)) issues.push(`_cms配下に禁止対象: ${label}`);
  }
  if (!/api\.github\.com/.test(publishGas)) {
    issues.push('GitHub送信が30_publish.gsのあるべき1か所にない');
  }
  if (!/(常設のtest環境は作りません|本番bookのコピー[\s\S]{0,80}リハーサル)/.test(guide)) {
    issues.push('READMEに常設testを作らず本番bookのコピーでリハーサルする方針がない');
  }
  const rehearsalBlock = shell.match(/if\s*\(\s*data\.environment\s*===\s*['"]rehearsal['"]\s*\)\s*\{([\s\S]{0,300}?)\}/);
  const bannerDisplays = shell.match(/el\(['"]app_env['"]\)\.hidden\s*=\s*false/g) || [];
  if (!/id="app_env"/.test(shell) || !rehearsalBlock ||
      !/el\(['"]app_env['"]\)\.hidden\s*=\s*false/.test(rehearsalBlock[1]) || bannerDisplays.length !== 1 ||
      !/リハーサル環境/.test(rehearsalBlock[1]) || !/公開されません/.test(rehearsalBlock[1]) ||
      !/\.app-env\s*\{/.test(commonHtml)) {
    issues.push('リハーサル環境だけに安全バナーを表示する境界がない');
  }
  if (/jsonField\s*\(|効果（JSON配列）|（JSON）/.test(html)) issues.push('管理画面にJSON直接入力が残っている');
  if (/地形適性|renderTerrainFields|name=["']terrain["']/.test(html)) issues.push('管理画面に不要な地形適性入力が残っている');
  if (/距離適性|f_distance/.test(html)) issues.push('管理画面に不要な距離適性入力が残っている');
  if (/cardStatus|状態すべて|card\.status/.test(html)) issues.push('管理画面に不要なカードstatusが残っている');
  for (const fn of [
    'asstRenderAccessoryField', 'asstCollectRatings', 'asstCollectStats', 'asstCollectFormations',
    'asstCollectEffects', 'asstCollectTags', 'asstSourceManagedField',
  ]) {
    if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(html)) issues.push(`構造化フォーム関数がない: ${fn}`);
  }
  if (!/var original=ASST\.ability\.tags\|\|\[\]/.test(html)) issues.push('能力タグの既存順序を保持していない');
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
  if (!/asstTabButton\('ocr','効果OCR'/.test(html) || !/id="asst_ocrFiles"[^>]+multiple/.test(html) ||
      !/function\s+asstRunEffectOcr\s*\(/.test(html) || !/function\s+asstCollectOcrCandidates\s*\(/.test(html) ||
      !/function\s+asstApplyOcrCandidates\s*\(/.test(html) || !/function\s+asstPopulateOcrConditionFields\s*\(/.test(html) ||
      !/activation\?\s*'conditional'\s*:\s*'universal'/.test(html)) {
    issues.push('アシストCMSに複数画像OCR・候補レビュー画面がない');
  }
  const ocrNormalizationImplementations = [
    { file: SOURCE_FILES[3], normalize: functionBlock(effectOcr, 'normalizeText'), sanitize: functionBlock(effectOcr, 'sanitizeOcrText') },
    { file: SOURCE_FILES[1], normalize: functionBlock(html, 'asstOcrNormalizeText'), sanitize: functionBlock(html, 'asstOcrSanitizeText') },
  ];
  const ocrNormalizationRules = [
    { label: '保護対象（ ）Ⅰ-Ⅹⅰ-ⅹ', block: 'normalize', present: source => /\[（）Ⅰ-Ⅹⅰ-ⅹ\]\/u/.test(source) },
    { label: 'NFKC正規化', block: 'normalize', present: source => /\.normalize\(['"]NFKC['"]\)/.test(source) },
    { label: '|｜ → Ⅱ の置換', block: 'sanitize', present: source => /\.replace\(\/\[\|｜\]\/g,\s*['"]Ⅱ['"]\)/.test(source) },
    { label: 'MAX↑ の除去', block: 'sanitize', present: source => /\.replace\(\/MAX↑\/g,\s*['"]['"]\)/.test(source) },
    { label: '行頭 • の除去', block: 'sanitize', present: source => /\.replace\(\/\^(?:•|\[[^\]]*•[^\]]*\])\\s\*\/,\s*['"]['"]\)/.test(source) },
    { label: '・（U+30FB）を削除対象に含めない', block: 'sanitize', present: source => !/\.replace\(\/[^/\n]*・[^/\n]*\/[a-z]*,\s*['"]['"]\)/i.test(source) },
  ];
  for (const implementation of ocrNormalizationImplementations) {
    for (const rule of ocrNormalizationRules) {
      if (!rule.present(implementation[rule.block])) {
        issues.push(`${implementation.file}: OCR正規化規則「${rule.label}」が欠けている`);
      }
    }
  }
  if (!/function\s+api_asstOcrEffectImage\s*\(/.test(gas) || !/DOCUMENT_TEXT_DETECTION/.test(gas) ||
      !/languageHints:\s*\['ja'\]/.test(gas) || !/optionalProp_\('GOOGLE_CLOUD_VISION_API_KEY'\)/.test(gas)) {
    issues.push('アシストGASにScript Properties経由の日本語Vision OCRがない');
  }
  const assistImageFolderBlock = functionBlock(gas, 'asstImageFolder_');
  const cardImageUploadBlock = functionBlock(gas, 'api_asstUploadCardImage');
  const setup5Block = functionBlock(setupGas, 'asstCreateImageFolder_');
  if (!/function\s+api_asstUploadCardImage\s*\(/.test(gas) || !/ASSIST_IMAGE_FOLDER_ID/.test(gas) ||
      !/DriveApp\.getFolderById/.test(gas) ||
      !(assistImageFolderBlock && /optionalProp_\('ASSIST_IMAGE_FOLDER_ID'\)/.test(assistImageFolderBlock) &&
        /return root;/.test(assistImageFolderBlock) && !/getFoldersByName|createFolder/.test(assistImageFolderBlock)) ||
      !(setup5Block && /optionalProp_\('ASSIST_IMAGE_FOLDER_ID'\)/.test(setup5Block) &&
        /DriveApp\.getFolderById/.test(setup5Block) && !/DriveApp\.createFolder/.test(setup5Block)) ||
      !/ASST_IMAGE_MAX_BYTES\s*=\s*2 \* 1024 \* 1024/.test(gas) ||
      !(cardImageUploadBlock && /isExpectedImage_\(bytes, mimeType\)/.test(cardImageUploadBlock)) ||
      !/oldFile\.setTrashed\(true\)/.test(gas) || !/file\.setTrashed\(false\)/.test(gas) ||
      !/imagePath\s*=\s*'assist-cards\/'/.test(gas) ||
      !/id="asst_f_imageFile"/.test(html) || !/id="asst_btnUploadCardImage"/.test(html) ||
      !/function\s+asstUploadCardImage\s*\(/.test(html) || !/version:ASST\.detail\.version/.test(html) ||
      !/file\.size>2\*1024\*1024/.test(html)) {
    issues.push('カード画像を指定Driveへ安全にアップロードする経路がない');
  }
  if (!/headers:\s*\{\s*['"]x-goog-api-key['"]:\s*apiKey\s*\}/.test(gas) ||
      /images:annotate\?key=/.test(gas)) {
    issues.push('Vision APIキーがURLではなくx-goog-api-keyヘッダーで送信されていない');
  }
  if (!/function\s+asstReserveOcrDailyUsage_\s*\(/.test(gas) ||
      !/positiveIntProp_\('OCR_DAILY_LIMIT'\)/.test(gas) ||
      !/getProperty\('OCR_DAILY_USAGE'\)/.test(gas) ||
      !/setProperty\('OCR_DAILY_USAGE'/.test(gas) ||
      !/LockService\.getScriptLock\(\)/.test(gas) ||
      !/var usage = asstReserveOcrDailyUsage_\(\);[\s\S]*UrlFetchApp\.fetch/.test(gas)) {
    issues.push('OCR_DAILY_LIMITの日次上限をVision送信前に競合なく強制していない');
  }
  if (/capture_queue|SHEET_CAPTURE_QUEUE|api_(?:saveEffectOcrCandidates|getEffectOcrCapture|reviewEffectOcrCapture)/.test(gas + html)) {
    issues.push('撤去済みcapture_queueまたは永続化APIが残っている');
  }
  if (!/if\(!types\.length\)throw new Error/.test(html) ||
      !/if\(!source\)throw new Error/.test(html)) {
    issues.push('黄色背景の条件付き候補を発動条件未選択のまま進行できる');
  }
  if (!/id="asst_ocrSourceConfirmed"/.test(html) || !/if\(!el\('asst_ocrSourceConfirmed'\)\.checked\)throw new Error/.test(html) ||
      !/候補を破棄/.test(html) || !/ブラウザ内に保持/.test(html)) {
    issues.push('OCR候補が原画像確認なしで反映できる、またはブラウザ内一時保持になっていない');
  }
  if (!/function\s+asstOcrBreederDependency\s*\(/.test(html) || !/breeder-dependency/.test(html) ||
      !/モン類ブリーダー/.test(effectOcr) || !/オーラブリーダー/.test(effectOcr) ||
      !/basis:\s*'breeder-dependency'/.test(effectOcr)) {
    issues.push('モン類・オーラブリーダー派生効果の一致条件を保持できない');
  }
  if (!/fieldset\.ocr-candidate\.conditional/.test(commonHtml) ||
      !/id="app_toast"/.test(shell) ||
      !/\.app-toast\{[^}]*position:fixed[^}]*max-width:calc\(100vw - 28px\)[^}]*overflow-wrap:anywhere/.test(commonHtml) ||
      !/function show\([^)]*\)[\s\S]{0,500}el\('app_toast'\)/.test(commonHtml) ||
      !/class="app-busy-overlay"/.test(shell) || !/\.app-busy-overlay/.test(commonHtml) ||
      !/OCR処理中/.test(html)) {
    issues.push('OCR候補の条件背景・処理中表示・下部通知がない');
  }
  const ocrApiBlock = functionBlock(gas, 'api_asstOcrEffectImage');
  if (ocrApiBlock && /DriveApp/.test(ocrApiBlock)) issues.push('OCR原画像をDriveへ保存している');
  if (!/limitBreakJson:\s*asstJsonCell_\(currentCard\.limitBreak\)/.test(gas) ||
      !/sapoRefJson:\s*asstJsonCell_\(currentCard\.sapoRef\)/.test(gas) ||
      !/flagsJson:\s*row\.flagsJson/.test(gas)) {
    issues.push('参照専用項目をサーバー側で保持していない');
  }
  if (!/asstInList_\(card\.cardType,\s*ASST_CARD_TYPES/.test(gas) ||
      !/asstValidateImagePath_\(card,\s*true\)/.test(gas) ||
      !/asstValidateReleasedAt_\(card\.releasedAt/.test(gas) ||
      !/asstValidateRatings_\(card\.ratings/.test(gas) ||
      !/asstDriveImageInventory_\(docs\.cards\.cards,\s*true\)/.test(assistExportBlock) ||
      !/asstValidateImageFiles_\(docs\.cards\.cards,\s*driveImages\.byName\)/.test(assistExportBlock)) {
    issues.push('カード保存・exportの必須値検査が不足');
  }
  const imagePathBlock = functionBlock(gas, 'asstValidateImagePath_');
  const driveInventoryBlock = functionBlock(gas, 'asstDriveImageInventory_');
  if (!/asstDriveImageByName_\(filename\)/.test(imagePathBlock) ||
      !/ASST_RAW_REPO_BASE \+ imagePath/.test(imagePathBlock) ||
      !/mainまたは指定Drive/.test(imagePathBlock) ||
      !/asstDriveImageInventory_\(docs\.cards\.cards,\s*false\)/.test(assistPublishBlock) ||
      !/asstValidateImageFiles_\(docs\.cards\.cards,\s*driveImages\.byName\)/.test(assistPublishBlock) ||
      !/Object\.keys\(driveImages\.byName\)/.test(assistPublishBlock) ||
      !/githubBlob_\(Utilities\.base64Encode\(driveImage\.bytes\),\s*'base64'\)/.test(assistPublishBlock) ||
      !/同名画像が複数/.test(driveInventoryBlock) ||
      !/main未公開の新規画像を指定Driveから受理する/.test(cardImageFlowTest) ||
      !/mainと指定Driveの両方にない画像を拒否する/.test(cardImageFlowTest)) {
    issues.push('新規カード画像をDriveから初回保存・公開する安全経路が不足');
  }

  const calledApis = [...html.matchAll(/call\(['"](api_[A-Za-z0-9_]+)['"]/g)].map(match => match[1]);
  for (const api of new Set(calledApis)) {
    if (!new RegExp(`function\\s+${api}\\s*\\(`).test(allAssistGas)) issues.push(`HTMLから未定義APIを呼んでいる: ${api}`);
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
  if (abilitiesDoc.schemaVersion !== 2 || !Array.isArray(abilitiesDoc.abilities)) {
    issues.push('能力DBのschemaVersion/abilitiesが不正');
    return issues;
  }
  if (abilitiesDoc.abilities.length < MIGRATED_ABILITY_COUNT ||
      crypto.createHash('sha256').update(JSON.stringify(abilitiesDoc.abilities.slice(0, MIGRATED_ABILITY_COUNT))).digest('hex') !== MIGRATED_ABILITY_RECORDS_SHA256) {
    issues.push('既存移行能力1,079件の内容・値・ID・配列順が基準から変化');
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
    if (ability.legacyId !== null) legacyIds.push(ability.legacyId);
    if (!ability.abilityId || !ability.sourceName || !ability.name || !ability.description) {
      issues.push(`${ability.abilityId}: 能力必須文字列が空欄`);
    }
    if (typeof ability.abilityId !== 'string' || !/^ab-[0-9]{4,}$/.test(ability.abilityId)) {
      issues.push(`${ability.abilityId}: abilityId形式不正`);
    }
    if (ability.legacyId !== null && (!Number.isInteger(ability.legacyId) || ability.legacyId <= 0)) {
      issues.push(`${ability.abilityId}: legacyId不正`);
    }
    if (!ALLOWED.abilitySource.has(ability.source)) issues.push(`${ability.abilityId}: source不正`);
    if (ability.rarity !== null && !ALLOWED.abilityRarity.has(ability.rarity)) issues.push(`${ability.abilityId}: rarity不正`);
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
    console.log(issues.length ? `FAIL アシストCMS検査 ${issues.length}件` : 'PASS アシストCMSソース境界・3DB構造');
    for (const issue of issues) console.log(`  - ${issue}`);
  }
  if (issues.length) process.exitCode = 1;
}

if (require.main === module) runCli();

module.exports = { validateRoot };
