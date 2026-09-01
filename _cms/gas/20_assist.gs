/** アシストドメイン。 */
var ASST_RAW_REPO_BASE = 'https://raw.githubusercontent.com/oginginlmftv2/line-monster-farm/main/';
var ASST_SHEET_CARDS = 'cards';
var ASST_SHEET_EFFECTS = 'assist_effects';
var ASST_SHEET_ABILITIES = 'abilities';
var ASST_SHEET_ABILITY_EXTERNAL_REFS = 'ability_external_refs';
var ASST_SHEET_LOG = 'assist_log';
var ASST_SHEET_PUBLISH_LOG = 'assist_publish_log';
var ASST_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
var ASST_IMAGE_MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
var ASST_HEADERS = {};
ASST_HEADERS[ASST_SHEET_CARDS] = ['sourceOrder','cardId','name','rarity','aura','cardType','monType','image','event2','releasedAt','accessoryStatus','statsJson','limitBreakJson','ratingsJson','explanation','formationsJson','sapoRefJson','version','updatedAt','updatedBy'];
ASST_HEADERS[ASST_SHEET_EFFECTS] = ['cardId','effectId','name','description','unlockRank','sortOrder','updatedAt','updatedBy','conditional','conditionsJson'];
ASST_HEADERS[ASST_SHEET_ABILITIES] = ['sourceOrder','abilityId','legacyId','cardId','sourceName','name','description','source','rarity','tagsJson','sortOrder','linkStatus','flagsJson','status','version','updatedAt','updatedBy'];
ASST_HEADERS[ASST_SHEET_ABILITY_EXTERNAL_REFS] = ['provider','candidateKey','externalNumericId','firstSeenSha','lastSeenSha','externalFingerprint','comparisonFingerprint','externalSnapshotJson','disposition','abilityId','importedAt','importedBy','decidedAt','decidedBy','reviewFlagsJson','note','version'];
ASST_HEADERS[ASST_SHEET_LOG] = ['timestamp','user','action','result','detail'];
ASST_HEADERS[ASST_SHEET_PUBLISH_LOG] = ['日時','実行者','コミットSHA','結果','詳細'];
var ASST_RARITIES = ['MR','SSR'];
var ASST_AURAS = ['赤','緑','黄','白','黒','青'];
var ASST_CARD_TYPES = ['ガード','かしこさ','ジャッジ','アサルト','回避','師匠','ちから','テクニック','友人','丈夫さ','インパクト','フォース','命中','メンタル','フィジカル','クイック','サバイブ','ライバル','ルミナス','バイタル','フォーカス','タフネス','ライフ','アキュメン'];
var ASST_MON_TYPES = ['幻霊','無機','創造','獣族','魔族','怪物'];
var ASST_ABILITY_STATUSES = ['draft','verified'];
var ASST_LINK_STATUSES = ['resolved','ambiguous','unlinked'];
var ASST_ABILITY_SOURCES = ['イベント','閃き','EXトレ','伝授'];
var ASST_ABILITY_RARITIES = ['MR','SSR','SR','その他'];
var ASST_EXTERNAL_REF_PROVIDERS = ['lmfdb'];
var ASST_EXTERNAL_REF_DISPOSITIONS = ['imported','ignored','duplicate','unsupported','id_reused','reverted'];
var ASST_EXTERNAL_REVIEW_FLAGS = ['id_reused'];
var ASST_EXTERNAL_REF_HEADERS = ['provider','candidateKey','externalNumericId','firstSeenSha','lastSeenSha','externalFingerprint','comparisonFingerprint','externalSnapshotJson','disposition','abilityId','importedAt','importedBy','decidedAt','decidedBy','reviewFlagsJson','note','version'];
var ASST_EXTERNAL_SNAPSHOT_KEYS = ['id','card','name','desc','source','rarity','tags'];
var ASST_LMFDB_PROVIDER = 'lmfdb';
var ASST_LMFDB_MAIN_REF_URL = 'https://api.github.com/repos/futsalife24-bot/lMfDB/git/ref/heads/main';
var ASST_LMFDB_RAW_BASE = 'https://raw.githubusercontent.com/futsalife24-bot/lMfDB/';
var ASST_LMFDB_RAW_PATH = '/data/abilities.json';
var ASST_LMFDB_MAX_BYTES = 2 * 1024 * 1024;
var ASST_LMFDB_REQUIRED_FIELDS = ['id','name','desc','card','tags','source','rarity'];
var ASST_LMFDB_COMPARABLE_FIELDS = ['sourceName','name','description','source','rarity','tags'];
var ASST_LMFDB_PROCESSED_DISPOSITIONS = ['imported','ignored','duplicate','unsupported'];
var ASST_UNLOCK_RANKS = ['無凸','1凸','2凸','3凸','4凸'];
// 効果の一致時限定フラグ。conditional=0は無条件、1はconditionsの条件をすべて記録する。
var ASST_EFFECT_CONDITION_TYPES = ['mainBloodlineMatch','subBloodlineMatch','auraMatch','monTypeMatch','speciesMatch'];
var ASST_EFFECT_CONDITION_OPERATORS = ['and','or'];
var ASST_RATING_KEYS = ['ikusei','karyo','battle','ta'];
var ASST_ACCESSORY_STATUSES = ['unknown','yes','no'];
// 旧形式（手入力・91件）と新形式（自動採番）の両方を受け付ける。既存IDは公開URLなので変更しない。
var ASST_CARD_ID_PATTERN = /^(?:[a-z][a-z0-9]*-(?:MR|SSR)-[a-z0-9]+|c[0-9]{4}-(?:MR|SSR))$/;
var ASST_CARD_ID_SERIAL_PATTERN = /^c([0-9]{4})-(?:MR|SSR)$/;
var ASST_CARD_NAME_MAX_LENGTH = 100;
function asstSourceUrls_() { return { cards: RAW_BASE + 'assist-cards.json', effects: RAW_BASE + 'assist-effects.json', abilities: RAW_BASE + 'assist-abilities.json' }; }

function asstAcquireScriptLock_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1)) {
    throw new Error('他の保存・公開処理と重なりました。再読み込みしてからやり直してください。');
  }
  return lock;
}

function asstReleaseScriptLock_(lock) {
  if (lock) lock.releaseLock();
}

function asstReserveOcrDailyUsage_() {
  var limit = positiveIntProp_('OCR_DAILY_LIMIT');
  var lock = asstAcquireScriptLock_();
  try {
    var properties = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var usage = {};
    try { usage = JSON.parse(asstText_(properties.getProperty('OCR_DAILY_USAGE')) || '{}'); }
    catch (error) { usage = {}; }
    var count = usage.date === today && Number.isFinite(Number(usage.count)) ? Number(usage.count) : 0;
    if (count >= limit) {
      throw new Error('本日のOCR上限（' + limit + '件）に達しました。翌日まで待つか、管理者がOCR_DAILY_LIMITを見直してください。');
    }
    count += 1;
    properties.setProperty('OCR_DAILY_USAGE', JSON.stringify({ date: today, count: count }));
    return { date: today, count: count, limit: limit, remaining: limit - count };
  } finally {
    asstReleaseScriptLock_(lock);
  }
}

function asstText_(value) {
  return value === null || value === undefined ? '' : String(value);
}

function asstDateCell_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy/MM/dd');
  }
  return asstText_(value) || null;
}

function asstHasNonNullValue_(value) {
  return value !== null && typeof value === 'object' && Object.keys(value).some(function (key) {
    return value[key] !== null;
  });
}

function asstJsonCell_(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function asstParseJsonCell_(value, fallback, label) {
  if (value === '' || value === null || value === undefined) return fallback;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(label + ' のJSONが不正です。');
  }
}

function asstInteger_(value, label, allowNull) {
  if (allowNull && (value === '' || value === null || value === undefined)) return null;
  var number = Number(value);
  if (!Number.isInteger(number)) throw new Error(label + ' は整数で入力してください。');
  return number;
}

function asstLegacyId_(value, label) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(label + ' は正の整数または空欄です。暗黙の数値変換は行いません。');
  }
  return value;
}

function asstAbilityIdNumber_(value, label) {
  if (typeof value !== 'string' || !/^ab-([0-9]{4,})$/.test(value)) {
    throw new Error(label + ' はab-####形式です。');
  }
  var number = Number(value.slice(3));
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(label + ' の番号部は正の安全な整数です。');
  return number;
}

function asstAssertAbilityIdAvailable_(abilityId, abilityRows, externalRefRows) {
  asstAbilityIdNumber_(abilityId, 'abilityId');
  var used = (abilityRows || []).some(function (row) { return row.abilityId === abilityId; });
  var reserved = (externalRefRows || []).some(function (row) { return asstText_(row.abilityId) === abilityId; });
  if (used || reserved) throw new Error('abilityIdが既存または予約済みIDと衝突しています: ' + abilityId);
}

// 将来の追加専用APIがScriptLockを取得した後、abilitiesと外部参照を再読込してから呼ぶ。
// この関数自身はロックも外部IDも日時も乱数も使わず、現在の最大ローカル番号+1だけを返す。
function asstNextAbilityId_(abilityRows, externalRefRows) {
  var max = 0;
  var seenAbilityIds = {};
  var seenReservedIds = {};
  (abilityRows || []).forEach(function (row) {
    var id = asstText_(row.abilityId);
    var number = asstAbilityIdNumber_(id, 'abilities/abilityId');
    if (seenAbilityIds[id]) throw new Error('abilities内のabilityIdが重複しています: ' + id);
    seenAbilityIds[id] = true;
    if (number > max) max = number;
  });
  (externalRefRows || []).forEach(function (row) {
    var id = asstText_(row.abilityId);
    if (!id) return;
    var number = asstAbilityIdNumber_(id, 'ability_external_refs/abilityId');
    if (seenReservedIds[id]) throw new Error('ability_external_refs内の予約済みabilityIdが重複しています: ' + id);
    seenReservedIds[id] = true;
    if (number > max) max = number;
  });
  if (max >= Number.MAX_SAFE_INTEGER) throw new Error('abilityIdを安全に採番できません。');
  var next = 'ab-' + String(max + 1).padStart(4, '0');
  asstAssertAbilityIdAvailable_(next, abilityRows, externalRefRows);
  return next;
}

function asstInList_(value, allowed, label, allowBlank) {
  if (allowBlank && (value === '' || value === null || value === undefined)) return null;
  if (allowed.indexOf(value) < 0) throw new Error(label + ' が許可値ではありません: ' + value);
  return value;
}

function asstCreateCardPayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payloadはオブジェクトです。');
  var allowed = ['name','rarity','aura','cardType','monType'];
  Object.keys(payload).forEach(function (key) {
    if (allowed.indexOf(key) < 0) throw new Error('未対応のpayload項目です: ' + key);
  });
  var rawName = typeof payload.name === 'string' ? payload.name : '';
  if (/[\u0000-\u001f\u007f-\u009f]/.test(rawName)) throw new Error('カード名に改行・タブ・制御文字は使えません。');
  var name = rawName.trim();
  if (!name) throw new Error('カード名は必須です。');
  if (name.length > ASST_CARD_NAME_MAX_LENGTH) throw new Error('カード名は' + ASST_CARD_NAME_MAX_LENGTH + '文字以下です。');
  var rarity = asstInList_(payload.rarity, ASST_RARITIES, 'rarity', false);
  var aura = asstInList_(payload.aura, ASST_AURAS, 'aura', false);
  var cardType = asstInList_(payload.cardType, ASST_CARD_TYPES, 'cardType', false);
  var monType = asstInList_(payload.monType, ASST_MON_TYPES, 'monType', true);
  // cardIdは管理者入力を受け取らない。lock取得後にasstNextCardId_()がシートから採番する。
  return { name: name, rarity: rarity, aura: aura, cardType: cardType, monType: monType };
}

