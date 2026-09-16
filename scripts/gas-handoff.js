#!/usr/bin/env node
'use strict';

/**
 * GASへ貼るコードのコピペ用HTMLを生成する。
 *
 *   node scripts/gas-handoff.js <_cms/gas配下のファイル名>... [--ref origin/main] [--out <dir>]
 *
 * 1ファイル＝1HTML。コードは画面に描画せず隠した<pre>に持ち、コピーボタンでクリップボードへ渡す
 * （全文を可視表示すると200KB級のページが開けないことがあった）。行数・文字数・SHA-256・1行目・
 * 最終行を照合用に載せ、貼り付け途中で切れた事故を検知できるようにする。
 * 既定では origin/main の内容を使う。作業ツリーは別セッションの未コミット変更を含みうるため。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let ref = 'origin/main';
let outDir = path.join(os.tmpdir(), 'gas-handoff'); // リポジトリ内に出すとverifyの公開HTML検査に混ざる
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ref') ref = args[++i];
  else if (args[i] === '--out') outDir = path.resolve(args[++i]);
  else if (args[i] === '--worktree') ref = null;
  else files.push(args[i].replace(/^_cms\/gas\//, ''));
}
if (!files.length) {
  console.error('使い方: node scripts/gas-handoff.js <ファイル名>... [--ref origin/main | --worktree] [--out <dir>]');
  process.exit(2);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function readSource(name) {
  const rel = `_cms/gas/${name}`;
  if (ref === null) return fs.readFileSync(path.join(REPO, rel), 'utf8');
  return execFileSync('git', ['show', `${ref}:${rel}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
}

function gasTargetLabel(name) {
  if (name.endsWith('.gs')) return `スクリプトファイル「${name.replace(/\.gs$/, '')}」（.gs）`;
  if (name.endsWith('.html')) return `HTMLファイル「${name.replace(/\.html$/, '')}」`;
  return name;
}

function buildPage(name, source) {
  const lines = source.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const sha = crypto.createHash('sha256').update(source).digest('hex');
  const chars = source.length;
  const first = lines[0] || '';
  const last = lines[lines.length - 1] || '';
  const apiNames = [...source.matchAll(/^function\s+(api_[A-Za-z0-9_]+)\s*\(/gm)].map(m => m[1]);
  const refLabel = ref === null ? '作業ツリー' : ref;
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  return `<title>${esc(name)} 貼り付け</title>
<style>
:root{--bg:#f6f4ef;--ink:#1d1c1a;--muted:#6b665d;--line:#d9d3c7;--panel:#fffdf8;--accent:#1f5f8b;--accent-ink:#fff;--ok:#2d6a3e;--code:#f0ece3}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1a17;--ink:#ece8df;--muted:#a49e92;--line:#3a372f;--panel:#242219;--accent:#6fb1e0;--accent-ink:#0f1a22;--ok:#7fc48f;--code:#2a2820}}
:root[data-theme="dark"]{--bg:#1b1a17;--ink:#ece8df;--muted:#a49e92;--line:#3a372f;--panel:#242219;--accent:#6fb1e0;--accent-ink:#0f1a22;--ok:#7fc48f;--code:#2a2820}
body{background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;padding:0 16px;padding-block:24px 48px;max-width:720px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px;text-wrap:balance}h1 code{font-size:20px}
.sub{color:var(--muted);margin:0 0 20px;font-size:13px}
.copy{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--panel);margin-bottom:20px}
button{font:inherit;font-weight:600;padding:10px 18px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);cursor:pointer}
button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
#status{color:var(--muted);font-size:14px}#status.ok{color:var(--ok);font-weight:600}
h2{font-size:15px;margin:24px 0 8px;letter-spacing:.02em}
table{border-collapse:collapse;width:100%;font-size:14px}td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}td:first-child{color:var(--muted);white-space:nowrap;width:8em}
td code,li code,p code{font:13px/1.5 ui-monospace,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:4px;word-break:break-all}
ol{padding-left:22px;margin:0}li{margin:4px 0}
.check{margin-top:8px;padding:10px 12px;background:var(--code);border-radius:6px;font:13px/1.5 ui-monospace,Menlo,monospace;overflow-x:auto;white-space:pre}
.hidden{position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;white-space:pre}
</style>
<h1><code>${esc(name)}</code> を本番GASへ貼る</h1>
<p class="sub">${esc(refLabel)} の内容 / 生成 ${esc(generatedAt)}</p>

<div class="copy">
  <button type="button" id="copyBtn">全文をコピー</button>
  <span id="status">${lines.length.toLocaleString()} 行・${chars.toLocaleString()} 文字</span>
</div>

<h2>照合用（貼り付け後に確認）</h2>
<table>
<tr><td>行数</td><td>${lines.length.toLocaleString()} 行</td></tr>
<tr><td>文字数</td><td>${chars.toLocaleString()} 文字</td></tr>
<tr><td>1行目</td><td><code>${esc(first)}</code></td></tr>
<tr><td>最終行</td><td><code>${esc(last)}</code></td></tr>
<tr><td>SHA-256</td><td><code>${sha}</code></td></tr>
</table>

<h2>手順</h2>
<ol>
<li>Apps Script エディタで ${esc(gasTargetLabel(name))} を開く</li>
<li>エディタ内をクリックして <code>⌘A</code>（全選択）→ <code>Delete</code></li>
<li>上の「全文をコピー」を押してから <code>⌘V</code> で貼り付け</li>
<li>最終行が上の照合用と一致することを確認して保存（<code>⌘S</code>）</li>
<li>すべてのファイルを貼り終えたら「デプロイ → デプロイを管理 → 編集 → 新バージョン → デプロイ」</li>
</ol>
${apiNames.length ? `<h2>反映確認（管理画面のコンソールで）</h2>
<div class="check">Object.keys(google.script.run).filter(k=>k.startsWith('api_'))</div>
<p class="sub" style="margin-top:8px">このファイルのAPI: ${apiNames.map(n => `<code>${esc(n)}</code>`).join(' ')}</p>` : ''}

<pre id="src" class="hidden" aria-hidden="true">${esc(source)}</pre>
<script>
(function(){
  var btn=document.getElementById('copyBtn'),status=document.getElementById('status'),src=document.getElementById('src');
  function done(ok){status.textContent=ok?'コピーしました（'+${lines.length}+' 行）':'コピーできませんでした。ブラウザの許可を確認してください';status.className=ok?'ok':'';}
  function fallback(text){var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}document.body.removeChild(ta);done(ok);}
  btn.onclick=function(){var text=src.textContent;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done(true);},function(){fallback(text);});}else fallback(text);};
})();
</script>
`;
}

fs.mkdirSync(outDir, { recursive: true });
for (const name of files) {
  const source = readSource(name);
  const html = buildPage(name, source);
  const out = path.join(outDir, `${name.replace(/[^A-Za-z0-9_.-]/g, '_')}.html`);
  fs.writeFileSync(out, html);
  const sha = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
  console.log(`${out}\t${source.split('\n').length}行\t${source.length}文字\tsha ${sha}…`);
}
