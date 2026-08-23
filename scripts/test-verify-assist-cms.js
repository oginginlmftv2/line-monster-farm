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

expectFailure('withStatsの全null誤集計を拒否', root => {
  const file = path.join(root, '_cms/assist-gas/コード.gs');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace('hasNonNullValue_(card.stats)', 'card.stats !== null'));
}, /withStatsが非null値/);

console.log('OK 破壊コピー5ケースをすべて拒否');
