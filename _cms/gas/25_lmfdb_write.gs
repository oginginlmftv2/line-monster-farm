/** lMfDB外部能力候補の追加・処置専用API。既存能力の更新・削除・公開は行わない。 */
var ASST_LMFDB_CREATE_KEYS = ['auditVersion','provider','externalSha','candidateKey','externalNumericId','externalFingerprint','expectedAbilitiesVersion','registration','confirmations'];
var ASST_LMFDB_REGISTRATION_KEYS = ['sourceName','name','description','source','rarity','tags','linkStatus','cardId'];
var ASST_LMFDB_CONFIRMATION_KEYS = ['originalCompared','normalizationReviewed','cardReviewed','idReuseReviewed'];
var ASST_LMFDB_DISPOSITION_KEYS = ['auditVersion','provider','externalSha','candidateKey','externalNumericId','externalFingerprint','expectedAbilitiesVersion','disposition'];
var ASST_LMFDB_ALLOWED_DISPOSITIONS = ['ignored','duplicate','unsupported','id_reused'];

function asstLmfdbAssertObjectKeys_(value, expected, label, optional) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + 'はオブジェクトです。');
  var actual = Object.keys(value);
  var allowed = expected.concat(optional || []);
  var unknown = actual.filter(function (key) { return allowed.indexOf(key) < 0; });
  var missing = expected.filter(function (key) { return actual.indexOf(key) < 0; });
  if (unknown.length) throw new Error(label + 'に未知の項目があります: ' + unknown.join(','));
  if (missing.length) throw new Error(label + 'に必須項目がありません: ' + missing.join(','));
}

function asstLmfdbNormalizeLf_(value) {
  return value.replace(/\r\n?/g, '\n');
}

function asstLmfdbValidateText_(value, label, maxLength, allowBreakTag) {
  if (typeof value !== 'string') throw new Error(label + 'は文字列です。');
  var normalized = asstLmfdbNormalizeLf_(value);
  if (!normalized.trim()) throw new Error(label + 'は必須です。');
  if (normalized.length > maxLength) throw new Error(label + 'が長すぎます。');
  if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) throw new Error(label + 'に制御文字を使用できません。');
  if (/<\s*\/\s*script/i.test(normalized) || /<\s*script\b/i.test(normalized)) throw new Error(label + 'にscript相当文字列を使用できません。');
  var withoutBreaks = allowBreakTag ? normalized.replace(/<br>/gi, '') : normalized;
  if (/[<>]/.test(withoutBreaks)) throw new Error(label + (allowBreakTag ? 'では<br>以外のHTMLを使用できません。' : 'にHTMLを使用できません。'));
  return normalized;
}

function asstLmfdbValidateTags_(tags, label) {
  label = label || 'registration.tags';
  if (!Array.isArray(tags)) throw new Error(label + 'は配列です。');
  if (tags.length > 100) throw new Error(label + 'が多すぎます。');
  var seen = {};
  return tags.map(function (tag, index) {
    var value = asstLmfdbValidateText_(tag, label + '[' + index + ']', 100, false);
    if (seen[value]) throw new Error(label + 'が重複しています: ' + value);
    seen[value] = true;
    return value;
  });
}

function asstLmfdbValidateIdentity_(payload) {
  if (payload.auditVersion !== 3) throw new Error('auditVersionが古いか不正です。再監査してください。');
  if (payload.provider !== ASST_LMFDB_PROVIDER) throw new Error('providerが不正です。');
  if (!asstIsSha_(payload.externalSha, 40)) throw new Error('externalShaが不正です。');
  if (!asstIsSha_(payload.candidateKey, 64)) throw new Error('candidateKeyが不正です。');
  if (typeof payload.externalNumericId !== 'number' || !Number.isInteger(payload.externalNumericId) || payload.externalNumericId <= 0) {
    throw new Error('externalNumericIdは正の整数です。');
  }
  if (!asstIsSha_(payload.externalFingerprint, 64)) throw new Error('externalFingerprintが不正です。');
  if (!asstIsSha_(payload.expectedAbilitiesVersion, 64)) throw new Error('expectedAbilitiesVersionが不正です。');
}

