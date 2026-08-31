/** ガチャドメイン。シート保存・画像・公開用データ組み立てを扱う。GitHub送信は30_publish.gsだけに置く。 */
var GACHA_SHEET = 'gachas';
var GACHA_TYPE_SHEET = 'gacha_types';
var GACHA_SHEET_PUBLISH_LOG = 'gacha_publish_log';
var GACHA_PICKUP_SLOTS = 5;
var GACHA_EXPLANATION_GATE = 300;
var GACHA_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
var GACHA_IMAGE_MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
var GACHA_HEADERS = {};
GACHA_HEADERS[GACHA_SHEET] = [
  'gachaId', 'name', 'gachaType', 'image', 'startAt', 'endAt', 'explanation'
];
for (var gachaHeaderSlot_ = 1; gachaHeaderSlot_ <= GACHA_PICKUP_SLOTS; gachaHeaderSlot_++) {
  GACHA_HEADERS[GACHA_SHEET].push('monster' + gachaHeaderSlot_);
}
for (var gachaMonsterRateHeaderSlot_ = 1; gachaMonsterRateHeaderSlot_ <= GACHA_PICKUP_SLOTS; gachaMonsterRateHeaderSlot_++) {
  GACHA_HEADERS[GACHA_SHEET].push('monsterRate' + gachaMonsterRateHeaderSlot_);
}
for (var gachaCardHeaderSlot_ = 1; gachaCardHeaderSlot_ <= GACHA_PICKUP_SLOTS; gachaCardHeaderSlot_++) {
  GACHA_HEADERS[GACHA_SHEET].push('card' + gachaCardHeaderSlot_);
}
for (var gachaCardRateHeaderSlot_ = 1; gachaCardRateHeaderSlot_ <= GACHA_PICKUP_SLOTS; gachaCardRateHeaderSlot_++) {
  GACHA_HEADERS[GACHA_SHEET].push('cardRate' + gachaCardRateHeaderSlot_);
}
GACHA_HEADERS[GACHA_SHEET] = GACHA_HEADERS[GACHA_SHEET].concat([
  'rerollPriority', 'status', 'publishedAt', 'author', 'updatedAt', 'lastEditor'
]);
GACHA_HEADERS[GACHA_TYPE_SHEET] = ['label'];
GACHA_HEADERS[GACHA_SHEET_PUBLISH_LOG] = ['日時', '実行者', 'コミットSHA', '結果', '詳細'];

function gachaSheet_(name) {
  if (name !== GACHA_SHEET && name !== GACHA_TYPE_SHEET && name !== GACHA_SHEET_PUBLISH_LOG) {
    throw new Error('ガチャCMSから参照できないシートです: ' + name);
  }
  var sheet = book_().getSheetByName(name);
  if (!sheet) throw new Error(name + ' シートがありません。setup1_createSheetsを実行してください。');
  return sheet;
}

function gachaText_(value) {
  return String(value == null ? '' : value).trim();
}

function gachaBool_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function gachaMinuteDateTime_(value) {
  var text = gachaText_(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(text)) {
    text = text.replace(/:00\+09:00$/, '+09:00');
  }
  return text;
}

function gachaDateCell_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return gachaMinuteDateTime_(Utilities.formatDate(value, tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX"));
  }
  // G3〜G5で保存された秒固定の値は、build.jsの正規形へ読取時に移行する。
  return gachaMinuteDateTime_(value);
}

function gachaDateOnlyCell_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz_(), 'yyyy-MM-dd');
  }
  var text = gachaText_(value);
  if (/^\d{4}-\d{2}-\d{2}T00:00(?::00)?\+09:00$/.test(text)) return text.slice(0, 10);
  return text;
}

function gachaColumnMap_() {
  var map = {};
  GACHA_HEADERS[GACHA_SHEET].forEach(function (name, index) { map[name] = index; });
  return map;
}

