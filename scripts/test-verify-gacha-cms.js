#!/usr/bin/env node
/** verify-gacha-cms.jsが無改変を通し、破壊コピーを拒否することを確認する。 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const { validateRoot } = require('./verify-gacha-cms');

const repo = path.resolve(__dirname, '..');
const targets = [
  '_cms/gas/50_gacha.gs', '_cms/gas/ui_gacha.html', '_cms/gas/manifest.json',
  '_cms/gas/40_setup.gs', '_cms/gas/00_core.gs', '_cms/gas/index.html', '_cms/gas/README.md',
  '_cms/gas/30_publish.gs', '_cms/gas/ui_publish.html',
  '.github/workflows/cms-gacha-publish.yml', 'scripts/verify-gacha-source.js',
];
let destructiveCases = 0;

function makeCopy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g3-gacha-cms-'));
  targets.forEach(relative => {
    const destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repo, relative), destination);
  });
  return root;
}

function expectFailure(label, mutate, expected) {
  const root = makeCopy();
  try {
    mutate(root);
    const issues = validateRoot(root);
    const found = issues.find(issue => expected.test(issue));
    if (!found) throw new Error(`${label}: 想定したFAILが出ない: ${issues.join(' / ')}`);
    console.log(`PASS ${label}: ${found}`);
    destructiveCases++;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const cleanIssues = validateRoot(repo);
if (cleanIssues.length) throw new Error(`無改変がFAIL: ${cleanIssues.join(' / ')}`);
console.log('PASS 無改変');

{
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repo, '_cms/gas/50_gacha.gs'), 'utf8'), context);
  const rows = [
    { _row: 2, gachaId: '20260901-1', startAt: '2026-09-01T15:00:00+09:00', status: 'draft' },
    { _row: 3, gachaId: '20260908-1', startAt: '2026-09-08T15:00:00+09:00', status: 'draft' },
  ];
  const published = { _row: 2, gachaId: '20260901-1', startAt: '2026-09-01T15:00:00+09:00', status: 'published' };
  const publishedResult = context.gachaSaveIdentity_(published, '2026-09-08T15:00:00+09:00', rows);
  assert.strictEqual(publishedResult.gachaId, '20260901-1');
  assert.strictEqual(publishedResult.renumbered, false);
  const formerlyPublished = { _row: 2, gachaId: '20260901-1', startAt: '2026-09-01T15:00:00+09:00', status: 'draft', publishedAt: '2026-09-01' };
  const formerlyPublishedResult = context.gachaSaveIdentity_(formerlyPublished, '2026-09-08T15:00:00+09:00', rows);
  assert.strictEqual(formerlyPublishedResult.gachaId, '20260901-1');
  assert.strictEqual(formerlyPublishedResult.renumbered, false);
  const sameDate = context.gachaSaveIdentity_(rows[0], '2026-09-01T18:00:00+09:00', rows);
  assert.strictEqual(sameDate.gachaId, '20260901-1');
  assert.strictEqual(sameDate.renumbered, false);
  const shiftedDraft = context.gachaSaveIdentity_(rows[0], '2026-09-08T15:00:00+09:00', rows);
  assert.strictEqual(shiftedDraft.gachaId, '20260908-2');
  assert.strictEqual(shiftedDraft.renumbered, true);
  console.log('PASS 採番条件: published・公開履歴ありID維持、draft同日維持、未公開draft日付変更時の重複回避再採番');
}

expectFailure('必須GAS欠落を拒否', root => fs.unlinkSync(path.join(root, '_cms/gas/50_gacha.gs')), /必須ファイルがない/);
expectFailure('manifest登録欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/manifest.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('    "50_gacha.gs",\n', ''));
}, /manifest\.jsonに未登録/);
expectFailure('GACHA_HEADERS合流欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/40_setup.gs');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(', GACHA_HEADERS', ''));
}, /allHeaders_がGACHA_HEADERS/);
expectFailure('gacha scope欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('function api_gachaSave(payload)');
  fs.writeFileSync(file, source.slice(0, start) + source.slice(start).replace("requireScope_('gacha')", "requireScope_('assist')"));
}, /api_gachaSaveがrequireScope_/);
expectFailure('既存シート参照を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  fs.appendFileSync(file, "\nvar GACHA_BAD_SHEET = 'monsters';\n");
}, /既存シート名/);
expectFailure('deleteRowsを拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  fs.appendFileSync(file, '\nfunction gachaBadDelete_(){ gachaSheet_(GACHA_SHEET).deleteRows(2, 1); }\n');
}, /破壊的シート操作/);
expectFailure('SpreadsheetApp直接参照を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  fs.appendFileSync(file, '\nfunction gachaBadBook_(){ return SpreadsheetApp.openById("bad"); }\n');
}, /book_\(\)経由/);
expectFailure('画像マジックバイト欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('if (!isExpectedImage_(bytes, mimeType))', 'if (false)'));
}, /画像処理/);
expectFailure('画像サイズ上限欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('bytes.length > GACHA_IMAGE_MAX_BYTES', 'false'));
}, /画像処理/);
expectFailure('ピックアップ列ループ欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace("push('monster' + gachaHeaderSlot_)", "push('monster1')"));
}, /GACHA_PICKUP_SLOTS/);
expectFailure('Script Propertyログ出力を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  fs.appendFileSync(file, "\nfunction gachaBadLog_(){ Logger.log(prop_('GACHA_DRIVE_FOLDER_ID')); }\n");
}, /Script Properties/);
expectFailure('UrlFetchApp追加を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  fs.appendFileSync(file, '\nfunction gachaBadFetch_(){ return UrlFetchApp.fetch("https://example.invalid"); }\n');
}, /GitHub送信または新規取得方式/);
expectFailure('publishedのgachaId再採番を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("current.status === 'published'", "current.status === 'draft'"));
}, /publishedのgachaId維持/);

expectFailure('ガチャ公開Workflow欠落を拒否', root => {
  fs.unlinkSync(path.join(root, '.github/workflows/cms-gacha-publish.yml'));
}, /必須ファイルがない/);
expectFailure('concurrency group分離を拒否', root => {
  const file = path.join(root, '.github/workflows/cms-gacha-publish.yml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('group: cms-publish', 'group: cms-gacha-publish'));
}, /concurrency\.group/);
expectFailure('公開branch版ソース検査器の使用を拒否', root => {
  const file = path.join(root, '.github/workflows/cms-gacha-publish.yml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('origin/main:scripts/verify-gacha-source.js', 'HEAD:scripts/verify-gacha-source.js'));
}, /origin\/main/);
expectFailure('api_gachaPublishの30_publish外配置を拒否', root => {
  const file = path.join(root, '_cms/gas/30_publish.gs');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('function api_gachaPublish()', 'function api_gachaPublishMoved()'));
}, /30_publish\.gs/);
expectFailure('gacha公開ガード欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/30_publish.gs');
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('function api_gachaPublish()');
  fs.writeFileSync(file, source.slice(0, start) + source.slice(start).replace("requirePublishable_('gacha')", "requireScope_('gacha')"));
}, /requirePublishable_/);
expectFailure('gacha配下への画像入力復帰を拒否', root => {
  const file = path.join(root, '_cms/gas/50_gacha.gs');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/gacha-banner\//g, 'gacha/'));
}, /gacha-banner/);
expectFailure('publishedAt書込み順序欠落を拒否', root => {
  const file = path.join(root, '_cms/gas/30_publish.gs');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('gachaStampInitialPublishedAt_(rows);', 'rows = rows;'));
}, /publishedAt/);

console.log(`OK verifier破壊コピー ${destructiveCases}ケースをすべて拒否`);
