/** アシスト能力のスクショ取り込み（Claude読取JSON → 判定 → 新規追加・既存の未紐付け能力の紐付け）。 */
// 設計は docs/ability-capture-design.md。スクショを正とし、lMfDBを経由しない能力登録の入口。
// 判定はリポジトリの scripts/check-assist-ability-payload.js（classifyAbility）と同じ規則で、
// scripts/test-assist-ability-payload.js が既存DB全件で両者の一致を検査する。
// 書くのは「新規能力の追加（status: draft）」と「未紐付け能力のresolved化」だけ。
// 既存能力の本文・状態の変更、削除、公開は行わない（本文の修正は既存の能力編集で行う）。
var ASST_CAPTURE_KEYS = ['schemaVersion','source','cardId','sourceScreenshots','abilities'];
var ASST_CAPTURE_ITEM_KEYS = ['action','name','description','source','tags'];
var ASST_CAPTURE_ACTIONS = ['known','known_diff','link','create'];
var ASST_CAPTURE_MAX_ITEMS = 30;

// 照合キー。src/lib/ability-name-key.js と同じ式（NFKC＋空白除去、本文は<br>も除く、sourceNameは末尾の括弧補足を除く）
function asstCaptureNameKey_(value) {
  return String(value === null || value === undefined ? '' : value).normalize('NFKC').replace(/\s+/g, '');
}
function asstCaptureDescriptionKey_(value) {
  return asstCaptureNameKey_(String(value === null || value === undefined ? '' : value).replace(/<br>/gi, ''));
}
function asstCaptureSourceNameKey_(value) {
  var key = asstCaptureNameKey_(value);
  while (/\([^()]*\)$/.test(key)) key = key.replace(/\([^()]*\)$/, '');
  return key;
}

// 1件の判定。abilities は asstAbilityFromRow_ の形。check-assist-ability-payload.js の classifyAbility と同じ規則。
function asstCaptureClassify_(item, card, abilities) {
  var nameKey = asstCaptureNameKey_(item.name);
  var descriptionKey = asstCaptureDescriptionKey_(item.description);
  var resolved = abilities.filter(function (ability) {
    return ability.linkStatus === 'resolved' && ability.cardId === card.cardId && asstCaptureNameKey_(ability.name) === nameKey;
  });
  if (resolved.length) {
    var same = resolved.filter(function (ability) { return asstCaptureDescriptionKey_(ability.description) === descriptionKey; })[0];
    return same ? { action: 'known', abilityId: same.abilityId, existing: same, candidates: [] }
      : { action: 'known_diff', abilityId: resolved[0].abilityId, existing: resolved[0], candidates: [] };
  }
  var sameName = abilities.filter(function (ability) { return ability.linkStatus !== 'resolved' && asstCaptureNameKey_(ability.name) === nameKey; });
  var cardKey = asstCaptureSourceNameKey_(card.name);
  var candidates = sameName.filter(function (ability) {
    return asstCaptureSourceNameKey_(ability.sourceName) === cardKey && (!ability.rarity || ability.rarity === card.rarity);
  });
  var candidateIds = candidates.map(function (ability) { return ability.abilityId; });
  if (item.linkTo) {
    var chosen = sameName.filter(function (ability) { return ability.abilityId === item.linkTo; })[0];
    return chosen ? { action: 'link', abilityId: chosen.abilityId, existing: chosen, candidates: candidateIds, chosenBy: 'linkTo' }
      : { action: 'invalid_link', abilityId: item.linkTo, existing: null, candidates: sameName.map(function (ability) { return ability.abilityId; }) };
  }
  if (candidates.length === 1) return { action: 'link', abilityId: candidates[0].abilityId, existing: candidates[0], candidates: candidateIds };
  if (candidates.length > 1) return { action: 'link_ambiguous', abilityId: null, existing: null, candidates: candidateIds };
  return { action: 'create', abilityId: null, existing: null, candidates: [], otherSameName: sameName.map(function (ability) { return ability.abilityId; }) };
}

