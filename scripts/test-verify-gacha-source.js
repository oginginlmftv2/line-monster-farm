#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'verify-gacha-source.js');
const fixtureDirs = [];
let passed = 0;

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
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gacha-source-gate-'));
  fixtureDirs.push(repo);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Gacha gate test');
  git(repo, 'config', 'user.email', 'gacha-gate@example.invalid');
  write(repo, 'src/data/gachas.json', '{"schemaVersion":1,"gachas":[]}\n');
  write(repo, 'src/data/gacha-types.json', '{"schemaVersion":1,"types":[]}\n');
  write(repo, 'index.html', 'baseline\n');
  write(repo, 'reroll.html', 'baseline\n');
  write(repo, 'sitemap.xml', 'baseline\n');
  return { repo, base: commit(repo, 'base') };
}

function run(repo, args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, encoding: 'utf8' });
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

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

{
  const { repo, base } = fixture();
  write(repo, 'src/data/gachas.json', '{"schemaVersion":1,"gachas":[{"image":"gacha-banner/20260901-1.jpg"}]}\n');
  write(repo, 'src/data/gacha-types.json', '{"schemaVersion":1,"types":["神殿祭"]}\n');
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:00');
  expect('入力2ファイルの更新のみ', run(repo, ['source', source, base]), true, /PASS:/);
}

{
  const { repo, base } = fixture();
  write(repo, 'src/data/gachas.json', '{"schemaVersion":1,"gachas":[{"image":"gacha-banner/20260901-1.jpg"}]}\n');
  write(repo, 'gacha-banner/20260901-1.jpg', jpeg);
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:01');
  expect('入力とgacha-banner画像の追加', run(repo, ['source', source, base]), true, /PASS:/);
}

{
  const { repo, base } = fixture();
  write(repo, 'src/data/gachas.json', '{"schemaVersion":1,"gachas":[]}\n');
  write(repo, 'gacha-banner/draft-only.jpg', jpeg);
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:09');
  expect('gachas.jsonから参照されていない画像を拒否', run(repo, ['source', source, base]), false, /参照されていない画像.*draft-only\.jpg/);
}

{
  const { repo, base } = fixture();
  write(repo, 'src/data/gachas.json', '{"schemaVersion":1,"gachas":[{"image":"gacha-banner/published.jpg","status":"published"}]}\n');
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:10');
  expect('publishedでないガチャの画像を含めないcommit', run(repo, ['source', source, base]), true, /PASS:/);
}

{
  const { repo, base } = fixture();
  write(repo, 'build.js', 'blocked\n');
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:02');
  expect('許可外ファイルを拒否', run(repo, ['source', source, base]), false, /許可外/);
}

{
  const { repo, base } = fixture();
  write(repo, 'src/data/gachas.json', '{"advanced":true}\n');
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:03');
  write(repo, 'advance.txt', 'new main\n');
  const advanced = commit(repo, 'advance main');
  expect('親が現在のmainでないcommitを拒否', run(repo, ['source', source, advanced]), false, /現在のmainではありません/);
}

{
  const { repo, base } = fixture();
  write(repo, 'side.txt', 'side\n');
  const sideTree = git(repo, 'write-tree');
  const side = git(repo, 'commit-tree', sideTree, '-p', base, '-m', 'side');
  write(repo, 'src/data/gachas.json', '{"main":true}\n');
  const mainParent = commit(repo, 'main parent');
  const mergeTree = git(repo, 'write-tree');
  const merge = git(repo, 'commit-tree', mergeTree, '-p', mainParent, '-p', side, '-m', 'CMS gacha publish 2026-08-31 12:00:04');
  expect('複数親commitを拒否', run(repo, ['source', merge, mainParent]), false, /親は1件/);
}

{
  const { repo, base } = fixture();
  write(repo, 'src/data/gachas.json', '{"updated":true}\n');
  const source = commit(repo, 'manual publish');
  expect('規則外の件名を拒否', run(repo, ['source', source, base]), false, /件名が規則外/);
}

{
  const { repo, base } = fixture();
  git(repo, 'rm', 'src/data/gachas.json');
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:05');
  expect('入力ファイルの削除を拒否', run(repo, ['source', source, base]), false, /更新以外/);
}

{
  const { repo, base } = fixture();
  write(repo, 'gacha/20260901-1.jpg', jpeg);
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:06');
  expect('gacha配下の画像を拒否', run(repo, ['source', source, base]), false, /許可外/);
}

{
  const { repo, base } = fixture();
  write(repo, 'gacha-banner/20260901-1.jpg', Buffer.alloc(2 * 1024 * 1024 + 1, 0xff));
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:07');
  expect('2MB超画像を拒否', run(repo, ['source', source, base]), false, /2MB/);
}

{
  const { repo, base } = fixture();
  write(repo, 'gacha-banner/20260901-1.png', jpeg);
  const source = commit(repo, 'CMS gacha publish 2026-08-31 12:00:08');
  expect('拡張子と中身が違う画像を拒否', run(repo, ['source', source, base]), false, /拡張子と内容/);
}

{
  const { repo } = fixture();
  write(repo, 'index.html', 'generated\n');
  write(repo, 'reroll.html', 'generated\n');
  write(repo, 'gacha/index.html', 'generated\n');
  write(repo, 'cards/card.html', 'generated\n');
  write(repo, 'monsters/0001.html', 'generated\n');
  expect('許可された生成差分', run(repo, ['generated']), true, /PASS:/);
}

{
  const { repo } = fixture();
  write(repo, 'unexpected.txt', 'blocked\n');
  expect('許可外の生成差分を拒否', run(repo, ['generated']), false, /許可外/);
}

console.log(`Gacha source gate tests: PASS ${passed}`);
