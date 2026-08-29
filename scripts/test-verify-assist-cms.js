#!/usr/bin/env node
/** verify-assist-cms.js が壊したコピーを確実に拒否することを確認する。 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const childProcess = require('child_process');
const vm = require('vm');
const { validateRoot } = require('./verify-assist-cms');

const repo = path.resolve(__dirname, '..');
function filesUnder(relative) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(repo, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

const targets = [
  ...filesUnder('_cms'),
  'src/data/assist-cards.json',
  'src/data/assist-effects.json',
  'src/data/assist-abilities.json',
  'src/data/lmfdb-card-map.json',
  'scripts/fixtures/lmfdb-abilities-dad5d301.json.gz',
  'scripts/assist-effect-ocr.js',
  'scripts/test-assist-effect-ocr.js',
  'scripts/test-asst-lmfdb-audit-ui.js',
  'scripts/test-asst-lmfdb-create-api.js',
  'scripts/test-asst-lmfdb-write-safety.js',
  'scripts/test-asst-card-create-api.js',
  'scripts/build-assist-pages.js',
];

let destructiveCases = 0;

function makeCopy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p12-11-assist-cms-'));
  for (const relative of targets) {
    const source = path.join(repo, relative);
    const destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return root;
}

function expectFailure(label, mutate, expected) {
  const root = makeCopy();
  try {
    mutate(root);
    const issues = validateRoot(root);
    if (!issues.some(issue => expected.test(issue))) {
      throw new Error(`${label}: 想定したFAILが出ない: ${issues.join(' / ')}`);
    }
    console.log(`PASS ${label}: ${issues.find(issue => expected.test(issue))}`);
    destructiveCases++;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function gasAbilitySchemaContext() {
  const context = {
    console,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(algorithm, text) {
        assert.strictEqual(algorithm, 'SHA_256');
        return [...crypto.createHash('sha256').update(text, 'utf8').digest()];
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repo, '_cms/gas/20_assist.gs'), 'utf8'), context);
  return context;
}

function validExternalRef(context, overrides = {}) {
  const externalNumericId = 1200;
  const provider = 'lmfdb';
  const snapshot = {
    id: externalNumericId, card: 'カードA', name: '新能力', desc: '説明',
    source: '伝授', rarity: 'その他', tags: ['タグ'],
  };
  const comparable = {
    sourceName: snapshot.card, name: snapshot.name, description: snapshot.desc,
    source: snapshot.source, rarity: snapshot.rarity, tags: snapshot.tags,
  };
  const fingerprint = context.asstSha256_(JSON.stringify(comparable));
  const comparisonFingerprint = context.asstSha256_(JSON.stringify(comparable));
  const candidateKey = context.asstSha256_(`${provider}\n${externalNumericId}\n${fingerprint}`);
  return {
    provider,
    candidateKey,
    externalNumericId,
    firstSeenSha: 'a'.repeat(40),
    lastSeenSha: 'a'.repeat(40),
    externalFingerprint: fingerprint,
    comparisonFingerprint,
    externalSnapshotJson: JSON.stringify(snapshot),
    disposition: 'imported',
    abilityId: 'ab-1085',
    importedAt: '2026-08-28T12:00:00+09:00',
    importedBy: 'tester',
    decidedAt: '2026-08-28T12:00:00+09:00',
    decidedBy: 'tester',
    reviewFlagsJson: JSON.stringify(['id_reused']),
    note: '',
    version: 1,
    ...overrides,
  };
}

function runAbilitySchemaUnitTests() {
  const gas = gasAbilitySchemaContext();
  const abilityDoc = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/assist-abilities.json'), 'utf8'));
  assert.strictEqual(abilityDoc.schemaVersion, 2);
  assert(abilityDoc.abilities.length >= 1079);

  const base = abilityDoc.abilities[0];
  const blankRow = {
    abilityId: 'ab-1085', legacyId: '', cardId: '', sourceName: '候補', name: '新能力', description: '説明',
    source: '伝授', rarity: 'その他', tagsJson: '[]', sortOrder: '', linkStatus: 'unlinked',
    flagsJson: '[]', status: 'draft',
  };
  const fromRow = gas.asstAbilityFromRow_(blankRow);
  assert.strictEqual(fromRow.legacyId, null);
  const sheetRow = gas.asstAbilityToSheetRow_(fromRow, 1080, 1, '', '');
  assert.strictEqual(sheetRow[gas.ASST_HEADERS[gas.ASST_SHEET_ABILITIES].indexOf('legacyId')], '');
  assert.strictEqual(gas.asstAbilityFromRow_(Object.assign({}, blankRow, { legacyId: 42 })).legacyId, 42);

  const nullable = abilityDoc.abilities.slice(0, 2).map(item => Object.assign({}, item, { legacyId: null }));
  const ids = nullable.map(item => item.legacyId).filter(item => item !== null);
  assert.strictEqual(ids.length, 0);
  assert.deepStrictEqual(Array.from(gas.asstValidateAbilityRecord_(nullable[0], false)), []);
  assert(gas.asstValidateAbilityRecord_(Object.assign({}, nullable[0], { rarity: null }), true).some(issue => /新規能力はrarity必須/.test(issue)));
  for (const invalid of [0, -1, 1.5, '1']) assert.throws(() => gas.asstLegacyId_(invalid, 'legacyId'));

  const rows = [{ abilityId: 'ab-0001' }, { abilityId: 'ab-0003' }];
  const refs = [{ abilityId: 'ab-0008' }];
  assert.strictEqual(gas.asstNextAbilityId_(rows, refs), 'ab-0009');
  const maxAbilityNumber = Math.max(...abilityDoc.abilities.map(item => Number(item.abilityId.slice(3))));
  const expectedNextAbilityId = `ab-${String(maxAbilityNumber + 1).padStart(4, '0')}`;
  assert.strictEqual(gas.asstNextAbilityId_(abilityDoc.abilities, []), expectedNextAbilityId);
  assert.throws(() => gas.asstNextAbilityId_([{ abilityId: 'bad-0001' }], []), /ab-####/);
  assert.throws(() => gas.asstAssertAbilityIdAvailable_('ab-0001', rows, refs), /衝突/);
  assert.throws(() => gas.asstAssertAbilityIdAvailable_('ab-0008', rows, refs), /衝突/);

  const externalRef = validExternalRef(gas);
  assert.deepStrictEqual(Array.from(gas.asstValidateExternalRefRows_([externalRef])), []);
  for (const disposition of ['imported', 'ignored', 'duplicate', 'unsupported', 'id_reused', 'reverted']) {
    assert.deepStrictEqual(Array.from(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { disposition })])), []);
  }
  assert(gas.asstValidateExternalRefRows_([externalRef, externalRef]).some(issue => /candidateKey重複/.test(issue)));
  assert(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { provider: 'other' })]).some(issue => /provider不正/.test(issue)));
  assert(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { disposition: 'pending' })]).some(issue => /disposition不正/.test(issue)));
  assert(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { externalNumericId: '1200' })]).some(issue => /externalNumericId/.test(issue)));
  assert(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { firstSeenSha: 'A'.repeat(40) })]).some(issue => /firstSeenSha/.test(issue)));
  assert(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { importedAt: '' })]).some(issue => /importedAt/.test(issue)));
  assert(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { externalFingerprint: 'd'.repeat(64) })]).some(issue => /fingerprint/.test(issue)));
  const reorderedSnapshot = JSON.stringify({ card: 'カードA', id: 1200, name: '新能力', desc: '説明', source: '伝授', rarity: 'その他', tags: ['タグ'] });
  assert(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { externalSnapshotJson: reorderedSnapshot })]).some(issue => /列・順序/.test(issue)));
  assert(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { reviewFlagsJson: '["unknown"]' })]).some(issue => /許可値/.test(issue)));
  assert(gas.asstValidateExternalRefRows_([Object.assign({}, externalRef, { version: 1.5 })]).some(issue => /version不正/.test(issue)));
  assert.strictEqual(base.legacyId > 0, true);
  console.log('PASS 能力schema v2・nullable往復・採番器・外部参照行の単体検査');
}

function runDraftPublishExclusionTest() {
  const verifySource = fs.readFileSync(path.join(repo, 'scripts/verify.js'), 'utf8');
  const aggregationBlock = verifySource.match(
    /const resolvedAbilityCounts = new Map\(\);[\s\S]*?(?=\n\s*const expectedPaths =)/,
  );
  assert(aggregationBlock, 'verify.jsの静的カード能力集計を抽出できない');

  const abilities = [
    {
      abilityId: 'ab-verified', cardId: 'test-card', linkStatus: 'resolved', status: 'verified',
      name: 'ok', description: 'go',
    },
    {
      abilityId: 'ab-draft', cardId: 'test-card', linkStatus: 'resolved', status: 'draft',
      name: 'x'.repeat(20), description: 'y'.repeat(20),
    },
  ];
  const result = vm.runInNewContext(`(() => {
    ${aggregationBlock[0]}
    const published = resolvedAbilitiesByCard.get('test-card') || [];
    return {
      count: resolvedAbilityCounts.get('test-card') || 0,
      ids: published.map(ability => ability.abilityId),
      chars: published.reduce((sum, ability) => sum + ability.name.length + ability.description.length, 0),
    };
  })()`, { abilities });

  assert.strictEqual(result.count, 1);
  assert.deepStrictEqual(Array.from(result.ids), ['ab-verified']);
  assert.strictEqual(result.chars, 4);
  assert.strictEqual(795 + result.chars < 800, true);
  assert.strictEqual(795 + abilities.reduce((sum, ability) => sum + ability.name.length + ability.description.length, 0) >= 800, true);
  console.log('PASS resolved draft能力を公開件数・本文・indexゲートから除外');
}

const baselineIssues = validateRoot(repo);
if (baselineIssues.length) {
  throw new Error(`正常系がFAIL: ${baselineIssues.join(' / ')}`);
}
console.log('PASS 正常コピーを受理');
runAbilitySchemaUnitTests();
runDraftPublishExclusionTest();

expectFailure('環境値検査の欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/00_core.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('ENVIRONMENT は production または rehearsal', 'ENVIRONMENTの設定が不正'));
}, /環境値の検査/);

expectFailure('GitHub token参照を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  fs.appendFileSync(file, "\nvar GITHUB_TOKEN = 'test-only-placeholder';\n");
}, /GitHub token参照/);

expectFailure('未解決能力へのcardId混入を拒否', root => {
  const file = path.join(root, 'src/data/assist-abilities.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const ability = doc.abilities.find(item => item.linkStatus !== 'resolved');
  ability.cardId = JSON.parse(fs.readFileSync(path.join(root, 'src/data/assist-cards.json'), 'utf8')).cards[0].cardId;
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /resolved以外はcardId\/sortOrder null必須/);

expectFailure('能力schemaVersion 1への後退を拒否', root => {
  const file = path.join(root, 'src/data/assist-abilities.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  doc.schemaVersion = 1;
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /schemaVersion\/abilitiesが不正/);

expectFailure('既存移行能力1,079件の変更を拒否', root => {
  const file = path.join(root, 'src/data/assist-abilities.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  doc.abilities[0].name += '変更';
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /既存移行能力1,079件/);

expectFailure('非null legacyId重複を拒否', root => {
  const file = path.join(root, 'src/data/assist-abilities.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  doc.abilities[1].legacyId = doc.abilities[0].legacyId;
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /legacyId重複/);

for (const invalidLegacyId of [0, -1, 1.5, '1']) {
  expectFailure(`不正legacyId ${JSON.stringify(invalidLegacyId)}を拒否`, root => {
    const file = path.join(root, 'src/data/assist-abilities.json');
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    doc.abilities[0].legacyId = invalidLegacyId;
    fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  }, /legacyId不正/);
}

expectFailure('不正abilityId形式を拒否', root => {
  const file = path.join(root, 'src/data/assist-abilities.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  doc.abilities[0].abilityId = 'external-0001';
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /abilityId形式不正/);

expectFailure('ability_external_refs列順の変更を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("['provider','candidateKey','externalNumericId'", "['candidateKey','provider','externalNumericId'"));
}, /ability_external_refsの列名または順序/);

expectFailure('ability_external_refsの公開export混入を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('function api_asstExport() {', "function api_asstExport() {\n  var leaked = asstRows_(ASST_SHEET_ABILITY_EXTERNAL_REFS);"));
}, /公開3DBまたはGitHub送信対象へ混入/);

expectFailure('外部能力監査APIの認証欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('  asstRequireUser_();\n  var input = asstAuditPayload_(payload);', '  var input = asstAuditPayload_(payload);'));
}, /監査APIの認証・入力・SHA固定・ローカル読取境界/);

expectFailure('外部能力監査APIへの書込み混入を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('function api_asstAuditExternalAbilities(payload) {', 'function api_asstAuditExternalAbilities(payload) {\n  PropertiesService.getScriptProperties().setProperty("bad", "1");'));
}, /監査APIの読取専用境界/);

expectFailure('固定カード対応表hashのずれを拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('0d9ddf7a4cc0e0ab69b9fe8eab63b913eae70144148f54da852357826bc1c49f', 'f'.repeat(64)));
}, /固定カード対応表hash/);

expectFailure('Sheets日付の未正規化を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('releasedAt: asstDateCell_(row.releasedAt)', "releasedAt: asstText_(row.releasedAt) || null"));
}, /DateをYYYY\/MM\/DD/);

expectFailure('withStatsの空配列誤集計を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replaceAll('card.stats.length > 0', 'card.stats !== null'));
}, /withStatsが入力済みstats配列/);

expectFailure('JSON直接入力UIの再混入を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, `${source}\n<script>function jsonField(){}</script>\n`);
}, /JSON直接入力/);

expectFailure('地形適性UIの再混入を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  fs.appendFileSync(file, '\n<!-- 地形適性 -->\n');
}, /不要な地形適性入力/);

expectFailure('statsの2項目保存を拒否', root => {
  const file = path.join(root, 'src/data/assist-cards.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  doc.cards.find(card => card.stats.length === 3).stats.pop();
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /statsの構造/);

expectFailure('statsの単位欠落を拒否', root => {
  const file = path.join(root, 'src/data/assist-cards.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  doc.cards.find(card => card.stats.length === 3).stats[0].value = '32';
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /statsの構造/);

expectFailure('ルリのcardType誤りを拒否', root => {
  const file = path.join(root, 'src/data/assist-cards.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  doc.cards.find(card => card.cardId === 'b17h-MR-ruri').cardType = 'ガード';
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /ルリのcardType/);

expectFailure('参照専用項目の上書きを拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('limitBreakJson: asstJsonCell_(currentCard.limitBreak)', 'limitBreakJson: asstJsonCell_(card.limitBreak)'));
}, /参照専用項目/);

expectFailure('距離適性UIの再混入を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  fs.appendFileSync(file, '\n<!-- 距離適性 -->\n');
}, /不要な距離適性入力/);

expectFailure('カードstatus UIの再混入を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  fs.appendFileSync(file, '\n<!-- cardStatus -->\n');
}, /不要なカードstatus/);

expectFailure('削除済みカード項目の再混入を拒否', root => {
  const file = path.join(root, 'src/data/assist-cards.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  doc.cards[0].distance = '近距離';
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /削除済みカード項目/);

expectFailure('未知cardTypeを拒否', root => {
  const file = path.join(root, 'src/data/assist-cards.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  doc.cards[0].cardType = '未知タイプ';
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /cardType不正/);

expectFailure('存在しない画像パスを拒否', root => {
  const file = path.join(root, 'src/data/assist-cards.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  doc.cards[0].image = `assist-cards/${doc.cards[0].cardId}.missing`;
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /imageパスまたは実在不正/);

expectFailure('実在しない実装日を拒否', root => {
  const file = path.join(root, 'src/data/assist-cards.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  doc.cards.find(card => card.releasedAt).releasedAt = '2026/02/30';
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /releasedAt不正/);

expectFailure('評価の範囲外を拒否', root => {
  const file = path.join(root, 'src/data/assist-cards.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  doc.cards.find(card => card.ratings).ratings.ikusei = 6;
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /ratingsの構造/);

expectFailure('能力タグの順序破壊を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('var original=ASST.ability.tags||[];', 'var original=[];'));
}, /能力タグの既存順序/);

expectFailure('効果OCRの自動verifiedを拒否', root => {
  const file = path.join(root, 'scripts/assist-effect-ocr.js');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('verified: false', 'verified: true'));
}, /背景未判定または未確認/);

expectFailure('効果OCRの背景分類欠落を拒否', root => {
  const file = path.join(root, 'scripts/assist-effect-ocr.js');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replaceAll('yellowBias', 'removedColorFeature'));
}, /画像判定がない/);

expectFailure('効果OCRのOR発動条件欠落を拒否', root => {
  const file = path.join(root, 'scripts/assist-effect-ocr.js');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("operator: hasOr ? 'or' : 'and'", "operator: 'removed'"));
}, /全体発動条件5種またはOR条件/);

expectFailure('アシストCMSのOCR画面欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("asstTabButton('ocr','効果OCR'", "asstTabButton('removed','削除'"));
}, /候補レビュー画面がない/);

expectFailure('UI効果OCRのローマ数字誤読補正欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(".replace(/[|｜]/g,'Ⅱ')", ''));
}, /ui_assist\.html: OCR正規化規則「\|｜ → Ⅱ の置換」が欠けている/);

expectFailure('scripts効果OCRのローマ数字誤読補正欠落を拒否', root => {
  const file = path.join(root, 'scripts/assist-effect-ocr.js');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("    .replace(/[|｜]/g, 'Ⅱ')\n", ''));
}, /assist-effect-ocr\.js: OCR正規化規則「\|｜ → Ⅱ の置換」が欠けている/);

expectFailure('UI効果OCRのローマ数字保護欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('[（）Ⅰ-Ⅹⅰ-ⅹ]', '[（）ⅰ-ⅹ]'));
}, /ui_assist\.html: OCR正規化規則「保護対象（ ）Ⅰ-Ⅹⅰ-ⅹ」が欠けている/);

expectFailure('UI効果OCRの中黒除去を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(".replace(/^•\\s*/,'')", ".replace(/^[•・]\\s*/,'')"));
}, /ui_assist\.html: OCR正規化規則「・（U\+30FB）を削除対象に含めない」が欠けている/);

