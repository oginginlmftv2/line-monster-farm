#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sync = require('./sync-lmfdb-abilities');

const REPO = path.resolve(__dirname, '..');
let passed = 0;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO, relativePath), 'utf8'));
}

function protectedSnapshot() {
  const cards = readJson('src/data/assist-cards.json').cards;
  const paths = [
    'src/data/assist-cards.json',
    'src/data/assist-effects.json',
    'src/data/assist-abilities.json',
    ...cards.map(card => `cards/${card.cardId}.html`),
  ];
  const hash = crypto.createHash('sha256');
  for (const relativePath of paths) {
    hash.update(relativePath);
    hash.update(fs.readFileSync(path.join(REPO, relativePath)));
  }
  return { paths: paths.length, sha256: hash.digest('hex') };
}

function externalAbility(id, overrides = {}) {
  return {
    id,
    name: `能力${id}`,
    desc: `説明${id}`,
    card: id === 1 ? 'カードA' : 'カードB',
    tags: [`タグ${id}`],
    source: 'イベント',
    rarity: id === 1 ? 'MR' : 'SSR',
    ...overrides,
  };
}

function externalDocument(abilities = [externalAbility(1), externalAbility(2)]) {
  return {
    schemaVersion: 1,
    generatedFrom: 'ux/index.html',
    counts: { abilities: abilities.length },
    abilities,
  };
}

function localAbility(id, overrides = {}) {
  const external = externalAbility(id);
  return {
    abilityId: `ab-${String(id).padStart(4, '0')}`,
    legacyId: id,
    cardId: id === 1 ? 'card-a' : 'card-b',
    sourceName: external.card,
    name: external.name,
    description: external.desc,
    source: external.source,
    rarity: external.rarity,
    tags: external.tags,
    sortOrder: 1,
    linkStatus: 'resolved',
    flags: ['keep-local'],
    status: 'verified',
    ...overrides,
  };
}

function localDocuments(overrides = {}) {
  const local = {
    cards: {
      schemaVersion: 3,
      cards: [
        { cardId: 'card-a', name: 'カードA', rarity: 'MR' },
        { cardId: 'card-b', name: 'カードB', rarity: 'SSR' },
      ],
    },
    abilities: {
      schemaVersion: 1,
      abilities: [localAbility(1), localAbility(2)],
    },
    cardMap: {
      schemaVersion: 1,
      mappings: [
        { sourceName: 'カードA', rarity: 'MR', cardId: 'card-a' },
        { sourceName: 'カードB', rarity: 'SSR', cardId: 'card-b' },
      ],
    },
  };
  return { ...local, ...overrides };
}

function analyze(document = externalDocument(), local = localDocuments()) {
  return sync.analyze(document, local, { type: 'file', value: '/tmp/fixture.json' }, 'fixture-sha256');
}

