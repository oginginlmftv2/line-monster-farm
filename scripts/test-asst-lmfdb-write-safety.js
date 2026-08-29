#!/usr/bin/env node
'use strict';

/** P12-17 段階4-6: 操作ジャーナル補償・競合・補償失敗の専用mock破壊テスト。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const existingTest = path.join(__dirname, 'test-asst-lmfdb-create-api.js');
const helperSource = fs.readFileSync(existingTest, 'utf8').split('\nlet passed = 0;')[0];
const sandbox = { require, __dirname, __filename: existingTest, console, Buffer, process };
vm.runInNewContext(`${helperSource}\nthis.__h={HEADERS,clone,abilityRow,makeHarness,candidatePayload,refRowFor};`, sandbox, { filename: existingTest });
const { HEADERS, clone, abilityRow, makeHarness, candidatePayload, refRowFor } = sandbox.__h;
function plain(value) { return JSON.parse(JSON.stringify(value)); }

let passed = 0;
function test(label, action) {
  action();
  passed++;
  console.log(`PASS ${label}`);
}
function installFailurePoint(harness, point, action) {
  let used = false;
  harness.context.asstLmfdbFailurePoint_ = current => {
    if (!used && current === point) {
      used = true;
      if (action) action();
      throw new Error(`injected ${point}`);
    }
  };
}
function runCreateFailure(point, options = {}) {
  const h = makeHarness(options);
  const payload = candidatePayload(h, options.id || 1201, {}, options.confirmations || {});
  const before = clone(h.state);
  installFailurePoint(h, point);
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload), new RegExp(point));
  assert.deepStrictEqual(h.state, before);
  assert.strictEqual(h.calls.lock, 1);
  assert.strictEqual(h.calls.release, 1);
}
function ownRows(harness) {
  return {
    abilities: harness.state.abilities.filter((row, index) => index && row[HEADERS.abilities.indexOf('abilityId')] === 'ab-0002'),
    refs: harness.state.ability_external_refs.filter((row, index) => index && row[HEADERS.ability_external_refs.indexOf('candidateKey')] && row[HEADERS.ability_external_refs.indexOf('disposition')] === 'imported'),
    logs: harness.state.assist_log.filter((row, index) => index && row[HEADERS.assist_log.indexOf('action')] === 'create-external-ability'),
  };
}
function expectMajor(action) {
  assert.throws(action, error => {
    assert(/重大エラー/.test(error.message));
    assert(/補償検算失敗/.test(error.message));
    assert(/全保存・公開を停止/.test(error.message));
    assert(/再実行せず/.test(error.message));
    assert(/本番bookコピーと比較/.test(error.message));
    return true;
  });
}

for (const point of [
  'before-abilities-append', 'after-abilities-append',
  'before-new-ref-append', 'after-new-ref-append',
  'before-create-verification', 'before-assist-log-append',
  'after-assist-log-append', 'before-final-row-count-check',
]) {
  test(`${point}失敗は自分の追加行だけを補償`, () => runCreateFailure(point));
}

for (const point of ['before-existing-ref-update', 'after-existing-ref-update']) {
  test(`${point}失敗はid_reused行だけを更新前へ戻す`, () => {
    const seed = makeHarness();
    const ref = refRowFor(seed, 1, 'id_reused');
    runCreateFailure(point, { refs: [ref], id: 1, confirmations: { idReuseReviewed: true } });
  });
}

test('abilityId採番後のabilities衝突を通常拒否し競合行を残す', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  h.context.asstLmfdbFailurePoint_ = point => {
    if (point === 'before-abilities-append') h.state.abilities.push(abilityRow({ abilityId: 'ab-0002', sourceOrder: 2, cardId: '', sortOrder: '', linkStatus: 'unlinked' }));
  };
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload), /衝突/);
  assert.strictEqual(h.state.abilities.length, 3);
});

test('sourceOrder採番後の衝突を通常拒否し競合行を残す', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  h.context.asstLmfdbFailurePoint_ = point => {
    if (point === 'before-abilities-append') h.state.abilities.push(abilityRow({ abilityId: 'ab-9000', sourceOrder: 2, cardId: '', sortOrder: '', linkStatus: 'unlinked' }));
  };
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload), /sourceOrder採番後/);
  assert.strictEqual(h.state.abilities.length, 3);
});

test('abilityId採番後の予約済みref衝突を通常拒否し予約行を残す', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  h.context.asstLmfdbFailurePoint_ = point => {
    if (point !== 'before-abilities-append') return;
    const row = Array(HEADERS.ability_external_refs.length).fill('');
    row[HEADERS.ability_external_refs.indexOf('candidateKey')] = 'e'.repeat(64);
    row[HEADERS.ability_external_refs.indexOf('abilityId')] = 'ab-0002';
    h.state.ability_external_refs.push(row);
  };
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload), /衝突/);
  assert.strictEqual(h.state.ability_external_refs.length, 2);
});

test('sortOrder採番後の衝突を通常拒否し競合行を残す', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1200);
  h.context.asstLmfdbFailurePoint_ = point => {
    if (point === 'before-abilities-append') h.state.abilities.push(abilityRow({ abilityId: 'ab-9000', sourceOrder: 9000, sortOrder: 2, name: '別操作の能力' }));
  };
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload), /sortOrder採番後/);
  assert.strictEqual(h.state.abilities.length, 3);
});

test('同じcandidateKeyの同時処置を通常拒否し競合refを残す', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  const candidateKeyColumn = HEADERS.ability_external_refs.indexOf('candidateKey');
  h.context.asstLmfdbFailurePoint_ = point => {
    if (point !== 'before-abilities-append') return;
    const row = Array(HEADERS.ability_external_refs.length).fill('');
    row[HEADERS.ability_external_refs.indexOf('provider')] = 'lmfdb';
    row[candidateKeyColumn] = payload.candidateKey;
    row[HEADERS.ability_external_refs.indexOf('disposition')] = 'ignored';
    h.state.ability_external_refs.push(row);
  };
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload), /同じcandidateKey/);
  assert.strictEqual(h.state.ability_external_refs.length, 2);
});

test('補償中も別abilityId・candidateKey・log・既存行更新を完全に保持', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  const unrelatedAbility = abilityRow({ abilityId: 'ab-9000', sourceOrder: 9000, legacyId: '', cardId: '', sortOrder: '', linkStatus: 'unlinked', name: '別操作の能力' });
  const unrelatedRef = Array(HEADERS.ability_external_refs.length).fill('');
  unrelatedRef[HEADERS.ability_external_refs.indexOf('candidateKey')] = 'f'.repeat(64);
  const unrelatedLog = ['later', 'other', 'other-action', 'PASS', 'other-detail'];
  installFailurePoint(h, 'after-assist-log-append', () => {
    h.state.abilities[1][HEADERS.abilities.indexOf('name')] = '人が保存後に変更';
    h.state.abilities.push(clone(unrelatedAbility));
    h.state.ability_external_refs.push(clone(unrelatedRef));
    h.state.assist_log.push(clone(unrelatedLog));
  });
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload), /after-assist-log-append/);
  assert.deepStrictEqual(plain(ownRows(h)), { abilities: [], refs: [], logs: [] });
  assert.strictEqual(h.state.abilities[1][HEADERS.abilities.indexOf('name')], '人が保存後に変更');
  assert.deepStrictEqual(plain(h.state.abilities[2]), plain(unrelatedAbility));
  assert.deepStrictEqual(plain(h.state.ability_external_refs[1]), plain(unrelatedRef));
  assert.deepStrictEqual(plain(h.state.assist_log[2]), plain(unrelatedLog));
});

test('追加能力を一意確認できない場合は重大エラーで推測削除しない', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  installFailurePoint(h, 'after-new-ref-append', () => h.state.abilities.push(clone(h.state.abilities[2])));
  expectMajor(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload));
  assert.strictEqual(ownRows(h).abilities.length, 2);
});

test('追加refを一意確認できない場合は重大エラーで推測削除しない', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  installFailurePoint(h, 'after-new-ref-append', () => h.state.ability_external_refs.push(clone(h.state.ability_external_refs[1])));
  expectMajor(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload));
  assert.strictEqual(ownRows(h).refs.length, 2);
});

test('更新refが補償前に別内容へ変化した場合は重大エラーで上書きしない', () => {
  const seed = makeHarness();
  const ref = refRowFor(seed, 1, 'id_reused');
  const h = makeHarness({ refs: [ref] });
  const payload = candidatePayload(h, 1, {}, { idReuseReviewed: true });
  const note = HEADERS.ability_external_refs.indexOf('note');
  installFailurePoint(h, 'after-existing-ref-update', () => { h.state.ability_external_refs[1][note] = '別操作の変更'; });
  expectMajor(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload));
  assert.strictEqual(h.state.ability_external_refs[1][note], '別操作の変更');
});

test('追加logを一意確認できない場合は重大エラーで推測削除しない', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  installFailurePoint(h, 'after-assist-log-append', () => h.state.assist_log.push(clone(h.state.assist_log[2])));
  expectMajor(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload));
  assert.strictEqual(ownRows(h).logs.length, 2);
});

test('deleteRow失敗は重大エラーへ昇格', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  const sheet = h.context.asstSheet_('abilities');
  sheet.deleteRow = () => { throw new Error('injected deleteRow'); };
  installFailurePoint(h, 'after-abilities-append');
  expectMajor(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload));
});

test('ref復元setValues失敗は重大エラーへ昇格', () => {
  const seed = makeHarness();
  const ref = refRowFor(seed, 1, 'id_reused');
  const h = makeHarness({ refs: [ref] });
  const payload = candidatePayload(h, 1, {}, { idReuseReviewed: true });
  const sheet = h.context.asstSheet_('ability_external_refs');
  installFailurePoint(h, 'after-existing-ref-update', () => {
    const original = sheet.getRange.bind(sheet);
    sheet.getRange = (...args) => {
      const range = original(...args);
      range.setValues = () => { throw new Error('injected restore setValues'); };
      return range;
    };
  });
  expectMajor(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload));
});

test('補償後検算失敗は重大エラーへ昇格', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  h.context.asstSheet_('abilities').deleteRow = () => {};
  installFailurePoint(h, 'after-abilities-append');
  expectMajor(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload));
});

test('lock競合は認証・外部取得・シート読取・解放前に拒否', () => {
  const h = makeHarness({ lockAvailable: false });
  const payload = candidatePayload(h, 1201);
  h.calls.fetch = []; h.calls.auth = 0; h.calls.lock = 0; h.calls.release = 0;
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload), /重なりました/);
  assert.deepStrictEqual(h.calls.fetch, []);
  assert.strictEqual(h.calls.auth, 0);
  assert.strictEqual(h.calls.lock, 1);
  assert.strictEqual(h.calls.release, 0);
});

test('例外時もScriptLockを二重取得・二重解放しない', () => {
  const h = makeHarness();
  const payload = candidatePayload(h, 1201);
  installFailurePoint(h, 'after-new-ref-append');
  assert.throws(() => h.context.api_asstCreateAbilityFromExternalCandidate(payload));
  assert.strictEqual(h.calls.lock, 1);
  assert.strictEqual(h.calls.release, 1);
});

test('unlinkedはverifiedでも公開ページ能力の対象外', () => {
  const h = makeHarness();
  const abilities = [
    { abilityId: 'ab-x', linkStatus: 'unlinked', status: 'verified' },
    { abilityId: 'ab-y', linkStatus: 'resolved', status: 'draft' },
    { abilityId: 'ab-z', linkStatus: 'resolved', status: 'verified' },
  ];
  assert.deepStrictEqual(plain(h.context.asstPublicPageAbilities_(abilities).map(item => item.abilityId)), ['ab-z']);
});

console.log(`OK lMfDB書込み安全性mock破壊テスト ${passed}ケース`);
