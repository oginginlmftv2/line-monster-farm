/**
 * ライ徹CMS - サーバー側スクリプト
 *
 * リポジトリの cms/gas/コード.gs が正です。
 * GASエディタで直接書き換えないこと（差分が失われます）。
 *
 * 秘密情報はこのファイルに書かない。すべてスクリプトプロパティから読む。
 *
 * 構成
 *   第1部 定数と共通処理
 *   第2部 セットアップ用（C3-1。一度実行したらもう触らない）
 *   第3部 管理画面（C3-2 + C4 + C5 + C6 + C7 + C8）
 */

// ================================================================
// 第1部 定数と共通処理
// ================================================================

var RAW_BASE =
  'https://raw.githubusercontent.com/oginginlmftv2/line-monster-farm/main/src/data/';

var SEED_URL = RAW_BASE + 'cms-seed.json';
var BASELINE_URL = RAW_BASE + 'page-baseline.json';
var AVAILABILITY_URL = RAW_BASE + 'id-availability.json';

var GITHUB_OWNER = 'oginginlmftv2';
var GITHUB_REPO = 'line-monster-farm';
var GITHUB_MAIN_BRANCH = 'main';
var GITHUB_PUBLISH_BRANCH = 'cms/publish';
var GITHUB_API_BASE =
  'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO;

var THRESHOLD = 800;   // インデックス対象の可視文字数。正は build.js

var IMAGE_FOLDER_NAME = 'monster';
var IMAGE_MAX_BYTES = 2 * 1024 * 1024;
var IMAGE_MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

var SHEET_MONSTERS = 'monsters';
var SHEET_MEMBERS = 'members';
var SHEET_EDIT_LOG = 'edit_log';
var SHEET_PUBLISH_LOG = 'publish_log';

var HEADERS = {};

HEADERS[SHEET_MONSTERS] = [
  'id', 'name', 'aura', 'mon', 'mainBlood', 'subBlood',
  'limited', 'limitedLabel', 'image', 'releasedAt',
  'explanation', 'formations',
  'visibleChars', 'indexable', 'status',
  'author', 'createdAt', 'contributors', 'lastEditor', 'updatedAt',
  'arrayIndex', 'url'
];

HEADERS[SHEET_MEMBERS] = ['email', 'nickname', 'role', 'profileUrl', 'active', 'note'];

HEADERS[SHEET_EDIT_LOG] = ['日時', 'モンスターID', '編集者', '種別', '文字数', '記録した著者名'];

HEADERS[SHEET_PUBLISH_LOG] = ['日時', '実行者', 'コミットSHA', '結果', '詳細'];

var AURA_LIST = ['赤', '青', '黄', '黒', '白', '緑'];
var MON_LIST = ['創造', '幻霊', '魔族', '獣族', '怪物', '無機'];

// ---------------------------------------------------------------- 設定の読み出し

function prop_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('スクリプトプロパティ ' + key + ' が未設定です');
  return v;
}

function book_() {
  return SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
}

function tz_() {
  return 'Asia/Tokyo';
}

function today_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
}

function now_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss');
}

function pad4_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  while (s.length < 4) s = '0' + s;
  return s;
}

function byteAt_(bytes, index) {
  return bytes[index] & 255;
}

/**
 * MIMEタイプとバイナリ先頭が一致するか確認する。
 * 拡張子とMIMEタイプの申告だけを信頼しない。
 */
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

/**
 * DRIVE_FOLDER_ID が指す「ライ徹_画像」直下の monster フォルダを返す。
 * 未作成の場合は初回アップロード時に作成する。
 */
function monsterImageFolder_() {
  var root = DriveApp.getFolderById(prop_('DRIVE_FOLDER_ID'));
  var folders = root.getFoldersByName(IMAGE_FOLDER_NAME);
  if (!folders.hasNext()) return root.createFolder(IMAGE_FOLDER_NAME);

  var folder = folders.next();
  if (folders.hasNext()) {
    throw new Error('「ライ徹_画像」直下に monster フォルダが複数あります。1つに整理してください。');
  }
  return folder;
}

/**
 * 可視文字数の数え方。build.js の visibleChars() と同じく空白を落とす。
 * ★ index.html にも同じ関数がある（入力中の即時表示用）。片方だけ直さないこと。
 */
function countChars_(text) {
  return String(text == null ? '' : text).replace(/\s+/g, '').length;
}

