#!/usr/bin/env node
/** 外部能力DB監査UIを、GAS APIと最小DOMのstubで回帰検査する。 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const COMMON_UI_SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/ui_common.html'), 'utf8');
const COMMON_SCRIPT = COMMON_UI_SOURCE.match(/<script>([\s\S]*)<\/script>/)[1];
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
    candidateKey: 'd'.repeat(64), externalFingerprint: 'e'.repeat(64), comparisonFingerprint: 'f'.repeat(64),
    exactMatchAbilityIds: [], nfkcMatchAbilityIds: [], sameIdComparison: null, auditOnly: false,
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
    pagination: { page: 1, pageSize: 1000, totalItems: 1, totalPages: 1 },
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
  const timers = [];
  const transport = { response: options.response || response(), pages: options.pages || null, error: null, defer: false, pending: null, writeError: null, createResult: null };
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
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
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
    call(name, args, success) {
      calls.push({ name, payload: JSON.parse(JSON.stringify(args[0])) });
      if (name === 'api_asstCreateAbilityFromExternalCandidate') success({ ok: true, abilityId: 'ab-1085', legacyId: null, status: 'draft', linkStatus: 'unlinked', sortOrder: null });
      else if (name === 'api_asstSetExternalCandidateDisposition') success({ ok: true, disposition: args[0].disposition, version: 1 });
      else throw new Error(`予期しないcall: ${name}`);
    },
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
      api_asstCreateAbilityFromExternalCandidate(payload) {
        calls.push({ name: 'api_asstCreateAbilityFromExternalCandidate', payload: JSON.parse(JSON.stringify(payload)) });
        if (transport.writeError) { this.failure(new Error(transport.writeError)); return; }
        this.success(transport.createResult || { ok: true, abilityId: 'ab-1085', legacyId: null, status: 'draft', linkStatus: payload.registration.linkStatus, sortOrder: payload.registration.linkStatus === 'resolved' ? 1 : null });
      },
      api_asstSetExternalCandidateDisposition(payload) {
        calls.push({ name: 'api_asstSetExternalCandidateDisposition', payload: JSON.parse(JSON.stringify(payload)) });
        if (transport.writeError) { this.failure(new Error(transport.writeError)); return; }
        this.success({ ok: true, disposition: payload.disposition, version: 1 });
      },
      api_asstAuditExternalAbilities(payload) {
        calls.push({ name: 'api_asstAuditExternalAbilities', payload: JSON.parse(JSON.stringify(payload)) });
        if (transport.defer) { transport.pending = { success: this.success, failure: this.failure }; return; }
        if (transport.error) this.failure(transport.error);
        else if (transport.pages) this.success(transport.pages[(payload.page || 1) - 1]);
        else this.success(transport.response);
      },
    };
    context.google = { script: { run: runner } };
  }
  const callStub = context.call;
  vm.createContext(context);
  vm.runInContext(COMMON_SCRIPT, context, { filename: 'ui_common.html' });
  Object.assign(context, {
    el: getElement,
    esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    },
    setBusy(value, message) { busy.push({ value, message }); },
    show() {},
    call: callStub,
  });
  vm.runInContext(SCRIPT, context, { filename: 'ui_assist.html' });
  const runTimers = () => { const queued = timers.splice(0, timers.length); queued.forEach(fn => fn()); return queued.length; };
  return { context, elements, calls, busy, transport, timers, runTimers, html: () => getElement('asst_editor').innerHTML };
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

test('ui_commonの対訳関数を本番順で読み込む', () => {
  const h = harness();
  assert.strictEqual(h.context.cmsLabel('PASS'), '監査成功（PASS）');
  assert.strictEqual(h.context.cmsLabelShort('card_match_candidate'), 'カード対応候補');
  assert.strictEqual(h.context.CMS_LABELS.BLOCKED, '停止');
});

test('初回はSHAなし・page 1・pageSize 1000', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  assert.deepStrictEqual(h.calls[0], { name: 'api_asstAuditExternalAbilities', payload: { page: 1, pageSize: 1000 } });
  assert.strictEqual(h.calls.length, 1);
  assert.strictEqual(h.context.ASST.audit.externalSha, FIXED_SHA);
  assert.strictEqual(h.context.ASST.audit.expectedAbilitiesVersion, ABILITIES_VERSION);
});

test('全ページを同じ固定SHAで取り込み1つの候補配列へ結合する', () => {
  const pages = [
    response({ candidates: [candidate('card_match_candidate', 1, 'p1')], pagination: { page: 1, pageSize: 1000, totalItems: 2, totalPages: 2 } }),
    response({ candidates: [candidate('card_match_candidate', 2, 'p2')], pagination: { page: 2, pageSize: 1000, totalItems: 2, totalPages: 2 } }),
  ];
  const h = harness({ pages });
  h.context.asstOpenExternalAudit();
  assert.deepStrictEqual(h.calls[0].payload, { page: 1, pageSize: 1000 });
  assert.deepStrictEqual(h.calls[1].payload, { page: 2, pageSize: 1000, externalSha: FIXED_SHA });
  assert.strictEqual(h.calls.length, 2);
  assert.strictEqual(h.context.ASST.audit.response.candidates.length, 2);
  assert.match(h.html(), /p1[\s\S]*p2/);
});

test('取り込み途中で外部SHAまたはversionが変わったら結合せず停止する', () => {
  const pages = [
    response({ candidates: [candidate('card_match_candidate', 1, 'p1')], pagination: { page: 1, pageSize: 1000, totalItems: 2, totalPages: 2 } }),
    response({ externalSha: 'f'.repeat(40), candidates: [candidate('card_match_candidate', 2, 'p2')], pagination: { page: 2, pageSize: 1000, totalItems: 2, totalPages: 2 } }),
  ];
  const h = harness({ pages });
  h.context.asstOpenExternalAudit();
  assert.strictEqual(h.context.ASST.audit.response, null);
  assert.match(h.html(), /取り込み中に外部コミットSHAまたはローカル能力versionが変わりました/);
});

test('タブ切り替え・検索・ページ送りではAPIを再実行しない', () => {
  const candidates = [];
  for (let index = 0; index < 45; index += 1) candidates.push(candidate('card_match_candidate', index + 1, `能力${index + 1}`));
  candidates.push(candidate('unlinked_candidate', 900, '未紐付け能力'));
  const h = harness({ response: response({ candidates, pagination: { page: 1, pageSize: 1000, totalItems: 46, totalPages: 1 } }) });
  h.context.asstOpenExternalAudit();
  h.context.el('asst_auditNext').onclick();
  h.context.ASST.audit.tab = 'unlinked_candidate';
  h.context.asstRenderExternalAudit();
  h.context.el('asst_auditSearch').value = '未紐付け';
  h.context.el('asst_auditSearch').oninput();
  h.context.el('asst_auditSearchRun').onclick();
  assert.strictEqual(h.calls.length, 1);
});

test('最新状態で再監査だけが保持SHAを破棄する', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  h.context.asstLoadExternalAudit(true);
  assert.deepStrictEqual(h.calls[1].payload, { page: 1, pageSize: 1000 });
});

test('処理中は二重実行を防ぐ', () => {
  const h = harness();
  h.transport.defer = true;
  h.context.asstOpenExternalAudit();
  h.context.asstLoadExternalAudit(false);
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
    validationErrors: ['fixture invalid'], candidates: [], pagination: { page: 1, pageSize: 1000, totalItems: 0, totalPages: 0 },
  }) });
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /監査結果: 監査失敗（FAIL）/);
  assert.doesNotMatch(h.html(), /id="asst_auditSummary"[^>]* open/);
  assert.match(h.html(), /<\/details><div class="message error"><strong>監査結果: 監査失敗（FAIL）/);
  assert.doesNotMatch(h.html(), /<h2>候補一覧<\/h2>/);
});

test('BLOCKEDでも候補を表示しID再利用は監査成功と明示する', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /監査成功（PASS）/);
  assert.match(h.html(), /停止（BLOCKED）/);
  assert.match(h.html(), /分類: カード対応候補 \/ 外部数値ID/);
  assert.doesNotMatch(h.html(), /分類: カード対応候補（card_match_candidate）/);
  assert.match(h.html(), /監査処理自体は成功しています/);
  assert.doesNotMatch(h.html(), /id="asst_auditSummary"[^>]* open/);
  assert.match(h.html(), /<\/details><p><strong>ID_REUSE_SUSPECTED:/);
  assert.match(h.html(), /<h2>候補一覧<\/h2>/);
});

test('通常の監査サマリーは閉じ、要約へ状態・安全性・総候補数を表示する', () => {
  const h = harness({ response: response({ safetyVerdict: 'SAFE', blockReasons: [] }) });
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /<details id="asst_auditSummary" class="asst-audit-summary"><summary>監査サマリー: 監査成功（PASS） \/ 安全性: 問題なし（SAFE） \/ 総候補数 1<\/summary>/);
});

test('監査サマリーの手動開閉を再描画後も保持し、BLOCKEDでも強制展開しない', () => {
  const h = harness({ response: response({ safetyVerdict: 'SAFE', blockReasons: [] }) });
  h.context.asstOpenExternalAudit();
  const summary = h.context.el('asst_auditSummary');
  summary.open = true; summary.ontoggle();
  h.context.asstRenderExternalAudit();
  assert.strictEqual(h.context.ASST.audit.foldOpen, true);
  assert.match(h.html(), /id="asst_auditSummary"[^>]* open/);
  h.context.ASST.audit.response.safetyVerdict = 'BLOCKED';
  summary.open = false; summary.ontoggle();
  assert.strictEqual(summary.open, false);
  assert.strictEqual(h.context.ASST.audit.foldOpen, false);
  h.context.asstRenderExternalAudit();
  assert.doesNotMatch(h.html(), /id="asst_auditSummary"[^>]* open/);
});

test('監査サマリーに全分類件数を表示する', () => {
  const h = harness(); h.context.asstOpenExternalAudit();
  for (const label of ['外部件数','ローカル件数','カード対応候補数','未紐付け候補数','ID再利用疑い数','既存内容差分数','表記違い数','重複内容一致数','外部欠落観測数','処置済み件数']) {
    assert(h.html().includes(label), label);
  }
  assert(!h.html().includes(ABILITIES_VERSION));
  assert(h.html().includes('EXISTING_CONTENT_DIFFERENCES'));
});

test('API候補順を変更しない', () => {
  const first = candidate('card_match_candidate', 1202, 'API先頭');
  const second = candidate('card_match_candidate', 1100, 'API後続');
  const h = harness({ response: response({ candidates: [first, second] }) });
  h.context.asstOpenExternalAudit();
  assert(h.html().indexOf('API先頭') < h.html().indexOf('API後続'));
});

function manyCandidates(total, classification = 'card_match_candidate', prefix = '能力') {
  const list = [];
  for (let index = 0; index < total; index += 1) list.push(candidate(classification, index + 1, `${prefix}${index + 1}`));
  return list;
}

test('選択タブ内だけを20件ずつページ送りする', () => {
  const candidates = manyCandidates(45).concat(manyCandidates(3, 'unlinked_candidate', '未紐付け'));
  const h = harness({ response: response({ candidates, pagination: { page: 1, pageSize: 1000, totalItems: 48, totalPages: 1 } }) });
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), />1 \/ 3 ページ ・ このタブ 45件 ・ 総候補数 48<\/span>/);
  assert.match(h.html(), /このタブ 45件 ・ このページ 20件/);
  assert.match(h.html(), /id="asst_auditFirst" disabled/);
  assert.doesNotMatch(h.html(), /id="asst_auditNext" disabled/);
  h.context.el('asst_auditLast').onclick();
  assert.strictEqual(h.context.ASST.audit.viewPage, 3);
  assert.match(h.html(), />3 \/ 3 ページ/);
  assert.match(h.html(), /このタブ 45件 ・ このページ 5件/);
  assert.match(h.html(), /id="asst_auditNext" disabled/);
  h.context.el('asst_auditPrev').onclick();
  assert.strictEqual(h.context.ASST.audit.viewPage, 2);
  h.context.el('asst_auditFirst').onclick();
  assert.strictEqual(h.context.ASST.audit.viewPage, 1);
});

test('タブを切り替えるとページ送りを1ページ目へ戻し他タブと共用しない', () => {
  const candidates = manyCandidates(45).concat(manyCandidates(3, 'unlinked_candidate', '未紐付け'));
  const h = harness({ response: response({ candidates, pagination: { page: 1, pageSize: 1000, totalItems: 48, totalPages: 1 } }) });
  h.context.asstOpenExternalAudit();
  h.context.el('asst_auditLast').onclick();
  assert.strictEqual(h.context.ASST.audit.viewPage, 3);
  h.context.el('asst_editor').querySelectorAll = () => [];
  h.context.ASST.audit.tab = 'unlinked_candidate';
  h.context.ASST.audit.viewPage = 1;
  h.context.asstRenderExternalAudit();
  assert.match(h.html(), />1 \/ 1 ページ ・ このタブ 3件/);
  assert.match(h.html(), /id="asst_auditNext" disabled/);
});

test('入力しただけでは絞り込まず、検索ボタンかEnterで確定する', () => {
  const candidates = [candidate('card_match_candidate', 1, '不屈の闘志'), candidate('card_match_candidate', 2, '鉄壁')];
  const h = harness({ response: response({ candidates, pagination: { page: 1, pageSize: 1000, totalItems: 2, totalPages: 1 } }) });
  h.context.asstOpenExternalAudit();
  const input = h.context.el('asst_auditSearch');
  input.value = 'fuku';
  input.oninput();
  assert.strictEqual(h.context.ASST.audit.queryInput, 'fuku');
  assert.strictEqual(h.context.ASST.audit.query, '');
  assert.match(h.html(), /このタブ 2件/);
  input.value = '不屈';
  input.oninput();
  assert.match(h.html(), /このタブ 2件/);
  h.context.el('asst_auditSearchRun').onclick();
  assert.strictEqual(h.context.ASST.audit.query, '不屈');
  assert.match(h.html(), /このタブ 1件/);
  const enterInput = h.context.el('asst_auditSearch');
  enterInput.value = '鉄壁';
  enterInput.onkeydown({ key: 'Enter', preventDefault() {} });
  assert.strictEqual(h.context.ASST.audit.query, '鉄壁');
  assert.match(h.html(), /鉄壁/);
});

test('IME変換中のEnterでは検索を確定しない', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  const input = h.context.el('asst_auditSearch');
  input.value = 'ふくつ';
  input.onkeydown({ key: 'Enter', isComposing: true, preventDefault() {} });
  input.onkeydown({ key: 'Enter', keyCode: 229, preventDefault() {} });
  assert.strictEqual(h.context.ASST.audit.query, '');
});

test('再描画しても入力中の検索語を保持する', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  h.context.el('asst_auditSearch').value = '入力中';
  h.context.el('asst_auditSearch').oninput();
  h.context.asstRenderExternalAudit();
  assert.match(h.html(), /id="asst_auditSearch" value="入力中"/);
  assert.doesNotMatch(h.html(), /id="asst_auditSearchClear" disabled/);
});

test('能力名・カード名で検索し件数とページ送りへ反映する', () => {
  const candidates = [
    candidate('card_match_candidate', 1, '不屈の闘志'),
    candidate('card_match_candidate', 2, '鉄壁'),
    candidate('card_match_candidate', 3, '無関係', { externalSnapshot: { card: '不屈カード', name: '無関係', desc: '説明', source: 'イベント', rarity: 'MR', tags: [] } }),
  ];
  const h = harness({ response: response({ candidates, pagination: { page: 1, pageSize: 1000, totalItems: 3, totalPages: 1 } }) });
  h.context.asstOpenExternalAudit();
  h.context.ASST.audit.query = '不屈';
  h.context.asstRenderExternalAudit();
  assert.match(h.html(), /このタブ 2件 ・ このページ 2件/);
  assert.match(h.html(), /カード対応候補 \(2\)/);
  assert.match(h.html(), /不屈の闘志/);
  assert.doesNotMatch(h.html(), /鉄壁/);
  h.context.ASST.audit.query = '該当なし';
  h.context.asstRenderExternalAudit();
  assert.match(h.html(), /検索条件に一致する候補はありません/);
});

test('検索はNFKC・大文字小文字・空白差を無視し外部数値IDとcardIdも対象にする', () => {
  const item = candidate('card_match_candidate', 1234, 'ＡＢＣ 能力', { cardIdCandidate: 'c0092-MR' });
  const h = harness({ response: response({ candidates: [item], pagination: { page: 1, pageSize: 1000, totalItems: 1, totalPages: 1 } }) });
  h.context.asstOpenExternalAudit();
  for (const query of ['abc能力', 'ABC 能力', '1234', 'c0092']) {
    h.context.ASST.audit.query = query;
    h.context.asstRenderExternalAudit();
    assert.match(h.html(), /このタブ 1件/, query);
  }
});

test('検索をクリアするボタンで全件表示へ戻す', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  h.context.el('asst_auditSearch').value = '該当なし';
  h.context.el('asst_auditSearch').oninput();
  h.context.el('asst_auditSearchRun').onclick();
  assert.strictEqual(h.context.ASST.audit.query, '該当なし');
  assert.match(h.html(), /検索条件に一致する候補はありません/);
  h.context.el('asst_auditSearchClear').onclick();
  assert.strictEqual(h.context.ASST.audit.query, '');
  assert.match(h.html(), /先頭候補/);
});

test('7分類を指定順の5タブへ対応しその他は後半3分類を合算する', () => {
  const candidates = [
    candidate('card_match_candidate', 1, 'card'), candidate('unlinked_candidate', 2, 'unlinked'),
    candidate('ID_REUSE_SUSPECTED', 3, 'reuse'), candidate('existingContentDifferences', 4, 'difference'),
    candidate('representationOnly', 5, 'other-a'), candidate('duplicate_local_content_match', 6, 'other-b'),
    candidate('missing_upstream_observation', 7, 'other-c', { externalSnapshot: null, localObservation: { name: '欠落', sourceName: 'ローカル' }, registrationEligible: false }),
  ];
  const h = harness({ response: response({ candidates }) });
  h.context.asstOpenExternalAudit();
  const labels = ['カード対応候補 (1)','未紐付け候補 (1)','ID再利用疑い (1)','既存内容差分 (1)','その他 (3)'];
  let previous = -1;
  for (const label of labels) { const index = h.html().indexOf(label); assert(index > previous, label); previous = index; }
  h.context.ASST.audit.tab = 'other'; h.context.asstRenderExternalAudit();
  assert.match(h.html(), /その他 <span class="muted">このタブ 3件 ・ このページ 3件/);
  for (const name of ['other-a','other-b','欠落']) assert.match(h.html(), new RegExp(name));
});

test('タブ件数は取り込み済み候補と絞り込み結果から数え0件はdisabledにする', () => {
  const candidates = manyCandidates(3).concat([candidate('representationOnly', 90, '表記')]);
  const h = harness({ response: response({ candidates, counts: counts({ idReuseSuspected: 0, cardMatchCandidates: 123 }), pagination: { page: 1, pageSize: 1000, totalItems: 4, totalPages: 1 } }) });
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /カード対応候補 \(3\)/);
  assert.doesNotMatch(h.html(), /カード対応候補 \(123\)/);
  assert.match(h.html(), /その他 \(1\)/);
  assert.match(h.html(), /data-audit-tab="ID_REUSE_SUSPECTED"[^>]* disabled/);
});

test('タブ絞り込み後も元配列indexを詳細へ渡す', () => {
  const candidates = [candidate('unlinked_candidate', 1, 'index-0'),candidate('card_match_candidate', 2, 'index-1'),candidate('card_match_candidate', 3, 'index-2')];
  const h = harness({ response: response({ candidates }) });
  h.context.asstOpenExternalAudit();
  assert.doesNotMatch(h.html(), /index-0/);
  assert.match(h.html(), /index-1[\s\S]*data-audit-detail="1"/);
  assert.match(h.html(), /index-2[\s\S]*data-audit-detail="2"/);
  h.context.asstOpenAuditDetail(1);
  assert.strictEqual(h.context.ASST.audit.detailIndex, 1);
  assert.match(h.html(), /カード2/);
});

test('再取り込みと再監査の後も選択タブと検索語を維持する', () => {
  const h = harness(); h.context.asstOpenExternalAudit();
  h.context.ASST.audit.tab = 'other'; h.context.ASST.audit.query = 'other'; h.context.asstRenderExternalAudit();
  h.transport.response = response({ candidates: [candidate('representationOnly', 4, 'other-reload')] });
  h.context.asstLoadExternalAudit(false);
  assert.strictEqual(h.context.ASST.audit.tab, 'other');
  assert.strictEqual(h.context.ASST.audit.query, 'other');
  assert.match(h.html(), /data-audit-tab="other" class="active"/);
  h.transport.response = response({ candidates: [candidate('representationOnly', 5, 'other-latest')] });
  h.context.asstLoadExternalAudit(true);
  assert.strictEqual(h.context.ASST.audit.tab, 'other');
  assert.match(h.html(), /other-latest/);
});

test('処置済み候補はチェック後だけ表示する', () => {
  const processed = candidate('card_match_candidate', 5, '処置済み候補', { processed: true, disposition: 'ignored', registrationEligible: false });
  const h = harness({ response: response({ candidates: [processed] }) });
  h.context.asstOpenExternalAudit();
  assert.doesNotMatch(h.html(), /処置済み候補/);
  h.context.ASST.audit.showProcessed = true;
  h.context.asstRenderExternalAudit();
  assert.match(h.html(), /処置済み候補/);
  assert.match(h.html(), /処置済み: 対象外（ignored）/);
});

test('nullを落として返す応答（undefined）でも構造不正にせず描画する', () => {
  const dropped = candidate('missing_upstream_observation', 1080, 'unused', {
    localObservation: { abilityId: 'ab-1080', name: 'ローカル能力', sourceName: '元カード', linkStatus: 'unlinked' },
    registrationEligible: false, auditOnly: true,
  });
  for (const field of ['candidateKey', 'externalFingerprint', 'comparisonFingerprint', 'externalSnapshot', 'sameIdComparison', 'cardIdCandidate', 'disposition']) delete dropped[field];
  delete dropped.requiresIdReuseConfirmation;
  const h = harness({ response: response({ candidates: [dropped], pagination: { page: 1, pageSize: 1000, totalItems: 1, totalPages: 1 } }) });
  h.context.ASST.audit.tab = 'other';
  h.context.asstOpenExternalAudit();
  assert.doesNotMatch(h.html(), /応答構造不正/);
  assert.match(h.html(), /ローカル能力/);
  const stored = h.context.ASST.audit.response.candidates[0];
  for (const field of ['candidateKey', 'externalFingerprint', 'externalSnapshot', 'sameIdComparison', 'cardIdCandidate', 'disposition']) assert.strictEqual(stored[field], null, field);
  assert.strictEqual(stored.requiresIdReuseConfirmation, false);
  h.context.asstOpenAuditDetail(0);
  assert.match(h.html(), /外部原文なし/);
  assert.match(h.html(), /読取専用/);
});

test('externalSnapshotが文字列などの想定外の型なら件目と外部数値IDを添えて拒否する', () => {
  const broken = candidate('card_match_candidate', 77, '壊れ', { externalSnapshot: 'not-an-object' });
  const h = harness({ response: response({ candidates: [broken], pagination: { page: 1, pageSize: 1000, totalItems: 1, totalPages: 1 } }) });
  h.context.asstOpenExternalAudit();
  assert.match(h.html(), /応答構造不正/);
  assert.match(h.html(), /externalSnapshotが不正です。（0件目 \/ 外部数値ID 77 \/ card_match_candidate）/);
});

test('externalSnapshot nullでも描画できる', () => {
  const missing = candidate('missing_upstream_observation', 1080, 'unused', {
    externalSnapshot: null, localObservation: { name: 'ローカル能力', sourceName: '元カード' }, cardIdCandidate: null, registrationEligible: false,
  });
  const h = harness({ response: response({ candidates: [missing] }) });
  h.context.ASST.audit.tab = 'other';
  assert.doesNotThrow(() => h.context.asstOpenExternalAudit());
  assert.match(h.html(), /ローカル能力/);
  assert.match(h.html(), /監査情報/);
});

test('現在のAPI応答内の候補だけをAPI再取得なしで詳細表示する', () => {
  const h = harness();
  h.context.asstOpenExternalAudit();
  h.context.asstOpenAuditDetail(0);
  assert.strictEqual(h.calls.length, 1);
  assert.match(h.html(), /外部能力候補の詳細/);
  for (const label of ['外部コミットSHA','外部数値ID','candidateKey','外部指紋（externalFingerprint）','元のカード名（sourceName）','description','完全一致した既存abilityId','NFKC一致した既存abilityId']) assert(h.html().includes(label), label);
});

test('読取専用分類・処置済み・auditOnlyは編集プレビューを出さない', () => {
  for (const item of [
    candidate('existingContentDifferences', 1, '差分', { registrationEligible: false, auditOnly: true }),
    candidate('representationOnly', 2, '表記', { registrationEligible: false, auditOnly: true }),
    candidate('duplicate_local_content_match', 3, '重複', { registrationEligible: false, auditOnly: true }),
    candidate('card_match_candidate', 4, '処置済み', { processed: true, registrationEligible: false }),
    candidate('card_match_candidate', 5, '監査のみ', { registrationEligible: true, auditOnly: true }),
  ]) {
    const h = harness({ response: response({ candidates: [item] }) });h.context.asstOpenExternalAudit();h.context.asstOpenAuditDetail(0);
    assert.match(h.html(), /読取専用/);assert.doesNotMatch(h.html(), /id="asst_btnAuditFinalPreview"/);
  }
});

test('外部欠落観測はcandidateKey null・外部原文なしで読取専用詳細を表示する', () => {
  const missing = candidate('missing_upstream_observation', 1080, 'unused', { candidateKey: null, externalFingerprint: null, externalSnapshot: null, localObservation: { abilityId: 'ab-1080', name: 'ローカル能力', sourceName: '元カード' }, cardIdCandidate: null, registrationEligible: false, auditOnly: true });
  const h = harness({ response: response({ candidates: [missing] }) });h.context.asstOpenExternalAudit();h.context.asstOpenAuditDetail(0);
  assert.match(h.html(), /外部原文なし/);assert.match(h.html(), /読取専用/);
});

test('ID再利用疑いは強い警告と専用確認を表示する', () => {
  const reused = candidate('ID_REUSE_SUSPECTED', 1084, '再利用', { registrationEligible: true, requiresIdReuseConfirmation: true, cardIdCandidate: null });
  const h = harness({ response: response({ candidates: [reused] }) });h.context.asstOpenExternalAudit();h.context.asstOpenAuditDetail(0);
  assert.match(h.html(), /同一外部IDが別能力になった疑い/);assert.match(h.html(), /id="asst_audit_idReuseReviewed"/);assert.match(h.html(), /value="resolved" disabled>紐付け済み（resolved）/);
});

test('登録予定値は原文を保ちlinkStatusだけ未選択で開始する', () => {
  const h = harness();h.context.asstOpenExternalAudit();h.context.asstOpenAuditDetail(0);const d=h.context.ASST.audit.detailDraft;
  assert.strictEqual(d.sourceName, 'カード1200');assert.strictEqual(d.name, '先頭候補');assert.strictEqual(d.linkStatus, '');assert.match(h.html(), /比較用NFKCは表示だけ/);assert.match(h.html(), /保存時にサーバー採番/);assert.match(h.html(), /legacyId/);assert.match(h.html(), /下書き（draft）/);
});

test('プレビュー検査が必須値・許可値・タグ・危険文字列・確認漏れを拒否する', () => {
  const h = harness();h.context.asstOpenExternalAudit();const item=h.context.ASST.audit.response.candidates[0];const bad={sourceName:'   ',name:'x\t',description:'<b>x</b></ScRiPt>',source:'未知',rarity:'UR',tags:[' ','重複','重複',7],linkStatus:'',confirmations:{originalCompared:false,normalizationReviewed:false,cardReviewed:false,idReuseReviewed:false,draftReviewed:false}};
  const issues=h.context.asstAuditDraftIssues(item,bad).join(' / ');
  for (const token of ['sourceNameは必須','制御文字','許可値','空タグ','重複タグ','文字列以外','</script','<br>以外','linkStatus','外部原文','NFKC','カード対応','draft']) assert(issues.includes(token), token);
});

test('resolvedはカード選択とカード確認を必須にする', () => {
  const h = harness();h.context.asstOpenExternalAudit();h.context.ASST.cards=[{cardId:'card-1200',name:'ジュリア',rarity:'MR'}];
  const item=h.context.ASST.audit.response.candidates[0];
  const d={sourceName:'カード',name:'能力',description:'説明<br>続き',source:'伝授',rarity:'その他',tags:[],linkStatus:'resolved',cardId:'card-1200',confirmations:{originalCompared:true,normalizationReviewed:true,cardReviewed:false,idReuseReviewed:false,draftReviewed:true}};
  assert(h.context.asstAuditDraftIssues(item,d).some(value => /カード確認/.test(value)));
  d.confirmations.cardReviewed=true;
  assert.strictEqual(h.context.asstAuditDraftIssues(item,d).length,0);
  d.cardId='';
  assert(h.context.asstAuditDraftIssues(item,d).some(value => /紐付けるカードを選択/.test(value)));
  d.cardId='card-unknown';
  assert(h.context.asstAuditDraftIssues(item,d).some(value => /カードDBにありません/.test(value)));
});

test('自動候補がなくても手動でカードを選びresolvedで登録できる', () => {
  const unlinked = candidate('unlinked_candidate', 1300, 'ジュリア（ライバル）の能力', { cardIdCandidate: null });
  const h = harness({ response: response({ candidates: [unlinked], pagination: { page: 1, pageSize: 1000, totalItems: 1, totalPages: 1 } }) });
  h.context.ASST.cards=[{cardId:'aab-MR-julia',name:'ジュリア',rarity:'MR'},{cardId:'aaa-MR-aileblanche',name:'エルブランシュ',rarity:'MR'}];
  h.context.ASST.audit.tab='unlinked_candidate';
  h.context.asstOpenExternalAudit();
  h.context.asstOpenAuditDetail(0);
  assert.match(h.html(), /id="asst_audit_cardId"/);
  assert.match(h.html(), /<option value="aab-MR-julia">ジュリア（MR） \/ aab-MR-julia<\/option>/);
  assert.doesNotMatch(h.html(), /value="resolved"[^>]* disabled/);
  assert.match(h.html(), /—（自動一致なし）/);
  for (const [id, value] of [['sourceName','ジュリア'],['name','能力'],['description','説明'],['source','イベント'],['rarity','MR'],['tags',''],['linkStatus','resolved'],['cardId','aab-MR-julia']]) h.context.el('asst_audit_'+id).value=value;
  for (const id of ['originalCompared','normalizationReviewed','cardReviewed','draftReviewed']) h.context.el('asst_audit_'+id).checked=true;
  h.context.asstConfirmAuditPreview();
  const preview=h.context.ASST.audit.finalPreview;
  assert.strictEqual(preview.registration.linkStatus,'resolved');
  assert.strictEqual(preview.registration.cardId,'aab-MR-julia');
  assert.match(h.html(), /手動で選択/);
  assert.match(h.html(), /ジュリア（MR） \/ aab-MR-julia/);
  h.context.asstQueueAuditAbility();
  assert.strictEqual(h.calls.length,1);
  assert.strictEqual(h.context.ASST.audit.pending.length,1);
  h.context.asstRunPendingAuditSaves();
  assert.strictEqual(h.calls[1].name,'api_asstCreateAbilityFromExternalCandidate');
  assert.strictEqual(h.calls[1].payload.registration.cardId,'aab-MR-julia');
});

test('unlinkedを選んだときはcardIdをnullで送る', () => {
  const h = harness();h.context.asstOpenExternalAudit();h.context.ASST.cards=[{cardId:'card-1200',name:'ジュリア',rarity:'MR'}];
  const item=h.context.ASST.audit.response.candidates[0];
  const preview=h.context.asstBuildAuditPreview(item,{sourceName:'カード',name:'能力',description:'説明',source:'イベント',rarity:'MR',tags:[],linkStatus:'unlinked',cardId:'card-1200',confirmations:{originalCompared:true,normalizationReviewed:true,cardReviewed:true,idReuseReviewed:false}});
  assert.strictEqual(preview.registration.cardId,null);
});

test('最終プレビュー契約は許可キーだけを組み立てる', () => {
  const h = harness();h.context.asstOpenExternalAudit();const item=h.context.ASST.audit.response.candidates[0];const d={sourceName:'カード',name:'能力',description:'説明\r\n続き',source:'イベント',rarity:'MR',tags:['タグ'],linkStatus:'unlinked',confirmations:{originalCompared:true,normalizationReviewed:true,cardReviewed:true,idReuseReviewed:false,draftReviewed:true}};
  const preview=h.context.asstBuildAuditPreview(item,d);assert.deepStrictEqual(Object.keys(preview.registration),['sourceName','name','description','source','rarity','tags','linkStatus','cardId']);assert.strictEqual(preview.registration.description,'説明\n続き');assert.strictEqual(preview.registration.cardId,null);assert.deepStrictEqual(Object.keys(preview.confirmations),['originalCompared','normalizationReviewed','cardReviewed','idReuseReviewed']);assert.strictEqual(h.calls.length,1);
  const rendered=h.context.asstRenderAuditFinalPreview(preview);assert.match(rendered,/まだ保存されていません/);assert.match(rendered,/保存予定に追加/);assert.doesNotMatch(rendered,/<textarea|登録成功|公開ボタン/);
  assert.match(UI_SOURCE,/function asstBindAuditDetail\(\)[\s\S]*ASST\.audit\.finalPreview=null/);
});

test('同じページ・同じタブへ戻ると編集・サマリー・処置済み表示を保持しページ移動で編集だけ破棄する', () => {
  const h = harness();h.context.asstOpenExternalAudit();h.context.ASST.audit.showProcessed=true;h.context.ASST.audit.foldOpen=true;h.context.ASST.audit.tab='card_match_candidate';h.context.asstOpenAuditDetail(0);
  for (const [id, value] of [['sourceName','カード1200'],['name','手修正'],['description','説明'],['source','イベント'],['rarity','MR'],['tags','タグ'],['linkStatus','unlinked']]) h.context.el('asst_audit_'+id).value=value;
  h.context.asstReturnFromAuditDetail();
  assert.strictEqual(h.context.ASST.audit.response.pagination.page,1);assert.strictEqual(h.context.ASST.audit.tab,'card_match_candidate');
  h.context.asstOpenAuditDetail(0);
  assert.strictEqual(h.context.ASST.audit.detailDraft.name,'手修正');assert.strictEqual(h.context.ASST.audit.showProcessed,true);assert.strictEqual(h.context.ASST.audit.foldOpen,true);
  h.context.asstLoadExternalAudit(false);assert.strictEqual(h.context.ASST.audit.detailIndex,null);assert.strictEqual(h.context.ASST.audit.detailDraft,null);assert.strictEqual(h.context.ASST.audit.externalSha,FIXED_SHA);assert.strictEqual(h.context.ASST.audit.tab,'card_match_candidate');
});

test('詳細上部のmobile-backを削除し下部で戻るを処置保存の左へ置く', () => {
  const h = harness(); h.context.asstOpenExternalAudit(); h.context.asstOpenAuditDetail(0);
  assert.doesNotMatch(h.html(), /mobile-back[^>]*asst_btnBackAuditDetail/);
  assert.match(h.html(), /id="asst_btnBackAuditDetail"[^>]*>← 戻る<\/button>[\s\S]*id="asst_btnAuditDisposition"[^>]*>処置を保存/);
  h.context.asstReturnFromAuditDetail();
  assert.strictEqual(h.calls.length, 1);
  assert.strictEqual(h.context.ASST.audit.detailIndex, null);
});

test('監査ページと詳細のスマホgrid・長文字列・操作行を内容側で折り返す', () => {
  assert.match(UI_SOURCE, /@media\(max-width:860px\)[^{]*\{#asst_editor \.asst-audit-page \.grid,#asst_editor \.asst-audit-detail \.grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(UI_SOURCE, /\.asst-audit-summary \.readonly,#asst_editor \.asst-audit-detail \.readonly\{overflow-wrap:anywhere;max-height:8em;overflow:auto\}/);
  assert.match(UI_SOURCE, /\.asst-audit-long\{word-break:break-all\}/);
  assert.match(UI_SOURCE, /\.asst-audit-pagination[^}]*flex-wrap:wrap/);
  assert.match(UI_SOURCE, /\.asst-audit-toolbar\{display:flex;flex-wrap:wrap;align-items:flex-end/);
  assert.match(UI_SOURCE, /\.asst-audit-toolbar \.asstField\{margin:0/);
  assert.doesNotMatch(UI_SOURCE, /overflow-x\s*:\s*hidden/);
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
  h.context.asstOpenAuditDetail(0);
  assert.doesNotMatch(h.html(), /<script>|<img/);
  assert.match(h.html(), /&lt;script&gt;/);
});

test('GASテンプレートを途中終了させるscript終了タグを文字列内に置かない', () => {
  assert.strictEqual((UI_SOURCE.match(/<\/script/gi) || []).length, 1);
});

function queueCreate(h, index = 0) {
  const item = h.context.ASST.audit.response.candidates[index];
  h.context.ASST.audit.detailIndex = index;
  h.context.ASST.audit.finalPreview = h.context.asstBuildAuditPreview(item, { sourceName:'カード', name:'能力'+item.externalNumericId, description:'説明', source:'イベント', rarity:'MR', tags:[], linkStatus:'unlinked', cardId:'', confirmations:{originalCompared:true,normalizationReviewed:true,cardReviewed:true,idReuseReviewed:false} });
  h.context.asstQueueAuditAbility();
}

test('保存予定へ追加した時点ではAPIを呼ばない', () => {
  const h = harness();h.context.asstOpenExternalAudit();
  queueCreate(h);
  assert.strictEqual(h.calls.length,1);
  assert.strictEqual(h.context.ASST.audit.pending.length,1);
  assert.strictEqual(h.context.ASST.audit.detailIndex,null);
  assert.match(h.html(),/保存予定 1件/);
  assert.match(h.html(),/まとめて保存（1件）/);
});

test('まとめて保存で追加専用APIを呼び同じ固定SHAで再監査する', () => {
  const h = harness();h.context.asstOpenExternalAudit();
  queueCreate(h);
  h.context.asstRunPendingAuditSaves();
  assert.strictEqual(h.calls[1].name,'api_asstCreateAbilityFromExternalCandidate');
  assert.deepStrictEqual(Object.keys(h.calls[1].payload),['auditVersion','provider','externalSha','candidateKey','externalNumericId','externalFingerprint','expectedAbilitiesVersion','registration','confirmations']);
  assert.deepStrictEqual(h.calls[2],{name:'api_asstAuditExternalAbilities',payload:{page:1,pageSize:1000,externalSha:FIXED_SHA}});
  assert.match(h.html(),/abilityId: ab-1085/);assert.match(h.html(),/自動公開されていません/);
  assert.strictEqual(h.context.ASST.audit.pending.length,0);
});

test('処置だけの保存予定は再監査を最後の1回にまとめる', () => {
  const candidates=[candidate('representationOnly',2,'表記A',{registrationEligible:false,auditOnly:true,candidateKey:'a'.repeat(64)}),candidate('representationOnly',3,'表記B',{registrationEligible:false,auditOnly:true,candidateKey:'b'.repeat(64)})];
  const h=harness({response:response({candidates,pagination:{page:1,pageSize:1000,totalItems:2,totalPages:1}})});
  h.context.ASST.audit.tab='other';h.context.asstOpenExternalAudit();
  for (const index of [0,1]) {
    h.context.asstOpenAuditDetail(index);
    h.context.el('asst_auditDisposition').value='ignored';
    h.context.el('asst_auditDispositionNote').value='確認済み';
    h.context.asstQueueAuditDisposition();
  }
  assert.strictEqual(h.context.ASST.audit.pending.length,2);
  assert.strictEqual(h.calls.length,1);
  h.context.asstRunPendingAuditSaves();
  const names=h.calls.map(call => call.name);
  assert.deepStrictEqual(names,['api_asstAuditExternalAbilities','api_asstSetExternalCandidateDisposition','api_asstSetExternalCandidateDisposition','api_asstAuditExternalAbilities']);
  assert.match(h.html(),/成功 2件 \/ 失敗 0件/);
});

test('失敗した保存予定は残し、成功分だけ取り除く', () => {
  const h = harness();h.context.asstOpenExternalAudit();
  queueCreate(h);
  h.transport.writeError='能力DBが更新されています。再監査してください。';
  h.context.asstRunPendingAuditSaves();
  assert.strictEqual(h.context.ASST.audit.pending.length,1);
  assert.match(h.html(),/成功 0件 \/ 失敗 1件/);
  assert.match(h.html(),/能力DBが更新されています/);
  assert.match(h.html(),/失敗した分は保存予定に残しています/);
});

test('保存結果は成功だけなら時間経過で消え、失敗があれば残る', () => {
  const h = harness();h.context.asstOpenExternalAudit();
  queueCreate(h);
  h.context.asstRunPendingAuditSaves();
  assert.match(h.html(),/まとめて保存: 成功 1件/);
  assert.strictEqual(h.runTimers(),1);
  assert.doesNotMatch(h.html(),/まとめて保存: 成功/);
  const failed = harness();failed.context.asstOpenExternalAudit();
  queueCreate(failed);
  failed.transport.writeError='失敗';
  failed.context.asstRunPendingAuditSaves();
  assert.strictEqual(failed.runTimers(),0);
  assert.match(failed.html(),/成功 0件 \/ 失敗 1件/);
  failed.context.el('asst_btnDismissAuditMessage').onclick();
  assert.doesNotMatch(failed.html(),/まとめて保存: 成功/);
});

test('保存予定は取り消しと一括破棄ができる', () => {
  const h = harness();h.context.asstOpenExternalAudit();
  queueCreate(h);
  const id=h.context.ASST.audit.pending[0].id;
  h.context.asstAuditRemovePending(id);
  assert.strictEqual(h.context.ASST.audit.pending.length,0);
  assert.match(h.html(),/保存予定 0件/);
  queueCreate(h);
  h.context.el('asst_btnClearPending').onclick();
  assert.strictEqual(h.context.ASST.audit.pending.length,0);
});

test('読取専用候補は処置APIだけを呼びabilities非変更を明示する', () => {
  const item=candidate('representationOnly',2,'表記',{registrationEligible:false,auditOnly:true,cardIdCandidate:null});
  const h=harness({response:response({candidates:[item]})});h.context.asstOpenExternalAudit();h.context.asstOpenAuditDetail(0);
  assert.match(h.html(),/候補の処置/);assert.doesNotMatch(h.html(),/id="asst_btnAuditFinalPreview"/);
  h.context.el('asst_auditDisposition').value='ignored';h.context.el('asst_auditDispositionNote').value='確認済み';h.context.asstQueueAuditDisposition();
  assert.strictEqual(h.calls.length,1);
  h.context.asstRunPendingAuditSaves();
  assert.strictEqual(h.calls[1].name,'api_asstSetExternalCandidateDisposition');assert.strictEqual(h.calls[1].payload.disposition,'ignored');
  assert.strictEqual(h.calls[2].payload.externalSha,FIXED_SHA);assert.match(h.html(),/abilitiesは変更していません/);
});

test('監査画面に削除・公開・既存能力更新操作を置かない', () => {
  const h = harness();h.context.asstOpenExternalAudit();h.context.asstOpenAuditDetail(0);
  assert.doesNotMatch(h.html(), /削除|公開ボタン|api_asstSaveAbility/);
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
