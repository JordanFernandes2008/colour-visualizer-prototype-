/* Procedural, seamless material textures baked on the GPU (stone) or canvas (terrazzo, wallpaper). */
(function(){
"use strict";
const SIZE=1024;
let gl, prog, cv;

const FS=`#version 300 es
precision highp float; in vec2 vUV; out vec4 o;
uniform int uType; uniform vec3 uA,uB,uC,uD; uniform float uSeed, uP1, uP2, uP3;
// periodic value noise on a lattice of period 'per'
float hash(vec2 p){p=fract(p*vec2(127.1,311.7)+uSeed);p+=dot(p,p+19.19);return fract(p.x*p.y);}
float vnoise(vec2 x,float per){vec2 i=floor(x),f=fract(x);vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  float a=hash(mod(i,per)),b=hash(mod(i+vec2(1,0),per)),c=hash(mod(i+vec2(0,1),per)),d=hash(mod(i+vec2(1,1),per));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 x,float per,int oct){float s=0.,a=.5;for(int i=0;i<8;i++){if(i>=oct)break;s+=a*vnoise(x,per);x*=2.;per*=2.;a*=.5;}return s;}
float ridge(float v,float w){return pow(1.-clamp(abs(v),0.,1.),w);}
const float PI=3.14159265;
void main(){
  vec2 uv=vUV; vec3 col;
  if(uType==0){ // marble: veins are iso-lines of a domain-warped noise field, stretched along a flow direction
    float per=64.; vec2 p=uv*3.;
    float a=uP1; mat2 R=mat2(cos(a),-sin(a),sin(a),cos(a));
    vec2 q=R*p; q.y*=.38;
    vec2 w=vec2(fbm(q*1.1+3.1,per,5),fbm(q*1.1+7.7,per,5));
    vec2 w2=vec2(fbm(q*2.3+w*1.5+1.3,per,5),fbm(q*2.3+w*1.5+9.1,per,5));
    float n=fbm(q*.8+w*uP2+w2*.35,per,6);
    float r1=1.-abs(2.*n-1.);
    float core=pow(r1,uP3);              // crisp vein
    float halo=pow(r1,uP3*.09);          // soft bleed either side of it
    float n2=fbm(R*p*vec2(1.9,.9)+w2*2.2+5.,per,6);
    float r2=1.-abs(2.*n2-1.);
    float sec=pow(r2,uP3*1.7)*.55;       // thinner secondary network
    float cloud=fbm(p*.9+w*.8,per,6);
    col=mix(uA,uB,smoothstep(.25,.85,cloud));
    col=mix(col,uD,clamp(halo*.42+sec*.25,0.,1.));
    col=mix(col,uC,clamp(core*.92+sec*.5,0.,1.));
    col+=(hash(uv*1024.)-.5)*.01;
  } else if(uType==1){ // travertine / limestone: banded with pores
    float per=4.; vec2 p=uv*per;
    float band=fbm(vec2(p.x*.6,p.y*6.)+fbm(p,per,4),per,6);
    col=mix(uA,uB,smoothstep(.25,.75,band));
    float pores=fbm(vec2(p.x*3.,p.y*22.),per*3.,5);
    col=mix(col,uC,smoothstep(.62,.72,pores)*uP1);
    col*=.97+.06*fbm(p*8.,per*8.,4);
  } else if(uType==2){ // microcement / concrete / porcelain body
    float per=4.; vec2 p=uv*per;
    float c1=fbm(p*1.2,per*1.2,6), c2=fbm(p*6.+c1*2.,per*6.,5);
    col=mix(uA,uB,smoothstep(.3,.75,c1)*uP1+c2*uP2);
    col+=(vnoise(uv*900.,900.)-.5)*uP3*2.;
  } else if(uType==3){ // zellige glaze: cloudy pooling
    float per=4.; vec2 p=uv*per;
    float c=fbm(p*2.+fbm(p*3.,per*3.,4),per*2.,6);
    col=mix(uA,uB,smoothstep(.2,.8,c));
    col=mix(col,uC,pow(fbm(p*9.,per*9.,4),3.)*.5);
  } else { // slate: layered dark stone
    float per=4.; vec2 p=uv*per;
    float l=fbm(vec2(p.x*1.5,p.y*7.)+fbm(p*2.,per*2.,4)*1.5,per,7);
    col=mix(uA,uB,l); col=mix(col,uC,smoothstep(.6,.8,fbm(p*5.,per*5.,5))*.35);
  }
  o=vec4(clamp(col,0.,1.),1.);
}`;
const VS=`#version 300 es
in vec2 aP; out vec2 vUV; void main(){ vUV=aP*.5+.5; gl_Position=vec4(aP,0.,1.); }`;

function init(){
  cv=document.createElement("canvas"); cv.width=cv.height=SIZE;
  gl=cv.getContext("webgl2",{preserveDrawingBuffer:true});
  const sh=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(x));return x};
  prog=gl.createProgram(); gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS)); gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));
  gl.bindAttribLocation(prog,0,"aP"); gl.linkProgram(prog);
  const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
}
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
function bake(spec){
  if(!gl) init();
  gl.viewport(0,0,SIZE,SIZE); gl.useProgram(prog);
  const U=n=>gl.getUniformLocation(prog,n);
  gl.uniform1i(U("uType"),spec.type);
  ["A","B","C","D"].forEach(k=>gl.uniform3fv(U("u"+k),hex(spec[k]||"#000000")));
  gl.uniform1f(U("uSeed"),spec.seed||.37); gl.uniform1f(U("uP1"),spec.p1??1); gl.uniform1f(U("uP2"),spec.p2??1); gl.uniform1f(U("uP3"),spec.p3??1);
  gl.drawArrays(gl.TRIANGLES,0,3);
  const out=document.createElement("canvas"); out.width=out.height=SIZE; out.getContext("2d",{willReadFrequently:true}).drawImage(cv,0,0);
  return out;
}

