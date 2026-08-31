#!/usr/bin/env node
'use strict';

/** P12-20: 新規カード画像のDrive保存・main fallback・公開前検査のmockテスト。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/20_assist.gs'), 'utf8');
const MIME_MARKERS = { 'image/jpeg': 1, 'image/png': 2, 'image/webp': 3 };

class Iterator {
  constructor(items) { this.items = items.slice(); this.index = 0; }
  hasNext() { return this.index < this.items.length; }
  next() { return this.items[this.index++]; }
}

class DriveFile {
  constructor(name, bytes) { this.name = name; this.bytes = bytes; }
  getName() { return this.name; }
  getBlob() { return { getBytes: () => this.bytes.slice() }; }
}

class Folder {
  constructor(files) { this.files = files; }
  getFiles() { return new Iterator(this.files); }
  getFilesByName(name) { return new Iterator(this.files.filter(file => file.getName() === name)); }
}

function makeHarness(options = {}) {
  const files = (options.files || []).map(file => new DriveFile(file.name, file.bytes));
  const folder = new Folder(files);
  const mainCodes = options.mainCodes || {};
  const calls = { fetch: [], fetchAll: [] };
  const context = {
    console, JSON, Number, Object, String, Array, Date, Math, RegExp, Map, Set, isNaN, isFinite,
    optionalProp_(name) {
      assert.strictEqual(name, 'ASSIST_IMAGE_FOLDER_ID');
      return options.folderConfigured === false ? '' : 'folder-id';
    },
    DriveApp: {
      getFolderById(id) { assert.strictEqual(id, 'folder-id'); return folder; },
    },
    UrlFetchApp: {
      fetch(url) {
        calls.fetch.push(url);
        return { getResponseCode: () => mainCodes[url.split('/').pop()] || 404 };
      },
      fetchAll(requests) {
        calls.fetchAll.push(requests.map(request => request.url));
        return requests.map(request => ({ getResponseCode: () => mainCodes[request.url.split('/').pop()] || 404 }));
      },
    },
    isExpectedImage_(bytes, mimeType) { return bytes[0] === MIME_MARKERS[mimeType]; },
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context);
  return { context, calls };
}

function card(cardId, extension = 'jpg') {
  return { cardId, image: `assist-cards/${cardId}.${extension}` };
}

let passed = 0;
function test(label, action) { action(); passed++; console.log(`PASS ${label}`); }

test('main未公開の新規画像を指定Driveから受理する', () => {
  const h = makeHarness({ files: [{ name: 'aab-MR-julia.jpg', bytes: [1, 2, 3] }] });
  h.context.asstValidateImagePath_(card('aab-MR-julia'), true);
  assert.deepStrictEqual(h.calls.fetch, []);
});

test('指定Driveに画像がない既存カードはmainへfallbackする', () => {
  const h = makeHarness({ files: [], mainCodes: { 'a1-MR-existing.jpg': 206 } });
  h.context.asstValidateImagePath_(card('a1-MR-existing'), true);
  assert.strictEqual(h.calls.fetch.length, 1);
});

test('Drive未設定でもmainの既存画像を受理する', () => {
  const h = makeHarness({ folderConfigured: false, mainCodes: { 'a1-MR-existing.jpg': 200 } });
  h.context.asstValidateImagePath_(card('a1-MR-existing'), true);
  assert.strictEqual(h.calls.fetch.length, 1);
});

test('mainと指定Driveの両方にない画像を拒否する', () => {
  const h = makeHarness({ files: [] });
  assert.throws(() => h.context.asstValidateImagePath_(card('aab-MR-julia'), true), /mainまたは指定Drive.*404/);
});

test('指定Drive画像の拡張子と実体が違う場合はmainへfallbackせず拒否する', () => {
  const h = makeHarness({ files: [{ name: 'aab-MR-julia.jpg', bytes: [2, 2, 3] }], mainCodes: { 'aab-MR-julia.jpg': 200 } });
  assert.throws(() => h.context.asstValidateImagePath_(card('aab-MR-julia'), true), /拡張子と画像データ/);
  assert.deepStrictEqual(h.calls.fetch, []);
});

test('指定Driveの同名画像重複を拒否する', () => {
  const h = makeHarness({ files: [
    { name: 'aab-MR-julia.jpg', bytes: [1] },
    { name: 'aab-MR-julia.jpg', bytes: [1] },
  ] });
  assert.throws(() => h.context.asstValidateImagePath_(card('aab-MR-julia'), true), /同名画像が複数/);
});

test('一括検査はDrive新規画像を除外し、main既存画像だけをfetchAllする', () => {
  const cards = [card('aab-MR-julia'), card('a1-MR-existing')];
  const h = makeHarness({
    files: [
      { name: 'aab-MR-julia.jpg', bytes: [1, 2] },
      { name: 'unreferenced.jpg', bytes: [1, 2] },
    ],
    mainCodes: { 'a1-MR-existing.jpg': 200 },
  });
  const inventory = h.context.asstDriveImageInventory_(cards, false);
  assert.deepStrictEqual(Array.from(Object.keys(inventory.byName)), ['aab-MR-julia.jpg']);
  assert.deepStrictEqual(Array.from(inventory.issues), []);
  assert.deepStrictEqual(Array.from(h.context.asstValidateImageFiles_(cards, inventory.byName)), []);
  assert.strictEqual(h.calls.fetchAll.length, 1);
  assert.strictEqual(h.calls.fetchAll[0].length, 1);
  assert.match(h.calls.fetchAll[0][0], /a1-MR-existing\.jpg$/);
});

test('公開用一括検査はDriveフォルダ未設定と規則外ファイルを拒否する', () => {
  const missing = makeHarness({ folderConfigured: false });
  assert.match(missing.context.asstDriveImageInventory_([card('aab-MR-julia')], false).issues[0], /未設定/);
  const invalid = makeHarness({ files: [{ name: 'bad file.jpg', bytes: [1] }] });
  assert.match(invalid.context.asstDriveImageInventory_([card('aab-MR-julia')], false).issues[0], /規則外/);
});

console.log(`OK 新規カード画像フロー ${passed}ケース`);
