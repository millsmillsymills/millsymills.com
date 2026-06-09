/* ============================================================
   unifi-mcp live demo — state model + topology + scripted engine
   ============================================================ */

/* ---------- network state ---------- */
const NET = {
  mode: 'readonly',
  devices: [
    { id:'udm',       kind:'gateway', glyph:'▣', name:'UDM-Pro',     model:'gateway',    ip:'.1',  status:'online' },
    { id:'sw',        kind:'switch',  glyph:'▤', name:'closet-sw',   model:'USW-24-PoE', ip:'.2',  status:'online' },
    { id:'ap-living', kind:'ap',      glyph:'◉', name:'ap-living',   model:'U6-Pro',     ip:'.3',  status:'online' },
    { id:'ap-office', kind:'ap',      glyph:'◉', name:'ap-office',   model:'U6-Lite',    ip:'.4',  status:'online' },
  ],
  clients: [
    { id:'macbook',  glyph:'▭', name:'macbook-pro', mac:'a4:83:e7:11:macbook', ip:'.42', ap:'ap-living', ssid:'millsy-5G',    status:'online' },
    { id:'iphone',   glyph:'▯', name:'iphone-15',   mac:'f0:18:98:22:iphone',  ip:'.55', ap:'ap-living', ssid:'millsy-5G',    status:'online' },
    { id:'tv',       glyph:'□', name:'living-tv',   mac:'8c:de:52:33:livtv',   ip:'.61', ap:'ap-living', ssid:'millsy-iot',   status:'online' },
    { id:'ipad',     glyph:'▢', name:'kids-ipad',   mac:'a4:83:e7:2c:kidipad', ip:'.77', ap:'ap-living', ssid:'millsy-5G',    status:'online' },
    { id:'nest',     glyph:'◍', name:'nest-therm',  mac:'18:b4:30:44:nest',    ip:'.70', ap:'ap-living', ssid:'millsy-iot',   status:'online' },
    { id:'printer',  glyph:'▤', name:'hp-printer',  mac:'3c:2a:f4:55:hpprt',   ip:'.30', ap:'ap-office', ssid:'millsy-iot',   status:'online' },
    { id:'ringcam',  glyph:'◎', name:'ring-cam',    mac:'54:e0:19:66:ringcm',  ip:'.88', ap:'ap-office', ssid:'millsy-iot',   status:'online' },
    { id:'guest',    glyph:'▯', name:'guest-pixel', mac:'da:a1:19:77:guestp',  ip:'.120',ap:'ap-office', ssid:'millsy-guest', status:'online' },
  ],
  wlans: [
    { id:'5g',    name:'millsy-5G',    security:'wpa3', enabled:true  },
    { id:'iot',   name:'millsy-iot',   security:'wpa2', enabled:true  },
    { id:'guest', name:'millsy-guest', security:'open', enabled:false },
  ],
};

/* layout coordinates in % of stage — biased left so the docked console (right) never occludes nodes */
const POS = {
  internet:[33,7], udm:[33,26], sw:[33,45],
  'ap-living':[16,64], 'ap-office':[48,64],
  macbook:[5,82], iphone:[16,82], tv:[27,82], ipad:[10,93], nest:[21,93],
  printer:[42,82], ringcam:[54,82], guest:[48,93],
};
/* portrait-phone layout — full width, no right-dock bias (console is a bottom sheet here);
   max y capped at 86 so the collapsed sheet's header peek never covers a node */
const POS_MOBILE = {
  internet:[50,6], udm:[50,19], sw:[50,32],
  'ap-living':[28,47], 'ap-office':[72,47],
  macbook:[8,65], iphone:[26,65], tv:[44,65], ipad:[14,84], nest:[31,84],
  printer:[60,65], ringcam:[82,65], guest:[71,84],
};
const LINKS = [
  ['internet','udm'],['udm','sw'],['sw','ap-living'],['sw','ap-office'],
  ['ap-living','macbook'],['ap-living','iphone'],['ap-living','tv'],['ap-living','ipad'],['ap-living','nest'],
  ['ap-office','printer'],['ap-office','ringcam'],['ap-office','guest'],
];

/* ---------- DOM refs ---------- */
const stage   = document.getElementById('stage');
const wiresSvg= document.getElementById('wires');
const cbody   = document.getElementById('cbody');
const tickerRow = document.getElementById('trow');
const appEl   = document.getElementById('app');
const nodeEls = {};

