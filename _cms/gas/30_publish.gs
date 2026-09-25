/** GitHub送信はこのファイルだけに置く。 */
var GITHUB_OWNER = 'oginginlmftv2';
var GITHUB_REPO = 'line-monster-farm';
var GITHUB_MAIN_BRANCH = 'main';
var GITHUB_MON_PUBLISH_BRANCH = 'cms/publish';
var GITHUB_ASST_PUBLISH_BRANCH = 'cms/assist-publish';
var GITHUB_GACHA_PUBLISH_BRANCH = 'cms/gacha-publish';
var GITHUB_API_BASE = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO;

function requirePublishable_(scope) {
  if (env_() !== ENV_PRODUCTION) throw new Error('公開は本番環境でだけ実行できます（現在: ' + env_() + '）。');
  var user = requireScope_(scope);
  if (user.role !== 'admin') throw new Error('公開操作はadminだけが実行できます。');
  if (!user.nickname) throw new Error('membersシートのニックネームが空です。');
  return user;
}

// ---------------------------------------------------------------- GitHub認証
// GITHUB_APP_ID と GITHUB_APP_PRIVATE_KEY があれば GitHub App の短命token（1時間）を
// 毎回発行して使う。無ければ従来の GITHUB_TOKEN（PAT）を使う。両方無ければエラー。
var GITHUB_APP_TOKEN_CACHE_SECONDS = 50 * 60;

function githubAuthMode_() {
  if (optionalProp_('GITHUB_APP_ID') && optionalProp_('GITHUB_APP_PRIVATE_KEY')) return 'app';
  if (optionalProp_('GITHUB_TOKEN')) return 'pat';
  return '';
}

/** 公開処理の冒頭で、blob作成前に認証設定の有無だけを確認する。 */
function requireGithubAuthConfig_() {
  var mode = githubAuthMode_();
  if (!mode) {
    throw new Error('スクリプトプロパティ GITHUB_APP_ID と GITHUB_APP_PRIVATE_KEY（または GITHUB_TOKEN）が未設定です。');
  }
  return mode;
}

function githubAuthToken_() {
  var mode = requireGithubAuthConfig_();
  if (mode === 'pat') return prop_('GITHUB_TOKEN');
  return githubAppInstallationToken_();
}

/** Script Propertiesの1行入力で改行が失われたPEMを復元する。 */
/** DERの長さフィールド（短形式・長形式）を作る。 */
function githubAppDerLength_(length) {
  if (length < 0x80) return [length];
  var bytes = [];
  var rest = length;
  while (rest > 0) {
    bytes.unshift(rest % 256);
    rest = Math.floor(rest / 256);
  }
  return [0x80 + bytes.length].concat(bytes);
}

/** rsaEncryption の AlgorithmIdentifier（SEQUENCE { OID 1.2.840.113549.1.1.1, NULL }）。 */
var GITHUB_APP_RSA_ALGORITHM_DER = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00
];

/**
 * GitHubが配るPKCS#1（BEGIN RSA PRIVATE KEY）をPKCS#8（BEGIN PRIVATE KEY）へ包み直す。
 * Utilities.computeRsaSha256SignatureはPKCS#8しか受け付けないため、変換しないと署名できない。
 */
function githubAppPkcs1ToPkcs8Base64_(pkcs1Base64) {
  var decoded = Utilities.base64Decode(pkcs1Base64);
  var inner = [];
  for (var i = 0; i < decoded.length; i++) inner.push(decoded[i] & 0xff);
  var octetString = [0x04].concat(githubAppDerLength_(inner.length), inner);
  var body = [0x02, 0x01, 0x00].concat(GITHUB_APP_RSA_ALGORITHM_DER, octetString);
  var der = [0x30].concat(githubAppDerLength_(body.length), body);
  var signed = [];
  for (var j = 0; j < der.length; j++) signed.push(der[j] > 127 ? der[j] - 256 : der[j]);
  return Utilities.base64Encode(signed);
}

