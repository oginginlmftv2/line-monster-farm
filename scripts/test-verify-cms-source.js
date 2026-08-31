#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CMS_SCRIPT = path.join(__dirname, 'verify-cms-source.js');
const ASSIST_SCRIPT = path.join(__dirname, 'verify-assist-source.js');
let passed = 0;
const fixtureDirs = [];

process.on('exit', () => {
  for (const dir of fixtureDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function git(repo, ...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(repo, relative, content) {
  const target = path.join(repo, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function commit(repo, message) {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-source-gate-'));
  fixtureDirs.push(repo);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'CMS gate test');
  git(repo, 'config', 'user.email', 'cms-gate@example.invalid');
  write(repo, 'monsters-data.js', 'const monsters = [];\n');
  write(repo, 'src/data/cms-id-predictions.json', '{}\n');
  write(repo, 'src/data/monsters-editorial.json', '{}\n');
  write(repo, 'monsters.html', 'baseline\n');
  return { repo, base: commit(repo, 'base') };
}

function run(repo, args, script = CMS_SCRIPT) {
  return spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });
}

function expect(name, result, success, pattern) {
  const ok = success ? result.status === 0 : result.status !== 0;
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (!ok || (pattern && !pattern.test(output))) {
    console.error(`FAIL: ${name}`);
    console.error(output.trim());
    process.exit(1);
  }
  passed++;
  console.log(`PASS: ${name}`);
}

{
  const { repo, base } = fixture();
  write(repo, 'src/data/monsters-editorial.json', '{"updated":true}\n');
  const source = commit(repo, 'CMS publish 2026-08-22 12:00:00');
  expect('許可されたCMS入力', run(repo, ['source', source, base]), true, /PASS:/);
}

{
  const { repo, base } = fixture();
  git(repo, 'commit', '--allow-empty', '-m', 'CMS publish 2026-08-22 12:00:00');
  const source = git(repo, 'rev-parse', 'HEAD');
  expect('変更なしの再公開', run(repo, ['source', source, base]), true, /0ファイル/);
}

{
  const { repo, base } = fixture();
  write(repo, 'unexpected.txt', 'blocked\n');
  const source = commit(repo, 'CMS publish 2026-08-22 12:00:01');
  expect('許可外ファイルを拒否', run(repo, ['source', source, base]), false, /許可外/);
}

{
  const { repo, base } = fixture();
  git(repo, 'rm', 'src/data/monsters-editorial.json');
  const source = commit(repo, 'CMS publish 2026-08-22 12:00:01');
  expect('CMS入力の削除を拒否', run(repo, ['source', source, base]), false, /更新以外/);
}

{
  const { repo, base } = fixture();
  write(repo, 'monster/0001.jpg', 'not a jpeg\n');
  const source = commit(repo, 'CMS publish 2026-08-22 12:00:01');
  expect('拡張子と不一致の画像を拒否', run(repo, ['source', source, base]), false, /拡張子と内容/);
}

{
  const { repo, base } = fixture();
  write(repo, 'src/data/monsters-editorial.json', '{"updated":true}\n');
  const source = commit(repo, 'manual publish');
  expect('GAS規則外のcommit件名を拒否', run(repo, ['source', source, base]), false, /件名が規則外/);
}

{
  const { repo, base } = fixture();
  write(repo, 'src/data/monsters-editorial.json', '{"updated":true}\n');
  const source = commit(repo, 'CMS publish 2026-08-22 12:00:02');
  write(repo, 'advance.txt', 'new main\n');
  const advanced = commit(repo, 'advance main');
  expect('古いmainを親にしたcommitを拒否', run(repo, ['source', source, advanced]), false, /現在のmainではありません/);
}

{
  const { repo, base } = fixture();
  write(repo, 'side.txt', 'side\n');
  const sideTree = git(repo, 'write-tree');
  const side = git(repo, 'commit-tree', sideTree, '-p', base, '-m', 'side');
  write(repo, 'src/data/monsters-editorial.json', '{"updated":true}\n');
  const mainParent = commit(repo, 'main parent');
  const mergeTree = git(repo, 'write-tree');
  const merge = git(repo, 'commit-tree', mergeTree, '-p', mainParent, '-p', side, '-m', 'CMS publish 2026-08-22 12:00:03');
  expect('複数親commitを拒否', run(repo, ['source', merge, mainParent]), false, /親は1件/);
}

{
  const { repo } = fixture();
  write(repo, 'monsters.html', 'generated\n');
  write(repo, 'monsters/0001.html', 'generated detail\n');
  write(repo, 'gacha/20260831-1.html', 'generated gacha detail\n');
  write(repo, 'index.html', 'generated top\n');
  write(repo, 'reroll.html', 'generated reroll\n');
  expect('モンスター更新に伴うガチャ生成差分', run(repo, ['generated']), true, /PASS:/);
  write(repo, 'unexpected.txt', 'blocked\n');
  expect('許可外の生成差分を拒否', run(repo, ['generated']), false, /許可外/);
}

{
  const { repo } = fixture();
  write(repo, 'cards/card-1.html', 'generated card detail\n');
  write(repo, 'gacha/20260831-1.html', 'generated gacha detail\n');
  write(repo, 'index.html', 'generated top\n');
  write(repo, 'reroll.html', 'generated reroll\n');
  expect('アシスト更新に伴うガチャ生成差分', run(repo, ['generated'], ASSIST_SCRIPT), true, /PASS:/);
  write(repo, 'gacha-banner/unexpected.jpg', 'blocked input\n');
  expect('アシスト生成差分の無関係ファイルを拒否', run(repo, ['generated'], ASSIST_SCRIPT), false, /許可外/);
}

console.log(`CMS source gate tests: PASS ${passed}`);