// 新形式cardIdはc<4桁連番>-<レアリティ>。旧形式は3セグメントなので衝突しない。
function asstNextCardId_(rows, rarity) {
  var max = 0;
  rows.forEach(function (row) {
    var match = asstText_(row.cardId).match(ASST_CARD_ID_SERIAL_PATTERN);
    if (!match) return;
    var serial = Number(match[1]);
    if (Number.isSafeInteger(serial) && serial > max) max = serial;
  });
  var next = max + 1;
  if (next > 9999) throw new Error('cardIdの連番が4桁の上限に達しました。桁数の拡張を検討してください。');
  return 'c' + ('000' + next).slice(-4) + '-' + rarity;
}

function asstValidateCardSourceOrders_(rows) {
  var seen = {}, max = 0;
  rows.forEach(function (row) {
    var order = Number(row.sourceOrder);
    if (!Number.isSafeInteger(order) || order <= 0) throw new Error('cards/sourceOrderは重複のない正の整数です。');
    if (seen[order]) throw new Error('cards/sourceOrderが重複しています: ' + order);
    seen[order] = true;
    if (order > max) max = order;
  });
  if (max >= Number.MAX_SAFE_INTEGER) throw new Error('sourceOrderを安全に採番できません。');
  return max;
}

function asstAssertNewCardAvailable_(card, rows) {
  if (rows.some(function (row) { return asstText_(row.cardId) === card.cardId; })) {
    throw new Error('cardIdが既存カードと重複しています: ' + card.cardId);
  }
  if (rows.some(function (row) {
    return asstText_(row.name).trim() === card.name && asstText_(row.rarity) === card.rarity;
  })) {
    throw new Error('同じカード名とレアリティのカードが既にあります: ' + card.name + ' / ' + card.rarity);
  }
}

function asstCardCreateRow_(card, sourceOrder, updatedAt, updatedBy) {
  var row = {
    sourceOrder: sourceOrder, cardId: card.cardId, name: card.name, rarity: card.rarity,
    aura: card.aura, cardType: card.cardType, monType: card.monType || '', image: '', event2: '',
    releasedAt: '', accessoryStatus: 'unknown', statsJson: asstJsonCell_([]), limitBreakJson: asstJsonCell_(null),
    ratingsJson: asstJsonCell_(null), explanation: '', formationsJson: asstJsonCell_([]),
    sapoRefJson: asstJsonCell_(null), version: 1, updatedAt: updatedAt, updatedBy: updatedBy
  };
  return ASST_HEADERS[ASST_SHEET_CARDS].map(function (header) { return row[header]; });
}

function asstVerifyCreatedCard_(cardId, sourceOrder, expectedValues) {
  var matches = asstRows_(ASST_SHEET_CARDS).filter(function (row) { return asstText_(row.cardId) === cardId; });
  if (matches.length !== 1) throw new Error('保存後のcardId件数が1件ではありません: ' + matches.length);
  if (Number(matches[0].sourceOrder) !== sourceOrder) throw new Error('保存後のsourceOrderが予定値と一致しません。');
  var headers = ASST_HEADERS[ASST_SHEET_CARDS];
  headers.forEach(function (header, index) {
    if (matches[0][header] !== expectedValues[index]) throw new Error('保存後の内容が予定値と一致しません: ' + header);
  });
  return matches[0];
}

function asstValidateStringArray_(values, label, allowed) {
  if (!Array.isArray(values)) throw new Error(label + ' は配列です。');
  var seen = {};
  values.forEach(function (value) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' に空欄または文字列以外があります。');
    if (allowed && allowed.indexOf(value) < 0) throw new Error(label + ' が許可値ではありません: ' + value);
    if (seen[value]) throw new Error(label + ' が重複しています: ' + value);
    seen[value] = true;
  });
}

function asstValidateObjectKeys_(value, keys, label, allowNull, numbersOnly) {
  if (allowNull && value === null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' はオブジェクトです。');
  var actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some(function (key) { return actual.indexOf(key) < 0; })) {
    throw new Error(label + ' の項目が不正です。');
  }
  keys.forEach(function (key) {
    var item = value[key];
    if (item === null) return;
    if (numbersOnly && (typeof item !== 'number' || !isFinite(item))) throw new Error(label + '.' + key + ' は数値または空欄です。');
    if (!numbersOnly && typeof item !== 'string') throw new Error(label + '.' + key + ' は文字列または空欄です。');
  });
}

function asstValidateStatRows_(stats, label) {
  if (!Array.isArray(stats)) throw new Error(label + ' は配列です。');
  if (stats.length !== 0 && stats.length !== 3) throw new Error(label + ' は空または3件です。');
  var labels = {};
  stats.forEach(function (row) {
    if (!row || typeof row !== 'object' || !asstText_(row.label).trim() || !asstText_(row.value).trim()) {
      throw new Error(label + ' の項目名と値は両方必須です。');
    }
    if (!/^\+\d+(?:\.\d+)?%?$/.test(asstText_(row.value).trim())) {
      throw new Error(label + ' の値は +数値 または +数値% です: ' + row.value);
    }
    if (labels[row.label]) throw new Error(label + ' の項目名が重複しています: ' + row.label);
    labels[row.label] = true;
  });
}

function asstValidateRatings_(ratings, label) {
  asstValidateObjectKeys_(ratings, ASST_RATING_KEYS, label, true, true);
  if (ratings === null) return;
  ASST_RATING_KEYS.forEach(function (key) {
    var value = ratings[key];
    if (value !== null && (value < 0 || value > 5)) throw new Error(label + '.' + key + ' は0〜5です。');
  });
}

function asstEffectConditionalCell_(value, label) {
  if (value === '' || value === null || value === undefined || value === false) return 0;
  if (value === true) return 1;
  var number = Number(value);
  if (number !== 0 && number !== 1) throw new Error(label + ' は0か1です。');
  return number;
}

// 一致時限定効果は「0/1フラグ」と「条件（and/or + 条件種別）」の2値だけを保持する。
function asstNormalizeEffectConditions_(conditional, conditions, label) {
  var flag = asstEffectConditionalCell_(conditional, label + '/conditional');
  if (!flag) {
    if (conditions !== null && conditions !== undefined && conditions !== '') {
      throw new Error(label + ' はconditional=0なので条件を持てません。');
    }
    return { conditional: 0, conditions: null };
  }
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) {
    throw new Error(label + ' はconditional=1なので条件が必要です。');
  }
  var extra = Object.keys(conditions).filter(function (key) { return ['operator','types'].indexOf(key) < 0; });
  if (extra.length) throw new Error(label + ' の条件に未対応項目があります: ' + extra.join(', '));
  if (ASST_EFFECT_CONDITION_OPERATORS.indexOf(conditions.operator) < 0) {
    throw new Error(label + ' の条件の関係はandかorです。');
  }
  if (!Array.isArray(conditions.types) || !conditions.types.length) {
    throw new Error(label + ' の条件種別を1件以上選択してください。');
  }
  var types = [];
  conditions.types.forEach(function (type) {
    if (ASST_EFFECT_CONDITION_TYPES.indexOf(type) < 0) throw new Error(label + ' の条件種別が許可値ではありません: ' + type);
    if (types.indexOf(type) >= 0) throw new Error(label + ' の条件種別が重複しています: ' + type);
    types.push(type);
  });
  return { conditional: 1, conditions: { operator: conditions.operator, types: types } };
}

function asstValidateReleasedAt_(value, label) {
  if (value === null || value === undefined || value === '') return;
  value = asstText_(value);
  var match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) throw new Error(label + ' はYYYY/MM/DD形式です。');
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3])) {
    throw new Error(label + ' は実在する日付ではありません。');
  }
}

function asstImageFilename_(imagePath) {
  return asstText_(imagePath).replace(/^assist-cards\//, '');
}

function asstValidateDriveImageFile_(file, filename) {
  if (!/^[A-Za-z0-9._-]+\.(jpg|png|webp)$/i.test(filename)) {
    throw new Error('Driveのassist-cardsフォルダに規則外のファイルがあります: ' + filename);
  }
  var bytes = file.getBlob().getBytes();
  if (!bytes.length || bytes.length > ASST_IMAGE_MAX_BYTES) {
    throw new Error(filename + ' は空、または2MBを超えています。');
  }
  var extension = filename.split('.').pop().toLowerCase();
  var expectedMime = extension === 'jpg' ? 'image/jpeg' :
    (extension === 'png' ? 'image/png' : 'image/webp');
  if (!isExpectedImage_(bytes, expectedMime)) {
    throw new Error(filename + ' の拡張子と画像データが一致しません。');
  }
  return { file: file, bytes: bytes, mimeType: expectedMime };
}

function asstDriveImageByName_(filename) {
  var folder = asstImageFolder_(true);
  if (!folder) return null;
  var files = folder.getFilesByName(filename);
  var found = null;
  while (files.hasNext()) {
    var file = files.next();
    if (found) throw new Error(filename + ': 指定Driveに同名画像が複数あります。');
    found = asstValidateDriveImageFile_(file, filename);
  }
  return found;
}

function asstDriveImageInventory_(cards, allowMissingFolder) {
  var referenced = (cards || []).reduce(function (set, card) {
    var filename = asstImageFilename_(card.image);
    if (filename) set[filename] = true;
    return set;
  }, {});
  var result = { byName: {}, issues: [] };
  var folder;
  try { folder = asstImageFolder_(allowMissingFolder); }
  catch (error) { result.issues.push(error.message); return result; }
  if (!folder) return result;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var filename = file.getName();
    if (!/^[A-Za-z0-9._-]+\.(jpg|png|webp)$/i.test(filename)) {
      result.issues.push('Driveのassist-cardsフォルダに規則外のファイルがあります: ' + filename);
      continue;
    }
    if (!referenced[filename]) continue;
    if (result.byName[filename]) {
      result.issues.push(filename + ': 指定Driveに同名画像が複数あります。');
      continue;
    }
    try { result.byName[filename] = asstValidateDriveImageFile_(file, filename); }
    catch (error) { result.issues.push(error.message); }
  }
  return result;
}