/* ---- canvas-drawn materials ---- */
function rand(seed){let s=seed>>>0||1;return()=>((s=Math.imul(s^s>>>15,1|s)+0x6D2B79F5|0,(s^s>>>7)>>>0)%100000)/100000}
function canvasOf(){const c=document.createElement("canvas");c.width=c.height=SIZE;return [c,c.getContext("2d",{willReadFrequently:true})]}
function wrapDraw(fn){for(const dx of [-SIZE,0,SIZE])for(const dy of [-SIZE,0,SIZE])fn(dx,dy)}
// only repeat a shape across the tile seam when it actually reaches an edge
function wrapNear(cx,cy,m,fn){const xs=[0],ys=[0];if(cx<m)xs.push(SIZE);if(cx>SIZE-m)xs.push(-SIZE);if(cy<m)ys.push(SIZE);if(cy>SIZE-m)ys.push(-SIZE);for(const dx of xs)for(const dy of ys)fn(dx,dy)}
const hexToRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
// blend many small rectangles straight into the pixel buffer; spec(o) fills o.x,o.y,o.w,o.h,o.c=[r,g,b],o.a
function specks(ctx,W,H,count,spec){
  const img=ctx.getImageData(0,0,W,H), d=img.data, o={x:0,y:0,w:1,h:1,c:null,a:0};
  for(let i=0;i<count;i++){ spec(o); const a=o.a; if(a<=0) continue;
    const xa=o.x|0, ya=o.y|0; let xb=(o.x+o.w)|0, yb=(o.y+o.h)|0;
    if(xb<=xa) xb=xa+1; if(yb<=ya) yb=ya+1;
    const x0=xa<0?0:xa, y0=ya<0?0:ya, x1=xb>W?W:xb, y1=yb>H?H:yb, cr=o.c[0], cg=o.c[1], cb=o.c[2];
    for(let y=y0;y<y1;y++){ let p=(y*W+x0)*4;
      for(let x=x0;x<x1;x++,p+=4){ d[p]+=(cr-d[p])*a; d[p+1]+=(cg-d[p+1])*a; d[p+2]+=(cb-d[p+2])*a; } } }
  ctx.putImageData(img,0,0);
}