function asstLmfdbCreatePayload_(payload) {
  asstLmfdbAssertObjectKeys_(payload, ASST_LMFDB_CREATE_KEYS, 'payload');
  asstLmfdbValidateIdentity_(payload);
  asstLmfdbAssertObjectKeys_(payload.registration, ASST_LMFDB_REGISTRATION_KEYS, 'registration');
  asstLmfdbAssertObjectKeys_(payload.confirmations, ASST_LMFDB_CONFIRMATION_KEYS, 'confirmations');
  ASST_LMFDB_CONFIRMATION_KEYS.forEach(function (key) {
    if (typeof payload.confirmations[key] !== 'boolean') throw new Error('confirmations.' + key + 'は真偽値です。');
  });
  var registration = {
    sourceName: asstLmfdbValidateText_(payload.registration.sourceName, 'registration.sourceName', 200, false),
    name: asstLmfdbValidateText_(payload.registration.name, 'registration.name', 200, false),
    description: asstLmfdbValidateText_(payload.registration.description, 'registration.description', 5000, true),
    source: payload.registration.source,
    rarity: payload.registration.rarity,
    tags: asstLmfdbValidateTags_(payload.registration.tags),
    linkStatus: payload.registration.linkStatus,
    cardId: payload.registration.cardId
  };
  asstInList_(registration.source, ASST_ABILITY_SOURCES, 'registration.source', false);
  asstInList_(registration.rarity, ASST_ABILITY_RARITIES, 'registration.rarity', false);
  if (['resolved','unlinked'].indexOf(registration.linkStatus) < 0) throw new Error('registration.linkStatusはresolvedまたはunlinkedです。ambiguousは登録できません。');
  if (registration.linkStatus === 'resolved') {
    if (typeof registration.cardId !== 'string' || !registration.cardId) throw new Error('resolvedではcardIdが必須です。');
  } else if (registration.cardId !== null) throw new Error('unlinkedではcardIdをnullにしてください。');
  if (!payload.confirmations.originalCompared || !payload.confirmations.normalizationReviewed || !payload.confirmations.cardReviewed) {
    throw new Error('原文・NFKC比較・カード対応の確認がすべて必要です。');
  }
  return { payload: payload, registration: registration, confirmations: payload.confirmations };
}

function asstLmfdbDispositionPayload_(payload) {
  asstLmfdbAssertObjectKeys_(payload, ASST_LMFDB_DISPOSITION_KEYS, 'payload', ['note']);
  asstLmfdbValidateIdentity_(payload);
  if (ASST_LMFDB_ALLOWED_DISPOSITIONS.indexOf(payload.disposition) < 0) {
    throw new Error('dispositionはignored / duplicate / unsupported / id_reusedだけです。');
  }
  var note = '';
  if (payload.note !== undefined) {
    if (typeof payload.note !== 'string') throw new Error('noteは文字列です。');
    note = asstLmfdbNormalizeLf_(payload.note);
    if (note.length > 500) throw new Error('noteが長すぎます。');
    if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(note) || /[<>]/.test(note)) throw new Error('noteに制御文字またはHTMLを使用できません。');
  }
  return { payload: payload, disposition: payload.disposition, note: note };
}