function asstValidateImagePath_(card, checkExists, driveImages) {
  var imagePath = asstText_(card.image).trim();
  if (!imagePath) throw new Error(card.cardId + ': image空欄');
  var expected = new RegExp('^assist-cards/' + card.cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.(?:jpg|jpeg|png|webp)$', 'i');
  if (!expected.test(imagePath)) throw new Error(card.cardId + ': imageはcardIdと一致するassist-cards配下の画像パス必須');
  if (!checkExists) return;
  var filename = asstImageFilename_(imagePath);
  var driveImage = driveImages ? driveImages[filename] : asstDriveImageByName_(filename);
  if (driveImage) return;
  var response = UrlFetchApp.fetch(ASST_RAW_REPO_BASE + imagePath, { muteHttpExceptions: true, headers: { Range: 'bytes=0-0' } });
  if ([200, 206].indexOf(response.getResponseCode()) < 0) {
    throw new Error(card.cardId + ': imageがmainまたは指定Driveに存在しません（main HTTP ' + response.getResponseCode() + '）');
  }
}

function asstValidateImageFiles_(cards, driveImages) {
  var validCards = cards.filter(function (card) {
    try { asstValidateImagePath_(card, false); return true; } catch (error) { return false; }
  });
  var mainCards = validCards.filter(function (card) {
    return !driveImages || !driveImages[asstImageFilename_(card.image)];
  });
  if (!mainCards.length) return [];
  var responses = UrlFetchApp.fetchAll(mainCards.map(function (card) {
    return { url: ASST_RAW_REPO_BASE + card.image, muteHttpExceptions: true, headers: { Range: 'bytes=0-0' } };
  }));
  return responses.reduce(function (issues, response, index) {
    if ([200, 206].indexOf(response.getResponseCode()) < 0) {
      issues.push(mainCards[index].cardId + ': imageがmainまたは指定Driveに存在しません（main HTTP ' + response.getResponseCode() + '）');
    }
    return issues;
  }, []);
}

function asstSheet_(name) {
  var sheet = book_().getSheetByName(name);
  if (!sheet) throw new Error(name + ' シートがありません。setup1_createSheets を実行してください。');
  return sheet;
}

function asstRows_(name) {
  var sheet = asstSheet_(name);
  if (sheet.getLastRow() < 2) return [];
  var headers = ASST_HEADERS[name];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map(function (row, index) {
    var item = { _row: index + 2 };
    headers.forEach(function (header, column) { item[header] = row[column]; });
    return item;
  });
}

function asstAppendLog_(user, action, result, detail) {
  asstSheet_(ASST_SHEET_LOG).appendRow([
    nowIso_(), user && user.nickname ? user.nickname : '', action, result, asstText_(detail).slice(0, 5000)
  ]);
}

function asstSha256_(text) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (value) {
    var unsigned = value < 0 ? value + 256 : value;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

function asstSha256Bytes_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function (value) {
    var unsigned = value < 0 ? value + 256 : value;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

function asstRequireUser_() { return requireScope_('assist'); }

function asstAuditPayload_(payload) {
  if (payload === undefined) payload = {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payloadはオブジェクトです。');
  var allowed = ['externalSha','page','pageSize'];
  Object.keys(payload).forEach(function (key) {
    if (allowed.indexOf(key) < 0) throw new Error('未対応のpayload項目です: ' + key);
  });
  if (payload.externalSha !== undefined && !asstIsSha_(payload.externalSha, 40)) {
    throw new Error('externalShaは40桁の小文字コミットSHAです。');
  }
  function pageInteger_(value, fallback, label, max) {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || (max && value > max)) {
      throw new Error(label + (max ? 'は1〜' + max + 'の整数です。' : 'は1以上の整数です。'));
    }
    return value;
  }
  return {
    externalSha: payload.externalSha || null,
    page: pageInteger_(payload.page, 1, 'page'),
    pageSize: pageInteger_(payload.pageSize, 50, 'pageSize', 50)
  };
}

function asstAuditFetchBytes_(url, label, maxBytes) {
  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: false,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'line-monster-farm-lmfdb-audit/1.0'
    }
  });
  var status = response.getResponseCode();
  if (status !== 200) throw new Error(label + ': HTTP ' + status);
  var bytes = response.getBlob().getBytes();
  if (!bytes.length) throw new Error(label + ': 空レスポンスです。');
  if (bytes.length > maxBytes) throw new Error(label + ': JSONサイズが上限を超えています。');
  return { bytes: bytes, text: response.getContentText('UTF-8').replace(/^\uFEFF/, '') };
}

function asstAuditParseJson_(text, label) {
  try { return JSON.parse(text); }
  catch (error) { throw new Error(label + ': JSONとして解析できません。'); }
}

function asstAuditResolveExternalSha_(specifiedSha) {
  if (specifiedSha) return specifiedSha;
  var resolved = asstAuditFetchBytes_(ASST_LMFDB_MAIN_REF_URL, 'lMfDB main解決', 256 * 1024);
  var document = asstAuditParseJson_(resolved.text, 'lMfDB main解決');
  var sha = document && document.object && document.object.sha;
  if (!asstIsSha_(sha, 40)) throw new Error('lMfDB mainを完全なコミットSHAへ解決できません。');
  return sha;
}

function asstAuditExternal_(externalSha) {
  if (!asstIsSha_(externalSha, 40)) throw new Error('検証済みのexternalShaが必要です。');
  var url = ASST_LMFDB_RAW_BASE + externalSha + ASST_LMFDB_RAW_PATH;
  var fetched = asstAuditFetchBytes_(url, 'lMfDB abilities.json', ASST_LMFDB_MAX_BYTES);
  return {
    document: asstAuditParseJson_(fetched.text, 'lMfDB abilities.json'),
    sha256: asstSha256Bytes_(fetched.bytes)
  };
}

function asstAuditDangerousStrings_(value, location, found) {
  location = location || '$';
  found = found || [];
  if (typeof value === 'string' && /<\/?script\b|javascript\s*:|on(?:error|load)\s*=/i.test(value)) found.push(location);
  if (Array.isArray(value)) value.forEach(function (item, index) {
    asstAuditDangerousStrings_(item, location + '[' + index + ']', found);
  });
  if (value && typeof value === 'object' && !Array.isArray(value)) Object.keys(value).forEach(function (key) {
    asstAuditDangerousStrings_(value[key], location + '.' + key, found);
  });
  return found;
}

function asstAuditValidateExternal_(document) {
  var errors = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) errors.push('ルートがオブジェクトではありません');
  if (!document || document.schemaVersion !== 1) errors.push('schemaVersionが1ではありません');
  if (!document || document.generatedFrom !== 'ux/index.html') errors.push('generatedFromがux/index.htmlではありません');
  var abilities = document && Array.isArray(document.abilities) ? document.abilities : [];
  if (!document || !Array.isArray(document.abilities)) errors.push('abilitiesが配列ではありません');
  if (!document || !document.counts || document.counts.abilities !== abilities.length) errors.push('counts.abilitiesとabilities.lengthが一致しません');
  var ids = new Map();
  abilities.forEach(function (ability, index) {
    var prefix = 'abilities[' + index + ']';
    if (!ability || typeof ability !== 'object' || Array.isArray(ability)) {
      errors.push(prefix + 'がオブジェクトではありません'); return;
    }
    ASST_LMFDB_REQUIRED_FIELDS.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(ability, field)) errors.push(prefix + '.' + field + 'がありません');
    });
    if (typeof ability.id !== 'number' || !Number.isInteger(ability.id) || ability.id <= 0) errors.push(prefix + '.idが正の整数ではありません');
    else if (ids.has(ability.id)) errors.push('idが重複しています: ' + ability.id);
    else ids.set(ability.id, true);
    ['name','desc','card','source','rarity'].forEach(function (field) {
      if (typeof ability[field] !== 'string') errors.push(prefix + '.' + field + 'が文字列ではありません');
    });
    try { asstValidateStringArray_(ability.tags, prefix + '.tags'); }
    catch (error) { errors.push(error.message); }
    if (typeof ability.source === 'string' && ASST_ABILITY_SOURCES.indexOf(ability.source) < 0) errors.push(prefix + '.sourceが許可値ではありません');
    if (typeof ability.rarity === 'string' && ASST_ABILITY_RARITIES.indexOf(ability.rarity) < 0) errors.push(prefix + '.rarityが許可値ではありません');
  });
  var dangerous = asstAuditDangerousStrings_(document);
  if (dangerous.length) errors.push('危険なHTML・script相当文字列を検出しました: ' + dangerous.slice(0, 10).join(','));
  return errors;
}

function asstAuditReadLocal_() {
  var book = book_();
  var names = [ASST_SHEET_CARDS, ASST_SHEET_ABILITIES, ASST_SHEET_ABILITY_EXTERNAL_REFS];
  var result = {};
  names.forEach(function (name) {
    var sheet = book.getSheetByName(name);
    if (!sheet) throw new Error(name + ' シートがありません。自動作成・修復せず監査を停止します。');
    var values = sheet.getDataRange().getValues();
    var expected = ASST_HEADERS[name];
    var actual = values.length ? values[0].map(asstText_) : [];
    if (actual.join('\n') !== expected.join('\n')) throw new Error(name + ' シートのヘッダーが一致しません。自動修復しません。');
    result[name] = values.slice(1).filter(function (row) {
      return row.some(function (value) { return value !== '' && value !== null; });
    }).map(function (row) {
      var item = {};
      expected.forEach(function (header, index) { item[header] = row[index]; });
      return item;
    });
  });
  return { cards: result[ASST_SHEET_CARDS], abilities: result[ASST_SHEET_ABILITIES], refs: result[ASST_SHEET_ABILITY_EXTERNAL_REFS] };
}

function asstAuditComparableFromExternal_(ability) {
  return { sourceName: ability.card, name: ability.name, description: ability.desc, source: ability.source, rarity: ability.rarity, tags: ability.tags };
}

function asstAuditComparableFromLocal_(ability) {
  return { sourceName: ability.sourceName, name: ability.name, description: ability.description, source: ability.source, rarity: ability.rarity, tags: ability.tags };
}

function asstAuditNormalizeComparable_(value) {
  var normalized = {};
  ASST_LMFDB_COMPARABLE_FIELDS.forEach(function (field) {
    normalized[field] = Array.isArray(value[field])
      ? value[field].map(function (item) { return typeof item === 'string' ? item.normalize('NFKC') : item; })
      : typeof value[field] === 'string' ? value[field].normalize('NFKC') : value[field];
  });
  return normalized;
}

function asstAuditComparableKey_(value) { return JSON.stringify(value); }

function asstAuditChangedFields_(localValue, externalValue, normalized) {
  var left = normalized ? asstAuditNormalizeComparable_(localValue) : localValue;
  var right = normalized ? asstAuditNormalizeComparable_(externalValue) : externalValue;
  return ASST_LMFDB_COMPARABLE_FIELDS.filter(function (field) {
    return JSON.stringify(left[field]) !== JSON.stringify(right[field]);
  });
}

function asstAuditIdReuse_(changedFields) {
  var changed = new Map(changedFields.map(function (field) { return [field, true]; }));
  var limited = changedFields.every(function (field) { return ['name','description','rarity'].indexOf(field) >= 0; });
  var identityAll = ['sourceName','name','source','rarity'].every(function (field) { return changed.has(field); });
  var contextCount = ['sourceName','source','rarity'].filter(function (field) { return changed.has(field); }).length;
  var contentCount = ['name','description','tags'].filter(function (field) { return changed.has(field); }).length;
  return identityAll || (changedFields.length >= 3 && !limited) || (contextCount >= 2 && contentCount >= 2);
}

function asstAuditFingerprint_(external) {
  var snapshot = { id: external.id, card: external.card, name: external.name, desc: external.desc, source: external.source, rarity: external.rarity, tags: external.tags };
  var comparable = asstAuditComparableFromExternal_(external);
  var externalFingerprint = asstSha256_(JSON.stringify(comparable));
  var comparisonFingerprint = asstSha256_(JSON.stringify(asstAuditNormalizeComparable_(comparable)));
  return {
    snapshot: snapshot,
    externalFingerprint: externalFingerprint,
    comparisonFingerprint: comparisonFingerprint,
    candidateKey: asstSha256_(ASST_LMFDB_PROVIDER + '\n' + external.id + '\n' + externalFingerprint)
  };
}

