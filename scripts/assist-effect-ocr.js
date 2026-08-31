#!/usr/bin/env node

// OCRテキスト正規化ルールと実装状況
//   1 | → Ⅱ の誤読補正          両実装に適用（scripts と ui_assist.html）
//   2 MAX↑ の除去               両実装に適用（scripts と ui_assist.html。タイトル判定にも適用）
//   3 行頭 • の除去             両実装に適用（scripts と ui_assist.html。タイトル判定にも適用）。・（中黒）は対象外
//   4 括弧を全角へ統一          両実装とも未実装。既存888件の書き換えを伴うため別タスク
//                              NFKCによる全角破壊だけは normalizeText で止めてある
//   5 読点後の半角スペース削除  両実装とも未実装。既存データに該当0件
//   6 + の前後のスペース規約    両実装とも未実装。indexゲートの再判定が必要なため別タスク

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const EFFECTS_FILE = 'src/data/assist-effects.json';
const UNLOCK_RANKS = ['無凸', '1凸', '2凸', '3凸', '4凸'];
const ACTIVATION_CONDITION_DEFS = [
  { type: 'mainBloodlineMatch', pattern: /主血統/ },
  { type: 'subBloodlineMatch', pattern: /副血統/ },
  { type: 'auraMatch', pattern: /オーラ/ },
  { type: 'monTypeMatch', pattern: /モン類/ },
  { type: 'speciesMatch', pattern: /種族/ },
];

function normalizeText(value) {
  const input = String(value || '');
  const usedCharacters = new Set(input);
  const protectedCharacters = new Map();
  let privateUseCodePoint = 0xe000;
  const nextPlaceholder = () => {
    while (privateUseCodePoint <= 0x10fffd) {
      if (privateUseCodePoint === 0xf900) privateUseCodePoint = 0xf0000;
      if (privateUseCodePoint === 0xffffe) privateUseCodePoint = 0x100000;
      const placeholder = String.fromCodePoint(privateUseCodePoint);
      privateUseCodePoint += 1;
      if (usedCharacters.has(placeholder)) continue;
      usedCharacters.add(placeholder);
      return placeholder;
    }
    throw new Error('OCR正規化の一時文字を確保できません');
  };
  const protectedText = Array.from(input, character => {
    if (!/[（）Ⅰ-Ⅹⅰ-ⅹ]/u.test(character)) return character;
    if (!protectedCharacters.has(character)) protectedCharacters.set(character, nextPlaceholder());
    return protectedCharacters.get(character);
  }).join('');
  const restoredCharacters = new Map(
    [...protectedCharacters].map(([character, placeholder]) => [placeholder, character]),
  );
  return Array.from(
    protectedText
    .normalize('NFKC')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim(),
    character => restoredCharacters.get(character) || character,
  ).join('');
}

function sanitizeOcrText(value) {
  return normalizeText(value)
    .replace(/[|｜]/g, 'Ⅱ')
    .replace(/MAX↑/g, '')
    .replace(/^•\s*/, '')
    .replace(/III/g, 'Ⅲ')
    .replace(/II/g, 'Ⅱ')
    .replace(/\(/g, '（')
    .replace(/\)/g, '）')
    .replace(/、 +/g, '、')
    .replace(/ +（/g, '（');
}

// 効果名は「半角スペース1個 + 数値」、説明文は「空白なしの+」がAGENTS.mdの表記規約。
// scripts/verify.js の表記正規化チェックと対になっているため、片方だけ変更しない。
function sanitizeEffectName(value) {
  return sanitizeOcrText(value)
    .replace(/([^ ])\+/g, '$1 +')
    .replace(/ {2,}\+/g, ' +');
}

function sanitizeEffectDescription(value) {
  return String(value == null ? '' : value)
    .split('\n')
    .map(line => sanitizeOcrText(line))
    .join('\n')
    .replace(/\s*\+\s*/g, '+');
}

function comparisonKey(value) {
  return normalizeText(value).toLowerCase()
    .replace(/[\s「」『』【】\[\]()（）<>＜＞・、。:：!！?？/／]/g, '');
}

