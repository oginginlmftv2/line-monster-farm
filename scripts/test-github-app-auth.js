#!/usr/bin/env node
'use strict';

/** 30_publish.gs のGitHub App認証（JWT署名・installation token・キャッシュ・PAT fallback）のmockテスト。 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(REPO, '_cms/gas/30_publish.gs'), 'utf8');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' });

function makeHarness(props, options = {}) {
  const cache = new Map();
  const fetches = [];
  const harness = { fetches, cache, role: options.role || 'admin' };
  const context = {
    Date,
    JSON,
    Math,
    String,
    Number,
    RegExp,
    Error,
    Object,
    Array,
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => (key in props ? props[key] : null) }) },
    CacheService: { getScriptCache: () => ({ get: key => (cache.has(key) ? cache.get(key) : null), put: (key, value) => cache.set(key, value) }) },
    Utilities: {
      base64EncodeWebSafe: input => Buffer.from(typeof input === 'string' ? input : Uint8Array.from(input)).toString('base64url'),
      computeRsaSha256Signature: (value, key) => Array.from(crypto.sign('sha256', Buffer.from(value), key)),
      computeDigest: (algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        fetches.push({ url, method: opts.method, auth: opts.headers.Authorization, payload: opts.payload });
        const respond = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
        if (options.respond) {
          const custom = options.respond(url, opts);
          if (custom) return respond(custom.code, custom.body);
        }
        if (/\/repos\/[^/]+\/[^/]+\/installation$/.test(url)) return respond(200, { id: 4242 });
        if (/\/app\/installations\/4242\/access_tokens$/.test(url)) return respond(201, { token: 'ghs_' + 'x'.repeat(30) });
        if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return respond(200, { full_name: 'oginginlmftv2/line-monster-farm', permissions: { push: true } });
        return respond(404, { message: 'Not Found' });
      },
    },
    prop_: key => {
      if (!props[key]) throw new Error('スクリプトプロパティ ' + key + ' が未設定です。');
      return props[key];
    },
    optionalProp_: key => String(props[key] || '').trim(),
    me_: () => ({ role: harness.role, nickname: 'tester' }),
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: '30_publish.gs' });
  harness.ctx = context;
  return harness;
}

function decodeJwt(jwt) {
  const [header, payload, signature] = jwt.split('.');
  const verified = crypto.verify('sha256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'));
  return { header: JSON.parse(Buffer.from(header, 'base64url')), payload: JSON.parse(Buffer.from(payload, 'base64url')), verified };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

test('認証モード: App設定があればapp、無ければpat、どちらも無ければ空', () => {
  assert.strictEqual(makeHarness({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: PEM, GITHUB_TOKEN: 'ghp_x' }).ctx.githubAuthMode_(), 'app');
  assert.strictEqual(makeHarness({ GITHUB_TOKEN: 'ghp_x' }).ctx.githubAuthMode_(), 'pat');
  assert.strictEqual(makeHarness({}).ctx.githubAuthMode_(), '');
  assert.throws(() => makeHarness({}).ctx.requireGithubAuthConfig_(), /GITHUB_APP_ID と GITHUB_APP_PRIVATE_KEY/);
});

test('PEM復元: 1行化・\\n表記のどちらも64桁改行のPEMへ戻す', () => {
  const ctx = makeHarness({}).ctx;
  const oneLine = PEM.replace(/\n/g, ' ');
  const escaped = PEM.replace(/\n/g, '\\n');
  assert.strictEqual(ctx.githubAppNormalizePem_(oneLine), PEM);
  assert.strictEqual(ctx.githubAppNormalizePem_(escaped), PEM);
  assert.strictEqual(ctx.githubAppNormalizePem_(PEM), PEM);
  assert.throws(() => ctx.githubAppNormalizePem_('not a key'), /PEM形式/);
});

test('installation token: JWTが秘密鍵で検証でき、installation→access_tokensの順で発行する', () => {
  const h = makeHarness({ GITHUB_APP_ID: '123456', GITHUB_APP_PRIVATE_KEY: PEM });
  const token = h.ctx.githubAuthToken_();
  assert.match(token, /^ghs_/);
  assert.strictEqual(h.fetches.length, 2);
  assert.strictEqual(h.fetches[0].url, 'https://api.github.com/repos/oginginlmftv2/line-monster-farm/installation');
  assert.strictEqual(h.fetches[1].url, 'https://api.github.com/app/installations/4242/access_tokens');
  assert.deepStrictEqual(JSON.parse(h.fetches[1].payload), { repositories: ['line-monster-farm'], permissions: { contents: 'write' } });
  const jwt = decodeJwt(h.fetches[0].auth.replace(/^Bearer /, ''));
  assert.strictEqual(jwt.verified, true);
  assert.deepStrictEqual(jwt.header, { alg: 'RS256', typ: 'JWT' });
  assert.strictEqual(jwt.payload.iss, '123456');
  assert.ok(jwt.payload.exp - jwt.payload.iat <= 10 * 60);
});

test('キャッシュ: 2回目はGitHub Appへ問い合わせず、鍵が変わると再発行する', () => {
  const props = { GITHUB_APP_ID: '123456', GITHUB_APP_PRIVATE_KEY: PEM };
  const h = makeHarness(props);
  h.ctx.githubAuthToken_();
  h.ctx.githubAuthToken_();
  assert.strictEqual(h.fetches.length, 2);
  props.GITHUB_APP_PRIVATE_KEY = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' });
  h.ctx.githubAuthToken_();
  assert.strictEqual(h.fetches.length, 4);
});

test('githubRequest_: App tokenをBearerに使い、PAT設定のみならPATを使う', () => {
  const app = makeHarness({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: PEM });
  app.ctx.githubRequest_('get', '', null, false);
  assert.match(app.fetches[2].auth, /^Bearer ghs_/);
  const pat = makeHarness({ GITHUB_TOKEN: 'ghp_' + 'p'.repeat(30) });
  pat.ctx.githubRequest_('get', '', null, false);
  assert.strictEqual(pat.fetches.length, 1);
  assert.strictEqual(pat.fetches[0].auth, 'Bearer ghp_' + 'p'.repeat(30));
});

test('エラー: App未installは404の案内、GITHUB_APP_IDが数字以外は拒否', () => {
  const h = makeHarness({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: PEM }, {
    respond: url => (/\/installation$/.test(url) ? { code: 404, body: { message: 'Not Found' } } : null),
  });
  assert.throws(() => h.ctx.githubAuthToken_(), /HTTP 404[\s\S]*Install/);
  assert.throws(() => makeHarness({ GITHUB_APP_ID: 'Iv1.abc', GITHUB_APP_PRIVATE_KEY: PEM }).ctx.githubAuthToken_(), /Client IDではない/);
});

test('api_githubAuthCheck: adminだけ実行でき、tokenの値を返さない', () => {
  const h = makeHarness({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: PEM });
  const result = h.ctx.api_githubAuthCheck();
  assert.deepStrictEqual(Object.keys(result).sort(), ['message', 'mode', 'ok']);
  assert.strictEqual(result.mode, 'app');
  assert.strictEqual(result.ok, true);
  assert.doesNotMatch(result.message, /ghs_/);
  assert.throws(() => makeHarness({ GITHUB_TOKEN: 'x' }, { role: 'editor' }).ctx.api_githubAuthCheck(), /adminだけ/);
  assert.strictEqual(makeHarness({}).ctx.api_githubAuthCheck().ok, false);
});

console.log(`PASS ${passed} / FAIL 0`);
