#!/usr/bin/env node

const assert = require('assert');
const {
  applyBackgroundAnalysis,
  classifyBackground,
  compareWithExisting,
  detectUnlockRank,
  extractActivationConditions,
  mergeScreenshotCandidates,
  normalizeText,
  parseEffectCandidates,
  sanitizeEffectDescription,
  sanitizeEffectName,
  sanitizeOcrText,
} = require('./assist-effect-ocr');

function test(name, callback) {
  try { callback(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

const line = (text, y, x = 100) => ({ text, bounds: { x, y, width: 280, height: 24 } });

test('normalizeTextは全角ローマ数字を保つ', () => {
  assert.strictEqual(normalizeText('効果Ⅱ'), '効果Ⅱ');
});

test('normalizeTextは全角括弧を保つ', () => {
  assert.strictEqual(normalizeText('（条件）'), '（条件）');
});

test('normalizeTextは全角英数を半角化する', () => {
  assert.strictEqual(normalizeText('ＡＢＣ１２３'), 'ABC123');
});

test('normalizeTextは全角空白を半角スペース1つに畳む', () => {
  assert.strictEqual(normalizeText('全角　空白'), '全角 空白');
});

test('normalizeTextは入力中の私用領域文字と衝突しない', () => {
  assert.strictEqual(normalizeText('\ue000効果Ⅱ（条件）'), '\ue000効果Ⅱ（条件）');
});

test('sanitizeOcrTextは縦棒をローマ数字Ⅱへ補正する', () => {
  assert.strictEqual(sanitizeOcrText('効果|+20%'), '効果Ⅱ+20%');
});

test('sanitizeOcrTextはMAX↑を除去する', () => {
  assert.strictEqual(sanitizeOcrText('攻撃力MAX↑アップ'), '攻撃力アップ');
});

test('sanitizeOcrTextは行頭の箇条書き記号を除去する', () => {
  assert.strictEqual(sanitizeOcrText('• 効果名'), '効果名');
});

test('sanitizeOcrTextは半角括弧を全角へ寄せる', () => {
  assert.strictEqual(sanitizeOcrText('効果アップ(重複不可)'), '効果アップ（重複不可）');
});

test('sanitizeOcrTextは英字のローマ数字を全角へ寄せる', () => {
  assert.strictEqual(sanitizeOcrText('修行効果アップ II'), '修行効果アップ Ⅱ');
  assert.strictEqual(sanitizeOcrText('修行効果アップ III'), '修行効果アップ Ⅲ');
});

test('sanitizeOcrTextは読点直後の空白と括弧前の空白を詰める', () => {
  assert.strictEqual(sanitizeOcrText('一致したとき、 上昇量アップ （重複不可）'), '一致したとき、上昇量アップ（重複不可）');
});

test('sanitizeEffectNameは+の直前を半角スペース1個にそろえる', () => {
  assert.strictEqual(sanitizeEffectName('トレ人数効果アップ+100%'), 'トレ人数効果アップ +100%');
  assert.strictEqual(sanitizeEffectName('アサルトボーナス II  +2'), 'アサルトボーナス Ⅱ +2');
});

test('sanitizeEffectDescriptionは+の前後の空白を除去する', () => {
  assert.strictEqual(sanitizeEffectDescription('素質アップ +2%'), '素質アップ+2%');
  assert.strictEqual(sanitizeEffectDescription('使用上限+ 1'), '使用上限+1');
});

test('sanitizeEffectDescriptionは複数行の改行を保持する', () => {
  assert.strictEqual(
    sanitizeEffectDescription('素質アップ +2%\n上昇量アップ+2'),
    '素質アップ+2%\n上昇量アップ+2',
  );
});

test('sanitizeOcrTextは中黒を保持する', () => {
  assert.strictEqual(sanitizeOcrText('赤・青のとき'), '赤・青のとき');
});

test('効果候補の経路でも全角ローマ数字と全角括弧を保つ', () => {
  const parsed = parseEffectCandidates([
    line('メンタルボーナスⅡ +1', 500),
    line('効果が上昇する（最大20%）', 535),
  ], ['メンタルボーナスⅡ+1']);
  assert.strictEqual(parsed.candidates[0].name, 'メンタルボーナスⅡ +1');
  assert.strictEqual(parsed.candidates[0].description, '効果が上昇する（最大20%）');
});

test('UIノイズを含むタイトル行でも効果候補を生成する', () => {
  const parsed = parseEffectCandidates([
    line('• 攻撃力MAX↑アップ', 500),
    line('赤・青のとき（条件）', 535),
  ], ['攻撃力アップ']);
  assert.strictEqual(parsed.candidates.length, 1);
  assert.strictEqual(parsed.candidates[0].name, '攻撃力アップ');
  assert.strictEqual(parsed.candidates[0].description, '赤・青のとき（条件）');
});

test('黄・金色背景をconditionalにする', () => {
  const result = classifyBackground(Array.from({ length: 12 }, () => ({ r: 247, g: 224, b: 158 })));
  assert.strictEqual(result.activationScope, 'conditional');
  assert.ok(result.confidence > 0.5);
});

test('白背景をuniversalにする', () => {
  const result = classifyBackground(Array.from({ length: 12 }, () => ({ r: 235, g: 232, b: 220 })));
  assert.strictEqual(result.activationScope, 'universal');
});

test('ヴィトニルの全体発動条件を主血統・副血統・オーラのOR条件として抽出する', () => {
  const description = '育成対象と主血統、副血統またはオーラが一致したとき、対象のすべての基礎ステータスを上限アップ。また主血統が一致したとき、オーラブリーダーの効果が発動する';
  const result = extractActivationConditions(description, 'conditional');
  assert.deepStrictEqual(result.activationConditions.expression, {
    operator: 'or',
    operands: [
      { type: 'mainBloodlineMatch' },
      { type: 'subBloodlineMatch' },
      { type: 'auraMatch' },
    ],
  });
  assert.strictEqual(result.activationConditions.sourceText, '育成対象と主血統、副血統またはオーラが一致したとき');
  assert.deepStrictEqual(result.issues, []);
});

test('白背景では説明中の一致条件を全体発動条件として抽出しない', () => {
  const result = extractActivationConditions('一緒にトレーニングしたとき、種族一致なら効果量アップ', 'universal');
  assert.strictEqual(result.activationConditions, null);
});

test('黄色背景解析時に単独のモン類一致を保持する', () => {
  const candidate = { description: '育成対象とモン類が一致したとき、人気度の上昇量アップ', issues: [] };
  const result = applyBackgroundAnalysis(candidate, Array.from({ length: 12 }, () => ({ r: 247, g: 224, b: 158 })));
  assert.deepStrictEqual(result.activationConditions.expression, { type: 'monTypeMatch' });
});

test('明示されたAND条件も論理式として保持する', () => {
  const result = extractActivationConditions('主血統およびオーラが一致したとき、効果量アップ', 'conditional');
  assert.deepStrictEqual(result.activationConditions.expression, {
    operator: 'and',
    operands: [{ type: 'mainBloodlineMatch' }, { type: 'auraMatch' }],
  });
});

test('モン類ブリーダー派生効果をモン類一致として保持する', () => {
  const result = extractActivationConditions(
    'ブリーダーが一緒にトレーニング時でも、アシスト効果が発動するようになる',
    'conditional',
    'モン類ブリーダー・継承',
  );
  assert.deepStrictEqual(result.activationConditions.expression, { type: 'monTypeMatch' });
  assert.strictEqual(result.activationConditions.sourceText, 'ブリーダーが一緒にトレーニング時でも');
  assert.strictEqual(result.activationConditions.basis, 'breeder-dependency');
  assert.deepStrictEqual(result.issues, []);
});

test('オーラブリーダー派生効果をオーラ一致として保持する', () => {
  const result = extractActivationConditions(
    'ブリーダーがトレーニングに出現時、発動中のトレ効果を上昇',
    'conditional',
    'オーラブリーダー・鍛錬',
  );
  assert.deepStrictEqual(result.activationConditions.expression, { type: 'auraMatch' });
  assert.strictEqual(result.activationConditions.basis, 'breeder-dependency');
});

test('青丸数から1凸を判定する', () => {
  const blue = { r: 20, g: 190, b: 210 };
  const gray = { r: 120, g: 105, b: 75 };
  assert.strictEqual(detectUnlockRank([blue, gray, gray, gray]).unlockRank, '1凸');
});

test('効果名と説明をカード単位に分割する', () => {
  const parsed = parseEffectCandidates([
    line('アシスト効果', 400),
    line('モン類名声ボーナス +20%', 500),
    line('育成対象とモン類一致したとき、人気度、忠誠度の上昇量アップ', 535),
    line('人気度、忠誠度に応じて大会勝利イベントの効果量アップ（最大50%）（重複不可）', 565),
    line('メンタルボーナスⅡ +1', 680),
    line('かしこさ、丈夫さの素質アップ+1%', 715),
    line('とじる', 900),
  ], ['モン類名声ボーナス+20%', 'メンタルボーナスⅡ+1']);
  assert.strictEqual(parsed.candidates.length, 2);
  assert.match(parsed.candidates[0].description, /大会勝利イベント/);
});

test('既存効果が揃うカードでは説明中の+数値を別効果へ誤分割しない', () => {
  const known = [
    '血統オーラ上限解放+60', 'モン類ブリーダー+60%', 'トレ効果アップ+10%',
    '忠誠度効果アップ+22%', 'メンタル上限アップ+120', 'モン類名声ボーナス+20%',
    'メンタルボーナスⅡ+1', 'モン類トレ共鳴・獣族+3%', '忠誠度効果アップ+15%',
    'モン類ブリーダー・鍛錬+', 'トレ効果アップ+8%', 'モン類ブリーダー・継承+',
  ];
  const parsed = parseEffectCandidates([
    line('モン類ブリーダー・鍛錬', 500),
    line('ブリーダートレ出現率+15%', 535),
    line('ブリーダーがトレーニングに出現時、発動中のトレ効果を25%上昇、応援効果+15%', 565),
    line('トレ効果アップ+8%', 680),
    line('一緒にトレーニングしたとき、基礎ステータスの上昇量アップ', 715),
  ], known);
  assert.strictEqual(parsed.candidates.length, 2);
  assert.match(parsed.candidates[0].description, /ブリーダートレ出現率\+15%/);
  assert.match(parsed.candidates[0].description, /応援効果\+15%/);
});

test('スクロール重複は説明が長い候補へ統合する', () => {
  const short = { name: '忠誠度効果アップ+22%', description: '忠誠度に応じて', activationScope: 'universal', unlockRank: '無凸', issues: [], sourceScreenshots: ['1.jpg'] };
  const full = { ...short, description: '忠誠度に応じて基礎ステータスの上昇量アップ', sourceScreenshots: ['2.jpg'] };
  const merged = mergeScreenshotCandidates([[short], [full]]);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].description, full.description);
  assert.deepStrictEqual(merged[0].sourceScreenshots, ['1.jpg', '2.jpg']);
});

test('既存DBの説明・解放段階差分を検出する', () => {
  const result = compareWithExisting([{
    name: 'モン類トレ共鳴・獣族+3%', description: '画像の完全な説明',
    activationScope: 'conditional', unlockRank: '1凸', issues: [],
  }], [{ effectId: 'test-e01', name: 'モン類トレ共鳴・獣族+3%', description: '短い説明', unlockRank: '2凸' }]);
  assert.deepStrictEqual(result[0].differences, ['description-diff', 'unlock-rank-diff']);
  assert.strictEqual(result[0].verified, false);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('OK アシスト効果OCR 30ケース');
