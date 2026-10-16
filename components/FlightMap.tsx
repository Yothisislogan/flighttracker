'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LibreMap,GeoJSONSource,StyleSpecification} from 'maplibre-gl';
import {Plus,Minus,Compass,LocateFixed,Layers3,Maximize,Minimize,Mountain,Map as MapIcon,Globe2} from 'lucide-react';
import {airports} from '@/lib/airports';
import type {Aircraft,Region} from '@/lib/types';
export type Camera={lon:number;lat:number;zoom:number;nonce:number};
type Props={aircraft:Aircraft[];selected:Aircraft|null;onSelect:(id:string)=>void;onArea:(r:Region)=>void;camera:Camera;following:boolean;onStopFollow:()=>void;trail:[number,number][];mapKey:string|null;showAirports:boolean;onLocate:()=>void};
const empty={type:'FeatureCollection' as const,features:[]};
function style(key:string|null):StyleSpecification {
  return {version:8,sources:{
    earth:{type:'raster',tiles:['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'],tileSize:256,maxzoom:8,attribution:'<a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>'},
    imagery:key?{type:'raster',url:`https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${encodeURIComponent(key)}`,attribution:'<a href="https://www.maptiler.com/copyright/">© MapTiler</a>'}:{type:'raster',tiles:['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:16,bounds:[-125,24,-66,50],attribution:'<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USDA / USGS The National Map</a>'},
    terrain:{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,maxzoom:15,encoding:'terrarium',attribution:'<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain © Mapzen contributors</a>'},
  },layers:[{id:'background',type:'background',paint:{'background-color':'#17313b'}},{id:'earth',type:'raster',source:'earth',paint:{'raster-saturation':-.15,'raster-brightness-max':.78}},{id:'satellite',type:'raster',source:'imagery',minzoom:key?0:6,paint:{'raster-saturation':-.15,'raster-brightness-max':.84,'raster-fade-duration':400}}]};
}
export default function FlightMap(props:Props){
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<LibreMap|null>(null),latest=useRef(props);latest.current=props;
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[tileError,setTileError]=useState(''),[tilted,setTilted]=useState(false),[layers,setLayers]=useState(false),[mode,setMode]=useState<'satellite'|'earth'>('satellite'),[fullscreen,setFullscreen]=useState(false);
 useEffect(()=>{
  let disposed=false;
  import('maplibre-gl').then(({default:ml})=>{
   if(disposed||!container.current)return;
   try{
    const map=new ml.Map({container:container.current,style:style(latest.current.mapKey),center:[-75.24,39.87],zoom:7.2,minZoom:1.5,maxZoom:16,maxPitch:70,attributionControl:{compact:true},canvasContextAttributes:{antialias:true}});mapRef.current=map;
    map.addControl(new ml.ScaleControl({unit:'nautical',maxWidth:100}),'bottom-left');
    map.on('load',()=>{
     if(disposed)return;
     // Canvas creates a precise north-facing aircraft marker; never a map background.
     const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const c=canvas.getContext('2d')!;
     c.fillStyle='#ffffff';c.beginPath();c.moveTo(32,3);c.bezierCurveTo(35,3,36,12,36,22);c.lineTo(57,36);c.lineTo(57,42);c.lineTo(36,34);c.lineTo(35,49);c.lineTo(44,55);c.lineTo(44,60);c.lineTo(32,56);c.lineTo(20,60);c.lineTo(20,55);c.lineTo(29,49);c.lineTo(28,34);c.lineTo(7,42);c.lineTo(7,36);c.lineTo(28,22);c.bezierCurveTo(28,12,29,3,32,3);c.fill();
     map.addImage('aircraft',c.getImageData(0,0,64,64),{sdf:true});
     for(const a of airports){
      const label=document.createElement('canvas');label.width=120;label.height=52;const ctx=label.getContext('2d')!;ctx.font='600 22px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=6;ctx.strokeStyle='#14232c';ctx.strokeText(a.code,60,28);ctx.fillStyle='#e8f1ed';ctx.fillText(a.code,60,28);map.addImage('airport-'+a.code,ctx.getImageData(0,0,120,52));
     }
     const selectedLabel=document.createElement('canvas');selectedLabel.width=256;selectedLabel.height=60;map.addImage('selected-label',selectedLabel.getContext('2d')!.getImageData(0,0,256,60));
     map.addSource('airports',{type:'geojson',data:{type:'FeatureCollection',features:airports.map(a=>({type:'Feature',geometry:{type:'Point',coordinates:[a.lon,a.lat]},properties:{code:a.code}}))}});
     map.addLayer({id:'airport-dots',type:'circle',source:'airports',paint:{'circle-radius':3,'circle-color':'#ffffff','circle-opacity':.8,'circle-stroke-color':'#253b48','circle-stroke-width':2}});
     map.addLayer({id:'airport-labels',type:'symbol',source:'airports',minzoom:3,layout:{'icon-image':['concat','airport-',['get','code']],'icon-size':.5,'icon-offset':[0,30],'icon-allow-overlap':false}});
     map.addSource('trail',{type:'geojson',data:empty});
     map.addLayer({id:'trail-glow',type:'line',source:'trail',paint:{'line-color':'#ffc770','line-width':8,'line-opacity':.15}});
     map.addLayer({id:'trail-line',type:'line',source:'trail',paint:{'line-color':'#ffc770','line-width':2.5}});
     map.addSource('planes',{type:'geojson',data:empty});
     map.addLayer({id:'selected-halo',type:'circle',source:'planes',filter:['==',['get','selected'],true],paint:{'circle-radius':22,'circle-color':'#ffb64d','circle-opacity':.16,'circle-stroke-width':1,'circle-stroke-color':'#ffc770'}});
     map.addLayer({id:'planes',type:'symbol',source:'planes',layout:{'icon-image':'aircraft','icon-size':['case',['get','selected'],.65,.43],'icon-rotate':['get','heading'],'icon-rotation-alignment':'map','icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-sort-key':['case',['get','selected'],100,0]},paint:{'icon-color':['case',['get','selected'],'#ffc575',['get','ground'],'#b3c5cb','#eaf3f4'],'icon-halo-color':'#12272e','icon-halo-width':1.6,'icon-opacity':['case',['get','stale'],.45,1]}});
     map.addLayer({id:'flight-labels',type:'symbol',source:'planes',filter:['==',['get','selected'],true],layout:{'icon-image':'selected-label','icon-size':.5,'icon-offset':[0,59],'icon-allow-overlap':true}});
     map.on('click','planes',e=>{const id=e.features?.[0]?.properties?.id;if(id)latest.current.onSelect(id);});
     map.on('mouseenter','planes',()=>{map.getCanvas().style.cursor='pointer';});map.on('mouseleave','planes',()=>{map.getCanvas().style.cursor='';});
     setReady(true);
    });
    map.on('error',e=>{if(e.error?.message?.includes('WebGL'))setError('Your browser could not start the 3D map. Turn on hardware acceleration, or try another browser. Flight search still works.');else if((e as any).sourceId==='imagery')setTileError('Detailed imagery is temporarily unavailable. Switch to Earth view.');});
    map.on('dragstart',()=>latest.current.onStopFollow());
    map.on('moveend',()=>{const p=map.getCenter(); const b=map.getBounds();const span=Math.max(Math.abs(b.getEast()-b.getWest())*Math.cos(p.lat*Math.PI/180),Math.abs(b.getNorth()-b.getSouth()));latest.current.onArea({lat:p.lat,lon:((p.lng+540)%360)-180,radius:Math.min(250,Math.max(30,Math.round(span*30))),label:'Map area'});});
   }catch{setError('The 3D map is unavailable in this browser. Flight search and saved aircraft are still available.');}
  }).catch(()=>setError('The map could not load. Please reload this page.'));
  return()=>{disposed=true;mapRef.current?.remove();mapRef.current=null;};
 },[]);
 useEffect(()=>{const m=mapRef.current;if(!ready||!m)return;if(props.selected){const label=document.createElement('canvas');label.width=256;label.height=60;const ctx=label.getContext('2d')!;ctx.font='600 24px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=7;ctx.strokeStyle='#14232c';ctx.strokeText(props.selected.callsign,128,30);ctx.fillStyle='#ffe2b5';ctx.fillText(props.selected.callsign,128,30);m.updateImage('selected-label',ctx.getImageData(0,0,256,60));}const aircraft=props.aircraft.some(a=>a.id===props.selected?.id)||!props.selected?props.aircraft:[...props.aircraft,props.selected];(m.getSource('planes') as GeoJSONSource)?.setData({type:'FeatureCollection',features:aircraft.map(a=>({type:'Feature',geometry:{type:'Point',coordinates:[a.lon,a.lat]},properties:{id:a.id,callsign:a.callsign,heading:a.heading??0,ground:a.ground,selected:a.id===props.selected?.id,stale:Date.now()-a.positionAt>90000}}))});},[props.aircraft,props.selected,ready]);
 useEffect(()=>{const m=mapRef.current;if(!ready||!m)return;(m.getSource('trail') as GeoJSONSource)?.setData(props.trail.length<2?empty:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:props.trail},properties:{}}]});},[props.trail,ready]);
 useEffect(()=>{if(ready)mapRef.current?.flyTo({center:[props.camera.lon,props.camera.lat],zoom:props.camera.zoom,duration:900,essential:false});},[props.camera,ready]);
 useEffect(()=>{if(ready&&props.following&&props.selected)mapRef.current?.easeTo({center:[props.selected.lon,props.selected.lat],duration:1200});},[props.selected?.positionAt,props.following,ready]);
 useEffect(()=>{if(!ready)return;for(const id of ['airport-dots','airport-labels'])mapRef.current?.setLayoutProperty(id,'visibility',props.showAirports?'visible':'none');},[props.showAirports,ready]);
 useEffect(()=>{const fn=()=>{setFullscreen(Boolean(document.fullscreenElement));setTimeout(()=>mapRef.current?.resize(),100);};document.addEventListener('fullscreenchange',fn);return()=>document.removeEventListener('fullscreenchange',fn);},[]);
 function tilt(){const m=mapRef.current;if(!m||!ready)return;const next=!tilted;setTilted(next);m.setTerrain(next?{source:'terrain',exaggeration:1.25}:null);m.easeTo({pitch:next?58:0,bearing:next?-12:0,duration:800});}
 function chooseMode(v:'satellite'|'earth'){if(!ready)return;setMode(v);mapRef.current?.setLayoutProperty('satellite','visibility',v==='satellite'?'visible':'none');setLayers(false);setTileError('');}
 return <div className="map-shell">
  <div className="map-canvas" ref={container} aria-label="Interactive satellite map of aircraft"/>
  {!ready&&!error&&<div className="map-loading"><Globe2 size={35}/><strong>Opening your window to the skies</strong><span>Loading satellite imagery…</span></div>}
  {error&&<div className="map-error"><MapIcon/><h3>Map unavailable</h3><p>{error}</p><button onClick={()=>location.reload()}>Reload map</button></div>}
  {tileError&&<div className="tile-error" role="status">{tileError}<button onClick={()=>chooseMode('earth')}>Earth view</button></div>}
  <div className="map-tools" aria-label="Map controls">
   <button title="Zoom in" aria-label="Zoom in" onClick={()=>mapRef.current?.zoomIn()}><Plus size={19}/></button>
   <button title="Zoom out" aria-label="Zoom out" onClick={()=>mapRef.current?.zoomOut()}><Minus size={19}/></button>
   <span className="tool-divider"/>
   <button title="Reset north" aria-label="Reset map north" onClick={()=>mapRef.current?.easeTo({bearing:0,duration:500})}><Compass size={19}/></button>
   <button title="Find my location" aria-label="Find my location" onClick={props.onLocate}><LocateFixed size={19}/></button>
   <button className={tilted?'active':''} title="3D terrain" aria-label="Toggle 3D terrain" aria-pressed={tilted} onClick={tilt}><span className="three-d">3D</span></button>
   <button title="Full screen" aria-label="Toggle full screen" onClick={async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setTileError('Full screen is unavailable in this browser.');}}}>{fullscreen?<Minimize size={18}/>:<Maximize size={18}/>}</button>
  </div>
  <div className="layers-anchor"><button className="layers-trigger" onClick={()=>setLayers(!layers)} aria-expanded={layers}><Layers3 size={17}/>{mode==='satellite'?'Satellite':'Earth'}<span className="shortcut">▴</span></button>
  {layers&&<div className="layers-popover"><div className="eyebrow">MAP STYLE</div><button className={mode==='satellite'?'chosen':''} onClick={()=>chooseMode('satellite')}><span className="layer-thumb satellite-thumb"/><span><strong>Satellite</strong><small>Detailed U.S. aerial imagery</small></span></button><button className={mode==='earth'?'chosen':''} onClick={()=>chooseMode('earth')}><span className="layer-thumb earth-thumb"/><span><strong>Earth</strong><small>NASA global satellite mosaic</small></span></button><p><Mountain size={14}/> Use 3D to explore the terrain.</p></div>}</div>
  <div className="map-legend"><i/><span>Airborne</span><i className="ground"/><span>On ground</span><i className="selected"/><span>Selected</span></div>
 </div>;
}
