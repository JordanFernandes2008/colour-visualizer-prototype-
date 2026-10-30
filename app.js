/* Home page: intro, live hero, store walk (one aisle per room), room portals, how it works. */
(function(){
"use strict";
const C=window.Core, {byId,catName,META,ORDER,reduce,wait,frame,roomOf}=C;
const $=id=>document.getElementById(id);
const canvas=document.createElement("canvas");
const engine=C.makeEngine(canvas);
if(!engine){ document.body.classList.remove("is-loading"); $("intro").classList.add("gone"); return; }
const R=C.rooms(engine);
const looks={}, alts={};          // rendered JPEGs per room

/* ---------- intro: "Hi" → "this is our prototype" → site ----------
   Plays on a fresh open or a refresh only; coming back from a room page goes straight to the site.
   Skip ends it at once, and loading carries on behind the page. */
const intro=$("intro"); let skip=false, lifted=false;
const nav=performance.getEntriesByType("navigation")[0]?.type;
const fromSite=document.referrer&&new URL(document.referrer).origin===location.origin;
const playIntro=nav==="reload"||(nav!=="back_forward"&&!fromSite);
function lift(instant){
  if(lifted) return; lifted=true; releaseQueue&&releaseQueue();
  if(instant){ intro.classList.add("gone"); }
  else { intro.classList.add("lift"); setTimeout(()=>intro.classList.add("gone"),1200); }
  document.body.classList.remove("is-loading"); document.body.classList.add("ready");
}
// keep texture work away from the "Hi" handwriting; released once the room work begins
let releaseQueue; C.hold(new Promise(r=>releaseQueue=r));
const skipNow=e=>{ e&&e.stopPropagation(); skip=true; lift(false); };
$("introSkip").addEventListener("click",skipNow); intro.addEventListener("click",skipNow);
async function introSeq(work){
  const bar=$("introBar"), prog=k=>bar.style.width=Math.round(k*100)+"%";
  if(!playIntro){ releaseQueue(); lift(true); await work(()=>{}); return; }
  const until=async ms=>{const t=performance.now(); while(performance.now()-t<ms&&!skip) await wait(50)};
  await wait(60); intro.classList.add("draw");
  await until(reduce?300:2600);
  if(!skip){ intro.classList.add("hi-out"); await until(reduce?100:650); }
  if(!skip){ intro.classList.add("say"); await until(1300); }
  releaseQueue();
  await work(prog);                 // heavy work starts once the writing is done, so it never stutters
  prog(1); if(!skip) await wait(450);
  lift(false);
}

/* ---------- hero: the lounge keeps changing ---------- */
const HERO=[
  {curtains:"c-sage", rug:"r-atlas"},
  {curtains:"c-midnight", wall:"w-grass", rug:"r-border"},
  {curtains:"c-terra", sofa:"f-rust", floor:"m-statuario", rug:"r-jute"},
  {curtains:"c-ivory", wall:"n-chalk", sofa:"f-emerald", rug:"r-linea"},
  {curtains:"c-oat", wall:"p-clay", chair:"f-navy", rug:"r-medina", floor:"w-herringbone"},
];
const NAMES={wall:"Wall",curtains:"Curtains",rug:"Rug",sofa:"Sofa",floor:"Floor",chair:"Chair"};
const label=v=>Object.entries(v).slice(0,2).map(([k,pid])=>`${NAMES[k]}: ${byId[pid].name}`).join("  ·  ");
const heroFrames=[];
async function buildHero(){
  for(const v of HERO){ heroFrames.push({url:await R.shot("lounge",v,.85),v}); await wait(0); }
  $("heroA").src=heroFrames[0].url; setNow(heroFrames[0].v);
}
function setNow(v){ $("nowText").textContent=label(v); C.swatch(byId[Object.values(v)[0]],80).then(u=>document.querySelector(".now-sw").style.backgroundImage=`url(${u})`); }
let heroOn=true;
new IntersectionObserver(es=>{heroOn=es[0].isIntersecting}).observe($("hero"));
async function runHero(){
  const a=$("heroA"), b=$("heroB"), ring=$("nowProg"); let i=0; const D=reduce?1:1500, HOLD=3600;
  while(true){
    let held=0, last=performance.now();
    while(held<HOLD){
      if(!heroOn||document.hidden){ await wait(300); last=performance.now(); continue; }   // nothing to animate off-screen
      await frame(); const n=performance.now(); held+=n-last; last=n; ring.style.strokeDashoffset=1-held/HOLD; }
    i=(i+1)%heroFrames.length; const f=heroFrames[i];
    b.src=f.url; await b.decode().catch(()=>{});
    $("nowText").style.opacity=0; setTimeout(()=>{setNow(f.v);$("nowText").style.opacity=1},500);
    const t1=performance.now();
    while(true){ const k=Math.min(1,(performance.now()-t1)/D), e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2; b.style.setProperty("--p",(e*120)+"%"); ring.style.strokeDashoffset=e; if(k>=1)break; await frame(); }
    a.src=f.url; await a.decode().catch(()=>{}); b.style.setProperty("--p","0%");
  }
}

/* ---------- store walk: one big aisle per room ---------- */
const fanFor=id=>{ const cats=roomOf(id).cats, out=[];
  for(let k=0;out.length<5&&k<8;k++) for(const c of cats){ const ps=C.PRODUCTS.filter(p=>p.cat===c); const p=ps[k%ps.length]; if(p&&!out.includes(p.id)) out.push(p.id); if(out.length>=5) break; }
  return out; };
const bayImgs={};
function buildStore(){
  const track=$("track");
  ORDER.forEach((id,n)=>{ const r=roomOf(id), m=META[id];
    const el=document.createElement("article"); el.className="bay";
    el.innerHTML=`<button class="bay-img" aria-label="Enter the ${r.name.toLowerCase()} visualizer"><img alt=""><img alt="" class="alt"><span class="sign">Room ${String(n+1).padStart(2,"0")}<b>${r.name}</b></span></button>
      <div class="bay-side"><div class="bay-fan"></div><h3>${r.name} visualizer</h3><p>${m.line}</p>
      <div class="bay-cats">${r.cats.map(c=>`<span>${catName[c]}</span>`).join("")}</div>
      <button class="btn btn-dark mag">Enter the ${r.name.toLowerCase()} <span class="arr">→</span></button></div>`;
    C.fan(el.querySelector(".bay-fan"),fanFor(id));
    const go=()=>C.portal(id,el.querySelector(".bay-img"),looks[id]);
    el.querySelector(".bay-img").onclick=go; el.querySelector(".bay-side .btn").onclick=go;
    bayImgs[id]=el.querySelector(".bay-img");
    track.appendChild(el);
  });
  const end=document.createElement("div"); end.className="bay-end";
  end.innerHTML=`<h3>Five rooms.<br>Sixty-two products.</h3><a class="btn btn-dark" href="#rooms">Pick a room</a>`; track.appendChild(end);
}
function fillBay(id){ const b=bayImgs[id]; if(!b) return; const [i1,i2]=b.querySelectorAll("img"); i1.src=looks[id]; i2.src=alts[id]; b.classList.add("loaded"); }
let geo=null, lastK=-1;
function measureStore(){
  const sec=$("store"), track=$("track");
  geo={top:sec.offsetTop, total:sec.offsetHeight-innerHeight, max:track.scrollWidth-innerWidth,
    bays:[...track.querySelectorAll(".bay")].map(b=>({b,imgs:[...b.querySelectorAll(".bay-img img")],mid:b.offsetLeft+b.offsetWidth/2}))};
  lastK=-1;
}
function storeScroll(){
  const track=$("track");
  if(innerWidth<=760){ track.style.transform=""; return; }
  if(!geo) measureStore();
  const k=Math.min(1,Math.max(0,(scrollY-geo.top)/geo.total));
  if(k===lastK) return; lastK=k;                       // outside the store nothing changes
  const shift=k*geo.max;
  track.style.transform=`translate3d(${-shift}px,0,0)`;
  $("meter").style.width=(k*100)+"%";
  $("aisleNo").textContent=String(Math.min(5,1+Math.floor(k*5))).padStart(2,"0");
  for(const g of geo.bays){ const c=(g.mid-shift-innerWidth/2)/innerWidth;
    for(const im of g.imgs) im.style.transform=`translateX(${c*-6}%) scale(1.06)`;
    g.b.style.transform=`translateY(${Math.abs(c)*30}px) scale(${1-Math.min(.06,Math.abs(c)*.06)})`; }
}
function cursorBubble(){
  const cur=$("cursor"); if(matchMedia("(hover:none)").matches) return;
  addEventListener("pointermove",e=>{cur.style.setProperty("--x",e.clientX+"px");cur.style.setProperty("--y",e.clientY+"px");
    cur.classList.toggle("on",!!e.target.closest(".bay-img,.door"))},{passive:true});
}

/* ---------- pick a room: doors that open ---------- */
function buildDoors(){
  const el=$("doors");
  ORDER.forEach((id,n)=>{ const r=roomOf(id);
    const d=document.createElement("button"); d.className="door"; d.style.setProperty("--n",n);
    d.innerHTML=`<span class="door-img"><img alt=""><img alt="" class="alt"></span><span class="door-shade"></span>
      <span class="door-no">0${n+1}</span><span class="door-v">${r.name}</span>
      <span class="door-copy"><b>${r.name}</b><small>${META[id].line}</small><em>Enter <span>→</span></em></span>`;
    const open=()=>el.querySelectorAll(".door").forEach(o=>o.classList.toggle("open",o===d));
    d.addEventListener("mouseenter",open); d.addEventListener("focus",open);
    d.onclick=()=>{ if(innerWidth<=760&&!d.classList.contains("open")) return open(); C.portal(id,d.querySelector(".door-img"),looks[id]); };
    el.appendChild(d);
  });
  el.querySelector(".door").classList.add("open");
}
function fillDoor(id){ const d=$("doors").children[ORDER.indexOf(id)]; if(!d) return; const [a,b]=d.querySelectorAll("img"); a.src=looks[id]; b.src=alts[id]; d.classList.add("loaded"); }

/* ---------- how it works ---------- */
function buildHow(){
  $("step1").innerHTML=ORDER.slice(0,4).map(id=>`<img src="${roomOf(id).src}" alt="">`).join("");
  C.fan($("step2"),["m-calacatta","r-kilim","t-zellige-sage","w-botanica","c-terra"]);
  const [b,a]=$("step3").querySelectorAll("img"); b.src=roomOf("bedroom").src; a.src=alts.bedroom||looks.bedroom;
}

/* ---------- motion helpers ---------- */
function splitRise(){
  document.querySelectorAll(".rise").forEach(h=>{h.innerHTML=h.textContent.split(" ").map((w,i)=>`<span class="w" style="--i:${i}">${w}</span>`).join(" ")});
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.3});
  document.querySelectorAll(".rise,.doors").forEach(h=>io.observe(h));
}
function magnets(){
  if(matchMedia("(hover:none)").matches||reduce) return;
  document.querySelectorAll(".mag").forEach(b=>{
    b.addEventListener("pointermove",e=>{const r=b.getBoundingClientRect();b.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.18}px,${(e.clientY-r.top-r.height/2)*.3}px)`});
    b.addEventListener("pointerleave",()=>b.style.transform="");
  });
}

/* ---------- boot ---------- */
let ticking=false;
addEventListener("scroll",()=>{if(!ticking){ticking=true;requestAnimationFrame(()=>{storeScroll();ticking=false})}},{passive:true});
addEventListener("resize",()=>{geo=null;storeScroll()});
addEventListener("pageshow",e=>{ if(e.persisted) document.querySelectorAll(".portal").forEach(p=>p.remove()); });
(async()=>{
  C.buildNav(); splitRise(); cursorBubble(); buildStore(); buildDoors(); magnets();
  $("heroA").src=roomOf("lounge").src;      // the plain room shows until the first render is ready
  await introSeq(async prog=>{ await R.prep("lounge"); prog(.4); await buildHero(); prog(.9); });
  runHero(); storeScroll();
  for(const id of ORDER){
    looks[id]=await R.shot(id,META[id].look,.84); alts[id]=await R.shot(id,META[id].alt,.84);
    fillBay(id); fillDoor(id); await new Promise(r=>(window.requestIdleCallback||setTimeout)(r,{timeout:400}));
  }
  buildHow();
})();
window.__home={engine,R,looks};
})();