function asstAuditExpectedAbilitiesVersion_(rows) {
  var values = rows.map(function (row) {
    var updatedAt = row.updatedAt;
    if (Object.prototype.toString.call(updatedAt) === '[object Date]' && !isNaN(updatedAt.getTime())) {
      updatedAt = Utilities.formatDate(updatedAt, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
    } else updatedAt = asstText_(updatedAt);
    return { abilityId: asstText_(row.abilityId), version: row.version, updatedAt: updatedAt };
  }).sort(function (left, right) { return left.abilityId < right.abilityId ? -1 : left.abilityId > right.abilityId ? 1 : 0; });
  return asstSha256_(JSON.stringify(values));
}

// 対応表はcardsシートの射影であり、固定hashで凍結しない。
// カード追加のたびに手作業更新するとCMS公開が止まるため、毎回cardsから作り直す。
// 同じ規則でbuild.jsがsrc/data/lmfdb-card-map.jsonを生成し、cardMapSha256で照合できる。
function asstAuditCardMap_(cardRows) {
  var mappings = cardRows.slice().sort(function (left, right) { return Number(left.sourceOrder) - Number(right.sourceOrder); }).map(function (row) {
    return { sourceName: asstText_(row.name), rarity: asstText_(row.rarity), cardId: asstText_(row.cardId) };
  });
  var map = new Map();
  mappings.forEach(function (mapping) {
    if (!mapping.sourceName || !mapping.rarity || !mapping.cardId) {
      throw new Error('cardsのname / rarity / cardIdが空です。対応表を作れません。');
    }
    var key = JSON.stringify([mapping.sourceName, mapping.rarity]);
    if (map.has(key)) throw new Error('cardsのname + rarityが重複しています。対応表を作れません。');
    map.set(key, mapping.cardId);
  });
  return { map: map, sha256: asstSha256_(JSON.stringify(mappings)) };
}

function asstAuditHistoryMap_(refRows) {
  var issues = asstValidateExternalRefRows_(refRows);
  if (issues.length) throw new Error('ability_external_refsの行が不正です: ' + issues.slice(0, 10).join(' / '));
  var map = new Map();
  refRows.forEach(function (row) { map.set(row.candidateKey, asstExternalRefFromRow_(row)); });
  return map;
}

function asstAuditLocalAbilities_(rows) {
  var abilities = [];
  var abilityIds = new Map();
  var legacyIds = new Map();
  rows.forEach(function (row) {
    var ability = asstAbilityFromRow_(row);
    var issues = asstValidateAbilityRecord_(ability, false);
    if (issues.length) throw new Error(issues.join(' / '));
    if (abilityIds.has(ability.abilityId)) throw new Error('abilitiesのabilityIdが重複しています: ' + ability.abilityId);
    abilityIds.set(ability.abilityId, true);
    if (ability.legacyId !== null) {
      if (legacyIds.has(ability.legacyId)) throw new Error('abilitiesのlegacyIdが重複しています: ' + ability.legacyId);
      legacyIds.set(ability.legacyId, true);
    }
    abilities.push(ability);
  });
  return abilities;
}

function asstAuditCandidateBase_(external, fingerprint, history) {
  var disposition = history ? history.disposition : null;
  return {
    externalNumericId: external.id,
    candidateKey: fingerprint.candidateKey,
    externalFingerprint: fingerprint.externalFingerprint,
    comparisonFingerprint: fingerprint.comparisonFingerprint,
    externalSnapshot: fingerprint.snapshot,
    exactMatchAbilityIds: [],
    nfkcMatchAbilityIds: [],
    sameIdComparison: null,
    cardIdCandidate: null,
    disposition: disposition,
    processed: ASST_LMFDB_PROCESSED_DISPOSITIONS.indexOf(disposition) >= 0,
    registrationEligible: false,
    requiresIdReuseConfirmation: false,
    auditOnly: true
  };
}

function asstAuditPriority_(classification) {
  return {
    card_match_candidate: 1, unlinked_candidate: 2, ID_REUSE_SUSPECTED: 3,
    existingContentDifferences: 4, representationOnly: 5,
    duplicate_local_content_match: 6, missing_upstream_observation: 7
  }[classification] || 99;
}

function asstAuditCounts_(externalCount, localCount) {
  return {
    external: externalCount, local: localCount, newCandidates: 0, knownExact: 0,
    representationOnly: 0, existingContentDifferences: 0, idReuseSuspected: 0,
    missingUpstreamObservations: 0, cardMatchCandidates: 0, unlinkedCandidates: 0,
    duplicateLocalContentMatches: 0, processed: 0
  };
}

function asstAuditConsecutiveRanges_(ids) {
  var sorted = Array.from(new Set(ids)).sort(function (left, right) { return left - right; });
  var ranges = [];
  sorted.forEach(function (id) {
    var last = ranges[ranges.length - 1];
    if (last && id === last.end + 1) last.end = id;
    else ranges.push({ start: id, end: id });
  });
  return ranges;
}

function asstAuditAnalyze_(externalDocument, localRows, externalSha, externalSha256) {
  var validationErrors = asstAuditValidateExternal_(externalDocument);
  var externalAbilities = Array.isArray(externalDocument && externalDocument.abilities) ? externalDocument.abilities : [];
  var counts = asstAuditCounts_(externalAbilities.length, localRows.abilities.length);
  var expectedAbilitiesVersion = asstAuditExpectedAbilitiesVersion_(localRows.abilities);
  if (validationErrors.length) {
    return {
      auditStatus: 'FAIL', safetyVerdict: 'BLOCKED', blockReasons: ['AUDIT_INPUT_INVALID'],
      reviewReasons: [], counts: counts, warnings: [], candidates: [],
      validationErrors: validationErrors, expectedAbilitiesVersion: expectedAbilitiesVersion, cardMapSha256: null
    };
  }
  var localAbilities = asstAuditLocalAbilities_(localRows.abilities);
  var history = asstAuditHistoryMap_(localRows.refs);
  var cardMap = asstAuditCardMap_(localRows.cards);
  var localByLegacyId = new Map();
  var exactIndex = new Map();
  var normalizedIndex = new Map();
  function addIndex_(map, key, ability) {
    var values = map.get(key) || []; values.push(ability); map.set(key, values);
  }
  localAbilities.forEach(function (ability) {
    if (ability.legacyId !== null) localByLegacyId.set(ability.legacyId, ability);
    var comparable = asstAuditComparableFromLocal_(ability);
    addIndex_(exactIndex, asstAuditComparableKey_(comparable), ability);
    addIndex_(normalizedIndex, asstAuditComparableKey_(asstAuditNormalizeComparable_(comparable)), ability);
  });
  var externalIds = new Map();
  var candidates = [];
  externalAbilities.forEach(function (external) {
    externalIds.set(external.id, true);
    var comparable = asstAuditComparableFromExternal_(external);
    var normalizedComparable = asstAuditNormalizeComparable_(comparable);
    var exactMatches = exactIndex.get(asstAuditComparableKey_(comparable)) || [];
    var normalizedMatches = normalizedIndex.get(asstAuditComparableKey_(normalizedComparable)) || [];
    var sameId = localByLegacyId.get(external.id) || null;
    var fingerprint = asstAuditFingerprint_(external);
    var candidate = asstAuditCandidateBase_(external, fingerprint, history.get(fingerprint.candidateKey) || null);
    candidate.exactMatchAbilityIds = exactMatches.map(function (item) { return item.abilityId; });
    candidate.nfkcMatchAbilityIds = normalizedMatches.map(function (item) { return item.abilityId; });
    if (sameId) {
      var sameComparable = asstAuditComparableFromLocal_(sameId);
      candidate.sameIdComparison = {
        abilityId: sameId.abilityId,
        changedFields: asstAuditChangedFields_(sameComparable, comparable, false),
        normalizedChangedFields: asstAuditChangedFields_(sameComparable, comparable, true),
        local: sameComparable,
        external: comparable
      };
    }
    if (exactMatches.length > 1 || normalizedMatches.length > 1) {
      candidate.classification = 'duplicate_local_content_match';
      candidate.priority = 'low';
      candidate.comparison = exactMatches.length > 1 ? 'exact' : 'normalized';
      counts.duplicateLocalContentMatches++;
      candidates.push(candidate); return;
    }
    if (sameId && candidate.sameIdComparison.normalizedChangedFields.length && asstAuditIdReuse_(candidate.sameIdComparison.normalizedChangedFields)) {
      candidate.classification = 'ID_REUSE_SUSPECTED'; candidate.priority = 'high';
      candidate.registrationEligible = !candidate.processed;
      candidate.requiresIdReuseConfirmation = true;
      candidate.auditOnly = false;
      counts.idReuseSuspected++; candidates.push(candidate); return;
    }
    if (exactMatches.length === 1) { counts.knownExact++; return; }
    if (normalizedMatches.length === 1) {
      candidate.classification = 'representationOnly'; candidate.priority = 'low';
      candidate.changedFields = asstAuditChangedFields_(asstAuditComparableFromLocal_(normalizedMatches[0]), comparable, false);
      counts.representationOnly++; candidates.push(candidate); return;
    }
    if (sameId) {
      candidate.classification = 'existingContentDifferences'; candidate.priority = 'medium';
      counts.existingContentDifferences++; candidates.push(candidate); return;
    }
    candidate.cardIdCandidate = cardMap.map.get(JSON.stringify([external.card, external.rarity])) || null;
    candidate.classification = candidate.cardIdCandidate ? 'card_match_candidate' : 'unlinked_candidate';
    candidate.priority = 'high';
    candidate.registrationEligible = !candidate.processed;
    candidate.auditOnly = false;
    counts.newCandidates++;
    if (candidate.cardIdCandidate) counts.cardMatchCandidates++; else counts.unlinkedCandidates++;
    candidates.push(candidate);
  });
  localAbilities.filter(function (ability) {
    return ability.legacyId !== null && !externalIds.has(ability.legacyId);
  }).forEach(function (ability) {
    counts.missingUpstreamObservations++;
    candidates.push({
      classification: 'missing_upstream_observation', priority: 'low', externalNumericId: ability.legacyId,
      candidateKey: null, externalFingerprint: null, comparisonFingerprint: null, externalSnapshot: null,
      exactMatchAbilityIds: [], nfkcMatchAbilityIds: [], sameIdComparison: null, cardIdCandidate: null,
      disposition: null, processed: false, registrationEligible: false, requiresIdReuseConfirmation: false, auditOnly: true,
      localObservation: { abilityId: ability.abilityId, name: ability.name, sourceName: ability.sourceName, linkStatus: ability.linkStatus, cardId: ability.cardId }
    });
  });
  counts.processed = candidates.filter(function (candidate) { return candidate.processed; }).length;
  var blockReasons = counts.idReuseSuspected ? ['ID_REUSE_SUSPECTED'] : [];
  var reviewReasons = [];
  if (counts.existingContentDifferences) reviewReasons.push('EXISTING_CONTENT_DIFFERENCES');
  if (counts.missingUpstreamObservations) reviewReasons.push('MISSING_UPSTREAM_OBSERVATIONS');
  var warnings = [];
  var reusedIds = new Map(candidates.filter(function (candidate) {
    return candidate.classification === 'ID_REUSE_SUSPECTED';
  }).map(function (candidate) { return [candidate.externalNumericId, true]; }));
  asstAuditConsecutiveRanges_(candidates.filter(function (candidate) {
    return candidate.classification === 'missing_upstream_observation';
  }).map(function (candidate) { return candidate.externalNumericId; })).forEach(function (range) {
    if (range.end > range.start && reusedIds.has(range.end + 1)) warnings.push({
      code: 'CONTIGUOUS_MISSING_IDS_WITH_REUSE_SUSPECTED',
      missing: range.start + '-' + range.end,
      reusedCandidate: range.end + 1
    });
  });
  candidates.forEach(function (candidate) { candidate.priorityOrder = asstAuditPriority_(candidate.classification); });
  candidates.sort(function (left, right) {
    return left.priorityOrder - right.priorityOrder || left.externalNumericId - right.externalNumericId ||
      asstText_(left.candidateKey || left.localObservation.abilityId).localeCompare(asstText_(right.candidateKey || right.localObservation.abilityId));
  });
  return {
    auditStatus: 'PASS', safetyVerdict: blockReasons.length ? 'BLOCKED' : reviewReasons.length ? 'REVIEW_REQUIRED' : 'SAFE',
    blockReasons: blockReasons, reviewReasons: reviewReasons, counts: counts, warnings: warnings,
    candidates: candidates, validationErrors: [], expectedAbilitiesVersion: expectedAbilitiesVersion,
    externalSha: externalSha, externalSha256: externalSha256, cardMapSha256: cardMap.sha256
  };
}

function api_asstAuditExternalAbilities(payload) {
  asstRequireUser_();
  var input = asstAuditPayload_(payload);
  var externalSha = asstAuditResolveExternalSha_(input.externalSha);
  var external = asstAuditExternal_(externalSha);
  var localRows;
  try { localRows = asstAuditReadLocal_(); }
  catch (error) {
    return {
      auditVersion: 3, provider: ASST_LMFDB_PROVIDER, externalSha: externalSha,
      externalSha256: external.sha256, expectedAbilitiesVersion: null,
      auditStatus: 'FAIL', safetyVerdict: 'BLOCKED', blockReasons: ['LOCAL_AUDIT_INPUT_INVALID'],
      reviewReasons: [], counts: asstAuditCounts_(external.document && Array.isArray(external.document.abilities) ? external.document.abilities.length : 0, 0),
      warnings: [], validationErrors: [error.message], candidates: [], cardMapSha256: null,
      pagination: { page: input.page, pageSize: input.pageSize, totalItems: 0, totalPages: 0 }
    };
  }
  var report;
  try { report = asstAuditAnalyze_(external.document, localRows, externalSha, external.sha256); }
  catch (error) {
    report = {
      auditStatus: 'FAIL', safetyVerdict: 'BLOCKED', blockReasons: ['LOCAL_AUDIT_INPUT_INVALID'],
      reviewReasons: [], counts: asstAuditCounts_(external.document.abilities.length, localRows.abilities.length),
      warnings: [], validationErrors: [error.message], candidates: [],
      expectedAbilitiesVersion: asstAuditExpectedAbilitiesVersion_(localRows.abilities), cardMapSha256: null
    };
  }
  var totalItems = report.candidates.length;
  var start = (input.page - 1) * input.pageSize;
  return {
    auditVersion: 3, provider: ASST_LMFDB_PROVIDER, externalSha: externalSha,
    externalSha256: external.sha256, expectedAbilitiesVersion: report.expectedAbilitiesVersion,
    auditStatus: report.auditStatus, safetyVerdict: report.safetyVerdict,
    blockReasons: report.blockReasons, reviewReasons: report.reviewReasons,
    counts: report.counts, warnings: report.warnings, validationErrors: report.validationErrors,
    cardMapSha256: report.cardMapSha256 || null,
    candidates: report.candidates.slice(start, start + input.pageSize),
    pagination: { page: input.page, pageSize: input.pageSize, totalItems: totalItems, totalPages: totalItems ? Math.ceil(totalItems / input.pageSize) : 0 }
  };
}

function asstCardFromRow_(row) {
  return {
    cardId: asstText_(row.cardId),
    name: asstText_(row.name),
    rarity: asstText_(row.rarity),
    aura: asstText_(row.aura),
    cardType: asstText_(row.cardType),
    monType: asstText_(row.monType) || null,
    image: asstText_(row.image),
    event2: asstText_(row.event2) || null,
    releasedAt: asstDateCell_(row.releasedAt),
    accessoryStatus: asstText_(row.accessoryStatus) || 'unknown',
    stats: asstParseJsonCell_(row.statsJson, [], row.cardId + '/statsJson'),
    limitBreak: asstParseJsonCell_(row.limitBreakJson, null, row.cardId + '/limitBreakJson'),
    ratings: asstParseJsonCell_(row.ratingsJson, {}, row.cardId + '/ratingsJson'),
    explanation: asstText_(row.explanation),
    formations: asstParseJsonCell_(row.formationsJson, [], row.cardId + '/formationsJson'),
    sapoRef: asstParseJsonCell_(row.sapoRefJson, null, row.cardId + '/sapoRefJson')
  };
}

function asstEffectFromRow_(row) {
  var activation = asstNormalizeEffectConditions_(
    row.conditional,
    asstParseJsonCell_(row.conditionsJson, null, row.effectId + '/conditionsJson'),
    asstText_(row.effectId)
  );
  return {
    effectId: asstText_(row.effectId),
    name: asstText_(row.name),
    description: asstText_(row.description),
    unlockRank: asstText_(row.unlockRank),
    sortOrder: asstInteger_(row.sortOrder, row.effectId + '/sortOrder', false),
    conditional: activation.conditional,
    conditions: activation.conditions
  };
}

function asstAbilityFromRow_(row) {
  return {
    abilityId: asstText_(row.abilityId),
    legacyId: asstLegacyId_(row.legacyId, row.abilityId + '/legacyId'),
    cardId: asstText_(row.cardId) || null,
    sourceName: asstText_(row.sourceName),
    name: asstText_(row.name),
    description: asstText_(row.description),
    source: asstText_(row.source),
    rarity: asstText_(row.rarity) || null,
    tags: asstParseJsonCell_(row.tagsJson, [], row.abilityId + '/tagsJson'),
    sortOrder: asstInteger_(row.sortOrder, row.abilityId + '/sortOrder', true),
    linkStatus: asstText_(row.linkStatus),
    flags: asstParseJsonCell_(row.flagsJson, [], row.abilityId + '/flagsJson'),
    status: asstText_(row.status)
  };
}

function asstAbilityToSheetRow_(ability, sourceOrder, version, updatedAt, updatedBy) {
  var row = {
    sourceOrder: sourceOrder,
    abilityId: ability.abilityId,
    legacyId: ability.legacyId === null ? '' : ability.legacyId,
    cardId: ability.cardId || '',
    sourceName: ability.sourceName,
    name: ability.name,
    description: ability.description,
    source: ability.source,
    rarity: ability.rarity || '',
    tagsJson: asstJsonCell_(ability.tags || []),
    sortOrder: ability.sortOrder === null ? '' : ability.sortOrder,
    linkStatus: ability.linkStatus,
    flagsJson: asstJsonCell_(ability.flags || []),
    status: ability.status,
    version: version,
    updatedAt: updatedAt,
    updatedBy: updatedBy
  };
  return ASST_HEADERS[ASST_SHEET_ABILITIES].map(function (header) { return row[header]; });
}

function asstExternalRefFromRow_(row) {
  return {
    provider: asstText_(row.provider),
    candidateKey: asstText_(row.candidateKey),
    externalNumericId: row.externalNumericId,
    firstSeenSha: asstText_(row.firstSeenSha),
    lastSeenSha: asstText_(row.lastSeenSha),
    externalFingerprint: asstText_(row.externalFingerprint),
    comparisonFingerprint: asstText_(row.comparisonFingerprint),
    externalSnapshot: asstParseJsonCell_(row.externalSnapshotJson, null, row.candidateKey + '/externalSnapshotJson'),
    disposition: asstText_(row.disposition),
    abilityId: asstText_(row.abilityId) || null,
    importedAt: asstText_(row.importedAt) || null,
    importedBy: asstText_(row.importedBy) || null,
    decidedAt: asstText_(row.decidedAt) || null,
    decidedBy: asstText_(row.decidedBy) || null,
    reviewFlags: asstParseJsonCell_(row.reviewFlagsJson, [], row.candidateKey + '/reviewFlagsJson'),
    note: asstText_(row.note),
    version: row.version
  };
}

function asstIsSha_(value, length) {
  return typeof value === 'string' && new RegExp('^[0-9a-f]{' + length + '}$').test(value);
}

function asstIsIsoTimestamp_(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !isNaN(Date.parse(value));
}

function asstValidateExternalRefRows_(rows) {
  var issues = [];
  var candidateKeys = {};
  (rows || []).forEach(function (row, index) {
    var label = 'ability_external_refs/' + (index + 2);
    ['provider','candidateKey','firstSeenSha','lastSeenSha','externalFingerprint','comparisonFingerprint',
      'externalSnapshotJson','disposition','importedAt','importedBy','reviewFlagsJson','note'].forEach(function (key) {
      if (typeof row[key] !== 'string' || (key !== 'note' && !row[key])) issues.push(label + ': ' + key + 'は文字列必須');
    });
    ['abilityId','decidedAt','decidedBy'].forEach(function (key) {
      if (row[key] !== '' && row[key] !== null && row[key] !== undefined && typeof row[key] !== 'string') {
        issues.push(label + ': ' + key + 'は文字列または空欄');
      }
    });
    var ref;
    try { ref = asstExternalRefFromRow_(row); }
    catch (error) { issues.push(label + ': ' + error.message); return; }
    if (ASST_EXTERNAL_REF_PROVIDERS.indexOf(ref.provider) < 0) issues.push(label + ': provider不正');
    if (!asstIsSha_(ref.candidateKey, 64)) issues.push(label + ': candidateKey不正');
    else if (candidateKeys[ref.candidateKey]) issues.push('candidateKey重複: ' + ref.candidateKey);
    candidateKeys[ref.candidateKey] = true;
    if (typeof ref.externalNumericId !== 'number' || !Number.isInteger(ref.externalNumericId) || ref.externalNumericId <= 0) {
      issues.push(label + ': externalNumericIdは正の整数');
    }
    if (!asstIsSha_(ref.firstSeenSha, 40) || !asstIsSha_(ref.lastSeenSha, 40)) issues.push(label + ': firstSeenSha/lastSeenSha不正');
    if (!asstIsSha_(ref.externalFingerprint, 64) || !asstIsSha_(ref.comparisonFingerprint, 64)) issues.push(label + ': fingerprint不正');
    if (ASST_EXTERNAL_REF_DISPOSITIONS.indexOf(ref.disposition) < 0) issues.push(label + ': disposition不正');
    if (ref.abilityId !== null) {
      try { asstAbilityIdNumber_(ref.abilityId, label + '/abilityId'); } catch (error) { issues.push(error.message); }
    }
    if ((ref.disposition === 'imported' || ref.disposition === 'reverted') && ref.abilityId === null) {
      issues.push(label + ': imported/revertedはabilityId必須');
    }
    if (!asstIsIsoTimestamp_(ref.importedAt) || !ref.importedBy) issues.push(label + ': importedAt/importedBy不正');
    if ((ref.decidedAt === null) !== (ref.decidedBy === null) || (ref.decidedAt !== null && !asstIsIsoTimestamp_(ref.decidedAt))) {
      issues.push(label + ': decidedAt/decidedBy不正');
    }
    if (typeof ref.version !== 'number' || !Number.isInteger(ref.version) || ref.version <= 0) issues.push(label + ': version不正');
    try { asstValidateStringArray_(ref.reviewFlags, label + '/reviewFlagsJson', ASST_EXTERNAL_REVIEW_FLAGS); }
    catch (error) { issues.push(error.message); }
    var snapshot = ref.externalSnapshot;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
        Object.keys(snapshot).join('\n') !== ASST_EXTERNAL_SNAPSHOT_KEYS.join('\n')) {
      issues.push(label + ': externalSnapshotJsonの列・順序不正');
    } else {
      var snapshotValuesValid = snapshot.id === ref.externalNumericId && typeof snapshot.id === 'number' &&
        !['card','name','desc','source','rarity'].some(function (key) { return typeof snapshot[key] !== 'string' || !snapshot[key]; });
      if (!snapshotValuesValid) {
        issues.push(label + ': externalSnapshotJsonの必須値不正');
      }
      if (ASST_ABILITY_SOURCES.indexOf(snapshot.source) < 0 || ASST_ABILITY_RARITIES.indexOf(snapshot.rarity) < 0) {
        issues.push(label + ': externalSnapshotJsonのsource/rarity不正');
      }
      try { asstValidateStringArray_(snapshot.tags, label + '/externalSnapshotJson.tags'); }
      catch (error) { issues.push(error.message); }
      if (snapshotValuesValid && Array.isArray(snapshot.tags) && snapshot.tags.every(function (tag) { return typeof tag === 'string' && tag; })) {
        var exactComparable = {
          sourceName: snapshot.card,
          name: snapshot.name,
          description: snapshot.desc,
          source: snapshot.source,
          rarity: snapshot.rarity,
          tags: snapshot.tags
        };
        var comparisonComparable = {
          sourceName: snapshot.card.normalize('NFKC'),
          name: snapshot.name.normalize('NFKC'),
          description: snapshot.desc.normalize('NFKC'),
          source: snapshot.source.normalize('NFKC'),
          rarity: snapshot.rarity.normalize('NFKC'),
          tags: snapshot.tags.map(function (tag) { return tag.normalize('NFKC'); })
        };
        if (asstSha256_(JSON.stringify(exactComparable)) !== ref.externalFingerprint ||
            asstSha256_(JSON.stringify(comparisonComparable)) !== ref.comparisonFingerprint) {
          issues.push(label + ': fingerprintがexternalSnapshotJsonと不一致');
        }
      }
    }
    if (asstIsSha_(ref.externalFingerprint, 64) && asstIsSha_(ref.candidateKey, 64) &&
        asstSha256_(ref.provider + '\n' + ref.externalNumericId + '\n' + ref.externalFingerprint) !== ref.candidateKey) {
      issues.push(label + ': candidateKeyがprovider/externalNumericId/externalFingerprintと不一致');
    }
  });
  return issues;
}

