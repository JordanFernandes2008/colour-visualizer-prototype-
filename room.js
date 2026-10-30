/* A single room's visualizer page: room.html#bathroom or room.html#bathroom/stone */
(function(){
"use strict";
const C=window.Core, {byId,CATS,GROUTS,LAYOUTS}={...window.Core,...window.MateriaData}, {ALLOWED,META,ORDER,reduce,wait,roomOf,mk}=C;
const $=id=>document.getElementById(id);
const canvas=$("gl"), engine=C.makeEngine(canvas);
if(!engine){ $("cover").remove(); $("stageLoad").innerHTML="<p style='padding:20px'>This visualizer needs WebGL2 — please open it in a recent Chrome, Edge, Safari or Firefox.</p>"; return; }
const R=C.rooms(engine);
const S={room:null, assign:{}, per:{}, active:null, cat:null, outlines:{}, hoverId:null, compare:false};
const parse=()=>{const [r,c]=decodeURIComponent(location.hash.slice(1)).split("/"); return {room:ORDER.includes(r)?r:"lounge", cat:c||null}};

/* ---------- rooms ---------- */
function buildRooms(){
  const el=$("rooms");
  ORDER.forEach(id=>{const r=roomOf(id);const b=document.createElement("button");b.className="room";b.dataset.id=id;b.innerHTML=`<img src="${r.src}" alt="">${r.name}`;
    b.onclick=()=>{ if(S.room?.id!==id) history.replaceState(null,"","#"+id); switchRoom(id); };el.appendChild(b)});
}
let roomTok=0;
async function setRoom(id,keepActive){
  const load=$("stageLoad"), tok=++roomTok, r=roomOf(id);
  document.querySelectorAll(".room").forEach(b=>b.setAttribute("aria-selected",b.dataset.id===id));
  $("rpName").textContent=r.name; $("rpLine").textContent=META[id].line; document.title=`${r.name} visualizer — prototype`;
  if(!engine.rooms[id]) load.classList.remove("done");
  await R.prep(id);
  if(tok!==roomTok) return false;
  engine.use(id);
  S.room=r; S.outlines={};
  S.assign=S.per[id]||(S.per[id]=Object.fromEntries(Object.entries(r.start).map(([k,v])=>[k,mk(v)])));
  for(const c of [$("hover"),$("flash"),$("prev")]){c.width=engine.W;c.height=engine.H}
  $("before").src=engine.photoCanvas.toDataURL("image/jpeg",.88);
  fitStage();
  await renderNow(false);
  load.classList.add("done");
  if(!keepActive) selectSurface((engine.surfaces.find(s=>S.assign[s.id])||engine.surfaces[0]).id,false);
  return true;
}
// switching rooms in place: the old room slides away under a soft wipe
async function switchRoom(id,cat){
  const stage=$("stage"); stage.classList.add("leaving");
  await wait(reduce?0:280);
  const ok=await setRoom(id);
  stage.classList.remove("leaving");
  if(ok&&cat) openCat(cat);
}
function fitStage(){ if(!engine.W) return; const w=$("stage").clientWidth, maxH=innerHeight*.78; $("stageInner").style.maxWidth=Math.min(w, maxH*engine.W/engine.H)+"px"; }

let wipeRAF=0;
async function renderNow(animate=true){
  const specs={};
  for(const [sid,a] of Object.entries(S.assign)){ const surf=engine.surfaces.find(s=>s.id===sid); if(surf){ const sp=await C.specFor(engine,a,surf); if(sp) specs[sid]=sp; } }
  const prev=$("prev");
  if(animate&&!reduce){ const pc=prev.getContext("2d"); pc.clearRect(0,0,prev.width,prev.height); pc.drawImage(canvas,0,0); prev.style.setProperty("--p","0%"); prev.style.opacity=1; }
  engine.render(specs);
  if(animate&&!reduce){ cancelAnimationFrame(wipeRAF); const t0=performance.now();
    const step=t=>{const k=Math.min(1,(t-t0)/850), e=1-Math.pow(1-k,3); prev.style.setProperty("--p",(e*120)+"%"); if(k<1) wipeRAF=requestAnimationFrame(step); else prev.style.opacity=0}; wipeRAF=requestAnimationFrame(step);
  } else prev.style.opacity=0;
  updateApplied();
}

/* ---------- surfaces / categories / products ---------- */
const outlineFor=id=>S.outlines[id]||(S.outlines[id]=engine.outline(id));
function selectSurface(id,flash=true){
  const s=engine.surfaces.find(s=>s.id===id); if(!s) return; S.active=id;
  const allowed=ALLOWED[s.type], p=byId[S.assign[id]?.pid];
  S.cat=p&&allowed.includes(p.cat)?p.cat:(allowed.includes(S.cat)?S.cat:allowed[0]);
  renderSurfaces(); renderCats(); renderProducts(); renderAdjust(); updateApplied();
  if(flash){ const f=$("flash"); f.getContext("2d").putImageData(outlineFor(id),0,0); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
}
function openCat(cat){
  const surf=engine.surfaces.find(s=>ALLOWED[s.type].includes(cat)); if(!surf) return;
  selectSurface(surf.id); S.cat=cat; renderCats(); renderProducts();
}
function renderSurfaces(){
  const el=$("surfaces"); el.innerHTML="";
  for(const s of engine.surfaces){ const b=document.createElement("button"); b.className="surf"; b.setAttribute("aria-pressed",s.id===S.active); b.innerHTML=`<i></i>${s.name}`;
    const a=S.assign[s.id]; if(a&&byId[a.pid]) C.swatch(byId[a.pid],80).then(u=>b.querySelector("i").style.backgroundImage=`url(${u})`);
    b.onclick=()=>selectSurface(s.id); el.appendChild(b); }
}
function renderCats(){
  const el=$("cats"); el.innerHTML="";
  const s=engine.surfaces.find(s=>s.id===S.active), allowed=ALLOWED[s.type];
  const shown=CATS.filter(c=>allowed.includes(c.id));         // only what fits this surface
  el.closest(".p-sec").hidden=shown.length<2; $("stepNo").textContent=shown.length<2?"2":"3";
  for(const c of shown){ const b=document.createElement("button"); b.className="cat"; b.setAttribute("aria-selected",c.id===S.cat);
    b.innerHTML=`<i></i>${c.name}`; C.swatch(byId[C.CAT_REP[c.id]],120).then(u=>b.querySelector("i").style.backgroundImage=`url(${u})`);
    b.onclick=()=>{S.cat=c.id;renderCats();renderProducts()}; el.appendChild(b); }
}
function renderProducts(){
  const el=$("products"); el.innerHTML="";
  const s=engine.surfaces.find(s=>s.id===S.active), cur=S.assign[S.active]?.pid;
  C.PRODUCTS.filter(p=>p.cat===S.cat&&p.surfaces.includes(s.type)).forEach((p,i)=>{
    const b=document.createElement("button"); b.className="prod"; b.dataset.pid=p.id; b.style.setProperty("--i",i); b.setAttribute("aria-pressed",p.id===cur);
    const fmt=p.kind===2&&p.tile[0]<3?` · ${Math.round(p.tile[0]*1000)}×${Math.round(p.tile[1]*1000)}`:"";
    b.innerHTML=`<div class="sw"></div><b>${p.name}</b><small>${p.origin}${fmt}</small>`;
    C.swatch(p).then(u=>b.querySelector(".sw").style.backgroundImage=`url(${u})`);
    b.onclick=()=>apply(p.id); el.appendChild(b);
  });
}
async function apply(pid){
  S.assign[S.active]=mk(pid);
  document.querySelectorAll(".prod").forEach(b=>b.setAttribute("aria-pressed",b.dataset.pid===pid));
  renderAdjust(); renderSurfaces(); hint(null); await renderNow(true);
}
function renderAdjust(){
  const a=S.assign[S.active], p=a&&byId[a.pid], el=$("adjust");
  if(!p||p.kind!==2||p.tile[0]>=3){ el.hidden=true; return; } el.hidden=false;
  const sizes=$("sizes"); sizes.innerHTML="";
  for(const sz of (p.sizes||[p.tile])) for(const rot of (sz[0]!==sz[1]?[0,1]:[0])){ const t=rot?[sz[1],sz[0]]:sz;
    const b=document.createElement("button"); b.className="chip"; b.setAttribute("aria-pressed",Math.abs(a.tile[0]-t[0])<1e-6&&Math.abs(a.tile[1]-t[1])<1e-6);
    b.textContent=`${Math.round(t[0]*1000)}×${Math.round(t[1]*1000)}`; b.onclick=()=>{a.tile=t;renderAdjust();renderNow(true)}; sizes.appendChild(b); }
  const lay=$("layouts"); lay.innerHTML="";
  for(const L of LAYOUTS){ const b=document.createElement("button"); b.className="chip"; b.textContent=L.name; b.setAttribute("aria-pressed",(a.layout||0)===L.id); b.onclick=()=>{a.layout=L.id;renderAdjust();renderNow(true)}; lay.appendChild(b); }
  const gc=$("gcols"); gc.innerHTML="";
  for(const c of [p.groutCol,...GROUTS.filter(g=>g!==p.groutCol)].slice(0,5)){ const b=document.createElement("button"); b.className="gcol"; b.style.background=c; b.setAttribute("aria-label","Grout "+c);
    b.setAttribute("aria-pressed",(a.groutCol||p.groutCol)===c); b.onclick=()=>{a.groutCol=c;renderAdjust();renderNow(false)}; gc.appendChild(b); }
  const gw=$("gw"); gw.value=Math.round((a.grout||0)*2000)/2; $("gwOut").textContent=gw.value+" mm";
  gw.oninput=()=>{a.grout=gw.value/1000; $("gwOut").textContent=gw.value+" mm"; renderNow(false)};
  $("bookWrap").style.display=p.cat==="stone"?"flex":"none";
  const bk=$("book"); bk.setAttribute("aria-checked",!!a.book); bk.onclick=e=>{e.preventDefault();a.book=!a.book;renderAdjust();renderNow(true)};
}
function updateApplied(){
  const a=S.assign[S.active], p=a&&byId[a.pid], el=$("applied"), s=engine.surfaces.find(s=>s.id===S.active);
  if(!p||!s){ el.innerHTML=s?`<span>${s.name}</span><b>Original</b>`:""; return; }
  el.innerHTML=`<i></i><span>${s.name}</span><b>${p.name}</b>`; C.swatch(p,80).then(u=>{const i=el.querySelector("i");if(i)i.style.backgroundImage=`url(${u})`});
}

/* ---------- stage interaction ---------- */
const norm=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]};
canvas.addEventListener("pointermove",e=>{ if(S.compare) return; const id=engine.surfaceAt(...norm(e)); if(id===S.hoverId) return; S.hoverId=id;
  const h=$("hover"); if(!id){h.classList.remove("on");return} h.getContext("2d").putImageData(outlineFor(id),0,0); h.classList.add("on"); });
canvas.addEventListener("pointerleave",()=>{S.hoverId=null;$("hover").classList.remove("on")});
canvas.addEventListener("click",e=>{ if(S.compare) return; const id=engine.surfaceAt(...norm(e));
  if(!id) return hint("Tap a wall, the floor or another highlighted surface"); hint(null); selectSurface(id);
  if(innerWidth<1100) document.querySelector(".panel").scrollIntoView({behavior:"smooth",block:"start"}); });
let hintT; function hint(t){const h=$("hint"); clearTimeout(hintT); if(!t){h.classList.add("off");return} $("hintText").textContent=t; h.classList.remove("off"); hintT=setTimeout(()=>h.classList.add("off"),3800)}
function setSplit(v){ $("stageInner").style.setProperty("--split",(Math.min(1,Math.max(0,v))*100)+"%") }
$("compareBtn").onclick=()=>{ S.compare=!S.compare; $("stage").classList.toggle("comparing",S.compare); $("compareBtn").setAttribute("aria-pressed",S.compare); $("hover").classList.remove("on");
  if(S.compare&&!reduce){const t0=performance.now();const f=t=>{const k=Math.min(1,(t-t0)/1100);setSplit(.5+Math.sin(k*Math.PI*2)*.2*(1-k));if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)} else setSplit(.5) };
const handle=$("handle"); let drag=false;
handle.addEventListener("pointerdown",e=>{drag=true;handle.setPointerCapture(e.pointerId)});
handle.addEventListener("pointermove",e=>{if(!drag)return;const r=$("stageInner").getBoundingClientRect();setSplit((e.clientX-r.left)/r.width)});
handle.addEventListener("pointerup",()=>drag=false);
$("resetBtn").onclick=()=>{ S.assign=S.per[S.room.id]=Object.fromEntries(Object.entries(S.room.start).map(([k,v])=>[k,mk(v)])); selectSurface(S.active,false); renderNow(true) };
const dlReady=window.claude?.use?window.claude.use("downloads").catch(()=>null):Promise.resolve(undefined);
dlReady.then(d=>{if(d===null)$("saveBtn").hidden=true});
$("saveBtn").onclick=()=>canvas.toBlob(async b=>{ const name=`prototype-${S.room.id}.jpg`, dl=await dlReady;
  if(dl){try{await dl.save({filename:name,data:b})}catch(e){if(e?.code!=="declined")hint("Saving isn’t available here")}return}
  if(dl===null) return; const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); },"image/jpeg",.93);

