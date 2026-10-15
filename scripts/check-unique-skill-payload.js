#!/usr/bin/env node

// 専用技の読取結果（Claudeが unique_pack.py の束から起こしたJSON）を検査し、TSVへ追記できる形にする。
//   node scripts/check-unique-skill-payload.js <payload.json> --pack <束フォルダ> [--apply] [--report <out.md>]
//
// 設計は docs/unique-skill-cloud-design.md の4章。モデルが読むのは文字だけで、
// 間合い・モンスター・血統は束の manifest.json から決める（モデルの読みを使わない）。
//
// 入力（読取JSON）:
//   { "schema": 1, "pack": "<束フォルダ名>", "monster": "ミリム・リゾート",
//     "skills": [{ "pack": "s01", "name", "rank", "aura", "auraSure"?, "skillType", "guts", "moveTo",
//                  "damage", "accuracy", "gutsDown", "critical",
//                  "abilities": [{ "name", "unlock": null | { "monster", "stars" } | "?" }] }],
//     "abilityTexts": [{ "name", "description" }] }
//   読めない値は null。推測で埋めない。オーラの白／黒に迷ったら auraSure: false。
//
// 判定:
//   FAIL  形式の誤り・読めない値（null）。直して出し直す
//   STOP  入力者に聞く（自分で決めない）。--apply しない。PR を draft にし、レポートの質問を本文に書く
//   NOTE  PR 本文に書くだけ（同名の共通技が他血統にある、表記ゆれを登録済みの文面にそろえた、など）
// 終了コード: 0＝追記できる / 1＝FAIL / 2＝STOP

const fs = require('fs');
const path = require('path');
const {
  SKILL_RANGES, SKILL_RANKS, SKILL_AURAS, SKILL_GRADE_PATTERN, SKILL_RARITY_MIN, SKILL_RARITY_MAX,
} = require('../build');

const REPO = path.resolve(__dirname, '..');
const SKILL_DB = 'src/data/monster-skills.json';
const ABILITY_DB = 'src/data/skill-abilities.json';
const MONSTER_IDS = 'src/data/monster-ids.json';
const ABILITY_TSV = 'src/data/_source/skill-abilities.tsv';
const SOURCE_DIR = 'src/data/_source';
const SCHEMA = 1;
const SKILL_TYPES = ['ちから', 'かしこさ'];
const GRADE_KEYS = ['damage', 'accuracy', 'gutsDown', 'critical'];
const GRADE_LABELS = { damage: 'ダメージ', accuracy: '命中率', gutsDown: 'ガッツダウン', critical: 'クリティカル率' };
const ABILITY_SLOTS = 5;

const readJson = file => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8'));
const norm = text => String(text).normalize('NFKC').replace(/\s+/g, '');

function monsterList() {
  const raw = readJson(MONSTER_IDS);
  const rows = [];
  const walk = v => (Array.isArray(v) ? v.forEach(walk) : v && typeof v === 'object' && (v.name && v.id ? rows.push(v) : Object.values(v).forEach(walk)));
  walk(raw);
  return rows;
}

function latest(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!map.has(key) || map.get(key).version < row.version) map.set(key, row);
  }
  return map;
}