/**
 * Script Propertiesの1行入力で改行が失われたPEMを復元し、PKCS#8へそろえる。
 * GitHubの.pemはPKCS#1なので、そのまま貼っても動くようここで変換する。
 */
function githubAppNormalizePem_(raw) {
  var text = String(raw || '').replace(/\\n/g, '\n').replace(/\r/g, '').trim();
  var match = text.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
  if (!match) throw new Error('GITHUB_APP_PRIVATE_KEY がPEM形式（BEGIN/END行を含む）ではありません。');
  var label = match[1];
  var body = match[2].replace(/\s+/g, '');
  if (!body) throw new Error('GITHUB_APP_PRIVATE_KEY の本文が空です。');
  if (label === 'ENCRYPTED PRIVATE KEY') {
    throw new Error('GITHUB_APP_PRIVATE_KEY がパスフレーズ付きです。GitHubが発行した.pemをそのまま設定してください。');
  }
  if (label !== 'RSA PRIVATE KEY' && label !== 'PRIVATE KEY') {
    throw new Error('GITHUB_APP_PRIVATE_KEY の種別が想定外です（' + label + '）。GitHub Appの秘密鍵(.pem)を設定してください。');
  }
  if (label === 'RSA PRIVATE KEY') {
    try {
      body = githubAppPkcs1ToPkcs8Base64_(body);
    } catch (e) {
      throw new Error('GITHUB_APP_PRIVATE_KEY を変換できません。.pemの本文が欠けていないか確認してください。' +
        '（' + (e && e.message ? e.message : e) + '）');
    }
  }
  var lines = [];
  for (var i = 0; i < body.length; i += 64) lines.push(body.substr(i, 64));
  return '-----BEGIN PRIVATE KEY-----\n' + lines.join('\n') + '\n-----END PRIVATE KEY-----\n';
}

function githubAppBase64Url_(input) {
  return Utilities.base64EncodeWebSafe(input).replace(/=+$/, '');
}

/** GitHub App として認証するJWT（有効10分）。 */
function githubAppJwt_(appId, pem) {
  var now = Math.floor(Date.now() / 1000);
  var header = githubAppBase64Url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var payload = githubAppBase64Url_(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: String(appId) }));
  var signingInput = header + '.' + payload;
  var signature;
  try {
    signature = Utilities.computeRsaSha256Signature(signingInput, pem);
  } catch (e) {
    throw new Error('GITHUB_APP_PRIVATE_KEY で署名できません。GitHubが発行した.pemの全文（BEGIN〜END）を設定してください。' +
      '（' + (e && e.message ? e.message : e) + '）');
  }
  return signingInput + '.' + githubAppBase64Url_(signature);
}

function githubAppApi_(method, url, bearer, body) {
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + bearer,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (body != null) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  var json = {};
  try { json = JSON.parse(text); } catch (ignore) { json = {}; }
  if (code < 200 || code >= 300) {
    throw new Error('GitHub App認証でエラーが発生しました（HTTP ' + code +
      (json.message ? ' / ' + json.message : '') + '）。' +
      (code === 404 ? ' AppがこのリポジトリにInstallされているか確認してください。' : '') +
      (code === 401 ? ' GITHUB_APP_ID と秘密鍵の組み合わせを確認してください。' : ''));
  }
  return json;
}

/** installation token を発行する。同じ鍵のあいだは50分キャッシュする。 */
function githubAppInstallationToken_() {
  var appId = String(prop_('GITHUB_APP_ID')).trim();
  if (!/^\d+$/.test(appId)) throw new Error('GITHUB_APP_ID は数字のApp ID（Client IDではない）を設定してください。');
  var pem = githubAppNormalizePem_(prop_('GITHUB_APP_PRIVATE_KEY'));
  var keyDigest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pem)).slice(0, 16);
  var cacheKey = 'ghapp:' + appId + ':' + keyDigest;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) return cached;

  var jwt = githubAppJwt_(appId, pem);
  var installation = githubAppApi_('get', GITHUB_API_BASE + '/installation', jwt, null);
  if (!installation.id) throw new Error('GitHub Appのinstallationが見つかりません。');
  var issued = githubAppApi_('post',
    'https://api.github.com/app/installations/' + installation.id + '/access_tokens', jwt,
    { repositories: [GITHUB_REPO], permissions: { contents: 'write' } });
  if (!issued.token) throw new Error('GitHub Appのtokenを取得できませんでした。');
  cache.put(cacheKey, issued.token, GITHUB_APP_TOKEN_CACHE_SECONDS);
  return issued.token;
}

