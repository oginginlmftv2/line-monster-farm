/**
 * ライ徹アシストCMS（P12-8 / P12-8b test環境）
 *
 * このソースはtest専用。ENVIRONMENT=test の独立スプレッドシートでだけ動作する。
 * GitHubへのpush、公開サイト更新、本番モンスターCMSのシート変更は行わない。
 * 秘密値と許可メールアドレスはコードへ書かず、Script Properties / membersシートで管理する。
 */

var RAW_BASE =
  'https://raw.githubusercontent.com/oginginlmftv2/line-monster-farm/main/src/data/';
var RAW_REPO_BASE =
  'https://raw.githubusercontent.com/oginginlmftv2/line-monster-farm/main/';
var SOURCE_URLS = {
  cards: RAW_BASE + 'assist-cards.json',
  effects: RAW_BASE + 'assist-effects.json',
  abilities: RAW_BASE + 'assist-abilities.json'
};

var SHEET_MEMBERS = 'members';
var SHEET_CARDS = 'cards';
var SHEET_EFFECTS = 'assist_effects';
var SHEET_ABILITIES = 'abilities';
var SHEET_PUBLISH_LOG = 'publish_log';
var CARD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
var CARD_IMAGE_MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

var HEADERS = {};
HEADERS[SHEET_MEMBERS] = ['email', 'nickname', 'role', 'active', 'note'];
HEADERS[SHEET_CARDS] = [
  'sourceOrder', 'cardId', 'name', 'rarity', 'aura', 'cardType', 'monType', 'image',
  'event2', 'releasedAt', 'accessoryStatus', 'statsJson', 'limitBreakJson',
  'ratingsJson', 'explanation', 'formationsJson', 'sapoRefJson',
  'version', 'updatedAt', 'updatedBy'
];
HEADERS[SHEET_EFFECTS] = [
  'cardId', 'cardStatus', 'effectId', 'name', 'description', 'unlockRank',
  'sortOrder', 'updatedAt', 'updatedBy'
];
HEADERS[SHEET_ABILITIES] = [
  'sourceOrder', 'abilityId', 'legacyId', 'cardId', 'sourceName', 'name', 'description',
  'source', 'rarity', 'tagsJson', 'sortOrder', 'linkStatus', 'flagsJson', 'status',
  'version', 'updatedAt', 'updatedBy'
];
HEADERS[SHEET_PUBLISH_LOG] = ['timestamp', 'user', 'action', 'result', 'detail'];

var RARITIES = ['MR', 'SSR'];
var AURAS = ['赤', '緑', '黄', '白', '黒', '青'];
var CARD_TYPES = [
  'ガード', 'かしこさ', 'ジャッジ', 'アサルト', '回避', '師匠',
  'ちから', 'テクニック', '友人', '丈夫さ', 'インパクト', 'フォース',
  '命中', 'メンタル', 'フィジカル', 'クイック', 'サバイブ', 'ライバル',
  'ルミナス', 'バイタル', 'フォーカス', 'タフネス', 'ライフ', 'アキュメン'
];
var MON_TYPES = ['幻霊', '無機', '創造', '獣族', '魔族', '怪物'];
var ABILITY_STATUSES = ['draft', 'verified'];
var LINK_STATUSES = ['resolved', 'ambiguous', 'unlinked'];
var ABILITY_SOURCES = ['イベント', '閃き', 'EXトレ'];
var UNLOCK_RANKS = ['無凸', '1凸', '2凸', '3凸', '4凸'];
var RATING_KEYS = ['ikusei', 'karyo', 'battle', 'ta'];
var ACCESSORY_STATUSES = ['unknown', 'yes', 'no'];

// ---------------------------------------------------------------- test境界・共通

function prop_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error('スクリプトプロパティ ' + key + ' が未設定です。');
  return value;
}

function optionalProp_(key) {
  return text_(PropertiesService.getScriptProperties().getProperty(key)).trim();
}

function positiveIntProp_(key) {
  var raw = prop_(key).trim();
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error('スクリプトプロパティ ' + key + ' は1以上の整数で設定してください。');
  }
  return Number(raw);
}

function byteAt_(bytes, index) {
  return bytes[index] & 255;
}

function isExpectedImage_(bytes, mimeType) {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 &&
      byteAt_(bytes, 0) === 0xff && byteAt_(bytes, 1) === 0xd8 && byteAt_(bytes, 2) === 0xff;
  }
  if (mimeType === 'image/png') {
    var png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < png.length) return false;
    for (var i = 0; i < png.length; i++) {
      if (byteAt_(bytes, i) !== png[i]) return false;
    }
    return true;
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 &&
      byteAt_(bytes, 0) === 0x52 && byteAt_(bytes, 1) === 0x49 &&
      byteAt_(bytes, 2) === 0x46 && byteAt_(bytes, 3) === 0x46 &&
      byteAt_(bytes, 8) === 0x57 && byteAt_(bytes, 9) === 0x45 &&
      byteAt_(bytes, 10) === 0x42 && byteAt_(bytes, 11) === 0x50;
  }
  return false;
}

