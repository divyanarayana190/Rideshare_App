/**
 * GoogleMapView – WEB
 *
 * Tile map rendered inside a srcdoc iframe with:
 * - Full drag/pan (mouse + touch)
 * - Pinch-to-zoom
 * - Animated pulse ring on user dot
 * - Animated car markers
 * - External map controls via postMessage (zoom / recenter)
 * - Improved road contrast (CartoDB Voyager)
 */
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

export interface DriverMarker {
  id: string;
  lat: number;
  lng: number;
}

export interface GoogleMapViewProps {
  userLat?: number;
  userLng?: number;
  drivers?: DriverMarker[];
  style?: object;
  zoom?: number;
  onMyLocation?: (lat: number, lng: number) => void;
  onMapReady?: (api: MapViewCommands) => void;
}

export interface MapViewCommands {
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: () => void;
}

function buildSrcdoc(
  userLat: number,
  userLng: number,
  drivers: DriverMarker[],
  zoom: number,
): string {
  const driversJson = JSON.stringify(
    drivers.map((d) => ({ lat: d.lat, lng: d.lng })),
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{width:100%;height:100%;overflow:hidden;background:#eae6df;touch-action:none}
#map{position:relative;width:100%;height:100%;overflow:hidden;background:#eae6df;cursor:grab;user-select:none}
#map.dragging{cursor:grabbing}
#tiles{position:absolute;top:0;left:0;will-change:transform;transition:none}
img.tile{position:absolute;width:256px;height:256px;display:block;pointer-events:none}
.mk{position:absolute;pointer-events:none;will-change:transform}
@keyframes pulse{
  0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.55}
  50%{transform:translate(-50%,-50%) scale(2.4);opacity:.07}
}
@keyframes carFloat{
  0%,100%{transform:translate(-50%,-50%) translateY(0)}
  50%{transform:translate(-50%,-50%) translateY(-2px)}
}
</style>
</head>
<body>
<div id="map"><div id="tiles"></div></div>
<script>
(function(){
  var LAT=${userLat}, LNG=${userLng}, ZOOM=${zoom};
  var DRIVERS=${driversJson};
  var MIN_ZOOM=10, MAX_ZOOM=18;

  // Sheet covers the bottom 47% of the iframe in default mode.
  // Camera is anchored to the centre of the VISIBLE area above the sheet
  // so the user dot always lands in clear view.
  var SHEET_FRAC = 0.47;

  function lng2x(lng,z){ return (lng+180)/360*Math.pow(2,z); }
  function lat2y(lat,z){
    var s=Math.sin(lat*Math.PI/180);
    return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*Math.pow(2,z);
  }

  var mapEl=document.getElementById('map');
  var tilesEl=document.getElementById('tiles');

  var W=mapEl.offsetWidth||375;
  var H=mapEl.offsetHeight||600;
  // Vertical camera anchor = centre of visible area above the sheet
  var CAM_CY=Math.round(H*(1-SHEET_FRAC)/2);

  var camX=lng2x(LNG,ZOOM)*256;
  var camY=lat2y(LAT,ZOOM)*256;
  var currentZoom=ZOOM;

  // ── Render tiles ──
  function renderTiles(){
    tilesEl.innerHTML='';
    var z=currentZoom, tileSize=256;
    var cxT=camX/tileSize, cyT=camY/tileSize;
    var tilesW=Math.ceil(W/tileSize)+3, tilesH=Math.ceil(H/tileSize)+3;
    var sx=Math.floor(cxT)-Math.floor(tilesW/2);
    var sy=Math.floor(cyT)-Math.floor(tilesH/2);
    // Use CAM_CY instead of H/2 so tiles align with the camera anchor
    var offX=Math.round(W/2  -(cxT-sx)*tileSize);
    var offY=Math.round(CAM_CY-(cyT-sy)*tileSize);
    tilesEl.style.left=offX+'px';
    tilesEl.style.top=offY+'px';
    var maxT=Math.pow(2,z);
    var subs=['a','b','c','d'];
    for(var ty=0;ty<tilesH;ty++){
      for(var tx=0;tx<tilesW;tx++){
        var tX=((sx+tx)%maxT+maxT)%maxT;
        var tY=((sy+ty)%maxT+maxT)%maxT;
        var sub=subs[(tX+tY)%4];
        var url='https://'+sub+'.basemaps.cartocdn.com/rastertiles/voyager/'+z+'/'+tX+'/'+tY+'.png';
        var img=document.createElement('img');
        img.className='tile';
        img.src=url;
        img.loading='eager';
        img.decoding='async';
        img.style.left=(tx*tileSize)+'px';
        img.style.top=(ty*tileSize)+'px';
        tilesEl.appendChild(img);
      }
    }
  }

  // ── Render overlays (user dot + cars) ──
  function renderOverlays(){
    var old=mapEl.querySelectorAll('.mk');
    old.forEach(function(el){mapEl.removeChild(el);});

    var z=currentZoom;
    var cxT=camX/256, cyT=camY/256;

    // User location dot — anchored at camera centre
    var ux=Math.round(W/2), uy=CAM_CY;
    // Pulse ring
    var ring=document.createElement('div');
    ring.className='mk';
    ring.style.cssText='left:'+ux+'px;top:'+uy+'px;width:48px;height:48px;border-radius:50%;background:rgba(47,107,255,.14);animation:pulse 2s ease-in-out infinite';
    mapEl.appendChild(ring);
    // Accuracy halo
    var halo=document.createElement('div');
    halo.className='mk';
    halo.style.cssText='left:'+ux+'px;top:'+uy+'px;width:28px;height:28px;border-radius:50%;background:rgba(47,107,255,.18);border:1.5px solid rgba(47,107,255,.35)';
    mapEl.appendChild(halo);
    // Inner dot
    var dot=document.createElement('div');
    dot.className='mk';
    dot.style.cssText='left:'+ux+'px;top:'+uy+'px;width:16px;height:16px;border-radius:50%;background:#1E88FF;border:3px solid #fff;box-shadow:0 0 0 3px rgba(47,107,255,.32),0 2px 8px rgba(0,0,0,.25)';
    mapEl.appendChild(dot);

    // Car markers
    var carSvg='<svg viewBox="0 0 20 20" width="14" height="14"><path d="M4.5 10.5L5.8 6.5h8.4l1.3 4H4.5z" fill="#fff"/><rect x="3.5" y="10.5" width="13" height="5" rx="1.5" fill="#fff"/><circle cx="6.5" cy="16" r="1.5" fill="#1E88FF"/><circle cx="13.5" cy="16" r="1.5" fill="#1E88FF"/></svg>';
    DRIVERS.forEach(function(d){
      var px=Math.round(W/2   +(lng2x(d.lng,z)-cxT)*256);
      var py=Math.round(CAM_CY+(lat2y(d.lat,z)-cyT)*256);
      var shadow=document.createElement('div');
      shadow.className='mk';
      shadow.style.cssText='left:'+px+'px;top:'+(py+15)+'px;width:18px;height:5px;border-radius:50%;background:rgba(0,0,0,.18)';
      mapEl.appendChild(shadow);
      var car=document.createElement('div');
      car.className='mk';
      car.style.cssText='left:'+px+'px;top:'+py+'px;width:32px;height:32px;border-radius:50%;background:#1E88FF;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(47,107,255,.55);animation:carFloat 2.4s ease-in-out infinite';
      car.innerHTML=carSvg;
      mapEl.appendChild(car);
    });
  }

  function render(){renderTiles();renderOverlays();}
  render();

  function zoomIn(){
    var nz=Math.min(MAX_ZOOM,currentZoom+1);
    if(nz===currentZoom) return;
    camX*=2; camY*=2; currentZoom=nz; render();
  }
  function zoomOut(){
    var nz=Math.max(MIN_ZOOM,currentZoom-1);
    if(nz===currentZoom) return;
    camX/=2; camY/=2; currentZoom=nz; render();
  }
  function recenterTo(lat,lng){
    camX=lng2x(lng,currentZoom)*256;
    camY=lat2y(lat,currentZoom)*256;
    render();
  }
  function requestMyLocation(){
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(function(pos){
        window.parent.postMessage({type:'myLocation',lat:pos.coords.latitude,lng:pos.coords.longitude},'*');
        recenterTo(pos.coords.latitude,pos.coords.longitude);
      },function(){},{enableHighAccuracy:true,timeout:8000});
    }
  }

  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='mapCommand') return;
    if(e.data.action==='zoomIn') zoomIn();
    else if(e.data.action==='zoomOut') zoomOut();
    else if(e.data.action==='recenter'){
      if(typeof e.data.lat==='number'&&typeof e.data.lng==='number') recenterTo(e.data.lat,e.data.lng);
      else requestMyLocation();
    }
  });

  window.parent.postMessage({type:'mapReady'},'*');

  // ── Drag / Pan ──────────────────────────────────────────────────────────────
  var drag={active:false,startX:0,startY:0,camX0:0,camY0:0};

  function onDragStart(cx,cy){
    drag.active=true; drag.startX=cx; drag.startY=cy;
    drag.camX0=camX; drag.camY0=camY;
    mapEl.classList.add('dragging');
  }
  function onDragMove(cx,cy){
    if(!drag.active) return;
    camX=drag.camX0-(cx-drag.startX);
    camY=drag.camY0-(cy-drag.startY);
    render();
  }
  function onDragEnd(){drag.active=false;mapEl.classList.remove('dragging');}

  mapEl.addEventListener('mousedown',function(e){
    if(e.target!==mapEl&&e.target!==tilesEl&&!e.target.classList.contains('tile')) return;
    e.preventDefault(); onDragStart(e.clientX,e.clientY);
  });
  document.addEventListener('mousemove',function(e){if(drag.active) onDragMove(e.clientX,e.clientY);});
  document.addEventListener('mouseup',onDragEnd);

  var touch={pinchDist:null,pinchZoom:0};
  mapEl.addEventListener('touchstart',function(e){
    if(e.touches.length===1){
      var t=e.touches[0]; onDragStart(t.clientX,t.clientY); touch.pinchDist=null;
    } else if(e.touches.length===2){
      drag.active=false;
      var t0=e.touches[0],t1=e.touches[1];
      var dx=t1.clientX-t0.clientX,dy=t1.clientY-t0.clientY;
      touch.pinchDist=Math.sqrt(dx*dx+dy*dy); touch.pinchZoom=currentZoom;
    }
  },{passive:true});

  mapEl.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(e.touches.length===1&&drag.active){
      onDragMove(e.touches[0].clientX,e.touches[0].clientY);
    } else if(e.touches.length===2&&touch.pinchDist){
      var t0=e.touches[0],t1=e.touches[1];
      var dx=t1.clientX-t0.clientX,dy=t1.clientY-t0.clientY;
      var dist=Math.sqrt(dx*dx+dy*dy);
      var ratio=dist/touch.pinchDist;
      var nz=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,touch.pinchZoom+Math.log2(ratio)));
      var scale=Math.pow(2,nz-currentZoom);
      camX*=scale; camY*=scale; currentZoom=Math.round(nz*2)/2; render();
    }
  },{passive:false});

  mapEl.addEventListener('touchend',function(e){
    if(e.touches.length===0){onDragEnd();touch.pinchDist=null;}
  });

  // ── Scroll to zoom (desktop) ──
  mapEl.addEventListener('wheel',function(e){
    e.preventDefault();
    var delta=e.deltaY>0?-1:1;
    var nz=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,currentZoom+delta));
    if(nz===currentZoom) return;
    var rect=mapEl.getBoundingClientRect();
    var mx=e.clientX-rect.left, my=e.clientY-rect.top;
    var cxT=camX/256, cyT=camY/256;
    // Zoom toward mouse cursor using CAM_CY as the reference centre
    var wldX=cxT+(mx-W/2  )/256;
    var wldY=cyT+(my-CAM_CY)/256;
    var scale=Math.pow(2,nz-currentZoom);
    camX=(wldX-(mx-W/2  )/256/scale)*256*scale;
    camY=(wldY-(my-CAM_CY)/256/scale)*256*scale;
    currentZoom=nz; render();
  },{passive:false});

  window.addEventListener('resize',function(){
    W=mapEl.offsetWidth||W; H=mapEl.offsetHeight||H;
    CAM_CY=Math.round(H*(1-SHEET_FRAC)/2);
    render();
  });

})();
</script>
</body>
</html>`;
}

export default function GoogleMapView({
  userLat = 40.7128,
  userLng = -74.006,
  drivers = [],
  style,
  zoom = 15,
  onMyLocation,
  onMapReady,
}: GoogleMapViewProps) {
  const divRef    = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

  const postCommand = (action: string, extra?: Record<string, number>) => {
    iframeRef.current?.contentWindow?.postMessage({ type: "mapCommand", action, ...extra }, "*");
  };

  useEffect(() => {
    const container = divRef.current;
    if (!container) return;

    const iframe = document.createElement("iframe");
    iframeRef.current = iframe;
    iframe.srcdoc = buildSrcdoc(userLat, userLng, drivers, zoom);
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block";
    iframe.setAttribute("allow", "geolocation");

    container.appendChild(iframe);

    const handleMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      if (e.data?.type === "myLocation" && e.data.lat && e.data.lng) {
        onMyLocation?.(e.data.lat, e.data.lng);
      }
      if (e.data?.type === "mapReady") {
        onMapReadyRef.current?.({
          zoomIn: () => postCommand("zoomIn"),
          zoomOut: () => postCommand("zoomOut"),
          recenter: () => postCommand("recenter"),
        });
      }
    };
    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
      iframeRef.current = null;
      try { if (container.contains(iframe)) container.removeChild(iframe); } catch {}
    };
    // Recreate iframe when location or driver count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLat, userLng, drivers.length, zoom]);

  return (
    <View style={[styles.container, style]}>
      {/* @ts-ignore – native div in RN Web context */}
      <div ref={divRef as any} style={{ width: "100%", height: "100%", overflow: "hidden" }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", height: "100%", overflow: "hidden" },
});
