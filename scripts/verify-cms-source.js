#!/usr/bin/env node

const { execFileSync } = require('child_process');

const TEXT_SOURCE_FILES = new Set([
  'monsters-data.js',
  'src/data/cms-id-predictions.json',
  'src/data/monsters-editorial.json',
]);
const IMAGE_PATH = /^monster\/[0-9]{4}\.(jpg|png|webp)$/i;
const GENERATED_FILES = new Set([
  'monsters.html',
  'index.html',
  'reroll.html',
  'sitemap.xml',
  'src/data/monster-ids.json',
  'src/data/id-availability.json',
  'src/data/page-baseline.json',
  'src/data/cms-seed.json',
]);

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: options.encoding === null ? null : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function resolveCommit(ref, label) {
  try {
    return git(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  } catch {
    fail(`${label}をcommitとして解決できません: ${ref}`);
    return '';
  }
}

function parseNameStatus(buffer) {
  const fields = buffer.toString('utf8').split('\0');
  if (fields.at(-1) === '') fields.pop();
  const changes = [];
  for (let i = 0; i < fields.length; i += 2) {
    changes.push({ status: fields[i], path: fields[i + 1] || '' });
  }
  return changes;
}

function expectedImage(bytes, extension) {
  if (extension === 'jpg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === 'png') {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature);
  }
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

function verifyImage(sourceSha, path) {
  const extension = path.split('.').pop().toLowerCase();
  let bytes;
  try {
    bytes = git(['show', `${sourceSha}:${path}`], { encoding: null });
  } catch {
    fail(`画像blobを取得できません: ${path}`);
    return;
  }
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) {
    fail(`画像が空、または2MBを超えています: ${path}`);
  } else if (!expectedImage(bytes, extension)) {
    fail(`画像の拡張子と内容が一致しません: ${path}`);
  }
}

function verifyRegularBlob(sourceSha, path) {
  let entry;
  try {
    entry = git(['ls-tree', sourceSha, '--', path]).trim();
  } catch {
    fail(`commit内のファイル情報を取得できません: ${path}`);
    return false;
  }
  if (!/^100644 blob [0-9a-f]+\t/.test(entry)) {
    fail(`通常ファイル以外は許可しません: ${path}`);
    return false;
  }
  return true;
}

function verifySource(sourceRef, baseRef) {
  const sourceSha = resolveCommit(sourceRef, 'source');
  const baseSha = resolveCommit(baseRef, 'base');
  if (!sourceSha || !baseSha) return;

  const commitLine = git(['rev-list', '--parents', '-n', '1', sourceSha]).trim().split(/\s+/);
  const parents = commitLine.slice(1);
  if (parents.length !== 1) {
    fail(`GAS元コミットの親は1件である必要があります（現在${parents.length}件）`);
    return;
  }
  if (parents[0] !== baseSha) {
    fail(`GAS元コミットの親が現在のmainではありません（parent=${parents[0]} / main=${baseSha}）`);
    return;
  }

  const subject = git(['log', '-1', '--format=%s', sourceSha]).trim();
  if (!/^CMS publish \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(subject)) {
    fail(`GAS元コミットの件名が規則外です: ${subject}`);
  }

  const changes = parseNameStatus(git([
    'diff-tree', '--no-commit-id', '--name-status', '-z', '--no-renames', '-r',
    parents[0], sourceSha,
  ], { encoding: null }));

  for (const change of changes) {
    if (TEXT_SOURCE_FILES.has(change.path)) {
      if (change.status !== 'M') {
        fail(`CMS入力は更新以外を許可しません: ${change.status} ${change.path}`);
      } else {
        verifyRegularBlob(sourceSha, change.path);
      }
      continue;
    }
    if (IMAGE_PATH.test(change.path)) {
      if (change.status !== 'A' && change.status !== 'M') {
        fail(`CMS画像は追加・更新以外を許可しません: ${change.status} ${change.path}`);
      } else if (verifyRegularBlob(sourceSha, change.path)) {
        verifyImage(sourceSha, change.path);
      }
      continue;
    }
    fail(`GAS元コミットに許可外の変更があります: ${change.status} ${change.path}`);
  }

  if (!process.exitCode) {
    console.log(`PASS: GAS元コミット ${sourceSha.slice(0, 7)}（${changes.length}ファイル）`);
  }
}

function generatedPaths() {
  const tracked = git(['diff', 'HEAD', '--name-only', '-z'], { encoding: null })
    .toString('utf8').split('\0').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], { encoding: null })
    .toString('utf8').split('\0').filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

function verifyGenerated() {
  const paths = generatedPaths();
  const unexpected = paths.filter(path => !path.startsWith('monsters/')
    && !path.startsWith('gacha/')
    && !GENERATED_FILES.has(path));
  for (const path of unexpected) fail(`build後に許可外の変更があります: ${path}`);
  if (!process.exitCode) console.log(`PASS: build後の生成差分（${paths.length}ファイル）`);
}

const [mode, first, second] = process.argv.slice(2);
if (mode === 'source' && first && second) {
  verifySource(first, second);
} else if (mode === 'generated' && !first && !second) {
  verifyGenerated();
} else {
  console.error('使い方:');
  console.error('  node scripts/verify-cms-source.js source <source-ref> <base-ref>');
  console.error('  node scripts/verify-cms-source.js generated');
  process.exitCode = 2;
}
