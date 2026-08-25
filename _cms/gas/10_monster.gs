/** モンスタードメイン。 */
var MON_THRESHOLD = 800;
var MON_IMAGE_FOLDER_NAME = 'monster';
var MON_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
var MON_IMAGE_MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
var MON_SHEET_MONSTERS = 'monsters';
var MON_SHEET_EDIT_LOG = 'edit_log';
var MON_SHEET_PUBLISH_LOG = 'publish_log';
var MON_HEADERS = {};
MON_HEADERS[MON_SHEET_MONSTERS] = ['id','name','aura','mon','mainBlood','subBlood','limited','limitedLabel','image','releasedAt','explanation','formations','visibleChars','indexable','status','author','createdAt','contributors','lastEditor','updatedAt','arrayIndex','url'];
MON_HEADERS[MON_SHEET_EDIT_LOG] = ['日時','モンスターID','編集者','種別','文字数','記録した著者名'];
MON_HEADERS[MON_SHEET_PUBLISH_LOG] = ['日時','実行者','コミットSHA','結果','詳細'];
var MON_AURA_LIST = ['赤','青','黄','黒','白','緑'];
var MON_TYPE_LIST = ['創造','幻霊','魔族','獣族','怪物','無機'];
function monSeedUrl_() { return RAW_BASE + 'cms-seed.json'; }
function monBaselineUrl_() { return RAW_BASE + 'page-baseline.json'; }
function monAvailabilityUrl_() { return RAW_BASE + 'id-availability.json'; }

function monImageFolder_() {
  var root = DriveApp.getFolderById(prop_('DRIVE_FOLDER_ID'));
  var folders = root.getFoldersByName(MON_IMAGE_FOLDER_NAME);
  if (!folders.hasNext()) return root.createFolder(MON_IMAGE_FOLDER_NAME);

  var folder = folders.next();
  if (folders.hasNext()) {
    throw new Error('「ライ徹_画像」直下に monster フォルダが複数あります。1つに整理してください。');
  }
  return folder;
}

function monProfileUrlsByNickname_() {
  var sh = book_().getSheetByName(SHEET_MEMBERS);
  var map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, CORE_HEADERS[SHEET_MEMBERS].length).getValues();
  values.forEach(function (row) {
    var nickname = String(row[1] || '').trim();
    var profileUrl = String(row[3] || '').trim();
    if (nickname && profileUrl) map[nickname] = profileUrl;
  });
  return map;
}

function monMemberNames_() {
  var sh = book_().getSheetByName(SHEET_MEMBERS);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, CORE_HEADERS[SHEET_MEMBERS].length).getValues();
  var out = [];
  rows.forEach(function (r) {
    var nick = String(r[1] || '').trim();
    if (!nick) return;
    if (r[4] === false || String(r[4]).toUpperCase() === 'FALSE') return;
    if (out.indexOf(nick) < 0) out.push(nick);
  });
  return out;
}

function monSheet_() {
  var sh = book_().getSheetByName(MON_SHEET_MONSTERS);
  if (!sh) throw new Error('monsters シートがありません');
  return sh;
}

function monColIndex_() {
  var map = {};
  MON_HEADERS[MON_SHEET_MONSTERS].forEach(function (name, i) { map[name] = i; });
  return map;
}

function monReadAll_() {
  var sh = monSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, MON_HEADERS[MON_SHEET_MONSTERS].length).getValues();
  var c = monColIndex_();
  return values.map(function (r, i) {
    return {
      row: i + 2,
      id: pad4_(r[c.id]),
      name: String(r[c.name] || ''),
      aura: String(r[c.aura] || ''),
      mon: String(r[c.mon] || ''),
      mainBlood: String(r[c.mainBlood] || ''),
      subBlood: String(r[c.subBlood] || ''),
      limited: r[c.limited] === true || String(r[c.limited]).toUpperCase() === 'TRUE',
      limitedLabel: String(r[c.limitedLabel] || ''),
      image: String(r[c.image] || ''),
      releasedAt: String(r[c.releasedAt] || ''),
      explanation: String(r[c.explanation] || ''),
      formations: String(r[c.formations] || ''),
      visibleChars: Number(r[c.visibleChars] || 0),
      indexable: r[c.indexable] === true || String(r[c.indexable]).toUpperCase() === 'TRUE',
      status: String(r[c.status] || ''),
      author: String(r[c.author] || ''),
      createdAt: String(r[c.createdAt] || ''),
      contributors: String(r[c.contributors] || ''),
      lastEditor: String(r[c.lastEditor] || ''),
      updatedAt: String(r[c.updatedAt] || ''),
      arrayIndex: Number(r[c.arrayIndex]),
      url: String(r[c.url] || '')
    };
  });
}

