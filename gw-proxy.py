"""
GameWith画像プロキシサーバー (ポート3001)
localhost:3000のページから /gw/N でGameWithの画像を取得できるようにする
"""
import http.server
import urllib.request
import ssl

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        if path.startswith('/gw/'):
            n = path[4:]
            url = f'https://img.gamewith.jp/article_tools/monsterfarm-line/gacha/Lmonfar_monster_{n}.png'
            try:
                ctx = ssl.create_default_context()
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, context=ctx) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'image/png')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'public, max-age=3600')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # ログ抑制

if __name__ == '__main__':
    server = http.server.HTTPServer(('localhost', 3001), ProxyHandler)
    print('GW proxy running on http://localhost:3001')
    server.serve_forever()