function check(payload, manifest) {
  const fail = [];
  const stop = [];
  const note = [];
  const monsters = monsterList();
  const byName = new Map(monsters.map(m => [m.name, m]));
  const skills = readJson(SKILL_DB).skills;
  const abilities = latest(readJson(ABILITY_DB).abilities, a => a.name);
  const owner = manifest.monster;

  if (payload.schema !== SCHEMA) fail.push(`schema は ${SCHEMA} です: ${payload.schema}`);
  if (payload.monster !== owner.name) fail.push(`monster が束と違います: 読取「${payload.monster}」／束「${owner.name}」`);
  if (payload.pack && payload.pack !== path.basename(manifest.dir)) fail.push(`pack が束フォルダ名と違います: ${payload.pack}`);
  if (!Array.isArray(payload.skills) || !payload.skills.length) fail.push('skills が空です');

  const packSkills = new Map(manifest.skills.map(s => [`s${String(s.no).padStart(2, '0')}`, s]));
  const seenPack = new Set();
  const texts = new Map();
  for (const t of payload.abilityTexts || []) {
    if (!t || typeof t.name !== 'string' || !t.name) { fail.push('abilityTexts に name の無い行があります'); continue; }
    if (t.description === null || t.description === undefined || t.description === '') {
      fail.push(`技能力「${t.name}」の本文が読めていません（null）`);
      continue;
    }
    if (/<\/?[A-Za-z][^>]*>/.test(t.description)) fail.push(`技能力「${t.name}」の本文にHTMLタグがあります`);
    if (/\t/.test(t.description)) { fail.push(`技能力「${t.name}」の本文にタブがあります（TSVが壊れます）`); continue; }
    // 改行は TSV では `\n`（バックスラッシュ＋n の2文字）で持つ。JSONに本物の改行で書かれていたらそろえる
    if (/[\r\n]/.test(t.description)) {
      t.description = t.description.replace(/\r\n|\r|\n/g, '\\n');
      note.push(`技能力「${t.name}」の本文の改行を \\n にそろえました（読取JSONでは \\\\n と書く）`);
    }
    if (texts.has(t.name) && norm(texts.get(t.name)) !== norm(t.description)) {
      stop.push(`技能力「${t.name}」の本文が束の中で2通りに読めています。どちらが正しいか確認してください`);
    }
    texts.set(t.name, t.description);
  }

  const rows = [];
  const newAbilities = new Map();
  const usedAbilityNames = new Set();
  for (const [i, s] of (payload.skills || []).entries()) {
    const where = `技${i + 1}「${s && s.name}」`;
    const p = packSkills.get(s && s.pack);
    if (!p) { fail.push(`${where}: pack「${s && s.pack}」が束にありません`); continue; }
    if (seenPack.has(s.pack)) fail.push(`${where}: pack「${s.pack}」が2回出ています`);
    seenPack.add(s.pack);
    for (const key of ['name', 'rank', 'aura', 'skillType', 'guts', ...GRADE_KEYS]) {
      if (s[key] === null || s[key] === undefined || s[key] === '') fail.push(`${where}: ${key} が読めていません（null）`);
    }
    if (!('moveTo' in s)) fail.push(`${where}: moveTo がありません（移動しない技は null）`);
    const range = p.range;
    if (!SKILL_RANKS.includes(s.rank)) fail.push(`${where}: rank は ${SKILL_RANKS.join('/')} です: ${s.rank}`);
    if (s.aura != null && !SKILL_AURAS.includes(s.aura)) fail.push(`${where}: aura は ${SKILL_AURAS.join('/')} です: ${s.aura}`);
    if (s.auraSure === false) stop.push(`${where}: オーラを「${s.aura}」と読みましたが、白か黒か決めきれません（s${String(p.no).padStart(2, '0')}-aura.png）`);
    if (s.skillType != null && !SKILL_TYPES.includes(s.skillType)) fail.push(`${where}: skillType は ${SKILL_TYPES.join('/')} です: ${s.skillType}`);
    if (s.guts != null && !(Number.isInteger(s.guts) && s.guts > 0 && s.guts < 100)) fail.push(`${where}: guts が数字として不自然です: ${s.guts}`);
    if (s.moveTo != null && !SKILL_RANGES.includes(s.moveTo)) fail.push(`${where}: moveTo は ${SKILL_RANGES.join('/')} か null です: ${s.moveTo}`);
    if (s.moveTo === range) fail.push(`${where}: moveTo が発動間合い（${range}）と同じです。移動しない技は null`);
    for (const key of GRADE_KEYS) {
      if (s[key] != null && !SKILL_GRADE_PATTERN.test(s[key])) fail.push(`${where}: ${GRADE_LABELS[key]} は SS〜G（+付き可）です: ${s[key]}`);
    }

    // 同じ名前の技
    const sameBlood = skills.filter(k => k.blood === owner.blood && k.name === s.name);
    if (sameBlood.length) {
      const mine = sameBlood.filter(k => k.unique && k.owners.includes(owner.id));
      stop.push(mine.length
        ? `${where}: ${owner.name}の専用技として登録済みです（${mine.map(k => `${k.skillId} v${k.version}`).join('・')}）。ゲーム側の更新（版を積む）か、二重登録か確認してください`
        : `${where}: ${owner.blood}種に同じ名前の技が登録済みです（${sameBlood.map(k => k.skillId).join('・')}）。専用技ではなく共通技かもしれません`);
    }
    const otherBlood = [...new Set(skills.filter(k => k.blood !== owner.blood && k.name === s.name).map(k => k.blood))];
    if (otherBlood.length) note.push(`${where}: 同じ名前の技が他の血統にあります（${otherBlood.join('・')}）。別の技として登録します`);
    const common = skills.filter(k => k.blood === owner.blood && !k.unique && k.name !== s.name && s.name.startsWith(k.name) && /^[・：:]/.test(s.name.slice(k.name.length)));
    if (common.length) stop.push(`${where}: ${owner.blood}種の共通技「${common[0].name}」＋接尾辞の形です。共通技の可能性があるので確認してください`);

    // 技能力
    const abilityCells = [];
    const list = Array.isArray(s.abilities) ? s.abilities : [];
    if (list.length > ABILITY_SLOTS) fail.push(`${where}: 技能力は${ABILITY_SLOTS}つまでです`);
    for (const a of list) {
      if (!a || !a.name) { fail.push(`${where}: 技能力の名前が読めていません`); continue; }
      usedAbilityNames.add(a.name);
      const known = abilities.get(a.name);
      const text = texts.get(a.name);
      if (known && text !== undefined) {
        if (known.description === text.replace(/\\n/g, '\n')) {
          // 一致。参照するだけ
        } else if (norm(known.description) === norm(text.replace(/\\n/g, '\n'))) {
          note.push(`技能力「${a.name}」: 表記ゆれだけの違いなので登録済みの文面（${known.abilityId} v${known.version}）を使います`);
        } else {
          stop.push(`技能力「${a.name}」: 登録済みの文面と違います。ゲーム側の更新（版を積む）か、血統で内容が違う同名別物か確認してください\n` +
            `    登録済み（${known.abilityId} v${known.version}）: ${known.description.replace(/\n/g, '\\n')}\n    今回の読取: ${text}`);
        }
      } else if (!known) {
        if (text === undefined) fail.push(`${where}: 技能力「${a.name}」は未登録で、abilityTexts に本文がありません（能力詳細の画面が束に無い？）`);
        else newAbilities.set(a.name, text);
      }
      let unlock = '';
      if (a.unlock === '?') {
        unlock = '?';
        stop.push(`${where}: 技能力「${a.name}」の解放条件が読めていません`);
      } else if (a.unlock) {
        const m = byName.get(a.unlock.monster);
        if (!m) fail.push(`${where}: 解放条件のモンスター「${a.unlock.monster}」が monster-ids.json にありません`);
        if (!(Number.isInteger(a.unlock.stars) && a.unlock.stars >= SKILL_RARITY_MIN && a.unlock.stars <= SKILL_RARITY_MAX)) {
          fail.push(`${where}: 解放条件の★は ${SKILL_RARITY_MIN}〜${SKILL_RARITY_MAX} です（ピンク星は数＋5）: ${a.unlock.stars}`);
        }
        if (m && m.name !== owner.name) note.push(`${where}: 技能力「${a.name}」の解放条件が${owner.name}以外（${m.name}）です`);
        unlock = `${a.unlock.monster}:${a.unlock.stars}`;
      }
      abilityCells.push([a.name, unlock]);
    }
    rows.push({ pack: s.pack, range, dim: p.dim, s, abilityCells });
  }
  for (const key of packSkills.keys()) if (!seenPack.has(key)) fail.push(`束の ${key} が読取にありません（読み飛ばし？）`);
  for (const name of texts.keys()) if (!usedAbilityNames.has(name)) note.push(`abilityTexts の「${name}」はどの技にも付いていません。使いません`);
  return { fail, stop, note, rows, newAbilities, owner };
}

