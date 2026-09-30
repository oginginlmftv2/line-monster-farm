#!/usr/bin/env node

// アシスト能力の読取結果（Claudeがスクショから起こしたJSON）を、CMSへ貼る前に検査する。
//   node scripts/check-assist-ability-payload.js <payload.json> [--emit <out.json>]
//
// 入力（読取JSON）:
//   { "cardId": "c0003-MR", "sourceScreenshots": ["a.png"],
//     "abilities": [{ "name", "description", "source", "tags"?, "linkTo"? }] }
// 出力（--emit）:
//   CMS「能力取り込み」タブへ貼る形。各能力に判定 action を付ける。
//   abilityId・sortOrder・sourceOrder はCMS（サーバー）が採番する。
//
// 判定（docs/ability-capture-design.md 第3章。GASの 26_ability_capture.gs も同じ規則で再計算する）:
//   known       このカードのresolved能力に同名があり、本文も同じ → 何もしない
//   known_diff  同名はあるが本文が違う → 何もしない（差分をWARN。直すのはCMSの能力編集）
//   link        未紐付け（unlinked/ambiguous）能力に同名があり、元のカード名がこのカードと一致 → 既存行を紐付ける
//   link_ambiguous  上の候補が複数 → linkTo で1件選ぶまでFAIL
//   create      どれにも当たらない → 新規能力（draft）
// DBの正はCMSの abilities シート。src/data/assist-abilities.json は照合用の写しで、ここでは書き換えない。

const fs = require('fs');
const path = require('path');
const { abilityNameKey, abilityDescriptionKey, sourceNameKey } = require('../src/lib/ability-name-key');

const REPO = path.resolve(__dirname, '..');
const CARDS_FILE = 'src/data/assist-cards.json';
const ABILITIES_FILE = 'src/data/assist-abilities.json';
const UI_FILE = '_cms/gas/ui_assist.html';
const SOURCES = ['イベント', '閃き', 'EXトレ', '伝授'];
const PAYLOAD_SCHEMA = 1;
const ITEM_KEYS = ['name', 'description', 'source', 'tags', 'linkTo'];
const MAX_ITEMS = 30;

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

// CMS画面のタグ候補（ASST_ABILITY_TAGS）。画面とずれないよう、定義元から読む。
function readUiTags(root = REPO) {
  const html = fs.readFileSync(path.join(root, UI_FILE), 'utf8');
  const match = html.match(/var ASST_ABILITY_TAGS=(\[[^\]]*\]);/);
  if (!match) throw new Error(`${UI_FILE} に ASST_ABILITY_TAGS が見つからない`);
  return JSON.parse(match[1].replace(/'/g, '"'));
}

// 能力名の表記。既存1,248件の実測に合わせる（数字・＋は全角、角括弧は半角、ローマ数字は「 I」「 II」）。
function validateName(name, label, issues) {
  if (!name.trim()) { issues.fail.push(`${label}: name が空`); return; }
  if (name !== name.trim()) issues.fail.push(`${label}: 名前の前後に空白がある`);
  if (/[\n\r<>]/.test(name)) issues.fail.push(`${label}: 名前に改行・<>がある`);
  if (/[［］]/.test(name)) issues.fail.push(`${label}: 名前の角括弧は半角 [ ] で書く（例 [自身青]不屈）`);
  if (/[0-9]/.test(name)) issues.fail.push(`${label}: 名前の数字は全角で書く（例 ちから＋３%）`);
  if (/\+/.test(name)) issues.fail.push(`${label}: 名前の＋は全角で書く`);
  if (/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/.test(name)) issues.fail.push(`${label}: 名前のローマ数字は半角英字で、前に半角空白（例 光香む常闇の衣 II）。効果スキルとは逆`);
  if (/[぀-ヿ一-鿿](?:I{1,3}|IV|V)$/.test(name)) issues.fail.push(`${label}: ローマ数字の前に半角空白を入れる（例 光香む常闇の衣 I）`);
  if (/　/.test(name)) issues.fail.push(`${label}: 名前に全角空白がある`);
}

// 本文の表記。改行は <br>、山括弧・％・＋－は全角。半角数字は Lv1 / R4 / [最大2回まで] など既存の例外だけ。
function validateDescription(description, label, issues) {
  if (!description.trim()) { issues.fail.push(`${label}: description が空`); return; }
  if (/[\n\r]/.test(description)) issues.fail.push(`${label}: 本文の改行は \\n ではなく <br> で書く`);
  const withoutBreaks = description.replace(/<br>/g, '');
  if (/<br\s*\/?>/i.test(withoutBreaks) || /[<>]/.test(withoutBreaks)) {
    issues.fail.push(`${label}: 本文の山括弧は全角 ＜ ＞ で書く（HTMLは <br> だけ）`);
  }
  if (/^<br>|<br>$|<br><br>/.test(description)) issues.fail.push(`${label}: 本文の先頭・末尾・連続に <br> がある`);
  if (/[［］]/.test(description)) issues.fail.push(`${label}: 本文の角括弧は半角 [ ] で書く（例 [前半][自身青]）`);
  if (/%/.test(description)) issues.fail.push(`${label}: 本文の％は全角で書く`);
  if (/[+]/.test(description)) issues.fail.push(`${label}: 本文の＋は全角で書く`);
  if (/(?<![A-Za-z])-(?=[0-9０-９])/.test(description)) issues.fail.push(`${label}: 本文の－（マイナス）は全角で書く`);
  if (/　/.test(description) || /^ | $/.test(description) || /( <br>|<br> )/.test(description)) {
    issues.fail.push(`${label}: 本文に全角空白、または行頭・行末の空白がある`);
  }
  const digits = description.replace(/<br>/g, '').replace(/Lv[0-9]+/g, '').replace(/R[0-9]+/g, '').replace(/\[[^\]]*\]/g, '');
  if (/[0-9]/.test(digits)) issues.warn.push(`${label}: 本文に半角数字がある。既存DBは全角が基本（例外は Lv1・R4・[最大2回まで]）`);
}

