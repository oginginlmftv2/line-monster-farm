#!/usr/bin/env node
/**
 * P2-1 / P2-2 / P2-3 / P4-1  Firestore エクスポータ
 *
 *   node tools/export-firestore.js           照合レポートのみ（既定・ファイルを書かない）
 *   node tools/export-firestore.js --write   src/data/*.json を生成
 *
 * ★このスクリプトは Firestore に対して読み取り（GET）しか行わない。
 *   PATCH / POST / DELETE / commit を一切含まないこと。
 *
 * 依存パッケージなし。Node 18+ の標準 fetch と fs のみ。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'line-monster-farm';
const API_KEY = 'AIzaSyDQ7JiSAs8wozZPoh4esXnYjOPvexcMfKs';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const REPO = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
const TODAY = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ 取得（読み取り専用）

async function getJson(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`GET failed ${res.status} ${res.statusText}\n${await res.text()}`);
  }
  return res.json();
}

async function fetchCollection(name) {
  const docs = [];
  let pageToken = '';
  for (;;) {
    let url = `${BASE}/${encodeURIComponent(name)}?key=${API_KEY}&pageSize=300`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const json = await getJson(url);
    for (const d of json.documents || []) docs.push(d);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return docs;
}

async function fetchDocument(collection, docId) {
  const url = `${BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}?key=${API_KEY}`;
  return getJson(url);
}

// ------------------------------------------------------------------ 値のデコード

function decodeValue(v) {
  if (v === null || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return v;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

function docIdOf(doc) {
  return String(doc.name || '').split('/').pop();
}

function decodeDoc(doc) {
  return { id: docIdOf(doc), data: decodeFields(doc.fields || {}) };
}

// ------------------------------------------------------------------ 補助

function strlen(s) { return typeof s === 'string' ? s.length : 0; }
function oneLine(s, n) {
  const t = String(s || '').replace(/\r?\n/g, '/');
  return t.length > n ? t.slice(0, n) : t;
}
function pad(s, w) {
  s = String(s);
  let width = 0;
  for (const ch of s) width += /[　-ヿ一-鿿＀-｠]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, w - width));
}
function table(headers, rows) {
  const widths = headers.map((h, i) => {
    const cells = [h, ...rows.map(r => String(r[i]))];
    return Math.max(...cells.map(c => {
      let w = 0;
      for (const ch of c) w += /[　-ヿ一-鿿＀-｠]/.test(ch) ? 2 : 1;
      return w;
    }));
  });
  const line = headers.map((h, i) => pad(h, widths[i])).join('  ');
  console.log('  ' + line);
  console.log('  ' + widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log('  ' + r.map((c, i) => pad(c, widths[i])).join('  '));
}
function stats(lengths) {
  if (!lengths.length) return null;
  const sorted = [...lengths].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mid = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const bucket = { '<100': 0, '100-299': 0, '300-499': 0, '500-999': 0, '>=1000': 0 };
  for (const n of sorted) {
    if (n < 100) bucket['<100']++;
    else if (n < 300) bucket['100-299']++;
    else if (n < 500) bucket['300-499']++;
    else if (n < 1000) bucket['500-999']++;
    else bucket['>=1000']++;
  }
  return {
    count: sorted.length, sum, avg: Math.round(sum / sorted.length * 10) / 10,
    min: sorted[0], max: sorted[sorted.length - 1], median: mid, bucket,
  };
}
function printStats(label, s) {
  if (!s) { console.log(`  ${label}: データなし`); return; }
  console.log(`  ${label}: 件数 ${s.count} / 合計 ${s.sum}字 / 平均 ${s.avg} / 最小 ${s.min} / 最大 ${s.max} / 中央値 ${s.median}`);
  console.log(`            100字未満 ${s.bucket['<100']} / 100〜299 ${s.bucket['100-299']} / 300〜499 ${s.bucket['300-499']} / 500〜999 ${s.bucket['500-999']} / 1000字以上 ${s.bucket['>=1000']}`);
}


// JSON のキー順を確実に保つためのシリアライザ。
// JS のオブジェクトは "1380" のような整数扱いのキーを先頭に繰り上げるため、
// JSON.stringify に任せると "0120" が後ろへ回り ID昇順にならない。
function serialize(meta, mapKey, entries) {
  const body = entries.map(([k, v]) => {
    const val = JSON.stringify(v, null, 2).split('\n').join('\n    ');
    return `    ${JSON.stringify(k)}: ${val}`;
  }).join(',\n');
  const head = Object.entries(meta)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `{\n${head},\n  ${JSON.stringify(mapKey)}: {\n${body}\n  }\n}\n`;
}

// ------------------------------------------------------------------ ID変換

const idsJson = JSON.parse(fs.readFileSync(path.join(REPO, 'src/data/monster-ids.json'), 'utf8'));
const byArrayIndex = new Map();
for (const m of idsJson.monsters) byArrayIndex.set(String(m.arrayIndex), m);

// ------------------------------------------------------------------ 本体

async function main() {
  console.log('='.repeat(78));
  console.log(`Firestore エクスポート  ${WRITE ? '【--write】JSONを生成します' : '【ドライラン】ファイルは書きません'}`);
  console.log('='.repeat(78));

  const [monsterDocs, cardDocs] = await Promise.all([
    fetchCollection('monsters'),
    fetchCollection('cards'),
  ]);
  const imagesDoc = await fetchDocument('monsterImages', 'assignments');

  const monsters = monsterDocs.map(decodeDoc);
  const cards = cardDocs.map(decodeDoc);
  const imagesTop = decodeFields(imagesDoc.fields || {});
  // 仕様書の想定は { assignments: {...} }。実データは割り当てがトップレベルに直接並ぶ。
  const assignments = (imagesTop.assignments && typeof imagesTop.assignments === 'object')
    ? imagesTop.assignments
    : imagesTop;
  const assignmentsAtTopLevel = !(imagesTop.assignments && typeof imagesTop.assignments === 'object');

  // ---------------------------------------------------------- 1-1 取得件数
  console.log('\n■ 1-1. 取得件数');
  const monWithExp = monsters.filter(m => strlen(m.data.explanation) > 0);
  const cardWithExp = cards.filter(c => strlen(c.data.explanation) > 0);
  const assignEntries = assignments && typeof assignments === 'object' && !Array.isArray(assignments)
    ? Object.entries(assignments) : [];
  console.log(`  monsters:      取得 ${monsters.length}件（うち explanation あり ${monWithExp.length}件）`);
  console.log(`  cards:         取得 ${cards.length}件（うち explanation あり ${cardWithExp.length}件）`);
  console.log(`  monsterImages: assignments の割り当て ${assignEntries.length}件`);
  console.log(`  期待値: monsters 93 / cards 90（解説あり85）/ monsterImages 332`);

  // ---------------------------------------------------------- 1-2 実証テスト
  console.log('\n■ 1-2. ★変換の実証テスト（arrayIndex 334 / ニャハト）');
  const localSrc = fs.readFileSync(path.join(REPO, 'monsters-data.js'), 'utf8');
  const localArr = (new Function(`${localSrc}\n; return monstersData;`))();
  const local334 = localArr[334];
  const fs334 = monsters.find(m => m.id === '334');
  const map334 = byArrayIndex.get('334');
  console.log(`  monsters-data.js (arrayIndex 334): 名前 = ${local334 && local334.name}`);
  console.log('  ---- 全文 ----');
  console.log(String((local334 && local334.explanation) || '(なし)'));
  console.log('  --------------');
  console.log(`  Firestore        (docId 334):`);
  console.log('  ---- 全文 ----');
  console.log(String((fs334 && fs334.data.explanation) || '(なし)'));
  console.log('  --------------');
  console.log(`  変換後のID: ${map334 ? map334.id : '(未解決)'} / 名前: ${map334 ? map334.name : '-'}`);

  const norm = t => String(t || '').replace(/\s/g, '').replace(/[・･\u30fb]/g, '');
  const a = norm(local334 && local334.explanation);
  const b = norm(fs334 && fs334.data.explanation);
  const same = a && b && (a === b || a.includes(b.slice(0, 30)) || b.includes(a.slice(0, 30)));
  console.log(`  判定: ${same ? '一致（変換は健全）' : '★不一致 — 内容を目視してください'}`);
  if (!same) {
    console.log('\n  ★★ 実証テストが一致しませんでした。ここで停止します。 ★★');
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------- 変換
  const resolved = [];   // {id, name, mon, blood, arrayIndex, data}
  const unresolvedMonsters = [];
  for (const m of monsters) {
    const map = byArrayIndex.get(m.id);
    if (!map) { unresolvedMonsters.push(m.id); continue; }
    resolved.push({ ...map, doc: m });
  }

  // ---------------------------------------------------------- 1-3 照合サンプル
  console.log('\n■ 1-3. ★照合サンプル一覧（モンスター名と解説の内容が合っているかを目視）');
  const withExp = resolved.filter(r => strlen(r.doc.data.explanation) > 0);
  const picked = [];
  const pick = r => { if (r && !picked.some(p => p.id === r.id)) picked.push(r); };
  const byLen = [...withExp].sort((x, y) => strlen(y.doc.data.explanation) - strlen(x.doc.data.explanation));
  pick(byLen[0]);                                   // 最長
  pick(byLen[byLen.length - 1]);                    // 最短
  pick(withExp.find(r => r.id === '1380'));         // ニャハト
  const byIdx = [...withExp].sort((x, y) => x.arrayIndex - y.arrayIndex);
  pick(byIdx[0]);                                   // arrayIndex 最小
  pick(byIdx[byIdx.length - 1]);                    // arrayIndex 最大
  for (const mon of ['魔族', '獣族', '幻霊', '無機', '怪物', '創造']) {
    pick(withExp.find(r => r.mon === mon && !picked.some(p => p.id === r.id)));
  }
  for (const r of [...withExp].sort((x, y) => x.id.localeCompare(y.id))) {
    if (picked.length >= 12) break;
    pick(r);
  }
  table(
    ['ID', '名前', '主血統', 'arrayIndex', '字数', '解説の冒頭60字'],
    picked.slice(0, 12).map(r => [
      r.id, r.name, r.blood, r.arrayIndex,
      strlen(r.doc.data.explanation), oneLine(r.doc.data.explanation, 60),
    ]),
  );

  // ---------------------------------------------------------- 1-4 カード
  console.log('\n■ 1-4. カードの照合サンプル（5件）');
  const cardSample = [...cardWithExp].sort((x, y) => x.id.localeCompare(y.id)).slice(0, 5);
  table(
    ['カードID', '字数', '解説の冒頭60字'],
    cardSample.map(c => [c.id, strlen(c.data.explanation), oneLine(c.data.explanation, 60)]),
  );

  // ---------------------------------------------------------- 1-5 monsterImages
  console.log('\n■ 1-5. monsterImages/assignments の構造');
  console.log(`  ドキュメントのトップレベルのキー数: ${Object.keys(imagesTop).length}`);
  console.log(`  \`assignments\` というフィールド: ${assignmentsAtTopLevel ? 'なし（割り当てがトップレベルに直接並んでいる）' : 'あり'}`);
  console.log(`  割り当ての件数: ${assignEntries.length}`);
  console.log('  先頭5件（デコード後の生の形）:');
  for (const [k, v] of assignEntries.slice(0, 5)) {
    console.log(`    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  }
  const keysNumeric = assignEntries.length > 0 && assignEntries.every(([k]) => /^\d+$/.test(k));
  const valsFile = assignEntries.length > 0 && assignEntries.every(([, v]) => typeof v === 'string' && /\.(jpg|jpeg|png|webp)$/i.test(v));
  console.log(`  キーがすべて数値（配列インデックス）か: ${keysNumeric ? 'はい' : 'いいえ'}`);
  console.log(`  値がすべて画像ファイル名か:               ${valsFile ? 'はい' : 'いいえ'}`);

  // 参考情報（変換はしない）：キーをモンスター名として名前解決できるか
  const nameToIds = new Map();
  for (const m of idsJson.monsters) {
    if (!nameToIds.has(m.name)) nameToIds.set(m.name, []);
    nameToIds.get(m.name).push(m);
  }
  const nameHit = assignEntries.filter(([k]) => nameToIds.has(k));
  const nameMiss = assignEntries.filter(([k]) => !nameToIds.has(k)).map(([k]) => k);
  const ambiguous = nameHit.filter(([k]) => nameToIds.get(k).length > 1).map(([k]) => k);

  // キーの形式は2通りを許容する。
  //   byIndex: キー = 配列インデックス（指示書の想定）
  //   byName : キー = モンスター名（実データ。monsters.html:216 も assignments[m.name] で読んでいる）
  // どちらでもない、または名前が1件でも解決できない／同名で一意に定まらない場合は生成しない。
  const imagesKeyMode = keysNumeric ? 'byIndex'
    : (assignEntries.length > 0 && nameMiss.length === 0 && ambiguous.length === 0) ? 'byName'
    : null;
  const imagesStructureOk = valsFile && imagesKeyMode !== null;
  if (!keysNumeric) {
    console.log('\n  ★ 指示書の想定とは異なる構造です（承認済み・byName で変換）。');
    console.log('     想定: キー = 配列インデックス（例 "334"） / 値 = 画像ファイル名');
    console.log(`     実際: キー = モンスター名 / 値 = 画像ファイル名（値の形式は想定どおり: ${valsFile ? 'はい' : 'いいえ'}）`);
    console.log(`     公開ページ monsters.html:216 も \`assignments[m.name]\` と名前で参照しており、`);
    console.log('     このドキュメントは「名前 → ファイル名」の対応表です（壊れたデータではない）。');
    console.log('  名前による突き合わせ結果:');
    console.log(`     monster-ids.json の名前と一致:   ${nameHit.length}件`);
    console.log(`     一致しない名前:                 ${nameMiss.length}件 ${nameMiss.slice(0, 20).join(', ')}${nameMiss.length > 20 ? ' …' : ''}`);
    console.log(`     同名が複数体あり一意に定まらない: ${ambiguous.length}件 ${ambiguous.join(', ')}`);
    console.log(`  → 変換モード: ${imagesStructureOk ? 'byName（名前で一意に解決できるため生成可）' : '生成しない（解決できない名前がある）'}`);
  } else {
    console.log('  → 想定どおり（キー=配列インデックス / 値=画像ファイル名）');
    console.log('  4桁IDへの変換サンプル:');
    for (const [k, v] of assignEntries.slice(0, 5)) {
      const map = byArrayIndex.get(String(k));
      console.log(`    arrayIndex ${k} → ID ${map ? map.id : '(未解決)'} (${map ? map.name : '-'}) : ${v}`);
    }
  }

  // ---------------------------------------------------------- 1-6 字数分布
  console.log('\n■ 1-6. 字数分布（P2-4 の材料）');
  printStats('monsters', stats(withExp.map(r => strlen(r.doc.data.explanation))));
  printStats('cards   ', stats(cardWithExp.map(c => strlen(c.data.explanation))));

  // ---------------------------------------------------------- 1-7 未変換
  console.log('\n■ 1-7. 変換できなかったもの（期待値 0件）');
  console.log(`  monsters      未解決 docId: ${unresolvedMonsters.length}件 ${unresolvedMonsters.join(', ')}`);
  if (imagesKeyMode === 'byIndex') {
    const un = assignEntries.filter(([k]) => !byArrayIndex.has(String(k))).map(([k]) => k);
    console.log(`  monsterImages 未解決 キー:  ${un.length}件 ${un.join(', ')}`);
  } else if (imagesKeyMode === 'byName') {
    console.log(`  monsterImages 未解決 キー:  ${nameMiss.length}件 ${nameMiss.join(', ')}（名前で照合）`);
  } else {
    console.log('  monsterImages: 変換不能のため保留（1-5 参照）');
  }

  if (!WRITE) {
    console.log('\n' + '='.repeat(78));
    console.log('ドライランのため、ファイルは1つも書いていません。');
    console.log('生成するには --write を付けて実行してください。');
    console.log('='.repeat(78));
    return;
  }

  // ---------------------------------------------------------- 【段階2】生成
  const outDir = path.join(REPO, 'src', 'data');
  fs.mkdirSync(outDir, { recursive: true });

  // monsters-editorial.json
  const monstersOut = {};
  for (const r of withExp.slice().sort((x, y) => x.id.localeCompare(y.id))) {
    const d = r.doc.data;
    const entry = {
      id: r.id,
      name: r.name,
      arrayIndex: r.arrayIndex,
      explanation: d.explanation,
      explanationLength: strlen(d.explanation),
    };
    if (d.formations !== undefined) entry.formations = d.formations;
    monstersOut[r.id] = entry;
  }
  const monstersEntries = Object.keys(monstersOut).sort().map(k => [k, monstersOut[k]]);
  const monstersMeta = {
    generatedFrom: 'Firestore monsters collection',
    exportedAt: TODAY,
    count: monstersEntries.length,
  };
  fs.writeFileSync(path.join(outDir, 'monsters-editorial.json'),
    serialize(monstersMeta, 'monsters', monstersEntries));

  // cards-editorial.json
  const cardsOut = {};
  for (const c of [...cards].sort((x, y) => x.id.localeCompare(y.id))) {
    const d = c.data;
    const entry = {
      cardId: c.id,
      explanation: typeof d.explanation === 'string' ? d.explanation : '',
      explanationLength: strlen(d.explanation),
    };
    if (d.ratings !== undefined) entry.ratings = d.ratings;
    if (d.formations !== undefined) entry.formations = d.formations;
    cardsOut[c.id] = entry;
  }
  const cardsEntries = Object.keys(cardsOut).sort().map(k => [k, cardsOut[k]]);
  const cardsMeta = {
    generatedFrom: 'Firestore cards collection',
    exportedAt: TODAY,
    count: cardsEntries.length,
  };
  fs.writeFileSync(path.join(outDir, 'cards-editorial.json'),
    serialize(cardsMeta, 'cards', cardsEntries));

  // monster-images.json
  if (!imagesStructureOk) {
    console.log('\n★ monsterImages を一意に変換できないため、monster-images.json は生成しません（1-5 参照）。');
    process.exitCode = 1;
  }
  const imagesOut = imagesStructureOk ? {} : null;
  let imagesJson = null;
  if (imagesStructureOk) {
    for (const [k, v] of assignEntries) {
      const map = imagesKeyMode === 'byIndex'
        ? byArrayIndex.get(String(k))
        : (nameToIds.get(k) || [])[0];
      if (!map) continue;
      imagesOut[map.id] = v;
    }
    const imagesEntries = Object.keys(imagesOut).sort().map(k => [k, imagesOut[k]]);
    const imagesMeta = {
      generatedFrom: `Firestore monsterImages/assignments (key=${imagesKeyMode === 'byName' ? 'monster name' : 'arrayIndex'})`,
      exportedAt: TODAY,
      count: imagesEntries.length,
    };
    imagesJson = { count: imagesEntries.length };
    fs.writeFileSync(path.join(outDir, 'monster-images.json'),
      serialize(imagesMeta, 'images', imagesEntries));
  }

  console.log('\n■ 生成しました');
  console.log(`  src/data/monsters-editorial.json  ${monstersMeta.count}件`);
  console.log(`  src/data/cards-editorial.json     ${cardsMeta.count}件`);
  console.log(`  src/data/monster-images.json      ${imagesJson ? imagesJson.count + '件' : '未生成（構造不一致）'}`);
}

main().catch(err => {
  console.error('\n★エラーで停止しました:');
  console.error(err);
  process.exitCode = 1;
});