/* ---------- arrival: the portal image settles into the stage ---------- */
async function arrive(id){
  const cover=$("cover"), img=$("coverImg"); let url="";
  try{ const p=JSON.parse(sessionStorage.getItem("portal")||"null"); sessionStorage.removeItem("portal"); if(p&&p.id===id) url=p.url; }catch(e){}
  if(!url){ cover.remove(); return; }
  img.src=url; $("coverName").textContent=roomOf(id).name; cover.classList.add("show");
  return async()=>{                       // called once the real stage is rendered
    await wait(150);
    const s=$("stageInner").getBoundingClientRect();
    cover.classList.add("fly");
    Object.assign(cover.style,{left:s.left+"px",top:s.top+"px",width:s.width+"px",height:s.height+"px"});
    await wait(reduce?0:950); cover.classList.add("done"); await wait(500); cover.remove();
  };
}

/* ---------- boot ---------- */
addEventListener("resize",fitStage);
addEventListener("hashchange",()=>{const h=parse(); if(h.room!==S.room?.id) switchRoom(h.room,h.cat); else if(h.cat) openCat(h.cat)});
(async()=>{
  const h=parse();
  C.buildNav((id,cat)=>{ history.replaceState(null,"","#"+id+(cat?"/"+cat:"")); scrollTo({top:0,behavior:"smooth"}); switchRoom(id,cat); });
  buildRooms();
  const land=await arrive(h.room);
  await setRoom(h.room);
  if(h.cat) openCat(h.cat);
  document.body.classList.add("ready");
  if(land) land();
  for(const id of ORDER) await R.prep(id);        // the other rooms open instantly afterwards
  engine.use(S.room.id);
})();
window.__room={S,engine,setRoom,switchRoom,apply,selectSurface,renderNow};
})();
