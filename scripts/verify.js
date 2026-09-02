#!/usr/bin/env node
/**
 * ルール検証スクリプト（Claude Code / Codex 共通）
 *
 *   node scripts/verify.js          検証
 *   node scripts/verify.js --lock   現在の状態をロックファイルに記録（初回のみ）
 *
 * AGENTS.md に書かれたルールのうち、機械的に判定できるものを実装している。
 * 文章のルールは読み飛ばされることがあるが、これは落ちる。
 * 新しいルールを作るときは、まずここに実装できないかを検討すること。
 *
 * 検査が成立しない項目（対象がまだ存在しない等）は SKIP になる。
 * SKIP は失敗ではない。段階的に増えていくことを前提にしている。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { PICKUP_SLOTS, validateGachaData } = require('../build');

const REPO = process.cwd();
const LOCK = path.join(REPO, 'src', 'data', 'repo-guard.lock.json');

let fail = 0, warn = 0, pass = 0, skip = 0;
const ok = m => { pass++; console.log(`  PASS  ${m}`); };
const ng = m => { fail++; console.log(`  FAIL  ${m}`); };
const wn = m => { warn++; console.log(`  WARN  ${m}`); };
const sk = m => { skip++; console.log(`  SKIP  ${m}`); };
const head = t => console.log(`\n■ ${t}`);

const exists = p => fs.existsSync(path.join(REPO, p));
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

function gachaBuildPostprocessIssues(buildSource) {
  const issues = [];
  if (buildSource.includes('integrateCardGachaAppearances')) issues.push('build.jsにカード詳細の後処理差し込みが残っている');
  if (/readFileSync\s*\([^;\n]*cards\/[A-Za-z0-9_$'"`{}.+/ -]*\.html/.test(buildSource)) issues.push('build.jsが生成済みcards/*.htmlを読み直している');
  return issues;
}

// 本文量（可視テキストと画像のalt。script/style/タグを除外）
function contentChars(html) {
  const b = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '');
  const imageAltText = [...b.matchAll(/<img\b[^>]*\balt=(["'])(.*?)\1/gi)]
    .map(match => match[2])
    .join(' ');
  const visibleText = b.replace(/<[^>]+>/g, ' ');
  return `${visibleText} ${imageAltText}`.replace(/\s+/g, ' ').trim().length;
}

// ---------------------------------------------------------------- 保護対象
const PROTECTED_HTML = [
  'index.html', 'beginner.html', 'newbie.html', 'tips.html', 'reroll.html',
  'privacy.html', 'profile.html', 'contact.html', 'diary.html',
  'monsters.html', 'assist.html', 'motonoyatu.html',
  'ikusei/road-hiden.html', 'ikusei/beginner.html', 'ikusei/hiden.html',
  'ikusei/sogo.html', 'ikusei/sogo-ikusei.html', 'ikusei/solomon.html',
  'ikusei/grand-slam.html', 'ikusei/grand-slam-chorenzen.html',
  'ikusei/lord-of-masters.html', 'ikusei/hiden-kouka.html',
].filter(p => p !== 'ikusei/beginner.html');   // 存在しないものは除外

// Search Console の所有権確認ファイル。削除すると計測権限を失う
const SEARCH_CONSOLE_FILE = 'google59378bd79752d094.html';

const DORMANT = [
  'assist-card-data.js', 'lMfDB_abilities.json', 'lmfdb_abilities_data.json',
  'lMfdb-index-20-23.html',
  'ability-db.html', 'ability-search.html', 'ability-ranking.html',
  'assist-card-search.html', 'assist-ranking.html', 'bbs.html', 'friend.html',
  'game-2048.html', 'game-runner.html', 'monster-quiz.html',
  'monsuta-shindan.html', 'npc-regen.html', 'abilitypoint/index.html',
];

// ---------------------------------------------------------------- ロック
function orderFingerprint(limit) {
  const src = read('monsters-data.js');
  const names = [...src.matchAll(/\{\s*name:\s*'([^']+)'/g)].map(m => m[1]);
  const selected = Number.isInteger(limit) ? names.slice(0, limit) : names;
  return {
    count: selected.length,
    hash: crypto.createHash('sha256').update(selected.join('\0')).digest('hex').slice(0, 16),
  };
}

if (process.argv.includes('--lock')) {
  const fp = orderFingerprint();
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({
    note: 'monsters-data.js の配列順を固定するためのロック。意図して並べ替えた場合のみ --lock で更新すること。',
    monstersOrder: fp,
    lockedAt: new Date().toISOString().slice(0, 10),
  }, null, 1));
  console.log(`ロックしました: ${LOCK}`);
  console.log(`  ${fp.count}体 / hash=${fp.hash}`);
  process.exit(0);
}

console.log('ルール検証  (AGENTS.md)');

// ---------------------------------------------------------------- 1
head('1. 公開URLの不変性');
{
  const missing = PROTECTED_HTML.filter(p => !exists(p));
  if (missing.length) ng(`保護対象のHTMLが見つからない（移動・削除された可能性）: ${missing.join(', ')}`);
  else ok(`保護対象 ${PROTECTED_HTML.length} ファイルがすべて存在`);

  if (!exists(SEARCH_CONSOLE_FILE)) {
    ng(`Search Console の所有権確認ファイルが無い: ${SEARCH_CONSOLE_FILE}`
      + '  ★削除するとSearch Consoleの権限を失います。ルート直下に戻してください');
  } else ok(`Search Console 所有権確認ファイル ${SEARCH_CONSOLE_FILE}`);
}

// ---------------------------------------------------------------- 2
head('2. 休止中ファイルの保全');
{
  const gone = DORMANT.filter(p => !exists(p));
  if (gone.length) ng(`休止中ファイルが削除されている: ${gone.join(', ')}`);
  else ok(`休止中ファイル ${DORMANT.length} 件がすべて存在`);
}

// ---------------------------------------------------------------- 3
head('3. monsters-data.js の配列順');
if (!exists('monsters-data.js')) sk('monsters-data.js がない');
else if (!exists(path.relative(REPO, LOCK))) sk('ロック未作成（node scripts/verify.js --lock で作成）');
else {
  const locked = JSON.parse(read(path.relative(REPO, LOCK))).monstersOrder;
  const now = orderFingerprint();
  if (locked.hash !== now.hash) {
    const lockedPrefix = orderFingerprint(locked.count);
    if (now.count > locked.count && lockedPrefix.hash === locked.hash) {
      wn(`配列順を維持した末尾追加を確認（${locked.count}体 → ${now.count}体）。`
        + ' 意図した追加なら --lock で更新すること');
    } else {
      ng(`配列順が変更されている（${locked.count}体 → ${now.count}体 / hash不一致）`
        + '  ★Firestoreの解説データが別モンスターに紐づく危険があります');
    }
  } else ok(`配列順に変更なし（${now.count}体）`);
}

// ---------------------------------------------------------------- 4
head('4. モンスターIDの整合');
if (!exists('src/data/monster-ids.json')) sk('monster-ids.json 未生成');
else {
  const j = JSON.parse(read('src/data/monster-ids.json'));
  const ids = j.monsters.map(m => m.id);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) ng(`ID重複: ${[...new Set(dup)].join(', ')}`);
  else ok(`ID重複なし（${ids.length}件）`);

  const badFmt = j.monsters.filter(m => !/^\d{4}$/.test(m.id));
  if (badFmt.length) ng(`ID書式が4桁でない: ${badFmt.slice(0, 5).map(m => m.id + '/' + m.name).join(', ')}`);
  else ok('ID書式（4桁）が正しい');

  // 確定IDが振り直されていないか
  if (exists('src/data/sheet-sortorder.json')) {
    const sheet = JSON.parse(read('src/data/sheet-sortorder.json')).monsters;
    const cur = new Map(j.monsters.map(m => [m.name, m.sortOrder]));
    const changed = sheet.filter(s => cur.has(s.name) && cur.get(s.name) !== s.sortOrder);
    if (changed.length) ng(`確定IDが振り直されている: ${changed.slice(0, 5).map(s => s.name).join(', ')}`);
    else ok(`確定ID ${sheet.length} 件が維持されている`);
  } else sk('sheet-sortorder.json がない');
}

// ---------------------------------------------------------------- 5
head('5. robots.txt と sitemap.xml の整合');
if (!exists('robots.txt') || !exists('sitemap.xml')) sk('robots.txt または sitemap.xml がない');
else {
  const dis = read('robots.txt').split('\n')
    .filter(l => l.startsWith('Disallow:'))
    .map(l => l.replace('Disallow:', '').trim().replace(/^\//, ''));
  const locs = [...read('sitemap.xml').matchAll(/<loc>https?:\/\/[^/]+\/(.*?)<\/loc>/g)].map(m => m[1]);
  const conflict = locs.filter(u => dis.includes(u));
  if (conflict.length) ng(`sitemapに載っているがrobotsでブロック: ${conflict.join(', ')}`);
  else ok(`矛盾なし（sitemap ${locs.length}URL / Disallow ${dis.length}件）`);

  const disallowNoindex = dis.filter(file => {
    if (!file || file.endsWith('/') || !exists(file)) return false;
    return [...read(file).matchAll(/<meta\b[^>]*>/gi)].some(match =>
      /\bname\s*=\s*["']robots["']/i.test(match[0])
      && /\bcontent\s*=\s*["'][^"']*\bnoindex\b[^"']*["']/i.test(match[0]));
  });
  if (disallowNoindex.length) {
    ng(`Disallow されているが noindex を持つ ${disallowNoindex.length}件: ${disallowNoindex.join(', ')}`);
  } else ok(`Disallow と noindex の矛盾なし（Disallow ${dis.length}件）`);

  // 旧URL（monster.html?id=）は恒久削除の対象。sitemap-legacy.xml 専用で、
  // 本体のsitemap.xmlへ混ぜるとnoindexページを再度インデックス候補にしてしまう。
  const legacyInSitemap = locs.filter(u => /monster\.html\?id=/.test(u));
  if (legacyInSitemap.length) {
    ng(`sitemap.xml に旧URLが混入している ${legacyInSitemap.length}件: ${legacyInSitemap.slice(0, 5).join(', ')}`);
  } else ok('sitemap.xml に旧URL（monster.html?id=）の混入なし');

  const missingFile = locs.filter(u => u && !exists(u));
  if (missingFile.length) ng(`sitemapのURLに対応するファイルがない: ${missingFile.join(', ')}`);
  else ok('sitemapの全URLにファイルが存在');
}

// ---------------------------------------------------------------- 6
head('6. 生成ページの品質');
{
  const genDirs = ['monsters'];
  const gen = [];
  for (const d of genDirs) {
    const abs = path.join(REPO, d);
    if (!fs.existsSync(abs)) continue;
    const walk = p => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const fp = path.join(p, e.name);
        if (e.isDirectory()) walk(fp);
        else if (e.name.endsWith('.html') && e.name !== 'monster.html') gen.push(fp);
      }
    };
    walk(abs);
  }
  if (!gen.length) sk('生成ページがまだない');
  else {
    const sitemapPaths = exists('sitemap.xml')
      ? new Set([...read('sitemap.xml').matchAll(/<loc>https?:\/\/[^/]+\/(.*?)<\/loc>/g)]
        .map(match => match[1].endsWith('/') ? match[1] + 'index.html' : match[1]))
      : null;
    const indexableGen = sitemapPaths
      ? gen.filter(f => sitemapPaths.has(path.relative(REPO, f).replace(/\\/g, '/')))
      : gen;
    const thin = indexableGen.filter(f => contentChars(fs.readFileSync(f, 'utf8')) < 800);
    if (thin.length) ng(`本文量800字未満のページ ${thin.length}件: `
      + thin.slice(0, 5).map(f => path.relative(REPO, f)).join(', '));
    else ok(`インデックス対象の生成ページ ${indexableGen.length}件すべて本文量800字以上`);

    const noCanon = gen.filter(f => !/rel=["']canonical["']/.test(fs.readFileSync(f, 'utf8')));
    if (noCanon.length) ng(`canonical欠落 ${noCanon.length}件`);
    else ok('全生成ページに canonical あり');

    const noDesc = gen.filter(f => !/name=["']description["']/.test(fs.readFileSync(f, 'utf8')));
    if (noDesc.length) ng(`meta description欠落 ${noDesc.length}件`);
    else ok('全生成ページに description あり');
  }
}

// ---------------------------------------------------------------- 7
head('7. ブランチ名');
{
  let branch = '';
  try {
    branch = require('child_process')
      .execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch { /* gitが無い環境 */ }

  // Actionsのcheckoutはdetached HEADになるため、実ブランチ名を環境変数から取る。
  // pull_requestではGITHUB_REF_NAMEが「<PR番号>/merge」になるので、元ブランチのHEAD_REFを優先する。
  if (branch === 'HEAD') branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || branch;

  const RESERVED = ['main', 'master', 'gh-pages', 'HEAD'];
  // cms/* はCMS公開Workflowが機械的に作る運用ブランチで、人の命名規則の対象外。
  const MACHINE = /^cms\//;
  const PATTERN = /^(feat|fix|chore|content|refactor)\/((?:p\d+(?:-\d+)?|g\d+))-[a-z0-9-]+$/;

  if (!branch) sk('ブランチを取得できない');
  else if (branch === 'HEAD') sk('detached HEAD のためブランチ名を判定しない');
  else if (MACHINE.test(branch)) ok(`CMS公開ブランチ ${branch}`);
  else if (RESERVED.includes(branch)) {
    wn(`${branch} で作業している。作業ブランチを切ること（docs/branch-naming.md）`);
  } else if (!PATTERN.test(branch)) {
    wn(`ブランチ名が規則に合わない: ${branch}`
      + '  期待: <type>/<タスクID>-<slug>  例 feat/p6-1-monster-detail-pages');
  } else ok(`ブランチ名 ${branch}`);
}

