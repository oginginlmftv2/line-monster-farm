#!/usr/bin/env node
/**
 * アシストカード関連の既存データを変更せずに集計し、移行用の対応表を生成する。
 *
 * Usage:
 *   node scripts/audit-assist-data.js
 *   node scripts/audit-assist-data.js --json
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const AUDIT_DIR = path.join(REPO, 'src/data/_audit');
const ABILITY_MAP_PATH = path.join(AUDIT_DIR, 'ability-card-map.json');
const SAPO_MAP_PATH = path.join(AUDIT_DIR, 'sapo-card-map.json');

const INPUTS = {
  cards: 'cards/cards-data.js',
  legacyEditorial: 'cards/editorial-data.js',
  effects: 'assist-effect-data.js',
  sapo: 'assist-card-data.js',
  editorial: 'src/data/cards-editorial.json',
  abilities: 'lMfDB_abilities.json',
  legacyAbilities: 'lmfdb_abilities_data.json',
  monsterIds: 'src/data/monster-ids.json',
};

function absolute(relativePath) {
  return path.join(REPO, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function readJson(relativePath, stripBom = false) {
  let source = readText(relativePath);
  if (stripBom) source = source.replace(/^\uFEFF/, '');
  return JSON.parse(source);
}

function readJavaScriptValue(relativePath, variableName) {
  const source = readText(relativePath);
  const context = vm.createContext(Object.create(null));
  const script = new vm.Script(`${source}\n;${variableName}`, {
    filename: relativePath,
  });
  return script.runInContext(context, { timeout: 5000 });
}

function sha256(relativePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(absolute(relativePath)))
    .digest('hex');
}

function countBy(rows, valueOf) {
  const result = {};
  for (const row of rows) {
    const key = String(valueOf(row));
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'ja'));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function stripTagsLength(value) {
  return String(value || '').replace(/<[^>]+>/g, '').length;
}

function nameMap(cardsData) {
  const result = new Map();
  for (const [cardId, card] of Object.entries(cardsData)) {
    if (!result.has(card.name)) result.set(card.name, []);
    result.get(card.name).push(cardId);
  }
  return result;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function imageAudit(cardsData) {
  const expected = Object.entries(cardsData)
    .map(([cardId, card]) => `${cardId}.${card.ext}`)
    .sort();
  const actual = fs.readdirSync(path.join(REPO, 'assist-cards'))
    .filter(file => /\.(?:jpe?g|png|webp)$/i.test(file))
    .sort();
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter(file => !actualSet.has(file)),
    unreferenced: actual.filter(file => !expectedSet.has(file)),
  };
}

function buildAbilityMap(abilities, cardsByName) {
  return abilities.map(ability => {
    const candidates = cardsByName.get(ability.card) || [];
    const linkStatus = candidates.length === 1
      ? 'resolved'
      : candidates.length > 1 ? 'ambiguous' : 'unlinked';
    return {
      abilityId: ability.id,
      sourceName: ability.card,
      cardId: linkStatus === 'resolved' ? candidates[0] : null,
      linkStatus,
    };
  });
}

function buildSapoMap(sapoRows, cardsByName, cardsData) {
  return sapoRows.map((row, sapoIndex) => {
    if (row._type !== 'main' && row._type !== 'sub') {
      throw new Error(`SAPO_DATAの_typeが不正です: ${row._type}（位置${sapoIndex}）`);
    }
    const matchName = row._type === 'main' ? row['固有名'] : row['キャラ名'];
    const rarity = row._type === 'main' ? row['レアリティ'] : row['名称'];
    const nameCandidates = [...(cardsByName.get(matchName) || [])];
    const rarityCandidates = nameCandidates.filter(cardId => cardsData[cardId].rarity === rarity);
    const matchType = nameCandidates.length === 0
      ? 'none'
      : rarityCandidates.length === 1 ? 'exact' : 'candidate';
    const candidates = matchType === 'exact' ? rarityCandidates : nameCandidates;
    return {
      sapoIndex,
      type: row._type,
      '固有名': row['固有名'],
      'キャラ名': row._type === 'main' ? null : row['キャラ名'],
      rarity,
      cardIdCandidates: candidates,
      matchType,
    };
  });
}

function audit() {
  const cardsData = readJavaScriptValue(INPUTS.cards, 'cardsData');
  const legacyEditorial = readJavaScriptValue(INPUTS.legacyEditorial, 'editorialData');
  const effects = readJavaScriptValue(INPUTS.effects, 'ASSIST_EFFECT_DATA');
  const sapoRows = readJavaScriptValue(INPUTS.sapo, 'SAPO_DATA');
  const editorialRoot = readJson(INPUTS.editorial);
  const abilitiesRaw = fs.readFileSync(absolute(INPUTS.abilities));
  const abilitiesHasBom = abilitiesRaw.length >= 3
    && abilitiesRaw[0] === 0xef && abilitiesRaw[1] === 0xbb && abilitiesRaw[2] === 0xbf;
  const abilities = readJson(INPUTS.abilities, true);
  const legacyAbilities = readJson(INPUTS.legacyAbilities, true);
  const monsters = readJson(INPUTS.monsterIds).monsters;

  const cardEntries = Object.entries(cardsData);
  const cardIds = cardEntries.map(([cardId]) => cardId);
  const cardIdSet = new Set(cardIds);
  const cardsByName = nameMap(cardsData);
  const imageResult = imageAudit(cardsData);
  const duplicateNames = [...cardsByName.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, cardIds: [...ids] }));

  const editorial = editorialRoot.cards || {};
  const editorialIds = Object.keys(editorial);
  const editorialOnly = editorialIds.filter(cardId => !cardIdSet.has(cardId)).sort();
  const editorialMissing = cardIds.filter(cardId => !editorial[cardId]).sort();
  const editorialLengths = cardIds.map(cardId => stripTagsLength(editorial[cardId]?.explanation));

  const effectIds = Object.keys(effects);
  const effectRows = Object.values(effects).flat();
  const effectCounts = effectIds.map(cardId => effects[cardId].length);
  const effectMissing = cardIds.filter(cardId => !effects[cardId]);
  const effectUnknown = effectIds.filter(cardId => !cardIdSet.has(cardId)).sort();

  const abilityIds = abilities.map(ability => ability.id);
  const duplicateAbilityIds = sortedUnique(abilityIds.filter((id, index) => abilityIds.indexOf(id) !== index));
  const abilityMap = buildAbilityMap(abilities, cardsByName);
  const linkStatusCounts = countBy(abilityMap, row => row.linkStatus);
  const resolvedAbilitiesByCard = Object.fromEntries(cardIds.map(cardId => [cardId, []]));
  abilityMap.forEach((mapping, index) => {
    if (mapping.linkStatus === 'resolved') {
      resolvedAbilitiesByCard[mapping.cardId].push(abilities[index]);
    }
  });
  const linkedCardIds = cardIds.filter(cardId => resolvedAbilitiesByCard[cardId].length > 0);
  const abilityCounts = linkedCardIds.map(cardId => resolvedAbilitiesByCard[cardId].length);
  const unlinkedNames = sortedUnique(abilityMap
    .filter(row => row.linkStatus === 'unlinked')
    .map(row => row.sourceName));
  const monsterNames = new Set(monsters.map(monster => monster.name));
  const normalizeMonsterSourceName = name => name.replace(/\((?:MR|SSR|SR|R)\)$/, '');
  const unlinkedMonsterNames = unlinkedNames.filter(name => monsterNames.has(normalizeMonsterSourceName(name)));
  const nonMonsterUnlinkedNames = unlinkedNames.filter(name => !monsterNames.has(normalizeMonsterSourceName(name)));
  const nonMonsterUnlinkedNameSet = new Set(nonMonsterUnlinkedNames);
  const nonMonsterUnlinkedRows = abilityMap.filter(row =>
    row.linkStatus === 'unlinked' && nonMonsterUnlinkedNameSet.has(row.sourceName));

  const contentRows = cardIds.map(cardId => {
    const effectChars = (effects[cardId] || []).reduce((sum, effect) =>
      sum + stripTagsLength(effect.name) + stripTagsLength(effect.desc), 0);
    const abilityChars = resolvedAbilitiesByCard[cardId].reduce((sum, ability) =>
      sum + stripTagsLength(ability.name) + stripTagsLength(ability.desc), 0);
    const editorialChars = stripTagsLength(editorial[cardId]?.explanation);
    return {
      cardId,
      effectChars,
      abilityChars,
      editorialChars,
      visibleChars: effectChars + abilityChars + editorialChars,
    };
  });
  const visibleValues = contentRows.map(row => row.visibleChars);
  const effectCharValues = contentRows.map(row => row.effectChars);
  const abilityCharValues = contentRows.map(row => row.abilityChars);
  const editorialCharValues = contentRows.map(row => row.editorialChars);

  const sapoMap = buildSapoMap(sapoRows, cardsByName, cardsData);
  const sapoMain = sapoRows.filter(row => row._type === 'main');
  const sapoSub = sapoRows.filter(row => row._type === 'sub');
  const sapoNames = new Set(sapoMain.map(row => row['固有名']));
  const currentNames = new Set(cardEntries.map(([, card]) => card.name));
  const abilitySourceNames = new Set(abilities.map(ability => ability.card));
  const sapoItemNames = sortedUnique(sapoMain.flatMap(row => Object.keys(row)));
  const sapoMainMap = sapoMap.filter(row => row.type === 'main');
  const sapoSubMap = sapoMap.filter(row => row.type === 'sub');
  const sapoMatchTypeCounts = rows => ({
    exact: rows.filter(row => row.matchType === 'exact').length,
    candidate: rows.filter(row => row.matchType === 'candidate').length,
    none: rows.filter(row => row.matchType === 'none').length,
  });
  const exactCardIds = rows => new Set(rows
    .filter(row => row.matchType === 'exact')
    .map(row => row.cardIdCandidates[0]));
  const mainExactCardIds = exactCardIds(sapoMainMap);
  const subExactCardIds = exactCardIds(sapoSubMap);
  const sapoExactCardIds = exactCardIds(sapoMap);
  const exactCardIdCounts = countBy(
    sapoMap.filter(row => row.matchType === 'exact'),
    row => row.cardIdCandidates[0],
  );
  const duplicateExactCardIds = Object.entries(exactCardIdCounts)
    .filter(([, count]) => count > 1)
    .map(([cardId, count]) => ({ cardId, count }));

  writeJson(ABILITY_MAP_PATH, abilityMap);
  writeJson(SAPO_MAP_PATH, sapoMap);

  const noEffect = new Set(effectMissing);
  const noAbility = new Set(cardIds.filter(cardId => resolvedAbilitiesByCard[cardId].length === 0));
  const nonResolvedWithCardId = abilityMap.filter(row => row.linkStatus !== 'resolved' && row.cardId !== null);
  const nonExactWithConfirmedCardId = sapoMap.filter(row =>
    row.matchType !== 'exact' && Object.prototype.hasOwnProperty.call(row, 'cardId'));

  return {
    inputHashes: Object.fromEntries(Object.values(INPUTS).map(relativePath => [relativePath, sha256(relativePath)])),
    A: {
      cardCount: cardIds.length,
      uniqueNameCount: cardsByName.size,
      duplicateNames,
      imageMissing: imageResult.missing,
      imageUnreferenced: imageResult.unreferenced,
    },
    B: {
      editorialCount: editorialIds.length,
      editorialOnly,
      editorialMissing,
      explanationLengthDistribution: {
        zero: editorialLengths.filter(length => length === 0).length,
        from1To99: editorialLengths.filter(length => length >= 1 && length <= 99).length,
        from100To199: editorialLengths.filter(length => length >= 100 && length <= 199).length,
        atLeast200: editorialLengths.filter(length => length >= 200).length,
      },
      cardsWithFormations: cardIds.filter(cardId => Array.isArray(editorial[cardId]?.formations)
        && editorial[cardId].formations.length > 0).length,
      cardsWithRatings: cardIds.filter(cardId => editorial[cardId]?.ratings
        && Object.keys(editorial[cardId].ratings).length > 0).length,
      legacyEditorialCount: Object.keys(legacyEditorial).length,
    },
    C: {
      effectCardCount: effectIds.length,
      effectCount: effectRows.length,
      cardsWithoutEffects: effectMissing,
      unknownEffectCardIds: effectUnknown,
      unlockRankCounts: countBy(effectRows, row => row.totsujou),
      effectsPerCard: {
        min: Math.min(...effectCounts),
        median: median(effectCounts),
        max: Math.max(...effectCounts),
      },
    },
    D: {
      abilityCount: abilities.length,
      duplicateAbilityIds,
      hasUtf8Bom: abilitiesHasBom,
      legacyAbilityCount: legacyAbilities.length,
      sourceCounts: countBy(abilities, row => row.source),
      rarityCounts: {
        ...countBy(abilities.filter(row => row.rarity), row => row.rarity),
        missing: abilities.filter(row => !row.rarity).length,
      },
      missingRarityBreakdown: countBy(abilities.filter(row => !row.rarity), row => row.source),
      sourceNameCount: new Set(abilities.map(row => row.card)).size,
      linkStatusCounts,
      unlinkedSourceNameCount: unlinkedNames.length,
      unlinkedMonsterNames,
      nonMonsterUnlinkedSourceNameCount: nonMonsterUnlinkedNames.length,
      nonMonsterUnlinkedAbilityCount: nonMonsterUnlinkedRows.length,
      cardsWithAbilities: linkedCardIds.length,
      cardsWithoutAbilities: [...noAbility].sort(),
      abilitiesPerLinkedCard: {
        min: Math.min(...abilityCounts),
        median: median(abilityCounts),
        max: Math.max(...abilityCounts),
      },
      cardsWithoutEffects: noEffect.size,
      cardsWithoutAbilitiesCount: noAbility.size,
      cardsWithoutBoth: cardIds.filter(cardId => noEffect.has(cardId) && noAbility.has(cardId)).sort(),
    },
    E: {
      visibleChars: {
        min: Math.min(...visibleValues),
        p25: percentile(visibleValues, 0.25),
        median: median(visibleValues),
        p75: percentile(visibleValues, 0.75),
        max: Math.max(...visibleValues),
      },
      atLeast600: contentRows.filter(row => row.visibleChars >= 600).length,
      atLeast800: contentRows.filter(row => row.visibleChars >= 800).length,
      atLeast1000: contentRows.filter(row => row.visibleChars >= 1000).length,
      componentMedians: {
        effects: median(effectCharValues),
        abilities: median(abilityCharValues),
        editorial: median(editorialCharValues),
      },
      gate800AndEditorial150: contentRows.filter(row => row.visibleChars >= 800 && row.editorialChars >= 150).length,
      gate800AndEditorial100: contentRows.filter(row => row.visibleChars >= 800 && row.editorialChars >= 100).length,
      gate800AndEditorial200: contentRows.filter(row => row.visibleChars >= 800 && row.editorialChars >= 200).length,
      nearGateEditorial80To149: contentRows.filter(row => row.visibleChars >= 800
        && row.editorialChars >= 80 && row.editorialChars <= 149).length,
    },
    F: {
      totalCount: sapoRows.length,
      mainCount: sapoMain.length,
      subCount: sapoSub.length,
      mainItemCount: sapoItemNames.length,
      mainRarityCounts: countBy(sapoMain, row => row['レアリティ']),
      mainUniqueNameCount: sapoNames.size,
      currentNamesMissingFromSapo: sortedUnique([...currentNames].filter(name => !sapoNames.has(name))),
      sapoNamesMissingFromCurrent: sortedUnique([...sapoNames].filter(name => !currentNames.has(name))),
      abilitySourceNamesInSapo: [...abilitySourceNames].filter(name => sapoNames.has(name)).length,
      mainMatchTypeCounts: sapoMatchTypeCounts(sapoMainMap),
      subMatchTypeCounts: sapoMatchTypeCounts(sapoSubMap),
      matchTypeCounts: sapoMatchTypeCounts(sapoMap),
      cardsWithSapoData: sapoExactCardIds.size,
      cardsWithoutSapoData: cardIds.filter(cardId => !sapoExactCardIds.has(cardId)).sort(),
      mainDerivedCardCount: mainExactCardIds.size,
      subDerivedCardCount: subExactCardIds.size,
    },
    G: {
      nonResolvedRowsWithCardId: nonResolvedWithCardId.length,
      nonExactRowsWithConfirmedCardId: nonExactWithConfirmedCardId.length,
      duplicateExactCardIds,
    },
  };
}

function printText(result) {
  const line = value => console.log(value);
  const names = rows => rows.map(row => `${row.name} = ${row.cardIds.join(', ')}`).join(' / ');
  line('A. カードとカード画像');
  line(`カード: ${result.A.cardCount}件 / 固有名: ${result.A.uniqueNameCount}種`);
  line(`同名カード: ${result.A.duplicateNames.length}組（${names(result.A.duplicateNames)}）`);
  line(`画像欠落: ${result.A.imageMissing.length}件 / 未参照画像: ${result.A.imageUnreferenced.length}件`);
  line('');
  line('B. 解説');
  line(`収録: ${result.B.editorialCount}カード / editorialのみ: ${result.B.editorialOnly.length}件 / editorial欠落: ${result.B.editorialMissing.length}件（${result.B.editorialMissing.join(', ') || 'なし'}）`);
  line(`解説文字数: 0字 ${result.B.explanationLengthDistribution.zero}件 / 1〜99字 ${result.B.explanationLengthDistribution.from1To99}件 / 100〜199字 ${result.B.explanationLengthDistribution.from100To199}件 / 200字以上 ${result.B.explanationLengthDistribution.atLeast200}件`);
  line(`編成あり: ${result.B.cardsWithFormations}件 / 評価あり: ${result.B.cardsWithRatings}件`);
  line('');
  line('C. アシスト効果');
  line(`登録: ${result.C.effectCardCount}カード / ${result.C.effectCount}効果`);
  line(`未登録: ${result.C.cardsWithoutEffects.length}カード（${result.C.cardsWithoutEffects.join(', ')}） / 未知cardId: ${result.C.unknownEffectCardIds.length}件`);
  line(`totsujou: ${Object.entries(result.C.unlockRankCounts).map(([key, count]) => `${key} ${count}`).join(' / ')}`);
  line(`カード当たり効果数: 最小 ${result.C.effectsPerCard.min} / 中央値 ${result.C.effectsPerCard.median} / 最大 ${result.C.effectsPerCard.max}`);
  line('');
  line('D. 能力DB');
  line(`新形式: ${result.D.abilityCount}件 / id重複: ${result.D.duplicateAbilityIds.length}件 / BOM: ${result.D.hasUtf8Bom ? 'あり' : 'なし'} / 旧形式: ${result.D.legacyAbilityCount}件`);
  line(`source: ${Object.entries(result.D.sourceCounts).map(([key, count]) => `${key} ${count}`).join(' / ')}`);
  line(`rarity: ${Object.entries(result.D.rarityCounts).map(([key, count]) => `${key} ${count}`).join(' / ')}`);
  line(`rarity欠落内訳: ${Object.entries(result.D.missingRarityBreakdown).map(([key, count]) => `${key} ${count}`).join(' / ')}`);
  line(`card値: ${result.D.sourceNameCount}種 / 帰属: resolved ${result.D.linkStatusCounts.resolved || 0} / ambiguous ${result.D.linkStatusCounts.ambiguous || 0} / unlinked ${result.D.linkStatusCounts.unlinked || 0}`);
  line(`unlinked名: ${result.D.unlinkedSourceNameCount}種 / モンスター一致: ${result.D.unlinkedMonsterNames.length}種（${result.D.unlinkedMonsterNames.join(', ')}） / 残り: ${result.D.nonMonsterUnlinkedSourceNameCount}種 ${result.D.nonMonsterUnlinkedAbilityCount}件`);
  line(`能力あり: ${result.D.cardsWithAbilities}カード / 能力0: ${result.D.cardsWithoutAbilitiesCount}カード`);
  line(`カード当たり能力数: 最小 ${result.D.abilitiesPerLinkedCard.min} / 中央値 ${result.D.abilitiesPerLinkedCard.median} / 最大 ${result.D.abilitiesPerLinkedCard.max}`);
  line(`効果0: ${result.D.cardsWithoutEffects} / 能力0: ${result.D.cardsWithoutAbilitiesCount} / 両方0: ${result.D.cardsWithoutBoth.length}`);
  line('');
  line('E. 可視本文の文字数');
  line(`分布: 最小 ${result.E.visibleChars.min} / 25%点 ${result.E.visibleChars.p25} / 中央値 ${result.E.visibleChars.median} / 75%点 ${result.E.visibleChars.p75} / 最大 ${result.E.visibleChars.max}`);
  line(`600字以上 ${result.E.atLeast600}件 / 800字以上 ${result.E.atLeast800}件 / 1,000字以上 ${result.E.atLeast1000}件`);
  line(`内訳中央値: 効果 ${result.E.componentMedians.effects}字 / 能力 ${result.E.componentMedians.abilities}字 / 解説 ${result.E.componentMedians.editorial}字`);
  line(`二軸ゲート: 解説150字 ${result.E.gate800AndEditorial150}件 / 100字 ${result.E.gate800AndEditorial100}件 / 200字 ${result.E.gate800AndEditorial200}件 / 80〜149字の昇格候補 ${result.E.nearGateEditorial80To149}件`);
  line('');
  line('F. SAPO_DATA');
  line(`全体 ${result.F.totalCount}件 = main ${result.F.mainCount} + sub ${result.F.subCount} / main項目 ${result.F.mainItemCount}個`);
  line(`main rarity: ${Object.entries(result.F.mainRarityCounts).map(([key, count]) => `${key} ${count}`).join(' / ')} / 固有名 ${result.F.mainUniqueNameCount}種`);
  line(`現行名のSAPO欠落: ${result.F.currentNamesMissingFromSapo.length}件 / SAPO名の現行欠落: ${result.F.sapoNamesMissingFromCurrent.length}件`);
  line(`能力DB名のSAPO一致: ${result.F.abilitySourceNamesInSapo}種`);
  line(`main（固有名で照合）: ${Object.entries(result.F.mainMatchTypeCounts).map(([key, count]) => `${key} ${count}`).join(' / ')}`);
  line(`sub（キャラ名で照合）: ${Object.entries(result.F.subMatchTypeCounts).map(([key, count]) => `${key} ${count}`).join(' / ')}`);
  line(`全体: ${Object.entries(result.F.matchTypeCounts).map(([key, count]) => `${key} ${count}`).join(' / ')}`);
  line(`凸データが得られる現行カード: ${result.F.cardsWithSapoData} / ${result.A.cardCount}（main由来 ${result.F.mainDerivedCardCount} + sub由来 ${result.F.subDerivedCardCount}） / 得られないカード: ${result.F.cardsWithoutSapoData.length}`);
  line('');
  line('G. 機械検査');
  line(`resolved以外でcardIdあり: ${result.G.nonResolvedRowsWithCardId}件`);
  line(`exact以外で確定cardIdあり: ${result.G.nonExactRowsWithConfirmedCardId}件`);
  line(`exact行のcardId重複: ${result.G.duplicateExactCardIds.length}件`);
  line('');
  line('入力SHA-256');
  Object.entries(result.inputHashes).forEach(([file, hash]) => line(`${file}: ${hash}`));
}

try {
  const unknownArgs = process.argv.slice(2).filter(arg => arg !== '--json');
  if (unknownArgs.length) throw new Error(`未対応の引数です: ${unknownArgs.join(' ')}`);
  const result = audit();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result);
  }
} catch (error) {
  console.error(`アシストデータ監査: FAIL ${error.message}`);
  process.exit(1);
}
