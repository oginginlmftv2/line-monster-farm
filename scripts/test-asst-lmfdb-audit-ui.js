#!/usr/bin/env node
/** 外部能力DB監査UIを、GAS APIと最小DOMのstubで回帰検査する。 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const UI_SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/ui_assist.html'), 'utf8');
const SCRIPT = UI_SOURCE.match(/<script>([\s\S]*)<\/script>/)[1];
const FIXED_SHA = 'a'.repeat(40);
const JSON_SHA = 'b'.repeat(64);
const ABILITIES_VERSION = 'c'.repeat(64);

function counts(overrides = {}) {
  return Object.assign({
    external: 1202, local: 1084, newCandidates: 118, cardMatchCandidates: 98,
    unlinkedCandidates: 20, idReuseSuspected: 1, existingContentDifferences: 2,
    representationOnly: 3, duplicateLocalContentMatches: 22,
    missingUpstreamObservations: 20, processed: 1,
  }, overrides);
}

function candidate(classification, id, name, overrides = {}) {
  return Object.assign({
    classification,
    priorityOrder: 1,
    externalNumericId: id,
    externalSnapshot: { card: `カード${id}`, name, desc: '説明', source: 'イベント', rarity: 'MR', tags: ['タグ'] },
    cardIdCandidate: `card-${id}`,
    disposition: null,
    processed: false,
    registrationEligible: classification === 'card_match_candidate' || classification === 'unlinked_candidate',
  }, overrides);
}

function response(overrides = {}) {
  return Object.assign({
    auditVersion: 3,
    provider: 'lmfdb',
    externalSha: FIXED_SHA,
    externalSha256: JSON_SHA,
    expectedAbilitiesVersion: ABILITIES_VERSION,
    auditStatus: 'PASS',
    safetyVerdict: 'BLOCKED',
    blockReasons: ['ID_REUSE_SUSPECTED'],
    reviewReasons: ['EXISTING_CONTENT_DIFFERENCES'],
    validationErrors: [],
    counts: counts(),
    candidates: [candidate('card_match_candidate', 1200, '先頭候補')],
    pagination: { page: 1, pageSize: 50, totalItems: 51, totalPages: 2 },
  }, overrides);
}

function node() {
  return {
    innerHTML: '', textContent: '', value: '', disabled: false, checked: false, hidden: false,
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll() { return []; },
  };
}

function harness(options = {}) {
  const elements = new Map();
  const calls = [];
  const busy = [];
  const transport = { response: options.response || response(), error: null, defer: false, pending: null };
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const context = {
    console,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    Promise,
    Date,
    RegExp,
    Math,
    JSON,
    isFinite,
    setTimeout(fn) { fn(); },
    fetch() { throw new Error('テスト中にfetchを直接呼び出した'); },
    document: {
      body: { classList: { add() {}, remove() {}, toggle() {} } },
      querySelectorAll() { return []; },
      createElement() { return node(); },
    },
    el: getElement,
    esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    },
    setBusy(value, message) { busy.push({ value, message }); },
    show() {},
    confirm() { return true; },
    prompt() { return null; },
    alert() {},
    FileReader: function FileReader() {},
    Blob: function Blob() {},
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
  };
  if (!options.localPreview) {
    const runner = {
      success: null,
      failure: null,
      withSuccessHandler(callback) { this.success = callback; return this; },
      withFailureHandler(callback) { this.failure = callback; return this; },
      api_asstAuditExternalAbilities(payload) {
        calls.push({ name: 'api_asstAuditExternalAbilities', payload: JSON.parse(JSON.stringify(payload)) });
        if (transport.defer) { transport.pending = { success: this.success, failure: this.failure }; return; }
        if (transport.error) this.failure(transport.error);
        else this.success(transport.response);
      },
    };
    context.google = { script: { run: runner } };
  }
  vm.createContext(context);
  vm.runInContext(SCRIPT, context, { filename: 'ui_assist.html' });
  return { context, elements, calls, busy, transport, html: () => getElement('asst_editor').innerHTML };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

test('監査入口が存在する', () => {
  assert.match(UI_SOURCE, /id="asst_btnExternalAbilityAudit"[^>]*>外部能力DBを確認</);
});

test('初回はSHAなし・page 1・pageSize 50', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  assert.deepStrictEqual(h.calls[0], { name: 'api_asstAuditExternalAbilities', payload: { page: 1, pageSize: 50 } });
  assert.strictEqual(h.context.ASST.audit.externalSha, FIXED_SHA);
  assert.strictEqual(h.context.ASST.audit.expectedAbilitiesVersion, ABILITIES_VERSION);
});

test('次ページは応答の固定SHAを使う', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  h.transport.response = response({ pagination: { page: 2, pageSize: 50, totalItems: 51, totalPages: 2 } });
  h.context.asstLoadExternalAudit(2, false);
  assert.deepStrictEqual(h.calls[1].payload, { page: 2, pageSize: 50, externalSha: FIXED_SHA });
});

test('最新状態で再監査だけが保持SHAを破棄する', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  h.context.asstLoadExternalAudit(1, true);
  assert.deepStrictEqual(h.calls[1].payload, { page: 1, pageSize: 50 });
});

test('処理中は二重実行を防ぐ', () => {
  const h = harness();
  h.transport.defer = true;
  h.context.asstOpenExternalAudit();
  h.context.asstLoadExternalAudit(1, false);
  assert.strictEqual(h.calls.length, 1);
  assert.strictEqual(h.context.ASST.audit.loading, true);
});

test('API例外を区別して候補を隠す', () => {
  const h = harness();
  h.transport.error = new Error('network failed');
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /API例外/);
  assert.doesNotMatch(h.html(), /候補一覧/);
});

test('構造不正を区別して候補を隠す', () => {
  const h = harness({ response: { auditVersion: 3 } });
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /応答構造不正/);
  assert.doesNotMatch(h.html(), /候補一覧/);
});

test('auditStatus FAILでは候補を表示しない', () => {
  const h = harness({ response: response({
    auditStatus: 'FAIL', safetyVerdict: 'BLOCKED', blockReasons: ['AUDIT_INPUT_INVALID'],
    validationErrors: ['fixture invalid'], candidates: [], pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  }) });
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /監査結果: FAIL/);
  assert.doesNotMatch(h.html(), /<h2>候補一覧<\/h2>/);
});

test('BLOCKEDでも候補を表示しID再利用は監査成功と明示する', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /BLOCKED（安全性の確認が必要）/);
  assert.match(h.html(), /監査処理自体は成功しています/);
  assert.match(h.html(), /<h2>候補一覧<\/h2>/);
});

test('監査サマリーに全分類件数を表示する', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  for (const label of ['外部件数','ローカル件数','カード対応候補数','未紐付け候補数','ID再利用疑い数','既存内容差分数','表記違い数','重複内容一致数','外部欠落観測数','処置済み件数']) {
    assert(h.html().includes(label), label);
  }
  assert(!h.html().includes(ABILITIES_VERSION));
});

test('API候補順を変更しない', () => {
  const first = candidate('unlinked_candidate', 1202, 'API先頭');
  const second = candidate('card_match_candidate', 1100, 'API後続');
  const h = harness({ response: response({ candidates: [first, second] }) });
  h.context.asstOpenExternalAudit();
  assert(h.html().indexOf('API先頭') < h.html().indexOf('API後続'));
});

test('50件ページングと先頭・最終ボタン制御', () => {
  const first = harness();
  first.context.asstOpenExternalAudit();
  assert.match(first.html(), /id="asst_auditPrev" disabled/);
  assert.doesNotMatch(first.html(), /id="asst_auditNext" disabled/);
  const last = harness({ response: response({ pagination: { page: 2, pageSize: 50, totalItems: 51, totalPages: 2 } }) });
  last.context.asstOpenExternalAudit();
  assert.match(last.html(), /現在ページ 2 \/ 総ページ 2 ・ 総候補数 51/);
  assert.match(last.html(), /id="asst_auditNext" disabled/);
});

test('低優先3分類は既定で折りたたむ', () => {
  const candidates = [
    candidate('card_match_candidate', 1, 'open'),
    candidate('representationOnly', 2, 'closed-a'),
    candidate('duplicate_local_content_match', 3, 'closed-b'),
    candidate('missing_upstream_observation', 4, 'closed-c', { externalSnapshot: null, localObservation: { name: '欠落', sourceName: 'ローカル' }, registrationEligible: false }),
  ];
  const h = harness({ response: response({ candidates }) });
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /<details open><summary>カード対応候補/);
  for (const label of ['表記違い','重複内容一致','外部欠落観測']) assert.match(h.html(), new RegExp(`<details><summary>${label}`));
});

test('処置済み候補はチェック後だけ表示する', () => {
  const processed = candidate('card_match_candidate', 5, '処置済み候補', { processed: true, disposition: 'ignored', registrationEligible: false });
  const h = harness({ response: response({ candidates: [processed] }) });
  h.context.asstOpenExternalAudit();
  assert.doesNotMatch(h.html(), /処置済み候補/);
  h.context.ASST.audit.showProcessed = true;
  h.context.asstRenderExternalAudit();
  assert.match(h.html(), /処置済み候補/);
  assert.match(h.html(), /処置済み: ignored/);
});

test('externalSnapshot nullでも描画できる', () => {
  const missing = candidate('missing_upstream_observation', 1080, 'unused', {
    externalSnapshot: null, localObservation: { name: 'ローカル能力', sourceName: '元カード' }, cardIdCandidate: null, registrationEligible: false,
  });
  const h = harness({ response: response({ candidates: [missing] }) });
  assert.doesNotThrow(() => h.context.asstOpenExternalAudit());
  assert.match(h.html(), /ローカル能力/);
  assert.match(h.html(), /監査情報のみ/);
});

test('外部文字列をescし実行可能なHTMLにしない', () => {
  const evil = '<script>globalThis.PWNED=1<\/script><img src=x onerror=globalThis.PWNED=2>';
  const item = candidate('card_match_candidate', 9, evil);
  item.externalSnapshot.card = evil;
  item.externalSnapshot.desc = evil;
  item.externalSnapshot.tags = [evil];
  const h = harness({ response: response({ candidates: [item] }) });
  h.context.asstOpenExternalAudit();
  assert.doesNotMatch(h.html(), /<script>|<img/);
  assert.match(h.html(), /&lt;script&gt;/);
  assert.match(h.html(), /&lt;img src=x onerror=/);
  assert.strictEqual(h.context.PWNED, undefined);
});

test('監査画面に書込み・削除・公開操作を置かない', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  const buttonLabels = [...h.html().matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match => match[1]);
  assert(!buttonLabels.some(label => /登録|保存|処置|削除|公開/.test(label)), buttonLabels.join(' / '));
  assert.deepStrictEqual([...new Set(h.calls.map(call => call.name))], ['api_asstAuditExternalAbilities']);
  assert.doesNotMatch(h.html(), /abilityId[^<]*<input|sortOrder[^<]*<input/);
});

test('既存カード編集・効果・OCR・能力・export入口を維持する', () => {
  for (const token of ['asstSaveCard','asstSaveEffects','asstRunEffectOcr','asstSaveAbility','asstExportAll']) assert.match(UI_SOURCE, new RegExp(`function ${token}\\(`));
});

test('監査エラーでも直前のカード選択を保持して戻る', () => {
  const h = harness();
  const detail = { marker: 'existing-card-state' };
  let rendered = 0;
  h.context.ASST.selectedId = 'card-before-audit';
  h.context.ASST.detail = detail;
  h.context.asstRenderEditor = () => { rendered++; };
  h.transport.error = new Error('audit failed');
  h.context.asstOpenExternalAudit();
  assert.strictEqual(h.context.ASST.selectedId, 'card-before-audit');
  assert.strictEqual(h.context.ASST.detail, detail);
  h.context.asstReturnFromExternalAudit();
  assert.strictEqual(rendered, 1);
});

test('ローカルプレビューでは監査APIを呼ばず実行不能を明示する', () => {
  const h = harness({ localPreview: true });
  h.context.asstOpenExternalAudit();
  assert.strictEqual(h.calls.length, 0);
  assert.match(h.html(), /ローカルプレビューではGAS APIを呼べない/);
  assert.match(h.html(), /id="asst_btnAuditLatest" disabled/);
});

console.log(`\n${passed} audit UI tests passed`);