function monBaselineMap_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('baseline');
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* 壊れていたら取り直す */ }
  }
  try {
    var res = UrlFetchApp.fetch(monBaselineUrl_(), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var data = JSON.parse(res.getContentText());
    var map = {};
    (data.pages || []).forEach(function (p) { map[pad4_(p.id)] = p.baseline; });
    cache.put('baseline', JSON.stringify(map), 3600);
    return map;
  } catch (e) {
    return null;
  }
}

function monAvailabilityData_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('idAvailability');
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* 壊れていたら取り直す */ }
  }
  try {
    var res = UrlFetchApp.fetch(monAvailabilityUrl_(), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var data = JSON.parse(res.getContentText());
    if (!Array.isArray(data.bloodOrder) || !Array.isArray(data.taken) || !data.specialSub) return null;
    cache.put('idAvailability', JSON.stringify(data), 3600);
    return data;
  } catch (e) {
    return null;
  }
}

function monBloodLists_() {
  var data = monAvailabilityData_();
  if (!data) return null;
  var main = data.bloodOrder.map(function (b) { return b.name; });
  return { main: main, sub: main.concat(Object.keys(data.specialSub)) };
}

function monPredictNewId_(mainBlood, subBlood, allMonsters) {
  var data = monAvailabilityData_();
  if (!data) {
    throw new Error('GitHub から id-availability.json を取得できません。時間をおいてやり直してください。');
  }

  mainBlood = String(mainBlood || '').trim();
  subBlood = String(subBlood || '').trim();
  var mainEntry = null;
  var subEntry = null;
  data.bloodOrder.forEach(function (entry) {
    if (entry.name === mainBlood) mainEntry = entry;
    if (entry.name === subBlood) subEntry = entry;
  });
  if (!mainEntry) throw new Error('主血統の値が不正です: ' + mainBlood);

  var used = {};
  (data.taken || []).forEach(function (entry) { used[pad4_(entry.id)] = entry.name || ''; });
  (allMonsters || []).forEach(function (monster) {
    if (monster.id) used[pad4_(monster.id)] = monster.name || '';
  });

  var id = '';
  var special = data.specialSub[subBlood];
  if (special) {
    for (var n = Number(special.from); n <= Number(special.to); n++) {
      var candidate = String(mainEntry.code) + (n < 10 ? '0' + n : String(n));
      if (!Object.prototype.hasOwnProperty.call(used, candidate)) { id = candidate; break; }
    }
    if (!id) {
      throw new Error(mainBlood + '×' + subBlood + ' のID枠に空きがありません。');
    }
  } else {
    if (!subEntry) throw new Error('副血統の値が不正です: ' + subBlood);
    id = String(mainEntry.code) + String(subEntry.code);
    if (Object.prototype.hasOwnProperty.call(used, id)) {
      throw new Error('この血統の組み合わせは既に登録済みです（' + id + ' ' + used[id] + '）。');
    }
  }
  return id;
}

function monOverhead_(m, baseMap) {
  var base = baseMap && baseMap[m.id] != null ? baseMap[m.id] : null;
  if (base == null) {
    // baseline が取れないとき：保存済みの実測から逆算する
    var fallback = m.visibleChars - countChars_(m.explanation);
    return fallback > 0 ? fallback : 0;
  }
  var extra = m.visibleChars - base - countChars_(m.explanation);
  if (!isFinite(extra) || extra < 0) extra = 0;
  return base + extra;
}