// lMfDB監査（20_assist.gs asstAuditAnalyze_）用。外部候補と同じカード・同じ能力名のローカル能力を返す。
// カードは対応表のcardId（resolved）か、能力のsourceName（末尾の括弧補足を除く）で見る。
// 当たった外部候補は新規候補にせず local_card_name_match（登録ボタンなし）にする。
// scripts/sync-lmfdb-abilities.js の localCardNameMatches と同じ規則。
function asstCaptureAuditNameMatches_(external, cardIdCandidate, localAbilities) {
  var nameKey = asstCaptureNameKey_(external.name);
  var cardKey = asstCaptureSourceNameKey_(external.card);
  return localAbilities.filter(function (ability) {
    return asstCaptureNameKey_(ability.name) === nameKey &&
      ((cardIdCandidate && ability.linkStatus === 'resolved' && ability.cardId === cardIdCandidate) ||
        asstCaptureSourceNameKey_(ability.sourceName) === cardKey);
  });
}

// 貼り付けJSON（check-assist-ability-payload.js --emit の出力）の入力検査。書込み前に全件を検査する。
function asstCapturePayload_(payload) {
  asstLmfdbAssertObjectKeys_(payload, ['cardId','abilities'], 'payload', ['schemaVersion','source','sourceScreenshots']);
  if (payload.schemaVersion !== undefined && payload.schemaVersion !== 1) throw new Error('schemaVersionは1です。');
  var cardId = asstText_(payload.cardId);
  if (!cardId) throw new Error('cardIdは必須です。');
  var screenshots = payload.sourceScreenshots === undefined ? [] : payload.sourceScreenshots;
  if (!Array.isArray(screenshots) || screenshots.length > 50) throw new Error('sourceScreenshotsは50件までの配列です。');
  screenshots = screenshots.map(function (name, index) { return asstLmfdbValidateText_(name, 'sourceScreenshots[' + index + ']', 200, false); });
  if (!Array.isArray(payload.abilities) || !payload.abilities.length) throw new Error('abilitiesは1件以上の配列です。');
  if (payload.abilities.length > ASST_CAPTURE_MAX_ITEMS) throw new Error('abilitiesは' + ASST_CAPTURE_MAX_ITEMS + '件までです。');
  var seenNames = {};
  var items = payload.abilities.map(function (item, index) {
    var label = 'abilities[' + index + ']';
    asstLmfdbAssertObjectKeys_(item, ['action','name','description','source'], label, ['tags','abilityId']);
    if (ASST_CAPTURE_ACTIONS.indexOf(item.action) < 0) throw new Error(label + '.actionはknown / known_diff / link / createです。検査を通したJSONを貼ってください。');
    var normalized = {
      index: index,
      action: item.action,
      name: asstLmfdbValidateText_(item.name, label + '.name', 200, false),
      description: asstLmfdbValidateText_(item.description, label + '.description', 5000, true),
      source: item.source,
      tags: asstLmfdbValidateTags_(item.tags === undefined ? [] : item.tags, label + '.tags'),
      abilityId: item.abilityId === undefined ? null : asstText_(item.abilityId)
    };
    if (/\n/.test(normalized.description)) throw new Error(label + '.descriptionの改行は<br>で書いてください。');
    asstInList_(normalized.source, ASST_ABILITY_SOURCES, label + '.source', false);
    if (normalized.action === 'link' && !/^ab-[0-9]{4,}$/.test(normalized.abilityId || '')) throw new Error(label + ': linkにはabilityIdが必要です。');
    if (normalized.action === 'create' && normalized.abilityId) throw new Error(label + ': createにabilityIdは指定できません（サーバー採番）。');
    var key = asstCaptureNameKey_(normalized.name);
    if (seenNames[key]) throw new Error(label + ': 同じ名前が2回あります。');
    seenNames[key] = true;
    return normalized;
  });
  return { cardId: cardId, sourceScreenshots: screenshots, items: items };
}

function asstCaptureCard_(cardRows, cardId) {
  var row = cardRows.filter(function (item) { return asstText_(item.cardId) === cardId; })[0];
  if (!row) throw new Error('カードが見つかりません: ' + cardId);
  return { cardId: cardId, name: asstText_(row.name), rarity: asstText_(row.rarity) };
}