/* ---------- pixel-art icons (hand-authored, 16-grid, crispEdges) ---------- */
const CLIENT_ICON={ macbook:'laptop', iphone:'phone', tv:'tv', ipad:'tablet', nest:'thermostat', printer:'printer', ringcam:'camera', guest:'phone' };
function svgIcon(kind){
  if(kind==='ap')     return '<span class="tg">◉</span>';
  if(kind==='switch') return '<span class="tg">▤</span>';
  const I={
    cloud:'<rect x="6" y="4" width="4" height="2"/><rect x="4" y="6" width="8" height="2"/><rect x="2" y="8" width="12" height="3"/><rect x="3" y="11" width="10" height="1"/>',
    gateway:'<rect x="4" y="2" width="1" height="4"/><rect x="11" y="2" width="1" height="4"/><rect x="3" y="2" width="3" height="1"/><rect x="10" y="2" width="3" height="1"/><rect x="2" y="6" width="12" height="6"/><rect x="3" y="9" width="3" height="1" opacity=".4"/><rect x="7" y="9" width="6" height="1" opacity=".4"/>',
    laptop:'<rect x="3" y="3" width="10" height="7"/><rect x="4" y="4" width="8" height="5" fill="#051018"/><rect x="2" y="11" width="12" height="1"/><rect x="1" y="12" width="14" height="1"/>',
    phone:'<rect x="5" y="1" width="6" height="14"/><rect x="6" y="3" width="4" height="9" fill="#051018"/><rect x="7" y="13" width="2" height="1" opacity=".55"/>',
    tablet:'<rect x="3" y="2" width="10" height="12"/><rect x="4" y="3" width="8" height="9" fill="#051018"/><rect x="7" y="12" width="2" height="1" opacity=".55"/>',
    tv:'<rect x="1" y="3" width="14" height="8"/><rect x="2" y="4" width="12" height="6" fill="#051018"/><rect x="7" y="11" width="2" height="2"/><rect x="4" y="13" width="8" height="1"/>',
    printer:'<rect x="4" y="2" width="8" height="3" opacity=".5"/><rect x="2" y="5" width="12" height="5"/><rect x="11" y="6" width="2" height="1" opacity=".4"/><rect x="4" y="10" width="8" height="4" opacity=".55"/>',
    camera:'<rect x="5" y="2" width="6" height="12"/><circle cx="8" cy="6" r="2.4" fill="#051018"/><rect x="7" y="11" width="2" height="1" opacity=".5"/>',
    thermostat:'<rect x="6" y="2" width="4" height="1"/><rect x="4" y="3" width="8" height="1"/><rect x="3" y="4" width="10" height="8"/><rect x="4" y="12" width="8" height="1"/><rect x="6" y="13" width="4" height="1"/><rect x="6" y="6" width="4" height="4" fill="#051018"/>',
  };
  return '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">'+(I[kind]||I.gateway)+'</svg>';
}

/* ---------- build topology ---------- */
function buildTopo(){
  nodeEls.internet = makeNode({ id:'internet', cls:'cloud', icon:'cloud', name:'internet', sub:'wan' });
  NET.devices.forEach(d=>{
    nodeEls[d.id] = makeNode({ id:d.id, cls:'device', icon:d.kind, name:d.name, sub:d.model+' · '+d.ip });
  });
  NET.clients.forEach(c=>{
    nodeEls[c.id] = makeNode({ id:c.id, cls:'client', icon:CLIENT_ICON[c.id]||'phone', name:c.name, sub:c.ip, ssid:c.ssid });
  });
  Object.values(nodeEls).forEach(el=>stage.appendChild(el));
  layoutNodes();
  applyStatus(); drawWires();
}

/* breakpoint-aware node placement — POS_MOBILE on portrait phones, POS otherwise */
const mqMobile = window.matchMedia('(max-width:640px)');
function layoutNodes(){
  const map = mqMobile.matches ? POS_MOBILE : POS;
  Object.entries(nodeEls).forEach(([id,el])=>{
    const [x,y] = map[id] || POS[id];
    el.style.left=x+'%'; el.style.top=y+'%';
  });
}
mqMobile.addEventListener('change', ()=>{
  if(mqMobile.matches){
    // drop any desktop drag-applied inline geometry so the bottom-sheet CSS wins
    const con=document.getElementById('console');
    if(con) con.style.cssText=con.style.cssText.replace(/(left|top|right|bottom)\s*:[^;]*;?/g,'');
  }
  layoutNodes(); drawWires();
});
function makeNode({id,cls,icon,name,sub,ssid}){
  const el=document.createElement('div');
  el.className='node '+cls; el.dataset.id=id;
  el.innerHTML=`<div class="glyph">${svgIcon(icon)}</div><div class="nm">${name}</div>`+
    (sub?`<div class="sub">${sub}</div>`:'')+
    (ssid?`<div class="ssidtag">${ssid.replace('millsy-','')}</div>`:'');
  return el;
}

