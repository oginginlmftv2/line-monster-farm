/** モン類の文（運営者のひとこと）と掲載するアシストカード。シート mon_types が正で、
 *  モンスター公開のときに src/data/taxonomy.json として書き出す。
 *  GitHub送信は30_publish.gsだけに置く。ページへの出し方は docs/build-spec.md 3-3・5-3。 */
var MONTYPE_SHEET = 'mon_types';
var MONTYPE_ORDER = ['souzou', 'genrei', 'mazoku', 'kemono', 'kaibutsu', 'muki'];
var MONTYPE_GENERATED_FROM = 'CMS mon_types シート（モンスター公開でGASが書き出す。リポジトリで直接編集しない）';
var MONTYPE_LIMITS = { sections: 10, items: 20, heading: 40, subheading: 60, body: 2000, cardGroups: 6, cards: 20 };
var MONTYPE_HEADERS = {};
MONTYPE_HEADERS[MONTYPE_SHEET] = ['monSlug', 'name', 'sectionsJson', 'cardGroupsJson', 'updatedAt', 'lastEditor', 'editedAt'];

function monTypeSheet_() {
  var sheet = book_().getSheetByName(MONTYPE_SHEET);
  if (!sheet) throw new Error(MONTYPE_SHEET + ' シートがありません。setup1_createSheets を実行してください。');
  return sheet;
}

function monTypeText_(value) {
  return String(value == null ? '' : value).trim();
}

// シートの日付セルは Date で返ることがあるので YYYY-MM-DD にそろえる
function monTypeDateCell_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, tz_(), 'yyyy-MM-dd');
  }
  return monTypeText_(value);
}

function monTypeReadAll_() {
  var sheet = monTypeSheet_();
  var headers = MONTYPE_HEADERS[MONTYPE_SHEET];
  var width = Math.max(sheet.getLastColumn(), 1);
  var actual = sheet.getRange(1, 1, 1, width).getValues()[0].map(monTypeText_);
  if (actual.slice(0, headers.length).join('\0') !== headers.join('\0')) {
    throw new Error(MONTYPE_SHEET + ' シートの列見出しが想定と異なります: ' + actual.join(', '));
  }
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function (row, index) {
    var parse = function (value, label) {
      try { return JSON.parse(monTypeText_(value) || '[]'); } catch (error) {
        throw new Error(MONTYPE_SHEET + ' の ' + (index + 2) + ' 行目の ' + label + ' が読めません: ' + error.message);
      }
    };
    return {
      _row: index + 2,
      monSlug: monTypeText_(row[0]),
      name: monTypeText_(row[1]),
      sections: parse(row[2], 'sectionsJson'),
      cardGroups: parse(row[3], 'cardGroupsJson'),
      updatedAt: monTypeDateCell_(row[4]),
      lastEditor: monTypeText_(row[5]),
      editedAt: monTypeText_(row[6])
    };
  }).filter(function (row) { return row.monSlug; });
}

// 公開済みのカード（準備中を除く）。本文につなぐカードはこの中からだけ選べる
function monTypePublicCards_() {
  var source = asstFetchJson_(RAW_BASE + 'assist-cards.json');
  return (source.cards || []).filter(function (card) { return card.hidden !== true; }).map(function (card) {
    return { cardId: monTypeText_(card.cardId), name: monTypeText_(card.name), rarity: monTypeText_(card.rarity), cardType: monTypeText_(card.cardType) };
  });
}

