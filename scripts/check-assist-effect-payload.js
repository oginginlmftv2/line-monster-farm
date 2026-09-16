#!/usr/bin/env node

// アシスト効果の読取結果（Claudeがスクショから起こしたJSON）を、CMSへ貼る前に検査する。
//   node scripts/check-assist-effect-payload.js <payload.json> [--emit <out.json>]
//
// 入力（読取JSON）:
//   { "cardId": "c20k-MR-teosu", "sourceScreenshots": ["a.png"],
//     "effects": [{ "name", "description", "unlockRank", "conditional", "conditions" }] }
// 出力（--emit）:
//   CMS「効果OCR」タブの「候補JSONを貼り付け」へそのまま貼れる形。effectIdはCMS側が採番する。
//
// 表記規約の正は scripts/assist-effect-ocr.js のサニタイザ（効果名は「半角スペース1個 + 数値」、
// 説明文は「空白なしの+」）。ここでは「サニタイザを通しても変わらない」ことを要求する。

const fs = require('fs');
const path = require('path');
const {
  comparisonKey,
  sanitizeEffectDescription,
  sanitizeEffectName,
} = require('./assist-effect-ocr');

const REPO = path.resolve(__dirname, '..');
const CARDS_FILE = 'src/data/assist-cards.json';
const EFFECTS_FILE = 'src/data/assist-effects.json';
const UNLOCK_RANKS = ['無凸', '1凸', '2凸', '3凸', '4凸'];
const CONDITION_TYPES = ['mainBloodlineMatch', 'subBloodlineMatch', 'auraMatch', 'monTypeMatch', 'speciesMatch'];
const CONDITION_OPERATORS = ['and', 'or'];
const PAYLOAD_SCHEMA = 1;

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

// 「一致したとき」「ブリーダー」系は黄背景（一致時限定）である可能性が高い。conditional=0 なら警告する。
function looksConditional(name, description) {
  return /一致(?:した|する)とき/.test(description)
    || /ブリーダー/.test(name);
}

function validateConditions(effect, label, issues) {
  const conditional = effect.conditional;
  if (conditional !== 0 && conditional !== 1) {
    issues.fail.push(`${label}: conditional は 0 か 1（${JSON.stringify(conditional)}）`);
    return;
  }
  if (!conditional) {
    if (effect.conditions !== null && effect.conditions !== undefined) {
      issues.fail.push(`${label}: conditional=0 なので conditions は null`);
    }
    return;
  }
  const conditions = effect.conditions;
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) {
    issues.fail.push(`${label}: conditional=1 には conditions {operator, types} が必要`);
    return;
  }
  const extra = Object.keys(conditions).filter(key => !['operator', 'types'].includes(key));
  if (extra.length) issues.fail.push(`${label}: conditions に未対応キー ${extra.join(', ')}`);
  if (!CONDITION_OPERATORS.includes(conditions.operator)) {
    issues.fail.push(`${label}: conditions.operator は and か or（${JSON.stringify(conditions.operator)}）`);
  }
  if (!Array.isArray(conditions.types) || !conditions.types.length) {
    issues.fail.push(`${label}: conditions.types は1件以上`);
    return;
  }
  const seen = new Set();
  for (const type of conditions.types) {
    if (!CONDITION_TYPES.includes(type)) issues.fail.push(`${label}: 条件種別が許可外 ${type}`);
    if (seen.has(type)) issues.fail.push(`${label}: 条件種別が重複 ${type}`);
    seen.add(type);
  }
  if (conditions.types.length === 1 && conditions.operator !== 'and') {
    issues.warn.push(`${label}: 条件1件なので operator は and が既定`);
  }
}

