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

  const RESERVED = ['main', 'master', 'gh-pages', 'HEAD'];
  const PATTERN = /^(feat|fix|chore|content|refactor)\/(p\d+(-\d+)?)-[a-z0-9-]+$/;

  if (!branch) sk('ブランチを取得できない');
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
  const gasRelativeDir = '_cms/gas';
  const gasDir = path.join(REPO, gasRelativeDir);
  const requiredGasFiles = ['コード.gs', 'index.html'];
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
              type: pattern.name,
            });
          }
        }
      });
    }
  };

  if (!fs.existsSync(gasDir)) {
    ng(`GitHubトークン検査対象の ${gasRelativeDir} がない`);
  } else {
    const missingGasFiles = requiredGasFiles.filter(file => !fs.existsSync(path.join(gasDir, file)));
    if (missingGasFiles.length) {
      ng(`GAS基準ファイルがない: ${missingGasFiles.map(file => `${gasRelativeDir}/${file}`).join(', ')}`);
    }
    scanGitHubTokens(gasDir);
    if (tokenHits.length) {
      ng('GitHubトークンらしき文字列がある: '
        + tokenHits.map(hit => `${hit.file}:${hit.line}（${hit.type}）`).join(', '));
    } else if (!missingGasFiles.length) {
      ok(`${gasRelativeDir} の必須2ファイルにGitHubトークンらしき文字列なし`);
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

// ---------------------------------------------------------------- 結果
console.log('\n' + '-'.repeat(50));
console.log(`PASS ${pass} / FAIL ${fail} / WARN ${warn} / SKIP ${skip}`);
if (fail) {
  console.log('\n★ FAIL があります。コミットしないでください。');
  console.log('  意図した変更の場合は AGENTS.md を確認し、必要ならロックを更新してください。');
  process.exit(1);
}
console.log('OK');
