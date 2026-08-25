/** GASエディタから手で実行するセットアップだけを置く。 */
function allHeaders_() {
  var all = {};
  [CORE_HEADERS, MON_HEADERS, ASST_HEADERS].forEach(function (group) {
    Object.keys(group).forEach(function (name) {
      if (all[name]) throw new Error('シート名が重複しています: ' + name);
      all[name] = group[name];
    });
  });
  return all;
}

function setupTarget_() { var book = book_(); return 'ENVIRONMENT=' + env_() + ' / book=「' + book.getName() + '」'; }

function consumeDestructiveGrant_(operation) {
  var properties = PropertiesService.getScriptProperties();
  var granted = String(properties.getProperty('ALLOW_DESTRUCTIVE_SETUP') || '').trim();
  var expected = operation + ' ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  if (granted !== expected) throw new Error('この操作は既存データを全消去します。実行するには Script Properties へ ALLOW_DESTRUCTIVE_SETUP = "' + expected + '" を設定してください。実行後は自動で削除されます。');
  properties.deleteProperty('ALLOW_DESTRUCTIVE_SETUP');
}

function setup1_createSheets() {
  var target = setupTarget_();
  var book = book_(), headers = allHeaders_(), made = [], issues = [];
  Object.keys(headers).forEach(function (name) {
    var sheet = book.getSheetByName(name), expected = headers[name];
    if (!sheet) {
      sheet = book.insertSheet(name); sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
      sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, expected.length).setFontWeight('bold').setBackground('#f3ead7'); made.push(name); return;
    }
    var width = Math.max(sheet.getLastColumn(), 1);
    var actual = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (v) { return String(v || '').trim(); });
    if (actual.slice(0, expected.length).join('\0') !== expected.join('\0') || actual.slice(expected.length).some(Boolean)) issues.push(name + ': 列見出しが想定と異なります（変更していません）');
  });
  return target + '\n作成: ' + (made.join(', ') || 'なし') + '\n要確認: ' + (issues.join(' / ') || 'なし');
}

function setup2_registerMe() {
  var target = setupTarget_(), email = String(Session.getActiveUser().getEmail() || '').trim();
  if (!email) throw new Error('ログイン中のメールアドレスを取得できません。');
  var sheet = book_().getSheetByName(SHEET_MEMBERS);
  if (!String(sheet.getRange(1, 7).getValue() || '').trim()) sheet.getRange(1, 7).setValue('scopes');
  var existing = sheet.getDataRange().getValues(), found = false;
  existing.slice(1).forEach(function (row, index) {
    var sameUser = String(row[0]).toLowerCase() === email.toLowerCase();
    if (sameUser) found = true;
    if (!String(row[6] || '').trim()) sheet.getRange(index + 2, 7).setValue(sameUser ? 'monster,assist' : 'monster');
  });
  if (!found) sheet.appendRow([email, '管理者', 'admin', '', true, '統合CMS初期登録', 'monster,assist']);
  return target + '\n登録済み。membersシートのnicknameとscopesを確認してください。';
}

