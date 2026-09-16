/** アシスト能力の状態（draft / verified）まとめ更新API。能力の他項目・並び・公開は扱わない。 */
// 能力の状態（draft / verified）だけをまとめて更新する。1件ずつ api_asstGetAbility + api_asstSaveAbility を
// 繰り返すと1件あたり数秒×2往復かかるため、ロック1回・読取1回で全件を検査してから書く。
// 1件でもversion不一致・許可外の値があれば何も書かない（全件そのまま）。
var ASST_STATUS_BATCH_KEYS = ['items'];
var ASST_STATUS_BATCH_ITEM_KEYS = ['abilityId','version','status'];
var ASST_STATUS_BATCH_MAX_ITEMS = 100;

function asstAbilityStatusBatchPayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payloadはオブジェクトです。');
  Object.keys(payload).forEach(function (key) { if (ASST_STATUS_BATCH_KEYS.indexOf(key) < 0) throw new Error('未対応のpayload項目です: ' + key); });
  if (!Array.isArray(payload.items) || !payload.items.length) throw new Error('itemsは1件以上の配列です。');
  if (payload.items.length > ASST_STATUS_BATCH_MAX_ITEMS) throw new Error('itemsは' + ASST_STATUS_BATCH_MAX_ITEMS + '件までです。');
  var seen = {};
  return payload.items.map(function (item, index) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('items[' + index + ']が不正です。');
    Object.keys(item).forEach(function (key) { if (ASST_STATUS_BATCH_ITEM_KEYS.indexOf(key) < 0) throw new Error('items[' + index + ']に未対応の項目です: ' + key); });
    var abilityId = asstText_(item.abilityId);
    if (!abilityId) throw new Error('items[' + index + '].abilityIdは必須です。');
    if (seen[abilityId]) throw new Error('itemsにabilityIdが重複しています: ' + abilityId);
    seen[abilityId] = true;
    if (typeof item.version !== 'number' || !Number.isInteger(item.version) || item.version < 1) throw new Error(abilityId + ': versionが不正です。');
    asstInList_(item.status, ASST_ABILITY_STATUSES, abilityId + '/status', false);
    return { abilityId: abilityId, version: item.version, status: item.status };
  });
}

function api_asstSetAbilityStatuses(payload) {
  var user = asstRequireUser_();
  var items = asstAbilityStatusBatchPayload_(payload);
  var lock = asstAcquireScriptLock_();
  try {
    var rows = asstRows_(ASST_SHEET_ABILITIES);
    var byId = {};
    rows.forEach(function (row) { byId[asstText_(row.abilityId)] = row; });
    var headers = ASST_HEADERS[ASST_SHEET_ABILITIES];
    var updatedAt = nowIso_();
    var plans = [];
    items.forEach(function (item) {
      var row = byId[item.abilityId];
      if (!row) throw new Error(item.abilityId + ': 能力が見つかりません。');
      var currentVersion = Number(row.version || 1);
      if (item.version !== currentVersion) throw new Error(item.abilityId + ': 他の編集が保存済みです。カードを開き直してください。');
      if (asstText_(row.status) === item.status) return;
      var values = headers.map(function (header) { return row[header]; });
      values[headers.indexOf('status')] = item.status;
      values[headers.indexOf('version')] = currentVersion + 1;
      values[headers.indexOf('updatedAt')] = updatedAt;
      values[headers.indexOf('updatedBy')] = user.nickname;
      plans.push({ abilityId: item.abilityId, rowNumber: row._row, values: values, version: currentVersion + 1, status: item.status });
    });
    var sheet = asstSheet_(ASST_SHEET_ABILITIES);
    plans.forEach(function (plan) { sheet.getRange(plan.rowNumber, 1, 1, plan.values.length).setValues([plan.values]); });
    if (plans.length) {
      asstAppendLog_(user, 'set-ability-statuses', 'PASS', plans.map(function (plan) { return plan.abilityId + '=' + plan.status + ' v' + plan.version; }).join(' '));
    }
    return {
      ok: true, updated: plans.map(function (plan) { return { abilityId: plan.abilityId, version: plan.version, status: plan.status }; }),
      skipped: items.length - plans.length
    };
  } finally {
    asstReleaseScriptLock_(lock);
  }
}