function asstValidateAbilityRecord_(ability, requireNewRarity) {
  var issues = [];
  try { asstAbilityIdNumber_(ability.abilityId, 'abilityId'); } catch (error) { issues.push(error.message); }
  try { asstLegacyId_(ability.legacyId, ability.abilityId + '/legacyId'); } catch (error) { issues.push(error.message); }
  if (ASST_ABILITY_SOURCES.indexOf(ability.source) < 0) issues.push(ability.abilityId + ': source不正');
  if (ability.rarity !== null && ASST_ABILITY_RARITIES.indexOf(ability.rarity) < 0) issues.push(ability.abilityId + ': rarity不正');
  if (requireNewRarity && ability.rarity === null) issues.push(ability.abilityId + ': 新規能力はrarity必須');
  return issues;
}

function asstBuildDocuments_() {
  var cardRows = asstRows_(ASST_SHEET_CARDS).sort(function (a, b) { return Number(a.sourceOrder) - Number(b.sourceOrder); });
  var cards = cardRows.map(asstCardFromRow_);
  var effectRows = asstRows_(ASST_SHEET_EFFECTS);
  var abilityRows = asstRows_(ASST_SHEET_ABILITIES).sort(function (a, b) { return Number(a.sourceOrder) - Number(b.sourceOrder); });

  var effectsByCard = {};
  cards.forEach(function (card) { effectsByCard[card.cardId] = { status: 'draft', effects: [] }; });
  effectRows.forEach(function (row) {
    if (!effectsByCard[row.cardId]) effectsByCard[row.cardId] = { status: 'draft', effects: [] };
    if (asstText_(row.effectId)) effectsByCard[row.cardId].effects.push(asstEffectFromRow_(row));
  });
  Object.keys(effectsByCard).forEach(function (cardId) {
    var group = effectsByCard[cardId];
    group.effects.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    group.status = group.effects.length ? 'verified' : 'draft';
  });

  var abilities = abilityRows.map(asstAbilityFromRow_);
  var cardCounts = {
    cards: cards.length,
    withStats: cards.filter(function (card) { return card.stats.length > 0; }).length,
    withExplanation: cards.filter(function (card) { return Boolean(card.explanation); }).length,
    withFormations: cards.filter(function (card) { return card.formations.length > 0; }).length
  };
  var effectValues = Object.keys(effectsByCard).map(function (cardId) { return effectsByCard[cardId]; });
  var abilityCounts = { abilities: abilities.length, resolved: 0, ambiguous: 0, unlinked: 0, duplicateCandidates: 0 };
  abilities.forEach(function (ability) {
    abilityCounts[ability.linkStatus]++;
    if (ability.flags.indexOf('duplicate-candidate') >= 0) abilityCounts.duplicateCandidates++;
  });

  return {
    cards: {
      schemaVersion: 3,
      generatedFrom: ['ライ徹CMS'],
      generatedAt: null,
      counts: cardCounts,
      cards: cards
    },
    effects: {
      schemaVersion: 1,
      generatedFrom: ['ライ徹CMS'],
      generatedAt: null,
      counts: {
        cards: effectValues.length,
        cardsWithEffects: effectValues.filter(function (group) { return group.effects.length > 0; }).length,
        cardsDraft: effectValues.filter(function (group) { return group.effects.length === 0; }).length,
        effects: effectValues.reduce(function (sum, group) { return sum + group.effects.length; }, 0)
      },
      cards: effectsByCard
    },
    abilities: {
      schemaVersion: 2,
      generatedFrom: ['ライ徹CMS'],
      generatedAt: null,
      counts: abilityCounts,
      abilities: abilities
    }
  };
}

