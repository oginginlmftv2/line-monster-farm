/** ライ徹CMS 統合ソース: 共通基盤。秘密値はScript Propertiesだけに置く。 */
var RAW_BASE = 'https://raw.githubusercontent.com/oginginlmftv2/line-monster-farm/main/src/data/';
var ENV_PRODUCTION = 'production';
var ENV_REHEARSAL = 'rehearsal';
var BOOK_MARKER_PREFIX = 'LMF CMS ';
var SHEET_MEMBERS = 'members';
var CORE_HEADERS = {};
CORE_HEADERS[SHEET_MEMBERS] = ['email', 'nickname', 'role', 'profileUrl', 'active', 'note', 'scopes'];

function prop_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error('スクリプトプロパティ ' + key + ' が未設定です。');
  return value;
}

function optionalProp_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function positiveIntProp_(key) {
  var raw = String(prop_(key)).trim();
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error('スクリプトプロパティ ' + key + ' は1以上の整数で設定してください。');
  }
  return Number(raw);
}

function env_() {
  var value = prop_('ENVIRONMENT');
  if (value !== ENV_PRODUCTION && value !== ENV_REHEARSAL) {
    throw new Error('ENVIRONMENT は production または rehearsal を設定してください（現在: ' + value + '）。');
  }
  return value;
}

function book_() {
  var book = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  var expected = BOOK_MARKER_PREFIX + env_();
  var members = book.getSheetByName(SHEET_MEMBERS);
  if (!members) throw new Error('members シートがありません。対象のスプレッドシートを確認してください。');
  var marker = String(members.getRange('A1').getNote() || '');
  if (marker !== expected) {
    throw new Error('スプレッドシートの環境マーカーが一致しません。期待「' + expected +
      '」／実際「' + (marker || '（なし）') + '」。SPREADSHEET_ID と ENVIRONMENT を確認してください。');
  }
  return book;
}

function tz_() { return 'Asia/Tokyo'; }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
// モンスターのセル値と公開コミット件名。verify-cms-source.jsの形式を変えない。
function nowJst_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
// アシスト3DBのupdatedAtとassist_log。
function nowIso_() { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function pad4_(value) { return ('0000' + String(value)).slice(-4); }

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

function countChars_(text) {
  return String(text == null ? '' : text).replace(/\s+/g, '').length;
}

function me_() {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (error) { email = ''; }
  if (!email) return null;
  var sheet = book_().getSheetByName(SHEET_MEMBERS);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var header = CORE_HEADERS[SHEET_MEMBERS];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (String(row[0] || '').trim().toLowerCase() !== email || String(row[4]).toLowerCase() === 'false' || row[4] === '') continue;
    return { email: email, nickname: String(row[1] || ''), role: String(row[2] || ''),
      profileUrl: String(row[3] || ''), scopes: String(row[6] || '').split(',').map(function (v) { return v.trim(); }).filter(Boolean) };
  }
  return null;
}

function requireScope_(scope) {
  var user = me_();
  if (!user) throw new Error('権限がありません。membersシートを確認してください。');
  if (user.scopes.indexOf(scope) < 0) {
    throw new Error('この操作の権限がありません（必要な範囲: ' + scope + '）。membersシートのscopes列へ monster / assist / monster,assist のいずれかを設定してください。');
  }
  return user;
}

function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function doGet(e) {
  var user = me_();
  if (!user) return HtmlService.createHtmlOutput('<h2>権限がありません</h2><p>管理者へmembersシートへの登録を依頼してください。</p>');
  var template = HtmlService.createTemplateFromFile('index');
  template.request = e || {};
  return template.evaluate().setTitle('ライ徹CMS').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function api_bootstrapShell() {
  var user = me_();
  if (!user) throw new Error('権限がありません。membersシートを確認してください。');
  var tabs = user.scopes.slice();
  if (env_() === ENV_PRODUCTION && user.role === 'admin') tabs.push('publish');
  return { environment: env_(), me: { nickname: user.nickname, role: user.role, scopes: user.scopes }, tabs: tabs };
}
