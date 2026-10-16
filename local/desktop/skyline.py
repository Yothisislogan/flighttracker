#!/usr/bin/env python3
"""Run Skyline on this computer. Python standard library only; no installation packages."""
import argparse
import http.server
import json
import math
import pathlib
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from email.utils import parsedate_to_datetime

ROOT = pathlib.Path(__file__).resolve().parent
ORIGIN = 'https://api.adsb.lol'


def validate_path(path):
    match = re.fullmatch(r'/v2/point/(-?\d+(?:\.\d+)?)/(-?\d+(?:\.\d+)?)/(\d+(?:\.\d+)?)', path)
    if match:
        lat, lon, radius = map(float, match.groups())
        if all(math.isfinite(v) for v in (lat, lon, radius)) and -85 <= lat <= 85 and -180 <= lon <= 180 and 1 <= radius <= 250:
            return path
    if re.fullmatch(r'/v2/(?:callsign|reg)/[A-Za-z0-9-]{1,12}', path) or re.fullmatch(r'/v2/hex/[A-Fa-f0-9]{6}', path):
        return path
    raise ValueError('Unsupported aircraft query.')


def retry_seconds(value):
    try:
        return max(1, math.ceil(float(value)))
    except (ValueError, TypeError, OverflowError):
        try:
            return max(1, math.ceil(parsedate_to_datetime(value).timestamp() - time.time()))
        except (TypeError, ValueError, OverflowError):
            return 60


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class FeedClient:
    def __init__(self, opener=None):
        self.opener = opener or urllib.request.build_opener(NoRedirect())
        self.lock = threading.Lock()
        self.cache = {}
        self.blocked_until = 0
        self.blocked_status = 503
        self.next_start = 0

    def read(self, path):
        validate_path(path)
        with self.lock:
            now = time.time()
            cached = self.cache.get(path)
            if cached and cached[0] > now:
                return 200, cached[1], 0
            if self.blocked_until > now:
                return self.blocked_status, {'error': 'ADSB.lol is temporarily unavailable.'}, math.ceil(self.blocked_until - now)
            time.sleep(max(0, self.next_start - now))
            self.next_start = time.time() + 1.1
            request = urllib.request.Request(ORIGIN + path, headers={
                'Accept': 'application/json',
                'User-Agent': 'SkylineLocal/3 (+https://github.com/Yothisislogan/flighttracker)',
            })
            try:
                with self.opener.open(request, timeout=6) as response:
                    if 'application/json' not in response.headers.get('Content-Type', '').lower():
                        raise ValueError('Unexpected feed format')
                    raw = response.read(8_000_001)
                    if len(raw) > 8_000_000:
                        raise ValueError('Feed too large')
                    data = json.loads(raw)
                    if not isinstance(data, dict) or not isinstance(data.get('ac', data.get('aircraft')), list):
                        raise ValueError('Invalid feed')
                if len(self.cache) >= 100:
                    self.cache.pop(next(iter(self.cache)))
                self.cache[path] = (time.time() + 20, data)
                return 200, data, 0
            except urllib.error.HTTPError as error:
                status = error.code
                delay = retry_seconds(error.headers.get('Retry-After'))
                if status in (401, 403, 404):
                    delay = max(3600, delay)
                message = f'ADSB.lol returned HTTP {status}.'
            except (OSError, ValueError, TimeoutError):
                status, delay, message = 503, 60, 'Could not connect to the aircraft feed.'
            self.blocked_status = status
            self.blocked_until = time.time() + delay
            return status, {'error': message}, delay


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_body(self, status, body, content_type='application/json', retry=0):
        if not isinstance(body, bytes):
            body = json.dumps(body, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        if retry:
            self.send_header('Retry-After', str(retry))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        host = f'127.0.0.1:{self.server.server_port}'
        if self.headers.get('Host') != host or self.headers.get('Origin') not in (None, f'http://{host}'):
            return self.send_body(403, {'error': 'Only the local Skyline window can access this service.'})
        if self.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none'):
            return self.send_body(403, {'error': 'Cross-site requests are not allowed.'})
        url = urllib.parse.urlsplit(self.path)
        if url.path in ('/', '/Skyline-Local.html') and not url.query:
            return self.send_body(200, self.server.app_html, 'text/html; charset=utf-8')
        if url.path == '/api/feed':
            query = urllib.parse.parse_qs(url.query)
            try:
                if set(query) != {'path'} or len(query['path']) != 1:
                    raise ValueError('Invalid aircraft query')
                path = validate_path(query['path'][0])
            except ValueError:
                return self.send_body(400, {'error': 'Invalid aircraft query.'})
            status, data, retry = self.server.feed.read(path)
            return self.send_body(status, data, retry=retry)
        return self.send_body(404, {'error': 'Not found.'})


def main():
    parser = argparse.ArgumentParser(description='Skyline local flight tracker')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    try:
        app_html = (ROOT / 'Skyline-Local.html').read_bytes()
    except FileNotFoundError:
        print('Unzip the entire Skyline folder before starting it. Skyline-Local.html must be beside skyline.py.')
        return 1
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    server.app_html = app_html
    server.feed = FeedClient()
    address = f'http://127.0.0.1:{server.server_port}/'
    print(f'\nSkyline Local 3\nOpen: {address}\nKeep this window open. Press Ctrl+C to stop.\n', flush=True)
    if not args.no_browser:
        webbrowser.open(address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nSkyline stopped.')
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
