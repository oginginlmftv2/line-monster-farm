#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const audit = require('./sync-lmfdb-abilities');

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

function analyze(document = externalDocument(), local = localDocuments(), options = {}) {
  return audit.analyze(document, local, { type: 'file', value: '/tmp/fixture.json' }, 'fixture-sha256', options);
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
    await assert.rejects(callback, error => error instanceof audit.AuditError && error.code === code);
  });
}

function idReuseFixture() {
  const local = localDocuments();
  local.cards.cards.push({ cardId: 'f7-MR-demiurugosu', name: 'デミウルゴス', rarity: 'MR' });
  local.cardMap.mappings.push({ sourceName: 'デミウルゴス', rarity: 'MR', cardId: 'f7-MR-demiurugosu' });
  local.abilities.abilities.push(localAbility(1084, {
    abilityId: 'ab-1084', legacyId: 1084, cardId: 'f7-MR-demiurugosu',
    sourceName: 'デミウルゴス', name: '炎獄の造物主 II', description: '旧能力の説明',
    source: 'イベント', rarity: 'MR', tags: ['オーラ黒', '攻撃'],
  }));
  const external = externalAbility(1084, {
    card: '[ボス]ヒノトリ(零)', name: 'レネゲイドカウンター', desc: '完全に別の能力説明',
    source: '伝授', rarity: 'その他', tags: ['有利時', '攻撃強化'],
  });
  return { local, external };
}