function titleComparisonKey(value) {
  return comparisonKey(value).replace(/[|｜]/g, 'ii').replace(/\+$/, '');
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function matchesKnownEffectName(value, knownNames) {
  const key = titleComparisonKey(value);
  return [...knownNames].some(knownName => {
    const knownKey = titleComparisonKey(knownName);
    return key === knownKey || (Math.min(key.length, knownKey.length) >= 6 && editDistance(key, knownKey) <= 2);
  });
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function rgbFeatures(sample) {
  const r = Number(sample.r);
  const g = Number(sample.g);
  const b = Number(sample.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return {
    yellowBias: r - b,
    saturation: max ? (max - min) / max : 0,
    brightness: (r + g + b) / 3,
  };
}

function classifyBackground(samples) {
  const usable = (samples || []).map(rgbFeatures)
    .filter(feature => feature.brightness >= 120);
  if (usable.length < 5) return { activationScope: 'unknown', confidence: 0, score: null };
  const yellowBias = median(usable.map(feature => feature.yellowBias));
  const saturation = median(usable.map(feature => feature.saturation));
  const score = yellowBias + saturation * 100;
  if (score >= 58) return { activationScope: 'conditional', confidence: Math.min(1, (score - 45) / 35), score };
  if (score <= 38) return { activationScope: 'universal', confidence: Math.min(1, (50 - score) / 30), score };
  return { activationScope: 'unknown', confidence: 0, score };
}

function breederDependencyCondition(effectName, description) {
  const name = normalizeText(effectName);
  const type = /モン類ブリーダー/.test(name) ? 'monTypeMatch' : /オーラブリーダー/.test(name) ? 'auraMatch' : null;
  if (!type) return null;
  const text = normalizeText(description);
  const clause = text.match(/ブリーダー[^、。]*(?:とき|時)(?:でも)?/);
  return {
    sourceText: clause ? clause[0] : text,
    expression: { type },
    basis: 'breeder-dependency',
  };
}

function extractActivationConditions(description, activationScope, effectName) {
  if (activationScope !== 'conditional') return { activationConditions: null, issues: [] };
  const text = normalizeText(description);
  const end = text.indexOf('とき');
  if (end < 0) {
    const derived = breederDependencyCondition(effectName, description);
    return derived ? { activationConditions: derived, issues: [] } : { activationConditions: null, issues: ['activation-condition-not-detected'] };
  }
  const sourceText = text.slice(0, end + 2).replace(/[、,]\s*$/, '');
  const conditions = ACTIVATION_CONDITION_DEFS
    .filter(definition => definition.pattern.test(sourceText))
    .map(definition => ({ type: definition.type }));
  if (!conditions.length) {
    const derived = breederDependencyCondition(effectName, description);
    return derived ? { activationConditions: derived, issues: [] } : { activationConditions: null, issues: ['activation-condition-not-detected'] };
  }
  if (conditions.length === 1) {
    return {
      activationConditions: { sourceText, expression: conditions[0], basis: 'direct-text' },
      issues: [],
    };
  }
  const hasOr = /(?:または|もしくは|いずれか)/.test(sourceText);
  const hasAnd = /(?:かつ|且つ|および|及び)/.test(sourceText);
  if (hasOr && hasAnd) {
    return { activationConditions: null, issues: ['activation-condition-operator-unclear'] };
  }
  if (!hasOr && !hasAnd) {
    return { activationConditions: null, issues: ['activation-condition-operator-unclear'] };
  }
  return {
    activationConditions: {
      sourceText,
      expression: { operator: hasOr ? 'or' : 'and', operands: conditions },
      basis: 'direct-text',
    },
    issues: [],
  };
}

function applyBackgroundAnalysis(candidate, samples) {
  const background = classifyBackground(samples);
  const extracted = extractActivationConditions(candidate.description, background.activationScope, candidate.name);
  return {
    ...candidate,
    activationScope: background.activationScope,
    backgroundConfidence: background.confidence,
    backgroundScore: background.score,
    activationConditions: extracted.activationConditions,
    issues: [...new Set([...(candidate.issues || []), ...extracted.issues])],
  };
}

function isBlueMarkerSample(sample) {
  const r = Number(sample.r);
  const g = Number(sample.g);
  const b = Number(sample.b);
  return b >= 115 && g >= 115 && b > r * 1.25 && g > r * 1.25;
}

function detectUnlockRank(markerSamples) {
  if (!Array.isArray(markerSamples) || markerSamples.length !== 4) {
    return { unlockRank: null, blueMarkers: null, issue: 'unlock-markers-unavailable' };
  }
  const blueMarkers = markerSamples.filter(sample => {
    if (Array.isArray(sample)) {
      return sample.filter(isBlueMarkerSample).length >= Math.max(2, Math.ceil(sample.length * 0.15));
    }
    return isBlueMarkerSample(sample);
  }).length;
  return { unlockRank: UNLOCK_RANKS[blueMarkers], blueMarkers, issue: null };
}

function boundsOf(vertices) {
  const xs = vertices.map(vertex => Number(vertex.x || 0));
  const ys = vertices.map(vertex => Number(vertex.y || 0));
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function visionLines(payload) {
  const response = payload && Array.isArray(payload.responses) ? payload.responses[0] : null;
  const page = response && response.fullTextAnnotation && response.fullTextAnnotation.pages
    ? response.fullTextAnnotation.pages[0] : null;
  if (!page) throw new Error('Google Vision応答にfullTextAnnotation.pages[0]がありません');
  const lines = [];
  let text = '';
  let vertices = [];
  function flush() {
    const value = normalizeText(text);
    if (value) lines.push({ text: value, bounds: boundsOf(vertices) });
    text = '';
    vertices = [];
  }
  for (const block of page.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const word of paragraph.words || []) {
        for (const symbol of word.symbols || []) {
          text += symbol.text || '';
          vertices.push(...((symbol.boundingBox && symbol.boundingBox.vertices) || []));
          const type = symbol.property && symbol.property.detectedBreak && symbol.property.detectedBreak.type;
          if (['SPACE', 'SURE_SPACE'].includes(type)) text += ' ';
          if (['EOL_SURE', 'LINE_BREAK'].includes(type)) flush();
        }
      }
      flush();
    }
  }
  return { width: page.width, height: page.height, lines };
}

function looksLikeEffectTitle(line, knownNames) {
  const text = sanitizeOcrText(line.text);
  if (!text || text.length > 42 || /^(?:アシスト|能力|イベント|とじる)$/.test(text)) return false;
  if (matchesKnownEffectName(text, knownNames)) return true;
  if (knownNames.size >= 5) return false;
  if (/^(?:育成対象|一緒に|忠誠度に|ブリーダーが|かしこさ|人気度)/.test(text)) return false;
  return /\+\s*\d+(?:\.\d+)?%?$/.test(text)
    || /(?:継承|鍛錬|共鳴|ブリーダー)$/.test(text);
}

function parseEffectCandidates(lines, knownEffectNames) {
  const knownNames = new Set((knownEffectNames || []).map(comparisonKey));
  const sorted = (lines || []).slice().sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);
  const anchor = sorted.find(line => comparisonKey(line.text) === comparisonKey('アシスト効果'));
  const close = sorted.find(line => comparisonKey(line.text) === comparisonKey('とじる'));
  const content = sorted.filter(line => (!anchor || line.bounds.y > anchor.bounds.y + anchor.bounds.height)
    && (!close || line.bounds.y < close.bounds.y));
  const titleIndexes = content.map((line, index) => looksLikeEffectTitle(line, knownNames) ? index : -1)
    .filter(index => index >= 0);
  const issues = [];
  if (!titleIndexes.length) return { candidates: [], issues: ['effect-title-not-detected'] };
  const candidates = titleIndexes.map((start, index) => {
    const group = content.slice(start, titleIndexes[index + 1] || content.length);
    const title = group[0];
    const descriptionLines = group.slice(1).filter(line => line.bounds.x < title.bounds.x + Math.max(500, title.bounds.width * 5));
    const description = sanitizeEffectDescription(descriptionLines.map(line => sanitizeOcrText(line.text)).join(''));
    const candidateIssues = [];
    if (!description) candidateIssues.push('description-empty-or-cropped');
    return {
      name: sanitizeEffectName(title.text),
      description,
      titleBounds: title.bounds,
      activationScope: 'unknown',
      activationConditions: null,
      backgroundConfidence: 0,
      backgroundScore: null,
      unlockRank: null,
      blueMarkers: null,
      issues: candidateIssues,
    };
  });
  return { candidates, issues };
}

function mergeScreenshotCandidates(candidateGroups) {
  const merged = [];
  for (const candidate of candidateGroups.flat()) {
    const key = comparisonKey(candidate.name);
    const current = merged.find(item => comparisonKey(item.name) === key);
    if (!current) {
      merged.push({ ...candidate, sourceScreenshots: candidate.sourceScreenshots || [] });
      continue;
    }
    if (candidate.description.length > current.description.length) current.description = candidate.description;
    current.sourceScreenshots = [...new Set([...current.sourceScreenshots, ...(candidate.sourceScreenshots || [])])];
    for (const field of ['activationScope', 'unlockRank']) {
      if ((current[field] === 'unknown' || current[field] === null) && candidate[field] != null) current[field] = candidate[field];
      else if (candidate[field] != null && candidate[field] !== 'unknown' && current[field] !== candidate[field]) {
        current.issues.push(`${field}-conflict`);
      }
    }
    if (!current.activationConditions && candidate.activationConditions) {
      current.activationConditions = candidate.activationConditions;
    } else if (current.activationConditions && candidate.activationConditions &&
        JSON.stringify(current.activationConditions.expression) !== JSON.stringify(candidate.activationConditions.expression)) {
      current.issues.push('activation-conditions-conflict');
    }
    current.issues = [...new Set([...current.issues, ...candidate.issues])];
  }
  return merged;
}

function compareWithExisting(candidates, existingEffects) {
  return candidates.map((candidate, index) => {
    const existing = (existingEffects || []).find(effect => comparisonKey(effect.name) === comparisonKey(candidate.name));
    const differences = [];
    if (!existing) differences.push('new-effect');
    else {
      if (comparisonKey(existing.description) !== comparisonKey(candidate.description)) differences.push('description-diff');
      if (candidate.unlockRank && existing.unlockRank !== candidate.unlockRank) differences.push('unlock-rank-diff');
    }
    return {
      ...candidate,
      candidateId: `effect-candidate-${index + 1}`,
      existingEffectId: existing ? existing.effectId : null,
      differences,
      status: 'needs_review',
      verified: false,
    };
  });
}

function main() {
  const args = process.argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  };
  const cardId = get('--card-id');
  const inputPaths = args.reduce((items, arg, index) => arg === '--vision-json' ? items.concat(args[index + 1]) : items, []);
  if (!cardId || !inputPaths.length) throw new Error('--card-id と1件以上の --vision-json が必要です');
  const effectsDoc = JSON.parse(fs.readFileSync(path.join(REPO, EFFECTS_FILE), 'utf8'));
  if (!effectsDoc.cards[cardId]) throw new Error(`未知cardIdです: ${cardId}`);
  const allNames = Object.values(effectsDoc.cards).flatMap(group => group.effects.map(effect => effect.name));
  const groups = inputPaths.map(inputPath => {
    const parsed = parseEffectCandidates(visionLines(JSON.parse(fs.readFileSync(inputPath, 'utf8'))).lines, allNames);
    return parsed.candidates.map(candidate => ({ ...candidate, sourceScreenshots: [path.basename(inputPath)] }));
  });
  const candidates = compareWithExisting(mergeScreenshotCandidates(groups), effectsDoc.cards[cardId].effects);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, cardId, status: 'needs_review', verified: false, candidates }, null, 2)}\n`);
}

module.exports = {
  applyBackgroundAnalysis,
  classifyBackground,
  compareWithExisting,
  comparisonKey,
  detectUnlockRank,
  extractActivationConditions,
  mergeScreenshotCandidates,
  normalizeText,
  parseEffectCandidates,
  sanitizeEffectDescription,
  sanitizeEffectName,
  sanitizeOcrText,
  visionLines,
};

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`アシスト効果OCR: FAIL ${error.message}`); process.exit(1); }
}