function asstPublicPageAbilities_(abilities) {
  return (abilities || []).filter(function (ability) {
    return ability.linkStatus === 'resolved' && ability.status === 'verified';
  });
}

function asstValidateDocuments_(cardsDoc, effectsDoc, abilitiesDoc) {
  var issues = [];
  if (!cardsDoc || cardsDoc.schemaVersion !== 3 || !Array.isArray(cardsDoc.cards)) {
    return ['カードDBのschemaVersionまたはcardsが不正'];
  }
  if (!effectsDoc || effectsDoc.schemaVersion !== 1 || !effectsDoc.cards || Array.isArray(effectsDoc.cards)) {
    issues.push('効果DBのschemaVersionまたはcardsが不正');
  }
  if (!abilitiesDoc || abilitiesDoc.schemaVersion !== 2 || !Array.isArray(abilitiesDoc.abilities)) {
    issues.push('能力DBのschemaVersionまたはabilitiesが不正');
  }
  if (issues.length) return issues;

  var cardIds = {};
  cardsDoc.cards.forEach(function (card) {
    if (!card.cardId || cardIds[card.cardId]) issues.push('cardId重複または空欄: ' + card.cardId);
    cardIds[card.cardId] = true;
    if (card.cardId && !ASST_CARD_ID_PATTERN.test(card.cardId)) issues.push(card.cardId + ': cardId書式不正');
    if (!card.name) issues.push(card.cardId + ': name空欄');
    if (ASST_RARITIES.indexOf(card.rarity) < 0) issues.push(card.cardId + ': rarity不正');
    if (ASST_AURAS.indexOf(card.aura) < 0) issues.push(card.cardId + ': aura不正');
    if (ASST_CARD_TYPES.indexOf(card.cardType) < 0) issues.push(card.cardId + ': cardType不正');
    if (card.monType !== null && ASST_MON_TYPES.indexOf(card.monType) < 0) issues.push(card.cardId + ': monType不正');
    if (!Array.isArray(card.formations)) issues.push(card.cardId + ': formations不正');
    try { asstValidateImagePath_(card, false); } catch (error) { issues.push(error.message); }
    try { asstValidateReleasedAt_(card.releasedAt, card.cardId + '/releasedAt'); } catch (error) { issues.push(error.message); }
    try { asstValidateRatings_(card.ratings, card.cardId + '/ratings'); } catch (error) { issues.push(error.message); }
    try { asstInList_(card.accessoryStatus, ASST_ACCESSORY_STATUSES, card.cardId + '/accessoryStatus', false); } catch (error) { issues.push(error.message); }
    try { asstValidateStatRows_(card.stats, card.cardId + '/stats'); } catch (error) { issues.push(error.message); }
  });
  cardsDoc.cards.forEach(function (card) {
    if (!Array.isArray(card.formations)) return;
    card.formations.forEach(function (formation, index) {
      if (!formation || !asstText_(formation.title).trim()) issues.push(card.cardId + '/formation' + (index + 1) + ': 編成名空欄');
      if (!formation || !Array.isArray(formation.cards) || formation.cards.length !== 5) {
        issues.push(card.cardId + '/formation' + (index + 1) + ': カード枠は5件必須');
        return;
      }
      formation.cards.forEach(function (formationCardId) {
        if (formationCardId && !cardIds[formationCardId]) issues.push(card.cardId + ': 編成に未知cardId ' + formationCardId);
      });
      if (formation.rental && !cardIds[formation.rental]) issues.push(card.cardId + ': レンタルに未知cardId ' + formation.rental);
    });
  });

  var effectIds = {};
  Object.keys(effectsDoc.cards).forEach(function (cardId) {
    var group = effectsDoc.cards[cardId];
    if (!cardIds[cardId]) issues.push('効果DBに未知cardId: ' + cardId);
    if (!group || !Array.isArray(group.effects)) { issues.push(cardId + ': effects不正'); return; }
    if (group.effects.length === 0 && group.status !== 'draft') issues.push(cardId + ': 空effectsはdraft必須');
    if (group.effects.length > 0 && group.status !== 'verified') issues.push(cardId + ': 効果ありはverified必須');
    group.effects.forEach(function (effect, index) {
      if (!effect.effectId || effectIds[effect.effectId]) issues.push('effectId重複または空欄: ' + effect.effectId);
      effectIds[effect.effectId] = true;
      if (!effect.name || !effect.description) issues.push(effect.effectId + ': name/description空欄');
      if (ASST_UNLOCK_RANKS.indexOf(effect.unlockRank) < 0) issues.push(effect.effectId + ': unlockRank不正');
      if (effect.sortOrder !== index + 1) issues.push(effect.effectId + ': sortOrder不連続');
      try { asstNormalizeEffectConditions_(effect.conditional, effect.conditions, effect.effectId); }
      catch (error) { issues.push(error.message); }
    });
  });
  Object.keys(cardIds).forEach(function (cardId) {
    if (!effectsDoc.cards[cardId]) issues.push('効果DBにcardId欠落: ' + cardId);
  });

  var abilityIds = {};
  var legacyIds = {};
  var resolvedOrders = {};
  abilitiesDoc.abilities.forEach(function (ability) {
    if (!ability.abilityId || abilityIds[ability.abilityId]) issues.push('abilityId重複または空欄: ' + ability.abilityId);
    abilityIds[ability.abilityId] = true;
    asstValidateAbilityRecord_(ability, false).forEach(function (issue) { issues.push(issue); });
    if (ability.legacyId !== null) {
      if (legacyIds[ability.legacyId]) issues.push('legacyId重複: ' + ability.legacyId);
      legacyIds[ability.legacyId] = true;
    }
    if (!ability.sourceName || !ability.name || !ability.description) issues.push(ability.abilityId + ': 必須文字列空欄');
    if (ASST_LINK_STATUSES.indexOf(ability.linkStatus) < 0) issues.push(ability.abilityId + ': linkStatus不正');
    if (ASST_ABILITY_STATUSES.indexOf(ability.status) < 0) issues.push(ability.abilityId + ': status不正');
    if (!Array.isArray(ability.tags) || !Array.isArray(ability.flags)) issues.push(ability.abilityId + ': tags/flags不正');
    else {
      try { asstValidateStringArray_(ability.tags, ability.abilityId + '/tags'); } catch (error) { issues.push(error.message); }
      try { asstValidateStringArray_(ability.flags, ability.abilityId + '/flags'); } catch (error) { issues.push(error.message); }
    }
    if (ability.linkStatus === 'resolved') {
      if (!cardIds[ability.cardId]) issues.push(ability.abilityId + ': resolvedのcardId不正');
      if (!resolvedOrders[ability.cardId]) resolvedOrders[ability.cardId] = [];
      resolvedOrders[ability.cardId].push(ability.sortOrder);
    } else if (ability.cardId !== null || ability.sortOrder !== null) {
      issues.push(ability.abilityId + ': resolved以外はcardId/sortOrder null必須');
    }
  });
  Object.keys(resolvedOrders).forEach(function (cardId) {
    var sorted = resolvedOrders[cardId].slice().sort(function (a, b) { return a - b; });
    sorted.forEach(function (order, index) {
      if (order !== index + 1) issues.push(cardId + ': 能力sortOrder不連続');
    });
  });
  return issues;
}