function reserveOcrDailyUsage_() {
  requireTest_();
  var limit = positiveIntProp_('OCR_DAILY_LIMIT');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('OCR利用回数の確認が他の実行と重なりました。');
  try {
    var properties = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var usage = {};
    try { usage = JSON.parse(text_(properties.getProperty('OCR_DAILY_USAGE')) || '{}'); }
    catch (error) { usage = {}; }
    var count = usage.date === today && Number.isFinite(Number(usage.count)) ? Number(usage.count) : 0;
    if (count >= limit) {
      throw new Error('本日のOCR上限（' + limit + '件）に達しました。翌日まで待つか、管理者がOCR_DAILY_LIMITを見直してください。');
    }
    count += 1;
    properties.setProperty('OCR_DAILY_USAGE', JSON.stringify({ date: today, count: count }));
    return { date: today, count: count, limit: limit, remaining: limit - count };
  } finally {
    lock.releaseLock();
  }
}

function requireTest_() {
  if (prop_('ENVIRONMENT') !== 'test') {
    throw new Error('このCMSはtest専用です。ENVIRONMENT=test を設定してください。');
  }
}

function book_() {
  requireTest_();
  var book = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var marker = String(book.getSheets()[0].getRange('A1').getNote() || '');
  if (marker !== 'P12-8 ASSIST CMS TEST') {
    throw new Error('test専用マーカーがありません。setup1_createSheets を確認してください。');
  }
  return book;
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function text_(value) {
  return value === null || value === undefined ? '' : String(value);
}

function dateCell_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy/MM/dd');
  }
  return text_(value) || null;
}

function hasNonNullValue_(value) {
  return value !== null && typeof value === 'object' && Object.keys(value).some(function (key) {
    return value[key] !== null;
  });
}

function jsonCell_(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function parseJsonCell_(value, fallback, label) {
  if (value === '' || value === null || value === undefined) return fallback;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(label + ' のJSONが不正です。');
  }
}

function integer_(value, label, allowNull) {
  if (allowNull && (value === '' || value === null || value === undefined)) return null;
  var number = Number(value);
  if (!Number.isInteger(number)) throw new Error(label + ' は整数で入力してください。');
  return number;
}

function inList_(value, allowed, label, allowBlank) {
  if (allowBlank && (value === '' || value === null || value === undefined)) return null;
  if (allowed.indexOf(value) < 0) throw new Error(label + ' が許可値ではありません: ' + value);
  return value;
}

function validateStringArray_(values, label, allowed) {
  if (!Array.isArray(values)) throw new Error(label + ' は配列です。');
  var seen = {};
  values.forEach(function (value) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' に空欄または文字列以外があります。');
    if (allowed && allowed.indexOf(value) < 0) throw new Error(label + ' が許可値ではありません: ' + value);
    if (seen[value]) throw new Error(label + ' が重複しています: ' + value);
    seen[value] = true;
  });
}

function validateObjectKeys_(value, keys, label, allowNull, numbersOnly) {
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

function validateStatRows_(stats, label) {
  if (!Array.isArray(stats)) throw new Error(label + ' は配列です。');
  if (stats.length !== 0 && stats.length !== 3) throw new Error(label + ' は空または3件です。');
  var labels = {};
  stats.forEach(function (row) {
    if (!row || typeof row !== 'object' || !text_(row.label).trim() || !text_(row.value).trim()) {
      throw new Error(label + ' の項目名と値は両方必須です。');
    }
    if (!/^\+\d+(?:\.\d+)?%?$/.test(text_(row.value).trim())) {
      throw new Error(label + ' の値は +数値 または +数値% です: ' + row.value);
    }
    if (labels[row.label]) throw new Error(label + ' の項目名が重複しています: ' + row.label);
    labels[row.label] = true;
  });
}

function validateRatings_(ratings, label) {
  validateObjectKeys_(ratings, RATING_KEYS, label, true, true);
  if (ratings === null) return;
  RATING_KEYS.forEach(function (key) {
    var value = ratings[key];
    if (value !== null && (value < 0 || value > 5)) throw new Error(label + '.' + key + ' は0〜5です。');
  });
}

function validateReleasedAt_(value, label) {
  if (value === null || value === undefined || value === '') return;
  value = text_(value);
  var match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) throw new Error(label + ' はYYYY/MM/DD形式です。');
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3])) {
    throw new Error(label + ' は実在する日付ではありません。');
  }
}

function validateImagePath_(card, checkExists) {
  var imagePath = text_(card.image).trim();
  if (!imagePath) throw new Error(card.cardId + ': image空欄');
  var expected = new RegExp('^assist-cards/' + card.cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.(?:jpg|jpeg|png|webp)$', 'i');
  if (!expected.test(imagePath)) throw new Error(card.cardId + ': imageはcardIdと一致するassist-cards配下の画像パス必須');
  if (!checkExists) return;
  var response = UrlFetchApp.fetch(RAW_REPO_BASE + imagePath, { muteHttpExceptions: true, headers: { Range: 'bytes=0-0' } });
  if ([200, 206].indexOf(response.getResponseCode()) < 0) throw new Error(card.cardId + ': imageがmainに存在しません（HTTP ' + response.getResponseCode() + '）');
}

function validateImageFiles_(cards) {
  var validCards = cards.filter(function (card) {
    try { validateImagePath_(card, false); return true; } catch (error) { return false; }
  });
  if (!validCards.length) return [];
  var responses = UrlFetchApp.fetchAll(validCards.map(function (card) {
    return { url: RAW_REPO_BASE + card.image, muteHttpExceptions: true, headers: { Range: 'bytes=0-0' } };
  }));
  return responses.reduce(function (issues, response, index) {
    if ([200, 206].indexOf(response.getResponseCode()) < 0) {
      issues.push(validCards[index].cardId + ': imageがmainに存在しません（HTTP ' + response.getResponseCode() + '）');
    }
    return issues;
  }, []);
}

function sheet_(name) {
  var sheet = book_().getSheetByName(name);
  if (!sheet) throw new Error(name + ' シートがありません。setup1_createSheets を実行してください。');
  return sheet;
}

function rows_(name) {
  var sheet = sheet_(name);
  if (sheet.getLastRow() < 2) return [];
  var headers = HEADERS[name];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map(function (row, index) {
    var item = { _row: index + 2 };
    headers.forEach(function (header, column) { item[header] = row[column]; });
    return item;
  });
}

function setRows_(name, values) {
  var sheet = sheet_(name);
  var headers = HEADERS[name];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(headers.length, sheet.getLastColumn())).clearContent();
  }
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function appendLog_(user, action, result, detail) {
  sheet_(SHEET_PUBLISH_LOG).appendRow([
    now_(), user && user.nickname ? user.nickname : '', action, result, text_(detail).slice(0, 5000)
  ]);
}