function gachaReadAll_() {
  var sheet = gachaSheet_(GACHA_SHEET);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var headers = GACHA_HEADERS[GACHA_SHEET];
  var columns = gachaColumnMap_();
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function (row, index) {
    var item = { _row: index + 2 };
    headers.forEach(function (header) { item[header] = row[columns[header]]; });
    item.gachaId = gachaText_(item.gachaId);
    item.name = gachaText_(item.name);
    item.gachaType = gachaText_(item.gachaType);
    item.image = gachaText_(item.image);
    item.startAt = gachaDateCell_(item.startAt);
    item.endAt = gachaDateCell_(item.endAt);
    item.explanation = String(item.explanation == null ? '' : item.explanation);
    item.rerollPriority = gachaBool_(item.rerollPriority);
    item.status = gachaText_(item.status) || 'draft';
    item.publishedAt = gachaDateOnlyCell_(item.publishedAt);
    item.author = gachaText_(item.author);
    item.updatedAt = gachaDateCell_(item.updatedAt);
    item.lastEditor = gachaText_(item.lastEditor);
    for (var slot = 1; slot <= GACHA_PICKUP_SLOTS; slot++) {
      item['monster' + slot] = gachaText_(item['monster' + slot]);
      item['monsterRate' + slot] = item['monsterRate' + slot] === '' ? '' : Number(item['monsterRate' + slot]);
      item['card' + slot] = gachaText_(item['card' + slot]);
      item['cardRate' + slot] = item['cardRate' + slot] === '' ? '' : Number(item['cardRate' + slot]);
    }
    return item;
  });
}

function gachaTypeLabels_() {
  var sheet = gachaSheet_(GACHA_TYPE_SHEET);
  if (sheet.getLastRow() < 2) return [];
  var labels = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (row) {
    return gachaText_(row[0]);
  }).filter(Boolean);
  return labels.filter(function (label, index) { return labels.indexOf(label) === index; });
}

function gachaLookupDocument_(kind) {
  var file = kind === 'monster' ? 'monster-ids.json' : 'assist-cards.json';
  var cache = CacheService.getScriptCache();
  var cacheKey = 'gachaLookup:' + file;
  var hit = cache.get(cacheKey);
  if (hit) {
    try { return JSON.parse(hit); } catch (error) { /* 壊れたキャッシュは取り直す */ }
  }
  var source = asstFetchJson_(RAW_BASE + file);
  var document = kind === 'monster' ? {
    monsters: (source.monsters || []).map(function (item) {
      return { id: item.id, name: item.name, image: item.image };
    })
  } : {
    cards: (source.cards || []).map(function (item) {
      return { cardId: item.cardId, name: item.name, rarity: item.rarity, image: item.image };
    })
  };
  cache.put(cacheKey, JSON.stringify(document), 3600);
  return document;
}

function gachaLookupPickup_(kind, id) {
  kind = gachaText_(kind);
  id = gachaText_(id);
  if (['monster', 'card'].indexOf(kind) < 0 || !id) return { ok: false };
  var document = gachaLookupDocument_(kind);
  if (kind === 'monster') {
    var monster = (document.monsters || []).filter(function (item) {
      return gachaText_(item.id) === id;
    })[0];
    return monster ? { ok: true, name: gachaText_(monster.name), image: gachaText_(monster.image) } : { ok: false };
  }
  var card = (document.cards || []).filter(function (item) {
    return gachaText_(item.cardId) === id;
  })[0];
  return card ? {
    ok: true,
    name: gachaText_(card.name),
    rarity: gachaText_(card.rarity),
    image: gachaText_(card.image)
  } : { ok: false };
}