function asstImageFolder_(allowMissing) {
  var folderId = optionalProp_('ASSIST_IMAGE_FOLDER_ID');
  if (!folderId) {
    if (allowMissing) return null;
    throw new Error('Script PropertiesのASSIST_IMAGE_FOLDER_IDが未設定です。');
  }
  var root = DriveApp.getFolderById(folderId);
  return root;
}

function api_asstBootstrap() {
  var user = asstRequireUser_();
  var cards = asstRows_(ASST_SHEET_CARDS).sort(function (a, b) { return Number(a.sourceOrder) - Number(b.sourceOrder); });
  var effectCounts = {};
  asstRows_(ASST_SHEET_EFFECTS).forEach(function (row) {
    if (row.effectId) effectCounts[row.cardId] = (effectCounts[row.cardId] || 0) + 1;
  });
  var abilityCounts = {};
  asstRows_(ASST_SHEET_ABILITIES).forEach(function (row) {
    if (row.cardId) abilityCounts[row.cardId] = (abilityCounts[row.cardId] || 0) + 1;
  });
  return {
    environment: env_(),
    user: user,
    ocr: { provider: 'google-cloud-vision', configured: Boolean(optionalProp_('GOOGLE_CLOUD_VISION_API_KEY')) },
    imageUpload: { configured: Boolean(optionalProp_('ASSIST_IMAGE_FOLDER_ID')) },
    cards: cards.map(function (row) {
      return {
        cardId: asstText_(row.cardId), name: asstText_(row.name), rarity: asstText_(row.rarity),
        aura: asstText_(row.aura), version: Number(row.version || 1),
        monType: asstText_(row.monType),
        effects: effectCounts[row.cardId] || 0, abilities: abilityCounts[row.cardId] || 0
      };
    })
  };
}

function api_asstUploadCardImage(payload) {
  var user = asstRequireUser_();
  payload = payload || {};
  var cardId = asstText_(payload.cardId).trim();
  var mimeType = asstText_(payload.mimeType).toLowerCase().trim();
  var extension = ASST_IMAGE_MIME_EXT[mimeType];
  if (!extension) throw new Error('対応形式はJPG・PNG・WebPの3種類です。');
  var base64 = asstText_(payload.base64).replace(/\s/g, '');
  var maxBase64Length = Math.ceil(ASST_IMAGE_MAX_BYTES / 3) * 4 + 4;
  if (!base64 || base64.length > maxBase64Length) throw new Error('画像は2MB以下にしてください。');
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('画像データが壊れています。');
  var bytes;
  try { bytes = Utilities.base64Decode(base64); }
  catch (error) { throw new Error('画像データを復号できません。'); }
  if (!bytes.length || bytes.length > ASST_IMAGE_MAX_BYTES) throw new Error('画像は2MB以下にしてください。');
  if (!isExpectedImage_(bytes, mimeType)) throw new Error('ファイルの内容と画像形式が一致しません。');

  var fileName = cardId + '.' + extension;
  var imagePath = 'assist-cards/' + fileName;
  var lock = asstAcquireScriptLock_();
  var newFile = null;
  var trashedFiles = [];
  try {
    var row = asstRows_(ASST_SHEET_CARDS).filter(function (item) { return item.cardId === cardId; })[0];
    if (!row) throw new Error('未知cardIdです。');
    var currentVersion = Number(row.version || 1);
    if (Number(payload.version) !== currentVersion) throw new Error('他の編集が保存済みです。読み込み直してください。');

    var folder = asstImageFolder_();
    newFile = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
    var sameId = new RegExp('^' + cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.[^.]+$', 'i');
    var files = folder.getFiles();
    while (files.hasNext()) {
      var oldFile = files.next();
      if (oldFile.getId() === newFile.getId() || !sameId.test(oldFile.getName())) continue;
      oldFile.setTrashed(true);
      trashedFiles.push(oldFile);
    }

    var values = ASST_HEADERS[ASST_SHEET_CARDS].map(function (header) { return row[header]; });
    var updatedAt = nowIso_();
    values[ASST_HEADERS[ASST_SHEET_CARDS].indexOf('image')] = imagePath;
    values[ASST_HEADERS[ASST_SHEET_CARDS].indexOf('version')] = currentVersion + 1;
    values[ASST_HEADERS[ASST_SHEET_CARDS].indexOf('updatedAt')] = updatedAt;
    values[ASST_HEADERS[ASST_SHEET_CARDS].indexOf('updatedBy')] = user.nickname;
    asstSheet_(ASST_SHEET_CARDS).getRange(row._row, 1, 1, values.length).setValues([values]);
    asstAppendLog_(user, 'upload-assist-image', 'PASS', cardId + ' / ' + fileName + ' / bytes=' + bytes.length);
    return { ok: true, cardId: cardId, image: imagePath, fileName: fileName, bytes: bytes.length, version: currentVersion + 1, updatedAt: updatedAt };
  } catch (error) {
    if (newFile) {
      try { newFile.setTrashed(true); } catch (ignoreNew) { /* 復旧は次回手動確認 */ }
    }
    trashedFiles.forEach(function (file) {
      try { file.setTrashed(false); } catch (ignoreOld) { /* 復旧は次回手動確認 */ }
    });
    throw error;
  } finally {
    asstReleaseScriptLock_(lock);
  }
}

function api_asstOcrEffectImage(payload) {
  var user = asstRequireUser_();
  payload = payload || {};
  var cardId = asstText_(payload.cardId).trim();
  var fileName = asstText_(payload.fileName).trim();
  var mimeType = asstText_(payload.mimeType).trim();
  var base64 = asstText_(payload.base64).replace(/\s/g, '');
  if (!asstRows_(ASST_SHEET_CARDS).some(function (row) { return row.cardId === cardId; })) throw new Error('未知cardIdです。');
  if (!fileName) throw new Error('画像ファイル名がありません。');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0) throw new Error('JPEG / PNG / WebPだけを選択してください。');
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('画像データが不正です。');
  if (Math.ceil(base64.length * 3 / 4) > 8 * 1024 * 1024) throw new Error('画像は1枚8MB以下にしてください。');
  var apiKey = optionalProp_('GOOGLE_CLOUD_VISION_API_KEY');
  if (!apiKey) throw new Error('Script PropertiesのGOOGLE_CLOUD_VISION_API_KEYが未設定です。');
  var request = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
      imageContext: { languageHints: ['ja'] }
    }]
  };
  var usage = asstReserveOcrDailyUsage_();
  var response = UrlFetchApp.fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(request),
    muteHttpExceptions: true
  });
  var body;
  try { body = JSON.parse(response.getContentText('UTF-8')); }
  catch (error) { throw new Error('OCR応答を解析できません（HTTP ' + response.getResponseCode() + '）。'); }
  if (response.getResponseCode() !== 200 || !body.responses || !body.responses[0]) {
    var message = body && body.error && body.error.message ? body.error.message : '応答が不正です。';
    asstAppendLog_(user, 'effect-ocr', 'FAIL', cardId + ' / ' + fileName + ' / HTTP ' + response.getResponseCode() + ' / daily=' + usage.count + '/' + usage.limit);
    throw new Error('Google Cloud Vision OCRに失敗しました: ' + message);
  }
  if (body.responses[0].error) throw new Error('Google Cloud Vision OCRに失敗しました: ' + body.responses[0].error.message);
  asstAppendLog_(user, 'effect-ocr', 'PASS', cardId + ' / ' + fileName + ' / daily=' + usage.count + '/' + usage.limit);
  return { fileName: fileName, vision: body, dailyUsage: usage };
}

function api_asstCreateCard(payload) {
  var user = asstRequireUser_();
  if (!asstText_(user.nickname).trim()) throw new Error('membersシートのニックネームが空です。');
  var card = asstCreateCardPayload_(payload);
  var lock = asstAcquireScriptLock_();
  var appendStarted = false;
  try {
    // lock取得後に再読込し、並行処理によるID・名前・sourceOrderの競合をここで確定する。
    var rows = asstRows_(ASST_SHEET_CARDS);
    var maxSourceOrder = asstValidateCardSourceOrders_(rows);
    card.cardId = asstNextCardId_(rows, card.rarity);
    asstAssertNewCardAvailable_(card, rows);
    var sourceOrder = maxSourceOrder + 1;
    var updatedAt = nowIso_();
    var values = asstCardCreateRow_(card, sourceOrder, updatedAt, user.nickname);
    var created = {
      cardId: card.cardId, name: card.name, rarity: card.rarity, aura: card.aura,
      effects: 0, abilities: 0, version: 1
    };

    appendStarted = true;
    asstSheet_(ASST_SHEET_CARDS).appendRow(values);
    asstVerifyCreatedCard_(card.cardId, sourceOrder, values);
    asstAppendLog_(user, 'create-card', 'PASS', card.cardId + ' sourceOrder=' + sourceOrder);
    return { ok: true, cardId: card.cardId, sourceOrder: sourceOrder, version: 1, card: created };
  } catch (error) {
    if (appendStarted) {
      throw new Error('新規カード行の追加処理は開始済みです。カードは登録済みとして扱い、再実行しないでください。' +
        'cardsシートでcardIdを確認し、必要ならassist_logを手動確認してください。詳細: ' + error.message);
    }
    throw error;
  } finally {
    asstReleaseScriptLock_(lock);
  }
}

