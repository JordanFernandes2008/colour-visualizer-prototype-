/* Shared by the home page and the room pages: materials, swatches, room loading, offscreen renders. */
(function(){
"use strict";
const {Engine}=window.Materia, G=window.MateriaGen, {ROOMS,PRODUCTS,CATS,ALLOWED}=window.MateriaData;
const byId=Object.fromEntries(PRODUCTS.map(p=>[p.id,p]));
const catName=Object.fromEntries(CATS.map(c=>[c.id,c.name]));
const hexRGB=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait=t=>new Promise(r=>setTimeout(r,t));
const frame=()=>new Promise(r=>requestAnimationFrame(()=>r()));

/* each room: how it is introduced, and the look it opens with */
const META={
  lounge:  {line:"Curtains, rugs, sofa, chair, walls and floor", look:{curtains:"c-sage",rug:"r-atlas"}, alt:{curtains:"c-midnight",wall:"w-grass",rug:"r-border",sofa:"f-rust"}},
  bathroom:{line:"Floor, walls and bath panel", look:{floor:"m-statuario",back:"t-zellige-sage",panel:"t-zellige-sage"}, alt:{floor:"w-oak",back:"m-nero",panel:"m-nero"}},
  bedroom: {line:"Headboard wall, floor and rug", look:{back:"w-botanica",floor:"w-herringbone"}, alt:{back:"p-forest",floor:"m-calacatta",rug:"r-kilim"}},
  kitchen: {line:"Floor and runner", look:{floor:"m-calacatta",rug:"r-kilim"}, alt:{floor:"w-oak",rug:"r-atlas"}},
  living:  {line:"Feature wall and side walls", look:{back:"w-deco",left:"p-linen",right:"p-linen"}, alt:{back:"p-navy",left:"p-terracotta",right:"p-terracotta"}},
};
const ORDER=["lounge","bathroom","bedroom","kitchen","living"];
for(const r of ROOMS){ r.start=META[r.id].look; r.cats=CATS.map(c=>c.id).filter(c=>r.surfaces.some(s=>ALLOWED[s.type].includes(c))); }
const roomOf=id=>ROOMS.find(r=>r.id===id);
const CAT_HOME={stone:"bathroom",tiles:"kitchen",wood:"bedroom",wallpaper:"living",panels:"bedroom",paint:"living",curtains:"lounge",rugs:"lounge",furniture:"lounge"};
const CAT_REP={stone:"m-calacatta",tiles:"t-zellige-sage",wood:"w-herringbone",wallpaper:"w-deco",panels:"n-oak",paint:"p-terracotta",curtains:"c-midnight",rugs:"r-kilim",furniture:"f-emerald"};

/* heavy texture work runs one piece per idle moment, so it never stacks into a long freeze;
   a page can hold the queue (e.g. while the intro is writing) */
let gate=Promise.resolve(), chain=Promise.resolve();
const idleCb=window.requestIdleCallback?f=>requestIdleCallback(f,{timeout:250}):f=>setTimeout(f,16);
function slot(){ const p=chain.then(()=>gate).then(()=>new Promise(r=>idleCb(()=>r()))); chain=p; return p; }
function hold(p){ gate=p; }

/* materials */
const srcCache=new Map(), imgCache=new Map();
function loadImg(src){ if(!imgCache.has(src)) imgCache.set(src,new Promise((res,rej)=>{const i=new Image();i.decoding="async";i.onload=()=>Promise.race([i.decode?i.decode().catch(()=>{}):null,new Promise(r=>setTimeout(r,600))]).then(()=>res(i));i.onerror=rej;i.src=src})); return imgCache.get(src); }
async function matSource(p,rd){
  const key=p.id+(p.kind===4?"|"+rd.join("x"):"");
  if(srcCache.has(key)) return srcCache.get(key);
  const sp=p.src||{};
  // concurrent callers share one generation
  const job=(async()=>{ let s=null;          // textures a click asks for go straight through; only swatches queue
  if(sp.img) s=await loadImg(sp.img);
  else if(sp.bake) s=G.bake(sp.bake);
  else if(sp.terrazzo) s=G.terrazzo(sp.terrazzo);
  else if(sp.wallpaper) s=G.wallpaper(sp.wallpaper.kind,sp.wallpaper);
  else if(sp.fabric) s=G.fabric(sp.fabric,sp.fabric.length);
  else if(sp.rug) s=G.rug(sp.rug,{w:rd[0],d:rd[1]});
  else if(sp.panel) s=G.panel(sp.panel.wood?await loadImg(sp.panel.wood):null,sp.panel);
  return s; })();
  srcCache.set(key,job); return job;
}
const mk=pid=>{const p=byId[pid];return {pid,tile:p.tile,layout:p.layout,grout:p.grout,groutCol:p.groutCol,book:p.book}};
async function specFor(engine,a,surf){
  const p=byId[a.pid]; if(!p) return null;
  const rd=surf?.def?.rug?[surf.def.rug.w,surf.def.rug.d]:[2.6,1.8];
  const s=p.kind===0?null:await matSource(p,rd);
  return {kind:p.kind, tex:s?engine.material(p.id+(p.kind===4?"|"+rd.join("x"):""),s):null, texM:p.kind===4?rd:(p.texM||[1,1]), tile:a.tile||p.tile||[1,1],
    grout:a.grout??p.grout??0, groutCol:hexRGB(a.groutCol||p.groutCol||"#cccccc"), layout:a.layout??p.layout??0, book:a.book??p.book,
    variation:p.variation, tint:hexRGB(p.tint||"#ffffff"), detail:p.detail, gloss:p.gloss, bevel:p.bevel||.001,
    reflect:surf?.type==="floor"?Math.min(1,.25+p.gloss*1.6):0, detailPow:p.src?.fabric?1.45:1};
}
function shade(hex,k){return "#"+hexRGB(hex).map(v=>Math.round(Math.min(1,v*k)*255).toString(16).padStart(2,"0")).join("")}
const swCache=new Map();
async function swatch(p,px=240){
  const key=p.id+"|"+px; if(swCache.has(key)) return swCache.get(key);
  const job=(async()=>{ await slot();
  const c=document.createElement("canvas"); c.width=c.height=px; const x=c.getContext("2d");
  if(p.kind===0){
    const g=x.createLinearGradient(0,0,px,px); g.addColorStop(0,shade(p.tint,1.05)); g.addColorStop(1,shade(p.tint,.9)); x.fillStyle=g; x.fillRect(0,0,px,px);
  } else if(p.kind===4){
    x.fillStyle="#e9e6e1"; x.fillRect(0,0,px,px);
    const s=await matSource(p,[2.6,1.8]), w=px*.86, h=w*s.height/s.width;
    x.save(); x.translate(px/2,px/2); x.rotate(-.12); x.shadowColor="rgba(0,0,0,.25)"; x.shadowBlur=px*.06; x.shadowOffsetY=px*.02;
    x.drawImage(s,-w/2,-h/2,w,h); x.restore();
  } else {
    const s=await matSource(p,[2.6,1.8]), sw=s.naturalWidth||s.width, sh=s.naturalHeight||s.height;
    if(p.kind===1){ const show=p.src.fabric?.35:p.cat==="wood"?1.2:p.cat==="panels"?.5:.6, f=Math.min(1,show/p.texM[0]); x.drawImage(s,0,0,sw*f,sh*f,0,0,px,px); }
    else {
      const t=p.tile, show=Math.max(.36,Math.min(1.5,Math.max(t[0],t[1])*1.35)), k=px/show, g=Math.max(1,(p.grout||0)*k);
      x.fillStyle=p.groutCol; x.fillRect(0,0,px,px); const tw=t[0]*k, th=t[1]*k; let row=0;
      for(let y=-th*.3;y<px;y+=th,row++) for(let xx=-tw*.37-(p.layout===1&&row%2?tw/2:0);xx<px;xx+=tw){
        const fx=Math.min(1,t[0]/p.texM[0]), fy=Math.min(1,t[1]/p.texM[1]);
        x.drawImage(s,Math.random()*(1-fx)*sw,Math.random()*(1-fy)*sh,fx*sw,fy*sh,xx+g/2,y+g/2,tw-g,th-g);
        if(p.variation>.05){x.fillStyle=`rgba(${Math.random()<.5?"0,0,0":"255,255,255"},${Math.random()*p.variation*.5})`;x.fillRect(xx+g/2,y+g/2,tw-g,th-g)}
      }
    }
    if(p.tint&&p.tint!=="#ffffff"){x.globalCompositeOperation="multiply";x.fillStyle=p.tint;x.fillRect(0,0,px,px);x.globalCompositeOperation="source-over"}
    if(p.src.fabric){const g=x.createLinearGradient(0,0,px,0);[0,.2,.4,.6,.8,1].forEach((s0,i)=>g.addColorStop(s0,i%2?"rgba(255,255,255,.12)":"rgba(0,0,0,.18)"));x.fillStyle=g;x.fillRect(0,0,px,px)}
  }
  const l=x.createLinearGradient(0,0,px,px); l.addColorStop(0,"rgba(255,255,255,.08)"); l.addColorStop(1,"rgba(0,0,0,.08)"); x.fillStyle=l; x.fillRect(0,0,px,px);
  return new Promise(r=>c.toBlob(b=>r(b?URL.createObjectURL(b):c.toDataURL("image/jpeg",.85)),"image/jpeg",.85)); })();
  swCache.set(key,job); return job;
}

/* engine + rooms */
function makeEngine(canvas){ try{ return new Engine(canvas); }catch(e){ return null; } }
function rooms(engine){
  const preps={};
  const prep=id=>preps[id]||(preps[id]=(async()=>{ const r=roomOf(id); await engine.loadRoom(r, await loadImg(r.src)); })());
  // render a look offscreen and hand back a JPEG; restores whichever room was showing
  async function shot(roomId,assign,q=.86,restore){
    await prep(roomId); engine.use(roomId); const specs={};
    for(const [sid,pid] of Object.entries(assign)){ const surf=engine.surfaces.find(s=>s.id===sid); if(surf) specs[sid]=await specFor(engine,mk(pid),surf); }
    engine.render(specs);
    const url=await new Promise(r=>engine.canvas.toBlob(b=>r(b?URL.createObjectURL(b):engine.canvas.toDataURL("image/jpeg",q)),"image/jpeg",q));
    if(restore&&restore!==roomId) engine.use(restore);
    return url;
  }
  return {prep,shot};
}

/* the black-cover page transition between home and a room */
function portal(id,fromEl,imgUrl){
  const r=roomOf(id), b=fromEl.getBoundingClientRect();
  const d=document.createElement("div"); d.className="portal";
  d.innerHTML=`<img alt=""><div class="portal-t"><small>Entering</small><b>${r.name}</b></div>`;
  d.querySelector("img").src=imgUrl||r.src;
  let keep=imgUrl||"";
  if(keep.startsWith("blob:")){ try{ const im=fromEl.querySelector("img"), cv=document.createElement("canvas"), w=Math.min(1600,im.naturalWidth);
    cv.width=w; cv.height=Math.round(im.naturalHeight*w/im.naturalWidth); cv.getContext("2d").drawImage(im,0,0,cv.width,cv.height); keep=cv.toDataURL("image/jpeg",.82); }catch(e){ keep=""; } }
  Object.assign(d.style,{left:b.left+"px",top:b.top+"px",width:b.width+"px",height:b.height+"px"});
  document.body.appendChild(d); void d.offsetWidth; d.classList.add("go");
  try{ sessionStorage.setItem("portal",JSON.stringify({id,url:keep})); }catch(e){}
  setTimeout(()=>{ location.href="room.html#"+id; }, reduce?50:1050);
}

/* nav: Products = room visualizers, Solutions = materials (open the room that suits them) */
function buildNav(onRoom){
  const $=id=>document.getElementById(id);
  const list=$("ddProducts"), mega=$("ddSolutions"), sheet=$("sheetList");
  ORDER.forEach((id,i)=>{ const r=roomOf(id);
    const a=document.createElement("a"); a.href="room.html#"+id; a.style.setProperty("--i",i); a.innerHTML=`<i style="background-image:url(${r.src})"></i>${r.name} visualizer`;
    if(onRoom) a.onclick=e=>{e.preventDefault();onRoom(id)}; list.appendChild(a);
    const s=document.createElement("a"); s.href="room.html#"+id; s.innerHTML=`<i style="background-image:url(${r.src})"></i>${r.name}`;
    if(onRoom) s.onclick=e=>{e.preventDefault();document.body.classList.remove("sheet-open");onRoom(id)}; sheet.appendChild(s);
  });
  ["tiles","wallpaper","furniture","paint","curtains","stone","panels","rugs"].forEach((c,i)=>{
    const a=document.createElement("a"); a.href=`room.html#${CAT_HOME[c]}/${c}`; a.style.setProperty("--i",i); a.innerHTML=`<i></i>${catName[c]}`;
    if(onRoom) a.onclick=e=>{e.preventDefault();onRoom(CAT_HOME[c],c)};
    swatch(byId[CAT_REP[c]],200).then(u=>a.querySelector("i").style.backgroundImage=`url(${u})`); mega.appendChild(a);
  });
  document.querySelectorAll(".dd").forEach(dd=>{
    let t; const open=v=>{clearTimeout(t);document.querySelectorAll(".dd").forEach(o=>{if(o!==dd)o.classList.remove("open")});dd.classList.toggle("open",v);dd.querySelector(".dd-btn").setAttribute("aria-expanded",v)};
    dd.addEventListener("mouseenter",()=>open(true)); dd.addEventListener("mouseleave",()=>{t=setTimeout(()=>open(false),160)});
    dd.querySelector(".dd-btn").addEventListener("click",()=>open(!dd.classList.contains("open")));
  });
  document.addEventListener("click",e=>{if(!e.target.closest(".dd"))document.querySelectorAll(".dd").forEach(o=>o.classList.remove("open"))});
  $("burger").onclick=()=>document.body.classList.toggle("sheet-open");
  // any link in the phone menu closes it (same-page anchors would otherwise land under the open sheet)
  $("sheet").addEventListener("click",e=>{ if(e.target.closest("a")) document.body.classList.remove("sheet-open"); });
  let last=0; addEventListener("scroll",()=>{const y=scrollY; $("nav").classList.toggle("hide",y>last&&y>400&&!document.body.classList.contains("sheet-open")); last=y},{passive:true});
}

/* a hand of material cards that keeps shuffling */
function fan(el,pids){
  el.classList.add("fan"); el.innerHTML="";
  const cards=pids.map((pid,i)=>{const c=document.createElement("i");c.style.setProperty("--k",i);swatch(byId[pid],240).then(u=>c.style.backgroundImage=`url(${u})`);el.appendChild(c);return c});
  const n=cards.length; let order=cards.map((_,i)=>i);
  const place=()=>order.forEach((ci,pos)=>{const c=cards[ci], k=pos-(n-1)/2; c.style.setProperty("--k",k); c.style.zIndex=pos});
  place();
  let seen=false; new IntersectionObserver(es=>{seen=es[0].isIntersecting}).observe(el);
  if(!reduce) setInterval(()=>{ if(!seen||document.hidden||el.matches(":hover")) return; const top=order.pop(); order.unshift(top); cards[top].classList.add("flip"); place(); setTimeout(()=>cards[top].classList.remove("flip"),700); },2600);
}

window.Core={hold,ROOMS,PRODUCTS,CATS,ALLOWED,META,ORDER,CAT_HOME,CAT_REP,byId,catName,hexRGB,reduce,wait,frame,loadImg,mk,specFor,swatch,makeEngine,rooms,portal,buildNav,fan,roomOf};
})();