/* ---------- apply state -> classes ---------- */
function applyStatus(){
  NET.clients.forEach(c=>{
    const el=nodeEls[c.id]; if(!el) return;
    const wlan=NET.wlans.find(w=>w.name===c.ssid);
    el.classList.toggle('blocked', c.status==='blocked');
    el.classList.toggle('offwlan', !!wlan && !wlan.enabled && c.status!=='blocked');
  });
  NET.devices.forEach(d=>{
    const el=nodeEls[d.id]; if(!el) return;
    el.classList.toggle('reboot', d.status==='reboot');
    const sub=el.querySelector('.sub');
    if(sub) sub.textContent = d.status==='reboot' ? 'rebooting…' : (d.model+' · '+d.ip);
  });
  renderSsidBar(); updateCounts();
}

/* ---------- wires ---------- */
function drawWires(){
  const r=stage.getBoundingClientRect();
  wiresSvg.setAttribute('width', r.width); wiresSvg.setAttribute('height', r.height);
  wiresSvg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
  let html='';
  LINKS.forEach(([a,b])=>{
    const ea=nodeEls[a], eb=nodeEls[b]; if(!ea||!eb) return;
    const ra=ea.getBoundingClientRect(), rb=eb.getBoundingClientRect();
    const x1=ra.left+ra.width/2-r.left, y1=ra.top+ra.height/2-r.top;
    const x2=rb.left+rb.width/2-r.left, y2=rb.top+rb.height/2-r.top;
    const child=NET.clients.find(c=>c.id===b) || NET.devices.find(d=>d.id===b);
    let cls='w';
    if(child && child.status==='blocked') cls='w blocked';
    else if(child && child.status==='reboot') cls='w reboot';
    else { const wl=child&&NET.wlans.find(w=>w.name===child.ssid); if(wl&&!wl.enabled) cls='w dim'; }
    const my=(y1+y2)/2;
    html+=`<path class="${cls}" d="M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}"/>`;
  });
  wiresSvg.innerHTML=html;
}
window.addEventListener('resize', ()=>{ clearTimeout(window._wr); window._wr=setTimeout(drawWires,80); });

/* ---------- ssid bar + counts ---------- */
function renderSsidBar(){
  const bar=document.getElementById('ssidbar');
  bar.innerHTML='<div class="ttl">// SSIDS</div>'+NET.wlans.map(w=>
    `<div class="ssidchip ${w.enabled?'':'off'}"><span class="d"></span><span class="nm">${w.name}</span><span class="sec">${w.security}</span></div>`
  ).join('');
}
function updateCounts(){
  const onClients=NET.clients.filter(c=>c.status==='online' && isReachable(c)).length;
  const onSsids=NET.wlans.filter(w=>w.enabled).length;
  document.getElementById('cDev').textContent=NET.devices.length;
  document.getElementById('cCli').textContent=onClients;
  document.getElementById('cSsid').textContent=onSsids;
}
function isReachable(c){ const w=NET.wlans.find(w=>w.name===c.ssid); return !(w&&!w.enabled); }

function flashNode(id,red){ const el=nodeEls[id]; if(!el)return; const cls=red?'flash-red':'flash';
  el.classList.remove('flash','flash-red'); void el.offsetWidth; el.classList.add(cls);
  setTimeout(()=>el.classList.remove(cls),900); }

/* ============================================================
   CHAT — render helpers
   ============================================================ */
function scrollChat(){ cbody.scrollTop=cbody.scrollHeight; }
function addUser(text){ const d=document.createElement('div'); d.className='msg user'; d.textContent=text; cbody.appendChild(d); scrollChat(); }
function addBot(html){ const d=document.createElement('div'); d.className='msg bot'; d.innerHTML=html; cbody.appendChild(d); scrollChat(); return d; }
function showTyping(){ const d=document.createElement('div'); d.className='typing'; d.innerHTML='<i></i><i></i><i></i>'; cbody.appendChild(d); scrollChat(); return d; }
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function botType(html, ms=650){ const t=showTyping(); await delay(ms); t.remove(); return addBot(html); }

/* inline tool card; returns a function to resolve it */
function addToolCard({name,write,args}){
  const d=document.createElement('div'); d.className='toolcard'+(write?' write':'');
  d.innerHTML=`<div class="tline"><span class="tname">▸ ${name}</span>`+
    `<span class="wtag ${write?'write':'read'}">${write?'WRITE':'READ'}</span>`+
    `<span class="res run">running…</span></div>`+
    (args?`<div class="args">${args}</div>`:'');
  cbody.appendChild(d); scrollChat();
  return (state,txt)=>{ const r=d.querySelector('.res'); r.className='res '+state; r.textContent=txt; scrollChat(); };
}

