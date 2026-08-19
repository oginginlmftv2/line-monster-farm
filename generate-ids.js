#!/usr/bin/env node
/**
 * モンスターID生成スクリプト
 *
 * ID書式: 4桁  <主血統2桁><副血統2桁>   例: 0101 = ピクシー×ピクシー
 *
 *   主血統   BLOOD_ORDER の並び順（01〜34）
 *   副血統   同じ番号体系（01〜34）。ただし以下は特殊:
 *              レアモン   50 から登場順（主血統ごとに独立）
 *              ノーブル   80 から（2体目は81…）
 *              ロード種   90 から（2体目は91…）
 *
 *   主血統×副血統の組合せは一意なので、通常ペアは衝突しない。
 *   レアモン／ノーブル／ロード種のみ同一主血統内で複数あり得るため連番。
 *
 * 【正の順序】
 *   1. src/data/sheet-sortorder.json（Googleシート「あつ杯アプリDB」由来・310体）
 *      → ここに載っているIDは確定値。絶対に振り直さない。
 *   2. monsters-data.js（348体・完全なリスト）
 *      → シートに無い分だけ、上記ルールで新規採番する。
 *
 * 【重要】Firestoreの解説データは配列インデックスをキーにしている。
 *   出力の arrayIndex を使って Firestore → ID へ変換すること。
 *   配列順を変更する前に必ずエクスポートを済ませること。
 *
 * 使い方:
 *   node generate-ids.js              生成
 *   node generate-ids.js --table      血統別サマリを表示
 *   node generate-ids.js --new        新規採番分だけ表示
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- 定義
// 主血統の並び順（＝IDの上2桁）。この順序は確定。並べ替え禁止。
const BLOOD_ORDER = [
  'ピクシー', 'ドラゴン', 'ケンタウロス', 'ヘンガー', 'ゴーレム', 'ディノ',
  'デュラハン', 'アローヘッド', 'ライガー', 'ハム', 'ガリ', 'グジラ',
  'ニャー', 'ヒノトリ', 'スエゾー', 'モッチー', 'ジョーカー', 'ネンドロ',
  'ゲル', 'ウンディーネ', 'プラント', 'モノリス', 'ワーム', 'ナーガ',
  'カワズモー', 'キュービ', 'メタルナー', 'ユグドラシル', 'シンリュウ',
  'キジン', 'ゴースト', 'イルミネ', 'アーク', 'ザン',
];

// 副血統のうち、番号が固定枠のもの（開始値）
const SPECIAL_SUB = { 'レアモン': 50, 'ノーブル': 80, 'ロード種': 90 };
const SPECIAL_MAX = { 'レアモン': 79, 'ノーブル': 89, 'ロード種': 99 };

// URL用ローマ字。★は読みの確認が必要なもの
const MON_SLUG = {
  '創造': 'souzou', '幻霊': 'genrei', '魔族': 'mazoku',
  '獣族': 'kemono', '怪物': 'kaibutsu', '無機': 'muki',
};
const BLOOD_SLUG = {
  'ピクシー': 'pixie', 'ドラゴン': 'dragon', 'ケンタウロス': 'centaur',
  'ヘンガー': 'henger', 'ゴーレム': 'golem', 'ディノ': 'dino',
  'デュラハン': 'dullahan', 'アローヘッド': 'arrowhead', 'ライガー': 'liger',
  'ハム': 'hamu', 'ガリ': 'gali', 'グジラ': 'gujira', 'ニャー': 'nyaa',
  'ヒノトリ': 'hinotori', 'スエゾー': 'suezo', 'モッチー': 'mocchi',
  'ジョーカー': 'joker', 'ネンドロ': 'nendoro', 'ゲル': 'gel',
  'ウンディーネ': 'undine', 'プラント': 'plant', 'モノリス': 'monolith',
  'ワーム': 'worm', 'ナーガ': 'naga', 'カワズモー': 'kawazumo',
  'キュービ': 'kyubi', 'メタルナー': 'metalner', 'ユグドラシル': 'yggdrasil',
  'シンリュウ': 'shinryu', 'キジン': 'kijin', 'ゴースト': 'ghost',
  'イルミネ': 'illumine', 'アーク': 'arc', 'ザン': 'zan',
};

const BLOOD_NO = Object.fromEntries(BLOOD_ORDER.map((b, i) => [b, i + 1]));
const pad2 = n => String(n).padStart(2, '0');
const norm = s => (s === 'ロード' ? 'ロード種' : s);

// ---------------------------------------------------------------- 読み込み
const REPO = process.cwd();
const SHEET = path.join(REPO, 'src', 'data', 'sheet-sortorder.json');
const OUT = path.join(REPO, 'src', 'data', 'monster-ids.json');

const monstersData = eval(
  fs.readFileSync(path.join(REPO, 'monsters-data.js'), 'utf8') + '\n; monstersData'
);

let fixed = new Map();   // name -> sortOrder（シート由来の確定値）
if (fs.existsSync(SHEET)) {
  for (const r of JSON.parse(fs.readFileSync(SHEET, 'utf8')).monsters) {
    fixed.set(r.name, r.sortOrder);
  }
  console.log(`確定ID読み込み: ${fixed.size}体（src/data/sheet-sortorder.json）`);
} else {
  console.warn('⚠ sheet-sortorder.json がありません。全件を新規採番します。');
}

// ---------------------------------------------------------------- 検証
const errs = [];
for (const m of monstersData) {
  if (!BLOOD_NO[m.mainMon]) errs.push(`主血統が未定義: ${m.mainMon} (${m.name})`);
  const sub = norm(m.subMon);
  if (!BLOOD_NO[sub] && !SPECIAL_SUB[sub]) errs.push(`副血統が未定義: ${sub} (${m.name})`);
  if (!MON_SLUG[m.mon]) errs.push(`モン類が未定義: ${m.mon} (${m.name})`);
}
if (errs.length) { errs.forEach(e => console.error('ERROR ' + e)); process.exit(1); }

// ---------------------------------------------------------------- 採番
// 使用済みの下2桁を主血統ごとに記録（確定分を先に埋める）
const used = {};                       // mainBlood -> Set(下2桁)
const take = (main, lo) => (used[main] = used[main] || new Set()).add(lo);
for (const m of monstersData) {
  const so = fixed.get(m.name);
  if (so != null) take(m.mainMon, so % 100);
}

// 新規採番は gwImg 昇順（＝ゲーム実装順）で行う
const pending = monstersData
  .map((m, i) => ({ ...m, arrayIndex: i }))
  .filter(m => fixed.get(m.name) == null)
  .sort((a, b) => {
    if (a.gwImg == null && b.gwImg == null) return a.arrayIndex - b.arrayIndex;
    if (a.gwImg == null) return 1;
    if (b.gwImg == null) return -1;
    return a.gwImg - b.gwImg;
  });

const assigned = new Map();
for (const m of pending) {
  const sub = norm(m.subMon);
  const set = (used[m.mainMon] = used[m.mainMon] || new Set());
  let lo;
  if (SPECIAL_SUB[sub]) {
    lo = SPECIAL_SUB[sub];
    while (set.has(lo)) lo++;
    if (lo > SPECIAL_MAX[sub]) {
      console.error(`ERROR ${m.mainMon}×${sub} の枠が上限を超えました (${m.name})`);
      process.exit(1);
    }
  } else {
    lo = BLOOD_NO[sub];
    if (set.has(lo)) {
      console.error(`ERROR 通常ペアが重複: ${m.mainMon}×${sub} (${m.name})`);
      console.error('  この組合せは一意である前提です。データを確認してください。');
      process.exit(1);
    }
  }
  set.add(lo);
  assigned.set(m.name, BLOOD_NO[m.mainMon] * 100 + lo);
}

// ---------------------------------------------------------------- 出力データ
const result = monstersData.map((m, i) => {
  const so = fixed.get(m.name) ?? assigned.get(m.name);
  const id = pad2(Math.floor(so / 100)) + pad2(so % 100);
  const monSlug = MON_SLUG[m.mon], bloodSlug = BLOOD_SLUG[m.mainMon];
  return {
    id,
    sortOrder: so,
    isNew: !fixed.has(m.name),
    name: m.name,
    arrayIndex: i,                       // ★Firestore docId
    mon: m.mon, monSlug,
    blood: m.mainMon, bloodSlug,
    subBlood: norm(m.subMon),
    aura: m.aura,
    limited: !!m.limited,
    limitedLabel: m.limitedLabel || '',
    gwImg: m.gwImg ?? null,
    localImg: m.localImg ?? null,
    url: `/monsters/${monSlug}/${bloodSlug}/${id}.html`,
    image: `img/monster/${id}.jpg`,
  };
}).sort((a, b) => a.sortOrder - b.sortOrder);

// 衝突の最終確認
const seen = new Set();
for (const r of result) {
  if (seen.has(r.id)) { console.error(`ERROR ID重複: ${r.id} (${r.name})`); process.exit(1); }
  seen.add(r.id);
}

// ---------------------------------------------------------------- 表示
if (process.argv.includes('--new')) {
  const news = result.filter(r => r.isNew);
  console.log(`\n新規採番 ${news.length}体:`);
  news.forEach(r => console.log(`  ${r.id}  ${r.name.padEnd(14)} ${r.blood}×${r.subBlood}`));
  process.exit(0);
}
if (process.argv.includes('--table')) {
  console.log();
  for (const b of BLOOD_ORDER) {
    const list = result.filter(r => r.blood === b);
    if (!list.length) continue;
    const n = pad2(BLOOD_NO[b]);
    console.log(`${n} ${b.padEnd(8)} ${BLOOD_SLUG[b].padEnd(10)} ${String(list.length).padStart(2)}体  ` +
      `${list[0].id}〜${list[list.length - 1].id}  [${list[0].mon}]  新規:${list.filter(r => r.isNew).length}`);
  }
  console.log(`\n合計 ${result.length}体 / ${BLOOD_ORDER.length}血統 / 新規採番 ${result.filter(r => r.isNew).length}体`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  note: 'IDは不変。sheet-sortorder.json の値は確定値であり振り直さない。arrayIndex は Firestore の docId。',
  bloodOrder: BLOOD_ORDER,
  monSlug: MON_SLUG,
  bloodSlug: BLOOD_SLUG,
  specialSub: SPECIAL_SUB,
  count: result.length,
  monsters: result,
}, null, 1), 'utf8');

console.log(`生成: ${OUT}`);
console.log(`  ${result.length}体（確定 ${result.length - result.filter(r => r.isNew).length} / 新規採番 ${result.filter(r => r.isNew).length}）`);
console.log(`  新規分の確認:  node generate-ids.js --new`);
