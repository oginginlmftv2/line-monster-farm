#!/usr/bin/env node
/** verify-assist-cms.js が壊したコピーを確実に拒否することを確認する。 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateRoot } = require('./verify-assist-cms');

const repo = path.resolve(__dirname, '..');
const targets = [
  '_cms/assist-gas/コード.gs',
  '_cms/assist-gas/index.html',
  '_cms/assist-gas/README.md',
  'src/data/assist-cards.json',
  'src/data/assist-effects.json',
  'src/data/assist-abilities.json',
  'scripts/assist-effect-ocr.js',
  'scripts/test-assist-effect-ocr.js',
];

function makeCopy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p12-8-assist-cms-'));
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
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const baselineIssues = validateRoot(repo);
if (baselineIssues.length) {
  throw new Error(`正常系がFAIL: ${baselineIssues.join(' / ')}`);
}
console.log('PASS 正常コピーを受理');

expectFailure('test境界の欠落を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("prop_('ENVIRONMENT') !== 'test'", "false"));
}, /ENVIRONMENT=test/);

expectFailure('GitHub token参照を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  fs.appendFileSync(file, "\nvar GITHUB_TOKEN = 'test-only-placeholder';\n");
}, /GitHub token参照/);

expectFailure('未解決能力へのcardId混入を拒否', root => {
  const file = path.join(root, 'src/data/assist-abilities.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const ability = doc.abilities.find(item => item.linkStatus !== 'resolved');
  ability.cardId = JSON.parse(fs.readFileSync(path.join(root, 'src/data/assist-cards.json'), 'utf8')).cards[0].cardId;
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}, /resolved以外はcardId\/sortOrder null必須/);

expectFailure('Sheets日付の未正規化を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('releasedAt: dateCell_(row.releasedAt)', "releasedAt: text_(row.releasedAt) || null"));
}, /DateをYYYY\/MM\/DD/);

expectFailure('withStatsの空配列誤集計を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replaceAll('card.stats.length > 0', 'card.stats !== null'));
}, /withStatsが入力済みstats配列/);

expectFailure('JSON直接入力UIの再混入を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, `${source}\n<script>function jsonField(){}</script>\n`);
}, /JSON直接入力/);

expectFailure('地形適性UIの再混入を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/index.html');
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
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('limitBreakJson: jsonCell_(currentCard.limitBreak)', 'limitBreakJson: jsonCell_(card.limitBreak)'));
}, /参照専用項目/);

expectFailure('距離適性UIの再混入を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/index.html');
  fs.appendFileSync(file, '\n<!-- 距離適性 -->\n');
}, /不要な距離適性入力/);

expectFailure('カードstatus UIの再混入を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/index.html');
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
  const file = path.join(root, '_cms/assist-gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('var original=state.ability.tags||[];', 'var original=[];'));
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

expectFailure('test CMSのOCR画面欠落を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("tabButton('ocr','効果OCR'", "tabButton('removed','削除'"));
}, /候補レビュー画面がない/);

expectFailure('Vision日本語文書OCRの欠落を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('DOCUMENT_TEXT_DETECTION', 'REMOVED_TEXT_DETECTION'));
}, /日本語Vision OCRがない/);

expectFailure('Vision APIキーのURL送信を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source
    .replace("'https://vision.googleapis.com/v1/images:annotate'", "'https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(apiKey)")
    .replace("    headers: { 'x-goog-api-key': apiKey },\n", ''));
}, /x-goog-api-keyヘッダー/);

expectFailure('OCR日次上限の未適用を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('var usage = reserveOcrDailyUsage_();', "var usage = { count: 0, limit: 0 };"));
}, /OCR_DAILY_LIMITの日次上限/);

expectFailure('黄色背景の発動条件未選択進行を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('if(!types.length)throw new Error', 'if(false)throw new Error'));
}, /発動条件未選択のまま進行/);

expectFailure('ブリーダー派生条件の欠落を拒否', root => {
  const file = path.join(root, 'scripts/assist-effect-ocr.js');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("basis: 'breeder-dependency'", "basis: 'removed-dependency'"));
}, /ブリーダー派生効果の一致条件/);

expectFailure('capture_queueの再導入を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, `${source}\nvar SHEET_CAPTURE_QUEUE = 'capture_queue';\n`);
}, /撤去済みcapture_queue/);

expectFailure('通知と追従ボタンの重なりを拒否', root => {
  const file = path.join(root, '_cms/assist-gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('(22+(actions?actions.offsetHeight:0))', '22'));
}, /下部通知がない/);

expectFailure('原画像の確認チェック欠落を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace("if(!el('ocrSourceConfirmed').checked)throw new Error", 'if(false)throw new Error'));
}, /原画像確認なし/);

expectFailure('カード画像upload API欠落を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('function api_uploadCardImage(', 'function removedUploadCardImage('));
}, /カード画像をtest Drive/);

expectFailure('カード画像の指定フォルダID境界欠落を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(
    "var folderId = optionalProp_('ASSIST_IMAGE_FOLDER_ID');",
    "var folderId = 'uncontrolled-folder-id';"
  ));
}, /カード画像をtest Drive/);

expectFailure('カード画像の旧版ゴミ箱移動欠落を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('oldFile.setTrashed(true)', 'oldFile.getName()'));
}, /カード画像をtest Drive/);

expectFailure('カード画像ルートの自動作成を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(
    'var root = DriveApp.getFolderById(folderId);',
    "DriveApp.createFolder('UNCONTROLLED_ASSIST_ROOT');\n  var root = DriveApp.getFolderById(folderId);"
  ));
}, /カード画像をtest Drive/);

expectFailure('カード画像の指定フォルダ直下以外への保存を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('return root;', "return root.createFolder('assist-cards');"));
}, /カード画像をtest Drive/);

expectFailure('カード画像の実体検査欠落を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('if (!isExpectedImage_(bytes, mimeType))', 'if (false)'));
}, /カード画像をtest Drive/);

console.log('OK 破壊コピー37ケースをすべて拒否');