function asstLmfdbCurrentAudit_(payload) {
  var latestSha = asstAuditResolveExternalSha_(null);
  if (latestSha !== payload.externalSha) throw new Error('外部mainが更新されています。再監査してください。');
  var external = asstAuditExternal_(latestSha);
  var localRows = asstAuditReadLocal_();
  var report = asstAuditAnalyze_(external.document, localRows, latestSha, external.sha256);
  if (report.auditStatus !== 'PASS') throw new Error('外部能力監査がFAILです。登録・処置できません。');
  if (report.expectedAbilitiesVersion !== payload.expectedAbilitiesVersion) throw new Error('能力DBが更新されています。再監査してください。');
  var matches = report.candidates.filter(function (candidate) { return candidate.candidateKey === payload.candidateKey; });
  if (matches.length !== 1) throw new Error('対象候補を一意に再監査できません。再監査してください。');
  var candidate = matches[0];
  if (candidate.externalNumericId !== payload.externalNumericId || candidate.externalFingerprint !== payload.externalFingerprint) {
    throw new Error('候補の外部IDまたはfingerprintが一致しません。再監査してください。');
  }
  var snapshot = candidate.externalSnapshot;
  if (!snapshot) throw new Error('候補の外部原文がありません。');
  asstLmfdbValidateText_(snapshot.card, '外部原文.sourceName', 200, false);
  asstLmfdbValidateText_(snapshot.name, '外部原文.name', 200, false);
  asstLmfdbValidateText_(snapshot.desc, '外部原文.description', 5000, true);
  asstLmfdbValidateText_(snapshot.source, '外部原文.source', 50, false);
  asstLmfdbValidateText_(snapshot.rarity, '外部原文.rarity', 50, false);
  asstLmfdbValidateTags_(snapshot.tags, '外部原文.tags');
  var writableRows = {
    cards: asstRows_(ASST_SHEET_CARDS),
    abilities: asstRows_(ASST_SHEET_ABILITIES),
    refs: asstRows_(ASST_SHEET_ABILITY_EXTERNAL_REFS)
  };
  if (asstAuditExpectedAbilitiesVersion_(writableRows.abilities) !== payload.expectedAbilitiesVersion) {
    throw new Error('能力DBが更新されています。再監査してください。');
  }
  return { latestSha: latestSha, external: external, localRows: writableRows, report: report, candidate: candidate };
}

function asstLmfdbAssertNoDuplicate_(registration, candidate, abilityRows) {
  var externalComparable = asstAuditComparableFromExternal_({
    card: candidate.externalSnapshot.card, name: candidate.externalSnapshot.name,
    desc: candidate.externalSnapshot.desc, source: candidate.externalSnapshot.source,
    rarity: candidate.externalSnapshot.rarity, tags: candidate.externalSnapshot.tags
  });
  var registrationComparable = {
    sourceName: registration.sourceName, name: registration.name, description: registration.description,
    source: registration.source, rarity: registration.rarity, tags: registration.tags
  };
  var externalExact = asstAuditComparableKey_(externalComparable);
  var externalNormalized = asstAuditComparableKey_(asstAuditNormalizeComparable_(externalComparable));
  var registrationExact = asstAuditComparableKey_(registrationComparable);
  var registrationNormalized = asstAuditComparableKey_(asstAuditNormalizeComparable_(registrationComparable));
  abilityRows.forEach(function (row) {
    var comparable = asstAuditComparableFromLocal_(asstAbilityFromRow_(row));
    var exact = asstAuditComparableKey_(comparable);
    var normalized = asstAuditComparableKey_(asstAuditNormalizeComparable_(comparable));
    if (exact === externalExact || exact === registrationExact) throw new Error('外部原文または登録予定値が既存能力と完全一致します。');
    if (normalized === externalNormalized || normalized === registrationNormalized) throw new Error('外部原文または登録予定値がNFKC後に既存能力と一致します。');
  });
}

function asstLmfdbNextSourceOrder_(abilityRows) {
  var max = 0;
  abilityRows.forEach(function (row) {
    var value = Number(row.sourceOrder);
    if (!Number.isInteger(value) || value <= 0) throw new Error('abilities/sourceOrderが正の整数ではありません。');
    if (value > max) max = value;
  });
  if (max >= Number.MAX_SAFE_INTEGER) throw new Error('sourceOrderを安全に採番できません。');
  return max + 1;
}

function asstLmfdbNextSortOrder_(cardId, abilityRows) {
  var orders = abilityRows.filter(function (row) {
    return asstText_(row.linkStatus) === 'resolved' && asstText_(row.cardId) === cardId;
  }).map(function (row) { return Number(row.sortOrder); }).sort(function (left, right) { return left - right; });
  orders.forEach(function (order, index) {
    if (!Number.isInteger(order) || order !== index + 1) throw new Error('resolvedの既存sortOrderが1からの連番ではありません。');
  });
  return orders.length + 1;
}