function skillTsvLine(header, row, owner) {
  const s = row.s;
  const cell = {
    blood: owner.blood, range: row.range, rank: s.rank, name: s.name, aura: s.aura, skillType: s.skillType,
    guts: s.guts, moveTo: s.moveTo || '', damage: s.damage, accuracy: s.accuracy, gutsDown: s.gutsDown, critical: s.critical,
    unique: 1, owners: owner.name,
  };
  row.abilityCells.forEach(([name, unlock], i) => {
    cell[`ability${i + 1}`] = name;
    cell[`ability${i + 1}Unlock`] = unlock;
  });
  return header.map(col => (cell[col] === undefined ? '' : String(cell[col]))).join('\t');
}

function report(result, manifest) {
  const { rows, newAbilities, owner, stop, note } = result;
  const lines = [`## ${owner.name}（${owner.id}・${owner.blood}種）の専用技 ${rows.length}件`, '',
    '| 束 | 技名 | ランク | 間合い | オーラ | 技種 | ガッツ | 移動 | ダメ/命中/GD/クリ | 技能力（解放条件） |',
    '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const s = r.s;
    const abil = r.abilityCells.map(([n, u]) => (u ? `${n}（${u}）` : n)).join('、') || 'なし';
    lines.push(`| ${r.pack} | ${s.name} | ${s.rank} | ${r.range} | ${s.aura} | ${s.skillType} | ${s.guts} | ${s.moveTo || 'なし'} | ` +
      `${GRADE_KEYS.map(k => s[k]).join(' / ')} | ${abil} |`);
  }
  lines.push('', `間合いは束の「選択中のマスの列」から決めました（読取は使っていません）。`);
  if (newAbilities.size) {
    lines.push('', `### 新しい技能力 ${newAbilities.size}件`, '', '| 名前 | 本文 |', '|---|---|');
    for (const [n, t] of newAbilities) lines.push(`| ${n} | ${t} |`);
  }
  if (stop.length) lines.push('', '### 確認してほしいこと（取り込みは止めています）', '', ...stop.map(x => `- ${x}`));
  if (note.length) lines.push('', '### 注記', '', ...note.map(x => `- ${x}`));
  if (manifest.dropped && manifest.dropped.length) lines.push('', `重複として外した画像：${manifest.dropped.length}枚`);
  return lines.join('\n') + '\n';
}

