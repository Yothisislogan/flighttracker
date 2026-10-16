"""Cache a small, reproducible map for the standalone HTML; never fetch flight snapshots."""
import concurrent.futures
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST = ROOT / 'local-map-cache'
DEST.mkdir(exist_ok=True)
TILES = [('earth', 2, x, y) for x in range(4) for y in range(4)]
# One regional viewport around Philadelphia, including New York / Washington.
TILES += [('aerial', 7, x, y) for x in range(34, 41) for y in range(46, 52)]

def download(tile):
    source, z, x, y = tile
    path = DEST / f'{source}-{z}-{x}-{y}.jpg'
    if path.exists() and path.read_bytes().startswith(b'\xff\xd8'):
        return
    url = (f'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'
           if source == 'earth' else f'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}')
    with urllib.request.urlopen(url, timeout=20) as response:
        content = response.read()
        if response.status != 200 or not content.startswith(b'\xff\xd8'):
            raise RuntimeError(f'Invalid imagery: {source}/{z}/{x}/{y}')
    path.write_bytes(content)

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(download, TILES))
(DEST / 'manifest.json').write_text(json.dumps(TILES))
print(f'Cached {len(TILES)} real map tiles ({sum(p.stat().st_size for p in DEST.glob("*.jpg")):,} bytes).')