function asstLmfdbSameValues_(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asstLmfdbFailurePoint_(point) {
  // mock破壊テストだけがこの関数を差し替える。実運用では何もしない。
}

function asstLmfdbNewJournal_() {
  return { entries: [] };
}

function asstLmfdbIdentityMatches_(row, expected, identityColumns) {
  return identityColumns.every(function (column) { return row[column] === expected[column]; });
}

function asstLmfdbFindJournalRows_(entry) {
  var lastRow = entry.sheet.getLastRow();
  if (lastRow < 2) return [];
  var rows = entry.sheet.getRange(2, 1, lastRow - 1, entry.values.length).getValues();
  return rows.reduce(function (matches, row, index) {
    if (asstLmfdbIdentityMatches_(row, entry.values, entry.identityColumns)) {
      matches.push({ rowNumber: index + 2, values: row });
    }
    return matches;
  }, []);
}

function asstLmfdbJournalAppend_(journal, name, values, identityColumns, beforePoint, afterPoint) {
  var sheet = asstSheet_(name);
  var entry = {
    kind: 'append', name: name, sheet: sheet, rowNumber: sheet.getLastRow() + 1,
    values: values.slice(), identityColumns: identityColumns.slice()
  };
  journal.entries.push(entry);
  if (beforePoint) asstLmfdbFailurePoint_(beforePoint);
  sheet.appendRow(entry.values);
  if (afterPoint) asstLmfdbFailurePoint_(afterPoint);
  return entry;
}

function asstLmfdbJournalUpdate_(journal, name, rowNumber, beforeValues, afterValues, identityColumns, beforePoint, afterPoint) {
  var sheet = asstSheet_(name);
  var entry = {
    kind: 'update', name: name, sheet: sheet, rowNumber: rowNumber,
    values: afterValues.slice(), beforeValues: beforeValues.slice(), identityColumns: identityColumns.slice()
  };
  journal.entries.push(entry);
  if (beforePoint) asstLmfdbFailurePoint_(beforePoint);
  sheet.getRange(rowNumber, 1, 1, afterValues.length).setValues([afterValues]);
  if (afterPoint) asstLmfdbFailurePoint_(afterPoint);
  return entry;
}

function asstLmfdbCompensate_(journal) {
  var errors = [];
  journal.entries.slice().reverse().forEach(function (entry) {
    try {
      var matches = asstLmfdbFindJournalRows_(entry);
      if (entry.kind === 'append') {
        if (!matches.length) return;
        if (matches.length !== 1 || matches[0].rowNumber !== entry.rowNumber || !asstLmfdbSameValues_(matches[0].values, entry.values)) {
          throw new Error('追加行を行番号・一意キー・書込み後内容で一意に確認できません。');
        }
        entry.sheet.deleteRow(entry.rowNumber);
        if (asstLmfdbFindJournalRows_(entry).length) throw new Error('追加行の除去後検算に失敗しました。');
        return;
      }
      if (matches.length !== 1 || matches[0].rowNumber !== entry.rowNumber) {
        throw new Error('更新行を行番号と一意キーで一意に確認できません。');
      }
      if (asstLmfdbSameValues_(matches[0].values, entry.beforeValues)) return;
      if (!asstLmfdbSameValues_(matches[0].values, entry.values)) {
        throw new Error('更新行が期待した書込み後内容と一致しません。');
      }
      entry.sheet.getRange(entry.rowNumber, 1, 1, entry.beforeValues.length).setValues([entry.beforeValues]);
      var restored = entry.sheet.getRange(entry.rowNumber, 1, 1, entry.beforeValues.length).getValues()[0];
      if (!asstLmfdbSameValues_(restored, entry.beforeValues)) throw new Error('更新行の復元後検算に失敗しました。');
    } catch (error) { errors.push(entry.name + ' row ' + entry.rowNumber + ': ' + error.message); }
  });
  if (errors.length) {
    throw new Error('重大エラー: 補償検算失敗。全保存・公開を停止し、再実行せず、保存前の本番bookコピーと比較してください: ' + errors.join(' / '));
  }
}

function asstLmfdbRefValues_(row) {
  return ASST_HEADERS[ASST_SHEET_ABILITY_EXTERNAL_REFS].map(function (header) { return row[header]; });
}

function asstLmfdbCreateRefRow_(audit, abilityId, user, importedAt, reviewFlags) {
  var fingerprint = asstAuditFingerprint_(audit.candidate.externalSnapshot);
  return {
    provider: ASST_LMFDB_PROVIDER, candidateKey: fingerprint.candidateKey,
    externalNumericId: audit.candidate.externalNumericId, firstSeenSha: audit.latestSha, lastSeenSha: audit.latestSha,
    externalFingerprint: fingerprint.externalFingerprint, comparisonFingerprint: fingerprint.comparisonFingerprint,
    externalSnapshotJson: JSON.stringify(fingerprint.snapshot), disposition: 'imported', abilityId: abilityId,
    importedAt: importedAt, importedBy: user.nickname, decidedAt: importedAt, decidedBy: user.nickname,
    reviewFlagsJson: JSON.stringify(reviewFlags), note: '', version: 1
  };
}

function asstLmfdbVerifyCreate_(abilityId, candidateKey, beforeAbilityRows, beforeRefRows, refRowDelta) {
  var abilities = asstRows_(ASST_SHEET_ABILITIES);
  var refs = asstRows_(ASST_SHEET_ABILITY_EXTERNAL_REFS);
  if (abilities.length !== beforeAbilityRows + 1 || refs.length !== beforeRefRows + refRowDelta) throw new Error('追加直後の行数検算に失敗しました。');
  if (abilities.filter(function (row) { return row.abilityId === abilityId; }).length !== 1) throw new Error('追加能力を一意に確認できません。');
  if (refs.filter(function (row) { return row.candidateKey === candidateKey && row.disposition === 'imported' && row.abilityId === abilityId; }).length !== 1) {
    throw new Error('外部参照履歴を一意に確認できません。');
  }
  var refIssues = asstValidateExternalRefRows_(refs);
  var docs = asstBuildDocuments_();
  var issues = asstValidateDocuments_(docs.cards, docs.effects, docs.abilities).concat(refIssues);
  if (issues.length) throw new Error('追加直後検証FAIL: ' + issues.slice(0, 10).join(' / '));
}

function asstLmfdbAssertAllocationAvailable_(abilityId, sourceOrder, cardId, sortOrder, candidateKey, existingRef) {
  var abilities = asstRows_(ASST_SHEET_ABILITIES);
  var refs = asstRows_(ASST_SHEET_ABILITY_EXTERNAL_REFS);
  asstAssertAbilityIdAvailable_(abilityId, abilities, refs);
  if (abilities.some(function (row) { return Number(row.sourceOrder) === sourceOrder; })) throw new Error('sourceOrder採番後に衝突しました。再監査してください。');
  if (cardId && abilities.some(function (row) {
    return row.linkStatus === 'resolved' && row.cardId === cardId && Number(row.sortOrder) === sortOrder;
  })) throw new Error('sortOrder採番後に衝突しました。再監査してください。');
  var candidateRefs = refs.filter(function (row) { return row.candidateKey === candidateKey; });
  if (!existingRef && candidateRefs.length) throw new Error('同じcandidateKeyが同時に処置されました。再監査してください。');
  if (existingRef && (candidateRefs.length !== 1 || candidateRefs[0]._row !== existingRef._row ||
      !asstLmfdbSameValues_(asstLmfdbRefValues_(candidateRefs[0]), asstLmfdbRefValues_(existingRef)))) {
    throw new Error('id_reused参照が同時に更新されました。再監査してください。');
  }
}

function api_asstCreateAbilityFromExternalCandidate(payload) {
  var input = asstLmfdbCreatePayload_(payload);
  var lock = asstAcquireScriptLock_();
  try {
    var user = asstRequireUser_();
    var audit = asstLmfdbCurrentAudit_(input.payload);
    var candidate = audit.candidate;
    if (['card_match_candidate','unlinked_candidate','ID_REUSE_SUSPECTED'].indexOf(candidate.classification) < 0 || !candidate.registrationEligible || candidate.auditOnly) {
      throw new Error('対象は新規候補またはID再利用確認候補ではありません。');
    }
    if (candidate.classification === 'ID_REUSE_SUSPECTED' && !input.confirmations.idReuseReviewed) {
      throw new Error('ID再利用疑いの確認が必要です。');
    }
    var refRows = audit.localRows.refs;
    var existingRefs = refRows.filter(function (row) { return row.candidateKey === candidate.candidateKey; });
    if (existingRefs.length > 1) throw new Error('同じcandidateKeyの外部参照が重複しています。');
    var existingRef = existingRefs[0] || null;
    if (existingRef && existingRef.disposition !== 'id_reused') throw new Error('この候補はすでに処置済みです: ' + existingRef.disposition);
    if (existingRef && candidate.classification !== 'ID_REUSE_SUSPECTED') throw new Error('id_reused履歴と現在の候補分類が一致しません。');
    asstLmfdbAssertNoDuplicate_(input.registration, candidate, audit.localRows.abilities);
    var cardRows = audit.localRows.cards;
    var sortOrder = null;
    if (input.registration.linkStatus === 'resolved') {
      if (!input.confirmations.cardReviewed) throw new Error('resolvedではカード確認が必要です。');
      if (!cardRows.some(function (row) { return row.cardId === input.registration.cardId; })) throw new Error('resolvedのcardIdが不明です。');
      sortOrder = asstLmfdbNextSortOrder_(input.registration.cardId, audit.localRows.abilities);
    }
    var abilityId = asstNextAbilityId_(audit.localRows.abilities, refRows);
    var sourceOrder = asstLmfdbNextSourceOrder_(audit.localRows.abilities);
    asstAssertAbilityIdAvailable_(abilityId, audit.localRows.abilities, refRows);
    var importedAt = nowIso_();
    var ability = {
      abilityId: abilityId, legacyId: null,
      cardId: input.registration.linkStatus === 'resolved' ? input.registration.cardId : null,
      sourceName: input.registration.sourceName, name: input.registration.name, description: input.registration.description,
      source: input.registration.source, rarity: input.registration.rarity, tags: input.registration.tags,
      sortOrder: sortOrder, linkStatus: input.registration.linkStatus, flags: [], status: 'draft'
    };
    var abilityIssues = asstValidateAbilityRecord_(ability, true);
    if (abilityIssues.length) throw new Error('新規能力検査FAIL: ' + abilityIssues.join(' / '));
    var beforeAbilityRows = audit.localRows.abilities.length;
    var beforeRefRows = audit.localRows.refs.length;
    var journal = asstLmfdbNewJournal_();
    try {
      var abilityValues = asstAbilityToSheetRow_(ability, sourceOrder, 1, importedAt, user.nickname);
      asstLmfdbFailurePoint_('before-abilities-append');
      asstLmfdbAssertAllocationAvailable_(abilityId, sourceOrder, ability.cardId, sortOrder, candidate.candidateKey, existingRef);
      asstLmfdbJournalAppend_(journal, ASST_SHEET_ABILITIES, abilityValues,
        [ASST_HEADERS[ASST_SHEET_ABILITIES].indexOf('abilityId')], null, 'after-abilities-append');
      var reviewFlags = candidate.classification === 'ID_REUSE_SUSPECTED' ? ['id_reused'] : [];
      if (existingRef) {
        var updatedRef = {};
        ASST_HEADERS[ASST_SHEET_ABILITY_EXTERNAL_REFS].forEach(function (header) { updatedRef[header] = existingRef[header]; });
        updatedRef.lastSeenSha = audit.latestSha; updatedRef.disposition = 'imported'; updatedRef.abilityId = abilityId;
        updatedRef.importedAt = importedAt; updatedRef.importedBy = user.nickname; updatedRef.decidedAt = importedAt; updatedRef.decidedBy = user.nickname;
        updatedRef.reviewFlagsJson = JSON.stringify(reviewFlags); updatedRef.note = ''; updatedRef.version = Number(existingRef.version) + 1;
        asstLmfdbJournalUpdate_(journal, ASST_SHEET_ABILITY_EXTERNAL_REFS, existingRef._row,
          asstLmfdbRefValues_(existingRef), asstLmfdbRefValues_(updatedRef),
          [ASST_HEADERS[ASST_SHEET_ABILITY_EXTERNAL_REFS].indexOf('candidateKey')],
          'before-existing-ref-update', 'after-existing-ref-update');
      } else {
        asstLmfdbJournalAppend_(journal, ASST_SHEET_ABILITY_EXTERNAL_REFS,
          asstLmfdbRefValues_(asstLmfdbCreateRefRow_(audit, abilityId, user, importedAt, reviewFlags)),
          [ASST_HEADERS[ASST_SHEET_ABILITY_EXTERNAL_REFS].indexOf('candidateKey')],
          'before-new-ref-append', 'after-new-ref-append');
      }
      asstLmfdbFailurePoint_('before-create-verification');
      asstLmfdbVerifyCreate_(abilityId, candidate.candidateKey, beforeAbilityRows, beforeRefRows, existingRef ? 0 : 1);
      var detail = JSON.stringify({
        beforeAbilitiesRows: beforeAbilityRows, beforeExternalRefsRows: beforeRefRows,
        abilityId: abilityId, sourceOrder: sourceOrder, externalSha: audit.latestSha,
        externalNumericId: candidate.externalNumericId, candidateKey: candidate.candidateKey,
        externalFingerprint: candidate.externalFingerprint, comparisonFingerprint: candidate.comparisonFingerprint,
        operator: user.nickname, importedAt: importedAt, validation: 'PASS'
      });
      var logValues = [importedAt, user.nickname, 'create-external-ability', 'PASS', detail.slice(0, 5000)];
      asstLmfdbJournalAppend_(journal, ASST_SHEET_LOG, logValues, [0,1,2,3,4],
        'before-assist-log-append', 'after-assist-log-append');
      asstLmfdbFailurePoint_('before-final-row-count-check');
      if (journal.entries[journal.entries.length - 1].sheet.getLastRow() !== journal.entries[journal.entries.length - 1].rowNumber) {
        throw new Error('assist_logの追加検算に失敗しました。');
      }
    } catch (error) {
      try { asstLmfdbCompensate_(journal); }
      catch (compensationError) { throw compensationError; }
      throw error;
    }
    return {
      ok: true, abilityId: abilityId, legacyId: null, status: 'draft', linkStatus: ability.linkStatus,
      sortOrder: sortOrder, sourceOrder: sourceOrder, externalSha: audit.latestSha,
      externalFingerprint: candidate.externalFingerprint, validation: 'PASS'
    };
  } finally { asstReleaseScriptLock_(lock); }
}

function api_asstSetExternalCandidateDisposition(payload) {
  var input = asstLmfdbDispositionPayload_(payload);
  var lock = asstAcquireScriptLock_();
  try {
    var user = asstRequireUser_();
    var audit = asstLmfdbCurrentAudit_(input.payload);
    var candidate = audit.candidate;
    if (!candidate.candidateKey || !candidate.externalSnapshot) throw new Error('この候補は処置保存の対象ではありません。');
    if (input.disposition === 'id_reused' && candidate.classification !== 'ID_REUSE_SUSPECTED') {
      throw new Error('id_reusedはID再利用疑い候補だけに指定できます。');
    }
    var existing = audit.localRows.refs.filter(function (row) { return row.candidateKey === candidate.candidateKey; });
    if (existing.length > 1) throw new Error('同じcandidateKeyの外部参照が重複しています。');
    if (existing[0] && ['imported','reverted'].indexOf(existing[0].disposition) >= 0) throw new Error('imported / reverted済み候補は再処置できません。');
    var decidedAt = nowIso_();
    var journal = asstLmfdbNewJournal_();
    try {
      if (existing[0]) {
        var updated = {};
        ASST_HEADERS[ASST_SHEET_ABILITY_EXTERNAL_REFS].forEach(function (header) { updated[header] = existing[0][header]; });
        updated.lastSeenSha = audit.latestSha; updated.disposition = input.disposition; updated.note = input.note;
        updated.decidedAt = decidedAt; updated.decidedBy = user.nickname; updated.version = Number(existing[0].version) + 1;
        asstLmfdbJournalUpdate_(journal, ASST_SHEET_ABILITY_EXTERNAL_REFS, existing[0]._row,
          asstLmfdbRefValues_(existing[0]), asstLmfdbRefValues_(updated),
          [ASST_HEADERS[ASST_SHEET_ABILITY_EXTERNAL_REFS].indexOf('candidateKey')],
          'before-existing-ref-update', 'after-existing-ref-update');
      } else {
        var fingerprint = asstAuditFingerprint_(candidate.externalSnapshot);
        asstLmfdbJournalAppend_(journal, ASST_SHEET_ABILITY_EXTERNAL_REFS, asstLmfdbRefValues_({
          provider: ASST_LMFDB_PROVIDER, candidateKey: fingerprint.candidateKey, externalNumericId: candidate.externalNumericId,
          firstSeenSha: audit.latestSha, lastSeenSha: audit.latestSha, externalFingerprint: fingerprint.externalFingerprint,
          comparisonFingerprint: fingerprint.comparisonFingerprint, externalSnapshotJson: JSON.stringify(fingerprint.snapshot),
          disposition: input.disposition, abilityId: '', importedAt: decidedAt, importedBy: user.nickname,
          decidedAt: decidedAt, decidedBy: user.nickname,
          reviewFlagsJson: JSON.stringify(input.disposition === 'id_reused' ? ['id_reused'] : []), note: input.note, version: 1
        }), [ASST_HEADERS[ASST_SHEET_ABILITY_EXTERNAL_REFS].indexOf('candidateKey')],
        'before-new-ref-append', 'after-new-ref-append');
      }
      var refs = asstRows_(ASST_SHEET_ABILITY_EXTERNAL_REFS);
      if (refs.filter(function (row) { return row.candidateKey === candidate.candidateKey; }).length !== 1) throw new Error('処置後のcandidateKey一意検算に失敗しました。');
      var issues = asstValidateExternalRefRows_(refs);
      if (issues.length) throw new Error('処置後検証FAIL: ' + issues.slice(0, 10).join(' / '));
      var detail = JSON.stringify({
        externalSha: audit.latestSha, externalNumericId: candidate.externalNumericId,
        candidateKey: candidate.candidateKey, disposition: input.disposition,
        operator: user.nickname, decidedAt: decidedAt, validation: 'PASS'
      });
      asstLmfdbJournalAppend_(journal, ASST_SHEET_LOG,
        [decidedAt, user.nickname, 'set-external-disposition', 'PASS', detail.slice(0, 5000)], [0,1,2,3,4],
        'before-assist-log-append', 'after-assist-log-append');
      asstLmfdbFailurePoint_('before-final-row-count-check');
      if (journal.entries[journal.entries.length - 1].sheet.getLastRow() !== journal.entries[journal.entries.length - 1].rowNumber) {
        throw new Error('assist_logの追加検算に失敗しました。');
      }
    } catch (error) {
      try { asstLmfdbCompensate_(journal); }
      catch (compensationError) { throw compensationError; }
      throw error;
    }
    return { ok: true, candidateKey: candidate.candidateKey, disposition: input.disposition, version: existing[0] ? Number(existing[0].version) + 1 : 1, validation: 'PASS' };
  } finally { asstReleaseScriptLock_(lock); }
}
