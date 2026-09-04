#!/usr/bin/env node
/**
 * スプレッドシートから書き出したTSVを技DBへ取り込む。
 *
 *   node scripts/import-skills-tsv.js <skills.tsv> <skill-abilities.tsv>
 *   node scripts/import-skills-tsv.js <skills.tsv> <skill-abilities.tsv> --dry
 *
 * シートにはモンスター名で書く（356体すべて名前が一意）。IDへの変換はここで行う。
 * skillId / abilityId は空欄でよい。既存DBに同じ技・能力があればそのIDを引き継ぎ、
 * 無いものだけ採番する。IDは血統ページ内のアンカーなので、無用に振り直さない。
 */

const fs = require('fs');
const path = require('path');
const {
  validateSkillData, detectBuffs, SKILL_BUFF_KINDS, SKILL_RARITY_MIN, SKILL_RARITY_MAX,
} = require('../build');

const REPO = path.resolve(__dirname, '..');
const SKILL_DB = 'src/data/monster-skills.json';
const ABILITY_DB = 'src/data/skill-abilities.json';
const BUFF_DB = 'src/data/skill-buffs.json';
const BUFF_TSV = 'src/data/_source/buffs.tsv';   // バフ・デバフは血統をまたぐので1枚
const ABILITY_SLOTS = 4;   // ability1〜4 と ability1Unlock〜4Unlock

function readTsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (!lines.length) throw new Error(`${file}: 中身がありません`);
  const header = lines[0].split('\t').map(cell => cell.trim());
  return lines.slice(1).map((line, index) => {
    const cells = line.split('\t');
    const row = { _line: index + 2 };
    header.forEach((key, column) => { row[key] = (cells[column] || '').trim(); });
    return row;
  });
}

const readJson = rel => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
const nextId = (prefix, used) => {
  let n = 1;
  while (used.has(`${prefix}-${String(n).padStart(4, '0')}`)) n++;
  const id = `${prefix}-${String(n).padStart(4, '0')}`;
  used.add(id);
  return id;
};
const orNull = value => (value === '' ? null : value);
const isTrue = value => /^(1|true|TRUE|○|●|はい|固有)$/.test(value);

