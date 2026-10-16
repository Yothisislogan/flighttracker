import test from 'node:test';
import assert from 'node:assert/strict';
import {project,unproject,screenPoint,visibleTiles} from '../local/projection.mjs';

test('satellite projection places airports correctly and survives pan/zoom round trips',()=>{
  for(const [lon,lat] of [[-75.2424,39.8744],[-115.1522,36.0801],[0,0],[179.9,-32]]){
    for(const zoom of [2,7,16]){
      const [x,y]=project(lon,lat,zoom),[backLon,backLat]=unproject(x,y,zoom);
      assert.ok(Math.abs(backLon-lon)<1e-8);assert.ok(Math.abs(backLat-lat)<1e-8);
      const [sx,sy]=screenPoint(lon,lat,{lon,lat,zoom},1000,800);
      assert.ok(Math.abs(sx-500)<1e-7&&Math.abs(sy-400)<1e-7);
    }
  }
});

test('date-line aircraft remain close to a map centered across the date line',()=>{
  const [x,y]=screenPoint(-179.9,0,{lon:179.9,lat:0,zoom:7},1000,800);
  assert.ok(x>500&&x<525);assert.equal(y,400);
});

test('tile requests cover the viewport and remain valid near both poles and the date line',()=>{
  for(const view of [{lon:-75.24,lat:39.87,zoom:7},{lon:179.9,lat:85,zoom:4},{lon:-179.9,lat:-85,zoom:4}]){
    const tiles=visibleTiles(view,1000,800,8);
    assert.ok(tiles.length>0&&tiles.length<40);
    for(const tile of tiles){assert.ok(tile.x>=0&&tile.x<2**tile.z);assert.ok(tile.y>=0&&tile.y<2**tile.z);assert.equal(tile.size,256);}
    assert.ok(Math.min(...tiles.map(t=>t.left))<=0);assert.ok(Math.max(...tiles.map(t=>t.left+t.size))>=1000);
  }
});

test('NASA imagery never requests a zoom beyond its published level 8',()=>{
  const tiles=visibleTiles({lon:-75,lat:40,zoom:12},1000,800,8);
  assert.ok(tiles.every(t=>t.z===8&&t.size===4096));
});