function api_monBootstrap() {
  var user = requireScope_('monster');
  
  var baseMap = monBaselineMap_();
  var bloods = monBloodLists_();
  var list = monReadAll_().map(function (m) {
    return {
      id: m.id,
      name: m.name,
      mon: m.mon,
      aura: m.aura,
      mainBlood: m.mainBlood,
      subBlood: m.subBlood,
      hasExplanation: !!m.explanation,
      visibleChars: m.visibleChars,
      indexable: m.indexable,
      author: m.author,
      releasedAt: m.releasedAt,
      updatedAt: m.updatedAt,
      arrayIndex: m.arrayIndex,
      url: m.url
    };
  });

  return {
    me: { nickname: user.nickname, role: user.role },
    memberNames: monMemberNames_(),
    threshold: MON_THRESHOLD,
    imageMaxBytes: MON_IMAGE_MAX_BYTES,
    auraList: MON_AURA_LIST,
    monList: MON_TYPE_LIST,
    mainBloodList: bloods ? bloods.main : [],
    subBloodList: bloods ? bloods.sub : [],
    baselineLoaded: !!baseMap,
    bloodsLoaded: !!bloods,
    monsters: list
  };
}

function api_monGet(id) {
  var user = requireScope_('monster');
  
  var target = pad4_(id);
  var all = monReadAll_();
  var m = null;
  for (var i = 0; i < all.length; i++) { if (all[i].id === target) { m = all[i]; break; } }
  if (!m) throw new Error('ID ' + target + ' が見つかりません');

  var baseMap = monBaselineMap_();
  m.overhead = monOverhead_(m, baseMap);
  m.baselineLoaded = !!(baseMap && baseMap[m.id] != null);
  return m;
}

function api_monPredictNewId(payload) {
  var user = requireScope_('monster');
    payload = payload || {};
  var all = monReadAll_();
  return {
    id: monPredictNewId_(payload.mainBlood, payload.subBlood, all),
    arrayIndex: all.reduce(function (max, monster) {
      return isFinite(monster.arrayIndex) && monster.arrayIndex > max ? monster.arrayIndex : max;
    }, -1) + 1
  };
}