expectFailure('Vision日本語文書OCRの欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('DOCUMENT_TEXT_DETECTION', 'REMOVED_TEXT_DETECTION'));
}, /日本語Vision OCRがない/);

expectFailure('Vision APIキーのURL送信を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source
    .replace("'https://vision.googleapis.com/v1/images:annotate'", "'https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(apiKey)")
    .replace("    headers: { 'x-goog-api-key': apiKey },\n", ''));
}, /x-goog-api-keyヘッダー/);

expectFailure('OCR日次上限の未適用を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('var usage = asstReserveOcrDailyUsage_();', "var usage = { count: 0, limit: 0 };"));
}, /OCR_DAILY_LIMITの日次上限/);

expectFailure('黄色背景の発動条件未選択進行を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('if(!types.length)throw new Error', 'if(false)throw new Error'));
}, /発動条件未選択のまま進行/);

expectFailure('ブリーダー派生条件の欠落を拒否', root => {
  const file = path.join(root, 'scripts/assist-effect-ocr.js');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("basis: 'breeder-dependency'", "basis: 'removed-dependency'"));
}, /ブリーダー派生効果の一致条件/);

expectFailure('capture_queueの再導入を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, `${source}\nvar SHEET_CAPTURE_QUEUE = 'capture_queue';\n`);
}, /撤去済みcapture_queue/);

