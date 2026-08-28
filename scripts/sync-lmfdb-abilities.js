#!/usr/bin/env node
'use strict';

/**
 * lMfDB の能力JSONから未登録と思われる候補を抽出する、読取専用の監査エンジン。
 * 外部数値IDは永続的な同一性キーや更新・削除キーとして使用しない。
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
const EXTERNAL_SOURCES = new Set(['イベント', '閃き', 'EXトレ', '伝授']);
const EXTERNAL_RARITIES = new Set(['MR', 'SSR', 'SR', 'その他']);
const LOCAL_EXTERNAL_FIELDS = {
  sourceName: 'card',
  name: 'name',
  description: 'desc',
  source: 'source',
  rarity: 'rarity',
  tags: 'tags',
};
const SAFETY_RANK = { SAFE: 0, REVIEW_REQUIRED: 1, BLOCKED: 2 };

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
  const options = {
    externalSha: null,
    inputFile: null,
    jsonReport: null,
    showAllRepresentation: false,
    showDuplicateDetails: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--show-all-representation') {
      options.showAllRepresentation = true;
      continue;
    }
    if (argument === '--show-duplicate-details') {
      options.showDuplicateDetails = true;
      continue;
    }
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
    if (typeof ability.source === 'string' && !EXTERNAL_SOURCES.has(ability.source)) {
      errors.push(`${prefix}.sourceが外部候補の許可値ではありません: ${ability.source}`);
    }
    if (typeof ability.rarity === 'string' && !EXTERNAL_RARITIES.has(ability.rarity)) {
      errors.push(`${prefix}.rarityが外部候補の許可値ではありません: ${ability.rarity}`);
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

function exactComparableFromExternal(ability) {
  return {
    sourceName: ability.card,
    name: ability.name,
    description: ability.desc,
    source: ability.source,
    rarity: ability.rarity,
    tags: ability.tags,
  };
}

function exactComparableFromLocal(ability) {
  return Object.fromEntries(Object.keys(LOCAL_EXTERNAL_FIELDS).map(field => [field, ability[field]]));
}

function normalizeForComparison(value) {
  if (typeof value === 'string') return value.normalize('NFKC');
  if (Array.isArray(value)) return value.map(normalizeForComparison);
  return value;
}

function normalizedComparable(comparable) {
  return Object.fromEntries(Object.entries(comparable)
    .map(([field, value]) => [field, normalizeForComparison(value)]));
}

function comparableKey(comparable) {
  return JSON.stringify(comparable);
}

function differingFields(localComparable, externalComparable, normalized = false) {
  const localValue = normalized ? normalizedComparable(localComparable) : localComparable;
  const externalValue = normalized ? normalizedComparable(externalComparable) : externalComparable;
  return Object.keys(LOCAL_EXTERNAL_FIELDS)
    .filter(field => comparableKey(localValue[field]) !== comparableKey(externalValue[field]));
}

function addToIndex(index, key, ability) {
  const matches = index.get(key) || [];
  matches.push(ability);
  index.set(key, matches);
}

function isIdReuseSuspected(normalizedChangedFields) {
  const changed = new Set(normalizedChangedFields);
  const limitedCorrectionFields = new Set(['name', 'description', 'rarity']);
  const limitedCorrection = normalizedChangedFields
    .every(field => limitedCorrectionFields.has(field));
  const identityContextAllChanged = ['sourceName', 'name', 'source', 'rarity']
    .every(field => changed.has(field));
  const contextChanges = ['sourceName', 'source', 'rarity'].filter(field => changed.has(field)).length;
  const contentChanges = ['name', 'description', 'tags'].filter(field => changed.has(field)).length;
  return identityContextAllChanged
    || (normalizedChangedFields.length >= 3 && !limitedCorrection)
    || (contextChanges >= 2 && contentChanges >= 2);
}

function consecutiveRanges(ids) {
  const sorted = [...new Set(ids)].sort((left, right) => left - right);
  const ranges = [];
  for (const id of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && id === last.end + 1) last.end = id;
    else ranges.push({ start: id, end: id });
  }
  return ranges;
}

function emptyCounts(externalCount, localCount, ids, duplicateCount) {
  return {
    external: externalCount,
    local: localCount,
    externalIdMin: ids.length ? Math.min(...ids) : null,
    externalIdMax: ids.length ? Math.max(...ids) : null,
    externalIdDuplicates: duplicateCount,
    newCandidates: 0,
    knownExact: 0,
    representationOnly: 0,
    existingContentDifferences: 0,
    idReuseSuspected: 0,
    missingUpstreamObservations: 0,
    cardMatchCandidates: 0,
    unlinkedCandidates: 0,
    duplicateLocalContentMatches: 0,
  };
}

function analyze(externalDocument, local, input, contentHash, options = {}) {
  const externalValidation = validateExternal(externalDocument);
  const localValidation = validateLocalAndMap(local);
  const abilities = Array.isArray(externalDocument && externalDocument.abilities)
    ? externalDocument.abilities : [];
  const localAbilities = localValidation.abilities;
  const ids = abilities.map(ability => ability && ability.id).filter(Number.isInteger);
  const validationErrors = [...externalValidation.errors, ...localValidation.errors];
  const base = {
    reportVersion: 2,
    input,
    externalSha256: contentHash,
    breakdown: {
      source: countBy(abilities.filter(Boolean), ability => ability.source),
      rarity: countBy(abilities.filter(Boolean), ability => ability.rarity),
    },
  };
  if (validationErrors.length) {
    return {
      ...base,
      auditStatus: 'FAIL',
      safetyVerdict: 'BLOCKED',
      blockReasons: ['AUDIT_INPUT_INVALID'],
      reviewReasons: [],
      counts: emptyCounts(abilities.length, localAbilities.length, ids, externalValidation.duplicateIds.length),
      warnings: [],
      details: {
        validationErrors,
        newCandidates: [],
        representationOnly: [],
        existingContentDifferences: [],
        idReuseSuspected: [],
        missingUpstreamObservations: [],
        duplicateLocalContentMatches: [],
      },
    };
  }

  const localByLegacyId = new Map(localAbilities.map(ability => [ability.legacyId, ability]));
  const externalIdSet = new Set(abilities.map(ability => ability.id));
  const exactIndex = new Map();
  const normalizedIndex = new Map();
  for (const localAbility of localAbilities) {
    const comparable = exactComparableFromLocal(localAbility);
    addToIndex(exactIndex, comparableKey(comparable), localAbility);
    addToIndex(normalizedIndex, comparableKey(normalizedComparable(comparable)), localAbility);
  }

  const knownExact = [];
  const representationOnly = [];
  const existingContentDifferences = [];
  const idReuseSuspected = [];
  const newCandidates = [];
  const duplicateLocalContentMatches = [];

  for (const external of abilities) {
    const externalComparable = exactComparableFromExternal(external);
    const sameIdLocal = localByLegacyId.get(external.id) || null;
    const exactMatches = exactIndex.get(comparableKey(externalComparable)) || [];
    const normalizedMatches = normalizedIndex
      .get(comparableKey(normalizedComparable(externalComparable))) || [];
    if (exactMatches.length > 1 || normalizedMatches.length > 1) {
      const exactDuplicate = exactMatches.length > 1;
      const matches = exactDuplicate ? exactMatches : normalizedMatches;
      duplicateLocalContentMatches.push({
        classification: 'duplicate_local_content_match',
        actionable: false,
        priority: 'low',
        externalId: external.id,
        externalName: external.name,
        comparison: exactDuplicate ? 'exact' : 'normalized',
        localAbilityIds: matches.map(ability => ability.abilityId),
      });
      continue;
    }

    if (sameIdLocal) {
      const sameIdComparable = exactComparableFromLocal(sameIdLocal);
      const normalizedFields = differingFields(sameIdComparable, externalComparable, true);
      if (normalizedFields.length && isIdReuseSuspected(normalizedFields)) {
        idReuseSuspected.push({
          classification: 'ID_REUSE_SUSPECTED',
          externalId: external.id,
          localAbilityId: sameIdLocal.abilityId,
          localCardId: sameIdLocal.cardId,
          localLinkStatus: sameIdLocal.linkStatus,
          changedFields: differingFields(sameIdComparable, externalComparable),
          normalizedChangedFields: normalizedFields,
          local: sameIdComparable,
          external: externalComparable,
        });
        continue;
      }
    }

    if (exactMatches.length === 1) {
      knownExact.push({
        externalId: external.id,
        localAbilityId: exactMatches[0].abilityId,
        externalIdMatchesLegacyId: external.id === exactMatches[0].legacyId,
      });
      continue;
    }

    if (normalizedMatches.length === 1) {
      const localComparable = exactComparableFromLocal(normalizedMatches[0]);
      representationOnly.push({
        externalId: external.id,
        localAbilityId: normalizedMatches[0].abilityId,
        externalIdMatchesLegacyId: external.id === normalizedMatches[0].legacyId,
        fields: differingFields(localComparable, externalComparable),
      });
      continue;
    }

    if (sameIdLocal) {
      const localComparable = exactComparableFromLocal(sameIdLocal);
      existingContentDifferences.push({
        externalId: external.id,
        localAbilityId: sameIdLocal.abilityId,
        fields: differingFields(localComparable, externalComparable),
        normalizedChangedFields: differingFields(localComparable, externalComparable, true),
      });
      continue;
    }

    const cardIdCandidate = localValidation.mappingByKey
      .get(mappingKey(external.card, external.rarity)) || null;
    newCandidates.push({
      classification: cardIdCandidate ? 'card_match_candidate' : 'unlinked_candidate',
      externalId: external.id,
      name: external.name,
      sourceName: external.card,
      source: external.source,
      rarity: external.rarity,
      tags: external.tags,
      cardIdCandidate,
    });
  }

  const missingUpstreamObservations = localAbilities
    .filter(ability => !externalIdSet.has(ability.legacyId))
    .map(ability => ({
      classification: 'missing_upstream_observation',
      legacyId: ability.legacyId,
      abilityId: ability.abilityId,
      name: ability.name,
      sourceName: ability.sourceName,
      linkStatus: ability.linkStatus,
      cardId: ability.cardId,
    }));
  const warnings = [];
  const missingRanges = consecutiveRanges(missingUpstreamObservations.map(item => item.legacyId));
  for (const range of missingRanges.filter(item => item.end > item.start)) {
    const reuse = idReuseSuspected.find(item => item.externalId === range.end + 1);
    if (reuse) {
      warnings.push({
        code: 'CONTIGUOUS_MISSING_IDS_WITH_REUSE_SUSPECTED',
        missing: `${range.start}-${range.end}`,
        reusedCandidate: reuse.externalId,
      });
    }
  }

  const cardMatchCandidates = newCandidates
    .filter(candidate => candidate.classification === 'card_match_candidate').length;
  const unlinkedCandidates = newCandidates.length - cardMatchCandidates;
  const blockReasons = [];
  const reviewReasons = [];
  if (idReuseSuspected.length) blockReasons.push('ID_REUSE_SUSPECTED');
  if (existingContentDifferences.length) reviewReasons.push('EXISTING_CONTENT_DIFFERENCES');
  if (missingUpstreamObservations.length) reviewReasons.push('MISSING_UPSTREAM_OBSERVATIONS');
  let safetyVerdict = 'SAFE';
  if (reviewReasons.length) safetyVerdict = 'REVIEW_REQUIRED';
  if (blockReasons.length) safetyVerdict = 'BLOCKED';

  return {
    ...base,
    auditStatus: 'PASS',
    safetyVerdict,
    blockReasons,
    reviewReasons,
    counts: {
      ...emptyCounts(abilities.length, localAbilities.length, ids, externalValidation.duplicateIds.length),
      newCandidates: newCandidates.length,
      knownExact: knownExact.length,
      representationOnly: representationOnly.length,
      existingContentDifferences: existingContentDifferences.length,
      idReuseSuspected: idReuseSuspected.length,
      missingUpstreamObservations: missingUpstreamObservations.length,
      cardMatchCandidates,
      unlinkedCandidates,
      duplicateLocalContentMatches: duplicateLocalContentMatches.length,
    },
    warnings,
    details: {
      validationErrors: [],
      newCandidates,
      knownExactIdMismatches: knownExact.filter(item => !item.externalIdMatchesLegacyId),
      representationOnly: options.showAllRepresentation
        ? representationOnly : representationOnly.slice(0, 5),
      representationDetailsTruncated: !options.showAllRepresentation && representationOnly.length > 5,
      existingContentDifferences,
      idReuseSuspected,
      missingUpstreamObservations,
      duplicateLocalContentMatches: options.showDuplicateDetails
        ? duplicateLocalContentMatches : [],
      duplicateLocalContentDetailsHidden: !options.showDuplicateDetails
        && duplicateLocalContentMatches.length > 0,
    },
  };
}

function formatCodes(values) {
  return values.length ? values.join(', ') : 'なし';
}

function formatReport(report) {
  const lines = [];
  lines.push('=== lMfDB 外部能力候補監査 ===');
  if (report.input.type === 'remote') {
    lines.push(`入力: ${report.input.externalSha ? `外部コミット ${report.input.externalSha}` : '外部 main'} (${report.input.value})`);
  } else {
    lines.push(`入力ファイル: ${report.input.value}`);
  }
  lines.push(`外部JSON SHA-256: ${report.externalSha256}`);
  lines.push(`監査状態: ${report.auditStatus}`);
  lines.push(`自動同期安全性: ${report.safetyVerdict}（自動同期機能は実装していません）`);
  lines.push(`件数: 外部 ${report.counts.external} / ローカル ${report.counts.local}`);
  lines.push(`登録済み完全一致: ${report.counts.knownExact}`);
  lines.push(`表記違い（低優先度）: ${report.counts.representationOnly}`);
  lines.push(`既存内容差分（自動更新なし）: ${report.counts.existingContentDifferences}`);
  lines.push(`ID再利用疑い: ${report.counts.idReuseSuspected}`);
  lines.push(`新規候補: ${report.counts.newCandidates}`);
  lines.push(`  カード対応候補: ${report.counts.cardMatchCandidates}`);
  lines.push(`  未紐付け候補: ${report.counts.unlinkedCandidates}`);
  lines.push(`外部欠落観測（削除候補ではない）: ${report.counts.missingUpstreamObservations}`);
  lines.push(`重複内容一致（対応不要）: ${report.counts.duplicateLocalContentMatches}件`);
  lines.push(`source内訳: ${Object.entries(report.breakdown.source).map(([key, value]) => `${key} ${value}`).join(' / ') || 'なし'}`);
  lines.push(`rarity内訳: ${Object.entries(report.breakdown.rarity).map(([key, value]) => `${key} ${value}`).join(' / ') || 'なし'}`);
  lines.push(`BLOCK理由: ${formatCodes(report.blockReasons)}`);
  lines.push(`要確認理由: ${formatCodes(report.reviewReasons)}`);
  for (const warning of report.warnings) {
    lines.push(`関連警告: ${warning.code} missing=${warning.missing} reusedCandidate=${warning.reusedCandidate}`);
  }
  if (report.details.idReuseSuspected.length) {
    lines.push('--- ID再利用疑い ---');
    for (const item of report.details.idReuseSuspected) {
      lines.push(`  外部ID ${item.externalId}: local=${item.local.name} / external=${item.external.name} / 変更=${item.normalizedChangedFields.join(',')}`);
    }
  }
  if (report.details.representationOnly.length) {
    lines.push(`--- 表記違い${report.details.representationDetailsTruncated ? '（先頭5件のみ）' : ''} ---`);
    for (const item of report.details.representationOnly) {
      lines.push(`  外部ID ${item.externalId} -> ${item.localAbilityId}: ${item.fields.join(',')}`);
    }
  }
  if (report.details.duplicateLocalContentMatches.length) {
    lines.push('--- 重複内容一致の監査詳細（対応不要） ---');
    for (const item of report.details.duplicateLocalContentMatches) {
      const comparison = item.comparison === 'exact' ? '完全一致' : '比較用正規化後一致';
      lines.push(`  外部ID ${item.externalId} ${item.externalName} / ${comparison} / ${item.localAbilityIds.join(',')}`);
    }
  }
  if (report.details.newCandidates.length) {
    lines.push('--- 新規候補 ---');
    for (const candidate of report.details.newCandidates) {
      lines.push(`  ${candidate.externalId} ${candidate.name} / ${candidate.sourceName} / ${candidate.rarity} / ${candidate.classification}${candidate.cardIdCandidate ? ` (${candidate.cardIdCandidate})` : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function run(options, dependencies = {}) {
  const external = await loadExternal(options, dependencies.fetchImpl);
  const local = dependencies.local || loadLocalDocuments();
  const report = analyze(external.document, local, external.input, sha256(external.buffer), options);
  if (options.jsonReport) fs.writeFileSync(options.jsonReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await run(options);
  process.stdout.write(formatReport(report));
  if (options.jsonReport) process.stdout.write(`JSON監査レポート: ${options.jsonReport}\n`);
  if (report.auditStatus === 'FAIL' || SAFETY_RANK[report.safetyVerdict] >= SAFETY_RANK.BLOCKED) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`lMfDB 外部能力候補監査: auditStatus=FAIL safetyVerdict=BLOCKED ${error.message}\n`);
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
