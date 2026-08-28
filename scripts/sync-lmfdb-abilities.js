#!/usr/bin/env node
'use strict';

/**
 * lMfDB の能力JSONをローカル3DBと比較する、書き込み機能を持たない監査専用dry-run。
 * Node.js標準機能だけを使用する。
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_REMOTE_REF = 'main';
const REMOTE_BASE = 'https://raw.githubusercontent.com/futsalife24-bot/lMfDB';
const REMOTE_PATH = 'data/abilities.json';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const REQUIRED_EXTERNAL_FIELDS = ['id', 'name', 'desc', 'card', 'tags', 'source', 'rarity'];
const EXTERNAL_STRING_FIELDS = ['name', 'desc', 'card', 'source', 'rarity'];
const LOCAL_EXTERNAL_FIELDS = {
  sourceName: 'card',
  name: 'name',
  description: 'desc',
  source: 'source',
  rarity: 'rarity',
  tags: 'tags',
};
const RANK = { SAFE: 0, REVIEW_REQUIRED: 1, BLOCKED: 2 };

class AuditError extends Error {
  constructor(message, code = 'AUDIT_ERROR') {
    super(message);
    this.name = 'AuditError';
    this.code = code;
  }
}

function absolute(relativePath) {
  return path.join(REPO, relativePath);
}

function parseArgs(argv) {
  const options = { externalSha: null, inputFile: null, jsonReport: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!['--sha', '--file', '--json-report'].includes(argument)) {
      throw new AuditError(`未対応の引数です: ${argument}`, 'ARGUMENT');
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new AuditError(`${argument} の値がありません`, 'ARGUMENT');
    }
    if (argument === '--sha') options.externalSha = value;
    if (argument === '--file') options.inputFile = value;
    if (argument === '--json-report') options.jsonReport = value;
    index += 1;
  }
  if (options.externalSha && options.inputFile) {
    throw new AuditError('--sha と --file は同時に指定できません', 'ARGUMENT');
  }
  if (options.externalSha && !/^[0-9a-f]{40}$/.test(options.externalSha)) {
    throw new AuditError('--sha は40桁の小文字16進数だけを指定できます', 'ARGUMENT');
  }
  if (options.jsonReport) {
    const reportPath = path.resolve(options.jsonReport);
    const tempRoots = new Set([path.resolve('/tmp'), path.resolve(os.tmpdir())]);
    for (const candidate of [...tempRoots]) {
      try {
        tempRoots.add(fs.realpathSync(candidate));
      } catch (_) {
        // 存在する一時ディレクトリだけを正規化する。
      }
    }
    const inTemporaryDirectory = [...tempRoots]
      .some(root => reportPath.startsWith(`${root}${path.sep}`));
    if (!inTemporaryDirectory) {
      throw new AuditError('--json-report は一時ディレクトリ配下だけを指定できます', 'ARGUMENT');
    }
    options.jsonReport = reportPath;
  }
  return options;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseJsonBuffer(buffer, label) {
  if (!buffer.length) throw new AuditError(`${label}: 空レスポンスです`, 'EMPTY_RESPONSE');
  if (buffer.length > MAX_RESPONSE_BYTES) {
    throw new AuditError(`${label}: ${MAX_RESPONSE_BYTES}バイトを超えています`, 'RESPONSE_TOO_LARGE');
  }
  try {
    return JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new AuditError(`${label}: JSONとして解析できません（${error.message}）`, 'INVALID_JSON');
  }
}

async function readResponseLimited(response, label) {
  if (!response.ok) throw new AuditError(`${label}: HTTP ${response.status}`, 'HTTP_ERROR');
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new AuditError(`${label}: Content-Lengthが上限を超えています`, 'RESPONSE_TOO_LARGE');
  }
  if (!response.body) throw new AuditError(`${label}: レスポンス本文がありません`, 'EMPTY_RESPONSE');
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > MAX_RESPONSE_BYTES) {
      throw new AuditError(`${label}: 取得中にサイズ上限を超えました`, 'RESPONSE_TOO_LARGE');
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function loadExternal(options, fetchImpl = globalThis.fetch) {
  if (options.inputFile) {
    const inputPath = path.resolve(options.inputFile);
    let stat;
    try {
      stat = fs.statSync(inputPath);
    } catch (error) {
      throw new AuditError(`入力ファイルを読めません: ${inputPath}`, 'FILE_ERROR');
    }
    if (!stat.isFile()) throw new AuditError(`入力はファイルではありません: ${inputPath}`, 'FILE_ERROR');
    if (stat.size > MAX_RESPONSE_BYTES) throw new AuditError('入力ファイルがサイズ上限を超えています', 'RESPONSE_TOO_LARGE');
    const buffer = fs.readFileSync(inputPath);
    return { buffer, document: parseJsonBuffer(buffer, inputPath), input: { type: 'file', value: inputPath } };
  }

  if (typeof fetchImpl !== 'function') throw new AuditError('このNode.js環境ではfetchを利用できません', 'FETCH_UNAVAILABLE');
  const ref = options.externalSha || DEFAULT_REMOTE_REF;
  const url = `${REMOTE_BASE}/${ref}/${REMOTE_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
    const buffer = await readResponseLimited(response, url);
    return {
      buffer,
      document: parseJsonBuffer(buffer, url),
      input: { type: 'remote', value: url, externalSha: options.externalSha || null },
    };
  } catch (error) {
    if (error instanceof AuditError) throw error;
    if (error && error.name === 'AbortError') throw new AuditError(`${url}: ${TIMEOUT_MS}msでタイムアウトしました`, 'TIMEOUT');
    throw new AuditError(`${url}: 取得に失敗しました（${error.message}）`, 'FETCH_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

function duplicates(values) {
  const seen = new Set();
  const duplicateSet = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicateSet.add(value);
    seen.add(value);
  }
  return [...duplicateSet];
}

function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = String(getter(item));
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, 'ja')));
}

function dangerousStrings(value, location = '$', found = []) {
  if (typeof value === 'string' && /<\/script/i.test(value)) found.push(location);
  if (Array.isArray(value)) value.forEach((item, index) => dangerousStrings(item, `${location}[${index}]`, found));
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, item]) => dangerousStrings(item, `${location}.${key}`, found));
  }
  return found;
}

function validateExternal(document) {
  const errors = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) errors.push('ルートがオブジェクトではありません');
  if (document && document.schemaVersion !== 1) errors.push('schemaVersionが1ではありません');
  if (document && document.generatedFrom !== 'ux/index.html') errors.push('generatedFromがux/index.htmlではありません');
  if (!document || !Array.isArray(document.abilities)) errors.push('abilitiesが配列ではありません');
  const abilities = document && Array.isArray(document.abilities) ? document.abilities : [];
  if (!document || !document.counts || document.counts.abilities !== abilities.length) {
    errors.push('counts.abilitiesとabilities.lengthが一致しません');
  }
  abilities.forEach((ability, index) => {
    const prefix = `abilities[${index}]`;
    if (!ability || typeof ability !== 'object' || Array.isArray(ability)) {
      errors.push(`${prefix}がオブジェクトではありません`);
      return;
    }
    for (const field of REQUIRED_EXTERNAL_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(ability, field)) errors.push(`${prefix}.${field}がありません`);
    }
    if (!Number.isInteger(ability.id) || ability.id <= 0) errors.push(`${prefix}.idが正の整数ではありません`);
    for (const field of EXTERNAL_STRING_FIELDS) {
      if (typeof ability[field] !== 'string') errors.push(`${prefix}.${field}が文字列ではありません`);
    }
    if (!Array.isArray(ability.tags)
        || ability.tags.some(tag => typeof tag !== 'string' || tag.length === 0)
        || new Set(ability.tags).size !== ability.tags.length) {
      errors.push(`${prefix}.tagsが重複のない非空文字列配列ではありません`);
    }
  });
  const duplicateIds = duplicates(abilities.map(ability => ability && ability.id));
  if (duplicateIds.length) errors.push(`idが重複しています: ${duplicateIds.slice(0, 10).join(', ')}`);
  const dangerous = dangerousStrings(document);
  if (dangerous.length) errors.push(`危険文字列 </script を検出しました: ${dangerous.slice(0, 10).join(', ')}`);
  return { errors, duplicateIds, dangerousStrings: dangerous };
}

function readJson(relativePath) {
  const text = fs.readFileSync(absolute(relativePath), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function loadLocalDocuments(paths = {}) {
  return {
    cards: readJson(paths.cards || 'src/data/assist-cards.json'),
    abilities: readJson(paths.abilities || 'src/data/assist-abilities.json'),
    cardMap: readJson(paths.cardMap || 'src/data/lmfdb-card-map.json'),
  };
}

function mappingKey(sourceName, rarity) {
  return JSON.stringify([sourceName, rarity]);
}

function validateLocalAndMap(local) {
  const errors = [];
  const cards = local.cards && local.cards.cards;
  const abilities = local.abilities && local.abilities.abilities;
  const mappings = local.cardMap && local.cardMap.mappings;
  if (!Array.isArray(cards)) errors.push('assist-cards.jsonのcardsが配列ではありません');
  if (!Array.isArray(abilities)) errors.push('assist-abilities.jsonのabilitiesが配列ではありません');
  if (!local.cardMap || local.cardMap.schemaVersion !== 1 || !Array.isArray(mappings)) {
    errors.push('lmfdb-card-map.jsonの構造が不正です');
  }
  if (errors.length) return { errors, mappingByKey: new Map(), cards: cards || [], abilities: abilities || [] };

  const cardIds = new Set(cards.map(card => card.cardId));
  const localCardKeys = cards.map(card => mappingKey(card.name, card.rarity));
  const duplicateCardKeys = duplicates(localCardKeys);
  if (duplicateCardKeys.length) errors.push('assist-cards.jsonのname + rarityが一意ではありません');
  if (cardIds.size !== cards.length) errors.push('assist-cards.jsonのcardIdが一意ではありません');
  const localLegacyIds = abilities.map(ability => ability.legacyId);
  const localAbilityIds = abilities.map(ability => ability.abilityId);
  if (localLegacyIds.some(id => !Number.isInteger(id) || id <= 0) || duplicates(localLegacyIds).length) {
    errors.push('assist-abilities.jsonのlegacyIdが正の一意な整数ではありません');
  }
  if (localAbilityIds.some(id => typeof id !== 'string' || !id) || duplicates(localAbilityIds).length) {
    errors.push('assist-abilities.jsonのabilityIdが一意な非空文字列ではありません');
  }

  const mappingByKey = new Map();
  const mappedCardIds = [];
  for (const [index, mapping] of mappings.entries()) {
    if (!mapping || typeof mapping.sourceName !== 'string' || typeof mapping.rarity !== 'string'
        || typeof mapping.cardId !== 'string') {
      errors.push(`mappings[${index}]の必須文字列が不正です`);
      continue;
    }
    const key = mappingKey(mapping.sourceName, mapping.rarity);
    if (mappingByKey.has(key)) errors.push(`対応表にsourceName + rarity重複があります: ${mapping.sourceName} / ${mapping.rarity}`);
    if (!cardIds.has(mapping.cardId)) errors.push(`対応表のcardIdがカードDBに存在しません: ${mapping.cardId}`);
    mappedCardIds.push(mapping.cardId);
    const card = cards.find(item => item.cardId === mapping.cardId);
    if (card && (card.name !== mapping.sourceName || card.rarity !== mapping.rarity)) {
      errors.push(`対応表とカードDBの完全一致が崩れています: ${mapping.cardId}`);
    }
    mappingByKey.set(key, mapping.cardId);
  }
  const duplicateMappedCardIds = duplicates(mappedCardIds);
  if (duplicateMappedCardIds.length) {
    errors.push(`対応表でcardIdが重複しています: ${duplicateMappedCardIds.slice(0, 10).join(', ')}`);
  }
  const missingCardMappings = cards.filter(card => !mappedCardIds.includes(card.cardId));
  if (missingCardMappings.length) {
    errors.push(`対応表にない現行カードがあります: ${missingCardMappings.slice(0, 10).map(card => card.cardId).join(', ')}`);
  }
  return { errors, mappingByKey, cards, abilities };
}

function equalValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function analyze(externalDocument, local, input, contentHash) {
  const externalValidation = validateExternal(externalDocument);
  const localValidation = validateLocalAndMap(local);
  const blockingReasons = [...externalValidation.errors, ...localValidation.errors];
  const abilities = Array.isArray(externalDocument.abilities) ? externalDocument.abilities : [];
  const localAbilities = localValidation.abilities;
  const localByLegacyId = new Map(localAbilities.map(ability => [ability.legacyId, ability]));
  const externalById = new Map(abilities.map(ability => [ability.id, ability]));
  const allowedSources = new Set(localAbilities.map(ability => ability.source));
  const allowedRarities = new Set(localAbilities.map(ability => ability.rarity).filter(value => value !== null));
  const abilityIdOwner = new Map(localAbilities.map(ability => [ability.abilityId, ability.legacyId]));
  const additions = [];
  const changes = [];
  const missing = [];
  const resolvedImpacts = [];
  const resolvedCandidates = [];
  const unlinkedCandidates = [];
  const abilityIdCollisions = [];
  const cardIdContradictions = [];
  const changedFieldCounts = {};
  const affectedCardIds = new Set();

  for (const external of abilities) {
    const current = localByLegacyId.get(external.id);
    const mappedCardId = localValidation.mappingByKey.get(mappingKey(external.card, external.rarity)) || null;
    if (!current) {
      additions.push(external.id);
      const candidateAbilityId = `ab-${String(external.id).padStart(4, '0')}`;
      if (abilityIdOwner.has(candidateAbilityId)) {
        abilityIdCollisions.push({ legacyId: external.id, abilityId: candidateAbilityId, ownerLegacyId: abilityIdOwner.get(candidateAbilityId) });
      }
      if (mappedCardId) {
        resolvedCandidates.push({ legacyId: external.id, cardId: mappedCardId });
        affectedCardIds.add(mappedCardId);
      } else {
        unlinkedCandidates.push({ legacyId: external.id, sourceName: external.card, rarity: external.rarity });
      }
      continue;
    }
    const changedFields = [];
    for (const [localField, externalField] of Object.entries(LOCAL_EXTERNAL_FIELDS)) {
      if (!equalValue(current[localField], external[externalField])) {
        changedFields.push(localField);
        changedFieldCounts[localField] = (changedFieldCounts[localField] || 0) + 1;
      }
    }
    if (changedFields.length) {
      changes.push({ legacyId: external.id, abilityId: current.abilityId, fields: changedFields });
      if (current.linkStatus === 'resolved') {
        resolvedImpacts.push({ legacyId: external.id, abilityId: current.abilityId, cardId: current.cardId, fields: changedFields });
        affectedCardIds.add(current.cardId);
      }
    }
    if (current.linkStatus === 'resolved' && mappedCardId && mappedCardId !== current.cardId) {
      cardIdContradictions.push({ legacyId: external.id, currentCardId: current.cardId, mappedCardId });
    }
  }

  for (const current of localAbilities) {
    if (!externalById.has(current.legacyId)) {
      missing.push(current.legacyId);
      if (current.linkStatus === 'resolved') affectedCardIds.add(current.cardId);
    }
  }

  if (abilityIdCollisions.length) blockingReasons.push(`abilityId衝突候補が${abilityIdCollisions.length}件あります`);
  if (cardIdContradictions.length) blockingReasons.push(`cardId対応の矛盾が${cardIdContradictions.length}件あります`);
  const unknownSources = [...new Set(abilities.map(ability => ability.source).filter(value => !allowedSources.has(value)))].sort();
  const unknownRarities = [...new Set(abilities.map(ability => ability.rarity).filter(value => !allowedRarities.has(value)))].sort();
  const reviewReasons = [];
  if (missing.length) reviewReasons.push(`外部から消えたIDが${missing.length}件あります（自動削除禁止）`);
  if (changes.length) reviewReasons.push(`既存IDの外部管理項目変更が${changes.length}件あります`);
  if (unlinkedCandidates.length) reviewReasons.push(`固定対応表にない新規能力が${unlinkedCandidates.length}件あります`);
  if (unknownSources.length) reviewReasons.push(`未知のsourceがあります: ${unknownSources.join(', ')}`);
  if (unknownRarities.length) reviewReasons.push(`未知のrarityがあります: ${unknownRarities.join(', ')}`);

  let decision = 'SAFE';
  if (reviewReasons.length) decision = 'REVIEW_REQUIRED';
  if (blockingReasons.length) decision = 'BLOCKED';
  const ids = abilities.map(ability => ability.id).filter(Number.isInteger);
  return {
    reportVersion: 1,
    input,
    externalSha256: contentHash,
    decision,
    counts: {
      external: abilities.length,
      local: localAbilities.length,
      externalIdMin: ids.length ? Math.min(...ids) : null,
      externalIdMax: ids.length ? Math.max(...ids) : null,
      externalIdDuplicates: externalValidation.duplicateIds.length,
      additions: additions.length,
      changes: changes.length,
      missing: missing.length,
      resolvedImpacts: resolvedImpacts.length,
      resolvedCandidates: resolvedCandidates.length,
      unlinkedCandidates: unlinkedCandidates.length,
      abilityIdCollisions: abilityIdCollisions.length,
      cardIdContradictions: cardIdContradictions.length,
    },
    breakdown: {
      source: countBy(abilities, ability => ability.source),
      rarity: countBy(abilities, ability => ability.rarity),
      changedFields: Object.fromEntries(Object.entries(changedFieldCounts).sort()),
    },
    details: {
      additions,
      changes,
      missing,
      resolvedImpacts,
      resolvedCandidates,
      unlinkedCandidates,
      unknownSources,
      unknownRarities,
      abilityIdCollisions,
      cardIdContradictions,
      affectedCardIds: [...affectedCardIds].filter(Boolean).sort(),
    },
    stopReasons: { blocked: blockingReasons, reviewRequired: reviewReasons },
  };
}

function formatList(values) {
  return values.length ? values.join(', ') : 'なし';
}

function formatReport(report) {
  const lines = [];
  lines.push('=== lMfDB 能力同期 dry-run ===');
  if (report.input.type === 'remote') {
    lines.push(`入力: ${report.input.externalSha ? `外部コミット ${report.input.externalSha}` : '外部 main'} (${report.input.value})`);
  } else {
    lines.push(`入力ファイル: ${report.input.value}`);
  }
  lines.push(`外部JSON SHA-256: ${report.externalSha256}`);
  lines.push(`件数: 外部 ${report.counts.external} / ローカル ${report.counts.local}`);
  lines.push(`外部ID: 最小 ${report.counts.externalIdMin} / 最大 ${report.counts.externalIdMax} / 重複 ${report.counts.externalIdDuplicates}`);
  lines.push(`source内訳: ${Object.entries(report.breakdown.source).map(([key, value]) => `${key} ${value}`).join(' / ') || 'なし'}`);
  lines.push(`rarity内訳: ${Object.entries(report.breakdown.rarity).map(([key, value]) => `${key} ${value}`).join(' / ') || 'なし'}`);
  lines.push(`差分: 追加 ${report.counts.additions} / 変更 ${report.counts.changes} / 欠落 ${report.counts.missing}`);
  lines.push(`変更項目別: ${Object.entries(report.breakdown.changedFields).map(([key, value]) => `${key} ${value}`).join(' / ') || 'なし'}`);
  lines.push(`現在resolvedへの影響: ${report.counts.resolvedImpacts}`);
  lines.push(`新規resolved候補: ${report.counts.resolvedCandidates} / unlinked候補: ${report.counts.unlinkedCandidates}`);
  lines.push(`abilityId衝突候補: ${report.counts.abilityIdCollisions} / cardId対応矛盾: ${report.counts.cardIdContradictions}`);
  lines.push(`影響するcardId: ${formatList(report.details.affectedCardIds)}`);
  lines.push(`自動同期を止める理由（BLOCKED）: ${formatList(report.stopReasons.blocked)}`);
  lines.push(`自動同期を止める理由（要レビュー）: ${formatList(report.stopReasons.reviewRequired)}`);
  lines.push(`最終判定: ${report.decision}`);
  return `${lines.join('\n')}\n`;
}

async function run(options, dependencies = {}) {
  const external = await loadExternal(options, dependencies.fetchImpl);
  const local = dependencies.local || loadLocalDocuments();
  const report = analyze(external.document, local, external.input, sha256(external.buffer));
  if (options.jsonReport) fs.writeFileSync(options.jsonReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await run(options);
  process.stdout.write(formatReport(report));
  if (options.jsonReport) process.stdout.write(`JSON監査レポート: ${options.jsonReport}\n`);
  if (RANK[report.decision] >= RANK.BLOCKED) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`lMfDB 能力同期 dry-run: BLOCKED ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  AuditError,
  MAX_RESPONSE_BYTES,
  analyze,
  formatReport,
  loadExternal,
  parseArgs,
  run,
  sha256,
  validateExternal,
  validateLocalAndMap,
};