// サーバー側の判定。貼り付けたaction（とlinkのabilityId）が、今のシートで再計算した判定と一致するかを返す。
function asstCaptureEvaluate_(input, cardRows, abilityRows) {
  var card = asstCaptureCard_(cardRows, input.cardId);
  var abilities = abilityRows.map(asstAbilityFromRow_);
  var linked = {};
  var results = input.items.map(function (item) {
    var result = asstCaptureClassify_({ name: item.name, description: item.description, linkTo: item.action === 'link' ? item.abilityId : null }, card, abilities);
    var ok = item.action === 'link' ? result.action === 'link' && result.abilityId === item.abilityId
      : item.action === 'create' ? result.action === 'create'
      : result.action === 'known' || result.action === 'known_diff';
    var reason = ok ? '' : '貼り付け時の判定「' + item.action + '」が現在のDBでは「' + result.action + '」です。検査をやり直してください。';
    if (ok && item.action === 'link') {
      if (linked[result.abilityId]) { ok = false; reason = result.abilityId + 'へ2件以上を紐付けようとしています。'; }
      linked[result.abilityId] = true;
    }
    var existing = result.existing;
    return {
      index: item.index, name: item.name, requestedAction: item.action, action: result.action, abilityId: result.abilityId,
      candidates: result.candidates || [], ok: ok, reason: reason,
      existing: existing ? {
        abilityId: existing.abilityId, name: existing.name, description: existing.description, sourceName: existing.sourceName,
        linkStatus: existing.linkStatus, status: existing.status, legacyId: existing.legacyId
      } : null
    };
  });
  return { card: card, results: results };
}

// 読取専用。貼り付けJSONを今のシートで判定し直して画面に返す。シートを書き換えない。
function api_asstPreviewAbilityCapture(payload) {
  asstRequireUser_();
  var input = asstCapturePayload_(payload);
  var evaluation = asstCaptureEvaluate_(input, asstRows_(ASST_SHEET_CARDS), asstRows_(ASST_SHEET_ABILITIES));
  return { ok: evaluation.results.every(function (result) { return result.ok; }), card: evaluation.card, results: evaluation.results };
}