function gachaNormalizeDateTime_(value, label) {
  var text = gachaMinuteDateTime_(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) text += '+09:00';
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+09:00$/.test(text)) { /* 正規形 */ }
  else throw new Error(label + 'は日時を選択してください。');
  var time = new Date(text).getTime();
  if (!isFinite(time)) throw new Error(label + 'が実在する日時ではありません。');
  if (gachaMinuteDateTime_(Utilities.formatDate(new Date(time), tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX")) !== text) {
    throw new Error(label + 'が実在する日時ではありません。');
  }
  return text;
}

function gachaPickupValues_(payload, kind) {
  var source = payload[kind + 'Pickups'];
  if (!Array.isArray(source)) source = [];
  if (source.length > GACHA_PICKUP_SLOTS) throw new Error(kind + 'のピックアップは' + GACHA_PICKUP_SLOTS + '枠までです。');
  var values = [];
  for (var slot = 0; slot < GACHA_PICKUP_SLOTS; slot++) {
    var pickup = source[slot] || {};
    var id = gachaText_(pickup.id);
    var rawRate = pickup.rate;
    if (!id && (rawRate === '' || rawRate == null)) {
      values.push({ id: '', rate: '' });
      continue;
    }
    if (!id) throw new Error(kind + (slot + 1) + 'のIDを入力してください。');
    if (typeof rawRate !== 'number' || !isFinite(rawRate) || rawRate <= 0 || rawRate > 100) {
      throw new Error(kind + (slot + 1) + 'の排出率は0より大きく100以下の数値で入力してください。');
    }
    if (!gachaLookupPickup_(kind, id).ok) {
      throw new Error(kind + (slot + 1) + 'のIDが見つかりません: ' + id);
    }
    values.push({ id: id, rate: rawRate });
  }
  return values;
}

function gachaNextId_(startAt, rows) {
  var datePart = startAt.slice(0, 10).replace(/-/g, '');
  var used = {};
  rows.forEach(function (row) {
    var match = gachaText_(row.gachaId).match(new RegExp('^' + datePart + '-(\\d+)$'));
    if (match) used[Number(match[1])] = true;
  });
  var branch = 1;
  while (used[branch]) branch++;
  return datePart + '-' + branch;
}

function gachaSaveIdentity_(current, startAt, rows) {
  if (!current) return { gachaId: gachaNextId_(startAt, rows), renumbered: false };
  if (current.status === 'published' || current.publishedAt) {
    return { gachaId: current.gachaId, renumbered: false };
  }
  if (current.startAt.slice(0, 10) === startAt.slice(0, 10)) {
    return { gachaId: current.gachaId, renumbered: false };
  }
  var otherRows = rows.filter(function (row) { return row._row !== current._row; });
  var gachaId = gachaNextId_(startAt, otherRows);
  return { gachaId: gachaId, renumbered: gachaId !== current.gachaId };
}

function gachaRowValues_(item) {
  return GACHA_HEADERS[GACHA_SHEET].map(function (header) { return item[header] == null ? '' : item[header]; });
}

function gachaImageFolder_() {
  var folderId = prop_('GACHA_DRIVE_FOLDER_ID');
  return DriveApp.getFolderById(folderId);
}

function gachaStampInitialPublishedAt_(rows) {
  var publishedAtColumn = GACHA_HEADERS[GACHA_SHEET].indexOf('publishedAt') + 1;
  var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  rows.forEach(function (row) {
    if (row.status !== 'published' || row.publishedAt) return;
    gachaSheet_(GACHA_SHEET).getRange(row._row, publishedAtColumn).setValue(today);
    row.publishedAt = today;
  });
}

function gachaBuildPublishDocuments_(rows) {
  var gachas = rows.filter(function (row) { return row.status === 'published'; }).map(function (row) {
    var pickupMonsters = [];
    var pickupCards = [];
    for (var slot = 1; slot <= GACHA_PICKUP_SLOTS; slot++) {
      if (row['monster' + slot]) {
        pickupMonsters.push({ id: row['monster' + slot], rate: row['monsterRate' + slot] });
      }
      if (row['card' + slot]) {
        pickupCards.push({ cardId: row['card' + slot], rate: row['cardRate' + slot] });
      }
    }
    return {
      gachaId: row.gachaId,
      name: row.name,
      gachaType: row.gachaType,
      image: row.image,
      startAt: row.startAt,
      endAt: row.endAt,
      explanation: row.explanation,
      pickupMonsters: pickupMonsters,
      pickupCards: pickupCards,
      rerollPriority: row.rerollPriority,
      status: 'published',
      publishedAt: row.publishedAt
    };
  });
  return {
    gachas: { schemaVersion: 1, gachas: gachas },
    types: { schemaVersion: 1, types: gachaTypeLabels_() }
  };
}

function gachaValidatePublishDocuments_(documents, allowEmptyPublishedAt) {
  var issues = [];
  var types = documents.types.types;
  var ids = {};
  documents.gachas.gachas.forEach(function (gacha) {
    var label = gacha.gachaId || '<gachaIdなし>';
    if (!/^\d{8}-\d+$/.test(gacha.gachaId)) issues.push(label + ': gachaId形式が不正です。');
    if (ids[gacha.gachaId]) issues.push(label + ': gachaIdが重複しています。');
    ids[gacha.gachaId] = true;
    if (!gacha.name || types.indexOf(gacha.gachaType) < 0) issues.push(label + ': 名前または種別が不正です。');
    if (!/^gacha-banner\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/i.test(gacha.image) ||
        gacha.image.split('/').pop().replace(/\.[^.]+$/, '') !== gacha.gachaId) {
      issues.push(label + ': バナー画像パスが不正です。');
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+09:00$/.test(gacha.startAt) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+09:00$/.test(gacha.endAt) ||
        new Date(gacha.startAt).getTime() >= new Date(gacha.endAt).getTime()) {
      issues.push(label + ': 開始日時または終了日時が不正です。');
    }
    if (!(allowEmptyPublishedAt && !gacha.publishedAt) && !/^\d{4}-\d{2}-\d{2}$/.test(gacha.publishedAt)) {
      issues.push(label + ': publishedAtが不正です。');
    }
    gacha.pickupMonsters.forEach(function (pickup) {
      if (!pickup.id || typeof pickup.rate !== 'number' || !isFinite(pickup.rate) || pickup.rate <= 0 || pickup.rate > 100) {
        issues.push(label + ': モンスターピックアップが不正です。');
      }
    });
    gacha.pickupCards.forEach(function (pickup) {
      if (!pickup.cardId || typeof pickup.rate !== 'number' || !isFinite(pickup.rate) || pickup.rate <= 0 || pickup.rate > 100) {
        issues.push(label + ': カードピックアップが不正です。');
      }
    });
  });
  return issues;
}

function api_gachaList() {
  requireScope_('gacha');
  var now = Date.now();
  return gachaReadAll_().map(function (item) {
    var displayState = item.status !== 'published' ? 'draft' : (new Date(item.endAt).getTime() < now ? 'ended' : 'current');
    return {
      gachaId: item.gachaId,
      name: item.name,
      gachaType: item.gachaType,
      image: item.image,
      startAt: item.startAt,
      endAt: item.endAt,
      status: item.status,
      displayState: displayState,
      updatedAt: item.updatedAt,
      lastEditor: item.lastEditor
    };
  }).sort(function (a, b) {
    return a.startAt === b.startAt ? (a.gachaId < b.gachaId ? 1 : -1) : (a.startAt < b.startAt ? 1 : -1);
  });
}

function api_gachaGet(gachaId) {
  requireScope_('gacha');
  var id = gachaText_(gachaId);
  var item = gachaReadAll_().filter(function (row) { return row.gachaId === id; })[0];
  if (!item) throw new Error('ガチャIDが見つかりません: ' + id);
  return item;
}

function api_gachaTypes() {
  requireScope_('gacha');
  return gachaTypeLabels_();
}

function api_gachaLookupPickup(kind, id) {
  requireScope_('gacha');
  return gachaLookupPickup_(kind, id);
}

function api_gachaSave(payload) {
  var user = requireScope_('gacha');
  if (!user.nickname) throw new Error('membersシートのニックネームが空です。');
  payload = payload || {};
  var name = gachaText_(payload.name);
  var gachaType = gachaText_(payload.gachaType);
  if (!name || !gachaType || !payload.startAt || !payload.endAt) {
    throw new Error('名前・種別・開始日時・終了日時は必須です。');
  }
  var startAt = gachaNormalizeDateTime_(payload.startAt, '開始日時');
  var endAt = gachaNormalizeDateTime_(payload.endAt, '終了日時');
  if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
    throw new Error('開始日時は終了日時より前にしてください。');
  }
  if (gachaTypeLabels_().indexOf(gachaType) < 0) throw new Error('gacha_typesにない種別です: ' + gachaType);
  var monsterPickups = gachaPickupValues_(payload, 'monster');
  var cardPickups = gachaPickupValues_(payload, 'card');
  var requestedStatusText = payload.status == null ? '' : gachaText_(payload.status);
  if (requestedStatusText && requestedStatusText !== 'draft' && requestedStatusText !== 'published') {
    throw new Error('statusはdraftまたはpublishedだけ指定できます。');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の保存処理と重なりました。少し待ってからやり直してください。');
  try {
    var rows = gachaReadAll_();
    var requestedId = gachaText_(payload.gachaId);
    var current = requestedId ? rows.filter(function (row) { return row.gachaId === requestedId; })[0] : null;
    if (requestedId && !current) throw new Error('編集対象のガチャIDが見つかりません: ' + requestedId);
    if (current && gachaText_(payload.baseUpdatedAt) !== current.updatedAt) {
      throw new Error('他の人がこのガチャを更新しています。画面を読み込み直してください。');
    }
    var requestedStatus = requestedStatusText || (current ? current.status : 'draft');

    // 公開済みIDはURL不変のため維持する。draftは開始日の日付変更時だけ採番し直す。
    var identity = gachaSaveIdentity_(current, startAt, rows);
    var gachaId = identity.gachaId;
    var updatedAt = nowIso_();
    var item = {
      gachaId: gachaId,
      name: name,
      gachaType: gachaType,
      // draftのID変更時は旧IDの画像パスを公開データへ残さず、再アップロードを求める。
      image: identity.renumbered ? '' : (current ? current.image : ''),
      startAt: startAt,
      endAt: endAt,
      explanation: String(payload.explanation == null ? '' : payload.explanation),
      rerollPriority: payload.rerollPriority === true,
      status: requestedStatus,
      publishedAt: current ? current.publishedAt : '',
      author: current ? current.author : user.nickname,
      updatedAt: updatedAt,
      lastEditor: user.nickname
    };
    for (var slot = 1; slot <= GACHA_PICKUP_SLOTS; slot++) {
      item['monster' + slot] = monsterPickups[slot - 1].id;
      item['monsterRate' + slot] = monsterPickups[slot - 1].rate;
      item['card' + slot] = cardPickups[slot - 1].id;
      item['cardRate' + slot] = cardPickups[slot - 1].rate;
    }
    var values = gachaRowValues_(item);
    var sheet = gachaSheet_(GACHA_SHEET);
    var rowNumber = current ? current._row : sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
    return {
      ok: true,
      gachaId: gachaId,
      previousGachaId: current ? current.gachaId : '',
      renumbered: identity.renumbered,
      imageCleared: identity.renumbered && !!current.image,
      updatedAt: updatedAt,
      status: item.status,
      created: !current
    };
  } finally {
    lock.releaseLock();
  }
}

function api_gachaUploadImage(payload) {
  var user = requireScope_('gacha');
  if (!user.nickname) throw new Error('membersシートのニックネームが空です。');
  payload = payload || {};
  var mimeType = gachaText_(payload.mimeType).toLowerCase();
  var extension = GACHA_IMAGE_MIME_EXT[mimeType];
  if (!extension) throw new Error('対応形式はJPG・PNG・WebPの3種類です。');
  var base64 = String(payload.base64 || '').replace(/\s+/g, '');
  var maxBase64Length = Math.ceil(GACHA_IMAGE_MAX_BYTES / 3) * 4 + 4;
  if (!base64 || base64.length > maxBase64Length || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error('画像データが不正です。画像は2MB以下にしてください。');
  }
  var bytes;
  try { bytes = Utilities.base64Decode(base64); }
  catch (error) { throw new Error('画像データを復号できません。'); }
  if (!bytes.length || bytes.length > GACHA_IMAGE_MAX_BYTES) throw new Error('画像は2MB以下にしてください。');
  if (!isExpectedImage_(bytes, mimeType)) throw new Error('ファイルの内容と画像形式が一致しません。');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の保存処理と重なりました。少し待ってからやり直してください。');
  var newFile = null;
  var trashedFiles = [];
  try {
    var gachaId = gachaText_(payload.gachaId);
    var current = gachaReadAll_().filter(function (row) { return row.gachaId === gachaId; })[0];
    if (!current) throw new Error('ガチャIDが見つかりません: ' + gachaId);
    if (gachaText_(payload.baseUpdatedAt) !== current.updatedAt) {
      throw new Error('他の人がこのガチャを更新しています。画面を読み込み直してください。');
    }
    var folder = gachaImageFolder_();
    var fileName = gachaId + '.' + extension;
    newFile = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
    var sameId = new RegExp('^' + gachaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.[^.]+$', 'i');
    var files = folder.getFiles();
    while (files.hasNext()) {
      var oldFile = files.next();
      if (oldFile.getId() === newFile.getId() || !sameId.test(oldFile.getName())) continue;
      oldFile.setTrashed(true);
      trashedFiles.push(oldFile);
    }

    var values = gachaRowValues_(current);
    var updatedAt = nowIso_();
    values[GACHA_HEADERS[GACHA_SHEET].indexOf('image')] = 'gacha-banner/' + fileName;
    values[GACHA_HEADERS[GACHA_SHEET].indexOf('updatedAt')] = updatedAt;
    values[GACHA_HEADERS[GACHA_SHEET].indexOf('lastEditor')] = user.nickname;
    gachaSheet_(GACHA_SHEET).getRange(current._row, 1, 1, values.length).setValues([values]);
    return { ok: true, gachaId: gachaId, image: 'gacha-banner/' + fileName, bytes: bytes.length, updatedAt: updatedAt };
  } catch (error) {
    if (newFile) {
      try { newFile.setTrashed(true); } catch (ignoreNew) { /* 復旧は次回手動確認 */ }
    }
    trashedFiles.forEach(function (file) {
      try { file.setTrashed(false); } catch (ignoreOld) { /* 復旧は次回手動確認 */ }
    });
    throw error;
  } finally {
    lock.releaseLock();
  }
}