function validateText(effect, label, issues) {
  const name = String(effect.name == null ? '' : effect.name);
  const description = String(effect.description == null ? '' : effect.description);
  if (!name.trim()) issues.fail.push(`${label}: name が空`);
  if (!description.trim()) issues.fail.push(`${label}: description が空`);
  if (/^[✿❀✾❁]/.test(name)) issues.fail.push(`${label}: 効果名の先頭にゲームUIの花マーク（✿）が残っている。一致時限定は conditional=1 で表す`);
  if (/MAX↑/.test(name) || /^•/m.test(name)) issues.fail.push(`${label}: 効果名にOCR由来のUI片（MAX↑・行頭•）がある`);
  const sanitizedName = sanitizeEffectName(name);
  if (sanitizedName !== name) issues.fail.push(`${label}: 効果名の表記が規約外。${JSON.stringify(name)} → ${JSON.stringify(sanitizedName)}`);
  if (/\s[ⅠⅡⅢⅣⅤ]/.test(name)) issues.fail.push(`${label}: ローマ数字の前に空白を入れない（例 アサルトボーナスⅡ +1）`);
  if (/[IVX]{1,3}(?=\s|$|\+)/.test(name) && !/[a-zA-Z]{4,}/.test(name)) {
    issues.fail.push(`${label}: ローマ数字は全角のⅠⅡⅢで書く`);
  }
  const sanitizedDescription = sanitizeEffectDescription(description);
  if (sanitizedDescription !== description) {
    issues.fail.push(`${label}: 説明の表記が規約外。${JSON.stringify(description)} → ${JSON.stringify(sanitizedDescription)}`);
  }
  if (/[ 　]$/m.test(description) || /^[ 　]/m.test(description)) issues.fail.push(`${label}: 説明の行頭・行末に空白がある`);
  if (/\n\n/.test(description)) issues.fail.push(`${label}: 説明に空行がある`);
  if (/\n$/.test(description)) issues.fail.push(`${label}: 説明の末尾に改行がある`);
  if (/\r/.test(description)) issues.fail.push(`${label}: 説明に \\r がある`);
}

function similarNames(name, knownNames) {
  const key = comparisonKey(name);
  return [...knownNames].filter(known => {
    const knownKey = comparisonKey(known);
    if (knownKey === key) return false;
    return Math.min(key.length, knownKey.length) >= 6 && editDistance(key, knownKey) <= 2;
  });
}

function checkPayload(payload, { cardsDoc, effectsDoc }) {
  const issues = { fail: [], warn: [], info: [] };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    issues.fail.push('読取JSONはオブジェクト');
    return issues;
  }
  const cardId = String(payload.cardId || '');
  const card = (cardsDoc.cards || []).find(item => item.cardId === cardId);
  if (!cardId) issues.fail.push('cardId が空');
  else if (!card) issues.fail.push(`未知cardId: ${cardId}（src/data/assist-cards.json に無い）`);
  else issues.info.push(`カード: ${card.name}（${card.rarity} / ${card.aura} / ${card.monType}）= ${cardId}`);

  if (!Array.isArray(payload.sourceScreenshots) || !payload.sourceScreenshots.length) {
    issues.warn.push('sourceScreenshots が空。読んだ画像のファイル名を入れる');
  }
  const effects = payload.effects;
  if (!Array.isArray(effects) || !effects.length) {
    issues.fail.push('effects が空。0件で保存する（draftへ戻す）のはCMSから直接行う');
    return issues;
  }

  const allKnownNames = new Set();
  for (const group of Object.values(effectsDoc.cards || {})) for (const effect of group.effects) allKnownNames.add(effect.name);
  const byName = new Map();
  for (const group of Object.values(effectsDoc.cards || {})) {
    for (const effect of group.effects) {
      const key = comparisonKey(effect.name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(effect);
    }
  }

  const triples = new Set();
  let previousRank = -1;
  effects.forEach((effect, index) => {
    const label = `効果${index + 1}${effect && effect.name ? `「${effect.name}」` : ''}`;
    if (!effect || typeof effect !== 'object') { issues.fail.push(`${label}: オブジェクトではない`); return; }
    const extra = Object.keys(effect).filter(key => !['name', 'description', 'unlockRank', 'conditional', 'conditions'].includes(key));
    if (extra.length) issues.fail.push(`${label}: 未対応キー ${extra.join(', ')}（effectId・sortOrderはCMSが採番）`);
    validateText(effect, label, issues);
    const rankIndex = UNLOCK_RANKS.indexOf(effect.unlockRank);
    if (rankIndex < 0) issues.fail.push(`${label}: unlockRank は ${UNLOCK_RANKS.join('・')} のいずれか（${JSON.stringify(effect.unlockRank)}）`);
    else {
      if (rankIndex < previousRank) {
        issues.fail.push(`${label}: 解放ランクが前の効果より下がっている（ゲーム画面は無凸→4凸の順）。コインの青の数を読み直す`);
      }
      previousRank = Math.max(previousRank, rankIndex);
    }
    validateConditions(effect, label, issues);
    const name = String(effect.name || '');
    const description = String(effect.description || '');
    if (effect.conditional === 0 && looksConditional(name, description)) {
      issues.warn.push(`${label}: 説明が一致条件を含むのに conditional=0。背景が黄色（薄いオレンジ）でないか画像で確認`);
    }
    if (effect.conditional === 1 && !looksConditional(name, description)) {
      issues.warn.push(`${label}: conditional=1 だが説明に一致条件の文言が無い。背景色を画像で確認`);
    }
    const triple = `${name} ${description} ${effect.unlockRank}`;
    if (triples.has(triple)) issues.fail.push(`${label}: 同一カード内で name + description + unlockRank が重複`);
    triples.add(triple);

    const known = byName.get(comparisonKey(name)) || [];
    if (!known.length) {
      const near = similarNames(name, allKnownNames);
      issues.info.push(`${label}: DB初出の効果名${near.length ? `。近い既存名: ${near.join(' / ')}（誤字か表記ゆれなら合わせる）` : ''}`);
    } else {
      const sameDescription = known.some(item => comparisonKey(item.description) === comparisonKey(description));
      if (!sameDescription) {
        const sample = known.find(item => item.description) || known[0];
        issues.warn.push(`${label}: 同名の既存効果と説明が違う。既存=${JSON.stringify(sample.description)} / 今回=${JSON.stringify(description)}`);
      }
      const conditionalDiff = known.filter(item => item.conditional !== effect.conditional);
      if (conditionalDiff.length && conditionalDiff.length === known.length) {
        issues.info.push(`${label}: 同名の既存効果は全件 conditional=${known[0].conditional}（今回は ${effect.conditional}。既存側の未設定なら今回が正）`);
      }
    }
  });

  const existing = effectsDoc.cards && effectsDoc.cards[cardId];
  if (existing) {
    if (!existing.effects.length) issues.info.push(`このカードはDBで ${existing.status}・効果0件。今回の ${effects.length} 件が初回登録`);
    else {
      const currentKeys = existing.effects.map(item => comparisonKey(item.name));
      const nextKeys = effects.map(item => comparisonKey(String(item.name || '')));
      const removed = existing.effects.filter(item => !nextKeys.includes(comparisonKey(item.name))).map(item => item.name);
      const added = effects.filter(item => !currentKeys.includes(comparisonKey(String(item.name || '')))).map(item => item.name);
      issues.info.push(`このカードはDBで ${existing.effects.length} 件登録済み → 今回 ${effects.length} 件。追加 ${added.length ? added.join(' / ') : 'なし'} / 消える ${removed.length ? removed.join(' / ') : 'なし'}`);
      if (removed.length) issues.warn.push(`保存すると既存効果 ${removed.length} 件が消える（貼り付けは全置換）。スクショの撮り漏れでないか確認`);
    }
  }
  return issues;
}

