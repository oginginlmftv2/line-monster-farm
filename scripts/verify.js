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
    const sourceIdSet = new Set(sourceIds);
    const databaseIdSet = new Set(databaseIds);
    const missingIds = sourceIds.filter(cardId => !databaseIdSet.has(cardId));
    const unexpectedIds = databaseIds.filter(cardId => !sourceIdSet.has(cardId));
    const duplicateIds = databaseIds.filter((cardId, index) => databaseIds.indexOf(cardId) !== index);

    if (cards.length !== sourceIds.length || databaseIdSet.size !== sourceIdSet.size
        || missingIds.length || unexpectedIds.length || duplicateIds.length) {
      ng(`assist-cards.jsonのcardId集合が不一致（DB ${cards.length}件 / 入力 ${sourceIds.length}件 / 欠落 ${missingIds.length}件 / 余分 ${unexpectedIds.length}件 / 重複 ${duplicateIds.length}件）`);
    } else {
      ok(`assist-cards.jsonのcardId集合がcards-data.jsと完全一致（${cards.length}件）`);
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
    if (!Array.isArray(abilitiesDatabase.abilities)) {
      throw new Error('abilitiesが配列ではありません');
    }
    const abilities = abilitiesDatabase.abilities;
    const cardIds = new Set(Array.isArray(assistCards.cards)
      ? assistCards.cards.map(card => card.cardId) : []);

    const abilityIds = abilities.map(ability => ability.abilityId);
    const duplicateAbilityIds = abilityIds
      .filter((abilityId, index) => abilityIds.indexOf(abilityId) !== index);
    if (duplicateAbilityIds.length) {
      ng(`assist-abilities.jsonのabilityIdが重複: ${[...new Set(duplicateAbilityIds)].slice(0, 5).join(', ')}`);
    } else {
      ok(`assist-abilities.jsonのabilityIdはファイル全体で一意（${abilityIds.length}件）`);
    }

    const legacyIds = abilities.map(ability => ability.legacyId);
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

    const allowedSources = new Set(['イベント', '閃き', 'EXトレ']);
    const invalidSources = abilities.filter(ability => !allowedSources.has(ability.source));
    if (invalidSources.length) {
      ng(`assist-abilities.jsonに許可外sourceがある: ${invalidSources.slice(0, 5).map(ability => `${ability.abilityId}=${String(ability.source)}`).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのsourceはすべて許可値');
    }

    const emptySourceNames = abilities
      .filter(ability => typeof ability.sourceName !== 'string' || ability.sourceName.length === 0);
    if (emptySourceNames.length) {
      ng(`assist-abilities.jsonのsourceNameが空: ${emptySourceNames.slice(0, 5).map(ability => ability.abilityId).join(', ')}`);
    } else {
      ok('assist-abilities.jsonのsourceNameは全件非空');
    }

    const expectedSortOrderByCard = new Map();
    const invalidSortOrders = [];
    for (const ability of abilities) {
      if (ability.linkStatus === 'resolved') {
        const expected = (expectedSortOrderByCard.get(ability.cardId) || 0) + 1;
        expectedSortOrderByCard.set(ability.cardId, expected);
        if (ability.sortOrder !== expected) invalidSortOrders.push(ability.abilityId);
      } else if (ability.sortOrder !== null) {
        invalidSortOrders.push(ability.abilityId);
      }
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
      if (ability.linkStatus !== 'resolved') continue;
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
      const actualAbilityCount = (html.match(/<article class="assist-ability-card">/g) || []).length;
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
  } catch (error) {
    ng(`静的アシストカード詳細の検査に失敗: ${error.message}`);
  }
}

// ---------------------------------------------------------------- 15
head('15. アシストCMS test境界');
if (!exists('_cms/assist-gas/コード.gs') || !exists('_cms/assist-gas/index.html')) {
  ng('アシストCMSの必須ソースがない');
} else {
  try {
    const { validateRoot } = require('./verify-assist-cms');
    const assistCmsIssues = validateRoot(REPO);
    if (assistCmsIssues.length) {
      ng(`アシストCMS検査FAIL ${assistCmsIssues.length}件: ${assistCmsIssues.slice(0, 5).join(', ')}`);
    } else {
      ok('アシストCMSはtest専用境界を維持し、3DB構造と編集APIが整合');
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

// ---------------------------------------------------------------- 結果
console.log('\n' + '-'.repeat(50));
console.log(`PASS ${pass} / FAIL ${fail} / WARN ${warn} / SKIP ${skip}`);
if (fail) {
  console.log('\n★ FAIL があります。コミットしないでください。');
  console.log('  意図した変更の場合は AGENTS.md を確認し、必要ならロックを更新してください。');
  process.exit(1);
}
console.log('OK');
