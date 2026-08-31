#!/usr/bin/env node
'use strict';

/** P12-17 段階4-5: 外部候補追加・処置APIのSpreadsheet/Lock/HTTP mockテスト。 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const SHA = 'a'.repeat(40);
const NOW = '2026-08-28T12:34:56+09:00';
const ASSIST_SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/20_assist.gs'), 'utf8');
const WRITE_SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/25_lmfdb_write.gs'), 'utf8');
const { buildCardArtifact } = require('./build-assist-pages');

const HEADERS = {
  cards: ['sourceOrder','cardId','name','rarity','aura','cardType','monType','image','event2','releasedAt','accessoryStatus','statsJson','limitBreakJson','ratingsJson','explanation','formationsJson','sapoRefJson','version','updatedAt','updatedBy'],
  assist_effects: ['cardId','effectId','name','description','unlockRank','sortOrder','updatedAt','updatedBy'],
  abilities: ['sourceOrder','abilityId','legacyId','cardId','sourceName','name','description','source','rarity','tagsJson','sortOrder','linkStatus','flagsJson','status','version','updatedAt','updatedBy'],
  ability_external_refs: ['provider','candidateKey','externalNumericId','firstSeenSha','lastSeenSha','externalFingerprint','comparisonFingerprint','externalSnapshotJson','disposition','abilityId','importedAt','importedBy','decidedAt','decidedBy','reviewFlagsJson','note','version'],
  assist_log: ['timestamp','user','action','result','detail'],
};

function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function signed(bytes) { return [...bytes].map(byte => byte > 127 ? byte - 256 : byte); }
function response(value, status = 200) {
  const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  return { getResponseCode: () => status, getBlob: () => ({ getBytes: () => [...bytes] }), getContentText: () => bytes.toString('utf8') };
}

function cardRow() {
  return [1,'card-a','カードA','MR','赤','ガード','','assist-cards/card-a.jpg','','','unknown','[]','null','{"ikusei":null,"karyo":null,"battle":null,"ta":null}','','[]','null',1,NOW,'seed'];
}
function abilityRow(overrides = {}) {
  const value = Object.assign({ sourceOrder: 1, abilityId: 'ab-0001', legacyId: 1, cardId: 'card-a', sourceName: '旧カード', name: '既存能力', description: '既存説明', source: 'イベント', rarity: 'MR', tagsJson: '[]', sortOrder: 1, linkStatus: 'resolved', flagsJson: '[]', status: 'verified', version: 1, updatedAt: NOW, updatedBy: 'seed' }, overrides);
  return HEADERS.abilities.map(key => value[key] === undefined ? '' : value[key]);
}
function externalAbility(id, card, name, overrides = {}) {
  return Object.assign({ id, card, name, desc: `${name}の説明`, tags: [], source: 'イベント', rarity: 'MR' }, overrides);
}
function externalDocument(overrides = {}) {
  const abilities = overrides.abilities || [
    externalAbility(1200, 'カードA', 'カード候補'),
    externalAbility(1201, '未知カード', '未紐付け候補'),
    externalAbility(1, '別カード', '再利用候補', { desc: '別の説明', tags: ['再利用'], source: '伝授', rarity: 'その他' }),
  ];
  return { schemaVersion: 1, generatedFrom: 'ux/index.html', counts: { abilities: abilities.length }, abilities };
}

class Sheet {
  constructor(name, rows, harness) { this.name = name; this.rows = rows; this.harness = harness; }
  getLastRow() { return this.rows.length; }
  getDataRange() { return { getValues: () => clone(this.rows) }; }
  getRange(row, column, rowCount, columnCount) {
    return {
      getValues: () => clone(this.rows.slice(row - 1, row - 1 + rowCount).map(values => values.slice(column - 1, column - 1 + columnCount))),
      setValues: values => {
        for (let r = 0; r < rowCount; r++) {
          if (!this.rows[row - 1 + r]) this.rows[row - 1 + r] = [];
          for (let c = 0; c < columnCount; c++) this.rows[row - 1 + r][column - 1 + c] = values[r][c];
        }
        this.harness.maybeFail(this.name, 'setValues');
      },
    };
  }
  appendRow(values) { this.rows.push(clone(values)); this.harness.maybeFail(this.name, 'appendRow'); }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
}

function makeHarness(options = {}) {
  const document = externalDocument(options.external || {});
  const state = {
    cards: [HEADERS.cards, cardRow()],
    assist_effects: [HEADERS.assist_effects, ['card-a','','','','','','','']],
    abilities: [HEADERS.abilities, ...(options.abilities || [abilityRow()])],
    ability_external_refs: [HEADERS.ability_external_refs, ...(options.refs || [])],
    assist_log: [HEADERS.assist_log, ['sentinel','seed','seed','PASS','unchanged']],
  };
  const harness = {
    state,
    calls: { fetch: [], lock: 0, release: 0, auth: 0 },
    failure: options.failure ? Object.assign({ used: false }, options.failure) : null,
    maybeFail(sheet, op) {
      if (this.failure && !this.failure.used && this.failure.sheet === sheet && this.failure.op === op) {
        this.failure.used = true;
        throw new Error(`injected ${sheet} ${op}`);
      }
    },
  };
  const sheets = Object.fromEntries(Object.entries(state).map(([name, rows]) => [name, new Sheet(name, rows, harness)]));
  const context = {
    console, Map, Set, JSON, Number, Object, String, Array, Date, Math, RegExp, isNaN, isFinite,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest(algorithm, input) {
        const bytes = typeof input === 'string' ? Buffer.from(input) : Buffer.from(input.map(value => value < 0 ? value + 256 : value));
        return signed(crypto.createHash('sha256').update(bytes).digest());
      },
      formatDate(value) { return new Date(value).toISOString(); },
    },
    UrlFetchApp: {
      fetch(url) {
        harness.calls.fetch.push(url);
        if (url.endsWith('/git/ref/heads/main')) return response({ object: { sha: options.latestSha || SHA } });
        if (url.includes('/data/abilities.json')) return response(document);
        throw new Error(`unexpected URL ${url}`);
      },
    },
    LockService: { getScriptLock() { return { tryLock() { harness.calls.lock++; return options.lockAvailable !== false; }, releaseLock() { harness.calls.release++; } }; } },
    requireScope_(scope) { harness.calls.auth++; if (options.unauthorized) throw new Error('権限がありません。'); assert.strictEqual(scope, 'assist'); return { nickname: 'tester', role: 'admin', scopes: ['assist'] }; },
    book_() { return { getSheetByName: name => sheets[name] || null }; },
    nowIso_() { return NOW; },
  };
  vm.createContext(context);
  vm.runInContext(ASSIST_SOURCE, context);
  vm.runInContext(WRITE_SOURCE, context);
  if (options.validationFailure) {
    const original = context.asstValidateDocuments_;
    context.asstValidateDocuments_ = function (...args) {
      const issues = original.apply(this, args);
      if (state.abilities.length > 2) issues.push('injected validation failure');
      return issues;
    };
  }
  harness.context = context;
  harness.document = document;
  harness.before = clone(state);
  return harness;
}

function candidatePayload(harness, id, registrationOverrides = {}, confirmationOverrides = {}) {
  const audit = clone(harness.context.api_asstAuditExternalAbilities({ externalSha: SHA, pageSize: 50 }));
  const candidate = audit.candidates.find(item => item.externalNumericId === id);
  assert(candidate, `candidate ${id}`);
  const original = candidate.externalSnapshot;
  const linkStatus = candidate.cardIdCandidate ? 'resolved' : 'unlinked';
  return {
    auditVersion: 3, provider: 'lmfdb', externalSha: SHA, candidateKey: candidate.candidateKey,
    externalNumericId: candidate.externalNumericId, externalFingerprint: candidate.externalFingerprint,
    expectedAbilitiesVersion: audit.expectedAbilitiesVersion,
    registration: Object.assign({
      sourceName: original.card, name: original.name, description: original.desc, source: original.source,
      rarity: original.rarity, tags: original.tags, linkStatus, cardId: candidate.cardIdCandidate || null,
    }, registrationOverrides),
    confirmations: Object.assign({ originalCompared: true, normalizationReviewed: true, cardReviewed: true, idReuseReviewed: false }, confirmationOverrides),
  };
}

function dispositionPayload(harness, id, disposition, note = '') {
  const create = candidatePayload(harness, id);
  return {
    auditVersion: 3, provider: 'lmfdb', externalSha: SHA, candidateKey: create.candidateKey,
    externalNumericId: create.externalNumericId, externalFingerprint: create.externalFingerprint,
    expectedAbilitiesVersion: create.expectedAbilitiesVersion, disposition, note,
  };
}

function refRowFor(harness, id, disposition = 'id_reused') {
  const candidate = candidatePayload(harness, id);
  const external = harness.document.abilities.find(item => item.id === id);
  const fingerprint = harness.context.asstAuditFingerprint_(external);
  const row = {
    provider: 'lmfdb', candidateKey: candidate.candidateKey, externalNumericId: id,
    firstSeenSha: SHA, lastSeenSha: SHA, externalFingerprint: candidate.externalFingerprint,
    comparisonFingerprint: fingerprint.comparisonFingerprint, externalSnapshotJson: JSON.stringify(fingerprint.snapshot),
    disposition, abilityId: '', importedAt: NOW, importedBy: 'tester', decidedAt: NOW, decidedBy: 'tester',
    reviewFlagsJson: JSON.stringify(disposition === 'id_reused' ? ['id_reused'] : []), note: '', version: 1,
  };
  return HEADERS.ability_external_refs.map(key => row[key]);
}

let passed = 0;
function test(label, action) { action(); passed++; console.log(`PASS ${label}`); }
function assertRestored(harness) { assert.deepStrictEqual(harness.state, harness.before); }

test('正常なunlinked追加・サーバー採番・draft固定', () => {
  const h = makeHarness();
  const result = clone(h.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(h, 1201)));
  assert.deepStrictEqual(result, { ok: true, abilityId: 'ab-0002', legacyId: null, status: 'draft', linkStatus: 'unlinked', sortOrder: null, sourceOrder: 2, externalSha: SHA, externalFingerprint: result.externalFingerprint, validation: 'PASS' });
  const row = h.state.abilities[2];
  assert.strictEqual(row[HEADERS.abilities.indexOf('legacyId')], '');
  assert.strictEqual(row[HEADERS.abilities.indexOf('cardId')], '');
  assert.strictEqual(row[HEADERS.abilities.indexOf('sortOrder')], '');
  assert.strictEqual(row[HEADERS.abilities.indexOf('flagsJson')], '[]');
  assert.strictEqual(row[HEADERS.abilities.indexOf('version')], 1);
});

test('正常なresolved追加と対象カード末尾sortOrder採番', () => {
  const h = makeHarness();
  const result = h.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(h, 1200));
  assert.strictEqual(result.abilityId, 'ab-0002'); assert.strictEqual(result.sortOrder, 2);
  assert.strictEqual(h.state.abilities[2][HEADERS.abilities.indexOf('cardId')], 'card-a');
});

test('欠番・外部IDを使わずabilitiesと予約済みIDの最大値+1', () => {
  const seed = makeHarness();
  const reserved = refRowFor(seed, 1); reserved[HEADERS.ability_external_refs.indexOf('abilityId')] = 'ab-0010';
  const h = makeHarness({ abilities: [abilityRow({ abilityId: 'ab-0003' })], refs: [reserved] });
  const result = h.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(h, 1201));
  assert.strictEqual(result.abilityId, 'ab-0011'); assert.strictEqual(result.sourceOrder, 2);
});

test('未知キーと内部項目を全階層で拒否', () => {
  for (const mutate of [
    p => { p.abilityId = 'ab-9999'; }, p => { p.registration.status = 'verified'; }, p => { p.confirmations.operator = 'x'; },
  ]) { const h = makeHarness(); const p = candidatePayload(h, 1201); mutate(p); assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(p), /未知/); }
});

test('古いSHA・abilitiesVersion・fingerprint・candidateKeyを拒否', () => {
  for (const [field, value, expected] of [['externalSha','b'.repeat(40),/更新/],['expectedAbilitiesVersion','b'.repeat(64),/能力DB/],['externalFingerprint','b'.repeat(64),/fingerprint/],['candidateKey','b'.repeat(64),/一意/]]) {
    const h = makeHarness(); const p = candidatePayload(h, 1201); p[field] = value; assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(p), expected);
  }
});

test('同一候補のimported・ignored・duplicate・unsupported・revertedを拒否', () => {
  for (const disposition of ['imported','ignored','duplicate','unsupported','reverted']) {
    const seed = makeHarness(); const ref = refRowFor(seed, 1201, disposition); if (['imported','reverted'].includes(disposition)) ref[HEADERS.ability_external_refs.indexOf('abilityId')] = 'ab-0099';
    const h = makeHarness({ refs: [ref] }); const p = candidatePayload(h, 1201); assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(p));
  }
});

test('編集後の完全一致・NFKC一致を拒否', () => {
  const exact = makeHarness(); assert.throws(() => exact.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(exact, 1201, { sourceName: '旧カード', name: '既存能力', description: '既存説明', source: 'イベント', rarity: 'MR', tags: [] })), /完全一致/);
  const nfkc = makeHarness({ abilities: [abilityRow({ sourceName: 'Ａ', name: 'Ｂ', description: 'Ｃ' })] });
  assert.throws(() => nfkc.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(nfkc, 1201, { sourceName: 'A', name: 'B', description: 'C', source: 'イベント', rarity: 'MR', tags: [] })), /NFKC/);
});

test('外部原文の完全一致・NFKC一致もID再利用候補で拒否', () => {
  const seed = makeHarness(); const reused = seed.document.abilities.find(item => item.id === 1);
  const exactComparable = { sourceOrder: 2, abilityId: 'ab-0002', legacyId: 2, cardId: '', sourceName: reused.card, name: reused.name, description: reused.desc, source: reused.source, rarity: reused.rarity, tagsJson: JSON.stringify(reused.tags), sortOrder: '', linkStatus: 'unlinked', flagsJson: '[]', status: 'verified', version: 1, updatedAt: NOW, updatedBy: 'seed' };
  const exact = makeHarness({ abilities: [abilityRow(), abilityRow(exactComparable)] });
  assert.throws(() => exact.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(exact, 1, {}, { idReuseReviewed: true })), /完全一致/);
  const normalized = makeHarness({ abilities: [abilityRow(), abilityRow(Object.assign({}, exactComparable, { sourceName: '別カード'.normalize('NFKC'), name: '再利用候補'.normalize('NFKC'), description: '別の説明'.normalize('NFKC') }))] });
  normalized.state.abilities[2][HEADERS.abilities.indexOf('sourceName')] = '別カード';
  normalized.state.abilities[2][HEADERS.abilities.indexOf('name')] = '再利用候補';
  normalized.state.abilities[2][HEADERS.abilities.indexOf('description')] = '別の説明';
  // 半角/全角差を作り、外部原文とのNFKC一致だけを残す。
  normalized.state.abilities[2][HEADERS.abilities.indexOf('sourceName')] = '別カード';
  normalized.state.abilities[2][HEADERS.abilities.indexOf('name')] = '再利用候補';
  normalized.state.abilities[2][HEADERS.abilities.indexOf('description')] = '別の説明';
  normalized.state.abilities[2][HEADERS.abilities.indexOf('tagsJson')] = '["再利用"]';
  normalized.document.abilities.find(item => item.id === 1).name = '再利用候補';
  // sourceNameのASCIIを全角化した独立fixtureで比較する。
  normalized.state.abilities[2][HEADERS.abilities.indexOf('sourceName')] = 'Ａ';
  normalized.document.abilities.find(item => item.id === 1).card = 'A';
  assert.throws(() => normalized.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(normalized, 1, {}, { idReuseReviewed: true })), /NFKC/);
});

test('ID再利用候補は確認必須、id_reused履歴を重複せずimportedへ更新', () => {
  const seed = makeHarness(); const ref = refRowFor(seed, 1, 'id_reused');
  const h = makeHarness({ refs: [ref] }); const rejected = candidatePayload(h, 1);
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(rejected), /ID再利用/);
  const accepted = candidatePayload(h, 1, {}, { idReuseReviewed: true });
  const result = h.context.api_asstCreateAbilityFromExternalCandidate(accepted);
  assert.strictEqual(result.abilityId, 'ab-0002'); assert.strictEqual(h.state.ability_external_refs.length, 2);
  assert.strictEqual(h.state.ability_external_refs[1][HEADERS.ability_external_refs.indexOf('disposition')], 'imported');
  assert.strictEqual(h.state.ability_external_refs[1][HEADERS.ability_external_refs.indexOf('reviewFlagsJson')], '["id_reused"]');
});

test('確認不足・未知cardId・ambiguous・unlinked cardId・sortOrder不整合を拒否', () => {
  const h1 = makeHarness(); const p1 = candidatePayload(h1, 1201); p1.confirmations.originalCompared = false; assert.throws(() => h1.context.api_asstCreateAbilityFromExternalCandidate(p1), /確認/);
  const h2 = makeHarness(); assert.throws(() => h2.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(h2, 1201, { linkStatus: 'resolved', cardId: 'missing' })), /不明/);
  const h3 = makeHarness(); assert.throws(() => h3.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(h3, 1201, { linkStatus: 'ambiguous' })), /ambiguous/);
  const h4 = makeHarness(); assert.throws(() => h4.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(h4, 1201, { cardId: 'card-a' })), /null/);
  const h5 = makeHarness({ abilities: [abilityRow({ sortOrder: 2 })] }); assert.throws(() => h5.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(h5, 1200)), /連番/);
});

test('source・rarity・tags・HTML・制御文字を拒否しCRLFだけLF保存', () => {
  for (const change of [
    { source: '不正' }, { rarity: null }, { tags: ['x','x'] }, { description: '<b>bad</b>' }, { name: 'bad\u0001' },
  ]) { const h = makeHarness(); assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(h, 1201, change))); }
  const h = makeHarness(); h.context.api_asstCreateAbilityFromExternalCandidate(candidatePayload(h, 1201, { description: 'a\r\nb\rc<br>d' }));
  assert.strictEqual(h.state.abilities[2][HEADERS.abilities.indexOf('description')], 'a\nb\nc<br>d');
});

test('サーバー再取得した外部原文の不正HTML・制御文字も拒否', () => {
  for (const item of [
    { external: { abilities: [externalAbility(1201, '未知カード', '未紐付け候補', { desc: '<b>bad</b>' })] }, registration: { description: '管理者確認済み説明' } },
    { external: { abilities: [externalAbility(1201, '未知カード', 'bad\u0001')] }, registration: { name: '管理者確認済み能力', description: '管理者確認済み説明' } },
  ]) {
    const h = makeHarness({ external: item.external }); const p = candidatePayload(h, 1201, item.registration);
    assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(p), /外部原文/);
  }
});

test('lock競合は外部取得・シート変更前に拒否', () => {
  const h = makeHarness({ lockAvailable: false }); const p = candidatePayload(h, 1201); const before = clone(h.state);
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(p), /重なりました/); assert.deepStrictEqual(h.state, before);
});

for (const failure of [
  { label: '能力行書込み失敗', options: { failure: { sheet: 'abilities', op: 'appendRow' } } },
  { label: '参照行書込み失敗', options: { failure: { sheet: 'ability_external_refs', op: 'appendRow' } } },
  { label: '直後検証失敗', options: { validationFailure: true } },
  { label: 'ログ失敗', options: { failure: { sheet: 'assist_log', op: 'appendRow' } } },
]) test(`${failure.label}を補償し件数・内容を復元`, () => {
  const h = makeHarness(failure.options); const p = candidatePayload(h, 1201); h.before = clone(h.state);
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(p)); assertRestored(h);
});

test('既存id_reused参照行の更新失敗を全セル復元', () => {
  const seed = makeHarness(); const ref = refRowFor(seed, 1, 'id_reused');
  const h = makeHarness({ refs: [ref], failure: { sheet: 'ability_external_refs', op: 'setValues' } });
  const p = candidatePayload(h, 1, {}, { idReuseReviewed: true }); h.before = clone(h.state);
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(p)); assertRestored(h);
});

test('処置APIは許可値を保存しcandidateKey一意・abilities不変', () => {
  const h = makeHarness(); const beforeAbilities = clone(h.state.abilities);
  const result = h.context.api_asstSetExternalCandidateDisposition(dispositionPayload(h, 1201, 'ignored', '確認済み'));
  assert.strictEqual(result.disposition, 'ignored'); assert.deepStrictEqual(h.state.abilities, beforeAbilities);
  assert.strictEqual(h.state.ability_external_refs.length, 2);
  const again = dispositionPayload(h, 1201, 'duplicate');
  h.context.api_asstSetExternalCandidateDisposition(again);
  assert.strictEqual(h.state.ability_external_refs.length, 2);
  assert.strictEqual(h.state.ability_external_refs[1][HEADERS.ability_external_refs.indexOf('disposition')], 'duplicate');
});

test('処置APIはimported/reverted/任意値・不正note・誤id_reusedを拒否', () => {
  for (const disposition of ['imported','reverted','free-text']) { const h = makeHarness(); assert.throws(() => h.context.api_asstSetExternalCandidateDisposition(dispositionPayload(h, 1201, disposition))); }
  const html = makeHarness(); assert.throws(() => html.context.api_asstSetExternalCandidateDisposition(dispositionPayload(html, 1201, 'ignored', '<b>x</b>')), /note/);
  const reused = makeHarness(); assert.throws(() => reused.context.api_asstSetExternalCandidateDisposition(dispositionPayload(reused, 1201, 'id_reused')), /ID再利用/);
});

test('ID再利用処置は一覧対象として残り、後続登録できる', () => {
  const h = makeHarness(); h.context.api_asstSetExternalCandidateDisposition(dispositionPayload(h, 1, 'id_reused'));
  const audit = h.context.api_asstAuditExternalAbilities({ externalSha: SHA, pageSize: 50 });
  const candidate = audit.candidates.find(item => item.externalNumericId === 1);
  assert(candidate && !candidate.processed && candidate.registrationEligible && candidate.disposition === 'id_reused');
});

test('draft resolved能力は生成HTML・本文量・index判定から除外', () => {
  const card = { cardId: 'card-a', name: 'カードA', rarity: 'MR', aura: '赤', cardType: 'ガード', accessoryStatus: 'unknown', monType: null, event2: null, releasedAt: null, image: 'assist-cards/card-a.jpg', ratings: null, stats: [], explanation: '管理者解説'.repeat(11), formations: [] };
  const cardById = new Map([[card.cardId, card]]);
  const draft = { abilityId: 'ab-9999', cardId: card.cardId, name: '公開してはいけない能力', description: '非公開本文'.repeat(300), source: 'イベント', tags: [], sortOrder: 1, linkStatus: 'resolved', status: 'draft' };
  const withoutAbility = buildCardArtifact(card, [], [], cardById);
  const withDraft = buildCardArtifact(card, [], [draft], cardById);
  assert.deepStrictEqual(withDraft, withoutAbility);
  assert(!withDraft.html.includes(draft.name)); assert.strictEqual(withDraft.report.indexable, false);
  const verified = buildCardArtifact(card, [], [Object.assign({}, draft, { status: 'verified' })], cardById);
  assert(verified.html.includes(draft.name)); assert(verified.report.visible > withDraft.report.visible); assert.strictEqual(verified.report.indexable, true);
});

console.log(`OK 外部候補追加・処置API ${passed}ケース`);