function validateTags(tags, label, allowedTags, issues) {
  if (tags === undefined) return;
  if (!Array.isArray(tags)) { issues.fail.push(`${label}: tags は配列`); return; }
  const seen = new Set();
  for (const tag of tags) {
    if (typeof tag !== 'string' || !tag.trim()) { issues.fail.push(`${label}: tags に空・非文字列がある`); continue; }
    if (!allowedTags.has(tag)) issues.fail.push(`${label}: タグ「${tag}」はCMSの候補にも既存DBにも無い。推測で増やさない`);
    if (seen.has(tag)) issues.fail.push(`${label}: タグ「${tag}」が重複`);
    seen.add(tag);
  }
}

// 1件の判定。GASの asstCaptureClassify_ と同じ規則（scripts/test-assist-ability-payload.js が突き合わせる）。
function classifyAbility(item, card, abilities) {
  const nameKey = abilityNameKey(item.name);
  const descriptionKey = abilityDescriptionKey(item.description);
  const resolved = abilities.filter(ability => ability.linkStatus === 'resolved' && ability.cardId === card.cardId
    && abilityNameKey(ability.name) === nameKey);
  if (resolved.length) {
    const same = resolved.find(ability => abilityDescriptionKey(ability.description) === descriptionKey);
    return same
      ? { action: 'known', abilityId: same.abilityId, existing: same, candidates: [] }
      : { action: 'known_diff', abilityId: resolved[0].abilityId, existing: resolved[0], candidates: [] };
  }
  const sameName = abilities.filter(ability => ability.linkStatus !== 'resolved' && abilityNameKey(ability.name) === nameKey);
  const cardKey = sourceNameKey(card.name);
  const candidates = sameName.filter(ability => sourceNameKey(ability.sourceName) === cardKey
    && (!ability.rarity || ability.rarity === card.rarity));
  if (item.linkTo) {
    const chosen = sameName.find(ability => ability.abilityId === item.linkTo);
    return chosen
      ? { action: 'link', abilityId: chosen.abilityId, existing: chosen, candidates: candidates.map(a => a.abilityId), chosenBy: 'linkTo' }
      : { action: 'invalid_link', abilityId: item.linkTo, existing: null, candidates: sameName.map(a => a.abilityId) };
  }
  if (candidates.length === 1) return { action: 'link', abilityId: candidates[0].abilityId, existing: candidates[0], candidates: [candidates[0].abilityId] };
  if (candidates.length > 1) return { action: 'link_ambiguous', abilityId: null, existing: null, candidates: candidates.map(a => a.abilityId) };
  return { action: 'create', abilityId: null, existing: null, candidates: [], otherSameName: sameName.map(a => a.abilityId) };
}

function similarNames(name, knownNames) {
  const key = abilityNameKey(name);
  return [...knownNames].filter(known => {
    const knownKey = abilityNameKey(known);
    if (knownKey === key) return false;
    return Math.min(key.length, knownKey.length) >= 4 && editDistance(key, knownKey) <= 2;
  });
}