// ---------------------------------------------------------------- GitHub API（C6）

/**
 * GitHub REST APIを呼ぶ。トークンはレスポンス・ログ・例外へ出さない。
 */
function githubRequest_(method, path, body, allow404) {
  var token = prop_('GITHUB_TOKEN');
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (body != null) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }

  var response = UrlFetchApp.fetch(GITHUB_API_BASE + path, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (allow404 && code === 404) return null;
  if (code < 200 || code >= 300) {
    var message = '';
    try { message = String(JSON.parse(text).message || ''); } catch (ignore) { message = ''; }
    throw new Error('GitHub APIでエラーが発生しました（HTTP ' + code +
      (message ? ' / ' + message : '') + '）。');
  }
  if (!text) return {};
  try { return JSON.parse(text); } catch (e) { return { text: text }; }
}

function githubRef_(branch, allow404) {
  return githubRequest_('get', '/git/ref/heads/' + branch, null, allow404 === true);
}

function githubBlob_(content, encoding) {
  var result = githubRequest_('post', '/git/blobs', {
    content: content,
    encoding: encoding
  });
  if (!result.sha) throw new Error('GitHubのblob作成結果にSHAがありません。');
  return result.sha;
}

/**
 * membersから著者リンクだけを取り出す。メールアドレスは戻り値に含めない。
 * inactiveの過去著者も、著者ページへのリンクを維持するため対象にする。
 */
function profileUrlsByNickname_() {
  var sh = book_().getSheetByName(SHEET_MEMBERS);
  var map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS[SHEET_MEMBERS].length).getValues();
  values.forEach(function (row) {
    var nickname = String(row[1] || '').trim();
    var profileUrl = String(row[3] || '').trim();
    if (nickname && profileUrl) map[nickname] = profileUrl;
  });
  return map;
}

function publishLog_(user, sha, result, detail) {
  var sh = book_().getSheetByName(SHEET_PUBLISH_LOG);
  if (!sh) return;
  sh.appendRow([
    now_(),
    user.nickname,
    String(sha || ''),
    String(result || ''),
    String(detail || '').slice(0, 1000)
  ]);
}

function setAllPublishStatus_(status) {
  var sh = monstersSheet_();
  var count = Math.max(0, sh.getLastRow() - 1);
  if (!count) return;
  sh.getRange(2, 15, count, 1).setValues(
    Array.apply(null, Array(count)).map(function () { return [status]; })
  );
}

function publishLogRows_() {
  var sh = book_().getSheetByName(SHEET_PUBLISH_LOG);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getDisplayValues();
}

function recordedPublishResult_(sha) {
  var rows = publishLogRows_();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][2] !== sha) continue;
    if (rows[i][3] === '公開成功' || rows[i][3] === '公開失敗') {
      return {
        state: rows[i][3] === '公開成功' ? 'success' : 'failure',
        sha: sha,
        shortSha: sha.slice(0, 7),
        message: rows[i][4]
      };
    }
  }
  return null;
}

function sentPublishUser_(sha) {
  var rows = publishLogRows_();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][2] === sha &&
        (rows[i][3] === '送信済み' || rows[i][3] === 'GitHub送信済み・後処理失敗')) {
      return { nickname: rows[i][1] };
    }
  }
  return null;
}

function latestPublishSha_() {
  var rows = publishLogRows_();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (/^[0-9a-f]{40}$/i.test(rows[i][2])) return rows[i][2].toLowerCase();
  }
  return '';
}

function cmsPublishRun_(sha) {
  var path = '/actions/workflows/cms-publish.yml/runs' +
    '?branch=' + encodeURIComponent(GITHUB_PUBLISH_BRANCH) +
    '&event=push&per_page=20';
  var result = githubRequest_('get', path, null, false);
  var runs = result.workflow_runs || [];
  for (var i = 0; i < runs.length; i++) {
    if (String(runs[i].head_sha || '').toLowerCase() === sha) return runs[i];
  }
  return null;
}

