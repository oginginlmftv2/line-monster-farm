#!/usr/bin/env node
/** 技DB検査の正常ケースと破壊ケースを確認する。本番DBは書き換えない。 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  SKILL_RANGES,
  SKILL_RANKS,
  SKILL_AURAS,
  SKILL_GRADE_PATTERN,
  SKILL_RARITY_MIN,
  SKILL_RARITY_MAX,
  SKILL_BUFF_KINDS,
  validateSkillData,
  detectBuffs,
} = require('../build');

const repo = path.resolve(__dirname, '..');
const idsJson = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/monster-ids.json'), 'utf8'));

// fixtureは実在の血統・モンスターを使う。参照検査が意味を持つようにするため。
const blood = 'キュービ';
const members = idsJson.monsters.filter(monster => monster.blood === blood);
assert(members.length >= 2, `${blood}種のfixtureモンスターが不足`);
const otherBloodMonster = idsJson.monsters.find(monster => monster.blood !== blood);
assert(otherBloodMonster, '別血統のfixtureモンスターが見つからない');

const abilityDb = () => ({
  schemaVersion: 1,
  abilities: [
    { abilityId: 'sab-0001', name: 'ライフ上昇[小]', version: 1, baseName: 'ライフ上昇[小]', level: null, description: '効果テキスト', tags: [], buffs: [], sortOrder: 1, status: 'verified' },
    { abilityId: 'sab-0002', name: '狩の印Lv2', version: 1, baseName: '狩の印', level: 2, description: '効果テキスト\n2行目', tags: [], buffs: [], sortOrder: 2, status: 'verified' },
  ],
});

const buffDb = () => ({
  schemaVersion: 1,
  buffs: [
    { buffId: 'bf-0001', name: '霊魂', kind: 'バフ', description: '消費ガッツが変わる', note: '最大Lv9まで累積', sortOrder: 1 },
    { buffId: 'bf-0002', name: '火傷', kind: 'デバフ', description: '被ダメージが上がる', note: '', sortOrder: 2 },
  ],
});

const baseSkill = () => ({
  skillId: 'sk-0001',
  name: '影撃',
  version: 1,
  blood,
  range: '遠',
  rank: 2,
  moveTo: '零',
  aura: '黒',
  skillType: 'ちから',
  guts: 23,
  damage: 'E',
  accuracy: 'B',
  gutsDown: 'G',
  critical: 'B',
  abilities: [{ abilityId: 'sab-0001', unlock: null }, { abilityId: 'sab-0002', unlock: { monsterId: members[0].id, level: 8 } }],
  icon: null,
  unique: false,
  owners: [],
  unlockedBy: [{ monsterId: members[0].id, rarity: 4 }],
  note: '',
  sortOrder: 1,
  status: 'verified',
});

const uniqueSkill = () => ({
  ...baseSkill(),
  skillId: 'sk-0002',
  name: '固有技',
  rank: 3,
  moveTo: null,
  unique: true,
  owners: [members[0].id, members[1].id],
  sortOrder: 2,
});

const skillDb = skills => ({ schemaVersion: 1, skills });

let normal = 0;
const passNormal = label => { normal++; console.log(`PASS 正常${normal}: ${label}`); };

// ---------------------------------------------------------------- 正常
{
  const result = validateSkillData(skillDb([baseSkill(), uniqueSkill()]), abilityDb(), idsJson);
  assert.strictEqual(result.skills.length, 2);
  assert.strictEqual(result.abilities.length, 2);
  passNormal('共通技と固有技が並存できる');
}
{
  validateSkillData(skillDb([]), abilityDb(), idsJson);
  passNormal('技0件でも通る（血統ページを生成しないだけ）');
}
{
  // 同じ間合い・ランクでも、共通技1件＋固有技は許す（1セルに複数技が並ぶ）
  const common = baseSkill();
  const solo = { ...uniqueSkill(), rank: common.rank, range: common.range };
  validateSkillData(skillDb([common, solo]), abilityDb(), idsJson, buffDb());
  passNormal('同一セルに共通技1件と固有技を置ける');
}
{
  const skill = { ...baseSkill(), damage: 'S+', accuracy: 'A+', gutsDown: null, critical: 'G' };
  validateSkillData(skillDb([skill]), abilityDb(), idsJson, buffDb());
  passNormal('評価は + 付きと null を受理する');
}
{
  assert(SKILL_GRADE_PATTERN.test('B+') && SKILL_GRADE_PATTERN.test('G'));
  assert(!SKILL_GRADE_PATTERN.test('SS') && !SKILL_GRADE_PATTERN.test('H') && !SKILL_GRADE_PATTERN.test('++'));
  passNormal('評価パターンが S+〜G だけを受理する');
}
{
  const skill = { ...baseSkill(), unlockedBy: [{ monsterId: members[0].id, rarity: SKILL_RARITY_MIN }, { monsterId: members[1].id, rarity: SKILL_RARITY_MAX }] };
  validateSkillData(skillDb([skill]), abilityDb(), idsJson, buffDb());
  passNormal(`解放元は複数持てて★${SKILL_RARITY_MIN}〜${SKILL_RARITY_MAX}を受理する`);
}
{
  assert.deepStrictEqual(SKILL_RANGES, ['遠', '中', '近', '零']);
  assert.deepStrictEqual(SKILL_RANKS, [1, 2, 3, 4, 5, 6]);
  assert(SKILL_AURAS.includes('無') && SKILL_AURAS.length === 7);
  passNormal('間合い4値・ランク6段・オーラ7値（無を含む）');
}

{
  // 旧版は同じ間合い・ランクに居続けるので、共通枠の重複判定は最新版だけで行う
  const v1 = baseSkill();
  const v2 = { ...baseSkill(), version: 2, guts: 30 };
  const result = validateSkillData(skillDb([v1, v2]), abilityDb(), idsJson, buffDb());
  assert.strictEqual(result.skills.length, 2);
  assert.deepStrictEqual(result.currentSkills.map(skill => skill.version), [2]);
  passNormal('技は同名を版として積め、表示対象は最新版だけになる');
}
{
  // 技能力も同じ仕組み。同名で説明が違うのはバージョン違いとして正常
  const abilities = [
    abilityDb().abilities[0],
    { ...abilityDb().abilities[0], version: 2, description: '更新後の効果テキスト' },
    abilityDb().abilities[1],
  ];
  const result = validateSkillData(skillDb([baseSkill()]), { schemaVersion: 1, abilities }, idsJson, buffDb());
  assert.deepStrictEqual(result.currentAbilities.map(a => a.version), [2, 1]);
  assert.strictEqual(result.currentAbilities[0].description, '更新後の効果テキスト');
  passNormal('技能力も同名を版として積め、表示対象は最新版だけになる');
}
{
  const abilities = abilityDb().abilities.map(a => ({ ...a, buffs: ['bf-0001'] }));
  const result = validateSkillData(skillDb([baseSkill()]), { schemaVersion: 1, abilities }, idsJson, buffDb());
  assert.strictEqual(result.buffs.length, 2);
  assert.deepStrictEqual(SKILL_BUFF_KINDS, ['バフ', 'デバフ']);
  passNormal('技能力にバフIDを持たせられる');
}
{
  // バフ判定はテキストの完全一致だけ。角括弧の中身と、能力名から接頭辞とLvを外したもの
  const byName = new Map(buffDb().buffs.map(buff => [buff.name, buff]));
  const detected = detectBuffs({ name: '疫：火傷Lv1', description: '対象技命中時、相手に[火傷Lv1＜20秒＞]を付与＜1回＞' }, byName);
  assert.deepStrictEqual(detected.buffs, ['bf-0002']);
  assert.deepStrictEqual(detected.unknown, []);
  const fromName = detectBuffs({ name: '祝：霊魂Lv8', description: '対象技発動時、自身に[霊魂]を付与' }, byName);
  assert.deepStrictEqual(fromName.buffs, ['bf-0001']);
  const noise = detectBuffs({ name: '背水Lv4', description: '[終盤]残りライフが少ないほど上昇[最大40%]' }, byName);
  assert.deepStrictEqual(noise.buffs, []);
  assert.deepStrictEqual(noise.unknown, [], '条件語と数値注記は未登録候補に混ぜない');
  const unknown = detectBuffs({ name: '謎の力', description: '相手に[封印]を付与' }, byName);
  assert.deepStrictEqual(unknown.unknown, ['封印'], '未登録のバフ候補は報告する');
  passNormal('バフ判定は完全一致だけを拾い、未登録の候補を報告する');
}

// ---------------------------------------------------------------- 破壊
const broken = [
  ['同じskillId・同じversionが2件', [baseSkill(), { ...baseSkill(), name: '別の技', rank: 5 }], abilityDb(), /同じ skillId に同じ version が2件/],
  ['skillIdの書式違反', [{ ...baseSkill(), skillId: 'skill-1' }], abilityDb(), /skillId が sk-####/],
  ['未知の血統', [{ ...baseSkill(), blood: 'ドラゴンもどき' }], abilityDb(), /blood が未知/],
  ['範囲外のランク', [{ ...baseSkill(), rank: 7 }], abilityDb(), /rank は1〜6/],
  ['範囲外の間合い', [{ ...baseSkill(), range: '超遠' }], abilityDb(), /range は/],
  ['未知のオーラ', [{ ...baseSkill(), aura: '虹' }], abilityDb(), /aura は/],
  ['不正な評価', [{ ...baseSkill(), damage: 'SS' }], abilityDb(), /damage は S\+〜G/],
  ['moveToがrangeと同じ', [{ ...baseSkill(), moveTo: '遠' }], abilityDb(), /moveTo が range と同じ/],
  ['未解決の技能力ID', [{ ...baseSkill(), abilities: [{ abilityId: 'sab-9999', unlock: null }] }], abilityDb(), /未解決の能力ID/],
  ['技能力が文字列のまま', [{ ...baseSkill(), abilities: ['sab-0001'] }], abilityDb(), /\{ abilityId, unlock \}/],
  ['技能力のunlockが欠落', [{ ...baseSkill(), abilities: [{ abilityId: 'sab-0001' }] }], abilityDb(), /unlock は条件が無ければ null/],
  ['技能力の解放レベルが範囲外', [{ ...baseSkill(), abilities: [{ abilityId: 'sab-0001', unlock: { monsterId: members[0].id, level: 0 } }] }], abilityDb(), /解放レベルは★1〜10/],
  ['技能力の解放元が存在しない', [{ ...baseSkill(), abilities: [{ abilityId: 'sab-0001', unlock: { monsterId: '9999', level: 5 } }] }], abilityDb(), /解放条件に存在しないモンスターID/],
  ['同じ技に同じ能力が2回', [{ ...baseSkill(), abilities: [{ abilityId: 'sab-0001', unlock: null }, { abilityId: 'sab-0001', unlock: null }] }], abilityDb(), /同じ能力が2回/],
  ['同名なのにabilityIdが違う', [baseSkill()], { schemaVersion: 1, abilities: [abilityDb().abilities[0], { ...abilityDb().abilities[0], abilityId: 'sab-0009', description: '別の説明' }] }, /同じ名前に abilityId が2つ/],
  ['存在しない解放元モンスター', [{ ...baseSkill(), unlockedBy: [{ monsterId: '9999', rarity: 4 }] }], abilityDb(), /unlockedBy に存在しないモンスターID/],
  ['解放レアリティが範囲外', [{ ...baseSkill(), unlockedBy: [{ monsterId: members[0].id, rarity: 11 }] }], abilityDb(), /rarity は★1〜10/],
  ['解放レアリティが欠落', [{ ...baseSkill(), unlockedBy: [members[0].id] }], abilityDb(), /\{ monsterId, rarity \}/],
  ['固有技なのにownersが空', [{ ...uniqueSkill(), owners: [] }], abilityDb(), /owners を1件以上/],
  ['共通技なのにownersがある', [{ ...baseSkill(), owners: [members[0].id] }], abilityDb(), /owners は空配列/],
  ['ownersが別血統のモンスター', [{ ...uniqueSkill(), owners: [otherBloodMonster.id] }], abilityDb(), /一致しません/],
  ['同一セルに共通技が2件', [baseSkill(), { ...baseSkill(), skillId: 'sk-0003', name: '重複枠' }], abilityDb(), /共通技が2件/],
  ['同じabilityId・同じversionが2件', [baseSkill()], { schemaVersion: 1, abilities: [abilityDb().abilities[0], abilityDb().abilities[0]] }, /同じ abilityId に同じ version が2件/],
  ['技のversionが0', [{ ...baseSkill(), version: 0 }], abilityDb(), /version は1以上の整数/],
  ['技のversionが欠番', [baseSkill(), { ...baseSkill(), version: 3, guts: 30 }], abilityDb(), /version が1からの連番/],
  ['隣り合う版で技の内容が同じ', [baseSkill(), { ...baseSkill(), version: 2 }], abilityDb(), /内容が同じです/],
  ['隣り合う版で技能力の内容が同じ', [baseSkill()], { schemaVersion: 1, abilities: [abilityDb().abilities[0], { ...abilityDb().abilities[0], version: 2 }] }, /内容が同じです/],
  ['同じ名前に別のskillId', [baseSkill(), { ...baseSkill(), skillId: 'sk-0009', version: 2, guts: 30 }], abilityDb(), /skillId が2つあります/],
  ['存在しないバフID', [baseSkill()], { schemaVersion: 1, abilities: abilityDb().abilities.map(a => ({ ...a, buffs: ['bf-9999'] })) }, /存在しないバフID/],
  ['能力の説明が空', [baseSkill()], { schemaVersion: 1, abilities: abilityDb().abilities.map(a => ({ ...a, description: '' })) }, /description が空/],
];

broken.forEach(([label, skills, abilities, pattern], index) => {
  assert.throws(
    () => validateSkillData(skillDb(skills), abilities, idsJson, buffDb()),
    pattern,
    `破壊${index + 1}（${label}）が拒否されていない`
  );
  console.log(`PASS 破壊${index + 1}: ${label} → validateSkillDataがthrow`);
});

console.log(`OK 正常${normal}件PASS・破壊${broken.length}件すべて拒否`);
