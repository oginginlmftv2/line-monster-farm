#!/usr/bin/env node
/**
 * モンスター基礎データの評価式・検証・TSV取り込みを確認する。本番DBは書き換えない。
 * 評価式の期待値は docs/monster-basics-design.md の較正表（2026-09-17・6体）と一致させる。
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const lib = require('../src/lib/monster-basics');
const importer = require('./import-monster-basics-tsv');

const repo = path.resolve(__dirname, '..');
const idsJson = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/monster-ids.json'), 'utf8'));
const byName = name => idsJson.monsters.find(monster => monster.name === name);

const terrain = s => Object.fromEntries(lib.TERRAINS.map((name, i) => [name, s[i]]));
const range = s => Object.fromEntries(lib.RANGES.map((field, i) => [field.key, s[i]]));

// --- 評価式：較正した6体と境界値
const calibration = [
  ['タマモノマエ', 'EBEBA', 3.5, 'DAAB', 4.2],
  ['ヴァナルガンド', 'DADDA', 3.4, 'ACBB', 4.3],
  ['ティターニア', 'DBBBD', 3.7, 'ABBC', 4.3],
  ['フウマ', 'CADDB', 3.5, 'BBCA', 4.3],
  ['ワルキューレ', 'BDDBB', 3.7, 'BBBB', 4.5],
  ['メレンゲ', 'CFDBB', 3.2, 'BDBD', 3.5],
];
for (const [name, t, tScore, r, rScore] of calibration) {
  assert.strictEqual(lib.scoreTerrain(terrain(t)), tScore, `${name} 地形`);
  assert.strictEqual(lib.scoreRange(range(r)), rScore, `${name} 間合い`);
}
assert.strictEqual(lib.scoreRange(range('SSSS')), 5.0, '全Sは満点');
assert.strictEqual(lib.scoreRange(range('AAAA')), 4.8);
assert.strictEqual(lib.scoreRange(range('BBBB')), 4.5);
assert.strictEqual(lib.scoreRange(range('CCCC')), 3.0);
assert.strictEqual(lib.scoreRange(range('DDDD')), 2.0);
assert.strictEqual(lib.scoreTerrain(terrain('SSSSS')), 5.0);
assert(lib.scoreRange(range('SABD')) > lib.scoreRange(range('AABD')), 'SはAより上');
assert.strictEqual(lib.scoreRange(range('BBB')), null, '欠けていれば null');
assert.strictEqual(lib.scoreRange(range('BBBX')), null, 'ランク外は null');
assert.strictEqual(lib.scoreTerrain(null), null);

// --- 得意・苦手
{
  const { strong, weak } = lib.classifyRanks(lib.terrainEntries(terrain('CFDBB')));
  assert.deepStrictEqual(strong.map(e => e.label), ['雪山', '火山']);
  assert.deepStrictEqual(weak.map(e => e.label), ['森林', '海岸']);
  const all = lib.classifyRanks(lib.rangeEntries(range('BBBB')));
  assert.strictEqual(all.strong.length, 4);
  assert.strictEqual(all.weak.length, 0);
  const mid = lib.classifyRanks(lib.rangeEntries(range('CCCC')));
  assert.strictEqual(mid.strong.length + mid.weak.length, 0, 'Cはどちらでもない');
}

// --- 素質
{
  const summary = lib.summarizeTalent({ life: 0, power: -5, wisdom: 10, accuracy: 20, evasion: 5, defense: -5 });
  assert.strictEqual(summary.total, 25);
  assert.deepStrictEqual(summary.best.map(e => e.label), ['命中']);
  const tie = lib.summarizeTalent({ life: 10, power: 10, wisdom: 0, accuracy: 0, evasion: 0, defense: 0 });
  assert.deepStrictEqual(tie.best.map(e => e.label), ['ライフ', 'ちから'], '同率は併記');
  assert.strictEqual(lib.formatPercent(0), '0%');
  assert.strictEqual(lib.formatPercent(20), '+20%');
  assert.strictEqual(lib.formatPercent(-5), '-5%');
}

// --- 検証
const merengue = byName('メレンゲ');
const valid = () => ({
  schemaVersion: 1,
  monsters: [{
    id: merengue.id, name: 'メレンゲ',
    talent: { life: 0, power: -5, wisdom: 10, accuracy: 20, evasion: 5, defense: -5 },
    gutsRecovery: 'A', moveSpeed: 'B', growthType: 'ふつう', goodEvil: 'ややヨイ', size: '小さい',
    terrain: terrain('CFDBB'), range: range('BDBD'), capturedAt: '2026-09-17',
  }],
});
assert.deepStrictEqual(lib.validateMonsterBasics(valid(), idsJson), []);
const broken = (mutate, needle) => {
  const db = valid();
  mutate(db);
  const errors = lib.validateMonsterBasics(db, idsJson);
  assert(errors.some(error => error.includes(needle)), `期待したエラーが出ない: ${needle}\n${errors.join('\n')}`);
};
broken(db => { db.monsters[0].id = '9999'; }, '無いID');
broken(db => { db.monsters[0].name = 'タマモノマエ'; }, '一致しない');
broken(db => { db.monsters[0].terrain.森林 = 'S+'; }, 'ランク');
broken(db => { db.monsters[0].range.zero = 'B+'; }, 'ランク');
broken(db => { db.monsters[0].size = '大きめ'; }, '列挙外');
broken(db => { db.monsters[0].growthType = '早熟'; }, '列挙外');
broken(db => { delete db.monsters[0].talent.defense; }, 'talent.defense');
broken(db => { db.monsters[0].talent.life = '+5%'; }, '整数％');
broken(db => { db.monsters[0].terrain.草原 = 'A'; }, '未知の地形');
broken(db => { db.monsters[0].talentX = 1; }, '未知の項目');
broken(db => { db.monsters[0].capturedAt = '2026/09/17'; }, 'capturedAt');
broken(db => { db.monsters.push({ ...valid().monsters[0] }); }, '重複ID');
broken(db => {
  const other = byName('タマモノマエ');
  db.monsters.push({ id: other.id, name: other.name, range: range('DAAB'), capturedAt: '2026-09-17' }); // 2690 < 3151 なので末尾は昇順違反
}, 'ID昇順');
broken(db => { db.monsters[0] = { id: merengue.id, name: 'メレンゲ', capturedAt: '2026-09-17' }; }, '項目が1つもない');

// --- TSV取り込み
{
  const header = importer.EXPECTED_HEADER;
  const row = values => {
    const record = { _file: 'test.tsv', _line: 2 };
    header.forEach((key, i) => { record[key] = values[i] || ''; });
    return record;
  };
  const full = ['メレンゲ', '0', '-5%', '+10', '20%', '5', '-5', 'A', 'B', 'ふつう', 'ややヨイ', '小さい', 'C', 'F', 'D', 'B', 'B', 'B', 'D', 'B', 'D', '2026-09-17'];
  let errors = [];
  const converted = importer.rowToEntry(row(full), merengue.bloodSlug, idsJson, errors);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(converted.id, merengue.id);
  assert.deepStrictEqual(converted.entry.talent, { life: 0, power: -5, wisdom: 10, accuracy: 20, evasion: 5, defense: -5 }, '％と符号は正規化');
  assert.deepStrictEqual(converted.entry.terrain, terrain('CFDBB'));
  assert.deepStrictEqual(converted.entry.range, range('BDBD'));

  errors = [];
  importer.rowToEntry(row(full), 'kyubi', idsJson, errors);
  assert(errors.some(e => e.includes('ゴースト種')), '別血統のファイルに書いたらFAIL');

  errors = [];
  const partial = [...full]; partial[12] = '';
  importer.rowToEntry(row(partial), merengue.bloodSlug, idsJson, errors);
  assert(errors.some(e => e.includes('地形適性は5項目')), '地形の一部欠けはFAIL');

  errors = [];
  const aptitudeOnly = ['メレンゲ', '', '', '', '', '', '', '', '', '', '', '', 'C', 'F', 'D', 'B', 'B', 'B', 'D', 'B', 'D', '2026-09-17'];
  const apt = importer.rowToEntry(row(aptitudeOnly), merengue.bloodSlug, idsJson, errors);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(apt.entry.talent, undefined, '素質が全部空なら項目を作らない');
  assert.strictEqual(apt.entry.gutsRecovery, undefined);

  errors = [];
  importer.rowToEntry(row(['ボブ']), 'ghost', idsJson, errors);
  assert(errors.some(e => e.includes('見つからない')));

  // 本番の _source を再生成しても現在のDBと一致する（手編集されていない）
  const rebuilt = importer.buildDb(importer.collectSourceFiles(), idsJson);
  assert.deepStrictEqual(rebuilt.errors, []);
  const current = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/monster-basics.json'), 'utf8'));
  assert.deepStrictEqual(rebuilt.db, current, 'monster-basics.json はTSVから再生成した結果と一致すること');
}

console.log('test-monster-basics: OK');
