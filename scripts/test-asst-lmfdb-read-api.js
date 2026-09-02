#!/usr/bin/env node
'use strict';

/** P12-17 段階4-2: GAS読取専用監査APIのネットワーク・Spreadsheet stubテスト。 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const lmfdbAudit = require('./sync-lmfdb-abilities');

const REPO = path.resolve(__dirname, '..');
const FIXED_SHA = 'dad5d301cc7cf3812a8c3f8ea8616642f505d61f';
const FIXTURE = path.join(REPO, 'scripts/fixtures/lmfdb-abilities-dad5d301.json.gz');
const EXTERNAL_BYTES = zlib.gunzipSync(fs.readFileSync(FIXTURE));
const EXTERNAL_DOCUMENT = JSON.parse(EXTERNAL_BYTES.toString('utf8'));
const { renderLmfdbCardMap } = require('./lmfdb-card-map');
const CARDS_DOCUMENT = JSON.parse(fs.readFileSync(path.join(REPO, 'src/data/assist-cards.json'), 'utf8'));
const ABILITIES_DOCUMENT = JSON.parse(fs.readFileSync(path.join(REPO, 'src/data/assist-abilities.json'), 'utf8'));
const CARD_MAP_DOCUMENT = JSON.parse(fs.readFileSync(path.join(REPO, 'src/data/lmfdb-card-map.json'), 'utf8'));
const GAS_SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/20_assist.gs'), 'utf8');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function response(body, status = 200) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return {
    getResponseCode: () => status,
    getBlob: () => ({ getBytes: () => [...bytes] }),
    getContentText: () => bytes.toString('utf8'),
  };
}

function cardRow(card) {
  return {
    sourceOrder: card.sourceOrder,
    cardId: card.cardId,
    name: card.name,
    rarity: card.rarity,
    aura: card.aura,
    cardType: card.cardType,
    monType: card.monType || '',
    image: card.image,
    event2: card.event2 || '',
    releasedAt: card.releasedAt || '',
    accessoryStatus: card.accessoryStatus,
    statsJson: JSON.stringify(card.stats),
    limitBreakJson: JSON.stringify(card.limitBreak),
    ratingsJson: JSON.stringify(card.ratings),
    explanation: card.explanation,
    formationsJson: JSON.stringify(card.formations),
    sapoRefJson: JSON.stringify(card.sapoRef),
    version: card.version,
    updatedAt: card.updatedAt,
    updatedBy: card.updatedBy,
  };
}

function abilityRow(ability) {
  return {
    sourceOrder: ability.sourceOrder,
    abilityId: ability.abilityId,
    legacyId: ability.legacyId === null ? '' : ability.legacyId,
    cardId: ability.cardId || '',
    sourceName: ability.sourceName,
    name: ability.name,
    description: ability.description,
    source: ability.source,
    rarity: ability.rarity || '',
    tagsJson: JSON.stringify(ability.tags),
    sortOrder: ability.sortOrder === null ? '' : ability.sortOrder,
    linkStatus: ability.linkStatus,
    flagsJson: JSON.stringify(ability.flags),
    status: ability.status,
    version: ability.version,
    updatedAt: ability.updatedAt,
    updatedBy: ability.updatedBy,
  };
}

function values(headers, rows) {
  return [headers, ...rows.map(row => headers.map(header => row[header] === undefined ? '' : row[header]))];
}

function makeHarness(options = {}) {
  const calls = { fetch: [], dataRange: { cards: 0, abilities: 0, ability_external_refs: 0 }, auth: 0 };
  const state = {
    cards: options.cards || CARDS_DOCUMENT.cards.map(cardRow),
    abilities: options.abilities || ABILITIES_DOCUMENT.abilities.map(abilityRow),
    refs: options.refs || [],
    assistLog: [{ sentinel: 'unchanged' }],
    properties: { sentinel: 'unchanged' },
    cache: { sentinel: 'unchanged' },
    triggers: [{ sentinel: 'unchanged' }],
    publicDatabases: { sentinel: 'unchanged' },
    generatedHtml: { sentinel: 'unchanged' },
  };
  const headers = {
    cards: ['sourceOrder','cardId','name','rarity','aura','cardType','monType','image','event2','releasedAt','accessoryStatus','statsJson','limitBreakJson','ratingsJson','explanation','formationsJson','sapoRefJson','version','updatedAt','updatedBy'],
    abilities: ['sourceOrder','abilityId','legacyId','cardId','sourceName','name','description','source','rarity','tagsJson','sortOrder','linkStatus','flagsJson','status','version','updatedAt','updatedBy'],
    ability_external_refs: ['provider','candidateKey','externalNumericId','firstSeenSha','lastSeenSha','externalFingerprint','comparisonFingerprint','externalSnapshotJson','disposition','abilityId','importedAt','importedBy','decidedAt','decidedBy','reviewFlagsJson','note','version'],
  };
  if (options.badHeader) headers[options.badHeader][0] = 'broken';
  const sheetRows = { cards: state.cards, abilities: state.abilities, ability_external_refs: state.refs };
  const sheets = {};
  for (const name of Object.keys(sheetRows)) {
    sheets[name] = {
      getDataRange() {
        calls.dataRange[name] += 1;
        return { getValues: () => values(headers[name], sheetRows[name]) };
      },
    };
  }
  if (options.missingSheet) delete sheets[options.missingSheet];
  const rawUrl = `https://raw.githubusercontent.com/futsalife24-bot/lMfDB/${FIXED_SHA}/data/abilities.json`;
  const context = {
    console,
    Map,
    Set,
    JSON,
    Number,
    Object,
    String,
    Array,
    Date,
    Math,
    RegExp,
    isNaN,
    isFinite,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(algorithm, input) {
        assert.strictEqual(algorithm, 'SHA_256');
        const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input.map(byte => byte < 0 ? byte + 256 : byte));
        return [...crypto.createHash('sha256').update(buffer).digest()].map(byte => byte > 127 ? byte - 256 : byte);
      },
      formatDate(date) { return new Date(date).toISOString(); },
    },
    UrlFetchApp: {
      fetch(url, request) {
        calls.fetch.push({ url, request: JSON.parse(JSON.stringify(request || {})) });
        if (options.fetchOverride) return options.fetchOverride(url, calls.fetch.length);
        if (url.endsWith('/git/ref/heads/main')) return response(JSON.stringify({ object: { sha: FIXED_SHA } }));
        if (url === rawUrl) return response(options.externalBytes || EXTERNAL_BYTES);
        throw new Error(`予期しないURL: ${url}`);
      },
    },
    requireScope_(scope) {
      calls.auth += 1;
      assert.strictEqual(scope, 'assist');
      if (options.unauthorized) throw new Error('この操作の権限がありません');
      return { nickname: 'tester', scopes: ['assist'] };
    },
    book_() { return { getSheetByName: name => sheets[name] || null }; },
    LockService: new Proxy({}, { get() { throw new Error('読取APIがLockServiceへアクセスしました'); } }),
    PropertiesService: new Proxy({}, { get() { throw new Error('読取APIがPropertiesServiceへアクセスしました'); } }),
    CacheService: new Proxy({}, { get() { throw new Error('読取APIがCacheServiceへアクセスしました'); } }),
    ScriptApp: new Proxy({}, { get() { throw new Error('読取APIがScriptAppへアクセスしました'); } }),
  };
  vm.createContext(context);
  vm.runInContext(GAS_SOURCE, context);
  return { context, calls, state, before: JSON.stringify(state), rawUrl };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

let passed = 0;
function test(label, action) {
  action();
  passed += 1;
  console.log(`PASS ${label}`);
}

test('固定SHA監査の既知分類件数とBLOCK理由', () => {
  const harness = makeHarness();
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  assert.strictEqual(result.externalSha, FIXED_SHA);
  assert.strictEqual(result.externalSha256, digest(EXTERNAL_BYTES));
  assert.strictEqual(result.auditVersion, 3);
  assert.strictEqual(result.provider, 'lmfdb');
  assert.strictEqual(result.auditStatus, 'PASS', JSON.stringify(result.validationErrors));
  assert.strictEqual(result.safetyVerdict, 'BLOCKED');
  assert.deepStrictEqual(result.blockReasons, ['ID_REUSE_SUSPECTED']);
  assert.strictEqual(result.counts.idReuseSuspected, 1);
  assert.strictEqual(
    result.counts.newCandidates,
    result.counts.cardMatchCandidates + result.counts.unlinkedCandidates,
  );
  assert(result.counts.newCandidates > 0);
  assert.strictEqual(result.counts.missingUpstreamObservations, 20);
  assert.strictEqual(result.counts.duplicateLocalContentMatches, 22);
  const p12Report = lmfdbAudit.analyze(EXTERNAL_DOCUMENT, {
    cards: CARDS_DOCUMENT,
    abilities: ABILITIES_DOCUMENT,
    cardMap: CARD_MAP_DOCUMENT,
  }, { type: 'file', value: 'fixed fixture' }, digest(EXTERNAL_BYTES), { showAllRepresentation: true, showDuplicateDetails: true });
  for (const key of ['newCandidates','knownExact','representationOnly','existingContentDifferences','idReuseSuspected',
    'missingUpstreamObservations','cardMatchCandidates','unlinkedCandidates','duplicateLocalContentMatches']) {
    assert.strictEqual(result.counts[key], p12Report.counts[key], `${key}がP12-17aと不一致`);
  }
  assert(result.candidates.some(candidate => candidate.classification === 'card_match_candidate'));
  const later = plain(makeHarness().context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA, page: 3 }));
  assert(later.candidates.some(candidate => candidate.classification === 'unlinked_candidate'));
  assert(later.candidates.some(candidate => candidate.classification === 'ID_REUSE_SUSPECTED' && candidate.externalNumericId === 1084 &&
    candidate.registrationEligible && candidate.requiresIdReuseConfirmation && !candidate.auditOnly));
  assert(!result.blockReasons.includes('duplicate_local_content_match'));
});

test('SHA省略時だけmainを完全SHAへ解決し固定URLを1回取得', () => {
  const harness = makeHarness();
  const result = harness.context.api_asstAuditExternalAbilities({ page: 1, pageSize: 1 });
  assert.strictEqual(result.externalSha, FIXED_SHA);
  assert.deepStrictEqual(harness.calls.fetch.map(call => call.url), [
    'https://api.github.com/repos/futsalife24-bot/lMfDB/git/ref/heads/main', harness.rawUrl,
  ]);
  harness.calls.fetch.forEach(call => {
    assert.strictEqual(call.request.headers.Accept, 'application/vnd.github+json');
    assert.strictEqual(call.request.headers['User-Agent'], 'line-monster-farm-lmfdb-audit/1.0');
  });
});

test('固定SHA指定時はmainを解決せずabilities.json取得は1回', () => {
  const harness = makeHarness();
  harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA });
  assert.deepStrictEqual(harness.calls.fetch.map(call => call.url), [harness.rawUrl]);
});

test('assist権限なしは取得・シート読取前に拒否', () => {
  const harness = makeHarness({ unauthorized: true });
  assert.throws(() => harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }), /権限/);
  assert.strictEqual(harness.calls.fetch.length, 0);
  assert.deepStrictEqual(harness.calls.dataRange, { cards: 0, abilities: 0, ability_external_refs: 0 });
});

test('payload未知キー・型・SHA・page範囲を厳格に拒否', () => {
  const api = makeHarness().context.api_asstAuditExternalAbilities;
  for (const payload of [null, [], { url: 'https://example.com' }, { externalSha: 'A'.repeat(40) },
    { externalSha: 'a'.repeat(7) }, { page: 0 }, { page: 1.5 }, { page: '1' },
    { pageSize: 0 }, { pageSize: 1001 }, { pageSize: '50' }]) assert.throws(() => api(payload));
});

test('pageSizeは1〜1000を受け付け1回で全候補を返せる', () => {
  const harness = makeHarness();
  const bulk = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA, page: 1, pageSize: 1000 }));
  assert.strictEqual(bulk.pagination.pageSize, 1000);
  assert.strictEqual(bulk.pagination.totalPages, 1);
  assert.strictEqual(bulk.candidates.length, bulk.pagination.totalItems);
  assert.deepStrictEqual(plain(bulk.candidates), plain(allCandidates(makeHarness())));
});

test('HTTP失敗・不正JSON・巨大JSONを拒否', () => {
  const failed = makeHarness({ fetchOverride: () => response('{}', 503) });
  assert.throws(() => failed.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }), /HTTP 503/);
  const invalid = makeHarness({ externalBytes: Buffer.from('{') });
  assert.throws(() => invalid.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }), /JSONとして解析/);
  const huge = makeHarness({ externalBytes: Buffer.alloc(2 * 1024 * 1024 + 1, 32) });
  assert.throws(() => huge.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }), /サイズ/);
});

test('外部構造不正はFAIL・BLOCKED・候補0件', () => {
  const document = { ...EXTERNAL_DOCUMENT, schemaVersion: 2 };
  const harness = makeHarness({ externalBytes: Buffer.from(JSON.stringify(document)) });
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  assert.strictEqual(result.auditStatus, 'FAIL');
  assert.strictEqual(result.safetyVerdict, 'BLOCKED');
  assert.deepStrictEqual(result.blockReasons, ['AUDIT_INPUT_INVALID']);
  assert.deepStrictEqual(result.candidates, []);
});

test('cards・abilities・refsを各1回だけ読み取る', () => {
  const harness = makeHarness();
  harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA });
  assert.deepStrictEqual(harness.calls.dataRange, { cards: 1, abilities: 1, ability_external_refs: 1 });
});

test('シート不在・ヘッダー不一致を修復せずBLOCKED', () => {
  for (const options of [{ missingSheet: 'ability_external_refs' }, { badHeader: 'ability_external_refs' }]) {
    const harness = makeHarness(options);
    const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
    assert.strictEqual(result.auditStatus, 'FAIL');
    assert.strictEqual(result.safetyVerdict, 'BLOCKED');
    assert.deepStrictEqual(result.blockReasons, ['LOCAL_AUDIT_INPUT_INVALID']);
    assert.deepStrictEqual(result.candidates, []);
  }
});

test('履歴行不正を修復せずBLOCKED', () => {
  const harness = makeHarness({ refs: [{ provider: 'lmfdb' }] });
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  assert.strictEqual(result.auditStatus, 'FAIL');
  assert.deepStrictEqual(result.blockReasons, ['LOCAL_AUDIT_INPUT_INVALID']);
});

test('fingerprint・candidateKeyが設計の固定キー順と一致', () => {
  const external = { id: 1200, card: '外部カード', name: '新能力', desc: 'Ａ 説明', source: '伝授', rarity: 'その他', tags: ['ＴＡＧ', '二'] };
  const document = { schemaVersion: 1, generatedFrom: 'ux/index.html', counts: { abilities: 1 }, abilities: [external] };
  const harness = makeHarness({ externalBytes: Buffer.from(JSON.stringify(document)) });
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  const candidate = result.candidates[0];
  const exact = { sourceName: external.card, name: external.name, description: external.desc, source: external.source, rarity: external.rarity, tags: external.tags };
  const normalized = Object.fromEntries(Object.entries(exact).map(([key, value]) => [key, Array.isArray(value) ? value.map(item => item.normalize('NFKC')) : value.normalize('NFKC')]));
  assert.strictEqual(candidate.externalFingerprint, digest(JSON.stringify(exact)));
  assert.strictEqual(candidate.comparisonFingerprint, digest(JSON.stringify(normalized)));
  assert.strictEqual(candidate.candidateKey, digest(`lmfdb\n1200\n${candidate.externalFingerprint}`));
  assert.strictEqual(candidate.externalSnapshot.desc, 'Ａ 説明');
});

test('expectedAbilitiesVersionは行順に依存せず設計3項目だけで決定', () => {
  const first = makeHarness();
  const expected = first.context.asstAuditExpectedAbilitiesVersion_(first.state.abilities);
  const reordered = makeHarness({ abilities: [...first.state.abilities].reverse() });
  assert.strictEqual(reordered.context.asstAuditExpectedAbilitiesVersion_(reordered.state.abilities), expected);
  const changedContent = first.state.abilities.map(row => ({ ...row, description: `${row.description}x` }));
  assert.strictEqual(first.context.asstAuditExpectedAbilitiesVersion_(changedContent), expected);
  const changedVersion = first.state.abilities.map((row, index) => index ? row : { ...row, version: row.version + 1 });
  assert.notStrictEqual(first.context.asstAuditExpectedAbilitiesVersion_(changedVersion), expected);
});

test('同じ入力は同じ結果・優先順・ページを返す', () => {
  const one = plain(makeHarness().context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA, page: 2, pageSize: 17 }));
  const two = plain(makeHarness().context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA, page: 2, pageSize: 17 }));
  assert.deepStrictEqual(one, two);
  assert.strictEqual(one.pagination.page, 2);
  assert.strictEqual(one.pagination.pageSize, 17);
  assert(one.pagination.totalItems > one.candidates.length);
  assert(one.candidates.every((candidate, index, all) => !index || all[index - 1].priorityOrder <= candidate.priorityOrder));
});

test('legacyId nullを外部ID照合と欠落観測から除外', () => {
  const abilities = ABILITIES_DOCUMENT.abilities.map(abilityRow);
  const target = abilities.find(row => row.legacyId === 1084);
  target.legacyId = '';
  const harness = makeHarness({ abilities });
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA, pageSize: 50 }));
  assert.strictEqual(result.counts.idReuseSuspected, 0);
  assert(!result.candidates.some(candidate => candidate.classification === 'missing_upstream_observation' && candidate.externalNumericId === 1084));
});

test('duplicate_local_content_matchだけではBLOCKしない', () => {
  const base = ABILITIES_DOCUMENT.abilities[0];
  const duplicate = { ...base, abilityId: 'ab-9999', legacyId: null, sourceOrder: 9999 };
  const external = { id: 1200, card: base.sourceName, name: base.name, desc: base.description, source: base.source, rarity: base.rarity, tags: base.tags };
  const document = { schemaVersion: 1, generatedFrom: 'ux/index.html', counts: { abilities: 1 }, abilities: [external] };
  const harness = makeHarness({ abilities: [...ABILITIES_DOCUMENT.abilities.map(abilityRow), abilityRow(duplicate)], externalBytes: Buffer.from(JSON.stringify(document)) });
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  assert.strictEqual(result.counts.duplicateLocalContentMatches, 1);
  assert(!result.blockReasons.includes('duplicate_local_content_match'));
});

test('BLOCKEDでも新規候補を返す', () => {
  const harness = makeHarness();
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA, pageSize: 50 }));
  assert.strictEqual(result.safetyVerdict, 'BLOCKED');
  assert(result.candidates.some(candidate => candidate.registrationEligible));
});

test('履歴dispositionとprocessed状態をcandidateKeyで付与', () => {
  const external = { id: 1200, card: '外部カード', name: '履歴能力', desc: '説明', source: 'イベント', rarity: 'MR', tags: [] };
  const exact = { sourceName: external.card, name: external.name, description: external.desc, source: external.source, rarity: external.rarity, tags: [] };
  const fingerprint = digest(JSON.stringify(exact));
  const comparison = fingerprint;
  const candidateKey = digest(`lmfdb\n1200\n${fingerprint}`);
  const snapshot = { id: 1200, card: external.card, name: external.name, desc: external.desc, source: external.source, rarity: external.rarity, tags: [] };
  const refs = [{ provider: 'lmfdb', candidateKey, externalNumericId: 1200, firstSeenSha: FIXED_SHA, lastSeenSha: FIXED_SHA,
    externalFingerprint: fingerprint, comparisonFingerprint: comparison, externalSnapshotJson: JSON.stringify(snapshot),
    disposition: 'ignored', abilityId: '', importedAt: '2026-08-28T12:00:00+09:00', importedBy: 'tester',
    decidedAt: '2026-08-28T12:00:00+09:00', decidedBy: 'tester', reviewFlagsJson: '[]', note: '', version: 1 }];
  const document = { schemaVersion: 1, generatedFrom: 'ux/index.html', counts: { abilities: 1 }, abilities: [external] };
  const harness = makeHarness({ refs, externalBytes: Buffer.from(JSON.stringify(document)) });
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  assert.strictEqual(result.candidates[0].disposition, 'ignored');
  assert.strictEqual(result.candidates[0].processed, true);
  assert.strictEqual(result.candidates[0].registrationEligible, false);
});

test('API実行前後で全stubデータと外部状態が不変', () => {
  const harness = makeHarness();
  harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA });
  assert.strictEqual(JSON.stringify(harness.state), harness.before);
});

test('対応表はrepo正ファイル・cardsシートの双方でカードDBの射影になる', () => {
  const expected = renderLmfdbCardMap(CARDS_DOCUMENT.cards);
  assert.strictEqual(fs.readFileSync(path.join(REPO, 'src/data/lmfdb-card-map.json'), 'utf8'), expected);
  const harness = makeHarness();
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  assert.strictEqual(result.auditStatus, 'PASS');
  assert.strictEqual(result.cardMapSha256, digest(JSON.stringify(JSON.parse(expected).mappings)));
});

function allCandidates(harness) {
  const all = [];
  for (let page = 1; ; page++) {
    const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA, page, pageSize: 50 }));
    all.push(...result.candidates);
    if (page >= result.pagination.totalPages) return all;
  }
}

test('カード追加は対応表の手作業更新なしでカード候補になる', () => {
  const base = plain(makeHarness().context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  const unlinked = allCandidates(makeHarness()).find(candidate => candidate.classification === 'unlinked_candidate');
  assert(unlinked, '未紐付け候補がfixtureに必要');
  const rows = CARDS_DOCUMENT.cards.map(cardRow);
  const added = {
    ...rows[0],
    cardId: 'zzz-NEW-added',
    name: unlinked.externalSnapshot.card,
    rarity: unlinked.externalSnapshot.rarity,
  };
  const harness = makeHarness({ cards: rows.concat([added]) });
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  assert.strictEqual(result.auditStatus, 'PASS', JSON.stringify(result.validationErrors));
  assert.notStrictEqual(result.cardMapSha256, base.cardMapSha256);
  const updated = allCandidates(harness).find(candidate => candidate.candidateKey === unlinked.candidateKey);
  assert.strictEqual(updated.classification, 'card_match_candidate');
  assert.strictEqual(updated.cardIdCandidate, 'zzz-NEW-added');
  assert.strictEqual(result.counts.newCandidates, base.counts.newCandidates);
  assert.strictEqual(result.counts.cardMatchCandidates, base.counts.cardMatchCandidates + 1);
});

test('cardsのname + rarity重複は対応表を作らずFAILにする', () => {
  const rows = CARDS_DOCUMENT.cards.map(cardRow);
  const harness = makeHarness({ cards: rows.concat([{ ...rows[0], cardId: 'zzz-DUP-card' }]) });
  const result = plain(harness.context.api_asstAuditExternalAbilities({ externalSha: FIXED_SHA }));
  assert.strictEqual(result.auditStatus, 'FAIL');
  assert(/name \+ rarityが重複/.test(result.validationErrors[0]), result.validationErrors[0]);
});

console.log(`\n${passed} GAS read API tests passed`);
