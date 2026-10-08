/**
 * RouteMapView – WEB
 *
 * Pure-JS tile map with SVG route overlay — no external CDN scripts.
 * Tiles: CartoDB Voyager (just <img> elements, no CORS issues).
 * Route: fetched from OSRM free API, drawn as SVG polyline.
 * Falls back to straight dashed SVG line if OSRM fails.
 *
 * Markers:
 *  • Green circle  = Pickup  ("A")
 *  • Black pin     = Destination
 */
import { useEffect, useRef } from "react";
import { View } from "react-native";

export interface RouteMapViewProps {
  pickupLat: number;
  pickupLng: number;
  pickupLabel?: string;
  destLat: number;
  destLng: number;
  destLabel?: string;
  durationMin?: number;
  height?: number;
  style?: object;
  showRecenter?: boolean;
}

function arrivalTime(durationMin: number): string {
  const d = new Date(Date.now() + durationMin * 60000);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function buildSrcdoc(props: {
  pickupLat: number; pickupLng: number; pickupLabel: string;
  destLat: number;   destLng: number;   destLabel: string;
  arrivalLabel: string;
  height: number;
}): string {
  const { pickupLat, pickupLng, pickupLabel, destLat, destLng, destLabel, arrivalLabel, height } = props;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#e8e0d8}
#map{position:relative;width:100%;height:100%;overflow:hidden;background:#e8e0d8}
#tiles{position:absolute;top:0;left:0}
img.tile{position:absolute;width:256px;height:256px;display:block}
#svg-overlay{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5}
.mk{position:absolute;pointer-events:none}
@keyframes pulse{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.6}50%{transform:translate(-50%,-50%) scale(1.6);opacity:.1}}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>
<div id="map">
  <div id="tiles"></div>
  <svg id="svg-overlay" xmlns="http://www.w3.org/2000/svg"></svg>
</div>
<script>
(function(){
  var PU_LAT=${pickupLat}, PU_LNG=${pickupLng};
  var DE_LAT=${destLat},   DE_LNG=${destLng};
  var PU_LABEL=${JSON.stringify(pickupLabel)};
  var DE_LABEL=${JSON.stringify(destLabel)};
  var ARRIVAL=${JSON.stringify(arrivalLabel)};
  var W=window.innerWidth||400, H=${height};
  var mapEl=document.getElementById('map');

  function lng2x(lng,z){ return (lng+180)/360*Math.pow(2,z); }
  function lat2y(lat,z){
    var s=Math.sin(lat*Math.PI/180);
    return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*Math.pow(2,z);
  }

  /* auto-zoom to fit both points with padding */
  function fitZoom(){
    for(var z=16;z>=3;z--){
      var pw=Math.abs(lng2x(DE_LNG,z)-lng2x(PU_LNG,z))*256;
      var ph=Math.abs(lat2y(DE_LAT,z)-lat2y(PU_LAT,z))*256;
      if(pw<W*0.60 && ph<H*0.60) return z;
    }
    return 10;
  }

  var ZOOM=fitZoom();
  var cx=(lng2x(PU_LNG,ZOOM)+lng2x(DE_LNG,ZOOM))/2;
  var cy=(lat2y(PU_LAT,ZOOM)+lat2y(DE_LAT,ZOOM))/2;

  /* lat/lng → screen pixel */
  function toPixel(lat,lng){
    return [Math.round(W/2+(lng2x(lng,ZOOM)-cx)*256),
            Math.round(H/2+(lat2y(lat,ZOOM)-cy)*256)];
  }

  /* ── render tiles ── */
  var tilesEl=document.getElementById('tiles');
  var tilesW=Math.ceil(W/256)+3, tilesH=Math.ceil(H/256)+3;
  var sx=Math.floor(cx)-Math.floor(tilesW/2);
  var sy=Math.floor(cy)-Math.floor(tilesH/2);
  var offX=Math.round(W/2-(cx-sx)*256);
  var offY=Math.round(H/2-(cy-sy)*256);
  tilesEl.style.left=offX+'px';
  tilesEl.style.top=offY+'px';
  var maxT=Math.pow(2,ZOOM);
  var subs=['a','b','c','d'];
  for(var ty=0;ty<tilesH;ty++){
    for(var tx=0;tx<tilesW;tx++){
      var tX=((sx+tx)%maxT+maxT)%maxT;
      var tY=((sy+ty)%maxT+maxT)%maxT;
      var sub=subs[(tX+tY)%4];
      var img=document.createElement('img');
      img.className='tile';
      img.src='https://'+sub+'.basemaps.cartocdn.com/rastertiles/voyager/'+ZOOM+'/'+tX+'/'+tY+'.png';
      img.style.left=(tx*256)+'px';
      img.style.top=(ty*256)+'px';
      tilesEl.appendChild(img);
    }
  }

  var svgEl=document.getElementById('svg-overlay');
  svgEl.setAttribute('viewBox','0 0 '+W+' '+H);

  function drawRoute(pointsPx){
    if(!pointsPx||pointsPx.length<2) return;
    var d=pointsPx.map(function(p,i){ return (i===0?'M':'L')+p[0]+' '+p[1]; }).join(' ');
    /* shadow */
    var sh=document.createElementNS('http://www.w3.org/2000/svg','path');
    sh.setAttribute('d',d); sh.setAttribute('stroke','#111827');
    sh.setAttribute('stroke-width','8'); sh.setAttribute('stroke-opacity','0.15');
    sh.setAttribute('fill','none'); sh.setAttribute('stroke-linecap','round'); sh.setAttribute('stroke-linejoin','round');
    svgEl.appendChild(sh);
    /* main route — dark blue, Uber-style */
    var ln=document.createElementNS('http://www.w3.org/2000/svg','path');
    ln.setAttribute('d',d); ln.setAttribute('stroke','#1E88FF');
    ln.setAttribute('stroke-width','5'); ln.setAttribute('stroke-opacity','0.95');
    ln.setAttribute('fill','none'); ln.setAttribute('stroke-linecap','round'); ln.setAttribute('stroke-linejoin','round');
    svgEl.appendChild(ln);
  }

  function drawFallback(){
    var p1=toPixel(PU_LAT,PU_LNG), p2=toPixel(DE_LAT,DE_LNG);
    var fb=document.createElementNS('http://www.w3.org/2000/svg','line');
    fb.setAttribute('x1',p1[0]); fb.setAttribute('y1',p1[1]);
    fb.setAttribute('x2',p2[0]); fb.setAttribute('y2',p2[1]);
    fb.setAttribute('stroke','#1E88FF'); fb.setAttribute('stroke-width','4');
    fb.setAttribute('stroke-dasharray','12,7'); fb.setAttribute('stroke-opacity','0.8');
    svgEl.appendChild(fb);
  }

  /* ── Markers ── */
  function addLabel(x, y, text, bg, offsetX, offsetY){
    var lbl=document.createElement('div'); lbl.className='mk';
    lbl.style.cssText='left:'+(x+offsetX)+'px;top:'+(y+offsetY)+'px;'
      +'background:'+bg+';border-radius:6px;padding:4px 9px;'
      +'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:700;color:#fff;'
      +'box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap;z-index:30;'
      +'animation:fadeIn 0.3s ease;max-width:160px;overflow:hidden;text-overflow:ellipsis';
    lbl.textContent=text;
    mapEl.appendChild(lbl);
  }

  function addMarkers(){
    /* ── Pickup: green circle with "A" ── */
    var p1=toPixel(PU_LAT,PU_LNG);

    /* pulse ring */
    var ring=document.createElement('div'); ring.className='mk';
    ring.style.cssText='left:'+p1[0]+'px;top:'+p1[1]+'px;'
      +'width:36px;height:36px;border-radius:50%;'
      +'background:rgba(16,185,129,0.20);z-index:19;'
      +'animation:pulse 2s ease-in-out infinite';
    mapEl.appendChild(ring);

    /* outer circle */
    var pCircle=document.createElement('div'); pCircle.className='mk';
    pCircle.style.cssText='left:'+p1[0]+'px;top:'+p1[1]+'px;transform:translate(-50%,-50%);'
      +'width:26px;height:26px;border-radius:50%;background:#16A34A;border:3px solid #fff;'
      +'box-shadow:0 3px 10px rgba(16,185,129,.55);z-index:20;'
      +'display:flex;align-items:center;justify-content:center;'
      +'font-family:sans-serif;font-size:11px;font-weight:800;color:#fff;';
    pCircle.textContent='A';
    mapEl.appendChild(pCircle);

    /* pickup label */
    addLabel(p1[0], p1[1], (PU_LABEL||'Pickup'), '#16A34A', 16, -16);

    /* arrival time badge */
    var ab=document.createElement('div'); ab.className='mk';
    ab.style.cssText='left:'+(p1[0]+16)+'px;top:'+(p1[1]+4)+'px;'
      +'background:#fff;border:1.5px solid #16A34A;border-radius:6px;padding:3px 8px;'
      +'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;color:#065f46;'
      +'box-shadow:0 2px 6px rgba(0,0,0,.15);white-space:nowrap;z-index:25;';
    ab.textContent='Arrive '+ARRIVAL;
    mapEl.appendChild(ab);

    /* ── Destination: black pin ── */
    var p2=toPixel(DE_LAT,DE_LNG);

    /* outer circle (black) */
    var dCircle=document.createElement('div'); dCircle.className='mk';
    dCircle.style.cssText='left:'+p2[0]+'px;top:'+p2[1]+'px;transform:translate(-50%,-100%);'
      +'z-index:20;display:flex;flex-direction:column;align-items:center;';
    dCircle.innerHTML='<svg viewBox="0 0 28 38" width="28" height="38" xmlns="http://www.w3.org/2000/svg">'
      +'<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 24 14 24S28 24.5 28 14C28 6.27 21.73 0 14 0z" fill="#111827"/>'
      +'<circle cx="14" cy="14" r="6" fill="#fff"/>'
      +'</svg>';
    mapEl.appendChild(dCircle);

    /* dest label */
    addLabel(p2[0], p2[1], (DE_LABEL||'Destination'), '#111827', 16, -36);
  }

  /* ── My Location button ── */
  var locBtn=document.createElement('div');
  locBtn.style.cssText='position:absolute;bottom:12px;right:12px;width:38px;height:38px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:30;transition:transform 0.15s;pointer-events:auto';
  locBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" fill="#1E88FF"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#1E88FF" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="8" stroke="#1E88FF" stroke-width="1.5" fill="none"/></svg>';
  locBtn.onmouseenter=function(){locBtn.style.transform='scale(1.1)'};
  locBtn.onmouseleave=function(){locBtn.style.transform='scale(1)'};
  locBtn.onclick=function(){
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(function(pos){
        var myPx=toPixel(pos.coords.latitude,pos.coords.longitude);
        var myRing=document.createElement('div'); myRing.className='mk';
        myRing.style.cssText='left:'+myPx[0]+'px;top:'+myPx[1]+'px;width:32px;height:32px;border-radius:50%;background:rgba(26,86,219,.18);transform:translate(-50%,-50%);animation:pulse 1.8s ease-in-out infinite;z-index:18';
        mapEl.appendChild(myRing);
        var myDot=document.createElement('div'); myDot.className='mk';
        myDot.style.cssText='left:'+myPx[0]+'px;top:'+myPx[1]+'px;width:14px;height:14px;border-radius:50%;background:#1E88FF;border:3px solid #fff;box-shadow:0 0 0 3px rgba(26,86,219,.3);transform:translate(-50%,-50%);z-index:19';
        mapEl.appendChild(myDot);
      },{enableHighAccuracy:true,timeout:8000});
    }
  };
  mapEl.appendChild(locBtn);

  /* ── fetch OSRM route with timeout ── */
  var osrm='https://router.project-osrm.org/route/v1/driving/'
    +PU_LNG+','+PU_LAT+';'+DE_LNG+','+DE_LAT
    +'?overview=full&geometries=geojson';

  var ctrl=typeof AbortController!=='undefined'?new AbortController():null;
  var timer=setTimeout(function(){ if(ctrl) ctrl.abort(); addMarkers(); drawFallback(); },5000);

  fetch(osrm,ctrl?{signal:ctrl.signal}:{})
    .then(function(r){ clearTimeout(timer); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(data){
      if(data.routes && data.routes[0]){
        var coords=data.routes[0].geometry.coordinates;
        var points=coords.map(function(c){ return toPixel(c[1],c[0]); });
        drawRoute(points);
      } else { drawFallback(); }
      addMarkers();
    })
    .catch(function(){ clearTimeout(timer); drawFallback(); addMarkers(); });

})();
</script>
</body>
</html>`;
}

export default function RouteMapView({
  pickupLat, pickupLng, pickupLabel = "Pickup",
  destLat, destLng, destLabel = "Destination",
  durationMin = 20,
  height = 320,
  style,
}: RouteMapViewProps) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = divRef.current;
    if (!container) return;

    const arrive = arrivalTime(durationMin);
    const srcdoc = buildSrcdoc({
      pickupLat, pickupLng, pickupLabel,
      destLat, destLng, destLabel,
      arrivalLabel: arrive,
      height,
    });

    const iframe = document.createElement("iframe");
    iframe.srcdoc = srcdoc;
    iframe.style.cssText = `width:100%;height:${height}px;border:none;display:block;`;
    iframe.setAttribute("allow", "geolocation");
    container.appendChild(iframe);

    return () => {
      try { if (container.contains(iframe)) container.removeChild(iframe); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupLat, pickupLng, destLat, destLng, durationMin, height]);

  return (
    <View style={[{ width: "100%", height, overflow: "hidden" }, style]}>
      {/* @ts-ignore */}
      <div ref={divRef as any} style={{ width: "100%", height }} />
    </View>
  );
}
