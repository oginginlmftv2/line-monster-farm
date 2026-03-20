// GameWith画像プロキシサーバー (ポート3003)
// localhost:3000のページからCORSなしでGameWith画像を取得できるようにする
const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
  const match = req.url.match(/^\/gw\/(\d+)/);
  if (match) {
    const n = match[1];
    const url = `https://img.gamewith.jp/article_tools/monsterfarm-line/gacha/Lmonfar_monster_${n}.png`;
    const proxyReq = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (resp) => {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      });
      resp.pipe(res);
    });
    proxyReq.on('error', (e) => {
      res.writeHead(500);
      res.end(e.message);
    });
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(3003, 'localhost', () => {
  console.log('GW proxy running on http://localhost:3003');
});