function sha256_(text) {
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

// ---------------------------------------------------------------- セットアップ

function setup1_createSheets() {
  requireTest_();
  var book = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var first = book.getSheets()[0];
  first.getRange('A1').setNote('P12-8 ASSIST CMS TEST');

  Object.keys(HEADERS).forEach(function (name) {
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    var header = HEADERS[name];
    if (sheet.getLastColumn() > header.length) {
      sheet.getRange(1, header.length + 1, Math.max(sheet.getLastRow(), 1), sheet.getLastColumn() - header.length).clearContent();
    }
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#f3ead7');
  });
  return 'test用シートを作成しました。次に setup2_registerMe を実行してください。';
}

function setup2_registerMe() {
  requireTest_();
  var email = String(Session.getActiveUser().getEmail() || '').trim();
  if (!email) throw new Error('ログイン中のメールアドレスを取得できません。');
  var sheet = sheet_(SHEET_MEMBERS);
  var existing = rows_(SHEET_MEMBERS).filter(function (row) { return row.email === email; });
  if (!existing.length) sheet.appendRow([email, '管理者', 'admin', true, 'P12-8 test']);
  return '実行ユーザーをtest管理者として登録しました。メールアドレスはmembersシートだけに保存されます。';
}

function fetchJson_(url) {
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('mainデータの取得に失敗しました（HTTP ' + response.getResponseCode() + '）。');
  }
  return JSON.parse(response.getContentText('UTF-8').replace(/^\uFEFF/, ''));
}

function migrateCardsDocument_(doc) {
  if (doc && doc.schemaVersion === 3) return doc;
  if (!doc || [1, 2].indexOf(doc.schemaVersion) < 0 || !Array.isArray(doc.cards)) return doc;
  var oldSchemaVersion = doc.schemaVersion;
  doc.cards = doc.cards.map(function (card) {
    if (card.cardId === 'b17h-MR-ruri') card.cardType = 'アキュメン';
    if (oldSchemaVersion === 1) {
      var oldStats = card.stats || {};
      card.accessoryStatus = oldStats.accessory === '○' ? 'yes' : 'unknown';
      if (card.sapoRef && card.sapoRef.type === 'main') {
        card.stats = [
          { label: '応援効果', value: formatStatValue_(oldStats.ouenKouka, true) },
          { label: '得意率', value: formatStatValue_(oldStats.tokuiRitsu, true) },
          { label: '初期' + card.cardType, value: formatStatValue_(oldStats.shokiStatus, false) }
        ];
      } else if (card.sapoRef && card.sapoRef.type === 'sub') {
        card.stats = [
          { label: '体力上限', value: formatStatValue_(oldStats.hpLimit, false) },
          { label: '全ステ上限アップ', value: formatStatValue_(oldStats.allStatLimitUp, false) },
          { label: 'チャレンジ効果アップ', value: formatStatValue_(oldStats.challengeEffectUp, true) }
        ];
      } else {
        card.stats = [];
      }
      card.stats = card.stats.filter(function (row) { return row.value !== null && row.value !== undefined && row.value !== ''; });
    }
    if (!card.event2 && card.distance) card.event2 = card.distance;
    if (!card.event2 && Array.isArray(card.terrain) && card.terrain.length) card.event2 = card.terrain.join(' / ');
    delete card.distance;
    delete card.terrain;
    delete card.status;
    return card;
  });
  doc.schemaVersion = 3;
  doc.counts.withStats = doc.cards.filter(function (card) { return card.stats.length > 0; }).length;
  return doc;
}

function formatStatValue_(value, percent) {
  if (value === null || value === undefined || value === '') return null;
  return '+' + text_(value).replace(/^\+/, '').replace(/%$/, '') + (percent ? '%' : '');
}