function toCmsPayload(payload) {
  return {
    schemaVersion: PAYLOAD_SCHEMA,
    source: 'claude-vision',
    cardId: payload.cardId,
    sourceScreenshots: (payload.sourceScreenshots || []).map(String),
    effects: payload.effects.map(effect => ({
      name: effect.name,
      description: effect.description,
      unlockRank: effect.unlockRank,
      conditional: effect.conditional,
      conditions: effect.conditional ? { operator: effect.conditions.operator, types: effect.conditions.types.slice() } : null,
    })),
  };
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find(arg => !arg.startsWith('--') && args[args.indexOf(arg) - 1] !== '--emit');
  const emitIndex = args.indexOf('--emit');
  const emitPath = emitIndex >= 0 ? args[emitIndex + 1] : null;
  if (!inputPath) throw new Error('読取JSONのパスが必要です');
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const cardsDoc = JSON.parse(fs.readFileSync(path.join(REPO, CARDS_FILE), 'utf8'));
  const effectsDoc = JSON.parse(fs.readFileSync(path.join(REPO, EFFECTS_FILE), 'utf8'));
  const issues = checkPayload(payload, { cardsDoc, effectsDoc });
  for (const line of issues.info) console.log(`  INFO  ${line}`);
  for (const line of issues.warn) console.log(`  WARN  ${line}`);
  for (const line of issues.fail) console.log(`  FAIL  ${line}`);
  console.log(`\nアシスト効果読取検査: FAIL ${issues.fail.length} / WARN ${issues.warn.length}`);
  if (issues.fail.length) process.exit(1);
  if (emitPath) {
    fs.writeFileSync(emitPath, `${JSON.stringify(toCmsPayload(payload), null, 2)}\n`);
    console.log(`CMS貼り付け用JSONを書きました: ${emitPath}`);
  }
}

module.exports = { checkPayload, toCmsPayload, looksConditional, UNLOCK_RANKS, CONDITION_TYPES, PAYLOAD_SCHEMA };

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`アシスト効果読取検査: FAIL ${error.message}`); process.exit(1); }
}