function api_asstGetCard(cardId) {
  asstRequireUser_();
  cardId = asstText_(cardId);
  var row = asstRows_(ASST_SHEET_CARDS).filter(function (item) { return item.cardId === cardId; })[0];
  if (!row) throw new Error('カードが見つかりません: ' + cardId);
  var effects = asstRows_(ASST_SHEET_EFFECTS).filter(function (item) { return item.cardId === cardId && item.effectId; })
    .sort(function (a, b) { return Number(a.sortOrder) - Number(b.sortOrder); })
    .map(asstEffectFromRow_);
  var abilities = asstRows_(ASST_SHEET_ABILITIES).filter(function (item) { return item.cardId === cardId; })
    .sort(function (a, b) { return Number(a.sortOrder) - Number(b.sortOrder); })
    .map(asstAbilityFromRow_);
  return { card: asstCardFromRow_(row), version: Number(row.version || 1), effects: effects, abilities: abilities };
}

function api_asstSaveCard(payload) {
  var user = asstRequireUser_();
  payload = payload || {};
  var lock = asstAcquireScriptLock_();
  try {
    var rows = asstRows_(ASST_SHEET_CARDS);
    var row = rows.filter(function (item) { return item.cardId === asstText_(payload.cardId); })[0];
    if (!row) throw new Error('カードが見つかりません。');
    var currentVersion = Number(row.version || 1);
    if (Number(payload.version) !== currentVersion) throw new Error('他の編集が保存済みです。読み込み直してください。');

    var card = payload.card || {};
    var currentCard = asstCardFromRow_(row);
    if (asstText_(card.cardId) !== row.cardId) throw new Error('cardIdは変更できません。');
    if (!asstText_(card.name).trim()) throw new Error('カード名は必須です。');
    asstInList_(card.rarity, ASST_RARITIES, 'rarity', false);
    asstInList_(card.aura, ASST_AURAS, 'aura', false);
    asstInList_(card.cardType, ASST_CARD_TYPES, 'cardType', false);
    asstInList_(card.monType, ASST_MON_TYPES, 'monType', true);
    asstInList_(card.accessoryStatus, ASST_ACCESSORY_STATUSES, 'accessoryStatus', false);
    asstValidateImagePath_(card, true);
    asstValidateReleasedAt_(card.releasedAt, 'releasedAt');
    asstValidateRatings_(card.ratings, 'ratings');
    asstValidateStatRows_(card.stats, 'stats');
    if (!Array.isArray(card.formations)) throw new Error('formationsは配列です。');
    var cardIds = {};
    rows.forEach(function (item) { cardIds[item.cardId] = true; });
    card.formations.forEach(function (formation, index) {
      if (!formation || typeof formation !== 'object' || !asstText_(formation.title).trim()) throw new Error('編成 ' + (index + 1) + ' の編成名は必須です。');
      if (!Array.isArray(formation.cards) || formation.cards.length !== 5) throw new Error('編成 ' + (index + 1) + ' のカード枠は5件です。');
      formation.cards.forEach(function (cardId) {
        if (cardId && !cardIds[cardId]) throw new Error('編成に未知cardIdがあります: ' + cardId);
      });
      if (formation.rental && !cardIds[formation.rental]) throw new Error('レンタルに未知cardIdがあります: ' + formation.rental);
    });
    var values = ASST_HEADERS[ASST_SHEET_CARDS].map(function (header) { return row[header]; });
    var update = {
      name: asstText_(card.name), rarity: card.rarity, aura: card.aura, cardType: asstText_(card.cardType),
      monType: card.monType || '', image: asstText_(card.image), event2: card.event2 || '', releasedAt: card.releasedAt || '',
      accessoryStatus: card.accessoryStatus,
      statsJson: asstJsonCell_(card.stats), limitBreakJson: asstJsonCell_(currentCard.limitBreak),
      ratingsJson: asstJsonCell_(card.ratings), explanation: asstText_(card.explanation),
      formationsJson: asstJsonCell_(card.formations), sapoRefJson: asstJsonCell_(currentCard.sapoRef),
      version: currentVersion + 1, updatedAt: nowIso_(), updatedBy: user.nickname
    };
    Object.keys(update).forEach(function (key) { values[ASST_HEADERS[ASST_SHEET_CARDS].indexOf(key)] = update[key]; });
    asstSheet_(ASST_SHEET_CARDS).getRange(row._row, 1, 1, values.length).setValues([values]);
    asstAppendLog_(user, 'save-card', 'PASS', row.cardId + ' version=' + (currentVersion + 1));
    return { ok: true, version: currentVersion + 1 };
  } finally {
    asstReleaseScriptLock_(lock);
  }
}

function api_asstSaveEffects(payload) {
  var user = asstRequireUser_();
  payload = payload || {};
  var cardId = asstText_(payload.cardId);
  var effects = payload.effects;
  var lock = asstAcquireScriptLock_();
  try {
    if (!asstRows_(ASST_SHEET_CARDS).some(function (row) { return row.cardId === cardId; })) throw new Error('未知cardIdです。');
    if (!Array.isArray(effects)) throw new Error('effectsは配列です。');
    var group = { status: effects.length ? 'verified' : 'draft', effects: effects };
    var testDocs = asstBuildDocuments_();
    testDocs.effects.cards[cardId] = group;
    var issues = asstValidateDocuments_(testDocs.cards, testDocs.effects, testDocs.abilities)
      .filter(function (issue) { return issue.indexOf(cardId) >= 0 || effects.some(function (effect) { return issue.indexOf(effect.effectId) >= 0; }); });
    if (issues.length) throw new Error('効果検査FAIL: ' + issues.join(' / '));
    var oldRows = asstRows_(ASST_SHEET_EFFECTS).filter(function (row) { return row.cardId !== cardId; });
    var timestamp = nowIso_();
    var replacement = effects.length ? effects.map(function (effect) {
      var activation = asstNormalizeEffectConditions_(effect.conditional, effect.conditions, effect.effectId);
      return [cardId, effect.effectId, effect.name, effect.description,
        effect.unlockRank, effect.sortOrder, timestamp, user.nickname,
        activation.conditional, activation.conditions === null ? '' : asstJsonCell_(activation.conditions)];
    }) : [[cardId, '', '', '', '', '', timestamp, user.nickname, 0, '']];
    var preserved = oldRows.map(function (row) {
      return ASST_HEADERS[ASST_SHEET_EFFECTS].map(function (header) { return row[header]; });
    });
    asstRewriteSheet_(ASST_SHEET_EFFECTS, preserved.concat(replacement));
    asstAppendLog_(user, 'save-effects', 'PASS', cardId + ' effects=' + effects.length);
    return { ok: true, count: effects.length };
  } finally {
    asstReleaseScriptLock_(lock);
  }
}

function api_asstGetAbility(abilityId) {
  asstRequireUser_();
  var row = asstRows_(ASST_SHEET_ABILITIES).filter(function (item) { return item.abilityId === asstText_(abilityId); })[0];
  if (!row) throw new Error('能力が見つかりません。');
  return { ability: asstAbilityFromRow_(row), version: Number(row.version || 1) };
}

function api_asstSaveAbility(payload) {
  var user = asstRequireUser_();
  payload = payload || {};
  var ability = payload.ability || {};
  var lock = asstAcquireScriptLock_();
  try {
    var row = asstRows_(ASST_SHEET_ABILITIES).filter(function (item) { return item.abilityId === asstText_(ability.abilityId); })[0];
    if (!row) throw new Error('能力が見つかりません。');
    var currentVersion = Number(row.version || 1);
    if (Number(payload.version) !== currentVersion) throw new Error('他の編集が保存済みです。');
    if (asstLegacyId_(ability.legacyId, 'legacyId') !== asstLegacyId_(row.legacyId, '保存済みlegacyId')) throw new Error('legacyIdは変更できません。');
    asstInList_(ability.source, ASST_ABILITY_SOURCES, 'source', false);
    asstInList_(ability.rarity, ASST_ABILITY_RARITIES, 'rarity', true);
    asstInList_(ability.linkStatus, ASST_LINK_STATUSES, 'linkStatus', false);
    asstInList_(ability.status, ASST_ABILITY_STATUSES, 'status', false);
    if (!ability.sourceName || !ability.name || !ability.description) throw new Error('sourceName/name/descriptionは必須です。');
    asstValidateStringArray_(ability.tags, 'tags');
    if (ability.linkStatus === 'resolved') {
      if (!asstRows_(ASST_SHEET_CARDS).some(function (card) { return card.cardId === ability.cardId; })) throw new Error('resolvedのcardIdが不正です。');
      asstInteger_(ability.sortOrder, 'sortOrder', false);
    } else if (ability.cardId !== null || ability.sortOrder !== null) {
      throw new Error('resolved以外はcardIdとsortOrderをnullにしてください。');
    }

    var testDocs = asstBuildDocuments_();
    var abilityIndex = testDocs.abilities.abilities.findIndex(function (item) {
      return item.abilityId === ability.abilityId;
    });
    testDocs.abilities.abilities[abilityIndex] = ability;
    var abilityIssues = asstValidateDocuments_(testDocs.cards, testDocs.effects, testDocs.abilities)
      .filter(function (issue) {
        return issue.indexOf(ability.abilityId) >= 0 ||
          (ability.cardId && issue.indexOf(ability.cardId) >= 0);
      });
    if (abilityIssues.length) throw new Error('能力検査FAIL: ' + abilityIssues.join(' / '));

    var values = ASST_HEADERS[ASST_SHEET_ABILITIES].map(function (header) { return row[header]; });
    var update = {
      cardId: ability.cardId || '', sourceName: ability.sourceName, name: ability.name,
      description: ability.description, source: ability.source, rarity: ability.rarity || '',
      tagsJson: asstJsonCell_(ability.tags), sortOrder: ability.sortOrder === null ? '' : ability.sortOrder,
      linkStatus: ability.linkStatus, flagsJson: row.flagsJson, status: ability.status,
      version: currentVersion + 1, updatedAt: nowIso_(), updatedBy: user.nickname
    };
    Object.keys(update).forEach(function (key) { values[ASST_HEADERS[ASST_SHEET_ABILITIES].indexOf(key)] = update[key]; });
    asstSheet_(ASST_SHEET_ABILITIES).getRange(row._row, 1, 1, values.length).setValues([values]);
    asstAppendLog_(user, 'save-ability', 'PASS', ability.abilityId + ' version=' + (currentVersion + 1));
    return { ok: true, version: currentVersion + 1 };
  } finally {
    asstReleaseScriptLock_(lock);
  }
}

function api_asstExport() {
  var user = asstRequireUser_();
  var docs = asstBuildDocuments_();
  var driveImages = asstDriveImageInventory_(docs.cards.cards, true);
  var issues = asstValidateDocuments_(docs.cards, docs.effects, docs.abilities)
    .concat(driveImages.issues)
    .concat(asstValidateImageFiles_(docs.cards.cards, driveImages.byName));
  if (issues.length) {
    asstAppendLog_(user, 'export', 'FAIL', issues.slice(0, 20).join(' / '));
    throw new Error('export検査FAIL（' + issues.length + '件）: ' + issues.slice(0, 10).join(' / '));
  }
  var files = [
    { name: 'assist-cards.json', content: JSON.stringify(docs.cards, null, 2) + '\n' },
    { name: 'assist-effects.json', content: JSON.stringify(docs.effects, null, 2) + '\n' },
    { name: 'assist-abilities.json', content: JSON.stringify(docs.abilities, null, 2) + '\n' }
  ];
  files.forEach(function (file) { file.sha256 = asstSha256_(file.content); });
  asstAppendLog_(user, 'export', 'PASS', files.map(function (file) {
    return file.name + '=' + file.sha256.slice(0, 12);
  }).join(' '));
  return { ok: true, files: files, counts: {
    cards: docs.cards.counts, effects: docs.effects.counts, abilities: docs.abilities.counts
  } };
}