function setup3_importFromMain() {
  requireTest_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の処理と重なりました。少し待って再実行してください。');
  try {
    var cardsDoc = migrateCardsDocument_(fetchJson_(SOURCE_URLS.cards));
    var effectsDoc = fetchJson_(SOURCE_URLS.effects);
    var abilitiesDoc = fetchJson_(SOURCE_URLS.abilities);
    var issues = validateDocuments_(cardsDoc, effectsDoc, abilitiesDoc);
    if (issues.length) throw new Error('mainデータ検査FAIL: ' + issues.slice(0, 10).join(' / '));

    var cardRows = cardsDoc.cards.map(function (card, index) {
      return [
        index + 1, card.cardId, card.name, card.rarity, card.aura, card.cardType,
        card.monType || '', card.image, card.event2 || '', card.releasedAt || '', card.accessoryStatus, jsonCell_(card.stats),
        jsonCell_(card.limitBreak), jsonCell_(card.ratings), card.explanation || '',
        jsonCell_(card.formations || []), jsonCell_(card.sapoRef), 1, '', ''
      ];
    });

    var effectRows = [];
    cardsDoc.cards.forEach(function (card) {
      var group = effectsDoc.cards[card.cardId];
      if (!group.effects.length) {
        effectRows.push([card.cardId, group.status, '', '', '', '', '', '', '']);
      } else {
        group.effects.forEach(function (effect) {
          effectRows.push([
            card.cardId, group.status, effect.effectId, effect.name, effect.description,
            effect.unlockRank, effect.sortOrder, '', ''
          ]);
        });
      }
    });

    var abilityRows = abilitiesDoc.abilities.map(function (ability, index) {
      return [
        index + 1, ability.abilityId, ability.legacyId,
        ability.cardId || '', ability.sourceName, ability.name, ability.description,
        ability.source, ability.rarity || '', jsonCell_(ability.tags || []),
        ability.sortOrder === null ? '' : ability.sortOrder, ability.linkStatus,
        jsonCell_(ability.flags || []), ability.status, 1, '', ''
      ];
    });

    setRows_(SHEET_CARDS, cardRows);
    setRows_(SHEET_EFFECTS, effectRows);
    setRows_(SHEET_ABILITIES, abilityRows);
    appendLog_({ nickname: 'setup' }, 'import', 'PASS',
      'cards=' + cardRows.length + ' effects=' + effectRows.length + ' abilities=' + abilityRows.length);
    return 'mainからtestへ取り込みました: カード' + cardRows.length + ' / 効果行' +
      effectRows.length + ' / 能力' + abilityRows.length;
  } finally {
    lock.releaseLock();
  }
}

function setup4_check() {
  requireTest_();
  var docs = buildDocuments_();
  var issues = validateDocuments_(docs.cards, docs.effects, docs.abilities)
    .concat(validateImageFiles_(docs.cards.cards));
  var result = {
    environment: prop_('ENVIRONMENT'),
    spreadsheetIdConfigured: Boolean(prop_('SPREADSHEET_ID')),
    cards: docs.cards.cards.length,
    effects: docs.effects.counts.effects,
    abilities: docs.abilities.abilities.length,
    issues: issues
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function setup5_createAssistImageFolder() {
  requireTest_();
  var folderId = optionalProp_('ASSIST_IMAGE_FOLDER_ID');
  if (!folderId) throw new Error('先に管理者が作成したtest画像フォルダのIDをASSIST_IMAGE_FOLDER_IDへ設定してください。');
  var root = DriveApp.getFolderById(folderId);
  appendLog_({ nickname: 'setup' }, 'prepare-assist-image-folder', 'PASS', root.getName());
  return { configured: true, folderName: root.getName() };
}

// ---------------------------------------------------------------- 認証

function me_() {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim(); } catch (error) { email = ''; }
  if (!email) return null;
  var member = rows_(SHEET_MEMBERS).filter(function (row) {
    return String(row.email).trim() === email && String(row.active).toLowerCase() !== 'false' && row.active !== '';
  })[0];
  if (!member) return null;
  return { nickname: text_(member.nickname), role: text_(member.role) };
}

function requireUser_() {
  var user = me_();
  if (!user) throw new Error('権限がありません。membersシートを確認してください。');
  return user;
}

// ---------------------------------------------------------------- シート⇔3DB

function cardFromRow_(row) {
  return {
    cardId: text_(row.cardId),
    name: text_(row.name),
    rarity: text_(row.rarity),
    aura: text_(row.aura),
    cardType: text_(row.cardType),
    monType: text_(row.monType) || null,
    image: text_(row.image),
    event2: text_(row.event2) || null,
    releasedAt: dateCell_(row.releasedAt),
    accessoryStatus: text_(row.accessoryStatus) || 'unknown',
    stats: parseJsonCell_(row.statsJson, [], row.cardId + '/statsJson'),
    limitBreak: parseJsonCell_(row.limitBreakJson, null, row.cardId + '/limitBreakJson'),
    ratings: parseJsonCell_(row.ratingsJson, {}, row.cardId + '/ratingsJson'),
    explanation: text_(row.explanation),
    formations: parseJsonCell_(row.formationsJson, [], row.cardId + '/formationsJson'),
    sapoRef: parseJsonCell_(row.sapoRefJson, null, row.cardId + '/sapoRefJson')
  };
}

function effectFromRow_(row) {
  return {
    effectId: text_(row.effectId),
    name: text_(row.name),
    description: text_(row.description),
    unlockRank: text_(row.unlockRank),
    sortOrder: integer_(row.sortOrder, row.effectId + '/sortOrder', false)
  };
}

function abilityFromRow_(row) {
  return {
    abilityId: text_(row.abilityId),
    legacyId: integer_(row.legacyId, row.abilityId + '/legacyId', false),
    cardId: text_(row.cardId) || null,
    sourceName: text_(row.sourceName),
    name: text_(row.name),
    description: text_(row.description),
    source: text_(row.source),
    rarity: text_(row.rarity) || null,
    tags: parseJsonCell_(row.tagsJson, [], row.abilityId + '/tagsJson'),
    sortOrder: integer_(row.sortOrder, row.abilityId + '/sortOrder', true),
    linkStatus: text_(row.linkStatus),
    flags: parseJsonCell_(row.flagsJson, [], row.abilityId + '/flagsJson'),
    status: text_(row.status)
  };
}

function buildDocuments_() {
  var cardRows = rows_(SHEET_CARDS).sort(function (a, b) { return Number(a.sourceOrder) - Number(b.sourceOrder); });
  var cards = cardRows.map(cardFromRow_);
  var effectRows = rows_(SHEET_EFFECTS);
  var abilityRows = rows_(SHEET_ABILITIES).sort(function (a, b) { return Number(a.sourceOrder) - Number(b.sourceOrder); });

  var effectsByCard = {};
  cards.forEach(function (card) { effectsByCard[card.cardId] = { status: 'draft', effects: [] }; });
  effectRows.forEach(function (row) {
    if (!effectsByCard[row.cardId]) effectsByCard[row.cardId] = { status: text_(row.cardStatus), effects: [] };
    effectsByCard[row.cardId].status = text_(row.cardStatus);
    if (text_(row.effectId)) effectsByCard[row.cardId].effects.push(effectFromRow_(row));
  });
  Object.keys(effectsByCard).forEach(function (cardId) {
    effectsByCard[cardId].effects.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
  });

  var abilities = abilityRows.map(abilityFromRow_);
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
      generatedFrom: ['P12-8 test assist CMS'],
      generatedAt: null,
      counts: cardCounts,
      cards: cards
    },
    effects: {
      schemaVersion: 1,
      generatedFrom: ['P12-8 test assist CMS'],
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
      schemaVersion: 1,
      generatedFrom: ['P12-8 test assist CMS'],
      generatedAt: null,
      counts: abilityCounts,
      abilities: abilities
    }
  };
}