function terrazzo({base,chips,seed=7,density=1}){
  const [c,x]=canvasOf(), r=rand(seed); x.fillStyle=base; x.fillRect(0,0,SIZE,SIZE);
  // fine aggregate
  const crgb=chips.map(hexToRgb);
  specks(x,SIZE,SIZE,26000*density,o=>{o.c=crgb[(r()*crgb.length)|0];o.a=.25+r()*.4;o.w=o.h=.6+r()*1.6;o.x=r()*SIZE;o.y=r()*SIZE});
  // stone chips: irregular, mostly small, a few larger; slightly translucent edges like ground aggregate
  for(let i=0;i<1400*density;i++){
    const cx=r()*SIZE, cy=r()*SIZE, s=2+Math.pow(r(),3)*15, n=6+((r()*5)|0), col=chips[(r()*chips.length)|0], rot=r()*6.3, el=.55+r()*.45;
    const pts=[...Array(n)].map((_,k)=>{const a=rot+k/n*6.283+(r()-.5)*.7,rr=s*(.45+r()*.6);return [Math.cos(a)*rr,Math.sin(a)*rr*el]});
    x.globalAlpha=.75+r()*.25;
    wrapNear(cx,cy,s*1.2+2,(dx,dy)=>{x.beginPath();pts.forEach(([a,b],k)=>x[k?"lineTo":"moveTo"](cx+a+dx,cy+b+dy));x.closePath();x.fillStyle=col;x.fill()});
  }
  x.globalAlpha=1;
  return c;
}
function wallpaper(kind,{bg,fg,fg2}){
  const [c,x]=canvasOf(); x.fillStyle=bg; x.fillRect(0,0,SIZE,SIZE); x.strokeStyle=fg; x.fillStyle=fg; x.lineCap="round";
  const r=rand(11);
  if(kind==="deco"){ // art-deco fans, 4x4 repeat, staggered rows
    const s=SIZE/6; x.lineWidth=2;
    for(let j=0;j<=12;j++)for(let i=-1;i<=6;i++){const cx=i*s+(j%2)*s/2, cy=j*s*.5;
      for(let k=1;k<=5;k++){x.beginPath();x.arc(cx,cy,s*.5*k/5,Math.PI,2*Math.PI);x.stroke();}
      for(let k=0;k<=8;k++){const a=Math.PI+k/8*Math.PI;x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(a)*s*.5,cy+Math.sin(a)*s*.5);x.globalAlpha=.55;x.stroke();x.globalAlpha=1}}
  } else if(kind==="botanical"){ // fine line leaves
    x.lineWidth=2.4;
    const leaf=(cx,cy,a,s)=>{x.save();x.translate(cx,cy);x.rotate(a);x.beginPath();x.moveTo(0,0);x.quadraticCurveTo(s*.35,-s*.3,s,0);x.quadraticCurveTo(s*.35,s*.3,0,0);x.stroke();
      x.beginPath();x.moveTo(0,0);x.lineTo(s*.92,0);x.globalAlpha=.6;x.stroke();x.globalAlpha=1;x.restore()};
    for(let i=0;i<30;i++){const bx=(i%6)*SIZE/6+r()*60,by=Math.floor(i/6)*SIZE/5+r()*60,a0=r()*.6-.3,sz=58+r()*18;
      wrapDraw((dx,dy)=>{x.strokeStyle=i%3?fg:fg2;x.beginPath();x.moveTo(bx+dx,by+dy);x.bezierCurveTo(bx+dx+50,by+dy-90,bx+dx+20,by+dy-170,bx+dx+70,by+dy-260);x.stroke();
        for(let k=0;k<8;k++){const t=k/8;leaf(bx+dx+50*t+15*Math.sin(t*3),by+dy-260*t,a0+(k%2?.95:-.95)-1.57,sz)}})}
  } else if(kind==="stripe"){
    for(let i=0;i<16;i++){const x0=i*SIZE/16;x.globalAlpha=.9;x.fillStyle=fg;x.fillRect(x0,0,SIZE/32,SIZE);x.fillStyle=fg2;x.globalAlpha=.6;x.fillRect(x0+SIZE/32+6,0,3,SIZE)}
    x.globalAlpha=1;
  } else if(kind==="arches"){
    const s=SIZE/4; x.lineWidth=10;
    for(let j=0;j<4;j++)for(let i=0;i<4;i++){const cx=i*s+s/2, cy=j*s+s*.8;x.strokeStyle=(i+j)%2?fg:fg2;
      x.beginPath();x.moveTo(cx-s*.3,cy);x.lineTo(cx-s*.3,cy-s*.35);x.arc(cx,cy-s*.35,s*.3,Math.PI,0);x.lineTo(cx+s*.3,cy);x.stroke();
      x.beginPath();x.moveTo(cx-s*.16,cy);x.lineTo(cx-s*.16,cy-s*.32);x.arc(cx,cy-s*.32,s*.16,Math.PI,0);x.lineTo(cx+s*.16,cy);x.globalAlpha=.5;x.stroke();x.globalAlpha=1}
  } else if(kind==="grasscloth"){ // woven natural fibres
    for(let y=0;y<SIZE;y+=2){const t=r();x.fillStyle=t<.5?fg:fg2;x.globalAlpha=.08+r()*.22;x.fillRect(0,y,SIZE,1+r()*2)}
    for(let i=0;i<900;i++){const y=r()*SIZE,len=40+r()*300,x0=r()*SIZE;x.globalAlpha=.15+r()*.25;x.fillStyle=r()<.5?fg2:fg;
      wrapDraw((dx)=>x.fillRect(x0+dx,y,len,1.5))}
    for(let xx=0;xx<SIZE;xx+=SIZE/8){x.globalAlpha=.18;x.fillStyle=fg2;x.fillRect(xx,0,1.5,SIZE)}
    x.globalAlpha=1;
  }
  return c;
}