function checkPayload(payload, { cardsDoc, abilitiesDoc, uiTags }) {
  const issues = { fail: [], warn: [], info: [], results: [] };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    issues.fail.push('読取JSONはオブジェクト');
    return issues;
  }
  const extraTop = Object.keys(payload).filter(key => !['cardId', 'sourceScreenshots', 'abilities'].includes(key));
  if (extraTop.length) issues.fail.push(`未対応キー ${extraTop.join(', ')}`);
  const cardId = String(payload.cardId || '');
  const card = (cardsDoc.cards || []).find(item => item.cardId === cardId);
  if (!cardId) issues.fail.push('cardId が空。イベント詳細の画面にはカード名が出ないので、入力者に聞く');
  else if (!card) issues.fail.push(`未知cardId: ${cardId}（src/data/assist-cards.json に無い）`);
  else issues.info.push(`カード: ${card.name}（${card.rarity} / ${card.aura} / ${card.monType}）= ${cardId}`);

  if (!Array.isArray(payload.sourceScreenshots) || !payload.sourceScreenshots.length) {
    issues.warn.push('sourceScreenshots が空。読んだ画像のファイル名を入れる');
  }
  const items = payload.abilities;
  if (!Array.isArray(items) || !items.length) { issues.fail.push('abilities が空'); return issues; }
  if (items.length > MAX_ITEMS) issues.fail.push(`abilities は ${MAX_ITEMS} 件まで（CMSの1回の取り込み上限）`);
  if (!card) return issues;

  const abilities = abilitiesDoc.abilities || [];
  const allowedTags = new Set(uiTags);
  for (const ability of abilities) for (const tag of ability.tags || []) allowedTags.add(tag);
  // 同じ名前の既存表記（閃きの汎用名は全カード共通）。NFKCで同じなら既存の書き方に合わせる
  const rawNamesByKey = new Map();
  for (const ability of abilities) {
    const key = abilityNameKey(ability.name);
    if (!rawNamesByKey.has(key)) rawNamesByKey.set(key, new Map());
    const forms = rawNamesByKey.get(key);
    forms.set(ability.name, (forms.get(ability.name) || 0) + 1);
  }
  const allNames = new Set(abilities.map(ability => ability.name));

  const seenNames = new Set();
  const linkedIds = new Set();
  items.forEach((item, index) => {
    const label = `能力${index + 1}${item && item.name ? `「${item.name}」` : ''}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { issues.fail.push(`${label}: オブジェクトではない`); return; }
    const extra = Object.keys(item).filter(key => !ITEM_KEYS.includes(key));
    if (extra.length) issues.fail.push(`${label}: 未対応キー ${extra.join(', ')}（abilityId・sortOrderはCMSが採番。紐付け先は linkTo）`);
    const name = typeof item.name === 'string' ? item.name : '';
    const description = typeof item.description === 'string' ? item.description : '';
    validateName(name, label, issues);
    validateDescription(description, label, issues);
    if (!SOURCES.includes(item.source)) issues.fail.push(`${label}: source は ${SOURCES.join('・')} のいずれか（${JSON.stringify(item.source)}）`);
    validateTags(item.tags, label, allowedTags, issues);
    if (item.linkTo !== undefined && (typeof item.linkTo !== 'string' || !/^ab-[0-9]{4,}$/.test(item.linkTo))) {
      issues.fail.push(`${label}: linkTo は ab-#### 形式`);
    }
    const nameKey = abilityNameKey(name);
    if (seenNames.has(nameKey)) issues.fail.push(`${label}: 同じ名前が2回ある（スクロールの重なりは1件にまとめる）`);
    seenNames.add(nameKey);

    const forms = rawNamesByKey.get(nameKey);
    if (forms && !forms.has(name)) {
      const preferred = [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
      issues.fail.push(`${label}: 既存DBの同じ名前は「${[...forms.keys()].join('」「')}」。表記を合わせる（最多: ${preferred}）`);
    }

    const result = classifyAbility({ name, description, linkTo: item.linkTo }, card, abilities);
    issues.results.push({ index, name, ...result });
    if (result.action === 'known') {
      issues.info.push(`${label}: 登録済み（${result.abilityId}）。送らない`);
    } else if (result.action === 'known_diff') {
      const locked = result.existing.legacyId !== null && result.existing.legacyId !== undefined;
      issues.warn.push(`${label}: 登録済み（${result.abilityId}）だが本文が違う${locked ? '。移行データ（本文ロック）なので直さず報告だけ' : '。スクショが正なら、CMSの能力編集で本文を直す'}\n        既存=${result.existing.description}\n        今回=${description}`);
    } else if (result.action === 'link') {
      if (linkedIds.has(result.abilityId)) issues.fail.push(`${label}: ${result.abilityId} へ2件以上を紐付けようとしている`);
      linkedIds.add(result.abilityId);
      const existing = result.existing;
      issues.info.push(`${label}: 既存の未紐付け能力 ${result.abilityId}（${existing.sourceName} / ${existing.linkStatus} / ${existing.status}）をこのカードへ紐付ける${result.chosenBy ? '（linkTo指定）' : ''}`);
      if (abilityDescriptionKey(existing.description) !== abilityDescriptionKey(description)) {
        const locked = existing.legacyId !== null && existing.legacyId !== undefined;
        issues.warn.push(`${label}: 紐付ける既存能力と本文が違う。紐付けでは本文を変えない${locked ? '（移行データなので本文ロック）' : '。紐付け後にCMSの能力編集で直す'}\n        既存=${existing.description}\n        今回=${description}`);
      }
    } else if (result.action === 'link_ambiguous') {
      issues.fail.push(`${label}: 紐付け候補が複数 ${result.candidates.join(' / ')}。入力者に選んでもらい linkTo に書く`);
    } else if (result.action === 'invalid_link') {
      issues.fail.push(`${label}: linkTo ${item.linkTo} は同名の未紐付け能力ではない（候補: ${result.candidates.join(' / ') || 'なし'}）`);
    } else {
      const near = forms ? [] : similarNames(name, allNames);
      // 閃きの汎用名（[自身青]不屈 など）は全カード共通なので、他カードの同名は別の能力。案内しない
      const others = result.otherSameName.length && item.source !== '閃き' ? `。元のカード名が違う同名の未紐付け能力あり: ${result.otherSameName.join(' / ')}（同じ能力なら linkTo で紐付ける）` : '';
      issues.info.push(`${label}: 新規（draftで作成）${near.length ? `。近い既存名: ${near.slice(0, 5).join(' / ')}（誤字なら直す）` : ''}${others}`);
    }
  });

  const resolved = abilities.filter(ability => ability.linkStatus === 'resolved' && ability.cardId === cardId);
  const missing = resolved.filter(ability => !seenNames.has(abilityNameKey(ability.name)));
  issues.info.push(`このカードのresolved能力: DB ${resolved.length} 件。今回のスクショに無いもの ${missing.length} 件${missing.length && missing.length <= 12 ? `（${missing.map(a => a.name).join(' / ')}）` : ''}`);
  return issues;
}

