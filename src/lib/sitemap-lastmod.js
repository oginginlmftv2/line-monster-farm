'use strict';

// sitemap.xml の <lastmod>（build-spec 5-4）。
// 値は「そのページの可視テキストが最後に変わった日（JST）」。ビルド日を一律に入れると
// Google が lastmod を信用しなくなるため、可視テキストのハッシュを src/data/sitemap-lastmod.json に持ち、
// ハッシュが変わったURLだけ日付をビルド日へ進める。git の履歴には頼らない（CI の浅い clone でも同じ値になる）。

const crypto = require('crypto');

const LASTMOD_FILE = 'src/data/sitemap-lastmod.json';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// build.js の visibleChars() と同じ読み方で、数える代わりに文字列を返す。
// script・style・コメント・タグ・空白を除くので、属性や字下げだけの変更では日付が動かない。
function visibleText(html) {
  const withoutInvisible = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const body = withoutInvisible.match(/<body[\s\S]*?<\/body>/i);
  return (body ? body[0] : withoutInvisible)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '');
}

function contentHash(html) {
  return crypto.createHash('sha256').update(visibleText(html), 'utf8').digest('hex').slice(0, 16);
}

// Date・ISO文字列・エポックミリ秒を JST の YYYY-MM-DD にする
function jstDate(value) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error(`日付を解釈できません: ${value}`);
  return new Date(time + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// <loc> の絶対URLを、JSONのキー（ドメインを除いたパス）とリポジトリ内のファイルパスへ分ける
function locToKey(loc, siteUrl) {
  if (!loc.startsWith(`${siteUrl}/`)) throw new Error(`sitemap の URL がサイト外です: ${loc}`);
  return loc.slice(siteUrl.length);
}

function keyToFile(key) {
  const relative = key.replace(/^\//, '');
  return relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative;
}

// previous: 前回の entries（{ key: { lastmod, hash } }）。current: [{ key, hash }]（sitemap の順）。
// ハッシュが同じなら前回の日付を残し、変わった・初めて載るURLだけ today にする。
// sitemap から外れたURLは消す（再掲載されたら、その日を変更日とする）。
function updateEntries(previous, current, today) {
  if (!DATE_PATTERN.test(today)) throw new Error(`today が YYYY-MM-DD ではありません: ${today}`);
  const entries = {};
  const counts = { kept: 0, changed: 0, added: 0, removed: 0 };
  for (const { key, hash } of current) {
    const before = previous[key];
    if (before && before.hash === hash && DATE_PATTERN.test(before.lastmod)) {
      entries[key] = { lastmod: before.lastmod, hash };
      counts.kept++;
    } else {
      entries[key] = { lastmod: today, hash };
      counts[before ? 'changed' : 'added']++;
    }
  }
  counts.removed = Object.keys(previous).filter(key => !(key in entries)).length;
  return { entries, counts };
}

function parseLastmodJson(text) {
  const document = JSON.parse(text);
  if (!document || typeof document.urls !== 'object' || Array.isArray(document.urls)) {
    throw new Error(`${LASTMOD_FILE} の urls がオブジェクトではありません`);
  }
  return document.urls;
}

// 1URL1行で書く（差分がURL単位で読める）
function renderLastmodJson(entries) {
  const rows = Object.entries(entries)
    .map(([key, entry]) => `    ${JSON.stringify(key)}: ${JSON.stringify({ lastmod: entry.lastmod, hash: entry.hash })}`);
  return '{\n'
    + '  "note": "build.js が生成。sitemap.xml の lastmod（可視テキストが最後に変わった日・JST）と可視テキストのハッシュ。手で編集しない（build-spec 5-4）",\n'
    + `  "urls": {\n${rows.join(',\n')}\n  }\n}\n`;
}

module.exports = {
  LASTMOD_FILE,
  DATE_PATTERN,
  visibleText,
  contentHash,
  jstDate,
  locToKey,
  keyToFile,
  updateEntries,
  parseLastmodJson,
  renderLastmodJson,
};