expectFailure('通知と追従ボタンの重なりを拒否', root => {
  const file = path.join(root, '_cms/gas/ui_common.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('.app-toast{position:fixed', '.app-toast{position:static'));
}, /下部通知がない/);

expectFailure('原画像の確認チェック欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("if(!el('asst_ocrSourceConfirmed').checked)throw new Error", 'if(false)throw new Error'));
}, /原画像確認なし/);

expectFailure('カード画像upload API欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('function api_asstUploadCardImage(', 'function removedUploadCardImage('));
}, /カード画像を指定Drive/);

expectFailure('カード画像の指定フォルダID境界欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(
    "var folderId = optionalProp_('ASSIST_IMAGE_FOLDER_ID');",
    "var folderId = 'uncontrolled-folder-id';"
  ));
}, /カード画像を指定Drive/);

expectFailure('カード画像の旧版ゴミ箱移動欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('oldFile.setTrashed(true)', 'oldFile.getName()'));
}, /カード画像を指定Drive/);

expectFailure('カード画像ルートの自動作成を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(
    'var root = DriveApp.getFolderById(folderId);',
    "DriveApp.createFolder('UNCONTROLLED_ASSIST_ROOT');\n  var root = DriveApp.getFolderById(folderId);"
  ));
}, /カード画像を指定Drive/);