function failedActionDetail_(run) {
  var result = githubRequest_('get', '/actions/runs/' + run.id + '/jobs?per_page=100', null, false);
  var jobs = result.jobs || [];
  var failedJob = null;
  var failedStep = null;
  for (var i = 0; i < jobs.length && !failedStep; i++) {
    if (jobs[i].conclusion && jobs[i].conclusion !== 'success' && !failedJob) failedJob = jobs[i];
    var steps = jobs[i].steps || [];
    for (var j = 0; j < steps.length; j++) {
      if (steps[j].conclusion && steps[j].conclusion !== 'success' && steps[j].conclusion !== 'skipped') {
        failedJob = jobs[i];
        failedStep = steps[j];
        break;
      }
    }
  }
  var place = failedJob ? failedJob.name : 'Build, verify, and publish';
  if (failedStep) place += ' > ' + failedStep.name;
  return 'GitHub Actions: ' + String(run.conclusion || 'failure') +
    ' / ' + place + ' / ' + run.html_url;
}

function publishStatus_(sha) {
  sha = String(sha || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('確認するコミットSHAが正しくありません。');

  var recorded = recordedPublishResult_(sha);
  if (recorded) return recorded;
  var sentUser = sentPublishUser_(sha);
  if (!sentUser) throw new Error('publish_log に送信記録がないコミットです。');

  var run = cmsPublishRun_(sha);
  if (!run) {
    return { state: 'queued', sha: sha, shortSha: sha.slice(0, 7), message: 'Actionsの開始待ちです。' };
  }
  if (run.status !== 'completed') {
    return {
      state: run.status === 'queued' ? 'queued' : 'in_progress',
      sha: sha,
      shortSha: sha.slice(0, 7),
      message: 'GitHub Actionsでビルド・検証中です。',
      url: run.html_url
    };
  }

  var success = run.conclusion === 'success';
  var detail;
  if (success) {
    var mainRef = githubRef_(GITHUB_MAIN_BRANCH, false);
    var mainSha = mainRef && mainRef.object ? String(mainRef.object.sha || '') : '';
    detail = 'GitHub Actions成功 / main ' + mainSha.slice(0, 7) +
      ' / run #' + run.run_number + ' / ' + run.html_url;
  } else {
    detail = failedActionDetail_(run);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recorded = recordedPublishResult_(sha);
    if (recorded) return recorded;
    setAllPublishStatus_(success ? 'published' : 'publish_failed');
    publishLog_(sentUser, sha, success ? '公開成功' : '公開失敗', detail);
  } finally {
    lock.releaseLock();
  }

  return {
    state: success ? 'success' : 'failure',
    sha: sha,
    shortSha: sha.slice(0, 7),
    message: detail,
    url: run.html_url
  };
}

// ================================================================
// 第2部 セットアップ用（C3-1）
// ================================================================

/**
 * 4つのシートをヘッダー付きで作成する。
 * 既にあるシートには触らない（データを消さないため）。
 */
function setup1_createSheets() {
  var ss = book_();
  var made = [];
  var skipped = [];

  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh) { skipped.push(name); return; }

    sh = ss.insertSheet(name);
    var header = HEADERS[name];
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.getRange(1, 1, 1, header.length)
      .setFontWeight('bold')
      .setBackground('#f0f0f0');
    sh.setFrozenRows(1);

    // ★ 先頭ゼロが消えないよう、文字列として扱う列をテキスト書式にする
    if (name === SHEET_MONSTERS) {
      var textCols = ['id', 'releasedAt', 'createdAt', 'updatedAt'];
      textCols.forEach(function (col) {
        var idx = header.indexOf(col);
        if (idx >= 0) sh.getRange(1, idx + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      });
    }

    made.push(name);
  });

  // 既定の「シート1」が空のまま残っていたら削除する
  var first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) {
    ss.deleteSheet(first);
  }

  var msg = '作成: ' + (made.join(', ') || 'なし') +
            '\nスキップ（既存）: ' + (skipped.join(', ') || 'なし');
  Logger.log(msg);
  return msg;
}

/**
 * 実行した本人を members シートに admin として登録する。
 * 既に登録されていれば何もしない。
 */
function setup2_registerMe() {
  var email = Session.getActiveUser().getEmail();
  if (!email) {
    throw new Error('メールアドレスが取得できませんでした。' +
      'GASエディタから実行し、権限の承認を済ませてください。');
  }

  var sh = book_().getSheetByName(SHEET_MEMBERS);
  if (!sh) throw new Error('members シートがありません。先に setup1_createSheets を実行してください');

  var last = sh.getLastRow();
  if (last >= 2) {
    var existing = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][0]).trim().toLowerCase() === email.toLowerCase()) {
        var msg0 = email + ' は既に登録されています';
        Logger.log(msg0);
        return msg0;
      }
    }
  }

  sh.appendRow([email, 'ぎん', 'admin', '/profile.html', true, '初期登録']);
  var msg = email + ' を admin として登録しました。\n' +
            'ニックネームが「ぎん」でよければそのまま、違う場合は members シートのB列を直してください。';
  Logger.log(msg);
  return msg;
}

