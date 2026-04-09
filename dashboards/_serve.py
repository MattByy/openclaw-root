#!/usr/bin/env python3
import os, sys, urllib.request, urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ALLOWED = {
    'gamma-api.polymarket.com',
    'data-api.polymarket.com',
    'clob.polymarket.com',
}

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/_proxy'):
            qs = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(qs)
            target = (params.get('url') or [None])[0]
            if not target:
                self.send_error(400, 'missing url'); return
            host = urllib.parse.urlparse(target).hostname or ''
            if host not in ALLOWED:
                self.send_error(403, 'host not allowed: ' + host); return
            try:
                req = urllib.request.Request(target, headers={'User-Agent': 'clawmode-dashboard/1.0', 'Accept': 'application/json'})
                with urllib.request.urlopen(req, timeout=15) as r:
                    body = r.read()
                    self.send_response(200)
                    self.send_header('Content-Type', r.headers.get('Content-Type', 'application/json'))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(body)
            except Exception as e:
                try: self.send_error(502, str(e))
                except Exception: pass
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        pass  # quiet

if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 3333
    os.chdir(root)
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