function validateDocuments_(cardsDoc, effectsDoc, abilitiesDoc) {
  var issues = [];
  if (!cardsDoc || cardsDoc.schemaVersion !== 3 || !Array.isArray(cardsDoc.cards)) {
    return ['カードDBのschemaVersionまたはcardsが不正'];
  }
  if (!effectsDoc || effectsDoc.schemaVersion !== 1 || !effectsDoc.cards || Array.isArray(effectsDoc.cards)) {
    issues.push('効果DBのschemaVersionまたはcardsが不正');
  }
  if (!abilitiesDoc || abilitiesDoc.schemaVersion !== 1 || !Array.isArray(abilitiesDoc.abilities)) {
    issues.push('能力DBのschemaVersionまたはabilitiesが不正');
  }
  if (issues.length) return issues;

  var cardIds = {};
  cardsDoc.cards.forEach(function (card) {
    if (!card.cardId || cardIds[card.cardId]) issues.push('cardId重複または空欄: ' + card.cardId);
    cardIds[card.cardId] = true;
    if (!card.name) issues.push(card.cardId + ': name空欄');
    if (RARITIES.indexOf(card.rarity) < 0) issues.push(card.cardId + ': rarity不正');
    if (AURAS.indexOf(card.aura) < 0) issues.push(card.cardId + ': aura不正');
    if (CARD_TYPES.indexOf(card.cardType) < 0) issues.push(card.cardId + ': cardType不正');
    if (card.monType !== null && MON_TYPES.indexOf(card.monType) < 0) issues.push(card.cardId + ': monType不正');
    if (!Array.isArray(card.formations)) issues.push(card.cardId + ': formations不正');
    try { validateImagePath_(card, false); } catch (error) { issues.push(error.message); }
    try { validateReleasedAt_(card.releasedAt, card.cardId + '/releasedAt'); } catch (error) { issues.push(error.message); }
    try { validateRatings_(card.ratings, card.cardId + '/ratings'); } catch (error) { issues.push(error.message); }
    try { inList_(card.accessoryStatus, ACCESSORY_STATUSES, card.cardId + '/accessoryStatus', false); } catch (error) { issues.push(error.message); }
    try { validateStatRows_(card.stats, card.cardId + '/stats'); } catch (error) { issues.push(error.message); }
  });
  cardsDoc.cards.forEach(function (card) {
    if (!Array.isArray(card.formations)) return;
    card.formations.forEach(function (formation, index) {
      if (!formation || !text_(formation.title).trim()) issues.push(card.cardId + '/formation' + (index + 1) + ': 編成名空欄');
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
      if (UNLOCK_RANKS.indexOf(effect.unlockRank) < 0) issues.push(effect.effectId + ': unlockRank不正');
      if (effect.sortOrder !== index + 1) issues.push(effect.effectId + ': sortOrder不連続');
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
    if (legacyIds[ability.legacyId]) issues.push('legacyId重複: ' + ability.legacyId);
    legacyIds[ability.legacyId] = true;
    if (!ability.sourceName || !ability.name || !ability.description) issues.push(ability.abilityId + ': 必須文字列空欄');
    if (ABILITY_SOURCES.indexOf(ability.source) < 0) issues.push(ability.abilityId + ': source不正');
    if (LINK_STATUSES.indexOf(ability.linkStatus) < 0) issues.push(ability.abilityId + ': linkStatus不正');
    if (ABILITY_STATUSES.indexOf(ability.status) < 0) issues.push(ability.abilityId + ': status不正');
    if (!Array.isArray(ability.tags) || !Array.isArray(ability.flags)) issues.push(ability.abilityId + ': tags/flags不正');
    else {
      try { validateStringArray_(ability.tags, ability.abilityId + '/tags'); } catch (error) { issues.push(error.message); }
      try { validateStringArray_(ability.flags, ability.abilityId + '/flags'); } catch (error) { issues.push(error.message); }
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

// ---------------------------------------------------------------- 画面API

function doGet() {
  requireTest_();
  var user = me_();
  if (!user) {
    return HtmlService.createHtmlOutput(
      '<main style="font-family:sans-serif;padding:32px"><h1>権限がありません</h1>' +
      '<p>testスプレッドシートのmembersシートへ登録してください。</p></main>'
    ).setTitle('ライ徹アシストCMS TEST');
  }
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('ライ徹アシストCMS TEST')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function api_bootstrap() {
  var user = requireUser_();
  var cards = rows_(SHEET_CARDS).sort(function (a, b) { return Number(a.sourceOrder) - Number(b.sourceOrder); });
  var effectCounts = {};
  rows_(SHEET_EFFECTS).forEach(function (row) {
    if (row.effectId) effectCounts[row.cardId] = (effectCounts[row.cardId] || 0) + 1;
  });
  var abilityCounts = {};
  rows_(SHEET_ABILITIES).forEach(function (row) {
    if (row.cardId) abilityCounts[row.cardId] = (abilityCounts[row.cardId] || 0) + 1;
  });
  return {
    environment: 'test',
    user: user,
    ocr: { provider: 'google-cloud-vision', configured: Boolean(optionalProp_('GOOGLE_CLOUD_VISION_API_KEY')) },
    imageUpload: { configured: Boolean(optionalProp_('ASSIST_IMAGE_FOLDER_ID')) },
    cards: cards.map(function (row) {
      return {
        cardId: text_(row.cardId), name: text_(row.name), rarity: text_(row.rarity),
        aura: text_(row.aura), version: Number(row.version || 1),
        effects: effectCounts[row.cardId] || 0, abilities: abilityCounts[row.cardId] || 0
      };
    })
  };
}

function assistImageFolder_() {
  var folderId = optionalProp_('ASSIST_IMAGE_FOLDER_ID');
  if (!folderId) throw new Error('Script PropertiesのASSIST_IMAGE_FOLDER_IDが未設定です。');
  var root = DriveApp.getFolderById(folderId);
  return root;
}

function api_uploadCardImage(payload) {
  var user = requireUser_();
  payload = payload || {};
  var cardId = text_(payload.cardId).trim();
  var mimeType = text_(payload.mimeType).toLowerCase().trim();
  var extension = CARD_IMAGE_MIME_EXT[mimeType];
  if (!extension) throw new Error('対応形式はJPG・PNG・WebPの3種類です。');
  var base64 = text_(payload.base64).replace(/\s/g, '');
  var maxBase64Length = Math.ceil(CARD_IMAGE_MAX_BYTES / 3) * 4 + 4;
  if (!base64 || base64.length > maxBase64Length) throw new Error('画像は2MB以下にしてください。');
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('画像データが壊れています。');
  var bytes;
  try { bytes = Utilities.base64Decode(base64); }
  catch (error) { throw new Error('画像データを復号できません。'); }
  if (!bytes.length || bytes.length > CARD_IMAGE_MAX_BYTES) throw new Error('画像は2MB以下にしてください。');
  if (!isExpectedImage_(bytes, mimeType)) throw new Error('ファイルの内容と画像形式が一致しません。');

  var fileName = cardId + '.' + extension;
  var imagePath = 'assist-cards/' + fileName;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の画像保存と重なりました。');
  var newFile = null;
  var trashedFiles = [];
  try {
    var row = rows_(SHEET_CARDS).filter(function (item) { return item.cardId === cardId; })[0];
    if (!row) throw new Error('未知cardIdです。');
    var currentVersion = Number(row.version || 1);
    if (Number(payload.version) !== currentVersion) throw new Error('他の編集が保存済みです。読み込み直してください。');

    var folder = assistImageFolder_();
    newFile = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
    var sameId = new RegExp('^' + cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.[^.]+$', 'i');
    var files = folder.getFiles();
    while (files.hasNext()) {
      var oldFile = files.next();
      if (oldFile.getId() === newFile.getId() || !sameId.test(oldFile.getName())) continue;
      oldFile.setTrashed(true);
      trashedFiles.push(oldFile);
    }

    var values = HEADERS[SHEET_CARDS].map(function (header) { return row[header]; });
    var updatedAt = now_();
    values[HEADERS[SHEET_CARDS].indexOf('image')] = imagePath;
    values[HEADERS[SHEET_CARDS].indexOf('version')] = currentVersion + 1;
    values[HEADERS[SHEET_CARDS].indexOf('updatedAt')] = updatedAt;
    values[HEADERS[SHEET_CARDS].indexOf('updatedBy')] = user.nickname;
    sheet_(SHEET_CARDS).getRange(row._row, 1, 1, values.length).setValues([values]);
    appendLog_(user, 'upload-assist-image', 'PASS', cardId + ' / ' + fileName + ' / bytes=' + bytes.length);
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
    lock.releaseLock();
  }
}

function api_ocrEffectImage(payload) {
  var user = requireUser_();
  payload = payload || {};
  var cardId = text_(payload.cardId).trim();
  var fileName = text_(payload.fileName).trim();
  var mimeType = text_(payload.mimeType).trim();
  var base64 = text_(payload.base64).replace(/\s/g, '');
  if (!rows_(SHEET_CARDS).some(function (row) { return row.cardId === cardId; })) throw new Error('未知cardIdです。');
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
  var usage = reserveOcrDailyUsage_();
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
    appendLog_(user, 'effect-ocr', 'FAIL', cardId + ' / ' + fileName + ' / HTTP ' + response.getResponseCode() + ' / daily=' + usage.count + '/' + usage.limit);
    throw new Error('Google Cloud Vision OCRに失敗しました: ' + message);
  }
  if (body.responses[0].error) throw new Error('Google Cloud Vision OCRに失敗しました: ' + body.responses[0].error.message);
  appendLog_(user, 'effect-ocr', 'PASS', cardId + ' / ' + fileName + ' / daily=' + usage.count + '/' + usage.limit);
  return { fileName: fileName, vision: body, dailyUsage: usage };
}

function api_getCard(cardId) {
  requireUser_();
  cardId = text_(cardId);
  var row = rows_(SHEET_CARDS).filter(function (item) { return item.cardId === cardId; })[0];
  if (!row) throw new Error('カードが見つかりません: ' + cardId);
  var effects = rows_(SHEET_EFFECTS).filter(function (item) { return item.cardId === cardId && item.effectId; })
    .sort(function (a, b) { return Number(a.sortOrder) - Number(b.sortOrder); })
    .map(effectFromRow_);
  var abilities = rows_(SHEET_ABILITIES).filter(function (item) { return item.cardId === cardId; })
    .sort(function (a, b) { return Number(a.sortOrder) - Number(b.sortOrder); })
    .map(abilityFromRow_);
  return { card: cardFromRow_(row), version: Number(row.version || 1), effects: effects, abilities: abilities };
}

function api_saveCard(payload) {
  var user = requireUser_();
  payload = payload || {};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の保存と重なりました。');
  try {
    var rows = rows_(SHEET_CARDS);
    var row = rows.filter(function (item) { return item.cardId === text_(payload.cardId); })[0];
    if (!row) throw new Error('カードが見つかりません。');
    var currentVersion = Number(row.version || 1);
    if (Number(payload.version) !== currentVersion) throw new Error('他の編集が保存済みです。読み込み直してください。');

    var card = payload.card || {};
    var currentCard = cardFromRow_(row);
    if (text_(card.cardId) !== row.cardId) throw new Error('cardIdは変更できません。');
    if (!text_(card.name).trim()) throw new Error('カード名は必須です。');
    inList_(card.rarity, RARITIES, 'rarity', false);
    inList_(card.aura, AURAS, 'aura', false);
    inList_(card.cardType, CARD_TYPES, 'cardType', false);
    inList_(card.monType, MON_TYPES, 'monType', true);
    inList_(card.accessoryStatus, ACCESSORY_STATUSES, 'accessoryStatus', false);
    validateImagePath_(card, true);
    validateReleasedAt_(card.releasedAt, 'releasedAt');
    validateRatings_(card.ratings, 'ratings');
    validateStatRows_(card.stats, 'stats');
    if (!Array.isArray(card.formations)) throw new Error('formationsは配列です。');
    var cardIds = {};
    rows.forEach(function (item) { cardIds[item.cardId] = true; });
    card.formations.forEach(function (formation, index) {
      if (!formation || typeof formation !== 'object' || !text_(formation.title).trim()) throw new Error('編成 ' + (index + 1) + ' の編成名は必須です。');
      if (!Array.isArray(formation.cards) || formation.cards.length !== 5) throw new Error('編成 ' + (index + 1) + ' のカード枠は5件です。');
      formation.cards.forEach(function (cardId) {
        if (cardId && !cardIds[cardId]) throw new Error('編成に未知cardIdがあります: ' + cardId);
      });
      if (formation.rental && !cardIds[formation.rental]) throw new Error('レンタルに未知cardIdがあります: ' + formation.rental);
    });
    var values = HEADERS[SHEET_CARDS].map(function (header) { return row[header]; });
    var update = {
      name: text_(card.name), rarity: card.rarity, aura: card.aura, cardType: text_(card.cardType),
      monType: card.monType || '', image: text_(card.image), event2: card.event2 || '', releasedAt: card.releasedAt || '',
      accessoryStatus: card.accessoryStatus,
      statsJson: jsonCell_(card.stats), limitBreakJson: jsonCell_(currentCard.limitBreak),
      ratingsJson: jsonCell_(card.ratings), explanation: text_(card.explanation),
      formationsJson: jsonCell_(card.formations), sapoRefJson: jsonCell_(currentCard.sapoRef),
      version: currentVersion + 1, updatedAt: now_(), updatedBy: user.nickname
    };
    Object.keys(update).forEach(function (key) { values[HEADERS[SHEET_CARDS].indexOf(key)] = update[key]; });
    sheet_(SHEET_CARDS).getRange(row._row, 1, 1, values.length).setValues([values]);
    appendLog_(user, 'save-card', 'PASS', row.cardId + ' version=' + (currentVersion + 1));
    return { ok: true, version: currentVersion + 1 };
  } finally {
    lock.releaseLock();
  }
}

function api_saveEffects(payload) {
  var user = requireUser_();
  payload = payload || {};
  var cardId = text_(payload.cardId);
  var effects = payload.effects;
  if (!rows_(SHEET_CARDS).some(function (row) { return row.cardId === cardId; })) throw new Error('未知cardIdです。');
  if (!Array.isArray(effects)) throw new Error('effectsは配列です。');
  var group = { status: effects.length ? 'verified' : 'draft', effects: effects };
  var testDocs = buildDocuments_();
  testDocs.effects.cards[cardId] = group;
  var issues = validateDocuments_(testDocs.cards, testDocs.effects, testDocs.abilities)
    .filter(function (issue) { return issue.indexOf(cardId) >= 0 || effects.some(function (effect) { return issue.indexOf(effect.effectId) >= 0; }); });
  if (issues.length) throw new Error('効果検査FAIL: ' + issues.join(' / '));

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の保存と重なりました。');
  try {
    var oldRows = rows_(SHEET_EFFECTS).filter(function (row) { return row.cardId !== cardId; });
    var timestamp = now_();
    var replacement = effects.length ? effects.map(function (effect) {
      return [cardId, 'verified', effect.effectId, effect.name, effect.description,
        effect.unlockRank, effect.sortOrder, timestamp, user.nickname];
    }) : [[cardId, 'draft', '', '', '', '', '', timestamp, user.nickname]];
    var preserved = oldRows.map(function (row) {
      return HEADERS[SHEET_EFFECTS].map(function (header) { return row[header]; });
    });
    setRows_(SHEET_EFFECTS, preserved.concat(replacement));
    appendLog_(user, 'save-effects', 'PASS', cardId + ' effects=' + effects.length);
    return { ok: true, count: effects.length };
  } finally {
    lock.releaseLock();
  }
}

function api_getAbility(abilityId) {
  requireUser_();
  var row = rows_(SHEET_ABILITIES).filter(function (item) { return item.abilityId === text_(abilityId); })[0];
  if (!row) throw new Error('能力が見つかりません。');
  return { ability: abilityFromRow_(row), version: Number(row.version || 1) };
}

function api_saveAbility(payload) {
  var user = requireUser_();
  payload = payload || {};
  var ability = payload.ability || {};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の保存と重なりました。');
  try {
    var row = rows_(SHEET_ABILITIES).filter(function (item) { return item.abilityId === text_(ability.abilityId); })[0];
    if (!row) throw new Error('能力が見つかりません。');
    var currentVersion = Number(row.version || 1);
    if (Number(payload.version) !== currentVersion) throw new Error('他の編集が保存済みです。');
    if (integer_(ability.legacyId, 'legacyId', false) !== Number(row.legacyId)) throw new Error('legacyIdは変更できません。');
    inList_(ability.source, ABILITY_SOURCES, 'source', false);
    inList_(ability.linkStatus, LINK_STATUSES, 'linkStatus', false);
    inList_(ability.status, ABILITY_STATUSES, 'status', false);
    if (!ability.sourceName || !ability.name || !ability.description) throw new Error('sourceName/name/descriptionは必須です。');
    validateStringArray_(ability.tags, 'tags');
    if (ability.linkStatus === 'resolved') {
      if (!rows_(SHEET_CARDS).some(function (card) { return card.cardId === ability.cardId; })) throw new Error('resolvedのcardIdが不正です。');
      integer_(ability.sortOrder, 'sortOrder', false);
    } else if (ability.cardId !== null || ability.sortOrder !== null) {
      throw new Error('resolved以外はcardIdとsortOrderをnullにしてください。');
    }

    var testDocs = buildDocuments_();
    var abilityIndex = testDocs.abilities.abilities.findIndex(function (item) {
      return item.abilityId === ability.abilityId;
    });
    testDocs.abilities.abilities[abilityIndex] = ability;
    var abilityIssues = validateDocuments_(testDocs.cards, testDocs.effects, testDocs.abilities)
      .filter(function (issue) {
        return issue.indexOf(ability.abilityId) >= 0 ||
          (ability.cardId && issue.indexOf(ability.cardId) >= 0);
      });
    if (abilityIssues.length) throw new Error('能力検査FAIL: ' + abilityIssues.join(' / '));

    var values = HEADERS[SHEET_ABILITIES].map(function (header) { return row[header]; });
    var update = {
      cardId: ability.cardId || '', sourceName: ability.sourceName, name: ability.name,
      description: ability.description, source: ability.source, rarity: ability.rarity || '',
      tagsJson: jsonCell_(ability.tags), sortOrder: ability.sortOrder === null ? '' : ability.sortOrder,
      linkStatus: ability.linkStatus, flagsJson: row.flagsJson, status: ability.status,
      version: currentVersion + 1, updatedAt: now_(), updatedBy: user.nickname
    };
    Object.keys(update).forEach(function (key) { values[HEADERS[SHEET_ABILITIES].indexOf(key)] = update[key]; });
    sheet_(SHEET_ABILITIES).getRange(row._row, 1, 1, values.length).setValues([values]);
    appendLog_(user, 'save-ability', 'PASS', ability.abilityId + ' version=' + (currentVersion + 1));
    return { ok: true, version: currentVersion + 1 };
  } finally {
    lock.releaseLock();
  }
}

function api_export() {
  var user = requireUser_();
  var docs = buildDocuments_();
  var issues = validateDocuments_(docs.cards, docs.effects, docs.abilities)
    .concat(validateImageFiles_(docs.cards.cards));
  if (issues.length) {
    appendLog_(user, 'export', 'FAIL', issues.slice(0, 20).join(' / '));
    throw new Error('export検査FAIL（' + issues.length + '件）: ' + issues.slice(0, 10).join(' / '));
  }
  var files = [
    { name: 'assist-cards.json', content: JSON.stringify(docs.cards, null, 2) + '\n' },
    { name: 'assist-effects.json', content: JSON.stringify(docs.effects, null, 2) + '\n' },
    { name: 'assist-abilities.json', content: JSON.stringify(docs.abilities, null, 2) + '\n' }
  ];
  files.forEach(function (file) { file.sha256 = sha256_(file.content); });
  appendLog_(user, 'export', 'PASS', files.map(function (file) {
    return file.name + '=' + file.sha256.slice(0, 12);
  }).join(' '));
  return { ok: true, files: files, counts: {
    cards: docs.cards.counts, effects: docs.effects.counts, abilities: docs.abilities.counts
  } };
}