async function test(name, callback) {
  try {
    await callback();
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}: ${error.stack || error.message}\n`);
    throw error;
  }
}

async function expectAuditError(name, callback, code) {
  await test(name, async () => {
    await assert.rejects(callback, error => error instanceof sync.AuditError && error.code === code);
  });
}

async function main() {
  const before = protectedSnapshot();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmfdb-dry-run-test-'));
  try {
    await test('正常データはSAFE', () => {
      const report = analyze();
      assert.strictEqual(report.decision, 'SAFE');
      assert.deepStrictEqual(report.counts, {
        external: 2, local: 2, externalIdMin: 1, externalIdMax: 2,
        externalIdDuplicates: 0, additions: 0, changes: 0, missing: 0,
        resolvedImpacts: 0, resolvedCandidates: 0, unlinkedCandidates: 0,
        abilityIdCollisions: 0, cardIdContradictions: 0,
      });
    });

    await test('新規IDは完全一致対応だけresolved候補', () => {
      const document = externalDocument([externalAbility(1), externalAbility(2), externalAbility(3, {
        card: 'カードA', rarity: 'MR', name: '能力3', desc: '説明3', tags: ['タグ3'],
      })]);
      const report = analyze(document);
      assert.strictEqual(report.counts.additions, 1);
      assert.deepStrictEqual(report.details.resolvedCandidates, [{ legacyId: 3, cardId: 'card-a' }]);
      assert.strictEqual(report.decision, 'SAFE');
    });

    await test('既存内容変更は項目別に検出', () => {
      const document = externalDocument([externalAbility(1, { name: '変更後', tags: ['新タグ'] }), externalAbility(2)]);
      const report = analyze(document);
      assert.strictEqual(report.decision, 'REVIEW_REQUIRED');
      assert.deepStrictEqual(report.details.changes[0].fields, ['name', 'tags']);
      assert.strictEqual(report.counts.resolvedImpacts, 1);
    });

    await test('外部ID欠落は自動削除せず要レビュー', () => {
      const report = analyze(externalDocument([externalAbility(1)]));
      assert.strictEqual(report.counts.missing, 1);
      assert.deepStrictEqual(report.details.missing, [2]);
      assert.strictEqual(report.decision, 'REVIEW_REQUIRED');
    });

    await test('ID重複はBLOCKED', () => {
      const report = analyze(externalDocument([externalAbility(1), externalAbility(1)]));
      assert.strictEqual(report.decision, 'BLOCKED');
      assert.strictEqual(report.counts.externalIdDuplicates, 1);
    });

    await test('schemaVersion不正はBLOCKED', () => {
      const document = externalDocument();
      document.schemaVersion = 2;
      assert.strictEqual(analyze(document).decision, 'BLOCKED');
    });

    await test('counts不一致はBLOCKED', () => {
      const document = externalDocument();
      document.counts.abilities = 999;
      assert.strictEqual(analyze(document).decision, 'BLOCKED');
    });

    await test('必須項目欠落はBLOCKED', () => {
      const ability = externalAbility(1);
      delete ability.desc;
      assert.strictEqual(analyze(externalDocument([ability])).decision, 'BLOCKED');
    });

    await test('tags不正はBLOCKED', () => {
      const report = analyze(externalDocument([externalAbility(1, { tags: ['重複', '重複'] })]));
      assert.strictEqual(report.decision, 'BLOCKED');
    });

    await test('危険文字列はBLOCKED', () => {
      const report = analyze(externalDocument([externalAbility(1, { desc: '</ScRiPt><p>' })]));
      assert.strictEqual(report.decision, 'BLOCKED');
    });

    await test('未知sourceとrarityは変換せず要レビュー', () => {
      const report = analyze(externalDocument([externalAbility(1, { source: '伝授', rarity: 'SR' }), externalAbility(2)]));
      assert.deepStrictEqual(report.details.unknownSources, ['伝授']);
      assert.deepStrictEqual(report.details.unknownRarities, ['SR']);
      assert.strictEqual(report.decision, 'REVIEW_REQUIRED');
    });

    await test('対応表にないカードはunlinked候補', () => {
      const document = externalDocument([externalAbility(1), externalAbility(2), externalAbility(3, {
        card: '対応なし', rarity: 'MR', name: '能力3', desc: '説明3', tags: ['タグ3'],
      })]);
      const report = analyze(document);
      assert.strictEqual(report.counts.unlinkedCandidates, 1);
      assert.strictEqual(report.decision, 'REVIEW_REQUIRED');
    });

    await test('対応表重複はBLOCKED', () => {
      const local = localDocuments();
      local.cardMap.mappings.push({ sourceName: 'カードA', rarity: 'MR', cardId: 'card-a' });
      assert.strictEqual(analyze(externalDocument(), local).decision, 'BLOCKED');
    });

    await test('存在しないcardIdはBLOCKED', () => {
      const local = localDocuments();
      local.cardMap.mappings[0].cardId = 'missing-card';
      assert.strictEqual(analyze(externalDocument(), local).decision, 'BLOCKED');
    });

    await test('現行カードの対応表欠落はBLOCKED', () => {
      const local = localDocuments();
      local.cardMap.mappings.pop();
      assert.strictEqual(analyze(externalDocument(), local).decision, 'BLOCKED');
    });

    await test('cardId対応矛盾はBLOCKED', () => {
      const local = localDocuments();
      local.abilities.abilities[0].cardId = 'card-b';
      assert.strictEqual(analyze(externalDocument(), local).decision, 'BLOCKED');
    });

    await test('abilityId衝突候補はBLOCKED', () => {
      const local = localDocuments();
      local.abilities.abilities.push(localAbility(99, { abilityId: 'ab-0003', legacyId: 99, cardId: null, sortOrder: null, linkStatus: 'unlinked' }));
      const document = externalDocument([externalAbility(1), externalAbility(2), externalAbility(3, {
        card: 'カードA', rarity: 'MR', name: '能力3', desc: '説明3', tags: ['タグ3'],
      }), externalAbility(99)]);
      const report = analyze(document, local);
      assert.strictEqual(report.counts.abilityIdCollisions, 1);
      assert.strictEqual(report.decision, 'BLOCKED');
    });

    await test('ローカル管理項目を変更しない', () => {
      const local = localDocuments();
      const serialized = JSON.stringify(local);
      analyze(externalDocument([externalAbility(1, { name: '変更' }), externalAbility(2)]), local);
      assert.strictEqual(JSON.stringify(local), serialized);
      assert.deepStrictEqual(local.abilities.abilities[0].flags, ['keep-local']);
      assert.strictEqual(local.abilities.abilities[0].sortOrder, 1);
    });

    await test('同じ入力は同じ監査結果', () => {
      const first = JSON.stringify(analyze());
      const second = JSON.stringify(analyze());
      assert.strictEqual(first, second);
    });

    await test('SHA指定は40桁小文字16進数だけ', () => {
      assert.strictEqual(sync.parseArgs(['--sha', 'a'.repeat(40)]).externalSha, 'a'.repeat(40));
      assert.throws(() => sync.parseArgs(['--sha', 'A'.repeat(40)]), sync.AuditError);
      assert.throws(() => sync.parseArgs(['--sha', 'abc']), sync.AuditError);
      assert.throws(() => sync.parseArgs(['--sha', 'a'.repeat(40), '--file', '/tmp/x']), sync.AuditError);
    });

    await test('JSONレポートは一時ディレクトリ配下だけ', () => {
      const reportPath = path.join(tempDir, 'report.json');
      assert.strictEqual(sync.parseArgs(['--json-report', reportPath]).jsonReport, reportPath);
      assert.strictEqual(sync.parseArgs(['--json-report', '/tmp/lmfdb-report.json']).jsonReport, '/tmp/lmfdb-report.json');
      assert.throws(() => sync.parseArgs(['--json-report', path.join(REPO, 'report.json')]), sync.AuditError);
    });

    const validFile = path.join(tempDir, 'valid.json');
    fs.writeFileSync(validFile, JSON.stringify(externalDocument()), 'utf8');
    await test('ローカルJSONパスを読み込める', async () => {
      const result = await sync.loadExternal({ inputFile: validFile });
      assert.strictEqual(result.document.abilities.length, 2);
      assert.strictEqual(result.input.type, 'file');
    });

    const emptyFile = path.join(tempDir, 'empty.json');
    fs.writeFileSync(emptyFile, '', 'utf8');
    await expectAuditError('空入力を拒否', () => sync.loadExternal({ inputFile: emptyFile }), 'EMPTY_RESPONSE');

    const invalidFile = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(invalidFile, '{', 'utf8');
    await expectAuditError('不正JSONを拒否', () => sync.loadExternal({ inputFile: invalidFile }), 'INVALID_JSON');

    const largeFile = path.join(tempDir, 'large.json');
    fs.writeFileSync(largeFile, Buffer.alloc(sync.MAX_RESPONSE_BYTES + 1));
    await expectAuditError('巨大入力を拒否', () => sync.loadExternal({ inputFile: largeFile }), 'RESPONSE_TOO_LARGE');

    await expectAuditError('HTTP失敗を拒否', () => sync.loadExternal(
      { inputFile: null, externalSha: null },
      async () => new Response('failure', { status: 503 }),
    ), 'HTTP_ERROR');

    await test('取得失敗時も既存データを変更しない', async () => {
      const snapshot = protectedSnapshot();
      await assert.rejects(() => sync.loadExternal(
        { inputFile: null, externalSha: null },
        async () => { throw new Error('network down'); },
      ), error => error instanceof sync.AuditError && error.code === 'FETCH_ERROR');
      assert.deepStrictEqual(protectedSnapshot(), snapshot);
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const after = protectedSnapshot();
  assert.deepStrictEqual(after, before, '実行前後で既存3DBまたは生成HTMLが変化しました');
  process.stdout.write(`PASS 既存3DBと生成HTML ${after.paths}ファイルに差分なし\n`);
  process.stdout.write(`\n${passed + 1} tests passed\n`);
}

main().catch(() => process.exit(1));