function monImportSeed_() {
  var ss = book_();
  var sh = ss.getSheetByName(MON_SHEET_MONSTERS);
  if (!sh) throw new Error('monsters シートがありません。先に setup1_createSheets を実行してください');

  if (sh.getLastRow() > 1) {
    throw new Error('monsters シートに既にデータがあります（' + (sh.getLastRow() - 1) + '行）。' +
      '上書きを避けるため中止しました。やり直す場合は setup3_resetMonsters を実行してください。');
  }

  var res = UrlFetchApp.fetch(monSeedUrl_(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('cms-seed.json の取得に失敗しました。HTTP ' + res.getResponseCode());
  }

  var seed = JSON.parse(res.getContentText());
  var list = seed.monsters;
  if (!Array.isArray(list) || !list.length) throw new Error('monsters が空です');

  var header = MON_HEADERS[MON_SHEET_MONSTERS];
  var rows = list.map(function (m) {
    return [
      m.id,
      m.name,
      m.aura,
      m.mon,
      m.mainBlood,
      m.subBlood,
      m.limited === true,
      m.limitedLabel || '',
      m.image || '',
      m.releasedAt || '',
      m.explanation || '',
      (m.formations && m.formations.length) ? JSON.stringify(m.formations) : '',
      m.current,
      m.indexable === true,
      'published',
      m.author || '',
      m.createdAt || '',
      (m.contributors || []).join(', '),
      '',
      m.updatedAt || '',
      m.arrayIndex,
      m.url
    ];
  });

  // ★ 書き込み前にテキスト書式を確定させる（0101 が 101 になるのを防ぐ）
  ['id', 'releasedAt', 'createdAt', 'updatedAt'].forEach(function (col) {
    var idx = header.indexOf(col);
    if (idx >= 0) sh.getRange(2, idx + 1, rows.length, 1).setNumberFormat('@');
  });

  sh.getRange(2, 1, rows.length, header.length).setValues(rows);

  // 解説列は折り返さない（1行が巨大になるのを防ぐ）
  sh.getRange(2, header.indexOf('explanation') + 1, rows.length, 1)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.getRange(2, header.indexOf('formations') + 1, rows.length, 1)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  var withExp = rows.filter(function (r) { return r[10]; }).length;
  var indexable = rows.filter(function (r) { return r[13]; }).length;

  var firstId = sh.getRange(2, 1).getDisplayValue();

  var msg = seed.count + '件中 ' + rows.length + '行を書き込みました。\n' +
            'A2の表示値: ' + firstId + '（0101 ならOK。101 なら書式の問題）\n' +
            '解説あり: ' + withExp + '件 / インデックス対象: ' + indexable + '件\n' +
            '（期待値: 348行 / 解説93件 / インデックス49件）';
  Logger.log(msg);
  return msg;
}
function monResetRows_() {
  var sh = book_().getSheetByName(MON_SHEET_MONSTERS);
  var last = sh.getLastRow();
  if (last <= 1) return 'データ行はありません';
  sh.deleteRows(2, last - 1);
  var msg = (last - 1) + '行を削除しました';
  Logger.log(msg);
  return msg;
}
function monCheck_() {
  var out = [];
  var sp = PropertiesService.getScriptProperties();

  ['SPREADSHEET_ID', 'DRIVE_FOLDER_ID'].forEach(function (k) {
    out.push(k + ': ' + (sp.getProperty(k) ? '設定済み' : '★未設定'));
  });

  try {
    out.push('実行ユーザー: ' + (Session.getActiveUser().getEmail() || '★取得できません'));
  } catch (e) {
    out.push('実行ユーザー: ★取得できません（' + e.message + '）');
  }

  var ss = book_();
  out.push('スプレッドシート: ' + ss.getName());

  Object.keys(MON_HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    out.push('  ' + name + ': ' + (sh ? (Math.max(0, sh.getLastRow() - 1)) + '行' : '★無し'));
  });

  try {
    var folder = DriveApp.getFolderById(sp.getProperty('DRIVE_FOLDER_ID'));
    out.push('Driveフォルダ: ' + folder.getName());
  } catch (e) {
    out.push('Driveフォルダ: ★開けません（' + e.message + '）');
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
function monUpgradeEditLog_() {
  var sh = book_().getSheetByName(MON_SHEET_EDIT_LOG);
  if (!sh) throw new Error('edit_log シートがありません');

  var want = MON_HEADERS[MON_SHEET_EDIT_LOG];
  var width = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (v) {
    return String(v || '').trim();
  });

  if (head.indexOf('記録した著者名') >= 0) {
    var msg0 = '既に「記録した著者名」列があります。変更なし。';
    Logger.log(msg0);
    return msg0;
  }

  var msg = '★edit_log に「記録した著者名」列がありません。既存の列見出しは変更していません。' +
    '想定列: ' + want.join(' / ');
  Logger.log(msg);
  return msg;
}
function asstFetchJson_(url) {
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('mainデータの取得に失敗しました（HTTP ' + response.getResponseCode() + '）。');
  }
  return JSON.parse(response.getContentText('UTF-8').replace(/^\uFEFF/, ''));
}

