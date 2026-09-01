#!/usr/bin/env node
/**
 * 旧URL（monsters/monster.html?id=N）だけを載せた一時サイトマップを生成する。
 *
 * 目的は再クロールの誘発である。旧URLはsitemap.xmlにも内部リンクにも無いため
 * Googleが再訪せず、初期HTMLのnoindexが読まれないままインデックスに残っている。
 * lastmod付きで一覧を出し、GSCへ手動送信して再クロールさせる。
 *
 * この仕組みは一時的なものである。撤去手順は docs/legacy-url-sitemap-runbook.md 。
 *
 * - build.js からは呼ばない。手動実行のみ。
 * - 出力する sitemap-legacy.xml は sitemap.xml に混ぜない。
 * - robots.txt には Sitemap: 行を追加しない（GSCへの手動送信だけで運用する）。
 *
 *   node scripts/gen-legacy-sitemap.js
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SITE_URL = 'https://line-monster-farm-tetteikouryaku.com';
const OUTPUT = 'sitemap-legacy.xml';

// build.js と同じ読み方。monsters-data.js はCMS管理対象なので読むだけ。
function readScriptValue(relativePath, variableName) {
  const source = fs.readFileSync(path.join(REPO, relativePath), 'utf8');
  return Function(`${source}\n;return ${variableName};`)();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const monstersData = readScriptValue('monsters-data.js', 'monstersData');
if (!Array.isArray(monstersData) || monstersData.length === 0) {
  console.error('monsters-data.js から monstersData を読めない');
  process.exit(1);
}

// 旧URLの id は monstersData の配列インデックス（monsters/monster.html と
// monsters/redirect-map.js が同じ規則）。連番を決め打ちせず配列から導く。
const today = new Date().toISOString().slice(0, 10);
const urls = monstersData.map((_monster, arrayIndex) =>
  `${SITE_URL}/monsters/monster.html?id=${arrayIndex}`);

const body = urls.map(url => `  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${today}</lastmod>
  </url>`).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

fs.writeFileSync(path.join(REPO, OUTPUT), xml);
console.log(`${OUTPUT} を生成: ${urls.length}件（lastmod ${today}）`);
