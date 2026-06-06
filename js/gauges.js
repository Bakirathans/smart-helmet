/* SmartHelmet — Canvas Gauges (light theme) */
(function () {
  const COLORS = {
    temp: { track:'#F3E8D8', fill:'#E8730A', label:'TEMP'     },
    hum:  { track:'#DCEEF9', fill:'#0E6BB5', label:'HUMIDITY' },
    gas:  { track:'#EDE9FE', fill:'#6D28D9', label:'GAS'      },
  };

  window.drawRadial = function(id, ratio, type, valueStr, unit) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height, cx = W/2, cy = H/2;
    const R = Math.min(W,H)/2 - 14;
    const col = COLORS[type];
    const SA = Math.PI*0.75, EA = Math.PI*2.25;
    const FA = SA + (EA-SA)*Math.min(Math.max(ratio,0),1);
    ctx.clearRect(0,0,W,H);
    // Track
    ctx.beginPath(); ctx.arc(cx,cy,R,SA,EA);
    ctx.strokeStyle=col.track; ctx.lineWidth=9; ctx.lineCap='round'; ctx.stroke();
    // Fill
    if (ratio>0.005) {
      ctx.beginPath(); ctx.arc(cx,cy,R,SA,FA);
      ctx.strokeStyle=col.fill; ctx.lineWidth=9; ctx.lineCap='round'; ctx.stroke();
    }
    // Value
    ctx.fillStyle=col.fill; ctx.font="500 1rem 'DM Mono',monospace";
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(valueStr, cx, cy-7);
    // Unit
    ctx.fillStyle='#9AA5B8'; ctx.font="400 0.57rem 'DM Mono',monospace";
    ctx.fillText(unit, cx, cy+10);
    // Label
    ctx.fillStyle='#9AA5B8'; ctx.font="500 0.57rem 'Sora',sans-serif";
    ctx.fillText(col.label, cx, cy+26);
  };

  window.drawScoreRing = function(id, score) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height, cx = W/2, cy = H/2;
    const R = Math.min(W,H)/2 - 13;
    let col = '#16A34A';
    if (score<50) col='#DC2626'; else if (score<75) col='#D97706';
    ctx.clearRect(0,0,W,H);
    // Track
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
    ctx.strokeStyle='#EBEEF4'; ctx.lineWidth=11; ctx.stroke();
    // Fill
    if (score>0) {
      const end = -Math.PI/2 + Math.PI*2*score/100;
      ctx.beginPath(); ctx.arc(cx,cy,R,-Math.PI/2,end);
      ctx.strokeStyle=col; ctx.lineWidth=11; ctx.lineCap='round'; ctx.stroke();
    }
    // Ticks
    for(let i=0;i<24;i++){
      const a=-Math.PI/2+Math.PI*2*i/24;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*(R-6),cy+Math.sin(a)*(R-6));
      ctx.lineTo(cx+Math.cos(a)*(R-12),cy+Math.sin(a)*(R-12));
      ctx.strokeStyle='rgba(0,0,0,.07)'; ctx.lineWidth=1.2; ctx.lineCap='round'; ctx.stroke();
    }
  };

  /* Tiny line chart renderer (no library dependency) */
  window.drawLineChart = function(id, data, color, yMin, yMax, dangerLine, warnLine) {
    const c = document.getElementById(id); if (!c||data.length<2) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio||1;
    // Size canvas to container
    const rect = c.parentElement.getBoundingClientRect();
    c.width  = rect.width  * dpr;
    c.height = rect.height * dpr;
    c.style.width  = rect.width  + 'px';
    c.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const pad = {top:12,right:16,bottom:28,left:42};
    const cw = W-pad.left-pad.right, ch = H-pad.top-pad.bottom;
    ctx.clearRect(0,0,W,H);

    const range = yMax-yMin || 1;
    const toX = i => pad.left + (i/(data.length-1))*cw;
    const toY = v => pad.top + ch - ((v-yMin)/range)*ch;

    // Grid lines
    ctx.strokeStyle='#EBEEF4'; ctx.lineWidth=1;
    for(let i=0;i<=4;i++){
      const y=pad.top+ch*(i/4);
      ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+cw,y); ctx.stroke();
      const lv=yMax-(range*i/4);
      ctx.fillStyle='#9AA5B8'; ctx.font="10px 'DM Mono',monospace"; ctx.textAlign='right';
      ctx.fillText(Math.round(lv), pad.left-5, y+3.5);
    }

    // Danger line
    if (dangerLine!==undefined && dangerLine<=yMax && dangerLine>=yMin) {
      const y=toY(dangerLine);
      ctx.strokeStyle='rgba(220,38,38,0.3)'; ctx.lineWidth=1; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+cw,y); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Warn line
    if (warnLine!==undefined && warnLine<=yMax && warnLine>=yMin) {
      const y=toY(warnLine);
      ctx.strokeStyle='rgba(217,119,6,0.3)'; ctx.lineWidth=1; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+cw,y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Area fill
    const grad = ctx.createLinearGradient(0,pad.top,0,pad.top+ch);
    grad.addColorStop(0, color+'28');
    grad.addColorStop(1, color+'04');
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(data[0]));
    data.forEach((v,i)=>{ if(i>0) ctx.lineTo(toX(i),toY(v)); });
    ctx.lineTo(toX(data.length-1), pad.top+ch);
    ctx.lineTo(toX(0), pad.top+ch);
    ctx.closePath(); ctx.fillStyle=grad; ctx.fill();

    // Line
    ctx.beginPath(); ctx.moveTo(toX(0),toY(data[0]));
    data.forEach((v,i)=>{ if(i>0) ctx.lineTo(toX(i),toY(v)); });
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();

    // Dots at last point
    const lx=toX(data.length-1), ly=toY(data[data.length-1]);
    ctx.beginPath(); ctx.arc(lx,ly,4,0,Math.PI*2);
    ctx.fillStyle='#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx,ly,3,0,Math.PI*2);
    ctx.fillStyle=color; ctx.fill();

    // X-axis ticks (time labels, every ~8 pts)
    ctx.fillStyle='#9AA5B8'; ctx.font="9px 'DM Mono',monospace"; ctx.textAlign='center';
    const step = Math.max(1, Math.floor(data.length/5));
    for(let i=0;i<data.length;i+=step){
      ctx.fillText(i+1, toX(i), pad.top+ch+16);
    }
  };
})();