/**
 * GitHub から cms-seed.json を取得し、monsters シートに348行を書き込む。
 * 既にデータ行がある場合は中止する（上書き事故を防ぐため）。
 */
function setup3_importSeed() {
  var ss = book_();
  var sh = ss.getSheetByName(SHEET_MONSTERS);
  if (!sh) throw new Error('monsters シートがありません。先に setup1_createSheets を実行してください');

  if (sh.getLastRow() > 1) {
    throw new Error('monsters シートに既にデータがあります（' + (sh.getLastRow() - 1) + '行）。' +
      '上書きを避けるため中止しました。やり直す場合は setup3_resetMonsters を実行してください。');
  }

  var res = UrlFetchApp.fetch(SEED_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('cms-seed.json の取得に失敗しました。HTTP ' + res.getResponseCode());
  }

  var seed = JSON.parse(res.getContentText());
  var list = seed.monsters;
  if (!Array.isArray(list) || !list.length) throw new Error('monsters が空です');

  var header = HEADERS[SHEET_MONSTERS];
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

/**
 * monsters シートのデータ行を全消しする。やり直し用。
 * ヘッダー行は残す。
 */
function setup3_resetMonsters() {
  var sh = book_().getSheetByName(SHEET_MONSTERS);
  var last = sh.getLastRow();
  if (last <= 1) return 'データ行はありません';
  sh.deleteRows(2, last - 1);
  var msg = (last - 1) + '行を削除しました';
  Logger.log(msg);
  return msg;
}

/**
 * 設定と取り込み結果をまとめて確認する。
 */
function setup4_check() {
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

  Object.keys(HEADERS).forEach(function (name) {
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

/**
 * C3-2 で edit_log に「記録した著者名」列を足す。
 * 既に列があれば何もしない。何度実行しても安全。
 */
function setup5_upgradeEditLog() {
  var sh = book_().getSheetByName(SHEET_EDIT_LOG);
  if (!sh) throw new Error('edit_log シートがありません');

  var want = HEADERS[SHEET_EDIT_LOG];
  var width = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (v) {
    return String(v || '').trim();
  });

  if (head.indexOf('記録した著者名') >= 0) {
    var msg0 = '既に「記録した著者名」列があります。変更なし。';
    Logger.log(msg0);
    return msg0;
  }

  sh.getRange(1, 1, 1, want.length).setValues([want]);
  sh.getRange(1, 1, 1, want.length).setFontWeight('bold').setBackground('#f0f0f0');
  var msg = 'edit_log のヘッダーを ' + want.join(' / ') + ' に更新しました。';
  Logger.log(msg);
  return msg;
}

// ================================================================
// 第3部 管理画面（C3-2）
// ================================================================

// ---------------------------------------------------------------- 認証

/**
 * ログイン中のユーザーを members シートと照合して返す。
 * 載っていない・active が FALSE なら null。
 */
function me_() {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim(); } catch (e) { email = ''; }
  if (!email) return null;

  var sh = book_().getSheetByName(SHEET_MEMBERS);
  if (!sh || sh.getLastRow() < 2) return null;

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS[SHEET_MEMBERS].length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() !== email.toLowerCase()) continue;
    if (rows[i][4] === false || String(rows[i][4]).toUpperCase() === 'FALSE') return null;
    return {
      email: email,
      nickname: String(rows[i][1] || '').trim(),
      role: String(rows[i][2] || 'writer').trim(),
      profileUrl: String(rows[i][3] || '').trim()
    };
  }
  return null;
}

/**
 * members シートの有効な人のニックネーム一覧（代筆のプルダウン用）。
 * ★ メールアドレスは返さない。
 */
function memberNames_() {
  var sh = book_().getSheetByName(SHEET_MEMBERS);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS[SHEET_MEMBERS].length).getValues();
  var out = [];
  rows.forEach(function (r) {
    var nick = String(r[1] || '').trim();
    if (!nick) return;
    if (r[4] === false || String(r[4]).toUpperCase() === 'FALSE') return;
    if (out.indexOf(nick) < 0) out.push(nick);
  });
  return out;
}

// ---------------------------------------------------------------- シートの読み書き

