export const MAX_LAT = 85.05112878;
export function project(lon, lat, zoom) {
  const size = 256 * 2 ** zoom;
  const sin = Math.sin(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180);
  return [(lon + 180) / 360 * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
}
export function unproject(x, y, zoom) {
  const size = 256 * 2 ** zoom;
  return [((x / size * 360) % 360 + 360) % 360 - 180,
    Math.atan(Math.sinh(Math.PI * (1 - 2 * Math.max(0, Math.min(size, y)) / size))) * 180 / Math.PI];
}
export function screenPoint(lon, lat, view, width, height) {
  const size = 256 * 2 ** view.zoom;
  const [x, y] = project(lon, lat, view.zoom), [cx, cy] = project(view.lon, view.lat, view.zoom);
  let dx = x - cx;
  dx -= Math.round(dx / size) * size;
  return [width / 2 + dx, height / 2 + y - cy];
}
export function visibleTiles(view, width, height, maxZoom) {
  const z = Math.min(Math.floor(view.zoom), maxZoom), count = 2 ** z;
  const scale = 2 ** (view.zoom - z), tileSize = 256 * scale;
  const [cx, cy] = project(view.lon, view.lat, view.zoom), left = cx - width / 2, top = cy - height / 2;
  const tiles = [];
  for (let y = Math.max(0, Math.floor(top / tileSize)); y <= Math.min(count - 1, Math.floor((top + height) / tileSize)); y++) {
    for (let x = Math.floor(left / tileSize); x <= Math.floor((left + width) / tileSize); x++) {
      tiles.push({z, x: ((x % count) + count) % count, y, left: x * tileSize - left, top: y * tileSize - top, size: tileSize, key: `${z}/${x}/${y}`});
    }
  }
  return tiles;
}