expectFailure('カード画像の指定フォルダ直下以外への保存を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('return root;', "return root.createFolder('assist-cards');"));
}, /カード画像を指定Drive/);

expectFailure('カード画像の実体検査欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('if (!isExpectedImage_(bytes, mimeType))', 'if (false)'));
}, /カード画像を指定Drive/);

expectFailure('環境マーカーのnote参照欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/00_core.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("getRange('A1').getNote()", "getRange('A1').getValue()"));
}, /環境マーカーをmembersシートのA1から/);

expectFailure('tokenらしき文字列の混入を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  fs.appendFileSync(file, "\nvar FAKE_TOKEN = 'ghp_1234567890';\n");
}, /tokenらしき文字列/);

expectFailure('アシストUIのGitHub API参照を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  fs.appendFileSync(file, '\n<!-- api.github.com -->\n');
}, /GitHub API参照/);

expectFailure('モンスターソースのGitHub token参照を拒否', root => {
  const file = path.join(root, '_cms/gas/10_monster.gs');
  fs.appendFileSync(file, "\nvar GITHUB_TOKEN = 'test-only-placeholder';\n");
}, /GitHub token参照/);

expectFailure('_cms配下のメールアドレス直書きを拒否', root => {
  const file = path.join(root, '_cms/gas/README.md');
  fs.appendFileSync(file, '\ncontact@example.com\n');
}, /メールアドレス直書き/);