/** 管理画面の「GitHub接続を確認」。tokenの値は返さない。 */
function api_githubAuthCheck() {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  if (user.role !== 'admin') throw new Error('GitHub接続の確認はadminだけが実行できます。');
  var mode = githubAuthMode_();
  if (!mode) return { mode: '', ok: false, message: 'GitHub認証が未設定です（GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY、または GITHUB_TOKEN）。' };
  var repo = githubRequest_('get', '', null, false);
  var label = mode === 'app' ? 'GitHub App' : 'PAT（GITHUB_TOKEN）';
  var permissions = repo.permissions || {};
  return {
    mode: mode,
    ok: true,
    message: label + ' で ' + (repo.full_name || GITHUB_OWNER + '/' + GITHUB_REPO) + ' に接続できました' +
      (permissions.push === false ? '（注意: push権限がありません）' : '') + '。'
  };
}

function githubRequest_(method, path, body, allow404) {
  var token = githubAuthToken_();
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

function publishLog_(logSheetName, user, sha, result, detail) {
  var sh = book_().getSheetByName(logSheetName);
  if (!sh) return;
  sh.appendRow([
    nowJst_(),
    user.nickname,
    String(sha || ''),
    String(result || ''),
    String(detail || '').slice(0, 1000)
  ]);
}

function monPublishLog_(user, sha, result, detail) {
  return publishLog_(MON_SHEET_PUBLISH_LOG, user, sha, result, detail);
}

function monSetAllPublishStatus_(status) {
  var sh = monSheet_();
  var count = Math.max(0, sh.getLastRow() - 1);
  if (!count) return;
  sh.getRange(2, 15, count, 1).setValues(
    Array.apply(null, Array(count)).map(function () { return [status]; })
  );
}

function publishLogRows_(logSheetName) {
  var sh = book_().getSheetByName(logSheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getDisplayValues();
}

function monPublishLogRows_() {
  return publishLogRows_(MON_SHEET_PUBLISH_LOG);
}

function recordedPublishResult_(logSheetName, sha) {
  var rows = publishLogRows_(logSheetName);
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

function monRecordedPublishResult_(sha) {
  return recordedPublishResult_(MON_SHEET_PUBLISH_LOG, sha);
}

function sentPublishUser_(logSheetName, sha) {
  var rows = publishLogRows_(logSheetName);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][2] === sha &&
        (rows[i][3] === '送信済み' || rows[i][3] === 'GitHub送信済み・後処理失敗')) {
      return { nickname: rows[i][1] };
    }
  }
  return null;
}

function monSentPublishUser_(sha) {
  return sentPublishUser_(MON_SHEET_PUBLISH_LOG, sha);
}

function latestPublishSha_(logSheetName) {
  var rows = publishLogRows_(logSheetName);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (/^[0-9a-f]{40}$/i.test(rows[i][2])) return rows[i][2].toLowerCase();
  }
  return '';
}

function monLatestPublishSha_() {
  return latestPublishSha_(MON_SHEET_PUBLISH_LOG);
}

function cmsPublishRun_(workflowFileName, branchName, sha) {
  var path = '/actions/workflows/' + workflowFileName + '/runs' +
    '?branch=' + encodeURIComponent(branchName) +
    '&event=push&per_page=20';
  var result = githubRequest_('get', path, null, false);
  var runs = result.workflow_runs || [];
  for (var i = 0; i < runs.length; i++) {
    if (String(runs[i].head_sha || '').toLowerCase() === sha) return runs[i];
  }
  return null;
}

function monCmsPublishRun_(sha) {
  return cmsPublishRun_('cms-publish.yml', GITHUB_MON_PUBLISH_BRANCH, sha);
}