// 運営者の文を taxonomy.json の形へそろえる。カードは文に持たせず、掲載カード（cardGroups）で選ぶ
function monTypeNormalizeSections_(sections) {
  if (!Array.isArray(sections)) throw new Error('sections は配列で渡してください。');
  if (sections.length > MONTYPE_LIMITS.sections) throw new Error('見出しは' + MONTYPE_LIMITS.sections + '個までです。');
  return sections.map(function (section, sectionIndex) {
    var where = (sectionIndex + 1) + '番目の見出し';
    var heading = monTypeText_(section && section.heading);
    if (!heading) throw new Error(where + 'の見出しが空です。');
    if (heading.length > MONTYPE_LIMITS.heading) throw new Error(where + 'は' + MONTYPE_LIMITS.heading + '字までです。');
    var items = section && Array.isArray(section.items) ? section.items : [];
    if (!items.length) throw new Error(where + '「' + heading + '」に本文がありません。');
    if (items.length > MONTYPE_LIMITS.items) throw new Error(where + 'の項目は' + MONTYPE_LIMITS.items + '件までです。');
    return {
      heading: heading,
      items: items.map(function (item, itemIndex) {
        var label = '「' + heading + '」の' + (itemIndex + 1) + '件目';
        var subheading = monTypeText_(item && item.subheading);
        var body = String(item && item.body != null ? item.body : '').replace(/\r\n?/g, '\n').trim();
        if (!body) throw new Error(label + 'の本文が空です。');
        if (subheading.length > MONTYPE_LIMITS.subheading) throw new Error(label + 'の小見出しは' + MONTYPE_LIMITS.subheading + '字までです。');
        if (body.length > MONTYPE_LIMITS.body) throw new Error(label + 'の本文は' + MONTYPE_LIMITS.body + '字までです。');
        return { subheading: subheading || null, body: body };
      })
    };
  });
}

// 掲載するアシストカード。どのカードを載せるか（モン類に効くか・オーラに効くか・どのモン類の師匠か）は
// 機械では決められないので、見出しとカードIDを運営者が選ぶ。cardIdSet を渡したときだけ公開中かを確かめる
function monTypeNormalizeCardGroups_(groups, cardIdSet) {
  if (!Array.isArray(groups)) throw new Error('cardGroups は配列で渡してください。');
  if (groups.length > MONTYPE_LIMITS.cardGroups) throw new Error('カードの見出しは' + MONTYPE_LIMITS.cardGroups + '個までです。');
  return groups.map(function (group, groupIndex) {
    var heading = monTypeText_(group && group.heading);
    var where = 'カードの見出し' + (groupIndex + 1) + (heading ? '「' + heading + '」' : '');
    if (!heading) throw new Error(where + 'が空です。');
    if (heading.length > MONTYPE_LIMITS.heading) throw new Error(where + 'は' + MONTYPE_LIMITS.heading + '字までです。');
    var cardIds = group && Array.isArray(group.cardIds) ? group.cardIds.map(monTypeText_).filter(Boolean) : [];
    cardIds = cardIds.filter(function (id, index) { return cardIds.indexOf(id) === index; });
    if (!cardIds.length) throw new Error(where + 'にカードがありません。');
    if (cardIds.length > MONTYPE_LIMITS.cards) throw new Error(where + 'のカードは' + MONTYPE_LIMITS.cards + '枚までです。');
    if (cardIdSet) {
      cardIds.forEach(function (id) {
        if (!cardIdSet[id]) throw new Error(where + 'のカードID ' + id + ' は公開中のアシストカードにありません。');
      });
    }
    return { heading: heading, cardIds: cardIds };
  });
}