function api_monCreateMonster(payload) {
  var user = requireScope_('monster');
    if (!user.nickname) {
    throw new Error('members シートのニックネームが空です。管理者に設定してもらってください。');
  }
  payload = payload || {};

  var name = String(payload.name || '').trim();
  var aura = String(payload.aura || '').trim();
  var mon = String(payload.mon || '').trim();
  var mainBlood = String(payload.mainBlood || '').trim();
  var subBlood = String(payload.subBlood || '').trim();

  if (!name) throw new Error('モンスター名を入れてください。');
  if (name.length > 60 || /[\r\n\t]/.test(name)) throw new Error('モンスター名の形式が不正です。');
  if (MON_AURA_LIST.indexOf(aura) < 0) throw new Error('オーラを選んでください。');
  if (MON_TYPE_LIST.indexOf(mon) < 0) throw new Error('モン類を選んでください。');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('他の保存処理と重なりました。少し待ってからやり直してください。');
  }

  try {
    var all = monReadAll_();
    for (var i = 0; i < all.length; i++) {
      if (all[i].name === name) {
        throw new Error('同じ名前のモンスターが既に登録されています（' + all[i].id + '）。');
      }
    }

    var id = monPredictNewId_(mainBlood, subBlood, all);
    if (payload.predictedId && pad4_(payload.predictedId) !== id) {
      throw new Error('IDの使用状況が変わりました。画面でIDを予測し直してください（現在の予測: ' + id + '）。');
    }
    var arrayIndex = all.reduce(function (max, monster) {
      return isFinite(monster.arrayIndex) && monster.arrayIndex > max ? monster.arrayIndex : max;
    }, -1) + 1;
    var updatedAt = today_();

    var row = [
      id, name, aura, mon, mainBlood, subBlood,
      false, '', '', '',
      '', '',
      0, false, 'draft',
      '', '', '', user.nickname, updatedAt,
      arrayIndex, ''
    ];
    if (row.length !== MON_HEADERS[MON_SHEET_MONSTERS].length) {
      throw new Error('新規行の列数がヘッダーと一致しません。');
    }

    var sh = monSheet_();
    var rowNumber = sh.getLastRow() + 1;
    sh.getRange(rowNumber, 1).setNumberFormat('@');
    sh.getRange(rowNumber, 10).setNumberFormat('@');
    sh.getRange(rowNumber, 17).setNumberFormat('@');
    sh.getRange(rowNumber, 20).setNumberFormat('@');
    sh.getRange(rowNumber, 1, 1, row.length).setValues([row]);

    var log = book_().getSheetByName(MON_SHEET_EDIT_LOG);
    if (log) log.appendRow([nowJst_(), id, user.nickname, '新規登録', 0, '']);

    return {
      ok: true,
      monster: {
        id: id,
        name: name,
        mon: mon,
        aura: aura,
        mainBlood: mainBlood,
        subBlood: subBlood,
        hasExplanation: false,
        visibleChars: 0,
        indexable: false,
        author: '',
        releasedAt: '',
        updatedAt: updatedAt,
        arrayIndex: arrayIndex,
        url: ''
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function monJsSingleQuoted_(value) {
  return "'" + String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n') + "'";
}

function monRenderDataRow_(monster) {
  return '  { name: ' + monJsSingleQuoted_(monster.name) +
    ', aura: ' + monJsSingleQuoted_(monster.aura) +
    ', limited: ' + (monster.limited ? 'true' : 'false') +
    ', limitedLabel: ' + monJsSingleQuoted_(monster.limitedLabel) +
    ', gwImg: ' + (monster.gwImg == null ? 'null' : String(monster.gwImg)) +
    ', localImg: ' + (monster.localImg ? monJsSingleQuoted_(monster.localImg) : 'null') +
    ', mon: ' + monJsSingleQuoted_(monster.mon) +
    ', mainMon: ' + monJsSingleQuoted_(monster.mainMon) +
    ', subMon: ' + monJsSingleQuoted_(monster.subMon) + ' },';
}

function monBuildPublishTextFiles_(all) {
  if (!all.length) throw new Error('monsters シートにデータがありません。');

  var seedResponse = UrlFetchApp.fetch(monSeedUrl_(), { muteHttpExceptions: true });
  if (seedResponse.getResponseCode() !== 200) {
    throw new Error('gwImg引き継ぎ用の cms-seed.json を取得できません（HTTP ' +
      seedResponse.getResponseCode() + '）。');
  }
  var seed = JSON.parse(seedResponse.getContentText());
  var gwImgById = {};
  (seed.monsters || []).forEach(function (monster) {
    gwImgById[pad4_(monster.id)] = monster.gwImg == null ? null : Number(monster.gwImg);
  });

  var byIndex = all.slice().sort(function (a, b) { return a.arrayIndex - b.arrayIndex; });
  var ids = {};
  var names = {};
  byIndex.forEach(function (monster, index) {
    if (!/^\d{4}$/.test(monster.id)) throw new Error('4桁でないIDがあります: ' + monster.id);
    if (Object.prototype.hasOwnProperty.call(ids, monster.id)) {
      throw new Error('IDが重複しています: ' + monster.id);
    }
    if (!monster.name) throw new Error('名前が空の行があります: ' + monster.id);
    if (Object.prototype.hasOwnProperty.call(names, monster.name)) {
      throw new Error('名前が重複しています: ' + monster.name);
    }
    if (!isFinite(monster.arrayIndex) || monster.arrayIndex !== index) {
      throw new Error('arrayIndexが0からの連番ではありません。期待値 ' + index +
        ' / 実際 ' + monster.arrayIndex + '（' + monster.id + ' ' + monster.name + '）');
    }
    if (MON_AURA_LIST.indexOf(monster.aura) < 0) {
      throw new Error('オーラが不正です: ' + monster.id + ' ' + monster.aura);
    }
    if (MON_TYPE_LIST.indexOf(monster.mon) < 0) {
      throw new Error('モン類が不正です: ' + monster.id + ' ' + monster.mon);
    }
    if (!monster.mainBlood || !monster.subBlood) {
      throw new Error('血統が空です: ' + monster.id + ' ' + monster.name);
    }
    if (monster.image && !/^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(monster.image)) {
      throw new Error('画像ファイル名が不正です: ' + monster.id + ' ' + monster.image);
    }
    if (/^[0-9]{4}\./.test(monster.image) && monster.image.slice(0, 4) !== monster.id) {
      throw new Error('別IDの画像を参照しています: ' + monster.id + ' → ' + monster.image);
    }
    ids[monster.id] = true;
    names[monster.name] = true;
  });

  var profiles = monProfileUrlsByNickname_();
  var editorial = {};
  byIndex.slice().sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); })
    .forEach(function (monster) {
      var formations = [];
      if (monster.formations) {
        try { formations = JSON.parse(monster.formations); }
        catch (e) { throw new Error(monster.id + ' の編成JSONが壊れています: ' + e.message); }
        if (!Array.isArray(formations)) {
          throw new Error(monster.id + ' の編成JSONが配列ではありません。');
        }
      }
      if (!monster.explanation && !formations.length) return;

      var entry = {
        id: monster.id,
        name: monster.name,
        arrayIndex: monster.arrayIndex,
        explanation: monster.explanation,
        explanationLength: monster.explanation.length,
        formations: formations
      };
      if (monster.author) {
        entry.author = monster.author;
        if (profiles[monster.author]) entry.authorUrl = profiles[monster.author];
      }
      var contributors = monster.contributors
        ? monster.contributors.split(',').map(function (name) { return name.trim(); }).filter(String)
        : [];
      if (contributors.length) entry.contributors = contributors;
      if (monster.createdAt) entry.createdAt = monster.createdAt;
      if (monster.updatedAt) entry.updatedAt = monster.updatedAt;
      if (monster.releasedAt) entry.releasedAt = monster.releasedAt;
      editorial[monster.id] = entry;
    });

  var monstersData = byIndex.map(function (monster) {
    return {
      name: monster.name,
      aura: monster.aura,
      limited: monster.limited === true,
      limitedLabel: monster.limitedLabel,
      gwImg: Object.prototype.hasOwnProperty.call(gwImgById, monster.id) ? gwImgById[monster.id] : null,
      localImg: monster.image || null,
      mon: monster.mon,
      mainMon: monster.mainBlood,
      subMon: monster.subBlood
    };
  });

  var exportedAt = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var editorialRoot = {
    generatedFrom: 'CMS spreadsheet via GAS',
    exportedAt: exportedAt,
    count: Object.keys(editorial).length,
    monsters: editorial
  };
  var idPredictionsRoot = {
    generatedFrom: 'CMS spreadsheet via GAS',
    exportedAt: exportedAt,
    count: byIndex.length,
    monsters: byIndex.map(function (monster) {
      return {
        id: monster.id,
        name: monster.name,
        arrayIndex: monster.arrayIndex
      };
    })
  };
  var monstersScript =
    '// LINEモンスターファーム徹底攻略 - モンスターデータ\n' +
    '// CMSが生成。配列順はarrayIndex順。直接編集しないでください。\n' +
    '// verify.jsの配列順ロックと互換の1行1モンスター形式。\n' +
    'const monstersData = [\n' +
    monstersData.map(monRenderDataRow_).join('\n') + '\n];\n';

  return {
    editorial: JSON.stringify(editorialRoot, null, 2) + '\n',
    monstersData: monstersScript,
    idPredictions: JSON.stringify(idPredictionsRoot, null, 2) + '\n',
    referencedImages: all.reduce(function (set, monster) {
      if (monster.image) set[monster.image] = true;
      return set;
    }, {})
  };
}

