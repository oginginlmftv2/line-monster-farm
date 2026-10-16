#!/usr/bin/env node
'use strict';

/**
 * src/data/sitemap-lastmod.json の初期値を git の履歴から作る（P-005。初回だけ手で実行する）。
 *
 * sitemap.xml の各URLについて、main の一次親の履歴（--first-parent＝公開された順）をさかのぼり、
 * 可視テキストのハッシュが今と同じになった最初の公開の日（JST）を lastmod にする。
 * 以後は build.js がハッシュの変化だけで日付を進めるので、この script は二度と要らない。
 * CI の浅い clone では正しく動かない。手元の完全な clone で実行する。
 *
 *   node scripts/seed-sitemap-lastmod.js          # JSON が無いときだけ作る
 *   node scripts/seed-sitemap-lastmod.js --force  # 作り直す
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const lastmod = require('../src/lib/sitemap-lastmod');

const REPO = path.resolve(__dirname, '..');
const SITE_URL = 'https://line-monster-farm-tetteikouryaku.com';
const output = path.join(REPO, lastmod.LASTMOD_FILE);

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// "<sha>:<path>" の一覧の中身をまとめて読む（見つからないものは null）
function readBlobs(specs) {
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: REPO, input: specs.join('\n') + '\n', maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git cat-file 失敗: ${result.stderr}`);
  const buffer = result.stdout;
  const blobs = [];
  let offset = 0;
  for (let i = 0; i < specs.length; i++) {
    const lineEnd = buffer.indexOf(10, offset);
    const header = buffer.slice(offset, lineEnd).toString('utf8');
    offset = lineEnd + 1;
    if (/ missing$/.test(header)) { blobs.push(null); continue; }
    const size = Number(header.split(' ')[2]);
    blobs.push(buffer.slice(offset, offset + size).toString('utf8'));
    offset += size + 1;
  }
  return blobs;
}

if (fs.existsSync(output) && !process.argv.includes('--force')) {
  console.log(`${lastmod.LASTMOD_FILE} は既にあります（作り直すときは --force）`);
  process.exit(0);
}
if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
  console.error('浅い clone では履歴をさかのぼれません。完全な clone で実行してください');
  process.exit(1);
}

const sitemap = fs.readFileSync(path.join(REPO, 'sitemap.xml'), 'utf8');
const entries = {};
for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const key = lastmod.locToKey(loc, SITE_URL);
  const file = lastmod.keyToFile(key);
  const hash = lastmod.contentHash(fs.readFileSync(path.join(REPO, file), 'utf8'));
  const commits = git(['log', '--first-parent', '--format=%H %ct', 'HEAD', '--', file])
    .trim().split('\n').filter(Boolean).map(line => {
      const [sha, time] = line.split(' ');
      return { sha, time: Number(time) * 1000 };
    });
  const blobs = readBlobs(commits.map(commit => `${commit.sha}:${file}`));
  // 新しい順に、今と同じハッシュが続くあいだをさかのぼる。最後に同じだった公開が「今の中身になった日」
  let since = null;
  for (let i = 0; i < commits.length; i++) {
    if (blobs[i] === null || lastmod.contentHash(blobs[i]) !== hash) break;
    since = commits[i];
  }
  if (!since) throw new Error(`${file}: 今の中身が履歴に見つかりません（未コミットの変更がある？）`);
  entries[key] = { lastmod: lastmod.jstDate(since.time), hash };
}

fs.writeFileSync(output, lastmod.renderLastmodJson(entries));
const byDate = {};
for (const entry of Object.values(entries)) byDate[entry.lastmod] = (byDate[entry.lastmod] || 0) + 1;
console.log(`${lastmod.LASTMOD_FILE} を作成: ${Object.keys(entries).length}URL`);
for (const [date, count] of Object.entries(byDate).sort()) console.log(`  ${date}  ${count}`);
