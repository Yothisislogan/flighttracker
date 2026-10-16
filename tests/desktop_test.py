import importlib.util
import io
import json
import pathlib
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('skyline', pathlib.Path(__file__).resolve().parents[1]/'local/desktop/skyline.py')
skyline=importlib.util.module_from_spec(spec)
spec.loader.exec_module(skyline)

class Response(io.BytesIO):
    headers={'Content-Type':'application/json'}

class ClientTests(unittest.TestCase):
    def test_only_documented_aircraft_paths(self):
        for path in ['/v2/point/40/-75/150','/v2/callsign/AAL123','/v2/hex/a12345','/v2/reg/N123AB']:
            self.assertEqual(skyline.validate_path(path),path)
        for path in ['https://example.com/','//example.com','/v2/point/90/0/250','/v2/point/40/-75/251','/v2/point/nan/0/50','/v2/reg/../../secret','/v2/hex/123456?url=evil']:
            with self.assertRaises(ValueError): skyline.validate_path(path)

    def test_rate_limit_and_access_denial_stop_requests(self):
        for status,delay in [(429,120),(403,3600)]:
            class Opener:
                calls=0
                def open(self,*args,**kwargs):
                    self.calls+=1
                    raise urllib.error.HTTPError('https://api.adsb.lol',status,'Denied',{'Retry-After':'120'},None)
            opener=Opener();client=skyline.FeedClient(opener)
            result=client.read('/v2/hex/a12345')
            self.assertEqual(result[0],status);self.assertEqual(result[2],delay)
            client.read('/v2/hex/a12346')
            self.assertEqual(opener.calls,1)

    def test_valid_response_cached_and_html_rejected(self):
        class Opener:
            calls=0
            def open(self,*args,**kwargs):
                self.calls+=1
                return Response(b'{"ac":[],"now":123}')
        opener=Opener();client=skyline.FeedClient(opener)
        self.assertEqual(client.read('/v2/hex/a12345')[0],200)
        client.read('/v2/hex/a12345');self.assertEqual(opener.calls,1)
        with patch.object(Response,'headers',{'Content-Type':'text/html'}):
            self.assertEqual(skyline.FeedClient(Opener()).read('/v2/hex/a12345')[0],503)

class LocalHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=skyline.http.server.ThreadingHTTPServer(('127.0.0.1',0),skyline.Handler)
        cls.server.app_html=b'<!doctype html><title>Skyline</title>'
        class Feed:
            def read(self,path): return 200,{'ac':[],'now':123},0
        cls.server.feed=Feed()
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def test_app_and_feed_are_same_origin(self):
        with urllib.request.urlopen(self.url+'/') as r: self.assertIn(b'Skyline',r.read())
        with urllib.request.urlopen(self.url+'/api/feed?path=%2Fv2%2Fhex%2Fa12345') as r:
            self.assertEqual(json.load(r)['ac'],[])
            self.assertEqual(r.headers.get('Content-Type'),'application/json')
    def test_remote_origin_and_host_rejected(self):
        for headers in [{'Origin':'https://example.com'},{'Host':'evil.example'},{'Sec-Fetch-Site':'cross-site'}]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(urllib.request.Request(self.url+'/api/feed?path=/v2/hex/a12345',headers=headers))
            self.assertEqual(error.exception.code,403)
    def test_arbitrary_urls_and_local_files_unavailable(self):
        for path,code in [('/api/feed?path=https://example.com/',400),('/../../etc/passwd',404)]:
            with self.assertRaises(urllib.error.HTTPError) as error: urllib.request.urlopen(self.url+path)
            self.assertEqual(error.exception.code,code)

if __name__=='__main__': unittest.main()