/* confirm card -> promise<bool> */
function askConfirm(text){
  return new Promise(resolve=>{
    const d=document.createElement('div'); d.className='confirm';
    d.innerHTML=`<div class="ct">⚠ DESTRUCTIVE WRITE · CONFIRM</div><div>${text}</div>`+
      `<div class="cbtns"><button class="yes">CONFIRM</button><button class="no">CANCEL</button></div>`;
    cbody.appendChild(d); scrollChat();
    const done=v=>{ d.querySelectorAll('button').forEach(b=>b.disabled=true);
      d.querySelector('.ct').textContent = v?'✓ CONFIRMED':'✕ CANCELLED'; resolve(v); };
    d.querySelector('.yes').onclick=()=>done(true);
    d.querySelector('.no').onclick=()=>done(false);
  });
}

/* ---------- ticker ---------- */
let tickN=0;
function ts(){ const d=new Date(); return d.toTimeString().slice(0,8); }
function logCall(name, state, detail){
  tickN++;
  const cls = state==='ok'?'ok':state==='warn'?'warn':state==='err'?'err':'in';
  const ent=document.createElement('span'); ent.className='ent fresh';
  ent.innerHTML=`<span class="ts">${ts()}</span><span class="in">▸ ${name}</span>`+
    (state?`<span class="${cls}">[${state.toUpperCase()}]</span>`:'')+
    (detail?`<span class="dim">${detail}</span>`:'');
  tickerRow.appendChild(ent);
  while(tickerRow.children.length>7) tickerRow.removeChild(tickerRow.firstChild);
}

/* ============================================================
   SCRIPTED COMMANDS
   ============================================================ */
function clientList(){
  const on=NET.clients.filter(c=>c.status==='online'&&isReachable(c));
  const blocked=NET.clients.filter(c=>c.status==='blocked');
  const off=NET.clients.filter(c=>c.status==='online'&&!isReachable(c));
  let s=`<b>${on.length} clients online</b> — ${on.map(c=>c.name).join(', ')}.`;
  if(blocked.length) s+=`<br><span class="hl">${blocked.length} blocked</span> — ${blocked.map(c=>c.name).join(', ')}.`;
  if(off.length) s+=`<br>${off.length} offline (ssid down) — ${off.map(c=>c.name).join(', ')}.`;
  return s;
}

/* ---------- Protect + Site Manager (separate APIs, not on the topology) ---------- */
const PROTECT={ cameras:[
  { name:'front-door', model:'G4 Doorbell', rec:'always' },
  { name:'driveway',   model:'G5 Bullet',  rec:'always' },
  { name:'garage',     model:'G3 Flex',    rec:'motion' },
]};
const SITES=[
  { name:'mills-net.lan', role:'this site', devices:4, status:'online'  },
  { name:'the-cabin',  role:'remote',    devices:2, status:'online'  },
  { name:'mom-house',  role:'remote',    devices:3, status:'offline' },
];