function toCmsPayload(payload, results) {
  const byIndex = new Map(results.map(result => [result.index, result]));
  return {
    schemaVersion: PAYLOAD_SCHEMA,
    source: 'claude-vision',
    cardId: payload.cardId,
    sourceScreenshots: (payload.sourceScreenshots || []).map(String),
    abilities: payload.abilities.map((item, index) => {
      const result = byIndex.get(index);
      const out = {
        action: result.action,
        name: item.name,
        description: item.description,
        source: item.source,
        tags: Array.isArray(item.tags) ? item.tags.slice() : [],
      };
      if (result.abilityId) out.abilityId = result.abilityId;
      return out;
    }),
  };
}

function loadDocs(root = REPO) {
  return {
    cardsDoc: JSON.parse(fs.readFileSync(path.join(root, CARDS_FILE), 'utf8')),
    abilitiesDoc: JSON.parse(fs.readFileSync(path.join(root, ABILITIES_FILE), 'utf8')),
    uiTags: readUiTags(root),
  };
}

function main() {
  const args = process.argv.slice(2);
  const emitIndex = args.indexOf('--emit');
  const emitPath = emitIndex >= 0 ? args[emitIndex + 1] : null;
  const inputPath = args.find((arg, index) => !arg.startsWith('--') && index !== emitIndex + 1);
  if (!inputPath) throw new Error('読取JSONのパスが必要です');
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const issues = checkPayload(payload, loadDocs());
  for (const line of issues.info) console.log(`  INFO  ${line}`);
  for (const line of issues.warn) console.log(`  WARN  ${line}`);
  for (const line of issues.fail) console.log(`  FAIL  ${line}`);
  const counts = {};
  for (const result of issues.results) counts[result.action] = (counts[result.action] || 0) + 1;
  console.log(`\n判定: ${Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(' / ') || 'なし'}`);
  console.log(`アシスト能力読取検査: FAIL ${issues.fail.length} / WARN ${issues.warn.length}`);
  if (issues.fail.length) process.exit(1);
  if (emitPath) {
    fs.writeFileSync(emitPath, `${JSON.stringify(toCmsPayload(payload, issues.results), null, 2)}\n`);
    console.log(`CMS貼り付け用JSONを書きました: ${emitPath}`);
  }
}

module.exports = { checkPayload, classifyAbility, toCmsPayload, loadDocs, readUiTags, PAYLOAD_SCHEMA, SOURCES, MAX_ITEMS };

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`アシスト能力読取検査: FAIL ${error.message}`); process.exit(1); }
}