/* ---- textiles: neutral (light grey) so a product tint gives the colour ---- */
function fabric(kind,seed=3){
  const S=512,c=document.createElement("canvas");c.width=c.height=S;const x=c.getContext("2d",{willReadFrequently:true}),r=rand(seed);
  x.fillStyle="#e6e6e6";x.fillRect(0,0,S,S);
  if(kind==="linen"){ // slubby plain weave
    for(let y=0;y<S;y+=2){x.fillStyle=`rgba(0,0,0,${.03+r()*.07})`;x.fillRect(0,y,S,1)}
    for(let xx=0;xx<S;xx+=2){x.fillStyle=`rgba(255,255,255,${.03+r()*.08})`;x.fillRect(xx,0,1,S)}
    for(let i=0;i<260;i++){const y=r()*S,l=20+r()*120,x0=r()*S;x.fillStyle=`rgba(0,0,0,${.05+r()*.08})`;for(const d of [-S,0,S])x.fillRect(x0+d,y,l,1.4)}
  } else if(kind==="boucle"){ // looped yarn
    for(let i=0;i<5200;i++){const cx=r()*S,cy=r()*S,rr=1.6+r()*3.2;x.strokeStyle=r()<.5?`rgba(0,0,0,${.06+r()*.1})`:`rgba(255,255,255,${.1+r()*.2})`;x.lineWidth=1;
      for(const dx of [-S,0,S])for(const dy of [-S,0,S]){x.beginPath();x.arc(cx+dx,cy+dy,rr,0,6.283);x.stroke()}}
  } else if(kind==="velvet"){ // soft pile with crush marks
    for(let i=0;i<120;i++){const cx=r()*S,cy=r()*S,rr=20+r()*70,g=x.createRadialGradient(cx,cy,0,cx,cy,rr),k=r()<.5?"0,0,0":"255,255,255";
      g.addColorStop(0,`rgba(${k},${.015+r()*.025})`);g.addColorStop(1,`rgba(${k},0)`);x.fillStyle=g;for(const dx of [-S,0,S])for(const dy of [-S,0,S]){x.save();x.translate(dx,dy);x.fillRect(cx-rr,cy-rr,rr*2,rr*2);x.restore()}}
    for(let i=0;i<9000;i++){x.fillStyle=`rgba(0,0,0,${r()*.05})`;x.fillRect(r()*S,r()*S,1,1)}
  }
  return c;
}

