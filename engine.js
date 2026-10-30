/* Materia surface engine
   - each surface = image-space mask + homography (image px -> plane metres)
   - WebGL2 renders tiles/stone/wood/wallpaper/paint in true perspective with mipmapped,
     anisotropic sampling, a grout engine, bookmatching and per-tile variation
   - lighting is lifted from the photo: masked blur of the original surface, white-balanced
     against the surface's own colour, so shadows, sun patches and falloff carry over */
(function(){
"use strict";

/* ---------------- maths ---------------- */
// one-point-perspective camera helper (units: image widths; y down)
function Cam(c){ // {cx, cy, f, h}
  const P=(X,Y,Z)=>[c.cx+X*c.f/Z, c.cy-(Y-c.h)*c.f/Z];
  return {
    floor:(x0,x1,z0,z1)=>({img:[P(x0,0,z1),P(x1,0,z1),P(x1,0,z0),P(x0,0,z0)], world:[[x0,z1],[x1,z1],[x1,z0],[x0,z0]].map(([x,z])=>[x,-z])}),
    back:(D,x0,x1,y0,y1)=>({img:[P(x0,y1,D),P(x1,y1,D),P(x1,y0,D),P(x0,y0,D)], world:[[x0,-y1],[x1,-y1],[x1,-y0],[x0,-y0]]}),
    side:(X,z0,z1,y0,y1)=>{ const s=Math.sign(X)||1;
      return {img:[P(X,y1,z0),P(X,y1,z1),P(X,y0,z1),P(X,y0,z0)], world:[[s*z0,-y1],[s*z1,-y1],[s*z1,-y0],[s*z0,-y0]]}; }
  };
}

/* ---------------- room preparation kernel ----------------
   Self-contained so the same code runs in a Web Worker (keeps the page smooth) or, as a fallback, on the page. */
function KERNEL(){
"use strict";
// homography mapping 4 src points -> 4 dst points (returns 3x3 row-major)
function homography(src, dst){
  const A=[], b=[];
  for(let i=0;i<4;i++){
    const [x,y]=src[i],[u,v]=dst[i];
    A.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v);
  }
  // gaussian elimination
  for(let c=0;c<8;c++){
    let p=c; for(let r=c+1;r<8;r++) if(Math.abs(A[r][c])>Math.abs(A[p][c])) p=r;
    [A[c],A[p]]=[A[p],A[c]]; [b[c],b[p]]=[b[p],b[c]];
    for(let r=0;r<8;r++){ if(r===c) continue; const k=A[r][c]/A[c][c];
      for(let k2=c;k2<8;k2++) A[r][k2]-=k*A[c][k2]; b[r]-=k*b[c]; }
  }
  const h=b.map((v,i)=>v/A[i][i]);
  return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
}


/* ---------------- image processing (CPU, once per room) ---------------- */
function boxBlur(src, W, H, r){ // separable running-sum box blur, Float32
  const tmp=new Float32Array(W*H), out=new Float32Array(W*H), d=2*r+1;
  for(let y=0;y<H;y++){ const o=y*W; let s=0;
    for(let x=-r;x<=r;x++) s+=src[o+Math.min(W-1,Math.max(0,x))];
    for(let x=0;x<W;x++){ tmp[o+x]=s/d; s+=src[o+Math.min(W-1,x+r+1)]-src[o+Math.max(0,x-r)]; } }
  for(let x=0;x<W;x++){ let s=0;
    for(let y=-r;y<=r;y++) s+=tmp[Math.min(H-1,Math.max(0,y))*W+x];
    for(let y=0;y<H;y++){ out[y*W+x]=s/d; s+=tmp[Math.min(H-1,y+r+1)*W+x]-tmp[Math.max(0,y-r)*W+x]; } }
  return out;
}
const blur3=(a,W,H,r)=>boxBlur(boxBlur(boxBlur(a,W,H,r),W,H,r),W,H,r);

// guided filter: snaps a rough mask to real edges in the photo
function guided(I, p, W, H, r, eps){
  const N=W*H, Ip=new Float32Array(N), II=new Float32Array(N);
  for(let i=0;i<N;i++){Ip[i]=I[i]*p[i];II[i]=I[i]*I[i];}
  const mI=boxBlur(I,W,H,r), mP=boxBlur(p,W,H,r), mIp=boxBlur(Ip,W,H,r), mII=boxBlur(II,W,H,r);
  const a=new Float32Array(N), b=new Float32Array(N);
  for(let i=0;i<N;i++){const v=mII[i]-mI[i]*mI[i], c=mIp[i]-mI[i]*mP[i]; a[i]=c/(v+eps); b[i]=mP[i]-a[i]*mI[i];}
  const ma=boxBlur(a,W,H,r), mb=boxBlur(b,W,H,r), q=new Float32Array(N);
  for(let i=0;i<N;i++) q[i]=ma[i]*I[i]+mb[i];
  return q;
}

function rasterPolys(W,H,polys){ // normalised polygons -> Uint8 coverage
  const c=typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(W,H):Object.assign(document.createElement("canvas"),{width:W,height:H});
  const x=c.getContext("2d"); x.fillStyle="#fff";
  for(const p of polys){ x.beginPath(); p.forEach(([u,v],k)=>x[k?"lineTo":"moveTo"](u*W,v*H)); x.closePath(); x.fill(); }
  const d=x.getImageData(0,0,W,H).data, m=new Float32Array(W*H);
  for(let i=0;i<m.length;i++) m[i]=d[i*4+3]/255;
  return m;
}

// colour-similarity region growing from seeds, stopped by strong edges (for plain painted walls)
function growMask(S, seeds, clip){
  const {W,H,rgb,edge}=S, mask=new Float32Array(W*H), seen=new Uint8Array(W*H);
  const lum=(i)=>.2126*rgb[i*3]+.7152*rgb[i*3+1]+.0722*rgb[i*3+2];
  for(const [u,v] of seeds){
    const sx=Math.round(u*(W-1)), sy=Math.round(v*(H-1)), s0=sy*W+sx;
    if(seen[s0]||(clip&&clip[s0]<.5)) continue;
    let r=0,g=0,b=0,n=0;
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){const i=(Math.min(H-1,Math.max(0,sy+y)))*W+Math.min(W-1,Math.max(0,sx+x));r+=rgb[i*3];g+=rgb[i*3+1];b+=rgb[i*3+2];n++}
    r/=n;g/=n;b/=n; const sl=.2126*r+.7152*g+.0722*b, ss=r+g+b+1e-3, cr=r/ss, cg=g/ss;
    const st=[s0]; seen[s0]=1;
    while(st.length){
      const i=st.pop(); mask[i]=1; const x=i%W, y=(i-x)/W;
      const R=rgb[i*3],G=rgb[i*3+1],B=rgb[i*3+2];
      for(const j of [x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1]){
        if(j<0||seen[j]) continue; seen[j]=1;
        if(edge[j]||(clip&&clip[j]<.5)) continue;
        const R2=rgb[j*3],G2=rgb[j*3+1],B2=rgb[j*3+2];
        if(Math.abs(R2-R)+Math.abs(G2-G)+Math.abs(B2-B)>.06) continue;
        const L=.2126*R2+.7152*G2+.0722*B2; if(L<sl*.45||L>sl*1.5+.08) continue;
        const s2=R2+G2+B2+1e-3; if((Math.abs(R2/s2-cr)+Math.abs(G2/s2-cg))>.035) continue;
        st.push(j);
      }
    }
  }
  // close speckle holes, then grow 2px so object edges never keep a rim of the old wall
  const c=boxBlur(mask,W,H,2); for(let i=0;i<c.length;i++) mask[i]=c[i]>.35?1:0;
  const d=boxBlur(mask,W,H,2); for(let i=0;i<d.length;i++) mask[i]=d[i]>.02?1:0;
  return mask;
}


function refColour(rgb,m,N,pct=.7){
  const L=[]; for(let i=0;i<N;i+=5) if(m[i]>.5) L.push([.2126*rgb[i*3]+.7152*rgb[i*3+1]+.0722*rgb[i*3+2],i]);
  if(!L.length) return [.8,.8,.8];
  L.sort((a,b)=>a[0]-b[0]);
  const lo=Math.floor(L.length*(pct-.1)), hi=Math.max(lo+1,Math.floor(L.length*(pct+.1)));
  let r=0,g=0,b=0; for(let k=lo;k<hi;k++){const i=L[k][1];r+=rgb[i*3];g+=rgb[i*3+1];b+=rgb[i*3+2];}
  const n=hi-lo; return [r/n,g/n,b/n];
}

function computeRoom({px,W,H,surfaces:defs}){
  const room={surfaces:defs};
    const N=W*H, rgb=new Float32Array(N*3), Lum=new Float32Array(N);
    for(let i=0;i<N;i++){ rgb[i*3]=px[i*4]/255; rgb[i*3+1]=px[i*4+1]/255; rgb[i*3+2]=px[i*4+2]/255;
      Lum[i]=.2126*rgb[i*3]+.7152*rgb[i*3+1]+.0722*rgb[i*3+2]; }
    // edge map for wall growth
    const edge=new Uint8Array(N);
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;
      const gx=Lum[i-W+1]+2*Lum[i+1]+Lum[i+W+1]-Lum[i-W-1]-2*Lum[i-1]-Lum[i+W-1];
      const gy=Lum[i+W-1]+2*Lum[i+W]+Lum[i+W+1]-Lum[i-W-1]-2*Lum[i-W]-Lum[i-W+1];
      edge[i]=Math.hypot(gx,gy)>.13?1:0;}
    const S={W,H,rgb,edge};
    

    
    const surfaces=[];
    const shadeRGB=new Float32Array(N*3), shadeA=new Float32Array(N), owner=new Float32Array(N);
    for(const sd of room.surfaces){
      // 1. coverage
      let m=rasterPolys(W,H,sd.poly);
      if(sd.grow){ const g=growMask(S,sd.grow,m); for(let i=0;i<N;i++) m[i]=Math.min(m[i],g[i]);
        // close the thin rim of old wall left beside objects: take neighbouring pixels that really are wall-coloured
        const wr=refColour(rgb,m,N), wl=.2126*wr[0]+.7152*wr[1]+.0722*wr[2], ws=wr[0]+wr[1]+wr[2]+1e-3;
        for(let pass=0;pass<5;pass++){ const add=[];
          for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x; if(m[i]>.5) continue;
            if(!(m[i-1]>.5||m[i+1]>.5||m[i-W]>.5||m[i+W]>.5)) continue;
            const r=rgb[i*3],g2=rgb[i*3+1],b=rgb[i*3+2],s=r+g2+b+1e-3;
            if(Math.abs(r/s-wr[0]/ws)+Math.abs(g2/s-wr[1]/ws)<.025&&Math.abs(Lum[i]-wl)<.09) add.push(i);}
          for(const i of add) m[i]=1; }
      }
      if(sd.holes){ const h=rasterPolys(W,H,sd.holes); for(let i=0;i<N;i++) m[i]*=1-h[i]; }
      // reference colour = bright-ish median of the surface
      let ref=refColour(rgb,m,N);
      if(sd.keyAt){ // sample the key colour from points known to be the material itself
        let r=0,g=0,b=0,n=0;
        for(const [u,v] of sd.keyAt){ const cx=Math.round(u*(W-1)),cy=Math.round(v*(H-1));
          for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){const i=Math.min(H-1,Math.max(0,cy+y))*W+Math.min(W-1,Math.max(0,cx+x));r+=rgb[i*3];g+=rgb[i*3+1];b+=rgb[i*3+2];n++} }
        ref=[r/n,g/n,b/n];
      }
      if(sd.fine){ // colour-keyed occluders: keep pixels that still look like the surface
        const f=rasterPolys(W,H,sd.fine), rl=.2126*ref[0]+.7152*ref[1]+.0722*ref[2];
        for(let i=0;i<N;i++) if(f[i]>0&&m[i]>0){
          const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2],L=Lum[i], s=r+g+b+1e-3, rs=ref[0]+ref[1]+ref[2]+1e-3;
          const dc=Math.abs(r/s-ref[0]/rs)+Math.abs(g/s-ref[1]/rs);
          const keep=dc<(sd.tol||.05)&&L>rl*.28&&L<rl*(sd.lmax||1.4);
          if(!keep) m[i]=0;
        }
      }
      
      // 2. edge-aware refine
      if(sd.guided!==false){
        const q=guided(Lum,m,W,H,sd.r||3,sd.eps||4e-4);
        for(let i=0;i<N;i++){ const v=q[i]; m[i]=v<=.25?0:v>=.75?1:(v-.25)*2; }
      }
      if(sd.clip!==false){ const hard=rasterPolys(W,H,sd.poly.map(p=>p)); for(let i=0;i<N;i++) m[i]*=Math.min(1,hard[i]*1.0001); }
      // cut-outs win over edge snapping (white objects on white walls must not be painted)
      if(sd.holes){ const h=rasterPolys(W,H,sd.holes); for(let i=0;i<N;i++) m[i]*=1-h[i]; }
      // surfaces in front of this one (curtains over a wall) are removed by their real mask, not a polygon
      for(const id of sd.minus||[]){ const o=surfaces.find(s=>s.id===id); if(o) for(let i=0;i<N;i++) m[i]*=1-o.maskBytes[i]/255; }
      // a placed object (e.g. a new rug) only shows where its host surface is visible
      const host=sd.intersect&&surfaces.find(s=>s.id===sd.intersect);
      if(host) for(let i=0;i<N;i++) m[i]*=host.maskBytes[i]/255;
      
      if(host){ // shares the host's lighting
        const maskBytes=new Uint8Array(N); for(let i=0;i<N;i++) maskBytes[i]=Math.round(m[i]*255);
        const Hm=homography(sd.quad.img.map(([u,v])=>[u*W, v*(sd.quad.units==="w"?W:H)]), sd.quad.world);
        surfaces.push({id:sd.id, maskBytes, ref:host.ref, H:Hm, area:0});
        continue;
      }
      // 3. lighting: masked normalised blur (removes old texture/grout, keeps light & shadow)
      const R=Math.max(4,Math.round(W*(sd.blur||(sd.type==="floor"?.007:.011))));
      const mm=new Float32Array(N); for(let i=0;i<N;i++) mm[i]=m[i]>.5?1:0;
      const mB=blur3(mm,W,H,R);
      const ch=[0,1,2].map(k=>{const a=new Float32Array(N);for(let i=0;i<N;i++)a[i]=rgb[i*3+k]*mm[i];return blur3(a,W,H,R)});
      for(let i=0;i<N;i++) if(m[i]>owner[i]){
        const w=mB[i]>1e-4?1/mB[i]:0; owner[i]=m[i];
        const r=ch[0][i]*w,g=ch[1][i]*w,b=ch[2][i]*w; shadeRGB[i*3]=r;shadeRGB[i*3+1]=g;shadeRGB[i*3+2]=b;
        const bl=.2126*r+.7152*g+.0722*b; shadeA[i]=bl>1e-3?Math.min(1,Lum[i]/bl*.5):.5;
      }
      // reference light = 70th percentile of the blurred surface colour
      const lref=refColour(shadeRGB,mm,N,.7);
      const maskBytes=new Uint8Array(N); for(let i=0;i<N;i++) maskBytes[i]=Math.round(m[i]*255);
      const Hm=homography(sd.quad.img.map(([u,v])=>[u*W, v*(sd.quad.units==="w"?W:H)]), sd.quad.world);
      surfaces.push({id:sd.id, maskBytes, ref:lref, H:Hm, area:mm.reduce((a,b)=>a+b,0)/N});
      
    }
    const shadeBytes=new Uint8Array(N*4);
    for(let i=0;i<N;i++){ for(let k=0;k<3;k++) shadeBytes[i*4+k]=Math.round(Math.min(1,shadeRGB[i*3+k])*255); shadeBytes[i*4+3]=Math.round(shadeA[i]*255); }


  return {shadeBytes,surfaces};
}
return {homography,computeRoom};
}
const KR=KERNEL(), homography=KR.homography;
// one worker for all rooms; jobs are answered in order
let worker=null, jobs=new Map(), jobId=0;
function kernelWorker(){
  if(worker!==null) return worker;
  try{
    if(typeof Worker==="undefined"||typeof OffscreenCanvas==="undefined") throw 0;
    const src="const K=("+KERNEL.toString()+")();onmessage=e=>{const {id,job}=e.data;try{if(job.bmp){const oc=new OffscreenCanvas(job.W,job.H),x=oc.getContext('2d',{willReadFrequently:true});x.drawImage(job.bmp,0,0,job.W,job.H);job.px=x.getImageData(0,0,job.W,job.H).data;job.bmp.close();delete job.bmp}const r=K.computeRoom(job);postMessage({id,r},[r.shadeBytes.buffer,...r.surfaces.map(s=>s.maskBytes.buffer)])}catch(err){postMessage({id,err:String(err&&err.message||err)})}}";
    worker=new Worker(URL.createObjectURL(new Blob([src],{type:"text/javascript"})));
    worker.onmessage=e=>{const j=jobs.get(e.data.id); jobs.delete(e.data.id); if(!j) return; e.data.err?j.reject(new Error(e.data.err)):j.resolve(e.data.r)};
    worker.onerror=()=>{ for(const j of jobs.values()) j.fallback(); jobs.clear(); worker=false; };
  }catch(e){ worker=false; }
  return worker;
}
// job: {W,H,surfaces,canvas} — the page canvas already holds the scaled photo
const pixelsOf=job=>job.canvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,job.W,job.H).data;
async function computeRoom(job){
  const w=kernelWorker(), onPage=()=>KR.computeRoom({W:job.W,H:job.H,surfaces:job.surfaces,px:pixelsOf(job)});
  if(!w||typeof createImageBitmap==="undefined") return onPage();
  const bmp=await Promise.race([createImageBitmap(job.canvas).catch(()=>null),new Promise(r=>setTimeout(()=>r(null),1500))]);
  if(!bmp) return onPage();
  return new Promise((resolve,reject)=>{ const id=++jobId;
    jobs.set(id,{resolve,reject,fallback:()=>{try{resolve(onPage())}catch(e){reject(e)}}});
    w.postMessage({id,job:{W:job.W,H:job.H,surfaces:job.surfaces,bmp}},[bmp]); });
}
/* ---------------- GL ---------------- */
const VS=`#version 300 es
in vec2 aP; out vec2 vUV;
void main(){ vUV=aP*.5+.5; vUV.y=1.-vUV.y; gl_Position=vec4(aP,0.,1.); }`;