function api_monUploadImage(payload) {
  var user = requireScope_('monster');
    if (!user.nickname) {
    throw new Error('members シートのニックネームが空です。管理者に設定してもらってください。');
  }

  payload = payload || {};
  var mimeType = String(payload.mimeType || '').toLowerCase().trim();
  var extension = MON_IMAGE_MIME_EXT[mimeType];
  if (!extension) {
    throw new Error('対応形式は JPG・PNG・WebP の3種類です。');
  }

  var base64 = String(payload.base64 || '').replace(/\s+/g, '');
  var maxBase64Length = Math.ceil(MON_IMAGE_MAX_BYTES / 3) * 4 + 4;
  if (!base64 || base64.length > maxBase64Length) {
    throw new Error('画像は2MB以下にしてください。');
  }
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error('画像データが壊れています。ファイルを選び直してください。');
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (e) {
    throw new Error('画像データの復号に失敗しました。ファイルを選び直してください。');
  }
  if (!bytes.length || bytes.length > MON_IMAGE_MAX_BYTES) {
    throw new Error('画像は2MB以下にしてください。');
  }
  if (!isExpectedImage_(bytes, mimeType)) {
    throw new Error('ファイルの内容と画像形式が一致しません。正しい画像を選んでください。');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('他の保存処理と重なりました。少し待ってからやり直してください。');
  }

  var newFile = null;
  var trashedFiles = [];
  try {
    var target = pad4_(payload.id);
    if (!/^\d{4}$/.test(target)) throw new Error('モンスターIDが不正です。');

    var all = monReadAll_();
    var m = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === target) { m = all[i]; break; }
    }
    if (!m) throw new Error('ID ' + target + ' が見つかりません。');

    if (String(payload.baseUpdatedAt || '') !== m.updatedAt) {
      throw new Error('他の人がこのモンスターを更新しています（シート上の更新日: ' +
        (m.updatedAt || '空') + '）。画面を読み込み直してから編集してください。');
    }

    var filename = target + '.' + extension;
    var folder = monImageFolder_();
    var blob = Utilities.newBlob(bytes, mimeType, filename);

    // 新規ファイルを先に作り、成功してから旧ファイルをゴミ箱へ送る。
    // 作成失敗で旧画像まで失うことを防ぐ。
    newFile = folder.createFile(blob);
    // 過去に手動で置かれた別拡張子も含め、<4桁ID>.* は1件だけ残す。
    var sameId = new RegExp('^' + target + '\\.[^.]+$', 'i');
    var files = folder.getFiles();
    while (files.hasNext()) {
      var oldFile = files.next();
      if (oldFile.getId() === newFile.getId()) continue;
      if (!sameId.test(oldFile.getName())) continue;
      oldFile.setTrashed(true);
      trashedFiles.push(oldFile);
    }

    // C列〜T列を1回で書き戻し、I・S・T列だけ更新する。
    // 解説や著者情報は現在値をそのまま保つ。
    var sh = monSheet_();
    var blockRange = sh.getRange(m.row, 3, 1, 18);
    var block = blockRange.getValues()[0];
    var updatedAt = today_();
    block[6] = filename;       // I image
    block[16] = user.nickname; // S lastEditor
    block[17] = updatedAt;     // T updatedAt
    blockRange.setValues([block]);

    return {
      ok: true,
      id: target,
      image: filename,
      updatedAt: updatedAt,
      size: bytes.length
    };
  } catch (e) {
    // シート書き込みまで完了しなかった場合は、Drive側を元に戻す。
    if (newFile) {
      try { newFile.setTrashed(true); } catch (ignoreNew) { /* 復旧は次回手動確認 */ }
    }
    trashedFiles.forEach(function (file) {
      try { file.setTrashed(false); } catch (ignoreOld) { /* 復旧は次回手動確認 */ }
    });
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function api_monSave(payload) {
  var user = requireScope_('monster');
    if (!user.nickname) throw new Error('members シートのニックネームが空です。管理者に設定してもらってください。');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の保存処理と重なりました。少し待ってからやり直してください。');

  try {
    var target = pad4_(payload.id);
    var all = monReadAll_();
    var m = null;
    for (var i = 0; i < all.length; i++) { if (all[i].id === target) { m = all[i]; break; } }
    if (!m) throw new Error('ID ' + target + ' が見つかりません');

    // --- 同時編集の検出（設計書10章）
    if (String(payload.baseUpdatedAt || '') !== m.updatedAt) {
      throw new Error('他の人がこのモンスターを更新しています（シート上の更新日: ' +
        (m.updatedAt || '空') + '）。画面を読み込み直してから編集してください。');
    }

    // --- 入力の検査
    var explanation = String(payload.explanation == null ? '' : payload.explanation);
    var formations = String(payload.formations == null ? '' : payload.formations).trim();
    if (formations) {
      var parsed;
      try { parsed = JSON.parse(formations); }
      catch (e) { throw new Error('編成のJSONが壊れています: ' + e.message); }
      if (!Array.isArray(parsed)) throw new Error('編成は配列（[ ... ]）で書いてください');
      formations = JSON.stringify(parsed);
    }

    var aura = String(payload.aura || '').trim();
    var mon = String(payload.mon || '').trim();
    if (aura && MON_AURA_LIST.indexOf(aura) < 0) throw new Error('オーラの値が不正です: ' + aura);
    if (mon && MON_TYPE_LIST.indexOf(mon) < 0) throw new Error('モン類の値が不正です: ' + mon);

    var mainBlood = String(payload.mainBlood || '').trim();
    var subBlood = String(payload.subBlood || '').trim();
    var bloods = monBloodLists_();
    if (bloods) {
      if (mainBlood && bloods.main.indexOf(mainBlood) < 0) {
        throw new Error('主血統の値が不正です: ' + mainBlood);
      }
      if (subBlood && bloods.sub.indexOf(subBlood) < 0) {
        throw new Error('副血統の値が不正です: ' + subBlood);
      }
    }

    var releasedAt = String(payload.releasedAt || '').trim();
    if (releasedAt && !/^\d{4}-\d{2}(-\d{2})?$/.test(releasedAt)) {
      throw new Error('実装日は YYYY-MM-DD か YYYY-MM で入れてください: ' + releasedAt);
    }

    var mode = String(payload.authorMode || 'none');
    if (['author', 'ghost', 'contributor', 'none'].indexOf(mode) < 0) {
      throw new Error('著者の扱いが不正です: ' + mode);
    }

    // --- 著者情報の組み立て（設計書6-B章）
    var author = m.author;
    var contributors = m.contributors
      ? m.contributors.split(',').map(function (s) { return s.trim(); }).filter(String)
      : [];
    var createdAt = m.createdAt;
    var kind = '軽微';
    var recordedAuthor = '';

    function handOver_(newName) {
      // 著者が入れ替わるときは、元の著者を contributors に残す
      if (author && author !== newName && contributors.indexOf(author) < 0) {
        contributors.push(author);
      }
      author = newName;
    }

    if (mode === 'author') {
      kind = author ? (author === user.nickname ? '更新' : '著者引き継ぎ') : '初稿';
      handOver_(user.nickname);
    } else if (mode === 'ghost') {
      var ghost = String(payload.ghostName || '').trim();
      if (!ghost) throw new Error('代筆を選んだときは著者名を入れてください');
      if (ghost.length > 30) throw new Error('著者名が長すぎます');
      kind = '代筆';
      recordedAuthor = ghost;
      handOver_(ghost);
    } else if (mode === 'contributor') {
      kind = '加筆';
      if (author !== user.nickname && contributors.indexOf(user.nickname) < 0) {
        contributors.push(user.nickname);
      }
    }

    if (!createdAt && explanation && mode !== 'none') createdAt = today_();

    // --- 文字数の見込み（★ 判定そのものは build.js が行う）
    var baseMap = monBaselineMap_();
    var overhead = monOverhead_(m, baseMap);
    var predicted = overhead + countChars_(explanation);
    var indexable = predicted >= MON_THRESHOLD;

    // --- 書き込み（C列〜T列を1回で。image と status は今の値をそのまま戻す）
    var sh = monSheet_();
    var updatedAt = today_();

    var block = [
      aura,                       // C aura
      mon,                        // D mon
      mainBlood,                  // E mainBlood
      subBlood,                   // F subBlood
      payload.limited === true,   // G limited
      String(payload.limitedLabel || '').trim(), // H limitedLabel
      m.image,                    // I image（C4で扱う。ここでは触らない）
      releasedAt,                 // J releasedAt
      explanation,                // K explanation
      formations,                 // L formations
      predicted,                  // M visibleChars
      indexable,                  // N indexable
      m.status,                   // O status（C6で扱う。ここでは触らない）
      author,                     // P author
      createdAt,                  // Q createdAt
      contributors.join(', '),    // R contributors
      user.nickname,              // S lastEditor
      updatedAt                   // T updatedAt
    ];
    sh.getRange(m.row, 3, 1, block.length).setValues([block]);

    // --- 変更履歴
    var log = book_().getSheetByName(MON_SHEET_EDIT_LOG);
    if (log) log.appendRow([nowJst_(), target, user.nickname, kind, predicted, recordedAuthor]);

    return {
      ok: true,
      id: target,
      updatedAt: updatedAt,
      visibleChars: predicted,
      indexable: indexable,
      author: author,
      contributors: contributors,
      createdAt: createdAt,
      lastEditor: user.nickname,
      kind: kind
    };
  } finally {
    lock.releaseLock();
  }
}
