#!/usr/bin/env node
'use strict';

/**
 * アシスト能力のスクショ取り込み（docs/ability-capture-design.md）のテスト。
 *   1. 読取JSONの検査（scripts/check-assist-ability-payload.js）: 判定5種・表記規約・emit
 *   2. リポジトリの判定とGAS（26_ability_capture.gs）の判定が既存DB全件で一致すること
 *   3. GASのプレビュー・取り込みAPIを模擬シートで実行（採番・紐付け・食い違い拒否・補償）
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { checkPayload, classifyAbility, toCmsPayload, loadDocs } = require('./check-assist-ability-payload');
const { abilityNameKey, abilityDescriptionKey, sourceNameKey } = require('../src/lib/ability-name-key');

const REPO = path.resolve(__dirname, '..');
const EXAMPLE = path.join(REPO, '.claude/skills/assist-ability-capture/examples/c0003-MR-hirameki.json');
const NOW = '2026-09-30T12:00:00+09:00';
const docs = loadDocs(REPO);
const abilities = docs.abilitiesDoc.abilities;
const cards = docs.cardsDoc.cards;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function example() { return JSON.parse(fs.readFileSync(EXAMPLE, 'utf8')); }
// 読取例のカード（アルカード c0003-MR）はCMSで取り込み済みになると写しに能力が入る。
// 例の判定はDBの中身で変わるため、例を使うテストは「このカードの能力を取り込む前」の写しで判定する。
function docsBeforeExample() {
  const before = clone(docs);
  const cardId = example().cardId;
  before.abilitiesDoc.abilities = before.abilitiesDoc.abilities.filter(ability => ability.cardId !== cardId);
  return before;
}
function item(name, description, extra = {}) { return { name, description, source: 'イベント', ...extra }; }

const cases = [];
function test(label, fn) { cases.push([label, fn]); }

// ---------------------------------------------------------------- 1. 読取JSONの検査

test('照合キーは全角半角・ローマ数字・空白・<br>・末尾の括弧補足をそろえる', () => {
  assert.strictEqual(abilityNameKey('光香む常闇の衣 I'), abilityNameKey('光香む常闇の衣Ⅰ'));
  assert.strictEqual(abilityNameKey('[自身青]ちから＋３%'), abilityNameKey('［自身青］ちから+3％'));
  assert.notStrictEqual(abilityNameKey('光香む常闇の衣 I'), abilityNameKey('光香む常闇の衣 II'));
  assert.strictEqual(abilityDescriptionKey('A<br>・B'), abilityDescriptionKey('A・B'));
  assert.strictEqual(sourceNameKey('アインズ(SSR)'), sourceNameKey('アインズ'));
  assert.strictEqual(sourceNameKey('ジュリア（ライバル）'), sourceNameKey('ジュリア'));
});

test('スキルの読取例（アルカードの閃き8件）は取り込み前ならFAIL 0・全件新規', () => {
  const issues = checkPayload(example(), docsBeforeExample());
  assert.deepStrictEqual(issues.fail, []);
  assert.deepStrictEqual(issues.results.map(result => result.action), Array(8).fill('create'));
});

test('読取例を取り込んだ後にもう一度読むと全件「登録済み」（二重登録しない）', () => {
  const after = docsBeforeExample();
  const payload = example();
  payload.abilities.forEach((ability, index) => after.abilitiesDoc.abilities.push({
    abilityId: `ab-${9100 + index}`, legacyId: null, cardId: payload.cardId, sourceName: 'アルカード', name: ability.name,
    description: ability.description, source: ability.source, rarity: 'MR', tags: ability.tags, sortOrder: index + 1,
    linkStatus: 'resolved', flags: [], status: 'draft',
  }));
  const issues = checkPayload(payload, after);
  assert.deepStrictEqual(issues.fail, []);
  assert.deepStrictEqual(issues.results.map(result => result.action), Array(8).fill('known'));
});

test('既存カードのresolved能力をそのまま読むと全件「登録済み」', () => {
  let checked = 0;
  const byCard = new Map();
  for (const ability of abilities.filter(a => a.linkStatus === 'resolved')) {
    if (!byCard.has(ability.cardId)) byCard.set(ability.cardId, []);
    byCard.get(ability.cardId).push(ability);
  }
  for (const [cardId, list] of byCard) {
    const names = list.map(a => abilityNameKey(a.name));
    if (new Set(names).size !== names.length || list.length > 30) continue; // 既存DBの同名重複カードは対象外
    const issues = checkPayload({ cardId, sourceScreenshots: ['x.png'], abilities: list.map(a => ({ name: a.name, description: a.description, source: a.source, tags: a.tags })) }, docs);
    assert.deepStrictEqual(issues.fail, [], cardId);
    assert(issues.results.every(result => result.action === 'known'), cardId);
    checked += list.length;
  }
  assert(checked > 600, `照合した件数が少ない: ${checked}`);
});

test('同名で本文が違えば known_diff（WARN。移行データは本文ロックと書く）', () => {
  const migrated = abilities.find(a => a.linkStatus === 'resolved' && a.legacyId !== null);
  const issues = checkPayload({ cardId: migrated.cardId, sourceScreenshots: ['x'], abilities: [item(migrated.name, `${migrated.description}＜追加＞`, { source: migrated.source })] }, docs);
  assert.strictEqual(issues.results[0].action, 'known_diff');
  assert(issues.warn.some(line => /本文ロック/.test(line)));
  assert.deepStrictEqual(issues.fail, []);
});

test('元のカード名が一致する未紐付け能力は link（既存abilityIdを使う）', () => {
  const card = cards.find(c => abilities.some(a => a.linkStatus !== 'resolved' && sourceNameKey(a.sourceName) === sourceNameKey(c.name)
    && (!a.rarity || a.rarity === c.rarity)
    && !abilities.some(r => r.linkStatus === 'resolved' && r.cardId === c.cardId && abilityNameKey(r.name) === abilityNameKey(a.name))
    && abilities.filter(o => o.linkStatus !== 'resolved' && abilityNameKey(o.name) === abilityNameKey(a.name) && sourceNameKey(o.sourceName) === sourceNameKey(c.name)).length === 1));
  const target = abilities.find(a => a.linkStatus !== 'resolved' && sourceNameKey(a.sourceName) === sourceNameKey(card.name)
    && (!a.rarity || a.rarity === card.rarity)
    && !abilities.some(r => r.linkStatus === 'resolved' && r.cardId === card.cardId && abilityNameKey(r.name) === abilityNameKey(a.name))
    && abilities.filter(o => o.linkStatus !== 'resolved' && abilityNameKey(o.name) === abilityNameKey(a.name) && sourceNameKey(o.sourceName) === sourceNameKey(card.name)).length === 1);
  const issues = checkPayload({ cardId: card.cardId, sourceScreenshots: ['x'], abilities: [item(target.name, target.description, { source: target.source })] }, docs);
  assert.strictEqual(issues.results[0].action, 'link');
  assert.strictEqual(issues.results[0].abilityId, target.abilityId);
  const emitted = toCmsPayload({ cardId: card.cardId, abilities: [item(target.name, target.description, { source: target.source })] }, issues.results);
  assert.strictEqual(emitted.abilities[0].action, 'link');
  assert.strictEqual(emitted.abilities[0].abilityId, target.abilityId);
});

test('候補が複数なら link_ambiguous でFAIL。linkTo で選ぶと link', () => {
  const synthetic = clone(docs);
  const card = synthetic.cardsDoc.cards.find(c => c.cardId === 'c0003-MR');
  const base = { cardId: null, sourceName: card.name, source: 'イベント', rarity: 'MR', tags: [], sortOrder: null, linkStatus: 'unlinked', flags: [], status: 'verified', legacyId: null };
  synthetic.abilitiesDoc.abilities.push({ ...base, abilityId: 'ab-9001', name: '試験能力 I', description: '説明A' });
  synthetic.abilitiesDoc.abilities.push({ ...base, abilityId: 'ab-9002', name: '試験能力 I', description: '説明B' });
  const ambiguous = checkPayload({ cardId: 'c0003-MR', sourceScreenshots: ['x'], abilities: [item('試験能力 I', '説明A')] }, synthetic);
  assert.strictEqual(ambiguous.results[0].action, 'link_ambiguous');
  assert(ambiguous.fail.some(line => /候補が複数/.test(line)));
  const chosen = checkPayload({ cardId: 'c0003-MR', sourceScreenshots: ['x'], abilities: [item('試験能力 I', '説明A', { linkTo: 'ab-9002' })] }, synthetic);
  assert.deepStrictEqual(chosen.fail, []);
  assert.strictEqual(chosen.results[0].action, 'link');
  assert.strictEqual(chosen.results[0].abilityId, 'ab-9002');
  const invalid = checkPayload({ cardId: 'c0003-MR', sourceScreenshots: ['x'], abilities: [item('試験能力 I', '説明A', { linkTo: 'ab-0001' })] }, synthetic);
  assert(invalid.fail.some(line => /同名の未紐付け能力ではない/.test(line)));
});

test('閃きの汎用名は他カードの同名未紐付け能力と紐付けない（新規）', () => {
  const issues = checkPayload(example(), docsBeforeExample());
  const snow = issues.results.find(result => result.name === '[雪山]防塵');
  assert.strictEqual(snow.action, 'create');
  assert(!issues.info.some(line => /元のカード名が違う同名/.test(line)));
});

test('表記規約違反をFAILにする', () => {
  const bad = [
    [item('光香む常闇の衣Ⅰ', '説明'), /ローマ数字は半角英字/],
    [item('光香む常闇の衣I', '説明'), /前に半角空白/],
    [item('［自身青］新しい能力', '説明'), /角括弧は半角/],
    [item('新しい能力＋3', '説明'), /数字は全角/],
    [item('新しい能力', '[前半]＜２０秒＞\n・効果'), /<br> で書く/],
    [item('新しい能力', '[前半]<青>技発動時'), /全角 ＜ ＞/],
    [item('新しい能力', '［前半］技発動時'), /角括弧は半角/],
    [item('新しい能力', '攻撃ステ＜１５%＞'), /％は全角/],
    [item('新しい能力', '攻撃ステ＜+１５％＞'), /＋は全角/],
    [item('新しい能力', '<br>効果'), /先頭・末尾・連続/],
    [item('新しい能力', '説明', { source: '不明' }), /source は/],
    [item('新しい能力', '説明', { tags: ['存在しないタグ'] }), /推測で増やさない/],
    [item('新しい能力', '説明', { abilityId: 'ab-0001' }), /未対応キー/],
    [item('[自身青]ちから＋３％', '[自身青]ちからステータスを３％上昇'), /既存DBの同じ名前は「\[自身青\]ちから＋３%」/],
  ];
  for (const [ability, pattern] of bad) {
    const issues = checkPayload({ cardId: 'c0003-MR', sourceScreenshots: ['x'], abilities: [ability] }, docs);
    assert(issues.fail.some(line => pattern.test(line)), `${JSON.stringify(ability)} → ${issues.fail.join(' / ')}`);
  }
  const twice = checkPayload({ cardId: 'c0003-MR', sourceScreenshots: ['x'], abilities: [item('新しい能力', '説明'), item('新しい能力', '説明')] }, docs);
  assert(twice.fail.some(line => /同じ名前が2回/.test(line)));
  const noCard = checkPayload({ cardId: '', abilities: [item('新しい能力', '説明')] }, docs);
  assert(noCard.fail.some(line => /入力者に聞く/.test(line)));
});

test('本文の半角数字はWARN（Lv1・R4・[最大2回まで] は除く）', () => {
  const warn = checkPayload({ cardId: 'c0003-MR', sourceScreenshots: ['x'], abilities: [item('新しい能力', 'ライフ30％以上')] }, docs);
  assert(warn.warn.some(line => /半角数字/.test(line)));
  const ok = checkPayload({ cardId: 'c0003-MR', sourceScreenshots: ['x'], abilities: [item('新しい能力', '[自身青] R4以上で連撃Lv1[最大2回まで]')] }, docs);
  assert(!ok.warn.some(line => /半角数字/.test(line)));
});

test('emit はCMS貼り付け形（schemaVersion 1・action付き・abilityIdは紐付けだけ）', () => {
  const payload = example();
  const issues = checkPayload(payload, docsBeforeExample());
  const out = toCmsPayload(payload, issues.results);
  assert.strictEqual(out.schemaVersion, 1);
  assert.strictEqual(out.cardId, 'c0003-MR');
  assert.strictEqual(out.abilities.length, 8);
  assert(out.abilities.every(ability => ability.action === 'create' && !('abilityId' in ability) && Array.isArray(ability.tags)));
});

// ---------------------------------------------------------------- 2. GASとの判定一致

const HEADERS = {
  cards: ['sourceOrder','cardId','name','rarity','aura','cardType','monType','image','event2','releasedAt','accessoryStatus','statsJson','limitBreakJson','ratingsJson','explanation','formationsJson','sapoRefJson','version','updatedAt','updatedBy','hidden'],
  assist_effects: ['cardId','effectId','name','description','unlockRank','sortOrder','updatedAt','updatedBy'],
  abilities: ['sourceOrder','abilityId','legacyId','cardId','sourceName','name','description','source','rarity','tagsJson','sortOrder','linkStatus','flagsJson','status','version','updatedAt','updatedBy'],
  ability_external_refs: ['provider','candidateKey','externalNumericId','firstSeenSha','lastSeenSha','externalFingerprint','comparisonFingerprint','externalSnapshotJson','disposition','abilityId','importedAt','importedBy','decidedAt','decidedBy','reviewFlagsJson','note','version'],
  assist_log: ['timestamp','user','action','result','detail'],
};
const GAS_FILES = ['20_assist.gs', '23_assist_hidden.gs', '25_lmfdb_write.gs', '26_ability_capture.gs'];

class Sheet {
  constructor(name, rows, harness) { this.name = name; this.rows = rows; this.harness = harness; }
  getLastRow() { return this.rows.length; }
  getDataRange() { return { getValues: () => clone(this.rows) }; }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return {
      getValues: () => clone(this.rows.slice(row - 1, row - 1 + rowCount).map(values => values.slice(column - 1, column - 1 + columnCount))),
      setValues: values => {
        for (let r = 0; r < rowCount; r++) for (let c = 0; c < columnCount; c++) this.rows[row - 1 + r][column - 1 + c] = values[r][c];
        this.harness.maybeFail(this.name, 'setValues');
      },
    };
  }
  appendRow(values) { this.rows.push(clone(values)); this.harness.maybeFail(this.name, 'appendRow'); }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
}

function cardRow(card, index) {
  const value = { sourceOrder: index + 1, cardId: card.cardId, name: card.name, rarity: card.rarity, aura: card.aura || '赤', cardType: card.cardType || 'ガード', monType: card.monType || '', image: `assist-cards/${card.cardId}.jpg`, accessoryStatus: 'unknown', statsJson: '[]', limitBreakJson: 'null', ratingsJson: '{"ikusei":null,"karyo":null,"battle":null,"ta":null}', formationsJson: '[]', sapoRefJson: 'null', version: 1, updatedAt: NOW, updatedBy: 'seed' };
  return HEADERS.cards.map(key => value[key] === undefined ? '' : value[key]);
}
function abilityRow(ability, index) {
  const value = { ...ability, sourceOrder: index + 1, legacyId: ability.legacyId === null ? '' : ability.legacyId, cardId: ability.cardId || '', rarity: ability.rarity || '', tagsJson: JSON.stringify(ability.tags || []), sortOrder: ability.sortOrder === null ? '' : ability.sortOrder, flagsJson: JSON.stringify(ability.flags || []), version: 1, updatedAt: NOW, updatedBy: 'seed' };
  return HEADERS.abilities.map(key => value[key] === undefined ? '' : value[key]);
}

function makeHarness({ cardList, abilityList, failure, validationFailure } = {}) {
  const state = {
    cards: [HEADERS.cards, ...cardList.map(cardRow)],
    assist_effects: [HEADERS.assist_effects],
    abilities: [HEADERS.abilities, ...abilityList.map(abilityRow)],
    ability_external_refs: [HEADERS.ability_external_refs],
    assist_log: [HEADERS.assist_log, ['sentinel', 'seed', 'seed', 'PASS', 'unchanged']],
  };
  const harness = {
    state, calls: { lock: 0, release: 0 },
    failure: failure ? { ...failure, used: false } : null,
    maybeFail(sheet, op) {
      if (this.failure && !this.failure.used && this.failure.sheet === sheet && this.failure.op === op) {
        this.failure.used = true;
        throw new Error(`injected ${sheet} ${op}`);
      }
    },
  };
  const sheets = Object.fromEntries(Object.entries(state).map(([name, rows]) => [name, new Sheet(name, rows, harness)]));
  const context = {
    console, Map, Set, JSON, Number, Object, String, Array, Date, Math, RegExp, isNaN, isFinite,
    LockService: { getScriptLock() { return { tryLock() { harness.calls.lock++; return true; }, releaseLock() { harness.calls.release++; } }; } },
    requireScope_() { return { nickname: 'tester', role: 'admin', scopes: ['assist'] }; },
    book_() { return { getSheetByName: name => sheets[name] || null }; },
    nowIso_() { return NOW; },
  };
  vm.createContext(context);
  for (const file of GAS_FILES) vm.runInContext(fs.readFileSync(path.join(REPO, '_cms/gas', file), 'utf8'), context);
  if (validationFailure) context.asstValidateDocuments_ = () => ['injected validation failure'];
  else context.asstValidateDocuments_ = () => []; // 模擬シートは効果・画像を持たないので、書込み後の全体検証は差し替える
  context.asstBuildDocuments_ = () => ({ cards: [], effects: {}, abilities: [] });
  harness.context = context;
  harness.before = clone(state);
  return harness;
}

test('照合キーと判定はGAS（26_ability_capture.gs）と既存DB全件で一致する', () => {
  const { context } = makeHarness({ cardList: [], abilityList: [] });
  for (const ability of abilities) {
    assert.strictEqual(context.asstCaptureNameKey_(ability.name), abilityNameKey(ability.name));
    assert.strictEqual(context.asstCaptureDescriptionKey_(ability.description), abilityDescriptionKey(ability.description));
    assert.strictEqual(context.asstCaptureSourceNameKey_(ability.sourceName), sourceNameKey(ability.sourceName));
  }
  const gasAbilities = clone(abilities);
  let compared = 0;
  for (const ability of abilities) {
    const home = ability.cardId ? cards.find(c => c.cardId === ability.cardId)
      : cards.find(c => sourceNameKey(c.name) === sourceNameKey(ability.sourceName)) || cards[0];
    for (const target of [home, cards[compared % cards.length]]) {
      for (const input of [{ name: ability.name, description: ability.description }, { name: ability.name, description: `${ability.description}＜差分＞` }]) {
        const local = classifyAbility(input, target, abilities);
        const gas = context.asstCaptureClassify_(input, target, gasAbilities);
        assert.strictEqual(gas.action, local.action, `${ability.abilityId} → ${target.cardId}`);
        assert.strictEqual(gas.abilityId, local.abilityId, `${ability.abilityId} → ${target.cardId}`);
        assert.deepStrictEqual(Array.from(gas.candidates), local.candidates);
      }
    }
    compared += 1;
  }
  assert.strictEqual(compared, abilities.length);
});

test('lMfDB監査の「同じカードに同名あり」はNode版とGAS版で同じ能力を指す', () => {
  const { context } = makeHarness({ cardList: [], abilityList: [] });
  const { localCardNameMatches } = require('./sync-lmfdb-abilities');
  const probe = abilities.slice(0, 200);
  for (const ability of probe) {
    const external = { name: ability.name, card: ability.sourceName };
    const gas = context.asstCaptureAuditNameMatches_(external, ability.cardId, abilities).map(a => a.abilityId);
    assert(gas.includes(ability.abilityId), ability.abilityId);
    assert.deepStrictEqual(localCardNameMatches(external, ability.cardId, abilities).map(a => a.abilityId), Array.from(gas));
  }
  const other = context.asstCaptureAuditNameMatches_({ name: '[自身青]不屈', card: 'テスト用の未登録カード' }, null, abilities);
  assert.strictEqual(other.length, 0, '閃きの汎用名は別カードの同名に当てない');
});

// ---------------------------------------------------------------- 3. GAS API（模擬シート）

const ALUCARD = cards.find(c => c.cardId === 'c0003-MR');
const OTHER_CARD = { cardId: 'c9999-SSR', name: '別カード', rarity: 'SSR' };
function seedAbilities() {
  return [
    { abilityId: 'ab-0001', legacyId: 1, cardId: 'c9999-SSR', sourceName: '別カード', name: '既存能力 I', description: '既存の説明', source: 'イベント', rarity: 'SSR', tags: [], sortOrder: 1, linkStatus: 'resolved', flags: [], status: 'verified' },
    { abilityId: 'ab-0002', legacyId: 2, cardId: null, sourceName: 'アルカード(ライバル)', name: '紐付け待ち I', description: '未紐付けの説明', source: 'イベント', rarity: 'MR', tags: ['シールド'], sortOrder: null, linkStatus: 'unlinked', flags: [], status: 'verified' },
    { abilityId: 'ab-0003', legacyId: null, cardId: 'c0003-MR', sourceName: 'アルカード', name: '登録済み I', description: '登録済みの説明', source: 'イベント', rarity: 'MR', tags: [], sortOrder: 1, linkStatus: 'resolved', flags: [], status: 'verified' },
  ];
}
function capturePayload(abilityList) {
  return { schemaVersion: 1, source: 'claude-vision', cardId: 'c0003-MR', sourceScreenshots: ['a.png'], abilities: abilityList };
}
const CREATE = { action: 'create', name: '光香む常闇の衣 I', description: '[前半][自身青]＜青＞技発動時、ライフステ＜２０％＞の【シールド】展開＜２０秒＞＜１回＞', source: 'イベント', tags: ['シールド'] };
const CREATE2 = { action: 'create', name: '光香む常闇の衣 II', description: '[前半][自身青]＜青＞技発動時、自身に次の効果＜２０秒＞＜１回＞<br>・ライフステ＜３０％＞の【シールド】展開[最大値＋２００]', source: 'イベント', tags: [] };
const LINK = { action: 'link', abilityId: 'ab-0002', name: '紐付け待ち I', description: '未紐付けの説明', source: 'イベント', tags: [] };
const KNOWN = { action: 'known', name: '登録済み I', description: '登録済みの説明', source: 'イベント', tags: [] };

function rowsOf(harness, sheet) {
  const [headers, ...rows] = harness.state[sheet];
  return rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

test('プレビューはシートを変えずにサーバー判定を返す', () => {
  const harness = makeHarness({ cardList: [ALUCARD, OTHER_CARD], abilityList: seedAbilities() });
  const result = harness.context.api_asstPreviewAbilityCapture(capturePayload([CREATE, LINK, KNOWN]));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(Array.from(result.results.map(r => r.action)), ['create', 'link', 'known']);
  assert.deepStrictEqual(harness.state, harness.before);
  assert.strictEqual(harness.calls.lock, 0);
});

test('取り込みは新規をdraftで末尾に追加し、未紐付けをresolvedへ紐付ける', () => {
  const harness = makeHarness({ cardList: [ALUCARD, OTHER_CARD], abilityList: seedAbilities() });
  const result = harness.context.api_asstApplyAbilityCapture(capturePayload([LINK, CREATE, KNOWN, CREATE2]));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.linked)), [{ abilityId: 'ab-0002', sortOrder: 2 }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.created)).map(c => [c.abilityId, c.sortOrder, c.sourceOrder, c.status]), [['ab-0004', 3, 4, 'draft'], ['ab-0005', 4, 5, 'draft']]);
  assert.strictEqual(result.skipped, 1);
  const rows = rowsOf(harness, 'abilities');
  const linked = rows.find(row => row.abilityId === 'ab-0002');
  assert.strictEqual(linked.cardId, 'c0003-MR');
  assert.strictEqual(linked.linkStatus, 'resolved');
  assert.strictEqual(linked.sortOrder, 2);
  assert.strictEqual(linked.description, '未紐付けの説明', '紐付けでは本文を変えない');
  assert.strictEqual(linked.status, 'verified', '紐付けでは状態を変えない');
  assert.strictEqual(linked.version, 2);
  const created = rows.find(row => row.abilityId === 'ab-0004');
  assert.strictEqual(created.cardId, 'c0003-MR');
  assert.strictEqual(created.sourceName, 'アルカード');
  assert.strictEqual(created.rarity, 'MR');
  assert.strictEqual(created.legacyId, '');
  assert.strictEqual(created.status, 'draft');
  assert.strictEqual(created.tagsJson, '["シールド"]');
  assert.strictEqual(rows.find(row => row.abilityId === 'ab-0005').description, CREATE2.description);
  const log = harness.state.assist_log.at(-1);
  assert.strictEqual(log[2], 'apply-ability-capture');
  assert.deepStrictEqual(JSON.parse(log[4]).created, ['ab-0004', 'ab-0005']);
  assert.strictEqual(harness.calls.lock, 1);
  assert.strictEqual(harness.calls.release, 1);
});

test('貼り付け時の判定が今のシートと食い違えば何も書かない', () => {
  const harness = makeHarness({ cardList: [ALUCARD, OTHER_CARD], abilityList: seedAbilities() });
  assert.throws(() => harness.context.api_asstApplyAbilityCapture(capturePayload([{ ...KNOWN, action: 'create' }])), /判定が一致しない/);
  assert.throws(() => harness.context.api_asstApplyAbilityCapture(capturePayload([{ ...LINK, abilityId: 'ab-0001' }])), /判定が一致しない/);
  assert.throws(() => harness.context.api_asstApplyAbilityCapture(capturePayload([{ ...CREATE, action: 'link', abilityId: 'ab-0002' }])), /判定が一致しない/);
  assert.deepStrictEqual(harness.state, harness.before);
  assert.strictEqual(harness.calls.release, harness.calls.lock);
});

test('入力検査: action・キー・改行・カード・件数', () => {
  const harness = makeHarness({ cardList: [ALUCARD, OTHER_CARD], abilityList: seedAbilities() });
  const api = payload => harness.context.api_asstApplyAbilityCapture(payload);
  assert.throws(() => api(capturePayload([{ ...CREATE, action: 'link_ambiguous' }])), /actionは/);
  assert.throws(() => api(capturePayload([{ ...CREATE, sortOrder: 1 }])), /未知の項目/);
  assert.throws(() => api(capturePayload([{ ...CREATE, abilityId: 'ab-0100' }])), /サーバー採番/);
  assert.throws(() => api(capturePayload([{ ...CREATE, description: 'A\nB' }])), /<br>/);
  assert.throws(() => api(capturePayload([{ ...CREATE, description: '<b>A</b>' }])), /<br>以外のHTML/);
  assert.throws(() => api(capturePayload([CREATE, { ...CREATE }])), /同じ名前が2回/);
  assert.throws(() => api({ ...capturePayload([CREATE]), cardId: 'c0000-XX' }), /カードが見つかりません/);
  assert.throws(() => api(capturePayload(Array.from({ length: 31 }, (_, index) => ({ ...CREATE, name: `能力${index}` })))), /30件まで/);
  assert.deepStrictEqual(harness.state, harness.before);
});

test('書込み後の検証に失敗したら追加・紐付けを全部元に戻す', () => {
  const harness = makeHarness({ cardList: [ALUCARD, OTHER_CARD], abilityList: seedAbilities(), validationFailure: true });
  assert.throws(() => harness.context.api_asstApplyAbilityCapture(capturePayload([LINK, CREATE])), /元に戻しました/);
  assert.deepStrictEqual(harness.state, harness.before);
});

test('途中の書込み失敗でも書いた行を元に戻す', () => {
  const harness = makeHarness({ cardList: [ALUCARD, OTHER_CARD], abilityList: seedAbilities(), failure: { sheet: 'abilities', op: 'appendRow' } });
  assert.throws(() => harness.context.api_asstApplyAbilityCapture(capturePayload([LINK, CREATE])), /元に戻しました/);
  assert.deepStrictEqual(harness.state, harness.before);
});

test('既存の能力行・カード行・外部参照はそれ以外変わらない', () => {
  const harness = makeHarness({ cardList: [ALUCARD, OTHER_CARD], abilityList: seedAbilities() });
  harness.context.api_asstApplyAbilityCapture(capturePayload([CREATE]));
  assert.deepStrictEqual(harness.state.cards, harness.before.cards);
  assert.deepStrictEqual(harness.state.ability_external_refs, harness.before.ability_external_refs);
  assert.deepStrictEqual(harness.state.abilities.slice(0, 4), harness.before.abilities);
});

let failed = 0;
for (const [label, fn] of cases) {
  try { fn(); console.log(`PASS ${label}`); }
  catch (error) { failed += 1; console.log(`FAIL ${label}\n  ${error.stack.split('\n').slice(0, 4).join('\n  ')}`); }
}
console.log(`\nアシスト能力取り込みテスト: ${cases.length - failed}/${cases.length} PASS`);
if (failed) process.exit(1);
