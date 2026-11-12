import test from 'node:test';
import assert from 'node:assert/strict';
import {mapWorldPoint,mapCoordinates,mapMetersPerPixel,mapDistance,visibleMapTiles} from '../lib/audience-map-model.ts';
test('Mercator projection round-trips worldwide coordinates at multiple zooms',()=>{
 for(const zoom of [2,9,15])for(const [latitude,longitude] of [[40.95,-74.04],[31.23,121.47],[-33.86,151.21],[0,0]]){const point=mapWorldPoint(latitude,longitude,zoom),result=mapCoordinates(point.x,point.y,zoom);assert.ok(Math.abs(result.latitude-latitude)<1e-8);assert.ok(Math.abs(result.longitude-longitude)<1e-8);}
});
test('world wrapping, polar clamp and tiles remain bounded',()=>{
 assert.equal(mapCoordinates(256*2**9,0,9).longitude,-180);
 assert.ok(mapCoordinates(0,-100,9).latitude<86);
 const tiles=visibleMapTiles({latitude:85,longitude:179.9},2,1200,900);assert.ok(tiles.every(tile=>tile.x>=0&&tile.x<4&&tile.y>=0&&tile.y<4));assert.equal(new Set(tiles.map(tile=>tile.key)).size,tiles.length);
});
test('circle scale changes with latitude and zoom, distance uses geographic coordinates',()=>{
 assert.ok(Math.abs(mapMetersPerPixel(0,9)/mapMetersPerPixel(0,10)-2)<1e-10);
 assert.ok(mapMetersPerPixel(60,9)<mapMetersPerPixel(0,9));
 assert.equal(mapDistance({latitude:0,longitude:0},{latitude:0,longitude:0}),0);
 assert.ok(Math.abs(mapDistance({latitude:0,longitude:0},{latitude:0,longitude:1})-111319.49)<1);
});
