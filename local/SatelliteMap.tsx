import {useEffect, useRef, useState} from 'react';
import {Plus, Minus, LocateFixed, Layers3, Maximize, Globe2} from 'lucide-react';
import type {Props} from '../components/FlightMap';
import {airports} from '../lib/airports';
import {project, unproject, screenPoint, visibleTiles} from './projection.mjs';

type View = {lon:number;lat:number;zoom:number};
const earthURL = (z:number,x:number,y:number) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;
const aerialURL = (z:number,x:number,y:number) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`;
const bundled:Record<string,string> = (window as Window & {SKYLINE_MAP_TILES?:Record<string,string>}).SKYLINE_MAP_TILES || {};

// Ordinary image tiles: no WebGL, canvas texture reads, web workers or CDN code.
export default function SatelliteMap(props:Props) {
  const container = useRef<HTMLDivElement>(null), latest = useRef(props); latest.current = props;
  const [size,setSize] = useState({width:0,height:0});
  const [view,setView] = useState<View>({lon:props.camera.lon,lat:props.camera.lat,zoom:7});
  const [mode,setMode] = useState<'satellite'|'earth'>('satellite');
  const [counts,setCounts] = useState({loaded:0,failed:0});
  const [slow,setSlow] = useState(false), [uiError,setUIError] = useState('');
  const drag = useRef<{id:number;x:number;y:number;view:View}|null>(null);
  const viewRef = useRef(view); viewRef.current = view;
  useEffect(() => {
    if (!container.current) return;
    const resize = () => {const r=container.current!.getBoundingClientRect();setSize({width:r.width,height:r.height});};
    resize(); const observer = new ResizeObserver(resize);observer.observe(container.current);
    return () => observer.disconnect();
  },[]);
  useEffect(() => {setView({lon:props.camera.lon,lat:props.camera.lat,zoom:Math.max(2,Math.min(16,Math.round(props.camera.zoom)))});},[props.camera]);
  useEffect(() => {if(props.following&&props.selected)setView(v=>({...v,lon:props.selected!.lon,lat:props.selected!.lat}));},[props.following,props.selected?.positionAt]);
  useEffect(() => {
    if (!size.width) return;
    const [cx,cy]=project(view.lon,view.lat,view.zoom);
    const [,north]=unproject(cx,cy-size.height/2,view.zoom);
    const radius=Math.min(250,Math.max(30,Math.round(Math.max(Math.abs(north-view.lat)*60,size.width/(256*2**view.zoom)*21600*Math.cos(view.lat*Math.PI/180)/2))));
    latest.current.onArea({lat:Math.max(-85,Math.min(85,view.lat)),lon:view.lon,radius,label:'Map area'});
    const images=Array.from(container.current?.querySelectorAll<HTMLImageElement>('.online-tile')||[]);
    setCounts({loaded:images.filter(i=>i.complete&&i.naturalWidth>0).length,failed:images.filter(i=>i.complete&&!i.naturalWidth).length});setSlow(false);
    const timer=setTimeout(()=>setSlow(true),12000);return()=>clearTimeout(timer);
  },[view,size,mode]);
  useEffect(() => {
    const element=container.current;if(!element)return;let last=0;
    const wheel=(e:WheelEvent)=>{e.preventDefault();if(Date.now()-last<160)return;last=Date.now();latest.current.onStopFollow();setView(v=>({...v,zoom:Math.max(2,Math.min(16,v.zoom+(e.deltaY<0?1:-1)))}));};
    element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
  },[]);
  const point=(lon:number,lat:number)=>screenPoint(lon,lat,view,size.width,size.height);
  const aerial=mode==='satellite'&&view.zoom>=6&&view.lon>-127&&view.lon<-64&&view.lat>22&&view.lat<52;
  const tiles = [
    ...visibleTiles(view,size.width,size.height,8).map(t=>({...t,source:'earth',url:earthURL(t.z,t.x,t.y)})),
    ...(aerial?visibleTiles(view,size.width,size.height,16).map(t=>({...t,source:'aerial',url:aerialURL(t.z,t.x,t.y)})):[]),
  ];
  const baseTiles = visibleTiles(view,size.width,size.height,2).map(t=>({...t,source:'earth',url:bundled[`earth/${t.z}/${t.x}/${t.y}`]}));
  const regionalTiles = aerial&&view.zoom>=7 ? visibleTiles(view,size.width,size.height,7).map(t=>({...t,source:'aerial',url:bundled[`aerial/${t.z}/${t.x}/${t.y}`]})).filter(t=>t.url) : [];
  const planes=props.selected&&!props.aircraft.some(a=>a.id===props.selected?.id)?[...props.aircraft,props.selected]:props.aircraft;
  const zoom=(by:number)=>{latest.current.onStopFollow();setView(v=>({...v,zoom:Math.max(2,Math.min(16,v.zoom+by))}));};
  return <div className="map-shell local-map">
    <div className="map-canvas local-map-surface" ref={container} aria-label="Interactive satellite map of aircraft" tabIndex={0}
      onKeyDown={e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1);}if(e.key==='-'){e.preventDefault();zoom(-1);}if(e.key.startsWith('Arrow')){e.preventDefault();latest.current.onStopFollow();setView(v=>{const [x,y]=project(v.lon,v.lat,v.zoom);const [lon,lat]=unproject(x+(e.key==='ArrowLeft'?-128:e.key==='ArrowRight'?128:0),y+(e.key==='ArrowUp'?-128:e.key==='ArrowDown'?128:0),v.zoom);return{...v,lon,lat};});}}}
      onPointerDown={e=>{if(e.button!==0)return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,view:viewRef.current};e.currentTarget.setPointerCapture(e.pointerId);latest.current.onStopFollow();}}
      onPointerMove={e=>{const d=drag.current;if(!d||e.pointerId!==d.id)return;const [x,y]=project(d.view.lon,d.view.lat,d.view.zoom);const [lon,lat]=unproject(x-(e.clientX-d.x),y-(e.clientY-d.y),d.view.zoom);setView({...d.view,lon,lat});}}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
      <div className="local-tiles" aria-hidden="true">{size.width>0&&[...baseTiles,...regionalTiles].map(t=><img key={`bundled/${t.source}/${t.key}`} src={t.url} alt="" draggable={false} style={{left:t.left,top:t.top,width:t.size+.5,height:t.size+.5}}/>)}{size.width>0&&tiles.map(t=><img className="online-tile" key={`${t.source}/${t.key}`} src={t.url} alt="" draggable={false} referrerPolicy="no-referrer"
        style={{left:t.left,top:t.top,width:t.size+.5,height:t.size+.5}}
        onLoad={e=>{e.currentTarget.style.visibility='visible';setCounts(c=>({...c,loaded:c.loaded+1}));}}
        onError={e=>{e.currentTarget.style.visibility='hidden';setCounts(c=>({...c,failed:c.failed+1}));}}/>)}</div>
      {props.trail.length>1&&<svg className="local-trail" width={size.width} height={size.height} aria-hidden="true"><polyline points={props.trail.map(([lon,lat])=>point(lon,lat).join(',')).join(' ')} fill="none" stroke="#ffc770" strokeWidth="3"/></svg>}
      {props.showAirports&&airports.map(a=>{const [x,y]=point(a.lon,a.lat);return x>-30&&y>-30&&x<size.width+30&&y<size.height+30?<div key={a.code} className="local-airport" style={{left:x,top:y}}><i/>{a.code}</div>:null;})}
      {planes.map(a=>{const [x,y]=point(a.lon,a.lat);if(x<-25||y<-25||x>size.width+25||y>size.height+25)return null;return <button key={a.id} className={`local-aircraft ${a.id===props.selected?.id?'selected':''} ${Date.now()-a.positionAt>90000?'stale':''}`} style={{left:x,top:y,color:a.id===props.selected?.id?'#ffc575':a.ground?'#b3c5cb':'#fff'}} aria-label={`Select ${a.displayFlight}`} title={`${a.displayFlight} · ${a.altitude===null?'Altitude unavailable':Math.round(a.altitude).toLocaleString()+' ft'}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();props.onSelect(a.id);}}>
        <svg viewBox="0 0 64 64" width="30" height="30" style={{transform:`rotate(${a.heading??0}deg)`}} aria-hidden="true"><path d="M32 3 C35 3 36 12 36 22 L57 36 57 42 36 34 35 49 44 55 44 60 32 56 20 60 20 55 29 49 28 34 7 42 7 36 28 22 C28 12 29 3 32 3Z" fill="currentColor" stroke="#17313b" strokeWidth="2"/></svg>{a.id===props.selected?.id&&<span>{a.callsign}</span>}</button>;})}
    </div>
    {size.width===0&&<div className="map-loading"><Globe2 size={35}/><strong>Opening map</strong></div>}
    {slow&&counts.loaded===0&&<div className="local-map-status" role="status">Using bundled imagery · online detail unavailable</div>}
    {uiError&&<div className="tile-error" role="status">{uiError}</div>}
    <div className="map-tools" aria-label="Map controls"><button aria-label="Zoom in" onClick={()=>zoom(1)}><Plus size={19}/></button><button aria-label="Zoom out" onClick={()=>zoom(-1)}><Minus size={19}/></button><span className="tool-divider"/><button aria-label="Find my location" onClick={props.onLocate}><LocateFixed size={19}/></button><span className="local-2d" title="Compatibility satellite map">2D</span><button aria-label="Toggle full screen" onClick={async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setUIError('Full screen is unavailable here.');}}}><Maximize size={18}/></button></div>
    <div className="layers-anchor"><button className="layers-trigger" onClick={()=>setMode(v=>v==='satellite'?'earth':'satellite')} aria-label="Switch satellite and Earth imagery"><Layers3 size={17}/>{mode==='satellite'?'Satellite':'Earth'}<span className="shortcut">2D</span></button></div>
    <div className="local-map-credit"><a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">NASA GIBS</a>{aerial&&<> · <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noreferrer">USDA / USGS</a></>} · Historical imagery</div>
  </div>;
}