function monFailedActionDetail_(run) {
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

function publishStatus_(config, sha) {
  sha = String(sha || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('確認するコミットSHAが正しくありません。');

  var recorded = recordedPublishResult_(config.logSheet, sha);
  if (recorded) return recorded;
  var sentUser = sentPublishUser_(config.logSheet, sha);
  if (!sentUser) throw new Error(config.logSheet + ' に送信記録がないコミットです。');

  var run = cmsPublishRun_(config.workflow, config.branch, sha);
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
    detail = monFailedActionDetail_(run);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    recorded = recordedPublishResult_(config.logSheet, sha);
    if (recorded) return recorded;
    if (config.onResult) config.onResult(success);
    publishLog_(config.logSheet, sentUser, sha, success ? '公開成功' : '公開失敗', detail);
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

function monPublishStatus_(sha) {
  return publishStatus_({
    logSheet: MON_SHEET_PUBLISH_LOG,
    workflow: 'cms-publish.yml',
    branch: GITHUB_MON_PUBLISH_BRANCH,
    onResult: function (success) {
      monSetAllPublishStatus_(success ? 'published' : 'publish_failed');
    }
  }, sha);
}

function api_monPublish() {
  var user = requirePublishable_('monster');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('他の保存・公開処理と重なりました。少し待ってからやり直してください。');
  }

  var pushedSha = '';
  try {
    // トークン未設定を、blob作成後ではなく最初に検出する。
    requireGithubAuthConfig_();
    var all = monReadAll_();
    var files = monBuildPublishTextFiles_(all);

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
    var imageFolder = monImageFolder_();
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
      if (!bytes.length || bytes.length > MON_IMAGE_MAX_BYTES) {
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
      message: 'CMS publish ' + nowJst_(),
      tree: newTree.sha,
      parents: [mainSha]
    });
    if (!commit.sha) throw new Error('GitHubのcommit作成結果にSHAがありません。');

    // 処理中にmainが動いた場合は、古いmainを土台にしたブランチを送らない。
    var latestMain = githubRef_(GITHUB_MAIN_BRANCH, false);
    if (!latestMain.object || latestMain.object.sha !== mainSha) {
      throw new Error('公開処理中にmainブランチが更新されました。もう一度「公開」を押してください。');
    }

    var publishRef = githubRef_(GITHUB_MON_PUBLISH_BRANCH, true);
    if (publishRef) {
      githubRequest_('patch', '/git/refs/heads/' + GITHUB_MON_PUBLISH_BRANCH, {
        sha: commit.sha,
        force: true
      }, false);
    } else {
      githubRequest_('post', '/git/refs', {
        ref: 'refs/heads/' + GITHUB_MON_PUBLISH_BRANCH,
        sha: commit.sha
      }, false);
    }
    pushedSha = commit.sha;

    // C7が成功を確認するまでは、公開済みとして扱わない。
    monSetAllPublishStatus_('publishing');
    monPublishLog_(user, pushedSha, '送信済み',
      GITHUB_MON_PUBLISH_BRANCH + ' / ' + treeEntries.length + 'ファイル（画像' + imageCount + '件）');

    return {
      ok: true,
      sha: pushedSha,
      shortSha: pushedSha.slice(0, 7),
      branch: GITHUB_MON_PUBLISH_BRANCH,
      fileCount: treeEntries.length,
      imageCount: imageCount
    };
  } catch (e) {
    var result = pushedSha ? 'GitHub送信済み・後処理失敗' : '失敗';
    try { monPublishLog_(user, pushedSha, result, e.message); } catch (ignoreLog) { /* 元のエラーを優先 */ }
    if (pushedSha) {
      throw new Error('GitHubへの送信（' + pushedSha.slice(0, 7) +
        '）は完了しましたが、シート更新に失敗しました。再実行せず管理者へ連絡してください: ' + e.message);
    }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function api_monPublishStatus(sha) {
  var user = requirePublishable_('monster');
  return monPublishStatus_(sha);
}

function api_monLatestPublishStatus() {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  if (user.role !== 'admin') throw new Error('公開結果の確認はadminだけが実行できます。');
  var sha = monLatestPublishSha_();
  if (!sha) return { state: 'none', message: '確認できる公開送信はまだありません。' };
  return monPublishStatus_(sha);
}

function api_asstPublish() {
  var user = requirePublishable_('assist');
  var lock = asstAcquireScriptLock_();
  var pushedSha = '';
  try {
    var docs = asstBuildDocuments_();
    var driveImages = asstDriveImageInventory_(docs.cards.cards, false);
    var issues = asstValidateDocuments_(docs.cards, docs.effects, docs.abilities)
      .concat(driveImages.issues)
      .concat(asstValidateImageFiles_(docs.cards.cards, driveImages.byName));
    var publicPageAbilities = asstPublicPageAbilities_(docs.abilities.abilities);
    if (publicPageAbilities.some(function (ability) { return ability.linkStatus !== 'resolved' || ability.status !== 'verified'; })) {
      issues.push('draft resolved能力が公開ページ対象へ混入しています。');
    }
    if (issues.length) throw new Error('アシスト公開検査FAIL: ' + issues.slice(0, 10).join(' / '));
    requireGithubAuthConfig_();
    var mainRef = githubRef_(GITHUB_MAIN_BRANCH, false);
    var mainSha = mainRef.object.sha;
    var mainCommit = githubRequest_('get', '/git/commits/' + mainSha, null, false);
    var files = [
      { path: 'src/data/assist-cards.json', value: docs.cards },
      { path: 'src/data/assist-effects.json', value: docs.effects },
      { path: 'src/data/assist-abilities.json', value: docs.abilities }
    ];
    var tree = files.map(function (file) { return { path: file.path, mode: '100644', type: 'blob', sha: githubBlob_(JSON.stringify(file.value, null, 2) + '\n', 'utf-8') }; });
    Object.keys(driveImages.byName).forEach(function (filename) {
      var driveImage = driveImages.byName[filename];
      tree.push({
        path: 'assist-cards/' + filename,
        mode: '100644',
        type: 'blob',
        sha: githubBlob_(Utilities.base64Encode(driveImage.bytes), 'base64')
      });
    });
    var newTree = githubRequest_('post', '/git/trees', { base_tree: mainCommit.tree.sha, tree: tree }, false);
    var commit = githubRequest_('post', '/git/commits', { message: 'CMS assist publish ' + nowJst_(), tree: newTree.sha, parents: [mainSha] }, false);
    var latestMain = githubRef_(GITHUB_MAIN_BRANCH, false);
    if (!latestMain.object || latestMain.object.sha !== mainSha) throw new Error('公開処理中にmainブランチが更新されました。');
    var ref = githubRef_(GITHUB_ASST_PUBLISH_BRANCH, true);
    if (ref) githubRequest_('patch', '/git/refs/heads/' + GITHUB_ASST_PUBLISH_BRANCH, { sha: commit.sha, force: true }, false);
    else githubRequest_('post', '/git/refs', { ref: 'refs/heads/' + GITHUB_ASST_PUBLISH_BRANCH, sha: commit.sha }, false);
    pushedSha = commit.sha;
    publishLog_(ASST_SHEET_PUBLISH_LOG, user, pushedSha, '送信済み',
      GITHUB_ASST_PUBLISH_BRANCH + ' / ' + tree.length + 'ファイル');
    asstAppendLog_(user, 'publish', 'SENT', pushedSha);
    return { ok: true, sha: pushedSha, shortSha: pushedSha.slice(0, 7), branch: GITHUB_ASST_PUBLISH_BRANCH, fileCount: tree.length };
  } catch (e) {
    var result = pushedSha ? 'GitHub送信済み・後処理失敗' : '失敗';
    try { publishLog_(ASST_SHEET_PUBLISH_LOG, user, pushedSha, result, e.message); } catch (ignoreLog) { /* 元のエラーを優先 */ }
    if (pushedSha) {
      throw new Error('GitHubへの送信（' + pushedSha.slice(0, 7) +
        '）は完了しましたが、シート更新に失敗しました。再実行せず管理者へ連絡してください: ' + e.message);
    }
    throw e;
  } finally {
    asstReleaseScriptLock_(lock);
  }
}

function api_asstPublishStatus(sha) {
  var user = requirePublishable_('assist');
  return publishStatus_({
    logSheet: ASST_SHEET_PUBLISH_LOG,
    workflow: 'cms-assist-publish.yml',
    branch: GITHUB_ASST_PUBLISH_BRANCH
  }, sha);
}

function api_asstLatestPublishStatus() {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  if (user.role !== 'admin') throw new Error('公開結果の確認はadminだけが実行できます。');
  var sha = latestPublishSha_(ASST_SHEET_PUBLISH_LOG);
  if (!sha) return { state: 'none', message: '確認できる公開送信はまだありません。' };
  return publishStatus_({
    logSheet: ASST_SHEET_PUBLISH_LOG,
    workflow: 'cms-assist-publish.yml',
    branch: GITHUB_ASST_PUBLISH_BRANCH
  }, sha);
}

function api_gachaPublish() {
  var user = requirePublishable_('gacha');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('他の保存・公開処理と重なりました。少し待ってからやり直してください。');
  }

  var pushedSha = '';
  try {
    requireGithubAuthConfig_();
    var rows = gachaReadAll_();
    var documents = gachaBuildPublishDocuments_(rows);
    var issues = gachaValidatePublishDocuments_(documents, true);
    if (issues.length) throw new Error('ガチャ公開検査FAIL: ' + issues.slice(0, 10).join(' / '));

    var referencedImages = documents.gachas.gachas.reduce(function (set, gacha) {
      var filename = String(gacha.image || '').replace(/^gacha-banner\//, '');
      if (filename) set[filename] = true;
      return set;
    }, {});
    var imageFiles = [];
    var driveFiles = gachaImageFolder_().getFiles();
    while (driveFiles.hasNext()) {
      var driveFile = driveFiles.next();
      var filename = driveFile.getName();
      if (!/^[A-Za-z0-9._-]+\.(jpg|png|webp)$/i.test(filename)) {
        throw new Error('Driveのgacha-bannerフォルダに規則外のファイルがあります: ' + filename);
      }
      // ガチャDBから参照されていないファイルは公開コミットへ含めない。
      if (!referencedImages[filename]) continue;
      var bytes = driveFile.getBlob().getBytes();
      if (!bytes.length || bytes.length > GACHA_IMAGE_MAX_BYTES) {
        throw new Error(filename + ' は空、または2MBを超えています。');
      }
      var extension = filename.split('.').pop().toLowerCase();
      var expectedMime = extension === 'jpg' ? 'image/jpeg' :
        (extension === 'png' ? 'image/png' : 'image/webp');
      if (!isExpectedImage_(bytes, expectedMime)) {
        throw new Error(filename + ' の拡張子と画像データが一致しません。');
      }
      imageFiles.push({ filename: filename, bytes: bytes });
    }
    var missingImages = Object.keys(referencedImages).filter(function (filename) {
      return !imageFiles.some(function (file) { return file.filename === filename; });
    });
    if (missingImages.length) throw new Error('Driveに参照画像がありません: ' + missingImages.join(', '));

    // 初回公開日はGitHub送信より先に確定し、一度入った値は以後変更しない。
    gachaStampInitialPublishedAt_(rows);
    documents = gachaBuildPublishDocuments_(rows);
    issues = gachaValidatePublishDocuments_(documents, false);
    if (issues.length) throw new Error('ガチャ公開検査FAIL: ' + issues.slice(0, 10).join(' / '));

    var mainRef = githubRef_(GITHUB_MAIN_BRANCH, false);
    var mainSha = mainRef && mainRef.object ? mainRef.object.sha : '';
    if (!mainSha) throw new Error('mainブランチのコミットSHAを取得できません。');
    var mainCommit = githubRequest_('get', '/git/commits/' + mainSha, null, false);
    if (!mainCommit.tree || !mainCommit.tree.sha) throw new Error('mainブランチのtree SHAを取得できません。');

    var tree = [
      {
        path: 'src/data/gachas.json', mode: '100644', type: 'blob',
        sha: githubBlob_(JSON.stringify(documents.gachas, null, 2) + '\n', 'utf-8')
      },
      {
        path: 'src/data/gacha-types.json', mode: '100644', type: 'blob',
        sha: githubBlob_(JSON.stringify(documents.types, null, 2) + '\n', 'utf-8')
      }
    ];
    imageFiles.forEach(function (file) {
      tree.push({
        path: 'gacha-banner/' + file.filename,
        mode: '100644',
        type: 'blob',
        sha: githubBlob_(Utilities.base64Encode(file.bytes), 'base64')
      });
    });
    var newTree = githubRequest_('post', '/git/trees', { base_tree: mainCommit.tree.sha, tree: tree }, false);
    if (!newTree.sha) throw new Error('GitHubのtree作成結果にSHAがありません。');
    var commit = githubRequest_('post', '/git/commits', {
      message: 'CMS gacha publish ' + nowJst_(), tree: newTree.sha, parents: [mainSha]
    }, false);
    if (!commit.sha) throw new Error('GitHubのcommit作成結果にSHAがありません。');

    var latestMain = githubRef_(GITHUB_MAIN_BRANCH, false);
    if (!latestMain.object || latestMain.object.sha !== mainSha) {
      throw new Error('公開処理中にmainブランチが更新されました。もう一度「ガチャを公開」を押してください。');
    }
    var ref = githubRef_(GITHUB_GACHA_PUBLISH_BRANCH, true);
    if (ref) {
      githubRequest_('patch', '/git/refs/heads/' + GITHUB_GACHA_PUBLISH_BRANCH, { sha: commit.sha, force: true }, false);
    } else {
      githubRequest_('post', '/git/refs', { ref: 'refs/heads/' + GITHUB_GACHA_PUBLISH_BRANCH, sha: commit.sha }, false);
    }
    pushedSha = commit.sha;
    publishLog_(GACHA_SHEET_PUBLISH_LOG, user, pushedSha, '送信済み',
      GITHUB_GACHA_PUBLISH_BRANCH + ' / ' + tree.length + 'ファイル（画像' + imageFiles.length + '件）');
    return {
      ok: true, sha: pushedSha, shortSha: pushedSha.slice(0, 7),
      branch: GITHUB_GACHA_PUBLISH_BRANCH, fileCount: tree.length, imageCount: imageFiles.length
    };
  } catch (e) {
    var result = pushedSha ? 'GitHub送信済み・後処理失敗' : '失敗';
    try { publishLog_(GACHA_SHEET_PUBLISH_LOG, user, pushedSha, result, e.message); } catch (ignoreLog) { /* 元のエラーを優先 */ }
    if (pushedSha) {
      throw new Error('GitHubへの送信（' + pushedSha.slice(0, 7) +
        '）は完了しましたが、公開ログの更新に失敗しました。再実行せず管理者へ連絡してください: ' + e.message);
    }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function api_gachaPublishStatus(sha) {
  var user = requirePublishable_('gacha');
  return publishStatus_({
    logSheet: GACHA_SHEET_PUBLISH_LOG,
    workflow: 'cms-gacha-publish.yml',
    branch: GITHUB_GACHA_PUBLISH_BRANCH
  }, sha);
}

function api_gachaLatestPublishStatus() {
  var user = me_();
  if (!user) throw new Error('権限がありません。画面を開き直してください。');
  if (user.role !== 'admin') throw new Error('公開結果の確認はadminだけが実行できます。');
  var sha = latestPublishSha_(GACHA_SHEET_PUBLISH_LOG);
  if (!sha) return { state: 'none', message: '確認できるガチャ公開送信はまだありません。' };
  return publishStatus_({
    logSheet: GACHA_SHEET_PUBLISH_LOG,
    workflow: 'cms-gacha-publish.yml',
    branch: GITHUB_GACHA_PUBLISH_BRANCH
  }, sha);
}