function asstMigrateCardsDocument_(doc) {
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
          { label: '応援効果', value: asstFormatStatValue_(oldStats.ouenKouka, true) },
          { label: '得意率', value: asstFormatStatValue_(oldStats.tokuiRitsu, true) },
          { label: '初期' + card.cardType, value: asstFormatStatValue_(oldStats.shokiStatus, false) }
        ];
      } else if (card.sapoRef && card.sapoRef.type === 'sub') {
        card.stats = [
          { label: '体力上限', value: asstFormatStatValue_(oldStats.hpLimit, false) },
          { label: '全ステ上限アップ', value: asstFormatStatValue_(oldStats.allStatLimitUp, false) },
          { label: 'チャレンジ効果アップ', value: asstFormatStatValue_(oldStats.challengeEffectUp, true) }
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

function asstFormatStatValue_(value, percent) {
  if (value === null || value === undefined || value === '') return null;
  return '+' + asstText_(value).replace(/^\+/, '').replace(/%$/, '') + (percent ? '%' : '');
}
function asstImportFromMain_() {
    var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の処理と重なりました。少し待って再実行してください。');
  try {
    var cardsDoc = asstMigrateCardsDocument_(asstFetchJson_(asstSourceUrls_().cards));
    var effectsDoc = asstFetchJson_(asstSourceUrls_().effects);
    var abilitiesDoc = asstFetchJson_(asstSourceUrls_().abilities);
    var issues = asstValidateDocuments_(cardsDoc, effectsDoc, abilitiesDoc);
    if (issues.length) throw new Error('mainデータ検査FAIL: ' + issues.slice(0, 10).join(' / '));

    var cardRows = cardsDoc.cards.map(function (card, index) {
      return [
        index + 1, card.cardId, card.name, card.rarity, card.aura, card.cardType,
        card.monType || '', card.image, card.event2 || '', card.releasedAt || '', card.accessoryStatus, asstJsonCell_(card.stats),
        asstJsonCell_(card.limitBreak), asstJsonCell_(card.ratings), card.explanation || '',
        asstJsonCell_(card.formations || []), asstJsonCell_(card.sapoRef), 1, '', ''
      ];
    });

    var effectRows = [];
    cardsDoc.cards.forEach(function (card) {
      var group = effectsDoc.cards[card.cardId];
      if (!group.effects.length) {
        effectRows.push([card.cardId, '', '', '', '', '', '', '']);
      } else {
        group.effects.forEach(function (effect) {
          effectRows.push([
            card.cardId, effect.effectId, effect.name, effect.description,
            effect.unlockRank, effect.sortOrder, '', ''
          ]);
        });
      }
    });

    var abilityRows = abilitiesDoc.abilities.map(function (ability, index) {
      return [
        index + 1, ability.abilityId, ability.legacyId,
        ability.cardId || '', ability.sourceName, ability.name, ability.description,
        ability.source, ability.rarity || '', asstJsonCell_(ability.tags || []),
        ability.sortOrder === null ? '' : ability.sortOrder, ability.linkStatus,
        asstJsonCell_(ability.flags || []), ability.status, 1, '', ''
      ];
    });

    asstRewriteSheet_(ASST_SHEET_CARDS, cardRows);
    asstRewriteSheet_(ASST_SHEET_EFFECTS, effectRows);
    asstRewriteSheet_(ASST_SHEET_ABILITIES, abilityRows);
    asstAppendLog_({ nickname: 'setup' }, 'import', 'PASS',
      'cards=' + cardRows.length + ' effects=' + effectRows.length + ' abilities=' + abilityRows.length);
    return 'mainから統合CMSへ取り込みました: カード' + cardRows.length + ' / 効果行' +
      effectRows.length + ' / 能力' + abilityRows.length;
  } finally {
    lock.releaseLock();
  }
}
function asstCheck_() {
    var docs = asstBuildDocuments_();
  var issues = asstValidateDocuments_(docs.cards, docs.effects, docs.abilities)
    .concat(asstValidateImageFiles_(docs.cards.cards));
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
function asstCreateImageFolder_() {
    var folderId = optionalProp_('ASSIST_IMAGE_FOLDER_ID');
  if (!folderId) throw new Error('先に管理者が作成したアシスト画像フォルダのIDをASSIST_IMAGE_FOLDER_IDへ設定してください。');
  var root = DriveApp.getFolderById(folderId);
  asstAppendLog_({ nickname: 'setup' }, 'prepare-assist-image-folder', 'PASS', root.getName());
  return { configured: true, folderName: root.getName() };
}

function asstRewriteSheet_(name, values) {
  var sheet = asstSheet_(name), headers = ASST_HEADERS[name];
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function setup3_importMonsterSeed() {
  var target = setupTarget_();
  consumeDestructiveGrant_('setup3_importMonsterSeed');
  return target + '\n' + monImportSeed_();
}
function setup3_resetMonsters() {
  var target = setupTarget_();
  consumeDestructiveGrant_('setup3_resetMonsters');
  return target + '\n' + monResetRows_();
}
function setup3_importAssistFromMain() {
  var target = setupTarget_();
  consumeDestructiveGrant_('setup3_importAssistFromMain');
  return target + '\n' + asstImportFromMain_();
}
function setup4_checkAll() { var target = setupTarget_(); return target + '\n[monster]\n' + monCheck_() + '\n[assist]\n' + JSON.stringify(asstCheck_(), null, 2); }
function setup5_upgradeMonsterEditLog() { var target = setupTarget_(); return target + '\n' + monUpgradeEditLog_(); }
function setup5_createAssistImageFolder() { var target = setupTarget_(); return target + '\n' + JSON.stringify(asstCreateImageFolder_()); }