function monstersSheet_() {
  var sh = book_().getSheetByName(SHEET_MONSTERS);
  if (!sh) throw new Error('monsters シートがありません');
  return sh;
}

function colIndex_() {
  var map = {};
  HEADERS[SHEET_MONSTERS].forEach(function (name, i) { map[name] = i; });
  return map;
}

/**
 * monsters シートを丸ごと読む。戻り値の row は 1 始まりのシート行番号。
 */
function readMonsters_() {
  var sh = monstersSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, HEADERS[SHEET_MONSTERS].length).getValues();
  var c = colIndex_();
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

/**
 * page-baseline.json（GitHub の main）を取ってきて id -> baseline の表にする。
 * 1時間キャッシュする。取得できなければ null を返し、UI は概算にフォールバックする。
 *
 * ★ 文字数の判定ロジックはここに書かない。ビルドが出した値を読むだけ。
 */
function baselineMap_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('baseline');
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* 壊れていたら取り直す */ }
  }
  try {
    var res = UrlFetchApp.fetch(BASELINE_URL, { muteHttpExceptions: true });
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

/**
 * id-availability.json（GitHub の main）を1時間キャッシュする。
 * 血統コード・特殊枠・使用済みIDの正はこのJSONで、GASには固定値を持たない。
 */
function availabilityData_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('idAvailability');
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* 壊れていたら取り直す */ }
  }
  try {
    var res = UrlFetchApp.fetch(AVAILABILITY_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var data = JSON.parse(res.getContentText());
    if (!Array.isArray(data.bloodOrder) || !Array.isArray(data.taken) || !data.specialSub) return null;
    cache.put('idAvailability', JSON.stringify(data), 3600);
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * id-availability.json から血統の選択肢を取る。
 * 主血統は34、副血統は34＋レアモン/ノーブル/ロード種。
 */
function bloodLists_() {
  var data = availabilityData_();
  if (!data) return null;
  var main = data.bloodOrder.map(function (b) { return b.name; });
  return { main: main, sub: main.concat(Object.keys(data.specialSub)) };
}

/**
 * id-availability.json と現在のシートから、新規モンスターのIDを予測する。
 * ★ これは画面表示用の予測。採番の正は generate-ids.js、最終確定はC8のビルド検算。
 */
function predictNewId_(mainBlood, subBlood, allMonsters) {
  var data = availabilityData_();
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

/**
 * 解説以外の分（テンプレート＋編成）が何字あるかを求める。
 *   base = baseline（ビルドが出した「解説と編成を除いた可視文字数」）
 *   編成の分 = 保存済みの visibleChars − baseline − 解説の字数
 * 編成の描画は build.js しか持っていないので、直近の実測から差分で推定する。
 */
function overhead_(m, baseMap) {
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

// ---------------------------------------------------------------- 画面

function doGet() {
  var user = me_();
  if (!user) {
    var email = '';
    try { email = String(Session.getActiveUser().getEmail() || ''); } catch (e) { email = ''; }
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:32px;line-height:1.8">' +
      '<h2>権限がありません</h2>' +
      '<p>このアカウントは編集者として登録されていません。</p>' +
      '<p>ログイン中のアカウント：<b>' + (email ? email.replace(/[<>&]/g, '') : '（取得できませんでした）') + '</b></p>' +
      '<p>管理者に、このメールアドレスを members シートへ追加してもらってください。</p>' +
      '</div>'
    ).setTitle('ライ徹CMS');
  }
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('ライ徹CMS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------- API（クライアントから呼ぶ）

/**
 * 起動時に1回だけ呼ぶ。一覧に必要なぶんだけ返す（解説本文は含めない）。
 */
function api_bootstrap() {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');

  var baseMap = baselineMap_();
  var bloods = bloodLists_();
  var list = readMonsters_().map(function (m) {
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
    memberNames: memberNames_(),
    threshold: THRESHOLD,
    imageMaxBytes: IMAGE_MAX_BYTES,
    auraList: AURA_LIST,
    monList: MON_LIST,
    mainBloodList: bloods ? bloods.main : [],
    subBloodList: bloods ? bloods.sub : [],
    baselineLoaded: !!baseMap,
    bloodsLoaded: !!bloods,
    monsters: list
  };
}

/**
 * 編集画面を開くときに呼ぶ。1体ぶんの全項目を返す。
 */
function api_get(id) {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');

  var target = pad4_(id);
  var all = readMonsters_();
  var m = null;
  for (var i = 0; i < all.length; i++) { if (all[i].id === target) { m = all[i]; break; } }
  if (!m) throw new Error('ID ' + target + ' が見つかりません');

  var baseMap = baselineMap_();
  m.overhead = overhead_(m, baseMap);
  m.baselineLoaded = !!(baseMap && baseMap[m.id] != null);
  return m;
}

/**
 * C5: 新規登録フォームの血統からID予測を返す。
 * クライアント側に採番規則を持たせない。
 */
function api_predictNewId(payload) {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  payload = payload || {};
  var all = readMonsters_();
  return {
    id: predictNewId_(payload.mainBlood, payload.subBlood, all),
    arrayIndex: all.reduce(function (max, monster) {
      return isFinite(monster.arrayIndex) && monster.arrayIndex > max ? monster.arrayIndex : max;
    }, -1) + 1
  };
}

/**
 * C5: 新規モンスターを monsters シートの末尾に追加する。
 * IDは画面の予測値を信頼せず、ロック取得後にサーバー側で再計算する。
 */
function api_createMonster(payload) {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
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
  if (AURA_LIST.indexOf(aura) < 0) throw new Error('オーラを選んでください。');
  if (MON_LIST.indexOf(mon) < 0) throw new Error('モン類を選んでください。');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('他の保存処理と重なりました。少し待ってからやり直してください。');
  }

  try {
    var all = readMonsters_();
    for (var i = 0; i < all.length; i++) {
      if (all[i].name === name) {
        throw new Error('同じ名前のモンスターが既に登録されています（' + all[i].id + '）。');
      }
    }

    var id = predictNewId_(mainBlood, subBlood, all);
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
    if (row.length !== HEADERS[SHEET_MONSTERS].length) {
      throw new Error('新規行の列数がヘッダーと一致しません。');
    }

    var sh = monstersSheet_();
    var rowNumber = sh.getLastRow() + 1;
    sh.getRange(rowNumber, 1).setNumberFormat('@');
    sh.getRange(rowNumber, 10).setNumberFormat('@');
    sh.getRange(rowNumber, 17).setNumberFormat('@');
    sh.getRange(rowNumber, 20).setNumberFormat('@');
    sh.getRange(rowNumber, 1, 1, row.length).setValues([row]);

    var log = book_().getSheetByName(SHEET_EDIT_LOG);
    if (log) log.appendRow([now_(), id, user.nickname, '新規登録', 0, '']);

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

function jsSingleQuoted_(value) {
  return "'" + String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n') + "'";
}

function renderMonsterDataRow_(monster) {
  return '  { name: ' + jsSingleQuoted_(monster.name) +
    ', aura: ' + jsSingleQuoted_(monster.aura) +
    ', limited: ' + (monster.limited ? 'true' : 'false') +
    ', limitedLabel: ' + jsSingleQuoted_(monster.limitedLabel) +
    ', gwImg: ' + (monster.gwImg == null ? 'null' : String(monster.gwImg)) +
    ', localImg: ' + (monster.localImg ? jsSingleQuoted_(monster.localImg) : 'null') +
    ', mon: ' + jsSingleQuoted_(monster.mon) +
    ', mainMon: ' + jsSingleQuoted_(monster.mainMon) +
    ', subMon: ' + jsSingleQuoted_(monster.subMon) + ' },';
}

/**
 * C6/C8: シートからGitHubへ送る3つのテキストファイルを組み立てる。
 * monsters-data.jsの配列順はarrayIndexだけで決める。
 * gwImgはシートで編集しない参照値なので、mainのcms-seed.jsonから引き継ぐ。
 */
function buildPublishTextFiles_(all) {
  if (!all.length) throw new Error('monsters シートにデータがありません。');

  var seedResponse = UrlFetchApp.fetch(SEED_URL, { muteHttpExceptions: true });
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
    if (AURA_LIST.indexOf(monster.aura) < 0) {
      throw new Error('オーラが不正です: ' + monster.id + ' ' + monster.aura);
    }
    if (MON_LIST.indexOf(monster.mon) < 0) {
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

  var profiles = profileUrlsByNickname_();
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
    monstersData.map(renderMonsterDataRow_).join('\n') + '\n];\n';

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

/**
 * C6: adminのみ、公開用スナップショットをcms/publishへ1コミットで送る。
 * mainは一切更新しない。C7がビルド・検査後にmainへ反映する。
 */
function api_publish() {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  if (user.role !== 'admin') throw new Error('公開操作はadminだけが実行できます。');
  if (!user.nickname) throw new Error('members シートのニックネームが空です。');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('他の保存・公開処理と重なりました。少し待ってからやり直してください。');
  }

  var pushedSha = '';
  try {
    // トークン未設定を、blob作成後ではなく最初に検出する。
    prop_('GITHUB_TOKEN');
    var all = readMonsters_();
    var files = buildPublishTextFiles_(all);

    var mainRef = githubRef_(GITHUB_MAIN_BRANCH, false);
    var mainSha = mainRef && mainRef.object ? mainRef.object.sha : '';
    if (!mainSha) throw new Error('mainブランチのコミットSHAを取得できません。');
    var mainCommit = githubRequest_('get', '/git/commits/' + mainSha, null, false);
    if (!mainCommit.tree || !mainCommit.tree.sha) {
      throw new Error('mainブランチのtree SHAを取得できません。');
    }

    var treeEntries = [
      {
        path: 'src/data/monsters-editorial.json',
        mode: '100644',
        type: 'blob',
        sha: githubBlob_(files.editorial, 'utf-8')
      },
      {
        path: 'monsters-data.js',
        mode: '100644',
        type: 'blob',
        sha: githubBlob_(files.monstersData, 'utf-8')
      },
      {
        path: 'src/data/cms-id-predictions.json',
        mode: '100644',
        type: 'blob',
        sha: githubBlob_(files.idPredictions, 'utf-8')
      }
    ];

    var imageCount = 0;
    var imageFolder = monsterImageFolder_();
    var driveFiles = imageFolder.getFiles();
    while (driveFiles.hasNext()) {
      var driveFile = driveFiles.next();
      var filename = driveFile.getName();
      if (!/^[0-9]{4}\.(jpg|png|webp)$/i.test(filename)) {
        throw new Error('Driveのmonsterフォルダに規則外のファイルがあります: ' + filename);
      }
      // シートから参照されていないファイルは公開コミットへ含めない。
      if (!files.referencedImages[filename]) continue;
      var bytes = driveFile.getBlob().getBytes();
      if (!bytes.length || bytes.length > IMAGE_MAX_BYTES) {
        throw new Error(filename + ' は空、または2MBを超えています。');
      }
      var extension = filename.split('.').pop().toLowerCase();
      var expectedMime = extension === 'jpg' ? 'image/jpeg' :
        (extension === 'png' ? 'image/png' : 'image/webp');
      if (!isExpectedImage_(bytes, expectedMime)) {
        throw new Error(filename + ' の拡張子と画像データが一致しません。');
      }
      treeEntries.push({
        path: 'monster/' + filename,
        mode: '100644',
        type: 'blob',
        sha: githubBlob_(Utilities.base64Encode(bytes), 'base64')
      });
      imageCount++;
    }

    var newTree = githubRequest_('post', '/git/trees', {
      base_tree: mainCommit.tree.sha,
      tree: treeEntries
    });
    if (!newTree.sha) throw new Error('GitHubのtree作成結果にSHAがありません。');

    var commit = githubRequest_('post', '/git/commits', {
      message: 'CMS publish ' + now_(),
      tree: newTree.sha,
      parents: [mainSha]
    });
    if (!commit.sha) throw new Error('GitHubのcommit作成結果にSHAがありません。');

    // 処理中にmainが動いた場合は、古いmainを土台にしたブランチを送らない。
    var latestMain = githubRef_(GITHUB_MAIN_BRANCH, false);
    if (!latestMain.object || latestMain.object.sha !== mainSha) {
      throw new Error('公開処理中にmainブランチが更新されました。もう一度「公開」を押してください。');
    }

    var publishRef = githubRef_(GITHUB_PUBLISH_BRANCH, true);
    if (publishRef) {
      githubRequest_('patch', '/git/refs/heads/' + GITHUB_PUBLISH_BRANCH, {
        sha: commit.sha,
        force: true
      }, false);
    } else {
      githubRequest_('post', '/git/refs', {
        ref: 'refs/heads/' + GITHUB_PUBLISH_BRANCH,
        sha: commit.sha
      }, false);
    }
    pushedSha = commit.sha;

    // C7が成功を確認するまでは、公開済みとして扱わない。
    setAllPublishStatus_('publishing');
    publishLog_(user, pushedSha, '送信済み',
      GITHUB_PUBLISH_BRANCH + ' / ' + treeEntries.length + 'ファイル（画像' + imageCount + '件）');

    return {
      ok: true,
      sha: pushedSha,
      shortSha: pushedSha.slice(0, 7),
      branch: GITHUB_PUBLISH_BRANCH,
      fileCount: treeEntries.length,
      imageCount: imageCount
    };
  } catch (e) {
    var result = pushedSha ? 'GitHub送信済み・後処理失敗' : '失敗';
    try { publishLog_(user, pushedSha, result, e.message); } catch (ignoreLog) { /* 元のエラーを優先 */ }
    if (pushedSha) {
      throw new Error('GitHubへの送信（' + pushedSha.slice(0, 7) +
        '）は完了しましたが、シート更新に失敗しました。再実行せず管理者へ連絡してください: ' + e.message);
    }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/**
 * C7: GitHub Actionsの結果を確認し、publish_logとmonsters.statusへ反映する。
 * 現行WebアプリはGoogleログイン必須のため、外部Webhookではなく管理画面から取得する。
 */
function api_publishStatus(sha) {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  if (user.role !== 'admin') throw new Error('公開結果の確認はadminだけが実行できます。');
  return publishStatus_(sha);
}

function api_latestPublishStatus() {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  if (user.role !== 'admin') throw new Error('公開結果の確認はadminだけが実行できます。');
  var sha = latestPublishSha_();
  if (!sha) return { state: 'none', message: '確認できる公開送信はまだありません。' };
  return publishStatus_(sha);
}

/**
 * C4: モンスター画像を Drive へアップロードする。
 *
 * payload = {
 *   id,
 *   mimeType,       // image/jpeg | image/png | image/webp
 *   base64,         // data URL のカンマより後ろ
 *   baseUpdatedAt   // 画面を開いた時点の updatedAt
 * }
 */
function api_uploadImage(payload) {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  if (!user.nickname) {
    throw new Error('members シートのニックネームが空です。管理者に設定してもらってください。');
  }

  payload = payload || {};
  var mimeType = String(payload.mimeType || '').toLowerCase().trim();
  var extension = IMAGE_MIME_EXT[mimeType];
  if (!extension) {
    throw new Error('対応形式は JPG・PNG・WebP の3種類です。');
  }

  var base64 = String(payload.base64 || '').replace(/\s+/g, '');
  var maxBase64Length = Math.ceil(IMAGE_MAX_BYTES / 3) * 4 + 4;
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
  if (!bytes.length || bytes.length > IMAGE_MAX_BYTES) {
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

    var all = readMonsters_();
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
    var folder = monsterImageFolder_();
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
    var sh = monstersSheet_();
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

/**
 * 保存する。
 *
 * payload = {
 *   id, aura, mon, mainBlood, subBlood, limited, limitedLabel, releasedAt,
 *   explanation, formations,          // formations は JSON文字列
 *   authorMode: 'author'|'ghost'|'contributor'|'none',
 *   ghostName,                        // authorMode==='ghost' のときだけ
 *   baseUpdatedAt                     // 画面を開いた時点の updatedAt（同時編集の検出用）
 * }
 */
function api_save(payload) {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  if (!user.nickname) throw new Error('members シートのニックネームが空です。管理者に設定してもらってください。');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('他の保存処理と重なりました。少し待ってからやり直してください。');

  try {
    var target = pad4_(payload.id);
    var all = readMonsters_();
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
    if (aura && AURA_LIST.indexOf(aura) < 0) throw new Error('オーラの値が不正です: ' + aura);
    if (mon && MON_LIST.indexOf(mon) < 0) throw new Error('モン類の値が不正です: ' + mon);

    var mainBlood = String(payload.mainBlood || '').trim();
    var subBlood = String(payload.subBlood || '').trim();
    var bloods = bloodLists_();
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
    var baseMap = baselineMap_();
    var overhead = overhead_(m, baseMap);
    var predicted = overhead + countChars_(explanation);
    var indexable = predicted >= THRESHOLD;

    // --- 書き込み（C列〜T列を1回で。image と status は今の値をそのまま戻す）
    var sh = monstersSheet_();
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
    var log = book_().getSheetByName(SHEET_EDIT_LOG);
    if (log) log.appendRow([now_(), target, user.nickname, kind, predicted, recordedAuthor]);

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