// ---------------------------------------------------------------- 8
head('8. 秘密情報');
{
  const cmsRelativeDir = '_cms';
  const cmsDir = path.join(REPO, cmsRelativeDir);
  const gasRelativeDir = '_cms/gas';
  const gasDir = path.join(REPO, gasRelativeDir);
  const gasManifestRelative = `${gasRelativeDir}/manifest.json`;
  const jekyllConfigs = ['_config.yml', '_config.yaml'].filter(exists);
  const githubTokenPatterns = [
    { name: 'classic PAT', regex: /\bghp_[A-Za-z0-9]{20,}\b/ },
    { name: 'fine-grained PAT', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
    { name: 'OAuth token', regex: /\bgho_[A-Za-z0-9]{20,}\b/ },
    { name: 'user token', regex: /\bghu_[A-Za-z0-9]{20,}\b/ },
    { name: 'installation token', regex: /\bghs_[A-Za-z0-9]{20,}\b/ },
    { name: 'refresh token', regex: /\bghr_[A-Za-z0-9]{20,}\b/ },
  ];
  const tokenHits = [];

  const scanGitHubTokens = p => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const fp = path.join(p, e.name);
      if (e.isDirectory()) {
        scanGitHubTokens(fp);
        continue;
      }
      if (!e.isFile()) continue;

      const lines = fs.readFileSync(fp, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const pattern of githubTokenPatterns) {
          if (pattern.regex.test(line)) {
            tokenHits.push({
              file: path.relative(REPO, fp).replace(/\\/g, '/'),
              line: index + 1,
            });
          }
        }
      });
    }
  };

  if (!fs.existsSync(gasDir)) {
    ng(`GitHubトークン検査対象の ${gasRelativeDir} がない`);
  } else {
    try {
      if (!exists(gasManifestRelative)) throw new Error(`${gasManifestRelative} がない`);
      const manifest = JSON.parse(read(gasManifestRelative));
      if (!Array.isArray(manifest.files) || !manifest.files.length) {
        throw new Error('manifest.json の files が空、または配列ではない');
      }
      const invalidNames = manifest.files.filter(file => typeof file !== 'string'
        || !/^[A-Za-z0-9_.-]+$/.test(file) || file === 'manifest.json');
      const duplicateNames = manifest.files.filter((file, index) => manifest.files.indexOf(file) !== index);
      const missingFiles = manifest.files.filter(file => !fs.existsSync(path.join(gasDir, file)));
      const actualFiles = fs.readdirSync(gasDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name !== 'manifest.json')
        .map(entry => entry.name)
        .sort();
      const unexpectedFiles = actualFiles.filter(file => !manifest.files.includes(file));
      const unexpectedDirectories = fs.readdirSync(gasDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory()).map(entry => entry.name);
      if (invalidNames.length || duplicateNames.length || missingFiles.length
          || unexpectedFiles.length || unexpectedDirectories.length) {
        throw new Error(`不正名 ${invalidNames.join(', ') || '0'} / 重複 ${duplicateNames.join(', ') || '0'} / `
          + `欠落 ${missingFiles.join(', ') || '0'} / 余剰 ${unexpectedFiles.concat(unexpectedDirectories).join(', ') || '0'}`);
      }
      ok(`GAS manifestと実ファイルが完全一致（${manifest.files.length}ファイル）`);
    } catch (error) {
      ng(`GAS manifest検査FAIL: ${error.message}`);
    }

    const gasFiles = fs.readdirSync(gasDir).filter(file => file.endsWith('.gs')).sort();
    const gasSources = gasFiles.map(file => ({
      file,
      source: fs.readFileSync(path.join(gasDir, file), 'utf8'),
    }));
    const htmlFiles = fs.readdirSync(gasDir)
      .filter(file => file === 'index.html' || /^ui_.*\.html$/.test(file)).sort();
    const htmlSources = htmlFiles.map(file => ({
      file,
      source: fs.readFileSync(path.join(gasDir, file), 'utf8'),
    }));
    // H-3 検査1: Apps Scriptの単一グローバルスコープで関数名が衝突しない。
    const functions = gasSources.flatMap(item => [...item.source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)]
      .map(match => ({ name: match[1], file: item.file })));
    const duplicateFunctions = functions.filter((item, index) => functions
      .findIndex(other => other.name === item.name) !== index);
    if (duplicateFunctions.length) {
      ng(`統合GASで関数名が重複: ${duplicateFunctions.map(item => `${item.name}(${item.file})`).join(', ')}`);
    } else ok(`統合GASの関数名は一意（${functions.length}件）`);

    // H-3 検査2: 行頭varだけをトップレベル宣言として扱う。
    const globalVars = gasSources.flatMap(item => [...item.source.matchAll(/^var\s+([A-Za-z_$][\w$]*)\s*=/gm)]
      .map(match => ({ name: match[1], file: item.file })));
    const duplicateVars = globalVars.filter((item, index) => globalVars
      .findIndex(other => other.name === item.name) !== index);
    if (duplicateVars.length) {
      ng(`統合GASでトップレベルvarが重複: ${duplicateVars.map(item => `${item.name}(${item.file})`).join(', ')}`);
    } else ok(`統合GASのトップレベルvarは一意（${globalVars.length}件）`);

    // H-3 検査3: 動的に組み立てるidは除き、ソース上で確定するidを横断照合する。
    const elementIds = htmlSources.flatMap(item => [...item.source
      .matchAll(/\bid=(?:"([A-Za-z][A-Za-z0-9_:-]*)"|'([A-Za-z][A-Za-z0-9_:-]*)')/g)]
      .map(match => ({ id: match[1] || match[2], file: item.file })));
    const duplicateIds = elementIds.filter((item, index) => elementIds
      .findIndex(other => other.id === item.id) !== index);
    if (duplicateIds.length) {
      ng(`統合UIで要素idが重複: ${duplicateIds.map(item => `${item.id}(${item.file})`).join(', ')}`);
    } else ok(`統合UIの要素idは一意（${elementIds.length}件）`);

    // H-3 検査4: ui_*.htmlの共通callから呼ぶ公開APIがGAS側に存在する。
    const apiFunctions = new Set(functions.filter(item => item.name.startsWith('api_')).map(item => item.name));
    const apiCalls = htmlSources.filter(item => item.file.startsWith('ui_')).flatMap(item => [...item.source
      .matchAll(/\bcall\(\s*['"](api_[A-Za-z_$][\w$]*)['"]/g)]
      .map(match => ({ name: match[1], file: item.file })));
    const undefinedApis = apiCalls.filter(call => !apiFunctions.has(call.name));
    if (undefinedApis.length) {
      ng(`統合UIに未定義API呼び出し: ${undefinedApis.map(call => `${call.name}(${call.file})`).join(', ')}`);
    } else ok(`統合UIのAPI呼び出しは全て定義済み（${new Set(apiCalls.map(call => call.name)).size}件）`);

    const functionSource = name => {
      const item = gasSources.find(candidate => new RegExp(`^function\\s+${name}\\s*\\(`, 'm').test(candidate.source));
      if (!item) return '';
      const start = item.source.search(new RegExp(`^function\\s+${name}\\s*\\(`, 'm'));
      const bodyStart = item.source.indexOf('{', start);
      if (bodyStart < 0) return '';
      let depth = 0;
      for (let index = bodyStart; index < item.source.length; index++) {
        if (item.source[index] === '{') depth++;
        if (item.source[index] === '}') depth--;
        if (depth === 0) return item.source.slice(start, index + 1);
      }
      return '';
    };

    const allowlistFromVerifier = relative => {
      if (!exists(relative)) throw new Error(`${relative} がない`);
      const source = read(relative);
      const textBlock = source.match(/const TEXT_SOURCE_FILES = new Set\(\[([\s\S]*?)\]\);/);
      const imageLiteral = source.match(/^const IMAGE_PATH = (\/(?:\\.|[^/])+\/[a-z]*);$/m);
      if (!textBlock || !imageLiteral) throw new Error(`${relative} の許可リストを解析できない`);
      const fixed = new Set([...textBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]));
      const parsedLiteral = imageLiteral[1].match(/^\/(.*)\/([a-z]*)$/);
      if (!parsedLiteral) throw new Error(`${relative} の画像許可リストを解析できない`);
      return { fixed, image: new RegExp(parsedLiteral[1], parsedLiteral[2]) };
    };

    const publishPathsFromGas = name => {
      const source = functionSource(name);
      if (!source) throw new Error(`${name} がない`);
      const fixed = new Set([...source.matchAll(/\bpath:\s*'([^']+)'\s*,/g)].map(match => match[1]));
      const dynamicPaths = [...source.matchAll(/\bpath:\s*'([^']+)'\s*\+\s*filename/g)];
      // アシスト画像はP12-20以降、検査済みDrive inventoryを公開関数へ渡す。
      // 画像名の許可正規表現がhelperへ分離されても、実際に呼ばれる検査から送信範囲を導出する。
      const imageValidationSource = /driveImages\.byName/.test(source)
        ? `${source}\n${functionSource('asstDriveImageInventory_')}\n${functionSource('asstValidateDriveImageFile_')}`
        : source;
      const filenamePattern = imageValidationSource.match(/if\s*\(\s*!\/((?:\\.|[^/])+)\/([a-z]*)\.test\(filename\)\)/);
      if (dynamicPaths.length !== 1 || !filenamePattern) {
        throw new Error(`${name} の画像送信パスを解析できない`);
      }
      const prefix = dynamicPaths[0][1];
      const inner = filenamePattern[1].replace(/^\^/, '').replace(/\$$/, '');
      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { fixed, image: new RegExp(`^${escapedPrefix}${inner}$`, filenamePattern[2]) };
    };

    const pathSetLabel = value => [...value.fixed].sort().concat(`画像 ${value.image}`).join(', ');
    const samePathSet = (actual, allowed) => actual.fixed.size === allowed.fixed.size
      && [...actual.fixed].every(item => allowed.fixed.has(item))
      && actual.image.source === allowed.image.source
      && actual.image.flags === allowed.image.flags;

    // H-3 検査5: bookの環境マーカーと破壊的setupの一回限り鍵。
    const coreSource = gasSources.find(item => item.file === '00_core.gs')?.source || '';
    const setupSource = gasSources.find(item => item.file === '40_setup.gs')?.source || '';
    const bookSource = functionSource('book_');
    const destructiveSetups = [
      'setup3_importMonsterSeed', 'setup3_resetMonsters', 'setup3_importAssistFromMain',
    ];
    const environmentGuarded = /getSheetByName\(SHEET_MEMBERS\)[\s\S]{0,300}getRange\('A1'\)\.getNote\(\)/.test(bookSource)
      && /marker\s*!==\s*expected/.test(bookSource)
      && /ENVIRONMENT は production または rehearsal/.test(coreSource);
    const grantHelper = /function consumeDestructiveGrant_\(/.test(setupSource)
      && /ALLOW_DESTRUCTIVE_SETUP/.test(setupSource)
      && /deleteProperty\('ALLOW_DESTRUCTIVE_SETUP'\)/.test(setupSource);
    const unguardedSetups = destructiveSetups.filter(name => !/consumeDestructiveGrant_\(/.test(functionSource(name)));
    if (!environmentGuarded || !grantHelper || unguardedSetups.length) {
      ng(`統合GASの環境防御が不足（book ${environmentGuarded ? 'OK' : 'NG'} / 鍵 ${grantHelper ? 'OK' : 'NG'} / 鍵なしsetup ${unguardedSetups.join(', ') || '0'}）`);
    } else ok('統合GASはmembers A1環境マーカーと破壊的setupの一回限り鍵を持つ');

    // H-3 検査8: GitHub送信は30_publish.gsだけに置く。
    // P12-17の外部監査は、lMfDB mainを完全SHAへ解決する下記GET URLだけを20_assist.gsで使える。
    const lmfdbMainReadUrl = 'https://api.github.com/repos/futsalife24-bot/lMfDB/git/ref/heads/main';
    const githubOutsidePublish = gasSources.filter(item => item.file !== '30_publish.gs'
      && /api\.github\.com|git\/refs/.test(item.source.replaceAll(lmfdbMainReadUrl, '')));
    const publishSource = gasSources.find(item => item.file === '30_publish.gs')?.source || '';
    const assistAuditSource = gasSources.find(item => item.file === '20_assist.gs')?.source || '';
    const assistHasSingleLmfdbRead = (assistAuditSource.match(new RegExp(lmfdbMainReadUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 1;
    if (githubOutsidePublish.length || !assistHasSingleLmfdbRead || !/api\.github\.com/.test(publishSource) || !/git\/refs/.test(publishSource)) {
      ng(`GitHub送信が30_publish.gsへ局在していない: ${githubOutsidePublish.map(item => item.file).join(', ') || '送信実装不足'}`);
    } else ok('GitHub送信は30_publish.gsだけに局在し、lMfDB main解決GETだけを20_assist.gsに許可');

    // H-3 検査6: GASが送る全pathと、trusted main版ゲートの許可リストを完全一致させる。
    let monAllowlist;
    let asstAllowlist;
    try {
      const monPublishPaths = publishPathsFromGas('api_monPublish');
      const asstPublishPaths = publishPathsFromGas('api_asstPublish');
      monAllowlist = allowlistFromVerifier('scripts/verify-cms-source.js');
      asstAllowlist = allowlistFromVerifier('scripts/verify-assist-source.js');
      const monMatches = samePathSet(monPublishPaths, monAllowlist);
      const asstMatches = samePathSet(asstPublishPaths, asstAllowlist);
      if (!monMatches || !asstMatches) {
        ng(`公開送信範囲と許可リストが不一致（monster ${monMatches ? 'OK' : `GAS [${pathSetLabel(monPublishPaths)}] / gate [${pathSetLabel(monAllowlist)}]`} / assist ${asstMatches ? 'OK' : `GAS [${pathSetLabel(asstPublishPaths)}] / gate [${pathSetLabel(asstAllowlist)}]`}）`);
      } else {
        ok(`公開送信範囲と許可リストが完全一致（monster: ${pathSetLabel(monPublishPaths)} / assist: ${pathSetLabel(asstPublishPaths)}）`);
      }
    } catch (error) {
      ng(`公開送信範囲と許可リストの検査FAIL: ${error.message}`);
    }

    // H-3 検査7: 固定path同士、固定pathと画像規則、画像規則同士を分離する。
    try {
      monAllowlist ||= allowlistFromVerifier('scripts/verify-cms-source.js');
      asstAllowlist ||= allowlistFromVerifier('scripts/verify-assist-source.js');
      const overlaps = [...monAllowlist.fixed].filter(item => asstAllowlist.fixed.has(item)
        || asstAllowlist.image.test(item));
      overlaps.push(...[...asstAllowlist.fixed].filter(item => monAllowlist.image.test(item)));
      const monImagePrefix = monAllowlist.image.source.match(/^\^([^\\[]+)/)?.[1] || '';
      const asstImagePrefix = asstAllowlist.image.source.match(/^\^([^\\[]+)/)?.[1] || '';
      if (monImagePrefix && monImagePrefix === asstImagePrefix) overlaps.push(`画像 ${monAllowlist.image}`);
      if (overlaps.length) {
        ng(`モンスターとアシストの許可リストが重複: ${[...new Set(overlaps)].join(', ')}`);
      } else {
        ok('モンスターとアシストの許可リストは互いに素');
      }
    } catch (error) {
      ng(`許可リスト分離の検査FAIL: ${error.message}`);
    }

    // H-3 検査9: sitemap.xmlを生成する2経路は同じgroupで直列実行する。
    try {
      const concurrency = relative => {
        if (!exists(relative)) throw new Error(`${relative} がない`);
        const block = read(relative).match(/^concurrency:\s*\n((?:^[ \t]+.*\n?)*)/m)?.[1] || '';
        const group = block.match(/^\s+group:\s*([^\s#]+)\s*$/m)?.[1] || '';
        const cancel = block.match(/^\s+cancel-in-progress:\s*(true|false)\s*$/m)?.[1] || '';
        if (!group || !cancel) throw new Error(`${relative} のconcurrency設定を解析できない`);
        return { group, cancel };
      };
      const monsterWorkflow = concurrency('.github/workflows/cms-publish.yml');
      const assistWorkflow = concurrency('.github/workflows/cms-assist-publish.yml');
      if (monsterWorkflow.group !== assistWorkflow.group
          || monsterWorkflow.cancel === 'true' || assistWorkflow.cancel === 'true') {
        ng(`CMS Workflowのconcurrencyが不正（monster group=${monsterWorkflow.group} cancel=${monsterWorkflow.cancel} / assist group=${assistWorkflow.group} cancel=${assistWorkflow.cancel}）`);
      } else {
        ok(`CMS Workflowはconcurrency group=${monsterWorkflow.group} / cancel-in-progress=falseで直列化`);
      }
    } catch (error) {
      ng(`CMS Workflowのconcurrency検査FAIL: ${error.message}`);
    }

    // H-3 検査10: データ行を消す処理は40_setup.gsだけに置く。
    const destructiveOutsideSetup = gasSources.filter(item => item.file !== '40_setup.gs'
      && /setRows_|deleteRows\s*\(|clearContent\s*\(/i.test(item.source));
    if (destructiveOutsideSetup.length) {
      ng(`破壊的setup処理が40_setup.gs以外にある: ${destructiveOutsideSetup.map(item => item.file).join(', ')}`);
    } else ok('setRows_ / deleteRows / clearContentは40_setup.gsだけに局在');

    // 段階7の本番deployment切替後、統合CMSのexportは ['ライ徹CMS'] を出す。
    // 移行は完了したので単値。3ファイルの混在は常にFAIL。
    const allowedGeneratedFrom = [
      ['ライ徹CMS'],
    ];
    const generatedFromFiles = [
      'src/data/assist-cards.json',
      'src/data/assist-effects.json',
      'src/data/assist-abilities.json',
    ];
    const generatedFromStates = generatedFromFiles.map(file => {
      try {
        const value = JSON.parse(read(file)).generatedFrom;
        return { file, serialized: JSON.stringify(value), display: JSON.stringify(value) ?? '<missing>' };
      } catch {
        return { file, serialized: null, display: '<read/parse error>' };
      }
    });
    const allowedGeneratedFromValues = allowedGeneratedFrom.map(value => JSON.stringify(value));
    const allGeneratedFromAllowed = generatedFromStates.every(state =>
      allowedGeneratedFromValues.includes(state.serialized));
    const allGeneratedFromMatch = new Set(generatedFromStates.map(state => state.serialized)).size === 1;
    const assistSource = gasSources.find(item => item.file === '20_assist.gs')?.source || '';
    const unifiedGeneratedFromCount = (assistSource.match(/generatedFrom:\s*\['ライ徹CMS'\]/g) || []).length;
    if (!allGeneratedFromAllowed || !allGeneratedFromMatch || unifiedGeneratedFromCount !== 3) {
      const generatedFromDetails = generatedFromStates
        .map(state => `${state.file}=${state.display}`).join(' / ');
      ng(`generatedFromが想定外（3DB ${generatedFromDetails} / 統合source ${unifiedGeneratedFromCount}/3）`);
    } else ok('3DBと統合exportのgeneratedFromは想定値');

    // H-3 検査12: cardStatusをシートに持たず、効果件数からstatusを導出する。
    const buildDocumentsSource = functionSource('asstBuildDocuments_');
    const hasCardStatusHeader = /ASST_HEADERS\[ASST_SHEET_EFFECTS\][\s\S]{0,300}cardStatus/.test(assistSource);
    const derivesStatus = /group\.status\s*=\s*group\.effects\.length\s*\?\s*['"]verified['"]\s*:\s*['"]draft['"]/.test(buildDocumentsSource);
    if (hasCardStatusHeader || !derivesStatus) {
      ng(`cardStatus列またはstatus導出が不正（列 ${hasCardStatusHeader ? 'あり' : 'なし'} / 導出 ${derivesStatus ? 'あり' : 'なし'}）`);
    } else ok('assist_effectsにcardStatus列がなく、effects.lengthからstatusを導出');

    // H-3 検査13: シェルのタブ対応表と実在するdomain-panelを双方向で照合する。
    const indexSource = htmlSources.find(item => item.file === 'index.html')?.source || '';
    const panelMapBlock = indexSource.match(/\bvar\s+APP_PANEL_IDS\s*=\s*\{([\s\S]*?)\}\s*;/)?.[1] || '';
    const panelMapEntries = [...panelMapBlock.matchAll(/(?:^|,)\s*(?:([A-Za-z_$][\w$]*)|['"]([^'"]+)['"])\s*:\s*['"]([^'"]+)['"]/g)]
      .map(match => ({ tab: match[1] || match[2], panelId: match[3] }));
    const panelMapValues = new Set(panelMapEntries.map(entry => entry.panelId));
    const appOpenTabSource = indexSource.match(/function\s+appOpenTab\s*\([^)]*\)\s*\{([^\n]*)\}/)?.[1] || '';
    const usesPanelMap = /APP_PANEL_IDS\s*\[\s*name\s*\]/.test(appOpenTabSource)
      && !/name\s*\+\s*['"]_root['"]/.test(appOpenTabSource);
    const domainPanelIds = htmlSources.filter(item => item.file.startsWith('ui_')).flatMap(item => [...item.source.matchAll(/<([A-Za-z][\w:-]*)\b([^>]*)>/g)]
      .map(match => match[2])
      .filter(attributes => /\bclass\s*=\s*(["'])[^"']*\bdomain-panel\b[^"']*\1/.test(attributes))
      .map(attributes => attributes.match(/\bid\s*=\s*(["'])([^"']+)\1/)?.[2])
      .filter(Boolean));
    const allElementIds = new Set(elementIds.map(item => item.id));
    const missingPanelIds = [...panelMapValues].filter(panelId => !allElementIds.has(panelId));
    const unreachablePanelIds = [...new Set(domainPanelIds)].filter(panelId => !panelMapValues.has(panelId));
    if (!panelMapEntries.length || !usesPanelMap || missingPanelIds.length || unreachablePanelIds.length) {
      ng(`タブとパネルの対応が不正（対応表 ${panelMapEntries.length ? panelMapEntries.map(entry => `${entry.tab}->${entry.panelId}`).join(', ') : '解析不能'} / 対応表の使用 ${usesPanelMap ? 'OK' : 'NG'} / 実在しないID ${missingPanelIds.join(', ') || '0'} / 到達不能パネル ${unreachablePanelIds.join(', ') || '0'}）`);
    } else {
      ok(`タブとパネルの対応は双方向一致（${panelMapEntries.map(entry => `${entry.tab}->${entry.panelId}`).join(', ')}）`);
    }

    // H-3 検査14: ドメイン用CSSの裸タグ指定がシェルの同名タグへ波及するのを防ぐ。
    const commonSource = htmlSources.find(item => item.file === 'ui_common.html')?.source || '';
    const styleBlocks = [...commonSource.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
      .map(match => match[1].replace(/\/\*[\s\S]*?\*\//g, ''));
    const bareTagSelectors = new Set();
    styleBlocks.forEach(css => {
      let segmentStart = 0;
      for (let index = 0; index < css.length; index++) {
        const char = css[index];
        if (char === '{') {
          const prelude = css.slice(segmentStart, index).trim();
          if (!prelude.startsWith('@')) {
            prelude.split(',').map(selector => selector.trim())
              .filter(selector => /^[a-z][a-z0-9-]*$/i.test(selector))
              .forEach(selector => bareTagSelectors.add(selector.toLowerCase()));
          }
          segmentStart = index + 1;
        } else if (char === ';' || char === '}') {
          segmentStart = index + 1;
        }
      }
    });
    const shellTags = new Set([...indexSource.matchAll(/<([a-z][a-z0-9-]*)\b/gi)]
      .map(match => match[1].toLowerCase()));
    // body / button / header は統合画面全体の土台・操作部品・共通ヘッダーを意図した全体指定。
    const allowedShellBareTags = new Set(['body', 'button', 'header']);
    const unsafeShellBareTags = [...bareTagSelectors]
      .filter(tag => shellTags.has(tag) && !allowedShellBareTags.has(tag)).sort();
    if (unsafeShellBareTags.length) {
      ng(`ui_common.htmlの裸タグセレクタがシェルへ波及: ${unsafeShellBareTags.join(', ')}`);
    } else {
      ok(`ui_common.htmlの裸タグセレクタとシェルの重複は許可済みのみ（${[...bareTagSelectors].filter(tag => shellTags.has(tag)).sort().join(', ') || '0'}）`);
    }

    // H-3 検査15: シェル通知を追加しても、ドメイン内のその場表示を失わせない。
    const shellAlert = indexSource.match(/<([A-Za-z][\w:-]*)\b([^>]*)\bid\s*=\s*(["'])app_toast\3([^>]*)>/i);
    const hasShellAlert = !!shellAlert && /\brole\s*=\s*(["'])alert\1/i.test(`${shellAlert[2]} ${shellAlert[4]}`);
    const showSource = commonSource.match(/function\s+show\s*\([^)]*\)\s*\{([^\n]*)\}/)?.[1] || '';
    const writesShellAlert = /\bel\(\s*['"]app_toast['"]\s*\)/.test(showSource)
      && /toast\.textContent\s*=/.test(showSource);
    const writesActivePanel = /document\.querySelector\([^)]*\.domain-panel\.active[^)]*\)/.test(showSource)
      && /target\.textContent\s*=/.test(showSource);
    const notificationIssues = [];
    if (!hasShellAlert) notificationIssues.push('index.htmlにrole="alert"のapp_toastがない');
    if (!writesShellAlert) notificationIssues.push('show()がapp_toastへ書き込んでいない');
    if (!writesActivePanel) notificationIssues.push('show()が.domain-panel.activeへ書き込んでいない');
    if (notificationIssues.length) {
      ng(`利用者への通知経路が不正: ${notificationIssues.join(' / ')}`);
    } else {
      ok('show()はapp_toastと.domain-panel.activeの両方へ通知');
    }

    // H-3 検査16: ヘッダを定義した *_log シートにはappendRowへ到達する書込経路を必須とする。
    const allGasSource = gasSources.map(item => item.source).join('\n');
    const sheetConstants = new Map([...allGasSource.matchAll(/^var\s+([A-Z][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]\s*;/gm)]
      .map(match => [match[1], match[2]]));
    const headerSheetConstants = [...allGasSource.matchAll(/^(?:CORE|MON|ASST)_HEADERS\[([A-Z][A-Z0-9_]*)\]\s*=/gm)]
      .map(match => match[1]);
    const logSheetConstants = [...new Set(headerSheetConstants)]
      .filter(name => String(sheetConstants.get(name) || '').endsWith('_log')).sort();
    const functionNames = functions.map(item => item.name);
    const callsFrom = name => functionNames.filter(called => called !== name
      && new RegExp(`\\b${called}\\s*\\(`).test(functionSource(name)));
    const reachesAppendRow = (name, visited) => {
      if (visited.has(name)) return false;
      visited.add(name);
      const source = functionSource(name);
      if (/\.appendRow\s*\(/.test(source)) return true;
      return callsFrom(name).some(called => reachesAppendRow(called, visited));
    };
    const missingLogWriters = logSheetConstants.filter(constant => {
      const entryPoints = functionNames.filter(name => functionSource(name).includes(constant));
      return !entryPoints.some(name => reachesAppendRow(name, new Set()));
    });
    const monPublishSource = functionSource('api_monPublish');
    const asstPublishApiSource = functionSource('api_asstPublish');
    const publishSendIssues = [];
    if (!/\b(?:monPublishLog_|publishLog_)\s*\([\s\S]{0,200}?'送信済み'/.test(monPublishSource)) {
      publishSendIssues.push('api_monPublish');
    }
    if (!/publishLog_\s*\(\s*ASST_SHEET_PUBLISH_LOG\s*,[\s\S]{0,200}?'送信済み'/.test(asstPublishApiSource)) {
      publishSendIssues.push('api_asstPublish');
    }
    if (logSheetConstants.length !== 4 || missingLogWriters.length || publishSendIssues.length) {
      ng(`ヘッダ定義済みログシートの書込経路が不正（対象 ${logSheetConstants.length}: ${logSheetConstants.join(', ') || '0'} / 書き手なし ${missingLogWriters.join(', ') || '0'} / 公開送信記録なし ${publishSendIssues.join(', ') || '0'}）`);
    } else {
      ok(`ヘッダ定義済みログシート4件にappendRowへの書込経路あり（${logSheetConstants.join(', ')}）`);
    }

    // H-3 検査17: モンスターとアシストの公開ログ・状態確認は同じ共用実装を通す。
    const sharedPublishIssues = [];
    const sharedPublishFunctions = [
      'publishLog_', 'publishLogRows_', 'recordedPublishResult_', 'sentPublishUser_',
      'latestPublishSha_', 'cmsPublishRun_', 'publishStatus_',
    ];
    sharedPublishFunctions.forEach(name => {
      if (!functionSource(name)) sharedPublishIssues.push(`${name}なし`);
    });
    const monWrapperCalls = {
      monPublishLog_: 'publishLog_',
      monPublishLogRows_: 'publishLogRows_',
      monRecordedPublishResult_: 'recordedPublishResult_',
      monSentPublishUser_: 'sentPublishUser_',
      monLatestPublishSha_: 'latestPublishSha_',
      monCmsPublishRun_: 'cmsPublishRun_',
      monPublishStatus_: 'publishStatus_',
    };
    Object.entries(monWrapperCalls).forEach(([wrapper, shared]) => {
      const source = functionSource(wrapper);
      if (!source || !new RegExp(`\\b${shared}\\s*\\(`).test(source)) {
        sharedPublishIssues.push(`${wrapper}->${shared}`);
      }
    });
    const monStatusWrapper = functionSource('monPublishStatus_');
    if (!/logSheet:\s*MON_SHEET_PUBLISH_LOG/.test(monStatusWrapper)
        || !/workflow:\s*['"]cms-publish\.yml['"]/.test(monStatusWrapper)
        || !/branch:\s*GITHUB_MON_PUBLISH_BRANCH/.test(monStatusWrapper)
        || !/onResult:\s*function/.test(monStatusWrapper)) {
      sharedPublishIssues.push('monPublishStatus_ config');
    }
    ['api_asstPublishStatus', 'api_asstLatestPublishStatus'].forEach(name => {
      const source = functionSource(name);
      if (!/\bpublishStatus_\s*\(/.test(source)
          || !/logSheet:\s*ASST_SHEET_PUBLISH_LOG/.test(source)
          || !/workflow:\s*['"]cms-assist-publish\.yml['"]/.test(source)
          || !/branch:\s*GITHUB_ASST_PUBLISH_BRANCH/.test(source)
          || /onResult\s*:/.test(source)) {
        sharedPublishIssues.push(`${name}->publishStatus_`);
      }
    });
    if (sharedPublishIssues.length) {
      ng(`公開ログ・状態確認の共用実装が不正: ${sharedPublishIssues.join(', ')}`);
    } else {
      ok('モンスターとアシストは同じ公開ログ・状態確認実装を使用');
    }
  }

  if (!fs.existsSync(cmsDir)) {
    ng(`GitHubトークン検査対象の ${cmsRelativeDir} がない`);
  } else {
    scanGitHubTokens(cmsDir);
    if (tokenHits.length) {
      ng('GitHubトークンらしき文字列がある: '
        + tokenHits.map(hit => `${hit.file}:${hit.line}`).join(', '));
    } else {
      ok(`${cmsRelativeDir} 配下にGitHubトークンらしき文字列なし`);
    }
  }

  const exposesGasSource = exists('.nojekyll')
    || jekyllConfigs.some(config => /(?:^|[\s'"\/-])_cms(?:[\s'"\/]|$)/m.test(read(config)));
  if (exposesGasSource) {
    ng('_cmsを公開しうる.nojekyllまたはJekyll設定がある');
  } else {
    ok('_cmsはJekyll公開対象外（.nojekyll・include設定なし）');
  }

  const hits = [];
  const walk = p => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '_work') continue;
      const fp = path.join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/\.(html|js)$/.test(e.name)) {
        const t = fs.readFileSync(fp, 'utf8');
        if (/EDIT_PASSWORD\s*=\s*['"]/.test(t)) hits.push(path.relative(REPO, fp));
      }
    }
  };
  walk(REPO);
  if (hits.length) ng(`平文パスワードが存在: ${hits.join(', ')}`);
  else ok('平文パスワードなし');

  const formerClientWriteFiles = [
    'ability-match.html',
    'admin.html',
    'assist-effect-import.html',
    'assist-effect-input.html',
    'cards/card.html',
    'monster-match.html',
    'monsters/monster.html',
  ];
  const clientWriteIssues = [];
  for (const file of formerClientWriteFiles) {
    if (!exists(file)) {
      clientWriteIssues.push(`${file}: ファイル欠落`);
      continue;
    }
    const source = read(file);
    if (/<input[^>]+type=["']password["']/i.test(source)
        || /\bprompt\s*\([^)]*パスワード/i.test(source)) {
      clientWriteIssues.push(`${file}: クライアント側認証UI`);
    }
    if (/\.(?:set|add|update)\s*\(\s*\{|\.delete\s*\(\s*\)/.test(source)) {
      clientWriteIssues.push(`${file}: クライアント側write API`);
    }
    if (/onclick=["'][^"']*(?:startEdit|startExplEdit|startFormEdit|save|deleteComment|toggleAdmin|submitComment|startImport|scheduleSave)/i.test(source)) {
      clientWriteIssues.push(`${file}: 書込・削除UI`);
    }
  }
  if (clientWriteIssues.length) {
    ng(`旧クライアント管理機能が残っている: ${clientWriteIssues.join(', ')}`);
  } else {
    ok('既知7ファイルにクライアント側認証・write API・書込削除UIなし');
  }

  const protectedTestWorkflow = '.github/workflows/cms-protected-test.yml';
  if (!exists(protectedTestWorkflow)) {
    ng(`${protectedTestWorkflow} がない`);
  } else {
    const workflow = read(protectedTestWorkflow);
    const unsafeTargets = [
      /HEAD:main/,
      /refs\/heads\/main/,
      /--base\s+["']?main\b/,
      /TEST_BASE_BRANCH:\s*main\b/,
    ];
    const requiredMarkers = [
      /workflow_dispatch:/,
      /TEST_BASE_BRANCH:\s*cms\/protected-test/,
      /secrets\.CMS_PROTECTED_TEST_TOKEN/,
      /permissions:\s*\n\s*contents:\s*read\s*\n\s*pull-requests:\s*read/,
      /direct-push-rejection/,
      /cms-pr/,
      /normal-pr/,
      /revert-pr/,
    ];
    if (unsafeTargets.some(pattern => pattern.test(workflow))) {
      ng(`${protectedTestWorkflow} がmainを更新対象にしている`);
    } else if (requiredMarkers.some(pattern => !pattern.test(workflow))) {
      ng(`${protectedTestWorkflow} のtest専用ゲートが不足している`);
    } else if (/CMS_PUBLISH_TOKEN/.test(workflow)) {
      ng(`${protectedTestWorkflow} が本番CMS tokenを参照している`);
    } else {
      ok('CMS保護test Workflowは専用branch・専用tokenだけを使用');
    }
  }
}

// ---------------------------------------------------------------- 9
head('9. 生成ページのインデックス制御');
if (!exists('sitemap.xml')) sk('sitemap.xml がない');
else {
  const generated = [];
  const monstersDir = path.join(REPO, 'monsters');
  const walk = p => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const fp = path.join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.html') && e.name !== 'monster.html') generated.push(fp);
    }
  };
  if (fs.existsSync(monstersDir)) walk(monstersDir);
  if (exists('src/data/assist-cards.json')) {
    try {
      const assistCards = JSON.parse(read('src/data/assist-cards.json')).cards || [];
      for (const card of assistCards) {
        const file = path.join(REPO, 'cards', `${card.cardId}.html`);
        if (fs.existsSync(file)) generated.push(file);
      }
    } catch { /* DB自体の詳細なエラーはセクション11で報告する */ }
  }

  const sitemapPaths = new Set([...read('sitemap.xml').matchAll(/<loc>https?:\/\/[^/]+\/(.*?)<\/loc>/g)]
    .map(match => match[1].endsWith('/') ? match[1] + 'index.html' : match[1]));
  const indexed = [];
  const noindexed = [];
  const missingNoindex = [];
  const robotsInSitemap = [];
  const adsOnNoindex = [];

  for (const file of generated) {
    const relative = path.relative(REPO, file).replace(/\\/g, '/');
    const html = fs.readFileSync(file, 'utf8');
    const inSitemap = sitemapPaths.has(relative);
    const hasRobots = /<meta\b[^>]*\bname=["']robots["'][^>]*>/i.test(html);
    const hasNoindexFollow = /<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["']noindex,follow["'])[^>]*>/i.test(html);

    if (inSitemap) {
      indexed.push(relative);
      if (hasRobots) robotsInSitemap.push(relative);
    } else {
      noindexed.push(relative);
      if (!hasNoindexFollow) missingNoindex.push(relative);
      if (/adsbygoogle/i.test(html)) adsOnNoindex.push(relative);
    }
  }

  if (missingNoindex.length) {
    ng(`sitemap非掲載で noindex,follow が無い ${missingNoindex.length}件: ${missingNoindex.slice(0, 5).join(', ')}`);
  } else ok(`sitemap非掲載ページ ${noindexed.length}件すべて noindex,follow`);

  if (robotsInSitemap.length) {
    ng(`sitemap掲載済みで robots メタがある ${robotsInSitemap.length}件: ${robotsInSitemap.slice(0, 5).join(', ')}`);
  } else ok(`sitemap掲載ページ ${indexed.length}件に robots メタなし`);

  if (adsOnNoindex.length) {
    ng(`noindex ページに adsbygoogle がある ${adsOnNoindex.length}件: ${adsOnNoindex.slice(0, 5).join(', ')}`);
  } else ok(`noindex ページ ${noindexed.length}件に adsbygoogle なし`);

  const visibleChars = html => {
    const withoutInvisible = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const body = withoutInvisible.match(/<body[\s\S]*?<\/body>/i);
    return (body ? body[0] : withoutInvisible)
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, '')
      .length;
  };
  const indexedDetails = indexed.filter(relative => /\/\d{4}\.html$/.test(relative));
  const measuredDetails = indexedDetails.map(relative => ({
    relative,
    count: visibleChars(read(relative)),
  }));
  const thinIndexedDetails = measuredDetails.filter(detail => detail.count < 800);

  if (!measuredDetails.length) {
    ng('sitemap.xml にインデックス対象の詳細ページがない');
  } else if (thinIndexedDetails.length) {
    ng(`sitemap掲載詳細ページに可視800字未満が ${thinIndexedDetails.length}件: `
      + thinIndexedDetails.slice(0, 5)
        .map(detail => `${detail.relative}（${detail.count}字）`)
        .join(', '));
  } else {
    const minimum = Math.min(...measuredDetails.map(detail => detail.count));
    ok(`インデックス対象${measuredDetails.length}件すべて可視800字以上（最小 ${minimum}字）`);
  }

  // 9-5. 公開HTMLに旧URLへのリンクが残っていないこと
  const htmlFiles = [];
  const walkHtml = p => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '_work') continue;
      const fp = path.join(p, e.name);
      if (e.isDirectory()) walkHtml(fp);
      else if (e.name.endsWith('.html')) htmlFiles.push(fp);
    }
  };
  walkHtml(REPO);
  const oldUrlLinks = htmlFiles.filter(file => {
    const relative = path.relative(REPO, file).replace(/\\/g, '/');
    return relative !== 'monsters/monster.html'
      && /monster\.html\?id=/.test(fs.readFileSync(file, 'utf8'));
  });
  if (oldUrlLinks.length) {
    ng('monster.html' + `?id= へのリンクが残っている: ${oldUrlLinks.map(file => path.relative(REPO, file)).join(', ')}`);
  } else ok('monster.html' + '?id= へのリンクなし');

  // 9-6. 旧URL転送マップの件数・対応先・実在を検査
  if (!exists('src/data/monster-ids.json') || !exists('monsters/redirect-map.js')) {
    ng('monster-ids.json または monsters/redirect-map.js がない');
  } else {
    try {
      const ids = JSON.parse(read('src/data/monster-ids.json')).monsters;
      const source = read('monsters/redirect-map.js');
      const objectMatch = source.match(/window\.LMF_REDIRECT_MAP\s*=\s*(\{[\s\S]*\})\s*;/);
      if (!objectMatch) throw new Error('window.LMF_REDIRECT_MAP を解析できない');
      const redirectMap = JSON.parse(objectMatch[1]);
      const expected = new Map(ids.map(monster => [
        String(monster.arrayIndex),
        monster.url.replace(/^\/monsters\//, ''),
      ]));
      const keys = Object.keys(redirectMap);
      const missingKeys = [...expected.keys()].filter(key => !Object.prototype.hasOwnProperty.call(redirectMap, key));
      const unexpectedKeys = keys.filter(key => !expected.has(key));
      const wrongTargets = keys.filter(key => expected.has(key) && redirectMap[key] !== expected.get(key));
      const missingTargets = keys.filter(key => {
        return !fs.existsSync(path.join(REPO, 'monsters', redirectMap[key]));
      });
      if (keys.length !== ids.length || missingKeys.length || unexpectedKeys.length
          || wrongTargets.length || missingTargets.length) {
        ng(`redirect-map.js が不正（マップ${keys.length}件 / ID${ids.length}件 / キー欠落${missingKeys.length}件 / 余分${unexpectedKeys.length}件 / 転送先不一致${wrongTargets.length}件 / ファイル欠落${missingTargets.length}件）`);
      } else ok(`redirect-map.js ${ids.length}件すべて転送先が存在`);
    } catch (error) {
      ng(`redirect-map.js の検査に失敗: ${error.message}`);
    }
  }
}

// ---------------------------------------------------------------- 10
head('10. 能力画像の割当');
if (!exists('src/data/card-ability-assignments.json')) {
  ng('card-ability-assignments.json がない');
} else {
  try {
    const assignmentData = JSON.parse(read('src/data/card-ability-assignments.json'));
    const cardIds = new Set(
      [...read('cards/cards-data.js').matchAll(/^\s*'([^']+)'\s*:/gm)].map(match => match[1]),
    );
    const assignmentEntries = Object.entries(assignmentData.assignments || {});
    const unknownCardIds = assignmentEntries
      .map(([cardId]) => cardId)
      .filter(cardId => !cardIds.has(cardId));
    if (unknownCardIds.length) {
      ng(`能力画像割当に cards-data.js に無いcardIdがある: ${unknownCardIds.join(', ')}`);
    } else {
      ok(`能力画像割当の全cardIdが cards-data.js に実在（${assignmentEntries.length}件）`);
    }

    const referencedImages = [...new Set(assignmentEntries.flatMap(([, filenames]) => filenames))];
    const missingImages = referencedImages
      .filter(filename => !exists(`assist-abilities/${filename}`));
    if (missingImages.length) {
      ng(`能力画像割当に存在しない画像参照がある: ${missingImages.join(', ')}`);
    } else {
      ok(`能力画像割当の全参照画像が assist-abilities/ に実在（${referencedImages.length}種）`);
    }
  } catch (error) {
    ng(`card-ability-assignments.json の検査に失敗: ${error.message}`);
  }
}

// ---------------------------------------------------------------- 11
head('11. アシストカードDB');
if (!exists('src/data/assist-cards.json')) {
  ng('assist-cards.json がない');
} else {
  try {
    const database = JSON.parse(read('src/data/assist-cards.json'));
    const cards = Array.isArray(database.cards) ? database.cards : [];
    const sourceIds = [...read('cards/cards-data.js').matchAll(/^\s*'([^']+)'\s*:/gm)]
      .map(match => match[1]);
    const databaseIds = cards.map(card => card.cardId);
    const databaseIdSet = new Set(databaseIds);
    const missingIds = sourceIds.filter(cardId => !databaseIdSet.has(cardId));
    const duplicateIds = databaseIds.filter((cardId, index) => databaseIds.indexOf(cardId) !== index);

    if (missingIds.length || duplicateIds.length) {
      ng(`assist-cards.jsonがcards-data.jsの互換IDを包含していません（DB ${cards.length}件 / 互換入力 ${sourceIds.length}件 / 欠落 ${missingIds.length}件 / 重複 ${duplicateIds.length}件）`);
    } else {
      ok(`assist-cards.jsonがcards-data.jsの互換IDを全件包含（DB ${cards.length}件 / 互換入力 ${sourceIds.length}件 / CMS追加 ${cards.length - sourceIds.length}件）`);
    }

    // 旧形式は手入力の3セグメント、新形式はCMSが自動採番するc<4桁連番>-<レアリティ>。
    const cardIdPattern = /^(?:[a-z][a-z0-9]*-(?:MR|SSR)-[a-z0-9]+|c[0-9]{4}-(?:MR|SSR))$/;
    const invalidCardIds = databaseIds.filter(cardId => !cardIdPattern.test(cardId));
    if (invalidCardIds.length) {
      ng(`assist-cards.jsonのcardId書式が不正: ${invalidCardIds.slice(0, 5).join(', ')}`);
    } else {
      ok(`assist-cards.jsonの全cardIdが許可書式（${databaseIds.length}件）`);
    }

    const serialPattern = /^c([0-9]{4})-(?:MR|SSR)$/;
    const serialRarityMismatch = cards.filter(card => {
      const match = serialPattern.exec(card.cardId);
      return match && !card.cardId.endsWith(`-${card.rarity}`);
    });
    if (serialRarityMismatch.length) {
      ng(`自動採番cardIdのレアリティが本体と不一致: ${serialRarityMismatch.slice(0, 5).map(card => card.cardId).join(', ')}`);
    } else {
      ok('自動採番cardIdのレアリティはすべてcard.rarityと一致');
    }

    const missingImages = cards.filter(card => typeof card.image !== 'string' || !exists(card.image));
    if (missingImages.length) {
      ng(`assist-cards.jsonに存在しない画像参照がある: ${missingImages.slice(0, 5).map(card => card.cardId).join(', ')}`);
    } else {
      ok(`assist-cards.jsonの全画像が実在（${cards.length}件）`);
    }

    const allowed = {
      rarity: new Set(['MR', 'SSR']),
      aura: new Set(['赤', '緑', '黄', '白', '黒', '青']),
      cardType: new Set([
        'ガード', 'かしこさ', 'ジャッジ', 'アサルト', '回避', '師匠',
        'ちから', 'テクニック', '友人', '丈夫さ', 'インパクト', 'フォース',
        '命中', 'メンタル', 'フィジカル', 'クイック', 'サバイブ', 'ライバル',
        'ルミナス', 'バイタル', 'フォーカス', 'タフネス', 'ライフ', 'アキュメン',
      ]),
      monType: new Set(['幻霊', '無機', '創造', '獣族', '魔族', '怪物', null]),
    };
    const invalidAttributes = cards.flatMap(card => Object.entries(allowed)
      .filter(([key, values]) => !values.has(card[key]))
      .map(([key]) => `${card.cardId}.${key}=${String(card[key])}`));
    if (invalidAttributes.length) {
      ng(`assist-cards.jsonに許可外属性がある: ${invalidAttributes.slice(0, 5).join(', ')}`);
    } else {
      ok('assist-cards.jsonのrarity / aura / cardType / monTypeはすべて許可値');
    }

    if (database.schemaVersion !== 3) {
      ng(`assist-cards.jsonのschemaVersionが3でない: ${database.schemaVersion}`);
    } else {
      ok('assist-cards.jsonはschemaVersion 3');
    }
    const removedCardFields = cards.filter(card => 'distance' in card || 'terrain' in card || 'status' in card);
    if (removedCardFields.length) {
      ng(`削除済みdistance / terrain / statusが残っている: ${removedCardFields.slice(0, 5).map(card => card.cardId).join(', ')}`);
    } else {
      ok('distance / terrain / statusはカードDBから削除済み');
    }
    const allowedAccessory = new Set(['unknown', 'yes', 'no']);
    const invalidAccessory = cards.filter(card => !allowedAccessory.has(card.accessoryStatus));
    if (invalidAccessory.length) {
      ng(`accessoryStatusが不正: ${invalidAccessory.slice(0, 5).map(card => card.cardId).join(', ')}`);
    } else {
      ok('全カードのaccessoryStatusが許可値');
    }
    const invalidStats = cards.filter(card => !Array.isArray(card.stats)
      || ![0, 3].includes(card.stats.length)
      || card.stats.some(row => !row || typeof row.label !== 'string' || !row.label.trim()
        || typeof row.value !== 'string' || !/^\+\d+(?:\.\d+)?%?$/.test(row.value))
      || new Set(card.stats.map(row => row.label)).size !== card.stats.length);
    if (invalidStats.length) {
      ng(`statsが空配列または重複なし3項目でない: ${invalidStats.slice(0, 5).map(card => card.cardId).join(', ')}`);
    } else {
      ok('全カードのstatsが空配列または重複なし3項目');
    }
    const ruri = cards.find(card => card.cardId === 'b17h-MR-ruri');
    if (!ruri || ruri.cardType !== 'アキュメン') ng('ルリのcardTypeがアキュメンでない');
    else ok('ルリのcardTypeはアキュメン');
    const invalidRatings = cards.filter(card => card.ratings !== null && Object.values(card.ratings)
      .some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > 5)));
    if (invalidRatings.length) ng(`評価が0〜5の範囲外: ${invalidRatings.slice(0, 5).map(card => card.cardId).join(', ')}`);
    else ok('全カードの評価は0〜5または未入力');
    const invalidDates = cards.filter(card => {
      if (card.releasedAt === null) return false;
      const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(card.releasedAt);
      if (!match) return true;
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      return date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3]);
    });
    if (invalidDates.length) ng(`実装日がYYYY/MM/DDの実在日でない: ${invalidDates.slice(0, 5).map(card => card.cardId).join(', ')}`);
    else ok('全カードの実装日はYYYY/MM/DDの実在日または未入力');

    const formationRefs = cards.flatMap(card => (card.formations || []).flatMap(formation => [
      ...(formation.cards || []),
      formation.rental,
    ])).filter(Boolean);
    const unknownFormationRefs = [...new Set(formationRefs.filter(cardId => !databaseIdSet.has(cardId)))];
    if (unknownFormationRefs.length) {
      ng(`編成に存在しないcardId参照がある: ${unknownFormationRefs.join(', ')}`);
    } else {
      ok(`編成が参照するcardIdはすべて実在（${new Set(formationRefs).size}種）`);
    }

    const sapoMap = JSON.parse(read('src/data/_audit/sapo-card-map.json'));
    const exactCardIds = sapoMap
      .filter(mapping => mapping.matchType === 'exact')
      .map(mapping => mapping.cardIdCandidates[0]);
    const cardsWithLimitBreak = cards
      .filter(card => card.limitBreak && Object.values(card.limitBreak).some(value => value !== null))
      .map(card => card.cardId);
    const exactCardIdSet = new Set(exactCardIds);
    const limitBreakIdSet = new Set(cardsWithLimitBreak);
    const missingLimitBreak = exactCardIds.filter(cardId => !limitBreakIdSet.has(cardId));
    const unexpectedLimitBreak = cardsWithLimitBreak.filter(cardId => !exactCardIdSet.has(cardId));
    if (cardsWithLimitBreak.length !== exactCardIds.length
        || missingLimitBreak.length || unexpectedLimitBreak.length) {
      ng(`limitBreakとSAPO exact対応が不一致（limitBreak ${cardsWithLimitBreak.length}件 / exact ${exactCardIds.length}件 / 欠落 ${missingLimitBreak.length}件 / 余分 ${unexpectedLimitBreak.length}件）`);
    } else {
      ok(`limitBreakを持つカードがSAPO exact対応と一致（${exactCardIds.length}件）`);
    }
  } catch (error) {
    ng(`assist-cards.jsonの検査に失敗: ${error.message}`);
  }
}

// ---------------------------------------------------------------- 12
head('12. アシスト効果DB');
if (!exists('src/data/assist-effects.json') || !exists('src/data/assist-cards.json')) {
  ng('assist-effects.json または assist-cards.json がない');
} else {
  try {
    const effectsDatabase = JSON.parse(read('src/data/assist-effects.json'));
    const assistCards = JSON.parse(read('src/data/assist-cards.json'));
    const cards = effectsDatabase.cards && typeof effectsDatabase.cards === 'object'
      && !Array.isArray(effectsDatabase.cards) ? effectsDatabase.cards : {};
    const expectedIds = Array.isArray(assistCards.cards)
      ? assistCards.cards.map(card => card.cardId) : [];
    const actualIds = Object.keys(cards);
    const expectedIdSet = new Set(expectedIds);
    const actualIdSet = new Set(actualIds);
    const missingIds = expectedIds.filter(cardId => !actualIdSet.has(cardId));
    const unexpectedIds = actualIds.filter(cardId => !expectedIdSet.has(cardId));
    if (expectedIdSet.size !== expectedIds.length || actualIds.length !== expectedIds.length
        || missingIds.length || unexpectedIds.length) {
      ng(`assist-effects.jsonのcardId集合が不一致（効果DB ${actualIds.length}件 / カードDB ${expectedIds.length}件 / 欠落 ${missingIds.length}件 / 余分 ${unexpectedIds.length}件）`);
    } else {
      ok(`assist-effects.jsonのcardId集合がassist-cards.jsonと完全一致（${actualIds.length}件）`);
    }

    const allowedRanks = new Set(['無凸', '1凸', '2凸', '3凸', '4凸']);
    const allEffects = actualIds.flatMap(cardId => Array.isArray(cards[cardId]?.effects)
      ? cards[cardId].effects.map(effect => ({ cardId, effect })) : []);
    const invalidRanks = allEffects.filter(({ effect }) => !allowedRanks.has(effect.unlockRank));
    if (invalidRanks.length) {
      ng(`assist-effects.jsonに許可外unlockRankがある: ${invalidRanks.slice(0, 5).map(({ cardId, effect }) => `${cardId}.${effect.effectId}=${String(effect.unlockRank)}`).join(', ')}`);
    } else {
      ok('assist-effects.jsonのunlockRankはすべて許可値');
    }

    const effectIds = allEffects.map(({ effect }) => effect.effectId);
    const duplicateEffectIds = effectIds.filter((effectId, index) => effectIds.indexOf(effectId) !== index);
    if (duplicateEffectIds.length) {
      ng(`assist-effects.jsonのeffectIdが重複: ${[...new Set(duplicateEffectIds)].slice(0, 5).join(', ')}`);
    } else {
      ok(`assist-effects.jsonのeffectIdはファイル全体で一意（${effectIds.length}件）`);
    }

    const invalidSortOrders = [];
    const duplicateTriples = [];
    const invalidStatuses = [];
    for (const cardId of actualIds) {
      const card = cards[cardId];
      const effects = Array.isArray(card?.effects) ? card.effects : null;
      if (!effects) {
        invalidSortOrders.push(`${cardId}: effectsが配列ではない`);
        invalidStatuses.push(`${cardId}: effectsが配列ではない`);
        continue;
      }
      const expectedSortOrders = effects.map((_, index) => index + 1);
      if (effects.some((effect, index) => effect.sortOrder !== expectedSortOrders[index])) {
        invalidSortOrders.push(cardId);
      }
      const triples = effects.map(effect => JSON.stringify([
        effect.name,
        effect.description,
        effect.unlockRank,
      ]));
      if (new Set(triples).size !== triples.length) duplicateTriples.push(cardId);
      if ((card.status === 'draft' && effects.length !== 0)
          || (card.status === 'verified' && effects.length === 0)
          || (card.status !== 'draft' && card.status !== 'verified')) {
        invalidStatuses.push(cardId);
      }
    }

    if (invalidSortOrders.length) {
      ng(`assist-effects.jsonのsortOrderが1からの連番ではない: ${invalidSortOrders.slice(0, 5).join(', ')}`);
    } else {
      ok('assist-effects.jsonのsortOrderは全カードで1からの連番');
    }
    if (duplicateTriples.length) {
      ng(`assist-effects.jsonの同一カード内にname + description + unlockRankの重複がある: ${duplicateTriples.slice(0, 5).join(', ')}`);
    } else {
      ok('assist-effects.jsonの同一カード内にname + description + unlockRankの重複なし');
    }
    if (invalidStatuses.length) {
      ng(`assist-effects.jsonのstatusとeffectsの空・非空が不整合: ${invalidStatuses.slice(0, 5).join(', ')}`);
    } else {
      ok('assist-effects.jsonのdraftはeffects空、verifiedはeffects非空');
    }

    // 表記チェックは「OCRのUI片が本文へ混入した」もの＝データとして誤りのものだけに限定する。
    // 括弧の全角半角・+の前後空白・読点後の空白・英字ローマ数字は文字形の揺れにすぎず、
    // OCR取り込み時に scripts/assist-effect-ocr.js のサニタイザが吸収するため検証では落とさない。
    const invalidEffectText = allEffects.filter(({ effect }) => (
      /MAX↑/.test(String(effect.name || ''))
      || /MAX↑/.test(String(effect.description || ''))
      || /^•/m.test(String(effect.name || ''))
      || /^•/m.test(String(effect.description || ''))
    ));
    if (invalidEffectText.length) {
      ng(`アシスト効果にOCR由来のUI片が残っている（${invalidEffectText.length}件: ${invalidEffectText.slice(0, 5)
        .map(({ cardId, effect }) => `${cardId}.${effect.effectId}`).join(', ')}）`);
    } else {
      ok('アシスト効果にMAX↑・行頭•のOCR由来UI片なし');
    }
  } catch (error) {
    ng(`assist-effects.jsonの検査に失敗: ${error.message}`);
  }
}

// ---------------------------------------------------------------- 13
head('13. アシスト能力DB');
if (!exists('src/data/assist-abilities.json') || !exists('src/data/assist-cards.json')) {
  ng('assist-abilities.json または assist-cards.json がない');
} else {
  try {
    const abilitiesDatabase = JSON.parse(read('src/data/assist-abilities.json'));
    const assistCards = JSON.parse(read('src/data/assist-cards.json'));
    if (abilitiesDatabase.schemaVersion !== 2) {
      throw new Error(`schemaVersionが2ではありません: ${abilitiesDatabase.schemaVersion}`);
    }
    if (!Array.isArray(abilitiesDatabase.abilities)) {
      throw new Error('abilitiesが配列ではありません');
    }
    const abilities = abilitiesDatabase.abilities;
    const cardIds = new Set(Array.isArray(assistCards.cards)
      ? assistCards.cards.map(card => card.cardId) : []);

    const abilityIds = abilities.map(ability => ability.abilityId);
    const invalidAbilityIds = abilityIds.filter(abilityId => typeof abilityId !== 'string' || !/^ab-[0-9]{4,}$/.test(abilityId));
    if (invalidAbilityIds.length) {
      ng(`assist-abilities.jsonのabilityId形式が不正: ${invalidAbilityIds.slice(0, 5).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのabilityIdはab-####形式');
    }
    const duplicateAbilityIds = abilityIds
      .filter((abilityId, index) => abilityIds.indexOf(abilityId) !== index);
    if (duplicateAbilityIds.length) {
      ng(`assist-abilities.jsonのabilityIdが重複: ${[...new Set(duplicateAbilityIds)].slice(0, 5).join(', ')}`);
    } else {
      ok(`assist-abilities.jsonのabilityIdはファイル全体で一意（${abilityIds.length}件）`);
    }

    const invalidLegacyIds = abilities.filter(ability => ability.legacyId !== null &&
      (!Number.isInteger(ability.legacyId) || ability.legacyId <= 0));
    if (invalidLegacyIds.length) {
      ng(`assist-abilities.jsonのlegacyIdが正の整数またはnullでない: ${invalidLegacyIds.slice(0, 5).map(ability => ability.abilityId).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのlegacyIdは正の整数またはnull');
    }
    const legacyIds = abilities.map(ability => ability.legacyId).filter(legacyId => legacyId !== null);
    const duplicateLegacyIds = legacyIds
      .filter((legacyId, index) => legacyIds.indexOf(legacyId) !== index);
    if (duplicateLegacyIds.length) {
      ng(`assist-abilities.jsonのlegacyIdが重複: ${[...new Set(duplicateLegacyIds)].slice(0, 5).join(', ')}`);
    } else {
      ok(`assist-abilities.jsonのlegacyIdはファイル全体で一意（${legacyIds.length}件）`);
    }

    const allowedLinkStatuses = new Set(['resolved', 'ambiguous', 'unlinked']);
    const invalidLinkStatuses = abilities
      .filter(ability => !allowedLinkStatuses.has(ability.linkStatus));
    if (invalidLinkStatuses.length) {
      ng(`assist-abilities.jsonに許可外linkStatusがある: ${invalidLinkStatuses.slice(0, 5).map(ability => `${ability.abilityId}=${String(ability.linkStatus)}`).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのlinkStatusはすべて許可値');
    }

    const invalidCardIds = abilities.filter(ability => (
      ability.linkStatus === 'resolved'
        ? typeof ability.cardId !== 'string' || !cardIds.has(ability.cardId)
        : ability.cardId !== null
    ));
    if (invalidCardIds.length) {
      ng(`assist-abilities.jsonのlinkStatusとcardIdが不整合: ${invalidCardIds.slice(0, 5).map(ability => ability.abilityId).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのresolvedは実在cardId、resolved以外はcardId null');
    }

    const allowedSources = new Set(['イベント', '閃き', 'EXトレ', '伝授']);
    const invalidSources = abilities.filter(ability => !allowedSources.has(ability.source));
    if (invalidSources.length) {
      ng(`assist-abilities.jsonに許可外sourceがある: ${invalidSources.slice(0, 5).map(ability => `${ability.abilityId}=${String(ability.source)}`).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのsourceはすべて許可値');
    }

    const allowedAbilityRarities = new Set(['MR', 'SSR', 'SR', 'その他']);
    const invalidAbilityRarities = abilities.filter(ability => ability.rarity !== null && !allowedAbilityRarities.has(ability.rarity));
    if (invalidAbilityRarities.length) {
      ng(`assist-abilities.jsonに許可外rarityがある: ${invalidAbilityRarities.slice(0, 5).map(ability => `${ability.abilityId}=${String(ability.rarity)}`).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのrarityは既存nullまたは能力専用許可値');
    }

    const emptySourceNames = abilities
      .filter(ability => typeof ability.sourceName !== 'string' || ability.sourceName.length === 0);
    if (emptySourceNames.length) {
      ng(`assist-abilities.jsonのsourceNameが空: ${emptySourceNames.slice(0, 5).map(ability => ability.abilityId).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのsourceNameは全件非空');
    }

    const sortOrdersByCard = new Map();
    const invalidSortOrders = [];
    for (const ability of abilities) {
      if (ability.linkStatus === 'resolved') {
        if (!sortOrdersByCard.has(ability.cardId)) sortOrdersByCard.set(ability.cardId, []);
        sortOrdersByCard.get(ability.cardId).push(ability);
      } else if (ability.sortOrder !== null) {
        invalidSortOrders.push(ability.abilityId);
      }
    }
    for (const group of sortOrdersByCard.values()) {
      const sorted = group.slice().sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
      sorted.forEach((ability, index) => {
        if (ability.sortOrder !== index + 1) invalidSortOrders.push(ability.abilityId);
      });
    }
    if (invalidSortOrders.length) {
      ng(`assist-abilities.jsonのsortOrderが不正: ${invalidSortOrders.slice(0, 5).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのresolvedはcardId内で1からの連番、resolved以外はnull');
    }
  } catch (error) {
    ng(`assist-abilities.jsonの検査に失敗: ${error.message}`);
  }
}

// ---------------------------------------------------------------- 14
head('14. 静的アシストカード詳細');
if (!exists('src/data/assist-cards.json')) {
  ng('assist-cards.json がないため生成カードページを検査できない');
} else if (!exists('assist-detail.css')) {
  ng('生成カード詳細用のassist-detail.cssがない');
} else {
  try {
    const cards = JSON.parse(read('src/data/assist-cards.json')).cards || [];
    const abilities = exists('src/data/assist-abilities.json')
      ? JSON.parse(read('src/data/assist-abilities.json')).abilities || []
      : [];
    const effectsByCard = exists('src/data/assist-effects.json')
      ? JSON.parse(read('src/data/assist-effects.json')).cards || {}
      : {};
    const resolvedAbilityCounts = new Map();
    const resolvedAbilitiesByCard = new Map();
    for (const ability of abilities) {
      if (ability.linkStatus !== 'resolved' || ability.status !== 'verified') continue;
      resolvedAbilityCounts.set(ability.cardId, (resolvedAbilityCounts.get(ability.cardId) || 0) + 1);
      if (!resolvedAbilitiesByCard.has(ability.cardId)) resolvedAbilitiesByCard.set(ability.cardId, []);
      resolvedAbilitiesByCard.get(ability.cardId).push(ability);
    }
    const expectedPaths = cards.map(card => `cards/${card.cardId}.html`);
    const expectedSet = new Set(expectedPaths);
    const allCardHtml = fs.readdirSync(path.join(REPO, 'cards'), { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
      .map(entry => `cards/${entry.name}`);
    const actualGenerated = allCardHtml.filter(relative => (
      /元データ: src\/data\/assist-cards\.json/.test(read(relative))
    ));
    const missing = expectedPaths.filter(relative => !exists(relative));
    const unexpected = actualGenerated.filter(relative => !expectedSet.has(relative));
    const duplicates = expectedPaths.filter((relative, index) => expectedPaths.indexOf(relative) !== index);
    if (missing.length || unexpected.length || duplicates.length || actualGenerated.length !== cards.length) {
      ng(`生成カードページがDBと1対1でない（DB ${cards.length} / 実在 ${actualGenerated.length} / 欠落 ${missing.length} / 余分 ${unexpected.length} / 重複ID ${duplicates.length}）`);
    } else {
      ok(`生成カードページ ${cards.length}件がassist-cards.jsonと1対1`);
    }

    const qualityIssues = [];
    const titles = [];
    const descriptions = [];
    const canonicals = [];
    const headings = [];
    for (const card of cards) {
      const relative = `cards/${card.cardId}.html`;
      if (!exists(relative)) continue;
      const html = read(relative);
      const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
      const description = html.match(/<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i)?.[1];
      const canonical = html.match(/<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']*)["'])[^>]*>/i)?.[1];
      const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
      const expectedCanonical = `https://line-monster-farm-tetteikouryaku.com/cards/${card.cardId}.html`;
      const expectedImage = `src="../${card.image}"`;
      const rawRatingCount = Object.values(card.ratings || {}).filter(value => value !== null).length;
      const expectedRatingCount = rawRatingCount ? rawRatingCount + 2 : 0;
      const actualRatingCount = (html.match(/<div class="assist-rating-card(?:\s|\")/g) || []).length;
      const expectedAbilityCount = resolvedAbilityCounts.get(card.cardId) || 0;
      const actualAbilityCount = (html.match(/<article class="assist-ability-card[\s"]/g) || []).length;
      if (!title || !description || !canonical || !h1) qualityIssues.push(`${relative}: title/description/canonical/h1欠落`);
      else if (canonical !== expectedCanonical) qualityIssues.push(`${relative}: canonicalが自URLでない`);
      if (!html.includes(expectedImage)) qualityIssues.push(`${relative}: カード画像参照がDBと不一致`);
      if (!html.includes('<link rel="stylesheet" href="../assist-detail.css">')) qualityIssues.push(`${relative}: 専用CSS参照がない`);
      if (/<h[1-3]\b(?![^>]*\bclass=)[^>]*>/i.test(html)) qualityIssues.push(`${relative}: classの無いh1-h3がある`);
      if (actualRatingCount !== expectedRatingCount) qualityIssues.push(`${relative}: 評価カード数がDBと不一致`);
      if (actualAbilityCount !== expectedAbilityCount) qualityIssues.push(`${relative}: 能力カード数がDBと不一致`);
      if (/class="explanation-section"/.test(html)) qualityIssues.push(`${relative}: 下余白のない旧解説枠を使用`);
      titles.push(title);
      descriptions.push(description);
      canonicals.push(canonical);
      headings.push(h1);
    }
    const duplicateCount = values => values.length - new Set(values).size;
    const duplicateMeta = duplicateCount(titles) + duplicateCount(descriptions)
      + duplicateCount(canonicals) + duplicateCount(headings);
    if (qualityIssues.length || duplicateMeta) {
      ng(`生成カードの固有メタデータが不正（問題 ${qualityIssues.length} / 重複 ${duplicateMeta}）${qualityIssues.length ? `: ${qualityIssues.slice(0, 3).join(', ')}` : ''}`);
    } else {
      ok(`生成カード ${cards.length}件すべてtitle / description / canonical / h1があり固有`);
    }

    const missingImages = cards.filter(card => !exists(card.image));
    if (missingImages.length) {
      ng(`生成カードの画像参照が実在しない: ${missingImages.slice(0, 5).map(card => card.image).join(', ')}`);
    } else {
      ok(`生成カード ${cards.length}件の画像参照がすべて実在`);
    }

    const stripTags = value => String(value || '').replace(/<[^>]+>/g, '');
    const sitemapPaths = exists('sitemap.xml')
      ? new Set([...read('sitemap.xml').matchAll(/<loc>https?:\/\/[^/]+\/(.*?)<\/loc>/g)].map(match => match[1]))
      : new Set();
    const gateIssues = [];
    const indexedCards = [];
    const noindexedCards = [];
    for (const card of cards) {
      const relative = `cards/${card.cardId}.html`;
      if (!exists(relative)) continue;
      const html = read(relative);
      const effects = effectsByCard[card.cardId]?.effects || [];
      const cardAbilities = resolvedAbilitiesByCard.get(card.cardId) || [];
      const effectChars = effects.reduce((sum, effect) => (
        sum + stripTags(effect.name).length + stripTags(effect.description).length
      ), 0);
      const abilityChars = cardAbilities.reduce((sum, ability) => (
        sum + stripTags(ability.name).length + stripTags(ability.description).length
      ), 0);
      const explanationChars = stripTags(card.explanation).length;
      const visibleChars = effectChars + abilityChars + explanationChars;
      const expectedIndexable = visibleChars >= 800 && explanationChars >= 50;
      const inSitemap = sitemapPaths.has(relative);
      const hasRobots = /<meta\b[^>]*\bname=["']robots["'][^>]*>/i.test(html);
      const hasNoindexFollow = /<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["']noindex,follow["'])[^>]*>/i.test(html);
      const hasAds = /adsbygoogle/i.test(html);
      if (expectedIndexable) indexedCards.push(relative);
      else noindexedCards.push(relative);
      if (inSitemap !== expectedIndexable) gateIssues.push(`${relative}: sitemap=${inSitemap} gate=${expectedIndexable}`);
      if (expectedIndexable && hasRobots) gateIssues.push(`${relative}: index対象にrobotsメタあり`);
      if (!expectedIndexable && !hasNoindexFollow) gateIssues.push(`${relative}: noindex,followなし`);
      if (expectedIndexable && !hasAds) gateIssues.push(`${relative}: index対象に広告なし`);
      if (!expectedIndexable && hasAds) gateIssues.push(`${relative}: noindex対象に広告あり`);
    }
    if (gateIssues.length) {
      ng(`カードゲートとsitemap・robots・広告が不一致 ${gateIssues.length}件: ${gateIssues.slice(0, 5).join(', ')}`);
    } else {
      ok(`カードゲート一致（index ${indexedCards.length}件 / noindex ${noindexedCards.length}件、可視本文800字以上かつ解説50字以上）`);
    }

    const assistHtml = exists('assist.html') ? read('assist.html') : '';
    const legacyAssistLinks = assistHtml.match(/href=["']cards\/card\.html#[^"']+["']/g) || [];
    const staticAssistLinks = [...assistHtml.matchAll(/href=["']cards\/([^"'#]+\.html)["']/g)]
      .map(match => `cards/${match[1]}`)
      .filter(relative => expectedSet.has(relative));
    const missingAssistTargets = staticAssistLinks.filter(relative => !exists(relative));
    const missingCardLinks = expectedPaths.filter(relative => !staticAssistLinks.includes(relative));
    const duplicateCardLinks = staticAssistLinks.filter((relative, index) => staticAssistLinks.indexOf(relative) !== index);
    if (legacyAssistLinks.length || staticAssistLinks.length !== cards.length || missingAssistTargets.length
      || missingCardLinks.length || duplicateCardLinks.length) {
      ng(`assist.htmlのカード導線が不正（旧形式 ${legacyAssistLinks.length} / 静的 ${staticAssistLinks.length} / リンク切れ ${missingAssistTargets.length} / 欠落 ${missingCardLinks.length} / 重複 ${duplicateCardLinks.length}）`);
    } else {
      ok(`assist.htmlのカードリンク ${staticAssistLinks.length}件が静的URLで全件実在`);
    }

    const redirectPath = 'cards/SSR-hori.html';
    const redirectHtml = exists(redirectPath) ? read(redirectPath) : '';
    const redirectCanonical = redirectHtml.match(/<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i)?.[1];
    const redirectValid = redirectCanonical === 'https://line-monster-farm-tetteikouryaku.com/cards/f9-SSR-hori.html'
      && /<meta\b(?=[^>]*\bhttp-equiv=["']refresh["'])(?=[^>]*\bcontent=["']0; url=f9-SSR-hori\.html["'])[^>]*>/i.test(redirectHtml)
      && /href=["']f9-SSR-hori\.html["']/.test(redirectHtml)
      && !/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i.test(redirectHtml)
      && !sitemapPaths.has(redirectPath);
    if (!redirectValid) {
      ng('cards/SSR-hori.htmlのcanonical・meta refresh・通常リンク・robots・sitemap除外が不正');
    } else {
      ok('cards/SSR-hori.htmlは新URLへcanonical・meta refresh・通常リンクで誘導しsitemap非掲載');
    }

    const legacyCardPath = 'cards/card.html';
    const legacyCardHtml = exists(legacyCardPath) ? read(legacyCardPath) : '';
    const legacyCardNoindex = /<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["']noindex,follow["'])[^>]*>/i.test(legacyCardHtml);
    const legacyCardHasAds = /adsbygoogle/i.test(legacyCardHtml);
    if (!exists(legacyCardPath) || !legacyCardNoindex || legacyCardHasAds) {
      ng(`cards/card.htmlのnoindex・広告が不正（存在 ${exists(legacyCardPath) ? 'あり' : 'なし'} / noindex,follow ${legacyCardNoindex ? 'あり' : 'なし'} / adsbygoogle ${legacyCardHasAds ? 'あり' : 'なし'}）`);
    } else {
      ok('cards/card.htmlにnoindex,followがありadsbygoogleなし');
    }

    // assist.htmlのカードリンクは静的URLなので、href から # でIDを取り出すと空になり
    // 距離・地形フィルタが全件不一致になる（P14-2の実障害）。取り出しは cardIdFromHref に集約する
    const brokenIdExtraction = [...assistHtml.matchAll(/getAttribute\('href'\)[^;\n]*\.split\('#'\)/g)].length;
    const hasCardIdHelper = /function cardIdFromHref\s*\(/.test(assistHtml);
    const helperUses = (assistHtml.match(/cardIdFromHref\(/g) || []).length;
    if (brokenIdExtraction > 0) {
      ng(`assist.htmlがhrefから#でカードIDを取り出している ${brokenIdExtraction}件（静的URLでは空になり距離・地形フィルタが壊れる）`);
    } else if (!hasCardIdHelper || helperUses < 4) {
      ng(`assist.htmlのカードID取り出しがcardIdFromHrefに集約されていない（定義 ${hasCardIdHelper ? 'あり' : 'なし'} / 使用 ${helperUses}箇所）`);
    } else {
      ok(`assist.htmlのカードID取り出しはcardIdFromHrefに集約（定義1・使用${helperUses - 1}箇所、静的URLと旧#形式の両対応）`);
    }
  } catch (error) {
    ng(`静的アシストカード詳細の検査に失敗: ${error.message}`);
  }
}

// ---------------------------------------------------------------- 15
head('15. アシストCMSソース境界');
if (!exists('_cms/gas/20_assist.gs') || !exists('_cms/gas/ui_assist.html')) {
  ng('アシストCMSの必須ソースがない');
} else {
  try {
    const { validateRoot } = require('./verify-assist-cms');
    const assistCmsIssues = validateRoot(REPO);
    if (assistCmsIssues.length) {
      ng(`アシストCMS検査FAIL ${assistCmsIssues.length}件: ${assistCmsIssues.slice(0, 5).join(', ')}`);
    } else {
      ok('アシストCMSのソース境界を維持し、3DB構造と編集APIが整合');
    }
  } catch (error) {
    ng(`アシストCMS検査の実行に失敗: ${error.message}`);
  }
}

// ---------------------------------------------------------------- 16
head('16. アシスト効果OCR候補');
if (!exists('scripts/test-assist-effect-ocr.js')) {
  ng('アシスト効果OCRテストがない');
} else {
  const result = childProcess.spawnSync(process.execPath, ['scripts/test-assist-effect-ocr.js'], {
    cwd: REPO, encoding: 'utf8',
  });
  if (result.status !== 0) ng(`アシスト効果OCRテストFAIL: ${(result.stderr || result.stdout).trim()}`);
  else ok('効果OCRは背景分類・青丸解放段階・スクロール重複・既存DB差分を検査');
}

// ---------------------------------------------------------------- 17
head('17. ガチャDB');
{
  const required = [
    'src/data/gachas.json',
    'src/data/gacha-types.json',
    'src/data/monster-ids.json',
    'src/data/assist-cards.json',
  ];
  const missing = required.filter(file => !exists(file));
  let issues = missing.map(file => `必須ファイルがない: ${file}`);
  if (!issues.length) {
    try {
      issues = validateGachaData({
        root: REPO,
        gachaDb: JSON.parse(read('src/data/gachas.json')),
        typeDb: JSON.parse(read('src/data/gacha-types.json')),
        monsterDb: JSON.parse(read('src/data/monster-ids.json')).monsters,
        cardDb: JSON.parse(read('src/data/assist-cards.json')).cards,
      });
    } catch (error) {
      issues = [`検査の実行に失敗: ${error.message}`];
    }
  }
  for (const [file, style, names] of [
    ['index.html', 'html', ['PICKUP:MONSTER', 'PICKUP:CARD', 'NAV']],
    ['index.html', 'js', ['UPDATES']],
    ['reroll.html', 'html', ['REROLL']],
  ]) {
    if (!exists(file)) {
      issues.push(`必須ファイルがない: ${file}`);
      continue;
    }
    const source = read(file);
    for (const name of names) {
      for (const edge of ['START', 'END']) {
        const marker = style === 'js' ? `// GACHA:${name}:${edge}` : `<!-- GACHA:${name}:${edge} -->`;
        const count = source.split(marker).length - 1;
        if (count !== 1) issues.push(`${file}: ${marker} が${count}個（1個必須）`);
      }
    }
  }
  if (exists('build.js')) {
    const buildSource = read('build.js');
    const uses = (buildSource.match(/replaceMarkerBlock\(/g) || []).length;
    if (!/function replaceMarkerBlock\s*\(/.test(buildSource) || uses < 6) {
      issues.push('build.jsが共通replaceMarkerBlockを全マーカー置換に使用していない');
    }
    issues.push(...gachaBuildPostprocessIssues(buildSource));
  }
  if (!exists('scripts/verify-gacha-cms.js')) {
    issues.push('必須ファイルがない: scripts/verify-gacha-cms.js');
  } else {
    try {
      const { validateRoot } = require('./verify-gacha-cms');
      const gachaCmsIssues = validateRoot(REPO);
      issues.push(...gachaCmsIssues.map(issue => `ガチャCMS: ${issue}`));
    } catch (error) {
      issues.push(`ガチャCMS検査の実行に失敗: ${error.message}`);
    }
  }
  if (issues.length) ng(`ガチャDB検査FAIL ${issues.length}件: ${issues.slice(0, 5).join(', ')}`);
  else ok(`ガチャDBが整合（ピックアップ上限 ${PICKUP_SLOTS}枠）`);
}

// ---------------------------------------------------------------- 18
head('18. 計測タグ（GTM）');
{
  const GTM_ID = 'GTM-PC4NG733';
  // 休止中スタブ（docs/dormant-files.md）とSearch Console所有権確認ファイルは対象外
  const EXEMPT = new Set([
    'google59378bd79752d094.html', 'cards/SSR-hori.html', 'cards/card.html', 'monsters/monster.html',
    'ability-search.html', 'game-runner.html', 'friend.html', 'assist-card-search.html',
    'game-2048.html', 'monsuta-shindan.html', 'bbs.html', 'assist-ranking.html',
    'npc-regen.html', 'ability-ranking.html', 'monster-quiz.html',
    'abilitypoint/index.html', 'abilitypoint/index2.html', 'ability-db.html',
    'lMfdb-index-20-23.html',
  ]);
  const collect = (dir, out) => {
    for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (/^(\.|node_modules$|_cms$|monster$|assist-cards$|assist-abilities$)/.test(entry.name)) continue;
        collect(rel, out);
      } else if (entry.name.endsWith('.html')) out.push(rel);
    }
    return out;
  };
  const targets = collect('', []).filter(rel => !EXEMPT.has(rel));
  const missing = [];
  const duplicated = [];
  const outsideHead = [];
  for (const rel of targets) {
    const html = read(rel);
    const hits = (html.match(new RegExp(GTM_ID, 'g')) || []).length;
    if (hits === 0) { missing.push(rel); continue; }
    if (hits > 1) { duplicated.push(rel); continue; }
    const headEnd = html.search(/<\/head>/i);
    if (headEnd === -1 || html.indexOf(GTM_ID) > headEnd) outsideHead.push(rel);
  }
  if (missing.length) ng(`GTMタグが無いページ ${missing.length}件: ${missing.slice(0, 5).join(', ')}`);
  else ok(`公開HTML ${targets.length}件すべてにGTMタグ（${GTM_ID}）あり`);
  if (duplicated.length) ng(`GTMタグが重複するページ ${duplicated.length}件: ${duplicated.slice(0, 5).join(', ')}`);
  else ok('GTMタグの二重計測なし（全ページ1回のみ）');
  if (outsideHead.length) ng(`GTMタグが<head>外にあるページ ${outsideHead.length}件: ${outsideHead.slice(0, 5).join(', ')}`);
  else ok('GTMタグはすべて<head>内');
  // GA4測定IDはGTM管理画面で設定する。サイト側へ直書きすると二重計測になる
  const gaHardcoded = targets.filter(rel => /G-J6STLRQ032|www\.googletagmanager\.com\/gtag\/js/.test(read(rel)));
  if (gaHardcoded.length) ng(`GA4測定IDまたはgtag.jsが直書きされている ${gaHardcoded.length}件: ${gaHardcoded.slice(0, 5).join(', ')}`);
  else ok('GA4測定ID・gtag.jsの直書きなし（GTM経由のみ）');
}

// ---------------------------------------------------------------- 結果
console.log('\n' + '-'.repeat(50));
console.log(`PASS ${pass} / FAIL ${fail} / WARN ${warn} / SKIP ${skip}`);
if (fail) {
  console.log('\n★ FAIL があります。コミットしないでください。');
  console.log('  意図した変更の場合は AGENTS.md を確認し、必要ならロックを更新してください。');
  process.exit(1);
}
console.log('OK');