expectFailure('30_publish.gsのGitHub送信欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/30_publish.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replaceAll('api.github.com', 'removed.example'));
}, /GitHub送信が30_publish\.gsのあるべき1か所/);

expectFailure('リハーサルバナーの環境条件反転を拒否', root => {
  const file = path.join(root, '_cms/gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("data.environment==='rehearsal'", "data.environment==='production'"));
}, /リハーサル環境だけに安全バナー/);

expectFailure('リハーサルバナーの常時表示を拒否', root => {
  const file = path.join(root, '_cms/gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("if(data.environment==='rehearsal'){", ''));
}, /リハーサル環境だけに安全バナー/);

expectFailure('リハーサルバナー要素の欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('id="app_env"', 'id="removed_env"'));
}, /リハーサル環境だけに安全バナー/);

expectFailure('リハーサルバナーCSSの欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_common.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('.app-env{', '.removed-env{'));
}, /リハーサル環境だけに安全バナー/);

expectFailure('READMEのB-1方針欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/README.md');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(/常設のtest環境は作りません。[^\n]+\n/, ''));
}, /READMEに常設test/);

expectFailure('asstRewriteSheet_のdeleteRows旧実装を拒否', root => {
  const file = path.join(root, '_cms/gas/40_setup.gs');
  const source = fs.readFileSync(file, 'utf8');
  const old = `function asstRewriteSheet_(name, values) {
  var sheet = asstSheet_(name), headers = ASST_HEADERS[name];
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}`;
  fs.writeFileSync(file, source.replace(
    /function asstRewriteSheet_\(name, values\) \{[\s\S]*?(?=\nfunction\s+)/,
    old
  ));
}, /asstRewriteSheet_はdeleteRowsでデータ行を全削除しない/);

expectFailure('asstRewriteSheet_のclearContent欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/40_setup.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('.clearContent();', ';'));
}, /asstRewriteSheet_は行数確保・既存領域消去・書き込みを順に行う/);