const FS_BASE=`#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uPhoto;
void main(){ o=texture(uPhoto,vUV); }`;

const FS_SURF=`#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uPhoto,uMask,uShade,uMat;
uniform vec2 uImg; uniform mat3 uH;
uniform int uKind;            // 0 paint, 1 continuous texture, 2 tiles
uniform vec2 uTexM;           // world size covered by the material texture (m)
uniform vec2 uTile; uniform float uGrout; uniform vec3 uGroutCol; uniform int uLayout;
uniform int uBook; uniform float uVar; uniform vec3 uTint; uniform vec3 uRef;
uniform float uDetail, uGloss, uBevel, uRot, uReflect, uDetailPow; uniform vec2 uOrigin; uniform float uHighlight;

vec3 toLin(vec3 c){return pow(c,vec3(2.2));}
vec3 toSrgb(vec3 c){return pow(max(c,0.),vec3(1./2.2));}
float h12(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 h22(vec2 p){float n=h12(p);return vec2(n,h12(p+n+17.17));}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}

void main(){
  float m=texture(uMask,vUV).r;
  if(m<.002) discard;
  vec3 q=uH*vec3(vUV*uImg,1.);
  vec2 p=q.xy/q.z-uOrigin;
  float cr=cos(uRot), sr=sin(uRot); p=mat2(cr,-sr,sr,cr)*p;

  vec3 alb; float edge=1.; float groutA=0.;
  if(uKind==0){
    alb=toLin(uTint);
  } else if(uKind==1){
    vec2 t=p/uTexM;
    alb=toLin(textureGrad(uMat,t,dFdx(t),dFdy(t)).rgb)*toLin(uTint);
  } else if(uKind==4){ // a rug: one texture placed exactly on its footprint
    vec2 t=p/uTexM;
    vec4 tx=textureGrad(uMat,clamp(t,0.,1.),dFdx(t),dFdy(t));
    vec2 aa=fwidth(t)*1.2;
    float inside=smoothstep(-aa.x,aa.x,t.x)*smoothstep(-aa.x,aa.x,1.-t.x)*smoothstep(-aa.y,aa.y,t.y)*smoothstep(-aa.y,aa.y,1.-t.y);
    m*=inside*tx.a;
    if(m<.002) discard;
    alb=toLin(tx.rgb)*toLin(uTint);
    vec2 e=min(t,1.-t)*uTexM; edge=mix(.72,1.,smoothstep(0.,.025,min(e.x,e.y))); // bound edge sits slightly proud
  } else {
    vec2 sz=uTile, pp=p;
    if(uLayout==2) pp=mat2(.70710678,-.70710678,.70710678,.70710678)*pp;
    if(uLayout==1){ float r=floor(pp.y/sz.y); pp.x+=mod(r,2.)*.5*sz.x; }
    if(uLayout==3){ float c=floor(pp.x/sz.x); pp.y+=mod(c,2.)*.5*sz.y; }
    vec2 cell=floor(pp/sz), loc=pp/sz-cell;
    vec2 de=min(loc,1.-loc)*sz; float e=min(de.x,de.y);
    float aa=max(fwidth(e),1e-5), g=uGrout*.5;
    groutA = uGrout>0. ? 1.-smoothstep(g-aa*.6,g+aa*.6,e) : 0.;
    vec2 seed=cell, tl=loc;
    if(uBook==1){ seed=floor(cell/2.); if(mod(cell.x,2.)>.5) tl.x=1.-tl.x; if(mod(cell.y,2.)>.5) tl.y=1.-tl.y; }
    vec2 frac=sz/uTexM, off=h22(seed+3.1)*max(vec2(0.),1.-frac);
    if(uBook==1) off=h22(seed+3.1)*max(vec2(0.),1.-2.*frac);
    vec2 t=off+tl*frac;
    vec2 gx=dFdx(pp)/uTexM, gy=dFdy(pp)/uTexM;
    alb=toLin(textureGrad(uMat,t,gx,gy).rgb)*toLin(uTint);
    alb*=1.+(h12(seed+.7)-.5)*uVar;
    // subtle eased/bevelled tile edge catches less light
    edge=mix(.80,1.,smoothstep(g,g+uBevel+aa,e));
    alb=mix(alb,toLin(uGroutCol),groutA);
    edge=mix(edge,.92,groutA);
  }

  vec4 sh=texture(uShade,vUV);
  vec3 light=toLin(sh.rgb)/max(toLin(uRef),vec3(1e-3));
  float L=lum(light); light=mix(vec3(L),light,.55);       // keep coloured light, drop old material tint
  if(uDetailPow>1.) light*=pow(max(L,1e-3),(uDetailPow-1.)*1.6);   // fabrics: deepen folds so dark cloth still reads 3D
  float raw=clamp(sh.a*2.,0.,2.);
  float det=mix(1.,pow(raw,uDetailPow),uDetail);
  vec3 col=alb*light*det*edge;
  // keep the room's own reflections (cabinets, windows, sun streaks) on polished surfaces
  col+=uReflect*(1.-groutA)*max(L-1.06,0.)*.55;
  // polished surfaces: lift highlights and add a soft sheen
  // reflections scale with the material's own brightness range so dark polished stone stays deep
  float spec=max(L-1.,0.), ab=lum(alb);
  col+=uGloss*(1.-groutA)*(spec*spec*(.6+.6*ab)+L*.02)*vec3(1.);
  // filmic shoulder so sun patches roll off instead of clipping to flat white
  vec3 k=max(col-.72,0.); col=min(col,.72)+(1.-exp(-k*2.6))*.28/(1.-exp(-.28*2.6))*.98;
  o=vec4(toSrgb(col),m);
}`;

