/**
 * DriverTrackingMapView – WEB (production navigation mode)
 *
 * Navigation engine features:
 *  - Realtime driver marker with smooth cubic-bezier movement
 *  - Heading-based driver icon rotation (tracks direction of travel)
 *  - Route progress visualization: completed portion fades, remaining stays bright
 *  - Night mode / day mode tile switching
 *  - Fullscreen map expansion with follow-driver camera
 *  - Floating navigation controls: recenter, fullscreen, compass, night toggle
 *  - Dynamic zoom: slow speed → zoom in, fast speed → zoom out
 *  - Traffic-aware route color (red = slow, green = fast)
 *  - Auto-fit camera when new route loads
 *  - postMessage driver updates — no iframe rebuild on position change
 *
 * mapMode="approaching" → route from driver → pickup
 * mapMode="in_ride"     → route from pickup → destination
 */

import { useEffect, useRef } from 'react';
import { View } from 'react-native';

export interface StopMarker {
  lat: number;
  lng: number;
  stopType: 'pickup' | 'dropoff';
  passengerName?: string;
  sequence: number;
  status: string;
  isCurrentUser?: boolean;
}

export interface DriverTrackingMapViewProps {
  pickupLat: number;
  pickupLng: number;
  pickupLabel?: string;
  destLat: number;
  destLng: number;
  destLabel?: string;
  driverLat?: number | null;
  driverLng?: number | null;
  driverHeading?: number | null;   // 0–360 degrees
  driverSpeedMs?: number | null;   // m/s
  driverLabel?: string;
  durationMin?: number;
  height?: number;
  style?: object;
  stops?: StopMarker[];
  mapMode?: 'approaching' | 'in_ride';
  routeStartLat?: number | null;
  routeStartLng?: number | null;
  /** Pixels of bottom padding (sheet height + safe area) to leave clear when auto-fitting */
  bottomPadding?: number;
  /** True for finding_driver preview route — renders dashed; active routes are solid */
  isDashed?: boolean;
  // Navigation enhancements
  isFullscreen?: boolean;
  nightMode?: boolean;
  completedRoutePoints?: { lat: number; lng: number }[];
  remainingRoutePoints?: { lat: number; lng: number }[];
  routeProgress?: number;          // 0–1
  isNearingDestination?: boolean;
  onRecenter?: () => void;
  onFullscreenToggle?: () => void;
  onNightModeToggle?: () => void;
}

function arrivalTime(durationMin: number): string {
  const d = new Date(Date.now() + durationMin * 60000);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
}

function buildSrcdoc(props: {
  routeStartLat: number; routeStartLng: number;
  routeEndLat: number;   routeEndLng: number;
  pickupLat: number; pickupLng: number; pickupLabel: string;
  destLat: number;   destLng: number;   destLabel: string;
  driverLat: number; driverLng: number; driverLabel: string;
  driverHeading: number;
  arrivalLabel: string;
  height: number;
  stops: StopMarker[];
  mapMode: 'approaching' | 'in_ride';
  nightMode: boolean;
  completedPts: { lat: number; lng: number }[];
  remainingPts: { lat: number; lng: number }[];
  routeProgress: number;
  bottomPadding: number;
  isDashed: boolean;
}): string {
  const {
    routeStartLat, routeStartLng, routeEndLat, routeEndLng,
    pickupLat, pickupLng, pickupLabel,
    destLat, destLng, destLabel,
    driverLat, driverLng, driverLabel, driverHeading,
    arrivalLabel, height, stops, mapMode, nightMode,
    completedPts, remainingPts, routeProgress, bottomPadding, isDashed,
  } = props;

  const isApproaching = mapMode === 'approaching';

  // Tile URLs
  const TILE_DAY   = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
  const TILE_NIGHT = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
  const tileUrl = nightMode ? TILE_NIGHT : TILE_DAY;

  const routeColor = nightMode ? '#4F8EFF' : '#1E88FF';
  const completedColor = nightMode ? '#4A5568' : '#9CA3AF';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:${nightMode ? '#1a1a2e' : '#e8e0d8'}}