// 能力1件のカード紐付け解除API。誤ったカードへ紐づけた能力（例: 同名のMR/SSR取り違え）を
// resolved → unlinked に戻し、同じカードに残る能力のsortOrderを1からの連番へ繰り上げる。
// 内容・status・legacyIdは変えない。並び替えAPIと同じく、途中で書込みに失敗したら書いた行を元に戻す。
var ASST_UNLINK_KEYS = ['abilityId','version'];

function asstUnlinkAbilityPayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payloadはオブジェクトです。');
  Object.keys(payload).forEach(function (key) { if (ASST_UNLINK_KEYS.indexOf(key) < 0) throw new Error('未対応のpayload項目です: ' + key); });
  var abilityId = asstText_(payload.abilityId);
  if (!abilityId) throw new Error('abilityIdは必須です。');
  if (typeof payload.version !== 'number' || !Number.isInteger(payload.version) || payload.version < 1) throw new Error(abilityId + ': versionが不正です。');
  return { abilityId: abilityId, version: payload.version };
}

function api_asstUnlinkAbility(payload) {
  var user = asstRequireUser_();
  var input = asstUnlinkAbilityPayload_(payload);
  var lock = asstAcquireScriptLock_();
  try {
    var headers = ASST_HEADERS[ASST_SHEET_ABILITIES];
    var rows = asstRows_(ASST_SHEET_ABILITIES);
    var target = rows.filter(function (row) { return asstText_(row.abilityId) === input.abilityId; })[0];
    if (!target) throw new Error(input.abilityId + ': 能力が見つかりません。');
    if (input.version !== Number(target.version || 1)) throw new Error(input.abilityId + ': 他の編集が保存済みです。カードを開き直してください。');
    if (asstText_(target.linkStatus) !== 'resolved') throw new Error(input.abilityId + ': 紐付け済み（resolved）の能力だけ解除できます。');
    var cardId = asstText_(target.cardId);
    var siblings = rows.filter(function (row) {
      return asstText_(row.abilityId) !== input.abilityId && asstText_(row.linkStatus) === 'resolved' && asstText_(row.cardId) === cardId;
    }).sort(function (a, b) { return Number(a.sortOrder) - Number(b.sortOrder); });
    var updatedAt = nowIso_();
    var writes = [];
    function plan(row, changes) {
      var before = headers.map(function (header) { return row[header]; });
      var after = before.slice();
      Object.keys(changes).forEach(function (key) { after[headers.indexOf(key)] = changes[key]; });
      after[headers.indexOf('version')] = Number(row.version || 1) + 1;
      after[headers.indexOf('updatedAt')] = updatedAt;
      after[headers.indexOf('updatedBy')] = user.nickname;
      writes.push({ rowNumber: row._row, abilityId: asstText_(row.abilityId), before: before, after: after });
    }
    plan(target, { cardId: '', sortOrder: '', linkStatus: 'unlinked' });
    siblings.forEach(function (row, index) {
      if (Number(row.sortOrder) !== index + 1) plan(row, { sortOrder: index + 1 });
    });
    var sheet = asstSheet_(ASST_SHEET_ABILITIES);
    var applied = [];
    try {
      writes.forEach(function (write) {
        sheet.getRange(write.rowNumber, 1, 1, headers.length).setValues([write.after]);
        applied.push(write);
      });
    } catch (error) {
      for (var index = applied.length - 1; index >= 0; index--) {
        try { sheet.getRange(applied[index].rowNumber, 1, 1, headers.length).setValues([applied[index].before]); }
        catch (restoreError) {
          asstAppendLog_(user, 'unlink-ability', 'FAIL', input.abilityId + ' 復旧失敗 ' + restoreError.message);
          throw new Error('紐付け解除の書込みに失敗し、復旧にも失敗しました。手動確認が必要です: ' + restoreError.message);
        }
      }
      asstAppendLog_(user, 'unlink-ability', 'FAIL', input.abilityId + ' ' + error.message);
      throw new Error('紐付け解除の保存に失敗したため元に戻しました: ' + error.message);
    }
    var renumbered = writes.length - 1;
    asstAppendLog_(user, 'unlink-ability', 'PASS', input.abilityId + ' ' + cardId + ' から解除 繰上げ' + renumbered + '件');
    return { ok: true, abilityId: input.abilityId, cardId: cardId, version: input.version + 1, renumbered: renumbered };
  } finally {
    asstReleaseScriptLock_(lock);
  }
}