expectFailure('処理中オーバーレイの欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('class="app-busy-overlay"', 'class="removed-busy-overlay"'));
}, /処理中表示/);

expectFailure('外部能力監査UI入口の欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('id="asst_btnExternalAbilityAudit"', 'id="removedExternalAbilityAudit"'));
}, /外部能力監査UIの入口/);

expectFailure('外部能力監査結果のlocalStorage永続化を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('function asstLoadExternalAudit(page,latest){', "function asstLoadExternalAudit(page,latest){\n  localStorage.setItem('audit', 'bad');"));
}, /外部能力監査UIが結果をブラウザまたはGASへ永続化/);

expectFailure('外部能力候補の詳細入口欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replaceAll('data-audit-detail', 'data-removed-detail'));
}, /外部能力候補の詳細・比較・編集プレビューが不足/);

expectFailure('外部能力候補プレビューへの内部キー混入を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('registration:{sourceName:', 'registration:{abilityId:"bad",sourceName:'));
}, /最終プレビュー契約に不足または内部キー混入/);

expectFailure('外部能力候補の許可値検査欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("['resolved','unlinked'].indexOf(d.linkStatus)", "['resolved','unlinked','ambiguous'].indexOf(d.linkStatus)"));
}, /クライアントプレビュー検査が不足/);

