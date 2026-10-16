#!/usr/bin/env node
/**
 * sitemap.xml の lastmod（build-spec 5-4）の決め方を確認する。本番ファイルは書き換えない。
 * 中身が変わらないページは何度ビルドしても日付が動かず、変わったページと新しいページだけ今日になること。
 */

const assert = require('assert');
const lib = require('../src/lib/sitemap-lastmod');

const SITE = 'https://line-monster-farm-tetteikouryaku.com';
const page = text => `<!DOCTYPE html><html><head><title>t</title><style>p{color:red}</style></head>`
  + `<body><script>var now = Date.now();</script><!-- note --><p class="a">${text}</p></body></html>`;

// --- 可視テキスト：タグ・属性・空白・script・style・コメントの違いではハッシュが変わらない
assert.strictEqual(lib.visibleText(page('技の一覧（共通16技）')), '技の一覧（共通16技）');
assert.strictEqual(
  lib.contentHash(page('技の一覧')),
  lib.contentHash(page('技の一覧').replace('class="a"', 'class="b"').replace('<p', '\n  <p').replace('Date.now()', '0'))
);
assert.notStrictEqual(lib.contentHash(page('共通16技・専用5技')), lib.contentHash(page('共通16技・専用6技')));

// --- JST の日付：UTC の 15:00 以降は翌日
assert.strictEqual(lib.jstDate('2026-10-16T14:59:59Z'), '2026-10-16');
assert.strictEqual(lib.jstDate('2026-10-16T15:00:00Z'), '2026-10-17');
assert.throws(() => lib.jstDate('not a date'), /日付を解釈できません/);

// --- URL とファイルの対応
assert.strictEqual(lib.locToKey(`${SITE}/`, SITE), '/');
assert.strictEqual(lib.keyToFile('/'), 'index.html');
assert.strictEqual(lib.keyToFile('/monsters/genrei/'), 'monsters/genrei/index.html');
assert.strictEqual(lib.keyToFile('/monsters/genrei/mocchi/1625.html'), 'monsters/genrei/mocchi/1625.html');
assert.throws(() => lib.locToKey('https://example.com/a.html', SITE), /サイト外/);

// --- 日付の更新：据え置き・中身が変わった・新規・外れた
const previous = {
  '/same.html': { lastmod: '2026-09-18', hash: 'aaaa' },
  '/changed.html': { lastmod: '2026-09-18', hash: 'bbbb' },
  '/gone.html': { lastmod: '2026-09-18', hash: 'cccc' },
};
const current = [
  { key: '/same.html', hash: 'aaaa' },
  { key: '/changed.html', hash: 'bbbb2' },
  { key: '/new.html', hash: 'dddd' },
];
const first = lib.updateEntries(previous, current, '2026-10-17');
assert.deepStrictEqual(first.entries, {
  '/same.html': { lastmod: '2026-09-18', hash: 'aaaa' },
  '/changed.html': { lastmod: '2026-10-17', hash: 'bbbb2' },
  '/new.html': { lastmod: '2026-10-17', hash: 'dddd' },
});
assert.deepStrictEqual(first.counts, { kept: 1, changed: 1, added: 1, removed: 1 });

// 翌日にもう一度ビルドしても、中身が同じなら日付は1つも動かない
const second = lib.updateEntries(first.entries, current, '2026-10-18');
assert.deepStrictEqual(second.entries, first.entries);
assert.deepStrictEqual(second.counts, { kept: 3, changed: 0, added: 0, removed: 0 });
assert.throws(() => lib.updateEntries({}, current, '2026/10/18'), /YYYY-MM-DD/);

// --- JSON は書いて読み戻すと同じ（1URL1行）
const json = lib.renderLastmodJson(first.entries);
assert.deepStrictEqual(lib.parseLastmodJson(json), first.entries);
assert.strictEqual(json.split('\n').filter(line => line.includes('"lastmod"')).length, 3);

console.log('test-sitemap-lastmod: OK');