async function main() {
  const before = protectedSnapshot();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmfdb-candidate-audit-test-'));
  try {
    await test('完全一致は登録済み', () => {
      const report = analyze();
      assert.strictEqual(report.auditStatus, 'PASS');
      assert.strictEqual(report.safetyVerdict, 'SAFE');
      assert.strictEqual(report.counts.knownExact, 2);
      assert.strictEqual(report.counts.newCandidates, 0);
    });

    await test('外部IDが違っても内容一致なら登録済み', () => {
      const report = analyze(externalDocument([
        externalAbility(99, { ...externalAbility(1), id: 99 }), externalAbility(2),
      ]));
      assert.strictEqual(report.counts.knownExact, 2);
      assert.strictEqual(report.counts.newCandidates, 0);
      assert.deepStrictEqual(report.details.knownExactIdMismatches, [{
        externalId: 99, localAbilityId: 'ab-0001', externalIdMatchesLegacyId: false,
      }]);
    });

    await test('NFKC表記違いは新規候補・主要差分にしない', () => {
      const local = localDocuments();
      local.abilities.abilities[0].description = 'R4 A Lv1 123';
      const report = analyze(externalDocument([
        externalAbility(1, { desc: 'Ｒ４ Ａ Ｌｖ１ １２３' }), externalAbility(2),
      ]), local);
      assert.strictEqual(report.counts.representationOnly, 1);
      assert.strictEqual(report.counts.existingContentDifferences, 0);
      assert.strictEqual(report.counts.newCandidates, 0);
    });

    await test('複数ローカル一致は対応不要の低優先度監査情報', () => {
      const duplicateContent = {
        cardId: 'card-a', sourceName: 'カードA', name: '重複能力A', description: '同じ説明',
        source: 'イベント', rarity: 'MR', tags: ['同じタグ'],
      };
      const local = localDocuments({
        abilities: {
          schemaVersion: 1,
          abilities: [
            localAbility(1, {
              abilityId: 'ab-0001', legacyId: 1, cardId: 'card-b', sourceName: 'カードB',
              name: '同一IDだが別内容', description: '別説明', source: '閃き', rarity: 'SSR',
              tags: ['別タグ'],
            }),
            localAbility(50, { abilityId: 'ab-0050', legacyId: 50, ...duplicateContent }),
            localAbility(99, { abilityId: 'ab-0099', legacyId: 99, ...duplicateContent }),
          ],
        },
      });
      const external = externalDocument([
        externalAbility(1, {
          card: 'カードA', name: '重複能力A', desc: '同じ説明', source: 'イベント',
          rarity: 'MR', tags: ['同じタグ'],
        }),
        externalAbility(50, {
          card: 'カードA', name: '重複能力Ａ', desc: '同じ説明', source: 'イベント',
          rarity: 'MR', tags: ['同じタグ'],
        }),
        externalAbility(99, {
          card: 'カードA', name: '重複能力A', desc: '同じ説明', source: 'イベント',
          rarity: 'MR', tags: ['同じタグ'],
        }),
      ]);
      const serialized = JSON.stringify(local);
      const report = analyze(external, local);
      assert.strictEqual(report.auditStatus, 'PASS');
      assert.strictEqual(report.safetyVerdict, 'SAFE');
      assert.deepStrictEqual(report.blockReasons, []);
      assert.deepStrictEqual(report.reviewReasons, []);
      assert.strictEqual(report.counts.duplicateLocalContentMatches, 3);
      assert.strictEqual(report.counts.idReuseSuspected, 0);
      assert.strictEqual(report.counts.newCandidates, 0);
      assert.strictEqual(report.counts.representationOnly, 0);
      assert.strictEqual(report.counts.existingContentDifferences, 0);
      assert.strictEqual(report.counts.cardMatchCandidates, 0);
      assert.strictEqual(report.counts.unlinkedCandidates, 0);
      assert.deepStrictEqual(report.details.duplicateLocalContentMatches, []);
      assert.strictEqual(report.details.duplicateLocalContentDetailsHidden, true);
      const normalOutput = audit.formatReport(report);
      assert(normalOutput.includes('重複内容一致（対応不要）: 3件'));
      assert(!normalOutput.includes('ab-0050'));
      assert(!normalOutput.includes('ab-0099'));

      const detailed = analyze(external, local, { showDuplicateDetails: true });
      assert.deepStrictEqual(detailed.details.duplicateLocalContentMatches.map(item => ({
        classification: item.classification,
        actionable: item.actionable,
        priority: item.priority,
        externalId: item.externalId,
        comparison: item.comparison,
        localAbilityIds: item.localAbilityIds,
      })), [
        { externalId: 1, comparison: 'exact' },
        { externalId: 50, comparison: 'normalized' },
        { externalId: 99, comparison: 'exact' },
      ].map(({ externalId, comparison }) => ({
        classification: 'duplicate_local_content_match',
        actionable: false,
        priority: 'low',
        externalId,
        comparison,
        localAbilityIds: ['ab-0050', 'ab-0099'],
      })));
      const detailedOutput = audit.formatReport(detailed);
      assert(detailedOutput.includes('ab-0050,ab-0099'));
      assert.strictEqual(JSON.stringify(local), serialized);
    });

    await test('表記違い詳細は既定で5件まで', () => {
      const abilities = [];
      const external = [];
      for (let id = 1; id <= 8; id += 1) {
        const odd = id % 2 === 1;
        abilities.push(localAbility(id, {
          abilityId: `ab-${String(id).padStart(4, '0')}`, legacyId: id,
          cardId: odd ? 'card-a' : 'card-b', sourceName: odd ? 'カードA' : 'カードB',
          name: `能力${id}`, description: `Lv${id}`, rarity: odd ? 'MR' : 'SSR', tags: [`タグ${id}`],
        }));
        external.push(externalAbility(id, {
          card: odd ? 'カードA' : 'カードB',
          desc: `Ｌｖ${String.fromCharCode(String(id).charCodeAt(0) + 0xFEE0)}`,
          rarity: odd ? 'MR' : 'SSR',
        }));
      }
      const local = localDocuments({ abilities: { schemaVersion: 1, abilities } });
      const report = analyze(externalDocument(external), local);
      assert.strictEqual(report.counts.representationOnly, 8);
      assert.strictEqual(report.details.representationOnly.length, 5);
      assert.strictEqual(report.details.representationDetailsTruncated, true);
      assert.strictEqual((audit.formatReport(report).match(/ -> /g) || []).length, 5);
      assert.strictEqual(analyze(externalDocument(external), local, {
        showAllRepresentation: true,
      }).details.representationOnly.length, 8);
    });

    await test('名称修正6件は既存内容差分で新規候補にしない', () => {
      const pairs = [
        [34, '解析書 I', '解析者 I'], [35, '解析書 II', '解析者 II'],
        [185, '魔は仲間を見捨てない I', '俺は仲間を見捨てない I'],
        [186, '魔は仲間を見捨てない II', '俺は仲間を見捨てない II'],
        [215, '類いまれなる頭脳 I', '類まれなる頭脳 I'],
        [216, '類いまれなる頭脳 II', '類まれなる頭脳 II'],
      ];
      const localAbilities = pairs.map(([id, localName]) => localAbility(id, {
        abilityId: `ab-${String(id).padStart(4, '0')}`, legacyId: id, cardId: 'card-a',
        sourceName: 'カードA', name: localName, description: `説明${id}`,
        rarity: 'MR', tags: [`タグ${id}`],
      }));
      const external = pairs.map(([id, , externalName]) => externalAbility(id, {
        card: 'カードA', name: externalName, desc: `説明${id}`, rarity: 'MR', tags: [`タグ${id}`],
      }));
      const report = analyze(externalDocument(external), localDocuments({
        abilities: { schemaVersion: 1, abilities: localAbilities },
      }));
      assert.strictEqual(report.counts.existingContentDifferences, 6);
      assert.strictEqual(report.counts.newCandidates, 0);
      assert.strictEqual(report.counts.idReuseSuspected, 0);
    });

    await test('ID 1084はID_REUSE_SUSPECTEDでBLOCKED', () => {
      const fixture = idReuseFixture();
      const serialized = JSON.stringify(fixture.local);
      const report = analyze(externalDocument([externalAbility(1), externalAbility(2), fixture.external]), fixture.local);
      assert.strictEqual(report.auditStatus, 'PASS');
      assert.strictEqual(report.safetyVerdict, 'BLOCKED');
      assert.deepStrictEqual(report.blockReasons, ['ID_REUSE_SUSPECTED']);
      assert.strictEqual(report.details.idReuseSuspected[0].externalId, 1084);
      assert.strictEqual(report.details.idReuseSuspected[0].classification, 'ID_REUSE_SUSPECTED');
      assert.strictEqual(report.counts.existingContentDifferences, 0);
      assert.strictEqual(report.counts.newCandidates, 0);
      assert.strictEqual(JSON.stringify(fixture.local), serialized);
    });

    await test('BLOCKEDでも新規候補一覧まで生成する', () => {
      const fixture = idReuseFixture();
      const report = analyze(externalDocument([
        externalAbility(1), externalAbility(2), fixture.external,
        externalAbility(1200, { card: 'カードA', rarity: 'MR', name: '新規', desc: '新規説明' }),
      ]), fixture.local);
      assert.strictEqual(report.safetyVerdict, 'BLOCKED');
      assert.strictEqual(report.counts.newCandidates, 1);
      assert.strictEqual(report.details.newCandidates[0].name, '新規');
    });

    await test('1064〜1083は欠落観測で削除候補にしない', () => {
      const fixture = idReuseFixture();
      const reusedLocal = fixture.local.abilities.abilities.at(-1);
      fixture.local.abilities.abilities = [];
      for (let id = 1064; id <= 1083; id += 1) {
        fixture.local.abilities.abilities.push(localAbility(id, {
          abilityId: `ab-${id}`, legacyId: id, cardId: null, sourceName: 'バン(ライバル)',
          name: `欠落観測${id}`, description: `説明${id}`, source: '閃き', rarity: 'SSR',
          tags: [`タグ${id}`], sortOrder: null, linkStatus: 'unlinked',
        }));
      }
      fixture.local.abilities.abilities.push(reusedLocal);
      const serialized = JSON.stringify(fixture.local);
      const report = analyze(externalDocument([fixture.external]), fixture.local);
      assert.deepStrictEqual(report.details.missingUpstreamObservations.map(item => item.legacyId),
        Array.from({ length: 20 }, (_, index) => 1064 + index));
      assert(report.details.missingUpstreamObservations
        .every(item => item.classification === 'missing_upstream_observation'));
      assert(!JSON.stringify(report).includes('削除候補'));
      assert.deepStrictEqual(report.warnings, [{
        code: 'CONTIGUOUS_MISSING_IDS_WITH_REUSE_SUSPECTED', missing: '1064-1083', reusedCandidate: 1084,
      }]);
      assert.strictEqual(JSON.stringify(fixture.local), serialized);
    });

    await test('伝授・SR・その他は正常な外部候補値', () => {
      const report = analyze(externalDocument([
        externalAbility(1), externalAbility(2),
        externalAbility(3, { card: '対応なし', name: '伝授候補', source: '伝授', rarity: 'その他' }),
        externalAbility(4, { card: '対応なしSR', name: 'SR候補', source: 'イベント', rarity: 'SR' }),
      ]));
      assert.strictEqual(report.auditStatus, 'PASS');
      assert.strictEqual(report.counts.newCandidates, 2);
      assert.strictEqual(report.counts.unlinkedCandidates, 2);
    });

    await test('新規候補だけ固定完全一致でカード候補を提示', () => {
      const report = analyze(externalDocument([
        externalAbility(1), externalAbility(2),
        externalAbility(3, { card: 'カードA', rarity: 'MR', name: '新規A', desc: '説明A' }),
        externalAbility(4, { card: 'カードA(師匠)', rarity: 'MR', name: '新規B', desc: '説明B' }),
      ]));
      assert.strictEqual(report.counts.cardMatchCandidates, 1);
      assert.strictEqual(report.counts.unlinkedCandidates, 1);
      assert.strictEqual(report.details.newCandidates[0].cardIdCandidate, 'card-a');
      assert.strictEqual(report.details.newCandidates[1].cardIdCandidate, null);
    });

    await test('構造不正はauditStatus FAIL', () => {
      const document = externalDocument(); document.schemaVersion = 2;
      const report = analyze(document);
      assert.strictEqual(report.auditStatus, 'FAIL');
      assert.strictEqual(report.safetyVerdict, 'BLOCKED');
      assert.deepStrictEqual(report.blockReasons, ['AUDIT_INPUT_INVALID']);
    });

    await test('ID重複・必須欠落・tags不正・危険文字列を拒否', () => {
      assert.strictEqual(analyze(externalDocument([externalAbility(1), externalAbility(1)])).auditStatus, 'FAIL');
      const missing = externalAbility(1); delete missing.desc;
      assert.strictEqual(analyze(externalDocument([missing])).auditStatus, 'FAIL');
      assert.strictEqual(analyze(externalDocument([externalAbility(1, { tags: ['重複', '重複'] })])).auditStatus, 'FAIL');
      assert.strictEqual(analyze(externalDocument([externalAbility(1, { desc: '</ScRiPt>' })])).auditStatus, 'FAIL');
    });

    await test('対応表の重複・不存在・欠落はauditStatus FAIL', () => {
      const duplicate = localDocuments();
      duplicate.cardMap.mappings.push({ sourceName: 'カードA', rarity: 'MR', cardId: 'card-a' });
      assert.strictEqual(analyze(externalDocument(), duplicate).auditStatus, 'FAIL');
      const nonexistent = localDocuments(); nonexistent.cardMap.mappings[0].cardId = 'missing-card';
      assert.strictEqual(analyze(externalDocument(), nonexistent).auditStatus, 'FAIL');
      const missing = localDocuments(); missing.cardMap.mappings.pop();
      assert.strictEqual(analyze(externalDocument(), missing).auditStatus, 'FAIL');
    });

    await test('同じ入力は同じ監査結果', () => {
      assert.strictEqual(JSON.stringify(analyze()), JSON.stringify(analyze()));
    });

    await test('SHA指定と監査詳細オプションを解析', () => {
      const options = audit.parseArgs([
        '--sha', 'a'.repeat(40), '--show-all-representation', '--show-duplicate-details',
      ]);
      assert.strictEqual(options.externalSha, 'a'.repeat(40));
      assert.strictEqual(options.showAllRepresentation, true);
      assert.strictEqual(options.showDuplicateDetails, true);
      assert.throws(() => audit.parseArgs(['--sha', 'A'.repeat(40)]), audit.AuditError);
      assert.throws(() => audit.parseArgs(['--sha', 'a'.repeat(40), '--file', '/tmp/x']), audit.AuditError);
    });

    await test('JSONレポートは一時ディレクトリ配下だけ', () => {
      const reportPath = path.join(tempDir, 'report.json');
      assert.strictEqual(audit.parseArgs(['--json-report', reportPath]).jsonReport, reportPath);
      assert.strictEqual(audit.parseArgs(['--json-report', '/tmp/lmfdb-report.json']).jsonReport, '/tmp/lmfdb-report.json');
      assert.throws(() => audit.parseArgs(['--json-report', path.join(REPO, 'report.json')]), audit.AuditError);
    });

    const validFile = path.join(tempDir, 'valid.json');
    fs.writeFileSync(validFile, JSON.stringify(externalDocument()), 'utf8');
    await test('ローカルJSONパスを読み込める', async () => {
      assert.strictEqual((await audit.loadExternal({ inputFile: validFile })).document.abilities.length, 2);
    });
    const emptyFile = path.join(tempDir, 'empty.json'); fs.writeFileSync(emptyFile, '', 'utf8');
    await expectAuditError('空入力を拒否', () => audit.loadExternal({ inputFile: emptyFile }), 'EMPTY_RESPONSE');
    const invalidFile = path.join(tempDir, 'invalid.json'); fs.writeFileSync(invalidFile, '{', 'utf8');
    await expectAuditError('不正JSONを拒否', () => audit.loadExternal({ inputFile: invalidFile }), 'INVALID_JSON');
    const largeFile = path.join(tempDir, 'large.json');
    fs.writeFileSync(largeFile, Buffer.alloc(audit.MAX_RESPONSE_BYTES + 1));
    await expectAuditError('巨大入力を拒否', () => audit.loadExternal({ inputFile: largeFile }), 'RESPONSE_TOO_LARGE');
    await expectAuditError('HTTP失敗を拒否', () => audit.loadExternal(
      { inputFile: null, externalSha: null }, async () => new Response('failure', { status: 503 }),
    ), 'HTTP_ERROR');

    await test('取得失敗時も既存データを変更しない', async () => {
      const snapshot = protectedSnapshot();
      await assert.rejects(() => audit.loadExternal(
        { inputFile: null, externalSha: null }, async () => { throw new Error('network down'); },
      ), error => error instanceof audit.AuditError && error.code === 'FETCH_ERROR');
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
