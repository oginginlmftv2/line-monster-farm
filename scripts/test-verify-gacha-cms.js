#!/usr/bin/env node
/** verify-gacha-cms.jsが無改変を通し、破壊コピーを拒否することを確認する。 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateRoot } = require('./verify-gacha-cms');

const repo = path.resolve(__dirname, '..');
const targets = [
  '_cms/gas/50_gacha.gs', '_cms/gas/ui_gacha.html', '_cms/gas/manifest.json',
  '_cms/gas/40_setup.gs', '_cms/gas/00_core.gs', '_cms/gas/index.html', '_cms/gas/README.md',
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

console.log(`OK verifier破壊コピー ${destructiveCases}ケースをすべて拒否`);