// 書込み。ScriptLock下でシートを読み直して判定を再計算し、1件でも食い違えば何も書かない。
// 紐付けは既存行の cardId / sortOrder / linkStatus だけを変える（本文・状態・legacyIdは変えない）。
// 新規は status: draft・legacyId: null・rarity/sourceName はカードから。sortOrderは紐付け・新規の順にカード末尾へ連番。
function api_asstApplyAbilityCapture(payload) {
  var input = asstCapturePayload_(payload);
  var lock = asstAcquireScriptLock_();
  try {
    var user = asstRequireUser_();
    var cardRows = asstRows_(ASST_SHEET_CARDS);
    var abilityRows = asstRows_(ASST_SHEET_ABILITIES);
    var refRows = asstRows_(ASST_SHEET_ABILITY_EXTERNAL_REFS);
    var evaluation = asstCaptureEvaluate_(input, cardRows, abilityRows);
    var failed = evaluation.results.filter(function (result) { return !result.ok; });
    if (failed.length) throw new Error('判定が一致しないため何も書き込みません: ' + failed.map(function (result) { return (result.index + 1) + '件目 ' + result.reason; }).join(' / '));
    var card = evaluation.card;
    var writes = input.items.filter(function (item) { return item.action === 'link' || item.action === 'create'; });
    if (!writes.length) return { ok: true, cardId: card.cardId, linked: [], created: [], skipped: input.items.length };

    var headers = ASST_HEADERS[ASST_SHEET_ABILITIES];
    var nextSortOrder = asstLmfdbNextSortOrder_(card.cardId, abilityRows);
    var nextSourceOrder = asstLmfdbNextSourceOrder_(abilityRows);
    var allocatedRows = abilityRows.slice();
    var updatedAt = nowIso_();
    var plans = writes.map(function (item) {
      var sortOrder = nextSortOrder++;
      if (item.action === 'link') {
        var row = abilityRows.filter(function (candidate) { return asstText_(candidate.abilityId) === item.abilityId; })[0];
        var before = headers.map(function (header) { return row[header]; });
        var after = before.slice();
        after[headers.indexOf('cardId')] = card.cardId;
        after[headers.indexOf('sortOrder')] = sortOrder;
        after[headers.indexOf('linkStatus')] = 'resolved';
        after[headers.indexOf('version')] = Number(row.version || 1) + 1;
        after[headers.indexOf('updatedAt')] = updatedAt;
        after[headers.indexOf('updatedBy')] = user.nickname;
        return { kind: 'link', abilityId: item.abilityId, rowNumber: row._row, before: before, after: after, sortOrder: sortOrder };
      }
      var abilityId = asstNextAbilityId_(allocatedRows, refRows);
      allocatedRows.push({ abilityId: abilityId });
      var ability = {
        abilityId: abilityId, legacyId: null, cardId: card.cardId, sourceName: card.name, name: item.name, description: item.description,
        source: item.source, rarity: card.rarity, tags: item.tags, sortOrder: sortOrder, linkStatus: 'resolved', flags: [], status: 'draft'
      };
      var issues = asstValidateAbilityRecord_(ability, true);
      if (issues.length) throw new Error('新規能力検査FAIL: ' + issues.join(' / '));
      var sourceOrder = nextSourceOrder++;
      return { kind: 'create', abilityId: abilityId, values: asstAbilityToSheetRow_(ability, sourceOrder, 1, updatedAt, user.nickname), sortOrder: sortOrder, sourceOrder: sourceOrder };
    });

    var journal = asstLmfdbNewJournal_();
    var idColumn = [headers.indexOf('abilityId')];
    try {
      plans.forEach(function (plan) {
        if (plan.kind === 'link') asstLmfdbJournalUpdate_(journal, ASST_SHEET_ABILITIES, plan.rowNumber, plan.before, plan.after, idColumn);
        else asstLmfdbJournalAppend_(journal, ASST_SHEET_ABILITIES, plan.values, idColumn);
      });
      var after = asstRows_(ASST_SHEET_ABILITIES);
      var created = plans.filter(function (plan) { return plan.kind === 'create'; }).length;
      if (after.length !== abilityRows.length + created) throw new Error('書込み後の行数検算に失敗しました。');
      plans.forEach(function (plan) {
        if (after.filter(function (row) { return asstText_(row.abilityId) === plan.abilityId; }).length !== 1) throw new Error('書込み後に能力を一意に確認できません: ' + plan.abilityId);
      });
      var docs = asstBuildDocuments_();
      var docIssues = asstValidateDocuments_(docs.cards, docs.effects, docs.abilities);
      if (docIssues.length) throw new Error('書込み直後検証FAIL: ' + docIssues.slice(0, 10).join(' / '));
      var detail = JSON.stringify({
        cardId: card.cardId, sourceScreenshots: input.sourceScreenshots,
        linked: plans.filter(function (plan) { return plan.kind === 'link'; }).map(function (plan) { return plan.abilityId; }),
        created: plans.filter(function (plan) { return plan.kind === 'create'; }).map(function (plan) { return plan.abilityId; }),
        skipped: input.items.length - plans.length, operator: user.nickname, updatedAt: updatedAt, validation: 'PASS'
      });
      asstLmfdbJournalAppend_(journal, ASST_SHEET_LOG, [updatedAt, user.nickname, 'apply-ability-capture', 'PASS', detail.slice(0, 5000)], [0,1,2,3,4]);
    } catch (error) {
      asstLmfdbCompensate_(journal);
      throw new Error('能力取り込みの保存に失敗したため元に戻しました: ' + error.message);
    }
    return {
      ok: true, cardId: card.cardId,
      linked: plans.filter(function (plan) { return plan.kind === 'link'; }).map(function (plan) { return { abilityId: plan.abilityId, sortOrder: plan.sortOrder }; }),
      created: plans.filter(function (plan) { return plan.kind === 'create'; }).map(function (plan) { return { abilityId: plan.abilityId, sortOrder: plan.sortOrder, sourceOrder: plan.sourceOrder, status: 'draft' }; }),
      skipped: input.items.length - plans.length
    };
  } finally {
    asstReleaseScriptLock_(lock);
  }
}