// 同名は上書きせずバージョンとして積む。version 列が空欄なら、
// TSV内で同じ名前が出てきた順に 1, 2, 3… を振る（新しい行を末尾に足すだけでよい）。
function assignVersions(rows, keyOf, where, errors) {
  const counters = new Map();
  const groups = new Map();
  const versions = rows.map(row => {
    const key = keyOf(row);
    const seen = (counters.get(key) || 0) + 1;
    counters.set(key, seen);
    const raw = String(row.version || '').trim();
    let version = seen;
    if (raw) {
      version = Number(raw);
      if (!Number.isInteger(version) || version < 1) {
        errors.push(`${where}:${row._line}: version は1以上の整数です: ${raw}`);
        version = seen;
      }
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(version);
    return version;
  });
  for (const [key, list] of groups) {
    if (new Set(list).size !== list.length) {
      errors.push(`${where}: ${key} に同じ version が2件あります（${list.join(', ')}）`);
    }
  }
  return { versions, groups };
}

// 同じ技・技能力が複数版になったことを、確認を求めずそのまま報告する。
function reportVersionGroups(groups, label, oldVersionCount, formatKey = key => key) {
  const lines = [];
  for (const [key, list] of groups) {
    const max = Math.max(...list);
    const name = formatKey(key);
    if (list.length > 1) lines.push(`  ${label} ${name}：v${list.slice().sort((a, b) => a - b).join(' → v')}（表示は v${max}）`);
    const before = oldVersionCount.get(key) || 0;
    if (before > list.length) {
      lines.push(`  ⚠ ${label} ${name}：DBには${before}版あるのにTSVは${list.length}行です。取り込むと古い版が消えます`);
    }
  }
  return lines;
}

function main() {
  const [skillsTsv, abilitiesTsv] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const dryRun = process.argv.includes('--dry');
  if (!skillsTsv || !abilitiesTsv) {
    throw new Error('使い方: node scripts/import-skills-tsv.js <skills.tsv> <skill-abilities.tsv> [--dry]');
  }

  const ids = readJson('src/data/monster-ids.json');
  const monsterByName = new Map(ids.monsters.map(monster => [monster.name, monster]));
  const oldSkills = readJson(SKILL_DB).skills || [];
  const oldAbilities = readJson(ABILITY_DB).abilities || [];
  const errors = [];
  const notes = [];

  // ---------------------------------------------------------------- バフ・デバフ
  // ゲーム内ヘルプの共通の状態。技能力テキストの [霊魂] などと結ぶための辞書。
  const buffTsv = path.join(REPO, BUFF_TSV);
  const buffRows = fs.existsSync(buffTsv) ? readTsv(buffTsv) : [];
  const usedBuffIds = new Set();
  const buffs = buffRows.map((row, index) => {
    const where = `${BUFF_TSV}:${row._line}`;
    if (!row.name) errors.push(`${where}: name が空です`);
    if (!row.description) errors.push(`${where}: description が空です`);
    if (!SKILL_BUFF_KINDS.includes(row.kind)) {
      errors.push(`${where}: kind は ${SKILL_BUFF_KINDS.join('/')} です: ${row.kind}`);
    }
    return {
      buffId: row.buffId || nextId('bf', usedBuffIds),
      name: row.name,
      kind: row.kind,
      description: (row.description || '').replace(/\\n/g, '\n'),
      note: (row.note || '').replace(/\\n/g, '\n'),
      sortOrder: index + 1,
    };
  });
  const buffByName = new Map(buffs.map(buff => [buff.name, buff]));

  // ---------------------------------------------------------------- 技能力
  // abilityId は名前（バージョングループ）に対して1つ。版が増えても参照は動かさない。
  const abilityIdByName = new Map(oldAbilities.map(a => [a.name, a.abilityId]));
  const usedAbilityIds = new Set(oldAbilities.map(a => a.abilityId));
  const oldAbilityVersions = new Map();
  for (const a of oldAbilities) oldAbilityVersions.set(a.name, (oldAbilityVersions.get(a.name) || 0) + 1);
  const abilityRows = readTsv(abilitiesTsv);
  const abilityVersions = assignVersions(abilityRows, row => row.name, abilitiesTsv, errors);
  const unknownBuffTokens = new Map();
  const abilities = abilityRows.map((row, index) => {
    const where = `${abilitiesTsv}:${row._line}`;
    if (!row.name) errors.push(`${where}: name が空です`);
    if (!row.description) errors.push(`${where}: description が空です`);
    // 「狩の印Lv2」→ baseName「狩の印」/ level 2 に自動分解する
    const match = /^(.*?)\s*Lv\s*(\d+)$/i.exec(row.name);
    if (!abilityIdByName.has(row.name)) abilityIdByName.set(row.name, row.abilityId || nextId('sab', usedAbilityIds));
    const ability = {
      abilityId: row.abilityId || abilityIdByName.get(row.name),
      name: row.name,
      version: abilityVersions.versions[index],
      baseName: match ? match[1] : row.name,
      level: match ? Number(match[2]) : null,
      description: row.description.replace(/\\n/g, '\n'),
      tags: row.tags ? row.tags.split(/[,、]/).map(t => t.trim()).filter(Boolean) : [],
      buffs: [],
      sortOrder: index + 1,
      status: row.status || 'verified',
    };
    // バフ・デバフは手入力しない。テキストの完全一致だけで自動的に結ぶ。
    const detected = detectBuffs(ability, buffByName);
    ability.buffs = detected.buffs;
    for (const token of detected.unknown) {
      if (!unknownBuffTokens.has(token)) unknownBuffTokens.set(token, []);
      unknownBuffTokens.get(token).push(ability.name);
    }
    return ability;
  });
  const abilityIdByNameNew = new Map(abilities.map(a => [a.name, a.abilityId]));
  notes.push(...reportVersionGroups(abilityVersions.groups, '技能力', oldAbilityVersions));

  // ---------------------------------------------------------------- 技
  const skillIdByKey = new Map(oldSkills.map(s => [`${s.blood}|${s.name}`, s.skillId]));
  const usedSkillIds = new Set(oldSkills.map(s => s.skillId));
  const oldSkillVersions = new Map();
  for (const s of oldSkills) {
    const key = `${s.blood}|${s.name}`;
    oldSkillVersions.set(key, (oldSkillVersions.get(key) || 0) + 1);
  }
  const skillRows = readTsv(skillsTsv);
  const skillVersions = assignVersions(skillRows, row => `${row.blood}|${row.name}`, skillsTsv, errors);
  const unknownUnlocks = [];
  const skills = skillRows.map((row, index) => {
    const where = `${skillsTsv}:${row._line} ${row.name || ''}`;
    const resolve = (name, field) => {
      const monster = monsterByName.get(name);
      if (!monster) errors.push(`${where}: ${field} のモンスター名が見つかりません: ${name}`);
      return monster ? monster.id : null;
    };
    const owners = isTrue(row.unique) && row.owners
      ? row.owners.split(/[・,、]/).map(n => n.trim()).filter(Boolean)
        .map(n => resolve(n, 'owners')).filter(Boolean)
      : [];
    const unlockedBy = (row.unlockedBy || '').split(/[,、]/).map(pair => pair.trim()).filter(Boolean)
      .map(pair => {
        const [name, star] = pair.split(/[:：]/).map(part => (part || '').trim());
        const rarity = Number(String(star).replace(/[★☆\s]/g, ''));
        if (!Number.isInteger(rarity) || rarity < SKILL_RARITY_MIN || rarity > SKILL_RARITY_MAX) {
          errors.push(`${where}: unlockedBy は「名前:★数」の形式です（★${SKILL_RARITY_MIN}〜${SKILL_RARITY_MAX}）: ${pair}`);
          return null;
        }
        const monsterId = resolve(name, 'unlockedBy');
        return monsterId ? { monsterId, rarity } : null;
      })
      .filter(Boolean);

    // 技能力は名前で辞書を引き、解放条件（そのモンスターを★いくつにすると解放されるか）は
    // 技ごとに違うので abilityN の隣の abilityNUnlock から読む。書式は unlockedBy と同じ。
    const skillAbilities = [];
    for (let slot = 1; slot <= ABILITY_SLOTS; slot++) {
      const name = row[`ability${slot}`];
      if (!name) continue;
      const abilityId = abilityIdByNameNew.get(name);
      if (!abilityId) {
        errors.push(`${where}: 技能力シートに無い能力名: ${name}`);
        continue;
      }
      const raw = (row[`ability${slot}Unlock`] || '').trim();
      let unlock = null;
      // 解放条件が無い技能力のほうが多い。空欄は「条件なし」として通す。
      // 「条件はありそうだが画面から読めなかった」ものだけ ? を書いて印を付ける。
      if (raw === '?' || raw === '？') {
        unknownUnlocks.push(`${row.blood}種 ${row.name} / ${name}`);
      } else if (raw) {
        const [monsterName, star] = raw.split(/[:：]/).map(part => (part || '').trim());
        const level = Number(String(star).replace(/[★☆\s]/g, ''));
        if (!Number.isInteger(level) || level < SKILL_RARITY_MIN || level > SKILL_RARITY_MAX) {
          errors.push(`${where}: ability${slot}Unlock は「名前:★数」の形式です（★${SKILL_RARITY_MIN}〜${SKILL_RARITY_MAX}）: ${raw}`);
        } else {
          const monsterId = resolve(monsterName, `ability${slot}Unlock`);
          if (monsterId) unlock = { monsterId, level };
        }
      }
      skillAbilities.push({ abilityId, unlock });
    }

    const key = `${row.blood}|${row.name}`;
    if (!skillIdByKey.has(key)) skillIdByKey.set(key, row.skillId || nextId('sk', usedSkillIds));
    return {
      skillId: row.skillId || skillIdByKey.get(key),
      name: row.name,
      version: skillVersions.versions[index],
      blood: row.blood,
      range: row.range,
      rank: Number(row.rank),
      moveTo: orNull(row.moveTo),
      aura: row.aura,
      skillType: row.skillType,
      guts: Number(row.guts),
      damage: orNull(row.damage),
      accuracy: orNull(row.accuracy),
      gutsDown: orNull(row.gutsDown),
      critical: orNull(row.critical),
      abilities: skillAbilities,
      icon: null,
      unique: isTrue(row.unique),
      owners,
      unlockedBy,
      note: row.note || '',
      sortOrder: index + 1,
      status: row.status || 'verified',
    };
  });

  if (errors.length) {
    console.error(`取り込み失敗 ${errors.length}件:`);
    errors.forEach(error => console.error(`  ${error}`));
    process.exit(1);
  }

  notes.push(...reportVersionGroups(skillVersions.groups, '技', oldSkillVersions, key => key.replace('|', '種 ')));

  const buffDoc = {
    schemaVersion: 1,
    generatedFrom: ['手入力'],
    generatedAt: null,
    counts: { buffs: buffs.length },
    buffs,
  };
  const abilityDoc = {
    schemaVersion: 1,
    generatedFrom: ['手入力'],
    generatedAt: null,
    counts: { abilities: abilities.length },
    abilities,
  };
  const skillDoc = {
    schemaVersion: 1,
    generatedFrom: ['手入力'],
    generatedAt: null,
    counts: { skills: skills.length, bloods: new Set(skills.map(s => s.blood)).size },
    skills,
  };

  // 書き出す前に本番と同じ検査を通す
  validateSkillData(skillDoc, abilityDoc, ids, buffDoc);

  if (dryRun) {
    console.log('--dry のため書き込みません。');
  } else {
    fs.writeFileSync(path.join(REPO, BUFF_DB), JSON.stringify(buffDoc, null, 2) + '\n');
    fs.writeFileSync(path.join(REPO, ABILITY_DB), JSON.stringify(abilityDoc, null, 2) + '\n');
    fs.writeFileSync(path.join(REPO, SKILL_DB), JSON.stringify(skillDoc, null, 2) + '\n');
  }
  const byBlood = new Map();
  for (const skill of skills) byBlood.set(skill.blood, (byBlood.get(skill.blood) || 0) + 1);
  console.log(`技 ${skills.length}件 / 技能力 ${abilities.length}件 / バフ・デバフ ${buffs.length}件 を取り込みました。`);
  for (const [blood, count] of byBlood) console.log(`  ${blood}種 ${count}件`);
  // 同名は新バージョンとして積む。意図的な操作なので確認は求めず、何が起きたかだけ伝える。
  if (notes.length) {
    console.log('\nバージョン:');
    for (const note of notes) console.log(note);
  }
  const buffCount = abilities.filter(ability => ability.buffs.length).length;
  console.log(`\nバフ・デバフを付けた技能力 ${buffCount}件:`);
  for (const ability of abilities.filter(a => a.buffs.length)) {
    const names = ability.buffs.map(id => (buffs.find(buff => buff.buffId === id) || {}).name).join('・');
    console.log(`  ${ability.name}${ability.version > 1 ? ` v${ability.version}` : ''} → ${names}`);
  }
  // 角括弧にあるのにバフDBにも既知の非バフ語にも無いもの。その場で足せるように必ず出す。
  if (unknownBuffTokens.size) {
    console.log(`\nバフDB未登録の候補 ${unknownBuffTokens.size}件（バフなら ${BUFF_TSV} へ、条件語なら build.js の NON_BUFF_TOKENS へ）:`);
    for (const [token, owners] of unknownBuffTokens) console.log(`  [${token}] — ${owners.join('・')}`);
  }
  // 解放済みの技能力は画面に条件が出ない。? を書いた組だけを手入力待ちとして出す。
  if (unknownUnlocks.length) {
    console.log(`\n技能力の解放条件が手入力待ち ${unknownUnlocks.length}件（画面に出ないため ? を入れた分）:`);
    for (const item of unknownUnlocks) console.log(`  ${item}`);
  }
  console.log('次に node build.js && node scripts/verify.js を実行してください。');
}

try {
  main();
} catch (error) {
  console.error(`取り込み失敗: ${error.message}`);
  process.exitCode = 1;
}
