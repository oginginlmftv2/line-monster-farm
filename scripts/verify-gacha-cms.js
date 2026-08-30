#!/usr/bin/env node
/** G3ガチャCMSが新規2シートだけへ安全に保存することを検証する。 */

const fs = require('fs');
const path = require('path');

const FILES = {
  gas: '_cms/gas/50_gacha.gs',
  ui: '_cms/gas/ui_gacha.html',
  manifest: '_cms/gas/manifest.json',
  setup: '_cms/gas/40_setup.gs',
  core: '_cms/gas/00_core.gs',
  shell: '_cms/gas/index.html',
  guide: '_cms/gas/README.md',
};

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function functionBlock(source, name) {
  const start = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (start < 0) return '';
  const brace = source.indexOf('{', start);
  if (brace < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  return source.slice(start);
}

function validateRoot(root) {
  const issues = [];
  for (const relative of Object.values(FILES)) {
    if (!fs.existsSync(path.join(root, relative))) issues.push(`必須ファイルがない: ${relative}`);
  }
  if (issues.length) return issues;

  const gas = read(root, FILES.gas);
  const ui = read(root, FILES.ui);
  const setup = read(root, FILES.setup);
  const core = read(root, FILES.core);
  const shell = read(root, FILES.shell);
  const guide = read(root, FILES.guide);
  let manifest;
  try { manifest = JSON.parse(read(root, FILES.manifest)); }
  catch (error) { issues.push(`manifest.jsonを解析できない: ${error.message}`); return issues; }

  // 1. ファイル、manifest、UI/APIの入口。
  for (const file of ['50_gacha.gs', 'ui_gacha.html']) {
    if (!Array.isArray(manifest.files) || !manifest.files.includes(file)) issues.push(`manifest.jsonに未登録: ${file}`);
  }
  const requiredApis = [
    'api_gachaList', 'api_gachaGet', 'api_gachaSave', 'api_gachaLookupPickup',
    'api_gachaUploadImage', 'api_gachaTypes',
  ];
  for (const name of requiredApis) {
    if (!functionBlock(gas, name)) issues.push(`必須APIがない: ${name}`);
    if (!ui.includes(name) && name !== 'api_gachaGet') issues.push(`ui_gacha.htmlからAPIを呼んでいない: ${name}`);
  }
  if (!/include_\('ui_gacha'\)/.test(shell) || !/gacha:\s*'gacha_root'/.test(shell) || !/id="gacha_root"/.test(ui)) {
    issues.push('ガチャタブとパネルの登録が不足');
  }

  // 2. ヘッダー定義と既存setupへの合流。
  if (!/var\s+GACHA_HEADERS\s*=\s*\{\}/.test(gas) ||
      !/GACHA_HEADERS\[GACHA_SHEET\]/.test(gas) ||
      !/GACHA_HEADERS\[GACHA_TYPE_SHEET\]\s*=\s*\['label'\]/.test(gas)) {
    issues.push('GACHA_HEADERSの2シート定義が不足');
  }
  const allHeaders = functionBlock(setup, 'allHeaders_');
  if (!/\[CORE_HEADERS, MON_HEADERS, ASST_HEADERS, GACHA_HEADERS\]/.test(allHeaders)) {
    issues.push('40_setup.gsのallHeaders_がGACHA_HEADERSを取り込んでいない');
  }
  if (/function\s+setup[^\s(]*Gacha/i.test(gas)) issues.push('ガチャ専用setup関数を追加している');

  // 3. 保存APIはgacha scopeを必須にする。
  const save = functionBlock(gas, 'api_gachaSave');
  if (!/requireScope_\(\s*['"]gacha['"]\s*\)/.test(save)) issues.push("api_gachaSaveがrequireScope_('gacha')を通っていない");
  const saveIdentity = functionBlock(gas, 'gachaSaveIdentity_');
  if (!/current\.status === ['"]published['"][\s\S]{0,100}gachaId:\s*current\.gachaId[\s\S]{0,50}renumbered:\s*false/.test(saveIdentity) ||
      !/current\.startAt\.slice\(0, 10\) === startAt\.slice\(0, 10\)/.test(saveIdentity) ||
      !/gachaNextId_\(startAt, otherRows\)/.test(saveIdentity) ||
      !/image:\s*identity\.renumbered \? ''/.test(save) ||
      !/renumbered:\s*identity\.renumbered/.test(save)) {
    issues.push('publishedのgachaId維持、draftの日付変更時だけの再採番、旧画像参照解除が不足');
  }

  // 4. 既存シート名を参照・書込み対象へ持ち込まない。
  const protectedSheets = ['monsters', 'cards', 'effects', 'abilities', 'members', 'edit_log', 'publish_log', 'assist_log'];
  const referencedProtected = protectedSheets.filter(name => new RegExp(`['"]${name}['"]`).test(gas));
  if (referencedProtected.length) issues.push(`50_gacha.gsが既存シート名を参照している: ${referencedProtected.join(', ')}`);
  if (/MON_SHEET_|ASST_SHEET_|SHEET_MEMBERS|CORE_HEADERS|MON_HEADERS|ASST_HEADERS/.test(gas)) {
    issues.push('50_gacha.gsが既存シート定数またはヘッダーを参照している');
  }

  // 5. 破壊的シート操作を禁止する。
  const destructive = gas.match(/\b(?:deleteSheet|deleteRows|clearContents?)\s*\(/g) || [];
  if (destructive.length) issues.push(`50_gacha.gsに破壊的シート操作がある: ${destructive.join(', ')}`);

  // 6. Spreadsheetはbook_()経由、対象はガチャ2シートだけ。
  if (/SpreadsheetApp\s*\.|openById\s*\(/.test(gas) || !/book_\(\)\.getSheetByName\(name\)/.test(gas)) {
    issues.push('50_gacha.gsのシートアクセスがbook_()経由に限定されていない');
  }
  const sheetAccesses = gas.match(/getSheetByName\s*\(/g) || [];
  if (sheetAccesses.length !== 1 || !/name !== GACHA_SHEET && name !== GACHA_TYPE_SHEET/.test(functionBlock(gas, 'gachaSheet_'))) {
    issues.push('50_gacha.gsのシートアクセス対象がガチャ2シートに限定されていない');
  }

  // 7. 画像は2MB、マジックバイト、指定folder、同名旧版のゴミ箱移動を通す。
  const upload = functionBlock(gas, 'api_gachaUploadImage');
  if (!/GACHA_IMAGE_MAX_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/.test(gas) ||
      !/bytes\.length\s*>\s*GACHA_IMAGE_MAX_BYTES/.test(upload) ||
      !/isExpectedImage_\(bytes, mimeType\)/.test(upload) ||
      !/prop_\('GACHA_DRIVE_FOLDER_ID'\)/.test(upload) ||
      !/setTrashed\(true\)/.test(upload) || !/createFile\(/.test(upload)) {
    issues.push('画像処理の拡張子・2MB・マジックバイト・指定folder・同名上書き境界が不足');
  }

  // 8. 5枠の列名は定数とループで生成する。
  if (!/GACHA_PICKUP_SLOTS\s*=\s*5/.test(gas) ||
      !/push\('monster'\s*\+\s*gachaHeaderSlot_\)/.test(gas) ||
      !/push\('monsterRate'\s*\+\s*gachaMonsterRateHeaderSlot_\)/.test(gas) ||
      !/push\('card'\s*\+\s*gachaCardHeaderSlot_\)/.test(gas) ||
      !/push\('cardRate'\s*\+\s*gachaCardRateHeaderSlot_\)/.test(gas) ||
      /['"](?:monster|monsterRate|card|cardRate)[1-5]['"]/.test(gas)) {
    issues.push('ピックアップ列がGACHA_PICKUP_SLOTSのループ生成になっていない');
  }

  // 9. Script Propertiesを戻り値・ログへ露出しない。
  if (/Logger\s*\.|console\s*\.|return[^;\n]*(?:prop_|PropertiesService)/.test(gas) ||
      (gas.match(/prop_\('GACHA_DRIVE_FOLDER_ID'\)/g) || []).length !== 1) {
    issues.push('Script Propertiesの値を戻り値・ログへ出す経路がある');
  }

  // 10. G3にはGitHub送信を置かない。raw GETは既存関数をCacheService付きで再利用する。
  if (/githubRequest_|UrlFetchApp|api\.github\.com|GITHUB_TOKEN|cms\/gacha-publish/.test(gas) ||
      !/CacheService\.getScriptCache\(\)/.test(gas) ||
      !/asstFetchJson_\(RAW_BASE \+ file\)/.test(gas)) {
    issues.push('G3にGitHub送信または新規取得方式がある');
  }

  if (!/GACHA_DRIVE_FOLDER_ID/.test(guide) || !/ALLOW_DESTRUCTIVE_SETUP.*不要/.test(guide) ||
      !/gacha_types/.test(guide) || !/保存してもサイトは変わりません/.test(guide)) {
    issues.push('READMEの管理者向けG3手順が不足');
  }
  if (!/monster \/ assist \/ gacha/.test(core)) issues.push('requireScope_の案内にgachaがない');

  return issues;
}

function runCli() {
  const rootIndex = process.argv.indexOf('--root');
  const root = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : process.cwd();
  const issues = validateRoot(root);
  console.log(issues.length ? `FAIL ガチャCMS検査 ${issues.length}件` : 'PASS ガチャCMSソース境界');
  issues.forEach(issue => console.log(`  - ${issue}`));
  if (issues.length) process.exitCode = 1;
}

if (require.main === module) runCli();
module.exports = { validateRoot };