/* ---- rugs (alpha marks the footprint; drawn at the rug's aspect ratio) ---- */
function rug(design,{w=2.3,d=1.6,seed=5}={}){
  const W=1024,H=Math.round(W*d/w),c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d",{willReadFrequently:true}),r=rand(seed);
  const pad=18;
  const BLK=[0,0,0],WHT=[255,255,255];
  const wool=(alpha=.1)=>specks(x,W,H,W*H/9,o=>{o.x=r()*W;o.y=r()*H;o.w=1+r()*1.5;o.h=1+r()*2.5;o.c=r()<.5?BLK:WHT;o.a=r()*alpha});
  x.save();x.beginPath();x.rect(pad,pad,W-2*pad,H-2*pad);x.clip();
  if(design==="atlas"){ // Beni Ourain: cream pile, hand-drawn charcoal lattice
    x.fillStyle="#ece4d5";x.fillRect(0,0,W,H);x.strokeStyle="#3b3836";x.lineWidth=6;x.lineCap="round";
    const n=7,cw=(W-2*pad)/n,ch=(H-2*pad)/4;
    for(let j=-1;j<5;j++)for(let i=0;i<=n;i++){const cx=pad+i*cw,cy=pad+j*ch+(i%2)*ch/2;
      x.beginPath();x.moveTo(cx+(r()-.5)*8,cy);x.lineTo(cx+cw/2+(r()-.5)*8,cy+ch/2+(r()-.5)*8);x.lineTo(cx+(r()-.5)*8,cy+ch);x.lineTo(cx-cw/2+(r()-.5)*8,cy+ch/2);x.closePath();x.stroke()}
    wool(.14);
  } else if(design==="kilim"){ // flatweave: madder field, stepped (pixel-woven) medallions in a border
    const madder="#9e4532",indigo="#2c3550",ochre="#c99446",ivory="#e8dcc4",brown="#4a2e22";
    x.fillStyle=madder;x.fillRect(0,0,W,H);
    const cell=8, step=(cx,cy,R,col)=>{x.fillStyle=col;for(let k=-R;k<=R;k++){const w2=(R-Math.abs(k))*cell;x.fillRect(Math.round(cx-w2),Math.round(cy+k*cell),w2*2,cell)}};
    x.fillStyle=indigo;x.fillRect(pad,pad,W-2*pad,70);x.fillRect(pad,H-pad-70,W-2*pad,70);x.fillRect(pad,pad,70,H-2*pad);x.fillRect(W-pad-70,pad,70,H-2*pad);
    for(let i=pad+40;i<W-pad;i+=56){step(i,pad+35,3,ivory);step(i,H-pad-35,3,ivory)}
    for(let j=pad+110;j<H-pad-80;j+=56){step(pad+35,j,3,ochre);step(W-pad-35,j,3,ochre)}
    const n=3;for(let k=0;k<n;k++){const cx=W*(k+1)/(n+1),cy=H/2;step(cx,cy,14,brown);step(cx,cy,12,ivory);step(cx,cy,9,indigo);step(cx,cy,6,ochre);step(cx,cy,3,madder)}
    for(let y=0;y<H;y+=2){x.fillStyle=`rgba(0,0,0,${.02+r()*.04})`;x.fillRect(0,y,W,1)} wool(.07);
  } else if(design==="linea"){ // modern abstract
    x.fillStyle="#d9cdbb";x.fillRect(0,0,W,H);
    [["#b8693f",.25,.4,.33],["#efe7da",.72,.55,.38],["#8f8a6a",.5,.95,.3],["#3e3a36",.9,.1,.16]].forEach(([c0,u,v,s])=>{x.fillStyle=c0;x.beginPath();x.arc(u*W,v*H,s*W,0,6.283);x.fill()});
    wool(.12);
  } else if(design==="jute"){ // chunky natural weave
    x.fillStyle="#b99d74";x.fillRect(0,0,W,H);
    for(let y=0;y<H;y+=14)for(let xx=0;xx<W;xx+=14){const o=((y/14)%2)*7;x.fillStyle=`rgba(${r()<.5?"60,40,20":"255,240,210"},${.12+r()*.14})`;x.beginPath();x.ellipse(xx+o,y+7,7,5,0,0,6.283);x.fill()}
    wool(.06);
  } else if(design==="border"){ // ivory field, navy double border
    x.fillStyle="#efe9df";x.fillRect(0,0,W,H);x.strokeStyle="#22304a";x.lineWidth=26;x.strokeRect(pad+40,pad+40,W-2*pad-80,H-2*pad-80);x.lineWidth=7;x.strokeRect(pad+92,pad+92,W-2*pad-184,H-2*pad-184);
    wool(.1);
  } else if(design==="medina"){ // faded vintage medallion
    x.fillStyle="#a8473b";x.fillRect(0,0,W,H);x.fillStyle="#2b3550";x.fillRect(pad+30,pad+30,W-2*pad-60,H-2*pad-60);x.fillStyle="#b9553f";x.fillRect(pad+70,pad+70,W-2*pad-140,H-2*pad-140);
    const cx=W/2,cy=H/2;[[.22,"#e5cfa1"],[.16,"#2b3550"],[.1,"#c9813f"],[.05,"#efe0bf"]].forEach(([s,c0])=>{x.fillStyle=c0;x.beginPath();for(let k=0;k<16;k++){const a=k/16*6.283,rr=(k%2?.7:1)*s*W;x.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr*.75)}x.closePath();x.fill()});
    for(let i=0;i<4;i++){const ux=i%2?W-pad-160:pad+160,uy=i<2?pad+150:H-pad-150;x.fillStyle="#e5cfa1";x.beginPath();x.arc(ux,uy,40,0,6.283);x.fill()}
    // wear: pale abrasion patches
    for(let i=0;i<70;i++){const g=x.createRadialGradient(r()*W,r()*H,0,0,0,0);x.fillStyle=`rgba(240,225,200,${r()*.12})`;x.beginPath();x.ellipse(r()*W,r()*H,30+r()*120,10+r()*40,r()*3,0,6.283);x.fill()}
    wool(.12);
  }
  x.restore();
  // handmade finish: abrash (dye-lot bands), pile streaks, a softening pass, then fringe on the short ends
  for(let y=pad;y<H-pad;y+=4+r()*10){x.fillStyle=`rgba(${r()<.5?"40,25,15":"255,245,230"},${r()*.05})`;x.fillRect(pad,y,W-2*pad,3+r()*14)}
  specks(x,W,H,W*H/40,o=>{o.x=pad+r()*(W-2*pad);o.y=pad+r()*(H-2*pad);o.w=1;o.h=2+r()*4;o.c=BLK;o.a=r()*.06});
  const soft=document.createElement("canvas");soft.width=W;soft.height=H;const sx=soft.getContext("2d",{willReadFrequently:true});sx.filter="blur(.7px)";sx.drawImage(c,0,0);
  x.clearRect(0,0,W,H);x.drawImage(soft,0,0);
  x.strokeStyle="rgba(236,228,214,.95)";x.lineWidth=1.6;
  for(const yEdge of [pad,H-pad]){const dir=yEdge===pad?-1:1;for(let xx=pad+3;xx<W-pad;xx+=4){x.globalAlpha=.6+r()*.4;x.beginPath();x.moveTo(xx,yEdge);x.lineTo(xx+(r()-.5)*3,yEdge+dir*(pad-1)*(.6+r()*.4));x.stroke()}}
  x.globalAlpha=1;
  return c;
}