function monTypeValidDate_(value) {
  var text = monTypeText_(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('最終更新日は YYYY-MM-DD で入力してください。');
  if (text > today_()) throw new Error('最終更新日に未来の日付は入れられません。');
  return text;
}

// 公開用の taxonomy.json。シートが無い・空なら null を返し、公開には含めない（setup前でもモンスター公開を止めない）
function monTypeBuildPublishText_() {
  var sheet = book_().getSheetByName(MONTYPE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var rows = monTypeReadAll_();
  var bySlug = {};
  rows.forEach(function (row) {
    if (MONTYPE_ORDER.indexOf(row.monSlug) < 0) throw new Error(MONTYPE_SHEET + ' に未知のモン類があります: ' + row.monSlug);
    if (bySlug[row.monSlug]) throw new Error(MONTYPE_SHEET + ' にモン類が重複しています: ' + row.monSlug);
    bySlug[row.monSlug] = row;
  });
  var monTypes = {};
  MONTYPE_ORDER.forEach(function (slug) {
    var row = bySlug[slug];
    if (!row) throw new Error(MONTYPE_SHEET + ' に ' + slug + ' の行がありません。行を消さずに本文を空にしてください。');
    var entry = {
      name: row.name,
      updatedAt: row.updatedAt,
      sections: monTypeNormalizeSections_(row.sections),
      cardGroups: monTypeNormalizeCardGroups_(row.cardGroups, null)
    };
    if (!entry.name) throw new Error(MONTYPE_SHEET + ' の ' + slug + ' に名前がありません。');
    if (entry.sections.length || entry.cardGroups.length) monTypeValidDate_(entry.updatedAt);
    monTypes[slug] = entry;
  });
  return JSON.stringify({ generatedFrom: MONTYPE_GENERATED_FROM, monTypes: monTypes }, null, 2) + '\n';
}

// 初回だけ、mainの taxonomy.json をシートへ取り込む。シートに行があれば何もしない（上書きしない）
function monTypeImportFromMain_() {
  var sheet = monTypeSheet_();
  if (sheet.getLastRow() >= 2) return MONTYPE_SHEET + ' にはすでに行があります。取り込みは行いませんでした。';
  var doc = asstFetchJson_(RAW_BASE + 'taxonomy.json');
  var monTypes = doc.monTypes || {};
  var editedAt = nowIso_();
  var values = MONTYPE_ORDER.map(function (slug) {
    var entry = monTypes[slug];
    if (!entry || !entry.name) throw new Error('taxonomy.json に ' + slug + ' がありません。');
    var sections = monTypeNormalizeSections_(entry.sections || []);
    var cardGroups = monTypeNormalizeCardGroups_(entry.cardGroups || [], null);
    return [slug, entry.name, JSON.stringify(sections), JSON.stringify(cardGroups), monTypeText_(entry.updatedAt), 'import', editedAt];
  });
  sheet.getRange(2, 1, values.length, values[0].length).setNumberFormat('@').setValues(values);
  return MONTYPE_SHEET + ' に ' + values.length + ' 行を取り込みました。';
}

function api_monTypeList() {
  requireScope_('monster');
  var rows = monTypeReadAll_();
  if (!rows.length) throw new Error(MONTYPE_SHEET + ' が空です。管理者が setup3_importMonTypesFromMain を実行してください。');
  rows.sort(function (a, b) { return MONTYPE_ORDER.indexOf(a.monSlug) - MONTYPE_ORDER.indexOf(b.monSlug); });
  return {
    rows: rows.map(function (row) {
      return { monSlug: row.monSlug, name: row.name, sections: row.sections, cardGroups: row.cardGroups, updatedAt: row.updatedAt, lastEditor: row.lastEditor, editedAt: row.editedAt };
    }),
    cards: monTypePublicCards_(),
    today: today_()
  };
}

function api_monTypeSave(payload) {
  var user = requireScope_('monster');
  if (!user.nickname) throw new Error('membersシートのニックネームが空です。');
  payload = payload || {};
  var monSlug = monTypeText_(payload.monSlug);
  if (MONTYPE_ORDER.indexOf(monSlug) < 0) throw new Error('モン類が不正です: ' + monSlug);
  var cardIdSet = {};
  monTypePublicCards_().forEach(function (card) { cardIdSet[card.cardId] = true; });
  var sections = monTypeNormalizeSections_(payload.sections);
  var cardGroups = monTypeNormalizeCardGroups_(payload.cardGroups || [], cardIdSet);
  var updatedAt = sections.length || cardGroups.length ? monTypeValidDate_(payload.updatedAt) : monTypeText_(payload.updatedAt);
  // スプレッドシートの1セルは5万字まで。余裕を見て止める
  if (JSON.stringify(sections).length > 45000 || JSON.stringify(cardGroups).length > 45000) throw new Error('本文が長すぎて1セルに収まりません。項目を減らしてください。');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の保存処理と重なりました。少し待ってからやり直してください。');
  try {
    var current = monTypeReadAll_().filter(function (row) { return row.monSlug === monSlug; })[0];
    if (!current) throw new Error(MONTYPE_SHEET + ' に ' + monSlug + ' の行がありません。');
    if (monTypeText_(payload.baseEditedAt) !== current.editedAt) {
      throw new Error('他の人がこのモン類を更新しています。画面を読み込み直してください。');
    }
    var editedAt = nowIso_();
    monTypeSheet_().getRange(current._row, 3, 1, 5).setNumberFormat('@')
      .setValues([[JSON.stringify(sections), JSON.stringify(cardGroups), updatedAt, user.nickname, editedAt]]);
    return { ok: true, monSlug: monSlug, sections: sections, cardGroups: cardGroups, updatedAt: updatedAt, lastEditor: user.nickname, editedAt: editedAt };
  } finally {
    lock.releaseLock();
  }
}