expectFailure('外部能力候補の読取値エスケープ欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('esc(asstAuditDisplayValue(value))', 'asstAuditDisplayValue(value)'));
}, /詳細描画・DOM識別子・JSON編集欄の安全条件が不足/);

expectFailure('外部候補追加APIの再監査欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/25_lmfdb_write.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('var audit = asstLmfdbCurrentAudit_(input.payload);', 'var audit = input.payload;'));
}, /追加専用APIの入力契約・再監査/);

expectFailure('全シートsnapshot補償の再導入を拒否', root => {
  const file = path.join(root, '_cms/gas/25_lmfdb_write.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('function asstLmfdbCompensate_(journal) {', `function asstLmfdbSnapshotSheet_(name) { return { values: asstSheet_(name).getDataRange().getValues() }; }
function asstLmfdbCompensate_(journal) {`));
}, /対象行限定の操作ジャーナル/);

expectFailure('補償へのgetLastRow超過行一律削除を拒否', root => {
  const file = path.join(root, '_cms/gas/25_lmfdb_write.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(
    'function asstLmfdbCompensate_(journal) {\n  var errors = [];',
    'function asstLmfdbCompensate_(journal) {\n  var errors = [];\n  while (asstSheet_(ASST_SHEET_ABILITIES).getLastRow() > 1) {}'
  ));
}, /全シートsnapshot復元またはgetLastRow超過行/);

expectFailure('追加行の書込み後内容確認欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/25_lmfdb_write.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(' || !asstLmfdbSameValues_(matches[0].values, entry.values)', ''));
}, /対象行限定の操作ジャーナル/);

expectFailure('補償失敗の重大停止格下げを拒否', root => {
  const file = path.join(root, '_cms/gas/25_lmfdb_write.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('重大エラー: 補償検算失敗。全保存・公開を停止し、再実行せず、保存前の本番bookコピーと比較', '補償に失敗しました。再実行してください'));
}, /対象行限定の操作ジャーナル/);

expectFailure('無関係行保全のmock破壊テスト欠落を拒否', root => {
  const file = path.join(root, 'scripts/test-asst-lmfdb-write-safety.js');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('補償中も別abilityId・candidateKey・log・既存行更新を完全に保持', '削除した安全条件'));
}, /mock破壊テストが不足/);

expectFailure('外部候補処置APIの許可値拡張を拒否', root => {
  const file = path.join(root, '_cms/gas/25_lmfdb_write.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("['ignored','duplicate','unsupported','id_reused']", "['ignored','duplicate','unsupported','id_reused','imported']"));
}, /処置APIの許可値/);

expectFailure('カード保存の共通ScriptLock欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  const block = source.match(/function api_asstSaveCard\(payload\)[\s\S]*?(?=\nfunction )/)[0];
  fs.writeFileSync(file, source.replace(block, block.replace('asstAcquireScriptLock_()', 'LockService.getScriptLock()')));
}, /共通ScriptLock/);

expectFailure('新規カードAPIの追加後再検算欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/20_assist.gs');
  const source = fs.readFileSync(file, 'utf8');
  const block = source.match(/function api_asstCreateCard\(payload\)[\s\S]*?(?=\nfunction )/)[0];
  fs.writeFileSync(file, source.replace(block, block.replace('asstVerifyCreatedCard_(card.cardId, sourceOrder, values);', '')));
}, /新規カード追加専用API/);

expectFailure('新規カードUIのbootstrap前有効化を拒否', root => {
  const file = path.join(root, '_cms/gas/ui_assist.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('id="asst_btnCreateCard" disabled', 'id="asst_btnCreateCard"'));
}, /新規カードUI/);

expectFailure('候補登録のScriptLock解放欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/25_lmfdb_write.gs');
  const source = fs.readFileSync(file, 'utf8');
  const block = source.match(/function api_asstCreateAbilityFromExternalCandidate\(payload\)[\s\S]*?(?=\nfunction )/)[0];
  fs.writeFileSync(file, source.replace(block, block.replace('asstReleaseScriptLock_(lock)', 'removedRelease(lock)')));
}, /二重取得・二重解放または解放欠落/);

expectFailure('アシスト公開のScriptLock二重取得を拒否', root => {
  const file = path.join(root, '_cms/gas/30_publish.gs');
  const source = fs.readFileSync(file, 'utf8');
  const block = source.match(/function api_asstPublish\(\)[\s\S]*?(?=\nfunction )/)[0];
  fs.writeFileSync(file, source.replace(block, block.replace('var lock = asstAcquireScriptLock_();', 'var lock = asstAcquireScriptLock_();\n  asstAcquireScriptLock_();')));
}, /二重取得・二重解放または解放欠落/);

expectFailure('draft resolved能力の生成対象混入を拒否', root => {
  const file = path.join(root, 'scripts/build-assist-pages.js');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("ability.status === 'verified'", "ability.status !== 'removed'"));
}, /draft resolved能力/);

console.log(`OK verifier破壊コピー ${destructiveCases}ケースをすべて拒否`);
childProcess.execFileSync(process.execPath, [path.join(repo, 'scripts/test-asst-lmfdb-read-api.js')], {
  cwd: repo,
  stdio: 'inherit',
});
childProcess.execFileSync(process.execPath, [path.join(repo, 'scripts/test-asst-lmfdb-audit-ui.js')], {
  cwd: repo,
  stdio: 'inherit',
});
childProcess.execFileSync(process.execPath, [path.join(repo, 'scripts/test-asst-lmfdb-create-api.js')], {
  cwd: repo,
  stdio: 'inherit',
});
childProcess.execFileSync(process.execPath, [path.join(repo, 'scripts/test-asst-lmfdb-write-safety.js')], {
  cwd: repo,
  stdio: 'inherit',
});
childProcess.execFileSync(process.execPath, [path.join(repo, 'scripts/test-asst-card-create-api.js')], {
  cwd: repo,
  stdio: 'inherit',
});