const COMMANDS = [
  { // ── READ: list devices
    test:/list.*device|hardware|the gear|access points|^devices?$/i,
    async run(){
      await botType('reading the device table…',500);
      const done=addToolCard({name:'unifi_network_list_devices',write:false});
      logCall('unifi_network_list_devices','',''); await delay(650);
      done('ok','[OK] '+NET.devices.length+' · 104ms'); logCall('unifi_network_list_devices','ok',NET.devices.length+' devices');
      await delay(200);
      addBot(NET.devices.map(d=>`▸ <b>${d.name}</b> · ${d.model} · ${d.status==='reboot'?'<span class="hl">rebooting</span>':'<span class="c-phos">online</span>'}`).join('<br>'));
    }},
  { // ── READ: list clients
    test:/(who|whats?|what is|list|show).*(on|online|connect|client|device)|^clients?$|hogging|bandwidth/i,
    async run(){
      await botType('reading the client table…',500);
      const done=addToolCard({name:'unifi_network_list_clients',write:false});
      logCall('unifi_network_list_clients','',''); await delay(700);
      done('ok','[OK] '+NET.clients.length+' · 142ms'); logCall('unifi_network_list_clients','ok',NET.clients.length+' clients');
      await delay(250); addBot(clientList());
    }},
  { // ── READ: health
    test:/health|status|how.?s the net|uptime|latency|slow|everything ok|alerts?/i,
    async run(){
      await botType('pinging the controller…',500);
      const done=addToolCard({name:'unifi_network_get_health',write:false});
      logCall('unifi_network_get_health','',''); await delay(650);
      done('ok','[OK] 96ms'); logCall('unifi_network_get_health','ok','online');
      await delay(200);
      addBot('<b>STATUS: ONLINE</b><br>uptime 12d 04h · wan 412ms · cpu 18% · mem 41%<br>'+NET.devices.length+' devices · '+NET.clients.filter(c=>isReachable(c)&&c.status==='online').length+' clients · 0 alerts.');
    }},
  { // ── READ: list wlans
    test:/wlan|wi-?fi|ssid|wireless network/i,
    async run(){
      await botType('listing wireless networks…',500);
      const done=addToolCard({name:'unifi_network_list_wlans',write:false});
      logCall('unifi_network_list_wlans','',''); await delay(600);
      done('ok','[OK] '+NET.wlans.length+' · 88ms'); logCall('unifi_network_list_wlans','ok',NET.wlans.length+' wlans');
      await delay(200);
      addBot(NET.wlans.map(w=>`▸ <b>${w.name}</b> · ${w.security} · ${w.enabled?'<span class="c-phos">ENABLED</span>':'<span class="hl">DISABLED</span>'}`).join('<br>'));
    }},
  { // ── WRITE/destructive: block ipad
    test:/block.*(ipad|kid)|(ipad|kid).*off|cut.*(ipad|kid)/i, write:true, destructive:true,
    async run(){
      if(!requireRW('block a client')) return;
      const c=NET.clients.find(c=>c.id==='ipad');
      if(c.status==='blocked'){ await botType('<b>kids-ipad</b> is already blocked.',450); return; }
      await botType('found <b>kids-ipad</b> on millsy-5G. this is a destructive write — need a confirm.',650);
      const ok=await askConfirm('block <b>kids-ipad</b> ('+c.mac.slice(0,11)+'…) from the network?');
      logCall('unifi_network_block_client','warn','confirm');
      if(!ok){ await delay(200); addBot('left it alone.'); return; }
      const done=addToolCard({name:'unifi_network_block_client',write:true,args:'mac="'+c.mac.slice(0,14)+'" · destructive:true'});
      logCall('unifi_network_block_client','',''); await delay(800);
      c.status='blocked'; applyStatus(); drawWires(); flashNode('ipad',true);
      done('ok','[OK] 212ms'); logCall('unifi_network_block_client','ok','kids-ipad');
      await delay(250); addBot('done — <b>kids-ipad</b> is blocked. say <span class="hl">"let the ipad back on"</span> to reverse it.');
    }},
  { // ── WRITE: unblock ipad
    test:/(unblock|allow|let).*(ipad|kid|back)|ipad.*back/i, write:true,
    async run(){
      if(!requireRW('unblock a client')) return;
      const c=NET.clients.find(c=>c.id==='ipad');
      if(c.status!=='blocked'){ await botType('<b>kids-ipad</b> isn\'t blocked — nothing to undo.',450); return; }
      await botType('unblocking <b>kids-ipad</b>…',500);
      const done=addToolCard({name:'unifi_network_unblock_client',write:true,args:'mac="'+c.mac.slice(0,14)+'"'});
      logCall('unifi_network_unblock_client','',''); await delay(700);
      c.status='online'; applyStatus(); drawWires(); flashNode('ipad');
      done('ok','[OK] 198ms'); logCall('unifi_network_unblock_client','ok','kids-ipad');
      await delay(200); addBot('back online — <b>kids-ipad</b> reconnected to millsy-5G.');
    }},
  { // ── WRITE/destructive: restart office AP
    test:/(restart|reboot|bounce|power.?cycle).*(office|ap|access point)|office ap/i, write:true, destructive:true,
    async run(){
      if(!requireRW('restart a device')) return;
      const d=NET.devices.find(d=>d.id==='ap-office');
      await botType('<b>ap-office</b> (U6-Lite) — restart drops its clients for ~30s. confirm?',650);
      const ok=await askConfirm('restart <b>ap-office</b>? clients on it will briefly disconnect.');
      logCall('unifi_network_restart_device','warn','confirm');
      if(!ok){ await delay(200); addBot('skipped the restart.'); return; }
      const done=addToolCard({name:'unifi_network_restart_device',write:true,args:'mac="ap-office" · destructive:true'});
      logCall('unifi_network_restart_device','',''); await delay(700);
      d.status='reboot'; applyStatus(); drawWires();
      done('ok','[OK] 318ms'); logCall('unifi_network_restart_device','ok','rebooting');
      await delay(250); const m=addBot('rebooting <b>ap-office</b>… <span class="hl">provisioning</span>');
      await delay(3200);
      d.status='online'; applyStatus(); drawWires(); flashNode('ap-office');
      logCall('unifi_network_get_device','ok','ap-office up');
      m.innerHTML='<b>ap-office</b> is back up and provisioned. clients reconnected.';
      scrollChat();
    }},
  { // ── WRITE: guest off
    test:/(off|disable|kill|stop|down|shut).*(guest)|guest.*(off|down|disable)/i, write:true,
    async run(){
      if(!requireRW('change a wlan')) return;
      const w=NET.wlans.find(w=>w.id==='guest');
      if(!w.enabled){ await botType('millsy-guest is already disabled.',450); return; }
      await botType('disabling <b>millsy-guest</b>…',500);
      const done=addToolCard({name:'unifi_network_update_wlan',write:true,args:'id=guest · {enabled:false}'});
      logCall('unifi_network_update_wlan','',''); await delay(700);
      w.enabled=false; applyStatus(); drawWires(); flashNode('guest');
      done('ok','[OK] 173ms'); logCall('unifi_network_update_wlan','ok','guest off');
      await delay(200); addBot('<b>millsy-guest</b> is down — guest-pixel dropped offline.');
    }},
  { // ── WRITE: guest on
    test:/(on|enable|up|start|bring).*(guest)|guest.*(on|up|enable)/i, write:true,
    async run(){
      if(!requireRW('change a wlan')) return;
      const w=NET.wlans.find(w=>w.id==='guest');
      if(w.enabled){ await botType('millsy-guest is already enabled.',450); return; }
      await botType('enabling <b>millsy-guest</b>…',500);
      const done=addToolCard({name:'unifi_network_update_wlan',write:true,args:'id=guest · {enabled:true}'});
      logCall('unifi_network_update_wlan','',''); await delay(700);
      w.enabled=true; applyStatus(); drawWires(); flashNode('guest');
      done('ok','[OK] 169ms'); logCall('unifi_network_update_wlan','ok','guest on');
      await delay(200); addBot('<b>millsy-guest</b> is live again — guest-pixel reconnected.');
    }},
  { // ── WRITE: kick a client
    test:/kick|disconnect/i, write:true,
    async run(){
      if(!requireRW('kick a client')) return;
      const c=NET.clients.find(c=>c.id==='tv');
      await botType('kicking <b>living-tv</b> off the network…',500);
      const done=addToolCard({name:'unifi_network_kick_client',write:true,args:'mac="'+c.mac.slice(0,14)+'"'});
      logCall('unifi_network_kick_client','',''); await delay(700);
      flashNode('tv'); done('ok','[OK] 156ms'); logCall('unifi_network_kick_client','ok','living-tv');
      await delay(250); addBot('<b>living-tv</b> was bumped off — it\'ll reconnect on its own in a few seconds. (kick isn\'t a block; nothing is barred.)');
    }},
  { // ── WRITE: locate / blink an AP LED
    test:/blink|locate|find the|where is/i, write:true,
    async run(){
      if(!requireRW('locate a device')) return;
      const el=nodeEls['ap-living'];
      await botType('flashing the locate LED on <b>ap-living</b>…',500);
      const done=addToolCard({name:'unifi_network_locate_device',write:true,args:'mac="ap-living"'});
      logCall('unifi_network_locate_device','',''); await delay(650);
      done('ok','[OK] 142ms'); logCall('unifi_network_locate_device','ok','ap-living blinking');
      el.classList.add('locate');
      await delay(200); const m=addBot('<b>ap-living</b>\'s LED is blinking white — walk the room and look for it. (auto-stops in 5s)');
      await delay(5000);
      el.classList.remove('locate'); flashNode('ap-living');
      logCall('unifi_network_unlocate_device','ok','ap-living');
      m.innerHTML='<b>ap-living</b> locate LED stopped.'; scrollChat();
    }},
  { // ── WRITE: authorize a guest
    test:/authoriz|authorise|grant.*guest|guest.*(2h|two hours)/i, write:true,
    async run(){
      if(!requireRW('authorize a guest')) return;
      const c=NET.clients.find(c=>c.id==='guest');
      const w=NET.wlans.find(w=>w.id==='guest');
      await botType('authorizing <b>guest-pixel</b> on the guest portal…',550);
      const done=addToolCard({name:'unifi_network_authorize_guest',write:true,args:'mac="'+c.mac.slice(0,14)+'" · minutes=120'});
      logCall('unifi_network_authorize_guest','',''); await delay(750);
      flashNode('guest'); done('ok','[OK] 188ms'); logCall('unifi_network_authorize_guest','ok','guest-pixel 120m');
      await delay(250);
      let msg='<b>guest-pixel</b> is authorized on millsy-guest for <span class="hl">120 min</span> (2h).';
      if(!w.enabled) msg+=' heads up — millsy-guest is <span class="hl">disabled</span> right now, so enable it before the client can actually connect.';
      addBot(msg);
    }},
  { // ── PROTECT · READ: list cameras
    test:/list.*camera|^cameras?$|protect.*cam|show.*camera/i,
    async run(){
      await botType('querying Protect for cameras…',500);
      const done=addToolCard({name:'unifi_protect_list_cameras',write:false});
      logCall('unifi_protect_list_cameras','',''); await delay(700);
      done('ok','[OK] '+PROTECT.cameras.length+' · 121ms'); logCall('unifi_protect_list_cameras','ok',PROTECT.cameras.length+' cameras');
      await delay(200);
      addBot(PROTECT.cameras.map(c=>`▸ <b>${c.name}</b> · ${c.model} · rec: ${c.rec==='never'?'<span class="hl">privacy</span>':'<span class="c-phos">'+c.rec+'</span>'}`).join('<br>'));
    }},
  { // ── PROTECT · READ: snapshot
    test:/snapshot|snap a|grab.*(image|photo|frame|still)/i,
    async run(){
      await botType('pulling a still from <b>front-door</b>…',500);
      const done=addToolCard({name:'unifi_protect_get_camera_snapshot',write:false,args:'camera="front-door" · hq=true'});
      logCall('unifi_protect_get_camera_snapshot','',''); await delay(850);
      done('ok','[OK] 312ms'); logCall('unifi_protect_get_camera_snapshot','ok','front-door 1080p');
      await delay(200);
      addBot('captured a <b>1920×1080</b> jpeg from <b>front-door</b> — 2.1 MB, '+ts()+'. (binary handed back to the agent; not shown here.)');
    }},
  { // ── PROTECT · WRITE: recording / privacy mode
    test:/privacy|recording mode|stop recording|set.*record/i, write:true,
    async run(){
      if(!requireRW('change a camera')) return;
      const cam=PROTECT.cameras.find(c=>c.name==='driveway');
      if(cam.rec==='never'){ await botType('<b>driveway</b> is already in privacy mode.',450); return; }
      await botType('setting <b>driveway</b> to privacy (never record)…',550);
      const done=addToolCard({name:'unifi_protect_set_recording_mode',write:true,args:'camera="driveway" · mode="never"'});
      logCall('unifi_protect_set_recording_mode','',''); await delay(750);
      cam.rec='never'; done('ok','[OK] 204ms'); logCall('unifi_protect_set_recording_mode','ok','driveway privacy');
      await delay(200); addBot('<b>driveway</b> is now in <span class="hl">privacy mode</span> — it won\'t record until you switch it back.');
    }},
  { // ── SITE · READ: list sites
    test:/list.*site|my sites|other sites|site manager|all sites/i,
    async run(){
      await botType('asking Site Manager for your sites…',500);
      const done=addToolCard({name:'unifi_site_manager_list_sites',write:false});
      logCall('unifi_site_manager_list_sites','',''); await delay(700);
      done('ok','[OK] '+SITES.length+' · 240ms'); logCall('unifi_site_manager_list_sites','ok',SITES.length+' sites');
      await delay(200);
      addBot(SITES.map(s=>`▸ <b>${s.name}</b> · ${s.role} · ${s.devices} devices · ${s.status==='offline'?'<span class="c-red">offline</span>':'<span class="c-phos">online</span>'}`).join('<br>'));
    }},
  { // ── SITE · READ: ISP metrics
    test:/isp|carrier|wan metrics|uplink/i,
    async run(){
      await botType('reading ISP metrics from Site Manager…',500);
      const done=addToolCard({name:'unifi_site_manager_get_isp_metrics',write:false,args:'site="mills-net.lan" · window=24h'});
      logCall('unifi_site_manager_get_isp_metrics','',''); await delay(750);
      done('ok','[OK] 268ms'); logCall('unifi_site_manager_get_isp_metrics','ok','99.98% up');
      await delay(200);
      addBot('<b>mills-net.lan</b> wan — carrier: fiber · <b>412↓ / 41↑ Mbps</b> · 8 ms · 99.98% uptime (24h) · 0 outages.');
    }},
];