function apply(result) {
  const slug = monsterList().find(m => m.id === result.owner.id).bloodSlug;
  let file = path.join(REPO, SOURCE_DIR, `skills-${slug}.tsv`);
  if (!fs.existsSync(file)) fs.copyFileSync(path.join(REPO, SOURCE_DIR, 'skills-template.tsv'), file);
  const text = fs.readFileSync(file, 'utf8');
  const header = text.split('\n')[0].split('\t');
  const add = result.rows.map(r => skillTsvLine(header, r, result.owner));
  fs.writeFileSync(file, text.replace(/\n*$/, '\n') + add.join('\n') + '\n');
  const abilityFile = path.join(REPO, ABILITY_TSV);
  const aText = fs.readFileSync(abilityFile, 'utf8');
  const aHeader = aText.split('\n')[0].split('\t');
  const aAdd = [...result.newAbilities].map(([name, description]) => aHeader.map(c => ({ name, description }[c] || '')).join('\t'));
  if (aAdd.length) fs.writeFileSync(abilityFile, aText.replace(/\n*$/, '\n') + aAdd.join('\n') + '\n');
  return { skillFile: path.relative(REPO, file), skills: add.length, abilities: aAdd.length };
}

function main() {
  const args = process.argv.slice(2);
  const opt = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const payloadFile = args.find(a => !a.startsWith('--') && a !== opt('--pack') && a !== opt('--report'));
  const packDir = opt('--pack');
  if (!payloadFile || !packDir) {
    console.error('使い方: node scripts/check-unique-skill-payload.js <payload.json> --pack <束フォルダ> [--apply] [--report <out.md>]');
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'manifest.json'), 'utf8'));
  manifest.dir = path.resolve(packDir);
  const result = check(payload, manifest);

  for (const x of result.fail) console.log(`FAIL ${x}`);
  for (const x of result.stop) console.log(`STOP ${x}`);
  for (const x of result.note) console.log(`NOTE ${x}`);
  if (opt('--report')) fs.writeFileSync(opt('--report'), report(result, manifest));
  if (result.fail.length) { console.log(`\nFAIL ${result.fail.length}件。読取JSONを直して出し直してください`); process.exit(1); }
  if (result.stop.length) { console.log(`\nSTOP ${result.stop.length}件。入力者に聞くまでTSVへ書きません`); process.exit(2); }
  console.log(`\nOK 技${result.rows.length}件・新しい技能力${result.newAbilities.size}件`);
  if (args.includes('--apply')) {
    const done = apply(result);
    console.log(`追記しました: ${done.skillFile} に${done.skills}行、${ABILITY_TSV} に${done.abilities}行`);
    console.log('次に node scripts/import-skills-tsv.js && node build.js && node scripts/verify.js');
  }
}

if (require.main === module) main();
module.exports = { check, skillTsvLine };