function compile(gl,vs,fs){
  const mk=(t,s)=>{const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));return sh};
  const p=gl.createProgram(); gl.attachShader(p,mk(gl.VERTEX_SHADER,vs)); gl.attachShader(p,mk(gl.FRAGMENT_SHADER,fs));
  gl.bindAttribLocation(p,0,"aP"); gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u={}; const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name]=gl.getUniformLocation(p,a.name);}
  return {p,u};
}

class Engine{
  constructor(canvas){
    this.canvas=canvas;
    const gl=this.gl=canvas.getContext("webgl2",{premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false});
    if(!gl) throw new Error("WebGL2 not available");
    this.aniso=gl.getExtension("EXT_texture_filter_anisotropic");
    this.base=compile(gl,VS,FS_BASE); this.surf=compile(gl,VS,FS_SURF);
    const vb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,vb);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    this.matCache=new Map(); this.rooms={};
  }
  tex(src,{mip=false,repeat=false,fmt}={}){
    const gl=this.gl,t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    if(src.data){ const f=fmt||gl.RGBA;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      gl.texImage2D(gl.TEXTURE_2D,0,f===gl.RED?gl.R8:gl.RGBA8,src.w,src.h,0,f,gl.UNSIGNED_BYTE,src.data);
    } else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,src);
    const wrap=repeat?gl.REPEAT:gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    if(mip){ gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      if(this.aniso) gl.texParameterf(gl.TEXTURE_2D,this.aniso.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(16,gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    } else gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    return t;
  }
  material(key, source){ // source: HTMLImageElement | HTMLCanvasElement
    if(!this.matCache.has(key)) this.matCache.set(key,this.tex(source,{mip:true,repeat:true}));
    return this.matCache.get(key);
  }

  /* prepare a room: masks, lighting, homographies */
  compute(job){ return computeRoom(job); }
  async loadRoom(room, img, maxSide=1500){
    const sc=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    const W=Math.round(img.naturalWidth*sc), H=Math.round(img.naturalHeight*sc);
    const c=document.createElement("canvas"); c.width=W; c.height=H;
    const cx=c.getContext("2d",{willReadFrequently:true}); cx.drawImage(img,0,0,W,H);
    const res=await this.compute({canvas:c,W,H,surfaces:room.surfaces});
    const surfaces=res.surfaces.map((r,i)=>{const sd=room.surfaces[i];return {def:sd,id:sd.id,name:sd.name,type:sd.type,maskBytes:r.maskBytes,ref:r.ref,H:r.H,area:r.area}});
    const shadeBytes=res.shadeBytes, gl=this.gl;
    // GL resources, kept per room so switching back is instant
    const st={id:room.id,W,H,photoCanvas:c,photoTex:this.tex(c),shadeTex:this.tex({data:shadeBytes,w:W,h:H}),surfaces};
    for(const s of surfaces) s.maskTex=this.tex({data:s.maskBytes,w:W,h:H},{fmt:gl.RED});
    this.rooms[room.id]=st;   // callers decide when to switch (background loads must not move the visible room)
    return st;
  }
  use(id){
    const st=this.rooms[id]; if(!st) return false;
    Object.assign(this,{W:st.W,H:st.H,photoTex:st.photoTex,shadeTex:st.shadeTex,surfaces:st.surfaces,photoCanvas:st.photoCanvas,roomId:id});
    if(this.canvas.width!==st.W||this.canvas.height!==st.H){this.canvas.width=st.W;this.canvas.height=st.H;}
    this.gl.viewport(0,0,st.W,st.H);
    return true;
  }

  render(assign){ // assign: {surfaceId: spec}
    const gl=this.gl;
    gl.disable(gl.BLEND);
    gl.useProgram(this.base.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.photoTex); gl.uniform1i(this.base.u.uPhoto,0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    const P=this.surf, u=P.u; gl.useProgram(P.p);
    for(const s of this.surfaces){
      const a=assign[s.id]; if(!a) continue;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,s.maskTex); gl.uniform1i(u.uMask,1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,this.shadeTex); gl.uniform1i(u.uShade,2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D,a.tex||this.photoTex); gl.uniform1i(u.uMat,3);
      gl.uniform2f(u.uImg,this.W,this.H);
      const h=s.H; gl.uniformMatrix3fv(u.uH,false,[h[0],h[3],h[6],h[1],h[4],h[7],h[2],h[5],h[8]]);
      gl.uniform1i(u.uKind,a.kind); gl.uniform2f(u.uTexM,a.texM[0],a.texM[1]);
      gl.uniform2f(u.uTile,a.tile[0],a.tile[1]); gl.uniform1f(u.uGrout,a.grout);
      gl.uniform3fv(u.uGroutCol,a.groutCol); gl.uniform1i(u.uLayout,a.layout); gl.uniform1i(u.uBook,a.book?1:0);
      gl.uniform1f(u.uVar,a.variation); gl.uniform3fv(u.uTint,a.tint); gl.uniform3fv(u.uRef,s.ref);
      gl.uniform1f(u.uDetail,a.detail); gl.uniform1f(u.uGloss,a.gloss); gl.uniform1f(u.uBevel,a.bevel);
      gl.uniform1f(u.uRot,a.rot||0); gl.uniform2f(u.uOrigin,(s.def.origin||[0,0])[0],(s.def.origin||[0,0])[1]);
      if(u.uHighlight) gl.uniform1f(u.uHighlight,0);
      gl.uniform1f(u.uReflect,a.reflect||0); gl.uniform1f(u.uDetailPow,a.detailPow||1);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
  }
  surfaceAt(u,v){ // normalised point -> surface id (highest coverage)
    const x=Math.round(u*(this.W-1)), y=Math.round(v*(this.H-1)), i=y*this.W+x;
    let best=null,bv=.5; for(const s of this.surfaces){ if(s.maskBytes[i]/255>bv){bv=s.maskBytes[i]/255;best=s.id;} }
    return best;
  }
  outline(id){ // RGBA ImageData-ish edge highlight of one surface
    const s=this.surfaces.find(s=>s.id===id); if(!s) return null;
    const {W,H}=this, m=s.maskBytes, out=new Uint8ClampedArray(W*H*4);
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x; if(m[i]<128) continue;
      const e=m[i-1]<128||m[i+1]<128||m[i-W]<128||m[i+W]<128||m[i-2]<128||m[i+2]<128||m[i-2*W]<128||m[i+2*W]<128;
      const p=i*4; out[p]=out[p+1]=out[p+2]=255; out[p+3]=e?255:38;}
    return new ImageData(out,W,H);
  }
}


window.Materia={Engine,Cam,homography};
})();