function requireRW(action){
  if(NET.mode==='readwrite') return true;
  addBot(`that\'s a write tool — i\'m in <span class="hl">READONLY</span>. flip the switch up top to <span class="c-red">READWRITE</span> and i\'ll ${action}.`);
  const sw=document.getElementById('modeswitch');
  sw.animate([{filter:'none'},{filter:'drop-shadow(0 0 8px #ff3344)'},{filter:'none'}],{duration:900,iterations:2});
  return false;
}

/* ---------- input handling ---------- */
let busy=false;
async function submit(text){
  text=text.trim(); if(!text||busy) return;
  busy=true; setInputEnabled(false);
  if(mqMobile.matches) document.getElementById('console').classList.add('open');
  addUser(text);
  const cmd=COMMANDS.find(c=>c.test.test(text));
  if(cmd){ await cmd.run(); }
  else { await botType('scripted demo — i only know a few moves. try a chip below, e.g. <span class="hl">"block the kids ipad"</span> or <span class="hl">"restart the office ap"</span>.',700); }
  busy=false; setInputEnabled(true);
}
function setInputEnabled(on){ document.querySelector('.cfoot').classList.toggle('busy', !on); }

/* ============================================================
   WIRING
   ============================================================ */
function init(){
  buildTopo();

  // chips (only input — scripted demo, no free text)
  document.querySelectorAll('.chip').forEach(ch=>ch.onclick=()=>submit(ch.dataset.cmd||ch.textContent));
  // collapsible API sections
  document.querySelectorAll('.grouphd').forEach(h=>h.onclick=()=>h.parentElement.classList.toggle('collapsed'));

  // mode switch
  document.getElementById('modeswitch').onclick=()=>{
    NET.mode = NET.mode==='readonly'?'readwrite':'readonly';
    appEl.classList.toggle('rw', NET.mode==='readwrite');
    document.getElementById('mlRo').classList.toggle('act-ro', NET.mode==='readonly');
    document.getElementById('mlRw').classList.toggle('act-rw', NET.mode==='readwrite');
    logCall('mode:'+NET.mode, NET.mode==='readwrite'?'warn':'ok', NET.mode==='readwrite'?'47 write tools exposed':'writes hidden');
  };
  document.getElementById('mlRo').classList.add('act-ro');

  // console window controls
  const con=document.getElementById('console'), relaunch=document.getElementById('relaunch'), chead=document.getElementById('chead');
  document.getElementById('wbMin').onclick=()=>con.classList.toggle('min');
  document.getElementById('wbClose').onclick=()=>{ con.style.display='none'; relaunch.style.display='block'; };
  relaunch.onclick=()=>{ con.style.display='flex'; con.classList.remove('min'); relaunch.style.display='none'; };
  // mobile: the header is a bottom-sheet grabber (tap to expand/collapse); desktop keeps drag
  chead.addEventListener('click', e=>{ if(mqMobile.matches && !e.target.closest('.wb')) con.classList.toggle('open'); });
  makeDraggable(con, chead);

  // seed ticker
  logCall('unifi_network_list_devices','ok','4 devices');
  logCall('unifi_network_list_clients','ok','8 clients');

  // boot greeting
  setTimeout(()=>addBot('booted — i\'m wired to <b>mills-net.lan</b> through unifi-mcp. 4 devices, 8 clients, 3 ssids. ask me to look around or make a change. <span class="c-dim">(start in READONLY; flip the switch for writes.)</span>'), 400);
}

/* draggable console */
function makeDraggable(panel, handle){
  let sx,sy,sl,st,drag=false;
  handle.addEventListener('mousedown',e=>{
    if(mqMobile.matches || e.target.closest('.wb')) return;
    drag=true; handle.classList.add('drag');
    sx=e.clientX; sy=e.clientY;
    const r=panel.getBoundingClientRect();
    panel.style.right='auto'; panel.style.bottom='auto';
    panel.style.left=r.left+'px'; panel.style.top=r.top+'px';
    sl=r.left; st=r.top; e.preventDefault();
  });
  window.addEventListener('mousemove',e=>{ if(!drag)return;
    let nl=sl+e.clientX-sx, nt=st+e.clientY-sy;
    nl=Math.max(6,Math.min(window.innerWidth-panel.offsetWidth-6,nl));
    nt=Math.max(54,Math.min(window.innerHeight-80,nt));
    panel.style.left=nl+'px'; panel.style.top=nt+'px';
  });
  window.addEventListener('mouseup',()=>{ drag=false; handle.classList.remove('drag'); });
}

document.addEventListener('DOMContentLoaded',init);