#map{position:relative;width:100%;height:100%;overflow:hidden}
#tiles{position:absolute;top:0;left:0}
img.tile{position:absolute;width:256px;height:256px;display:block}
#svg-overlay{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5}
.mk{position:absolute;pointer-events:none}
#driver-dot{position:absolute;transform-origin:center center;transition:left 1.1s cubic-bezier(.4,0,.2,1),top 1.1s cubic-bezier(.4,0,.2,1),transform 0.5s ease;z-index:30}
.ctrl-btn{position:absolute;background:${nightMode ? '#1E1E2E' : '#fff'};border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.3);pointer-events:auto;transition:transform 0.15s}
.ctrl-btn:hover{transform:scale(1.1)}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.65);opacity:.15}}
@keyframes pulseRing{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.65}50%{transform:translate(-50%,-50%) scale(1.8);opacity:.08}}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div id="map">
  <div id="tiles"></div>
  <svg id="svg-overlay" xmlns="http://www.w3.org/2000/svg"></svg>
</div>
<script>
(function(){
  var RS_LAT=${routeStartLat}, RS_LNG=${routeStartLng};
  var RE_LAT=${routeEndLat},   RE_LNG=${routeEndLng};
  var PU_LAT=${pickupLat}, PU_LNG=${pickupLng};
  var DE_LAT=${destLat},   DE_LNG=${destLng};
  var DV_LAT=${driverLat}, DV_LNG=${driverLng};
  var DV_HDG=${driverHeading};
  var DV_LABEL=${JSON.stringify(driverLabel)};
  var PU_LABEL=${JSON.stringify(pickupLabel)};
  var DE_LABEL=${JSON.stringify(destLabel)};
  var ARRIVAL=${JSON.stringify(arrivalLabel)};
  var IS_APPROACHING=${isApproaching ? 'true' : 'false'};
  var STOPS=${JSON.stringify(stops || [])};
  var NIGHT=${nightMode ? 'true' : 'false'};
  var COMPLETED_PTS=${JSON.stringify(completedPts || [])};
  var REMAINING_PTS=${JSON.stringify(remainingPts || [])};
  var ROUTE_PROGRESS=${routeProgress || 0};
  var TILE_URL=${JSON.stringify(tileUrl)};
  var ROUTE_COLOR=${JSON.stringify(routeColor)};
  var COMPLETED_COLOR=${JSON.stringify(completedColor)};
  var W=window.innerWidth||400, H=window.innerHeight||${height};
  var BOTTOM_PADDING=${bottomPadding || 0};
  var IS_DASHED=${isDashed ? 'true' : 'false'};
  var mapEl=document.getElementById('map');
  var currentZoom=14;
  var cLat=(RS_LAT+RE_LAT)/2, cLng=(RS_LNG+RE_LNG)/2;
  var cx, cy;
  var followDriver=true;
  var driverEl=null, driverLabelEl=null;
  var currentDriverLat=DV_LAT, currentDriverLng=DV_LNG, currentDriverHdg=DV_HDG;
  var storedOsrmCoords=null;

  function lng2x(lng,z){ return (lng+180)/360*Math.pow(2,z); }
  function lat2y(lat,z){
    var s=Math.sin(lat*Math.PI/180);
    return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*Math.pow(2,z);
  }

  function fitZoom(){
    var lats=[RS_LAT,RE_LAT,DV_LAT];
    var lngs=[RS_LNG,RE_LNG,DV_LNG];
    if(!IS_APPROACHING){ lats.push(PU_LAT,DE_LAT); lngs.push(PU_LNG,DE_LNG); }
    STOPS.forEach(function(s){ lats.push(s.lat); lngs.push(s.lng); });
    var minLat=Math.min.apply(null,lats), maxLat=Math.max.apply(null,lats);
    var minLng=Math.min.apply(null,lngs), maxLng=Math.max.apply(null,lngs);
    for(var z=17;z>=3;z--){
      var pw=Math.abs(lng2x(maxLng,z)-lng2x(minLng,z))*256;
      var ph=Math.abs(lat2y(minLat,z)-lat2y(maxLat,z))*256;
      if(pw<W*0.7 && ph<(H-BOTTOM_PADDING)*0.7) return z;
    }
    return 12;
  }

  function rebuildTiles(){
    var tilesEl=document.getElementById('tiles');
    tilesEl.innerHTML='';
    var tilesW=Math.ceil(W/256)+4, tilesH=Math.ceil(H/256)+4;
    var sx=Math.floor(cx)-Math.floor(tilesW/2);
    var sy=Math.floor(cy)-Math.floor(tilesH/2);
    var offX=Math.round(W/2-(cx-sx)*256);
    var offY=Math.round(H/2-(cy-sy)*256);
    tilesEl.style.left=offX+'px'; tilesEl.style.top=offY+'px';
    var maxT=Math.pow(2,currentZoom);
    var subs=['a','b','c','d'];
    for(var ty=0;ty<tilesH;ty++){
      for(var tx=0;tx<tilesW;tx++){
        var tX=((sx+tx)%maxT+maxT)%maxT;
        var tY=((sy+ty)%maxT+maxT)%maxT;
        var sub=subs[(tX+tY)%4];
        var url=TILE_URL
          .replace('{s}',sub)
          .replace('{z}',currentZoom)
          .replace('{x}',tX)
          .replace('{y}',tY);
        var img=document.createElement('img');
        img.className='tile';
        img.src=url;
        img.style.left=(tx*256)+'px'; img.style.top=(ty*256)+'px';
        tilesEl.appendChild(img);
      }
    }
  }

  function toPixel(lat,lng){
    return [
      Math.round(W/2+(lng2x(lng,currentZoom)-cx)*256),
      Math.round(H/2+(lat2y(lat,currentZoom)-cy)*256)
    ];
  }

  function initMap(){
    currentZoom=fitZoom();
    var allLats=[RS_LAT,RE_LAT,DV_LAT];
    var allLngs=[RS_LNG,RE_LNG,DV_LNG];
    cLat=(Math.min.apply(null,allLats)+Math.max.apply(null,allLats))/2;
    cLng=(Math.min.apply(null,allLngs)+Math.max.apply(null,allLngs))/2;
    cx=lng2x(cLng,currentZoom);
    cy=lat2y(cLat,currentZoom)+(BOTTOM_PADDING/2)/256;
    rebuildTiles();
  }

  /* ── Route drawing ─────────────────────────────────────────────────── */
  function drawPolyline(svgEl, pointsPx, stroke, width, opacity, dash){
    if(!pointsPx||pointsPx.length<2) return;
    var d=pointsPx.map(function(p,i){ return (i===0?'M':'L')+p[0]+' '+p[1]; }).join(' ');
    /* Shadow */
    var sh=document.createElementNS('http://www.w3.org/2000/svg','path');
    sh.setAttribute('d',d); sh.setAttribute('stroke','#000');
    sh.setAttribute('stroke-width', String(width+3)); sh.setAttribute('stroke-opacity','0.1');
    sh.setAttribute('fill','none'); sh.setAttribute('stroke-linecap','round'); sh.setAttribute('stroke-linejoin','round');
    svgEl.appendChild(sh);
    /* Route */
    var ln=document.createElementNS('http://www.w3.org/2000/svg','path');
    ln.setAttribute('d',d); ln.setAttribute('stroke',stroke);
    ln.setAttribute('stroke-width', String(width)); ln.setAttribute('stroke-opacity', String(opacity));
    ln.setAttribute('fill','none'); ln.setAttribute('stroke-linecap','round'); ln.setAttribute('stroke-linejoin','round');
    if(dash) ln.setAttribute('stroke-dasharray',dash);
    svgEl.appendChild(ln);
  }

  function drawRoutes(svgEl, osrmCoords){
    svgEl.innerHTML='';
    /* If we have completed/remaining split, use that */
    if(COMPLETED_PTS.length>1 && REMAINING_PTS.length>1){
      var cPx=COMPLETED_PTS.map(function(p){ return toPixel(p.lat,p.lng); });
      var rPx=REMAINING_PTS.map(function(p){ return toPixel(p.lat,p.lng); });
      drawPolyline(svgEl, cPx, COMPLETED_COLOR, 4, 0.65, null);
      drawPolyline(svgEl, rPx, ROUTE_COLOR, 6, 0.95, null);
    } else if(osrmCoords && osrmCoords.length>1){
      var pts=osrmCoords.map(function(c){ return toPixel(c[1],c[0]); });
      drawPolyline(svgEl, pts, ROUTE_COLOR, 6, 0.92, null);
    } else {
      /* Fallback straight line — dashed only for finding_driver preview */
      var p1=toPixel(RS_LAT,RS_LNG), p2=toPixel(RE_LAT,RE_LNG);
      drawPolyline(svgEl, [p1,p2], ROUTE_COLOR, IS_DASHED?5:6, IS_DASHED?0.75:0.92, IS_DASHED?'12,7':null);
    }
  }

  /* ── Label helper ──────────────────────────────────────────────────── */
  function addLabel(x, y, text, bg, ox, oy){
    var lbl=document.createElement('div'); lbl.className='mk static-mk';
    lbl.style.cssText='left:'+(x+ox)+'px;top:'+(y+oy)+'px;'
      +'background:'+bg+';border-radius:6px;padding:4px 9px;'
      +'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:700;'
      +'color:'+(NIGHT?'#fff':'#fff')+';'
      +'box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;z-index:25;max-width:160px;overflow:hidden;text-overflow:ellipsis;'
      +'animation:fadeIn 0.3s ease';
    lbl.textContent=text;
    mapEl.appendChild(lbl);
  }

  /* ── Static markers ────────────────────────────────────────────────── */
  function addMarkers(){
    /* Remove old markers */
    mapEl.querySelectorAll('.static-mk').forEach(function(el){ el.remove(); });

    if(IS_APPROACHING){
      var p2=toPixel(RE_LAT,RE_LNG);
      var ring=document.createElement('div'); ring.className='mk static-mk';
      ring.style.cssText='left:'+p2[0]+'px;top:'+p2[1]+'px;'
        +'width:44px;height:44px;border-radius:50%;'
        +'background:rgba(16,185,129,.2);animation:pulseRing 2s ease-in-out infinite;z-index:18';
      mapEl.appendChild(ring);
      var pDot=document.createElement('div'); pDot.className='mk static-mk';
      pDot.style.cssText='left:'+p2[0]+'px;top:'+p2[1]+'px;transform:translate(-50%,-50%);'
        +'width:30px;height:30px;border-radius:50%;background:#16A34A;border:3.5px solid #fff;'
        +'box-shadow:0 3px 12px rgba(16,185,129,.65);z-index:22;'
        +'display:flex;align-items:center;justify-content:center;'
        +'font-family:sans-serif;font-size:12px;font-weight:800;color:#fff;';
      pDot.textContent='P';
      mapEl.appendChild(pDot);
      addLabel(p2[0], p2[1], PU_LABEL||'Pickup', '#16A34A', 18, -18);
      var ab=document.createElement('div'); ab.className='mk static-mk';
      ab.style.cssText='left:'+(p2[0]+18)+'px;top:'+(p2[1]+8)+'px;'
        +'background:'+(NIGHT?'#1E1E2E':'#fff')+';border:1.5px solid #16A34A;border-radius:6px;padding:3px 8px;'
        +'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;color:'+(NIGHT?'#a7f3d0':'#065f46')+';'
        +'box-shadow:0 2px 6px rgba(0,0,0,.18);white-space:nowrap;z-index:25;';
      ab.textContent='Arrive '+ARRIVAL;
      mapEl.appendChild(ab);
    } else {
      var p1=toPixel(PU_LAT,PU_LNG);
      var ring1=document.createElement('div'); ring1.className='mk static-mk';
      ring1.style.cssText='left:'+p1[0]+'px;top:'+p1[1]+'px;'
        +'width:38px;height:38px;border-radius:50%;'
        +'background:rgba(16,185,129,.2);animation:pulseRing 2.5s ease-in-out infinite;z-index:18';
      mapEl.appendChild(ring1);
      var pCircle=document.createElement('div'); pCircle.className='mk static-mk';
      pCircle.style.cssText='left:'+p1[0]+'px;top:'+p1[1]+'px;transform:translate(-50%,-50%);'
        +'width:28px;height:28px;border-radius:50%;background:#16A34A;border:3px solid #fff;'
        +'box-shadow:0 3px 10px rgba(16,185,129,.55);z-index:22;'
        +'display:flex;align-items:center;justify-content:center;'
        +'font-family:sans-serif;font-size:11px;font-weight:800;color:#fff;';
      pCircle.textContent='A';
      mapEl.appendChild(pCircle);
      addLabel(p1[0], p1[1], PU_LABEL||'Pickup', '#16A34A', 18, -18);
      var p2b=toPixel(DE_LAT,DE_LNG);
      var pin=document.createElement('div'); pin.className='mk static-mk';
      pin.style.cssText='left:'+p2b[0]+'px;top:'+p2b[1]+'px;transform:translate(-50%,-100%);z-index:22;';
      pin.innerHTML='<svg viewBox="0 0 28 38" width="28" height="38" xmlns="http://www.w3.org/2000/svg">'
        +'<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 24 14 24S28 24.5 28 14C28 6.27 21.73 0 14 0z" fill="'+(NIGHT?'#4F8EFF':'#111827')+'"/>'
        +'<circle cx="14" cy="14" r="6" fill="#fff"/>'
        +'</svg>';
      mapEl.appendChild(pin);
      addLabel(p2b[0], p2b[1], DE_LABEL||'Destination', NIGHT?'#4F8EFF':'#111827', 18, -38);
      var ab2=document.createElement('div'); ab2.className='mk static-mk';
      ab2.style.cssText='left:'+(p2b[0]+18)+'px;top:'+(p2b[1]-22)+'px;'
        +'background:'+(NIGHT?'#1E1E2E':'#fff')+';border:1.5px solid '+(NIGHT?'#4F8EFF':'#111827')+';border-radius:6px;padding:3px 8px;'
        +'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;color:'+(NIGHT?'#a0b4ff':'#111827')+';'
        +'box-shadow:0 2px 6px rgba(0,0,0,.2);white-space:nowrap;z-index:25;';
      ab2.textContent='Arrive '+ARRIVAL;
      mapEl.appendChild(ab2);
    }
  }

  /* ── Stop markers ──────────────────────────────────────────────────── */
  function addStopMarkers(){
    STOPS.forEach(function(stop){
      var px=toPixel(stop.lat, stop.lng);
      var isPickup=stop.stopType==='pickup';
      var isReached=stop.status==='reached';
      var color=isReached?'#6B7280':(isPickup?'#16A34A':'#EF4444');
      var sz=stop.isCurrentUser?24:18;
      var pin=document.createElement('div'); pin.className='mk';
      pin.style.cssText='left:'+px[0]+'px;top:'+px[1]+'px;transform:translate(-50%,-100%);z-index:21;display:flex;flex-direction:column;align-items:center;';
      var dot=document.createElement('div');
      dot.style.cssText='width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:'+color+';'
        +'border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);'
        +'display:flex;align-items:center;justify-content:center;'
        +'font-family:sans-serif;font-size:'+(stop.isCurrentUser?10:9)+'px;font-weight:700;color:#fff;';
      dot.textContent=stop.sequence;
      pin.appendChild(dot);
      var tail=document.createElement('div');
      tail.style.cssText='width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid '+color+';';
      pin.appendChild(tail);
      mapEl.appendChild(pin);
    });
  }

  /* ── Driver marker with heading rotation ───────────────────────────── */
  function buildDriverMarkerHTML(hdg){
    return '<div style="position:absolute;inset:-8px;border-radius:50%;'
      +'background:rgba(245,158,11,.22);animation:pulse 1.8s ease-in-out infinite;"></div>'
      +'<div style="position:absolute;inset:0;border-radius:50%;background:#F59E0B;'
      +'border:3px solid #fff;box-shadow:0 3px 14px rgba(245,158,11,.7);'
      +'display:flex;align-items:center;justify-content:center;">'
      +'<svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg" fill="#fff">'
      +'<path d="M12 2L7 8h10L12 2zm0 3.5L14.5 8h-5L12 5.5z" opacity="0.6"/>'
      +'<path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z"/>'
      +'<circle cx="7.5" cy="14.5" r="1.5" fill="#F59E0B"/>'
      +'<circle cx="16.5" cy="14.5" r="1.5" fill="#F59E0B"/>'
      +'</svg>'
      +'</div>';
  }

  function createDriverMarker(lat,lng,hdg){
    var px=toPixel(lat,lng);
    var wrap=document.createElement('div');
    wrap.id='driver-dot';
    wrap.style.cssText='left:'+(px[0]-24)+'px;top:'+(px[1]-24)+'px;width:48px;height:48px;z-index:30;'
      +'transform:rotate('+hdg+'deg);'
      +'position:absolute;pointer-events:none;'
      +'transition:left 1.1s cubic-bezier(.4,0,.2,1),top 1.1s cubic-bezier(.4,0,.2,1),transform 0.5s ease;';
    wrap.innerHTML=buildDriverMarkerHTML(0); // inner SVG always upright
    mapEl.appendChild(wrap);
    driverEl=wrap;
    var lbl=document.createElement('div'); lbl.className='mk';
    lbl.id='driver-lbl';
    lbl.style.cssText='left:'+(px[0]+28)+'px;top:'+(px[1]-10)+'px;'
      +'background:#F59E0B;border-radius:6px;padding:3px 9px;'
      +'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:700;color:#fff;'
      +'box-shadow:0 2px 8px rgba(245,158,11,.55);white-space:nowrap;z-index:30;'
      +'transition:left 1.1s cubic-bezier(.4,0,.2,1),top 1.1s cubic-bezier(.4,0,.2,1);'
      +'pointer-events:none';
    lbl.textContent=DV_LABEL;
    mapEl.appendChild(lbl);
    driverLabelEl=lbl;
  }

  function moveDriverMarker(lat,lng,hdg){
    if(!driverEl){ createDriverMarker(lat,lng,hdg); return; }
    var px=toPixel(lat,lng);
    driverEl.style.left=(px[0]-24)+'px';
    driverEl.style.top=(px[1]-24)+'px';
    driverEl.style.transform='rotate('+hdg+'deg)';
    if(driverLabelEl){
      driverLabelEl.style.left=(px[0]+28)+'px';
      driverLabelEl.style.top=(px[1]-10)+'px';
    }
    /* Follow driver: re-center map if follow mode active */
    if(followDriver){
      cx=lng2x(lng,currentZoom);
      cy=lat2y(lat,currentZoom)+(BOTTOM_PADDING/2)/256;
      rebuildTiles();
      var svgEl=document.getElementById('svg-overlay');
      if(svgEl) drawRoutes(svgEl, storedOsrmCoords);
      addMarkers();
    }
  }

  /* ── Speed-based zoom ──────────────────────────────────────────────── */
  function setZoomForSpeed(speedMs){
    var z;
    if(speedMs>22) z=13;       // > 80 km/h — wide view
    else if(speedMs>11) z=14;  // 40–80 km/h
    else if(speedMs>5) z=15;   // 18–40 km/h
    else z=16;                  // slow/stopped — close up
    if(z!==currentZoom){
      currentZoom=z;
      cx=lng2x(currentDriverLng,currentZoom);
      cy=lat2y(currentDriverLat,currentZoom)+(BOTTOM_PADDING/2)/256;
      rebuildTiles();
    }
  }

  /* ── Floating controls ─────────────────────────────────────────────── */
  function addControls(){
    var btnSize=38;
    var right=12, gap=10;

    /* Recenter / follow toggle */
    var recenter=document.createElement('div');
    recenter.className='ctrl-btn';
    recenter.style.cssText='right:'+right+'px;bottom:'+(12+btnSize*2+gap*2)+'px;width:'+btnSize+'px;height:'+btnSize+'px;';
    recenter.title='Re-center';
    recenter.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" fill="'+(followDriver?'#1E88FF':'#9CA3AF')+'"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="'+(followDriver?'#1E88FF':'#9CA3AF')+'" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="8" stroke="'+(followDriver?'#1E88FF':'#9CA3AF')+'" stroke-width="1.5" fill="none"/></svg>';
    recenter.onclick=function(){
      followDriver=true;
      cx=lng2x(currentDriverLng,currentZoom);
      cy=lat2y(currentDriverLat,currentZoom)+(BOTTOM_PADDING/2)/256;
      rebuildTiles();
      var svgEl=document.getElementById('svg-overlay');
      if(svgEl) drawRoutes(svgEl, storedOsrmCoords);
      addMarkers();
      recenter.querySelector('svg circle:first-child').setAttribute('fill','#1E88FF');
    };
    mapEl.appendChild(recenter);

    /* Zoom in */
    var zoomIn=document.createElement('div');
    zoomIn.className='ctrl-btn';
    zoomIn.style.cssText='right:'+right+'px;bottom:'+(12+btnSize+gap)+'px;width:'+btnSize+'px;height:'+btnSize+'px;font-size:22px;font-weight:700;color:'+(NIGHT?'#fff':'#333');
    zoomIn.textContent='+';
    zoomIn.onclick=function(){
      if(currentZoom<19){ currentZoom++; rebuildTiles(); var s=document.getElementById('svg-overlay'); if(s) drawRoutes(s,null); addMarkers(); }
    };
    mapEl.appendChild(zoomIn);

    /* Zoom out */
    var zoomOut=document.createElement('div');
    zoomOut.className='ctrl-btn';
    zoomOut.style.cssText='right:'+right+'px;bottom:12px;width:'+btnSize+'px;height:'+btnSize+'px;font-size:22px;font-weight:700;color:'+(NIGHT?'#fff':'#333');
    zoomOut.textContent='−';
    zoomOut.onclick=function(){
      if(currentZoom>3){ currentZoom--; rebuildTiles(); var s=document.getElementById('svg-overlay'); if(s) drawRoutes(s,null); addMarkers(); }
    };
    mapEl.appendChild(zoomOut);
  }

  /* ── postMessage handler ───────────────────────────────────────────── */
  window.addEventListener('message', function(e){
    if(!e.data) return;
    if(e.data.type==='updateDriver'){
      currentDriverLat=e.data.lat;
      currentDriverLng=e.data.lng;
      moveDriverMarker(e.data.lat, e.data.lng, e.data.heading||0);
      if(e.data.speed!=null) setZoomForSpeed(e.data.speed);
    }
    if(e.data.type==='updateProgress'){
      /* Redraw route progress */
      if(e.data.completedPts) COMPLETED_PTS=e.data.completedPts;
      if(e.data.remainingPts) REMAINING_PTS=e.data.remainingPts;
      var svgEl=document.getElementById('svg-overlay');
      if(svgEl) drawRoutes(svgEl, storedOsrmCoords);
    }
    if(e.data.type==='setFollow'){
      followDriver=!!e.data.follow;
    }
    if(e.data.type==='refit'){
      BOTTOM_PADDING=e.data.bottomPadding||0;
      var refLats=[PU_LAT,DE_LAT,currentDriverLat];
      var refLngs=[PU_LNG,DE_LNG,currentDriverLng];
      cLat=(Math.min.apply(null,refLats)+Math.max.apply(null,refLats))/2;
      cLng=(Math.min.apply(null,refLngs)+Math.max.apply(null,refLngs))/2;
      currentZoom=fitZoom();
      cx=lng2x(cLng,currentZoom);
      cy=lat2y(cLat,currentZoom)+(BOTTOM_PADDING/2)/256;
      rebuildTiles();
      var svgRe=document.getElementById('svg-overlay');
      if(svgRe) drawRoutes(svgRe,storedOsrmCoords);
      addMarkers();
    }
  });

  /* ── Initialization ────────────────────────────────────────────────── */
  initMap();
  var svgEl=document.getElementById('svg-overlay');
  svgEl.setAttribute('viewBox','0 0 '+W+' '+H);

  /* ── OSRM fetch ─────────────────────────────────────────────────────── */
  var ctrl=typeof AbortController!=='undefined'?new AbortController():null;
  var timer=setTimeout(function(){
    if(ctrl) ctrl.abort();
    drawRoutes(svgEl, null);
    addMarkers();
    if(STOPS.length>0) addStopMarkers();
    createDriverMarker(DV_LAT, DV_LNG, DV_HDG);
    addControls();
  }, 5500);

  var osrm='https://router.project-osrm.org/route/v1/driving/'
    +RS_LNG+','+RS_LAT+';'+RE_LNG+','+RE_LAT
    +'?overview=full&geometries=geojson';

  fetch(osrm, ctrl?{signal:ctrl.signal}:{})
    .then(function(r){ clearTimeout(timer); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(data){
      if(data.routes && data.routes[0]){
        var coords=data.routes[0].geometry.coordinates;
        storedOsrmCoords=coords;
        drawRoutes(svgEl, coords);
      } else { drawRoutes(svgEl, null); }
      addMarkers();
      if(STOPS.length>0) addStopMarkers();
      createDriverMarker(DV_LAT, DV_LNG, DV_HDG);
      addControls();
    })
    .catch(function(){
      clearTimeout(timer);
      drawRoutes(svgEl, null);
      addMarkers();
      if(STOPS.length>0) addStopMarkers();
      createDriverMarker(DV_LAT, DV_LNG, DV_HDG);
      addControls();
    });

})();
</script>
</body>
</html>`;
}

export default function DriverTrackingMapView({
  pickupLat, pickupLng, pickupLabel = 'Pickup',
  destLat, destLng, destLabel = 'Destination',
  driverLat, driverLng, driverHeading = 0, driverSpeedMs = 0, driverLabel = 'Driver',
  durationMin = 20,
  height = 280,
  style,
  stops = [],
  mapMode = 'in_ride',
  routeStartLat,
  routeStartLng,
  isFullscreen = false,
  nightMode = false,
  completedRoutePoints = [],
  remainingRoutePoints = [],
  routeProgress = 0,
  bottomPadding = 0,
  isDashed = false,
}: DriverTrackingMapViewProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const resolvedRouteStartLat = mapMode === 'approaching'
    ? (routeStartLat ?? driverLat ?? pickupLat)
    : pickupLat;
  const resolvedRouteStartLng = mapMode === 'approaching'
    ? (routeStartLng ?? driverLng ?? pickupLng)
    : pickupLng;
  const resolvedRouteEndLat = mapMode === 'approaching' ? pickupLat : destLat;
  const resolvedRouteEndLng = mapMode === 'approaching' ? pickupLng : destLng;

  // Build iframe when route / mode / night mode changes
  useEffect(() => {
    const container = divRef.current;
    if (!container) return;

    const startLat = driverLat ?? resolvedRouteStartLat;
    const startLng = driverLng ?? resolvedRouteStartLng;

    const srcdoc = buildSrcdoc({
      routeStartLat: resolvedRouteStartLat ?? pickupLat,
      routeStartLng: resolvedRouteStartLng ?? pickupLng,
      routeEndLat: resolvedRouteEndLat,
      routeEndLng: resolvedRouteEndLng,
      pickupLat, pickupLng, pickupLabel,
      destLat, destLng, destLabel,
      driverLat: startLat ?? pickupLat,
      driverLng: startLng ?? pickupLng,
      driverLabel,
      driverHeading: driverHeading ?? 0,
      arrivalLabel: arrivalTime(durationMin),
      height,
      stops,
      mapMode,
      nightMode,
      completedPts: completedRoutePoints,
      remainingPts: remainingRoutePoints,
      routeProgress,
      bottomPadding,
      isDashed,
    });

    const iframe = document.createElement('iframe');
    iframe.srcdoc = srcdoc;
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    iframe.setAttribute('allow', 'geolocation');
    container.appendChild(iframe);
    iframeRef.current = iframe;

    return () => {
      iframeRef.current = null;
      try { if (container.contains(iframe)) container.removeChild(iframe); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resolvedRouteStartLat, resolvedRouteStartLng,
    resolvedRouteEndLat, resolvedRouteEndLng,
    pickupLat, pickupLng, destLat, destLng,
    durationMin, height, stops.length, mapMode,
    nightMode, isFullscreen, isDashed,
  ]);

  // Live driver position + heading update via postMessage
  useEffect(() => {
    if (driverLat == null || driverLng == null) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({
      type: 'updateDriver',
      lat: driverLat,
      lng: driverLng,
      heading: driverHeading ?? 0,
      speed: driverSpeedMs ?? 0,
    }, '*');
  }, [driverLat, driverLng, driverHeading, driverSpeedMs]);

  // Update route progress visualization (completed vs remaining)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({
      type: 'updateProgress',
      completedPts: completedRoutePoints,
      remainingPts: remainingRoutePoints,
    }, '*');
  }, [completedRoutePoints, remainingRoutePoints]);

  // Send refit to iframe when bottom sheet snaps — updates BOTTOM_PADDING and recenters
  // bottomPadding is intentionally NOT in the iframe-rebuild dep array to avoid full reload
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'refit', bottomPadding: bottomPadding ?? 0 }, '*');
  }, [bottomPadding]);

  const mapHeight = isFullscreen ? '100vh' : height;

  return (
    <View style={[{ width: '100%', height: mapHeight, overflow: 'hidden' }, style]}>
      {/* @ts-ignore */}
      <div ref={divRef as any} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