/* ---- slatted / fluted wall panels from a wood photo (or a flat paint) ---- */
function panel(woodImg,{slat=26,gap=8,tint=null,flat=null,fluted=false}={}){
  const S=1024,c=document.createElement("canvas");c.width=c.height=S;const x=c.getContext("2d",{willReadFrequently:true});
  x.fillStyle="#141210";x.fillRect(0,0,S,S);
  const n=Math.floor(S/(slat+gap)), sw=S/n-gap;
  for(let i=0;i<n;i++){const x0=i*(S/n)+gap/2;
    if(flat){x.fillStyle=flat;x.fillRect(x0,0,sw,S)}
    else{ // vertical grain: rotate a strip of the photo
      const sx=(i*137)%Math.max(1,woodImg.width-200);x.save();x.translate(x0+sw/2,S/2);x.rotate(Math.PI/2);x.drawImage(woodImg,sx,0,180,woodImg.height*.18,-S/2,-sw/2,S,sw);x.restore()}
    // rounded (fluted) or square edge shading
    const g=x.createLinearGradient(x0,0,x0+sw,0);
    if(fluted){g.addColorStop(0,"rgba(0,0,0,.35)");g.addColorStop(.35,"rgba(255,255,255,.12)");g.addColorStop(.6,"rgba(255,255,255,.05)");g.addColorStop(1,"rgba(0,0,0,.4)")}
    else{g.addColorStop(0,"rgba(0,0,0,.18)");g.addColorStop(.12,"rgba(0,0,0,0)");g.addColorStop(.88,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,.28)")}
    x.fillStyle=g;x.fillRect(x0,0,sw,S);
  }
  if(tint){x.globalCompositeOperation="multiply";x.fillStyle=tint;x.fillRect(0,0,S,S);x.globalCompositeOperation="source-over"}
  return c;
}

window.MateriaGen={bake,terrazzo,wallpaper,fabric,rug,panel,SIZE};
})();
