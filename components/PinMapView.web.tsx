/**
 * PinMapView – Web
 *
 * CartoMap tiles in an iframe. Features:
 *  • Drag-to-pan (overlay captures out-of-iframe mouse)
 *  • Pinch-to-zoom + wheel-scroll zoom toward cursor
 *  • Double-tap to zoom in toward touch/click point
 *  • easeInOutCubic flyTo animation (480ms, requestAnimationFrame)
 *  • Drag cancels any in-progress flyTo
 *  • My-Location dot: pulsating rings, directional compass beam, amber on poor GPS
 *  • Compass via DeviceOrientationEvent with iOS permission request
 *  • Heading smoothed via rAF low-pass filter (α=0.12, 60fps)
 */
import { useEffect, useRef } from "react";

export interface PinMapViewProps {
  lat: number;
  lng: number;
  zoom?: number;
  height?: number | string;
  onCenterChange?: (lat: number, lng: number) => void;
  onMyLocation?: (lat: number, lng: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Pass { lat, lng, zoom?, isMyLocation?, t: Date.now() } to fly the camera.
   *  Set isMyLocation:true to also show/update the blue My-Location dot. */
  recenterTo?: { lat: number; lng: number; t: number; zoom?: number; isMyLocation?: boolean } | null;
  /** Change .t to fire a zoom step: delta +1 = in, -1 = out */
  zoomCmd?: { delta: number; t: number } | null;
}

function buildSrcdoc(lat: number, lng: number, zoom: number): string {
  return `<!DOCTYPE html><html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{width:100%;height:100%;overflow:hidden;background:#e8e0d8;touch-action:none}
#map{position:relative;width:100%;height:100%;overflow:hidden;cursor:grab;user-select:none}
#map.drag{cursor:grabbing}
#tiles{position:absolute;top:0;left:0;will-change:transform}
img.t{position:absolute;width:256px;height:256px;display:block;pointer-events:none}

/* ── My-Location marker ─────────────────────────────────────────────────────
   #myLoc is 0×0 at the screen pixel for the user's coordinate.
   All children use absolute offsets from that center point.            ── */
#myLoc{position:absolute;width:0;height:0;pointer-events:none;display:none;z-index:8}

/* Directional beam: CSS border-trick triangle pointing North (up).
   transform-origin at base-center (22px,70px) = dot center.
   Rotates with compass heading. Hidden until first heading arrives.   */
#myLocBeam{position:absolute;width:0;height:0;
  border-left:22px solid transparent;border-right:22px solid transparent;
  border-bottom:72px solid rgba(37,99,235,0.28);
  left:-22px;top:-72px;
  transform-origin:22px 72px;
  will-change:transform;opacity:0;transition:opacity 0.6s ease}

/* Two staggered pulse rings for a continuous ripple effect */
#myLocR1,#myLocR2{position:absolute;width:44px;height:44px;border-radius:50%;
  background:rgba(37,99,235,0.18);left:-22px;top:-22px}
#myLocR1{animation:mlPulse 2.2s ease-out infinite}
#myLocR2{animation:mlPulse 2.2s ease-out 1.1s infinite}

/* Central dot: blue fill, white border — matches Google/Uber style */
#myLocDot{position:absolute;width:16px;height:16px;border-radius:50%;
  background:#1E88FF;border:3px solid #fff;left:-8px;top:-8px;
  box-shadow:0 2px 10px rgba(37,99,235,0.55);z-index:1;
  transition:background 0.4s,box-shadow 0.4s}

@keyframes mlPulse{
  0%  {transform:scale(0.7);opacity:0.85}
  100%{transform:scale(2.8);opacity:0}
}

#locBtn{position:absolute;bottom:16px;right:16px;width:40px;height:40px;
  border-radius:50%;background:#fff;display:flex;align-items:center;
  justify-content:center;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.2);
  z-index:20;border:none}
</style>
</head>
<body>
<div id="map">
  <div id="tiles"></div>
  <div id="myLoc">
    <div id="myLocBeam"></div>
    <div id="myLocR1"></div>
    <div id="myLocR2"></div>
    <div id="myLocDot"></div>
  </div>
</div>
<button id="locBtn">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="4" fill="#1E88FF"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#1E88FF" stroke-width="2" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="8" stroke="#1E88FF" stroke-width="1.5" fill="none"/>
  </svg>
</button>
<script>
(function(){
  var ZOOM=${zoom}, LAT=${lat}, LNG=${lng};
  var TILE=256, SUBS=['a','b','c','d'];

  function l2x(lng,z){return(lng+180)/360*Math.pow(2,z);}
  function l2y(lat,z){var s=Math.sin(lat*Math.PI/180);return(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*Math.pow(2,z);}
  function x2l(x,z){return x/Math.pow(2,z)*360-180;}
  function y2l(y,z){var n=Math.PI-2*Math.PI*y/Math.pow(2,z);return 180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));}

  var mapEl  =document.getElementById('map');
  var tilesEl=document.getElementById('tiles');
  var myLoc  =document.getElementById('myLoc');
  var myBeam =document.getElementById('myLocBeam');
  var myDot  =document.getElementById('myLocDot');
  var myR1   =document.getElementById('myLocR1');
  var myR2   =document.getElementById('myLocR2');
  var cx=l2x(LNG,ZOOM), cy=l2y(LAT,ZOOM);
  var uLat=null, uLng=null;
  var _myX=0, _myY=0; /* last rendered dot screen position — used during drag */

  function clamp(){
    var maxT=Math.pow(2,ZOOM);
    cx=((cx%maxT)+maxT)%maxT; cy=Math.max(0,Math.min(maxT-0.001,cy));
  }
  function postCenter(){
    window.parent.postMessage({type:'centerChanged',lat:y2l(cy,ZOOM),lng:x2l(cx,ZOOM)},'*');
  }

  function render(){
    var W=mapEl.offsetWidth||window.innerWidth;
    var H=mapEl.offsetHeight||window.innerHeight;
    var maxT=Math.pow(2,ZOOM);
    var cols=Math.ceil(W/TILE)+4, rows=Math.ceil(H/TILE)+4;
    var sx=Math.floor(cx)-Math.floor(cols/2), sy=Math.floor(cy)-Math.floor(rows/2);
    var offX=Math.round(W/2-(cx-sx)*TILE), offY=Math.round(H/2-(cy-sy)*TILE);
    tilesEl.innerHTML='';
    tilesEl.style.transform='translate(0,0)';
    tilesEl.style.left=offX+'px'; tilesEl.style.top=offY+'px';
    for(var r=0;r<rows;r++){for(var c=0;c<cols;c++){
      var tX=((sx+c)%maxT+maxT)%maxT, tY=((sy+r)%maxT+maxT)%maxT;
      if(tY<0||tY>=maxT)continue;
      var img=document.createElement('img');
      img.className='t';
      img.src='https://'+SUBS[(tX+tY)%4]+'.basemaps.cartocdn.com/rastertiles/voyager/'+ZOOM+'/'+tX+'/'+tY+'.png';
      img.style.left=(c*TILE)+'px'; img.style.top=(r*TILE)+'px';
      img.loading='lazy'; img.draggable=false;
      tilesEl.appendChild(img);
    }}
    /* Re-position the My-Location marker at its real-world coordinate */
    if(uLat!==null){
      var ux=l2x(uLng,ZOOM), uy=l2y(uLat,ZOOM);
      _myX=Math.round(W/2+(ux-cx)*TILE);
      _myY=Math.round(H/2+(uy-cy)*TILE);
      myLoc.style.left=_myX+'px';
      myLoc.style.top =_myY+'px';
      myLoc.style.display='block';
    }
  }
  render();

  /* ── easeInOutCubic flyTo — rAF, 480ms, fires centerChanged only at end ── */
  var _flyId=null;
  function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function flyTo(tLat,tLng,tZoom){
    if(_flyId!=null){cancelAnimationFrame(_flyId);_flyId=null;}
    var fLat=y2l(cy,ZOOM),fLng=x2l(cx,ZOOM),fZ=ZOOM;
    var tZ=(tZoom!=null)?Math.max(3,Math.min(18,Math.round(tZoom))):ZOOM;
    var t0=null;
    function frame(ts){
      if(!t0)t0=ts;
      var p=Math.min(1,(ts-t0)/480),e=ease(p);
      var nz=Math.round(fZ+(tZ-fZ)*e);
      if(nz!==ZOOM)ZOOM=nz;
      cx=l2x(fLng+(tLng-fLng)*e,ZOOM);
      cy=l2y(fLat+(tLat-fLat)*e,ZOOM);
      clamp();render();
      if(p<1){_flyId=requestAnimationFrame(frame);}
      else{_flyId=null;postCenter();window.parent.postMessage({type:'dragEnd'},'*');}
    }
    _flyId=requestAnimationFrame(frame);
  }

  /* ── Drag (cancels flyTo on start) ── */
  var dragging=false, sx0=0, sy0=0, dx=0, dy=0;
  function dragStart(px,py){
    if(_flyId!=null){cancelAnimationFrame(_flyId);_flyId=null;}
    dragging=true; sx0=px; sy0=py; dx=0; dy=0;
    mapEl.classList.add('drag');
    window.parent.postMessage({type:'dragStart'},'*');
  }
  function dragMove(px,py){
    if(!dragging)return;
    dx=px-sx0; dy=py-sy0;
    tilesEl.style.transform='translate('+dx+'px,'+dy+'px)';
    /* Keep the dot glued to its coordinate while tiles slide */
    if(uLat!==null){myLoc.style.left=(_myX+dx)+'px';myLoc.style.top=(_myY+dy)+'px';}
  }
  function dragEnd(){
    if(!dragging)return;
    dragging=false; mapEl.classList.remove('drag');
    cx-=dx/TILE; cy-=dy/TILE;
    clamp(); dx=0; dy=0; render();
    postCenter();
    window.parent.postMessage({type:'dragEnd'},'*');
  }

  /* ── Double-tap to zoom in toward tap point ── */
  var _lastTap=0,_lastTX=0,_lastTY=0;
  function checkDoubleTap(x,y){
    var now=Date.now();
    if(now-_lastTap<300&&Math.abs(x-_lastTX)<40&&Math.abs(y-_lastTY)<40){
      _lastTap=0;
      var W=mapEl.offsetWidth||window.innerWidth,H=mapEl.offsetHeight||window.innerHeight;
      flyTo(y2l(cy+(y-H/2)/TILE,ZOOM),x2l(cx+(x-W/2)/TILE,ZOOM),ZOOM+1);
      return true;
    }
    _lastTap=now;_lastTX=x;_lastTY=y;
    return false;
  }

  /* ── Pinch-to-zoom — preserves mid-point lat/lng ── */
  var _p0=0,_pz0=ZOOM,_pinching=false;
  function pinchStart(e){
    _pinching=true;dragging=false;mapEl.classList.remove('drag');
    var t0=e.touches[0],t1=e.touches[1];
    var ddx=t0.clientX-t1.clientX,ddy=t0.clientY-t1.clientY;
    _p0=Math.sqrt(ddx*ddx+ddy*ddy)||1;_pz0=ZOOM;
  }
  function pinchMove(e){
    var t0=e.touches[0],t1=e.touches[1];
    var ddx=t0.clientX-t1.clientX,ddy=t0.clientY-t1.clientY;
    var dist=Math.sqrt(ddx*ddx+ddy*ddy)||1;
    var mx=(t0.clientX+t1.clientX)/2,my=(t0.clientY+t1.clientY)/2;
    var nz=Math.max(3,Math.min(18,Math.round(_pz0+Math.log2(dist/_p0))));
    if(nz!==ZOOM){
      var W=mapEl.offsetWidth||window.innerWidth,H=mapEl.offsetHeight||window.innerHeight;
      var mlat=y2l(cy+(my-H/2)/TILE,ZOOM),mlng=x2l(cx+(mx-W/2)/TILE,ZOOM);
      ZOOM=nz;cx=l2x(mlng,ZOOM)-(mx-W/2)/TILE;cy=l2y(mlat,ZOOM)-(my-H/2)/TILE;
      clamp();render();
    }
  }

  /* ── Touch events ── */
  mapEl.addEventListener('touchstart',function(e){
    if(e.touches.length===1){
      if(checkDoubleTap(e.touches[0].clientX,e.touches[0].clientY))return;
      if(!_pinching)dragStart(e.touches[0].clientX,e.touches[0].clientY);
    } else if(e.touches.length===2){pinchStart(e);}
  },{passive:true});
  mapEl.addEventListener('touchmove',function(e){
    if(e.touches.length===1){if(!_pinching){e.preventDefault();dragMove(e.touches[0].clientX,e.touches[0].clientY);}}
    else if(e.touches.length===2){e.preventDefault();pinchMove(e);}
  },{passive:false});
  mapEl.addEventListener('touchend',function(){
    if(_pinching){_pinching=false;postCenter();window.parent.postMessage({type:'dragEnd'},'*');}
    else{dragEnd();}
  },{passive:true});

  /* ── Mouse (desktop) ── */
  mapEl.addEventListener('mousedown',function(e){
    if(e.target.closest&&e.target.closest('button'))return;
    e.preventDefault();
    if(checkDoubleTap(e.clientX,e.clientY))return;
    dragStart(e.clientX,e.clientY);
  });
  window.addEventListener('mousemove',function(e){dragMove(e.clientX,e.clientY);});
  window.addEventListener('mouseup',function(){dragEnd();});

  /* ── Wheel-scroll zoom toward cursor ── */
  mapEl.addEventListener('wheel',function(e){
    e.preventDefault();
    var W=mapEl.offsetWidth||window.innerWidth,H=mapEl.offsetHeight||window.innerHeight;
    var nz=Math.max(3,Math.min(18,ZOOM+(e.deltaY<0?1:-1)));
    if(nz===ZOOM)return;
    var mlat=y2l(cy+(e.clientY-H/2)/TILE,ZOOM),mlng=x2l(cx+(e.clientX-W/2)/TILE,ZOOM);
    ZOOM=nz;cx=l2x(mlng,ZOOM)-(e.clientX-W/2)/TILE;cy=l2y(mlat,ZOOM)-(e.clientY-H/2)/TILE;
    clamp();render();postCenter();
  },{passive:false});

  /* ── Zoom buttons ── */
  function zoomBy(delta){
    var lat=y2l(cy,ZOOM),lng=x2l(cx,ZOOM);
    ZOOM=Math.max(3,Math.min(18,ZOOM+delta));
    cx=l2x(lng,ZOOM);cy=l2y(lat,ZOOM);
    clamp();render();postCenter();
  }
  window._mapZoomBy=function(delta){zoomBy(delta);};

  /* ══ My-Location: heading + accuracy APIs ════════════════════════════════

     _rawH       — latest raw compass heading from sensor (degrees, 0=North)
     _sh         — smoothed heading, updated each rAF frame
     LP alpha=0.12 at 60fps gives ~200ms settling time — responsive but jitter-free.

     Beam element: CSS border-trick triangle, tip up (North), base at dot center.
     transform-origin:22px 72px keeps pivot at dot center through any rotation.  ── */

  var _rawH=null,_sh=0,_hasH=false,_hRafId=null;

  function tickH(){
    if(_rawH===null){_hRafId=null;return;}
    if(!_hasH){_sh=_rawH;_hasH=true;}
    var d=_rawH-_sh;
    while(d>180)d-=360; while(d<-180)d+=360;
    _sh+=0.12*d;
    if(_sh<0)_sh+=360; if(_sh>=360)_sh-=360;
    myBeam.style.transform='rotate('+_sh.toFixed(1)+'deg)';
    _hRafId=(Math.abs(d)>0.05)?requestAnimationFrame(tickH):null;
  }

  window._setHeading=function(deg){
    if(!_hasH)myBeam.style.opacity='1'; /* reveal beam on first heading */
    _rawH=deg;
    if(!_hRafId)_hRafId=requestAnimationFrame(tickH);
  };

  /* Accuracy indicator: amber dot + rings when GPS fix is weak (>80 m) */
  window._setAccuracy=function(meters){
    var poor=meters>80;
    var c=poor?'#F59E0B':'#1E88FF';
    var rs=poor?'rgba(245,158,11,0.18)':'rgba(37,99,235,0.18)';
    myDot.style.background=c;
    myDot.style.boxShadow='0 2px 10px '+c+'8a';
    myR1.style.background=rs; myR2.style.background=rs;
  };

  /* Set the user's coordinate and update the dot — called by GPS button */
  window._setUserLocation=function(lat,lng,acc){
    uLat=lat; uLng=lng;
    if(acc!=null)window._setAccuracy(acc);
    render();
  };

  /* ── Compass via DeviceOrientationEvent (web) ── */
  function startCompass(){
    window.addEventListener('deviceorientation',function(e){
      /* webkitCompassHeading: iOS Safari — 0=North, clockwise (ideal) */
      var h=e.webkitCompassHeading;
      /* alpha fallback: Android Chrome — 0-360 anti-clockwise from arbitrary north */
      if(h==null&&e.alpha!=null)h=(360-e.alpha)%360;
      if(h!=null)window._setHeading(h);
    },true);
  }
  /* Auto-start on Android/desktop; defer to user-gesture on iOS 13+ */
  if(typeof DeviceOrientationEvent!=='undefined'){
    if(typeof DeviceOrientationEvent.requestPermission!=='function')startCompass();
  }

  /* ── GPS button: fix + compass permission ── */
  document.getElementById('locBtn').onclick=function(e){
    e.stopPropagation();
    /* Request compass on iOS 13+ (requires user-gesture — this click qualifies) */
    if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){
      DeviceOrientationEvent.requestPermission().then(function(s){if(s==='granted')startCompass();}).catch(function(){});
    }
    if(!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(function(pos){
      window._setUserLocation(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy||50);
      flyTo(pos.coords.latitude,pos.coords.longitude,16);
      window.parent.postMessage({type:'myLocation',lat:pos.coords.latitude,lng:pos.coords.longitude},'*');
    },null,{enableHighAccuracy:true,timeout:8000});
  };

  /* ── Messages from parent (overlay drag + programmatic flyTo + user dot) ── */
  window.addEventListener('message',function(e){
    if(!e.data||!e.data.type)return;
    if(e.data.type==='parentMove')dragMove(e.data.x,e.data.y);
    else if(e.data.type==='parentUp')dragEnd();
    else if(e.data.type==='flyTo')flyTo(e.data.lat,e.data.lng,e.data.zoom);
    else if(e.data.type==='setUserLocation')window._setUserLocation(e.data.lat,e.data.lng,e.data.accuracy||50);
    else if(e.data.type==='zoomBy')zoomBy(e.data.delta);
  });

  window.addEventListener('resize',render);
})();
</script>
</body></html>`;
}

export default function PinMapView({
  lat,
  lng,
  zoom = 16,
  onCenterChange,
  onMyLocation,
  onDragStart,
  onDragEnd,
  recenterTo,
  zoomCmd,
}: PinMapViewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  /* Build the HTML exactly once on mount. All subsequent position changes are
     handled by flyTo / setUserLocation postMessages — never by rebuilding srcDoc.
     Rebuilding srcDoc would reload the iframe and wipe all JS state (uLat, uLng,
     heading filter, etc.), causing the dot to vanish whenever the map moves.    */
  const srcDoc = useRef(buildSrcdoc(lat, lng, zoom)).current;

  const cbRef = useRef({ onCenterChange, onMyLocation, onDragStart, onDragEnd });
  cbRef.current = { onCenterChange, onMyLocation, onDragStart, onDragEnd };

  useEffect(() => {
    if (!recenterTo) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    // Show the user's blue dot whenever the recenter is from a GPS fix
    if (recenterTo.isMyLocation) {
      win.postMessage(
        { type: "setUserLocation", lat: recenterTo.lat, lng: recenterTo.lng, accuracy: 50 },
        "*"
      );
    }
    win.postMessage(
      { type: "flyTo", lat: recenterTo.lat, lng: recenterTo.lng, zoom: recenterTo.zoom ?? null },
      "*"
    );
  }, [recenterTo?.t]); // eslint-disable-line react-hooks/exhaustive-deps -- recenterTo?.t is an intentional timestamp discriminator; adding the full object causes flyTo on every render

  useEffect(() => {
    if (!zoomCmd) return;
    iframeRef.current?.contentWindow?.postMessage({ type: "zoomBy", delta: zoomCmd.delta }, "*");
  }, [zoomCmd?.t]); // eslint-disable-line react-hooks/exhaustive-deps -- zoomCmd?.t is an intentional timestamp discriminator; same pattern as recenterTo above

  useEffect(() => {
    const overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed;inset:0;z-index:99999;",
      "display:none;cursor:grabbing;background:transparent;",
    ].join("");
    document.body.appendChild(overlay);

    let dragging = false;

    const onOverlayMove = (e: MouseEvent) => {
      if (!dragging) return;
      iframeRef.current?.contentWindow?.postMessage(
        { type: "parentMove", x: e.clientX, y: e.clientY }, "*"
      );
    };
    const onOverlayUp = () => {
      dragging = false;
      overlay.style.display = "none";
      iframeRef.current?.contentWindow?.postMessage({ type: "parentUp" }, "*");
    };
    overlay.addEventListener("mousemove", onOverlayMove);
    overlay.addEventListener("mouseup",   onOverlayUp);

    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d?.type) return;
      if (d.type === "dragStart") {
        dragging = true;
        overlay.style.display = "block";
        cbRef.current.onDragStart?.();
      } else if (d.type === "dragEnd") {
        dragging = false;
        overlay.style.display = "none";
        cbRef.current.onDragEnd?.();
      } else if (d.type === "centerChanged") {
        cbRef.current.onCenterChange?.(d.lat, d.lng);
      } else if (d.type === "myLocation") {
        cbRef.current.onMyLocation?.(d.lat, d.lng);
        cbRef.current.onCenterChange?.(d.lat, d.lng);
      }
    };
    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
      overlay.removeEventListener("mousemove", onOverlayMove);
      overlay.removeEventListener("mouseup",   onOverlayUp);
      document.body.removeChild(overlay);
    };
  }, []);

  // @ts-ignore — iframe is valid HTML in Expo web
  return (
    <iframe // @ts-ignore
      ref={iframeRef}
      srcDoc={srcDoc}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        width: "100%", height: "100%",
        border: "none",
        display: "block",
      }}
      allow="geolocation; gyroscope; accelerometer"
    />
  );
}
