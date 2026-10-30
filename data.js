/* Rooms (surface geometry + masks) and the product catalogue. */
(function(){
"use strict";
const {Cam}=window.Materia;
const W=(q)=>({...q,units:"w"}); // camera quads are in image-width units
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];

/* ---------- rooms ---------- */
const bath=Cam({cx:.486,cy:.61,f:1.0,h:1.4});
const kit=Cam({cx:.533,cy:.777,f:.63,h:1.09});
const bed=Cam({cx:.511,cy:.311,f:.75,h:1.26});

// a rug placed flat on a camera floor: footprint corners -> rug-local metres (0..w, 0..d)
const placeRug=(cam,x0,x1,zNear,zFar)=>({img:cam.floor(x0,x1,zNear,zFar).img, world:[[0,0],[x1-x0,0],[x1-x0,zFar-zNear],[0,zFar-zNear]], units:"w"});

// lounge: the existing rug is a true rectangle, which fixes the floor plane exactly
const LRUG={img:[[.1644,.8255],[.9111,.8255],[.9972,.9595],[.0783,.9595]], world:[[0,0],[2.6,0],[2.6,1.8],[0,1.8]]};
const LWALL={img:[[.122,.098],[.94,.098],[.94,.8026],[.122,.8026]], world:[[0,-2.9],[3.95,-2.9],[3.95,0],[0,0]]};
const SOFA=[[0,.7384],[0,.69],[.0132,.6646],[.0842,.64],[.0921,.6369],[.1579,.6172],[.1947,.72],[.192,.7292],[.3078,.7304],[.3115,.7366],[.3136,.83],[.2747,.833],[.2737,.86],[.2,.955],[0,.9567]];
const CHAIR=[[.7332,.7375],[.7553,.7308],[.7851,.7344],[.8277,.7447],[.8468,.7488],[.8787,.7344],[.9,.6821],[.9213,.6472],[.9319,.6441],[.9936,.6605],[.9894,.6744],[.9723,.7231],[.9574,.7539],[.9383,.8],[.8915,.8216],[.8404,.8144],[.7851,.799],[.7553,.7857],[.7391,.7642]];
const TABLETOP=[...Array(18)].map((_,k)=>[.5378+Math.cos(k/18*6.283)*.134,.7863+Math.sin(k/18*6.283)*.03]);
const CURT_L=[[.2767,.1294],[.4167,.1294],[.4156,.1961],[.3889,.4575],[.3639,.549],[.3833,.6536],[.4083,.8026],[.31,.8026],[.31,.6536],[.315,.549],[.29,.3922],[.262,.2614]];
const CURT_R=[[.6072,.1294],[.7483,.1294],[.7472,.3268],[.7167,.4967],[.6889,.5621],[.7167,.6536],[.736,.8],[.63,.8026],[.64,.6536],[.645,.5621],[.615,.3922],[.595,.2288]];
const TABLE_LEGS=[[[.421,.805],[.433,.805],[.433,.873],[.421,.873]],[[.584,.805],[.597,.805],[.597,.873],[.584,.873]],
  [[.4289,.8183],[.4344,.8144],[.5889,.8627],[.5844,.868]],[[.4289,.8641],[.4333,.8693],[.59,.817],[.5856,.8124]]];
const CHAIR_FRAME=[[[.7425,.786],[.7455,.786],[.7498,.8545],[.7468,.8545]],[[.7468,.8515],[.9295,.8515],[.9295,.856],[.7468,.856]],[[.9268,.8],[.9298,.8],[.9298,.856],[.9268,.856]],
  [[.7762,.78],[.7792,.78],[.7822,.899],[.7792,.899]],[[.778,.8955],[.989,.8955],[.989,.9005],[.778,.9005]],[[.986,.78],[.989,.78],[.989,.9],[.986,.9]],[[.9284,.8066],[.93,.8046],[.9875,.8437],[.9858,.8457]]];
const LAMP_BASE=[...Array(14)].map((_,k)=>[.875+Math.cos(k/14*6.283)*.031,.8292+Math.sin(k/14*6.283)*.0065]);
const expand=(q,k)=>{const cx=q.reduce((a,p)=>a+p[0],0)/q.length,cy=q.reduce((a,p)=>a+p[1],0)/q.length;return q.map(([x,y])=>[cx+(x-cx)*k,cy+(y-cy)*k])};


const ring=(cx,cy,rx,ry,n=28)=>[...Array(n)].map((_,k)=>[cx+Math.cos(k/n*6.283)*rx,cy+Math.sin(k/n*6.283)*ry]);
// bedroom wall objects
const FRAMES=[[.380,.323,.4253,.410],[.4327,.266,.5027,.407],[.510,.264,.5673,.367],[.5747,.283,.6193,.367],[.3793,.420,.4373,.524],[.4453,.421,.502,.524],[.510,.379,.5807,.521],[.5873,.380,.6447,.484]].map(([a,b,c,d])=>rect(a,b,c,d));
const BED_WALL_OBJ=[...FRAMES, ring(.3295,.4915,.0185,.027), ring(.6975,.4915,.0185,.027), rect(.3287,.06,.3303,.466), rect(.6962,.06,.6978,.466)];
// living room furniture in front of the walls
const L_SOFA=[[.32,.63],[.325,.62],[.369,.6046],[.374,.583],[.428,.581],[.4325,.577],[.506,.5737],[.516,.594],[.526,.581],[.594,.58],[.675,.581],[.7375,.581],[.7406,.607],[.775,.62],[.786,.629],[.7895,.766],[.7895,.8],[.32,.8]];
const L_ARM=[[0,.645],[.005,.64],[.015,.624],[.076,.602],[.122,.608],[.153,.629],[.158,.629],[.193,.656],[.199,.664],[.252,.674],[.262,.69],[.262,.8],[0,.82]];
const L_VASE=rect(.239,.611,.288,.76);
const L_MIRRORS=[ring(.4787,.428,.082,.112), ring(.618,.3215,.082,.112)];
const L_LAMP=[rect(.815,.398,.902,.465), rect(.8525,.46,.8605,.8)];
const L_BASKET=[[.8,.705],[.81,.69],[.87,.69],[.878,.705],[.88,.8],[.86,.818],[.81,.818],[.798,.8]];
const L_GRASS=[rect(.195,.4,.345,.615)];

const ROOMS=[
 {id:"lounge", name:"Lounge", src:"rooms/lounge.jpg", start:{curtains:"c-sage", rug:"r-atlas"},
  surfaces:[
   {id:"floor", name:"Floor", type:"floor", quad:LRUG,
    poly:[[[.311,.8026],[1,.8026],[1,1],[0,1],[0,.951],[.222,.951],[.311,.85]]],
    holes:[expand(LRUG.img,1.012),CHAIR,SOFA,...CHAIR_FRAME,LAMP_BASE]},
   {id:"rug", name:"Rug", type:"rug", rug:{w:2.6,d:1.8}, quad:LRUG, blur:.05,
    poly:[expand(LRUG.img,1.012)], holes:[...TABLE_LEGS,...CHAIR_FRAME,SOFA]},
   {id:"curtains", name:"Curtains", type:"curtain", quad:LWALL, blur:.004,
    poly:[CURT_L,CURT_R], fine:[CURT_L,CURT_R], tol:.06, lmax:1.3, keyAt:[[.36,.3],[.35,.45],[.37,.72],[.68,.3],[.69,.45],[.69,.72],[.39,.2],[.66,.2]]},
   {id:"wall", name:"Wall", type:"wall", quad:LWALL,
    poly:[rect(.122,.1,.94,.8026)], minus:["curtains"], holes:[SOFA,CHAIR,TABLETOP,rect(.313,.185,.718,.74),rect(.128,.378,.237,.553),rect(.488,.655,.537,.79)],
    grow:[[.2,.3],[.2,.5],[.2,.7],[.15,.2],[.5,.15],[.45,.17],[.8,.3],[.8,.5],[.85,.2],[.9,.4],[.76,.72],[.55,.77],[.45,.78],[.28,.12],[.6,.11],[.17,.6]]},
   {id:"sofa", name:"Sofa", type:"furniture", quad:{img:[[0,.62],[.311,.62],[.311,.951],[0,.951]],world:[[0,0],[1.6,0],[1.6,1.1],[0,1.1]]}, blur:.004, poly:[SOFA], r:4},
   {id:"chair", name:"Lounge chair", type:"furniture", quad:{img:[[.73,.64],[1,.64],[1,.82],[.73,.82]],world:[[0,0],[1.1,0],[1.1,.7],[0,.7]]}, blur:.004, poly:[CHAIR], r:4},
  ]},
 {id:"bathroom", name:"Bathroom", src:"rooms/bathroom.jpg", credit:"Unsplash", start:{floor:"m-statuario", back:"t-zellige-sage"},
  surfaces:[
   {id:"floor", name:"Floor", type:"floor", quad:W(bath.floor(-1.07,1.17,1.2,4.01)),
    poly:[[.212,.762],[.784,.762],[1,.982],[1,1],[0,1],[0,.99]],
    holes:[[[0,.756],[.275,.755],[.28,.8],[.277,.86],[.263,.9],[.236,.919],[.15,.926],[0,.926]]]},
   {id:"panel", name:"Bath panel", type:"wall", quad:W(bath.back(4.01,-1.07,1.17,0,.63)),
    poly:[rect(.219,.64,.781,.768)],
    holes:[[[.09,.58],[.347,.58],[.347,.664],[.266,.664],[.263,.714],[.158,.714],[.158,.664],[.09,.664]],[[0,.758],[.274,.757],[.283,.8],[0,.8]]]},
   {id:"back", name:"Back wall", type:"wall", quad:W(bath.back(5.0,-1.07,1.17,.63,2.75)),
    poly:[[[.266,.183],[.722,.183],[.722,.212],[.589,.212],[.589,.627],[.266,.627]]],
    holes:[rect(.09,.58,.347,.645)]},
   {id:"right", name:"Side wall", type:"wall", quad:W(bath.side(1.17,1.2,5.0,0,2.75)),
    poly:[[[.719,.183],[.868,0],[1,0],[1,.982],[.784,.766],[.784,.682],[.719,.646]]],
    holes:[rect(.745,.298,.818,.59),rect(.785,.555,.842,.592),rect(.826,.296,.876,.333)]},
  ]},
 {id:"living", name:"Living room", src:"rooms/living.jpg", credit:"Unsplash", start:{back:"w-limewash"},
  surfaces:[
   {id:"back", name:"Feature wall", type:"wall",
    quad:{img:[[.237,.07],[.888,.07],[.888,.77],[.237,.77]], world:[[0,-2.7],[3.43,-2.7],[3.43,0],[0,0]]},
    poly:[rect(.231,.064,.894,.748)], holes:[L_SOFA,L_ARM,L_VASE,...L_MIRRORS,...L_LAMP,L_BASKET], fine:L_GRASS, tol:.05},
   {id:"left", name:"Left wall", type:"wall",
    quad:{img:[[.02,0],[.235,.067],[.235,.77],[.02,.84]], world:[[-1.4,-2.75],[0,-2.75],[0,0],[-1.4,0]]},
    poly:[[[0,0],[.238,.064],[.238,.748],[0,.8]]], holes:[L_ARM,L_VASE,rect(0,0,.019,.83)], fine:L_GRASS, tol:.05},
   {id:"right", name:"Right wall", type:"wall",
    quad:{img:[[.888,.067],[1,0],[1,.87],[.888,.77]], world:[[0,-2.75],[1.0,-2.75],[1.0,0],[0,0]]},
    poly:[[[.885,.064],[1,0],[1,.83],[.885,.755]]], holes:[...L_LAMP,L_BASKET,rect(.99,.28,1,.5)]},
  ]},
 {id:"bedroom", name:"Bedroom", src:"rooms/bedroom.jpg", credit:"Unsplash", start:{back:"w-botanica", floor:"w-herringbone"},
  surfaces:[
   {id:"back", name:"Headboard wall", type:"wall", quad:W(bed.back(5.8,-2.6,2.6,.9,3.3)),
    poly:[[[.168,.087],[.272,.087],[.272,.096],[.8,.096],[.8,.556],[.168,.556]]], holes:BED_WALL_OBJ, fine:[rect(.165,.42,.232,.556)], tol:.05},
   {id:"floor", name:"Floor", type:"floor", quad:W(bed.floor(-3,3,1.5,5.8)),
    poly:[[[0,.835],[.17,.722],[.802,.722],[.852,.745],[1,.885],[1,1],[0,1]]],
    holes:[[[.225,.835],[.228,.8],[.292,.729],[.289,.667],[.389,.583],[.667,.583],[.739,.717],[.797,.8],[.797,.892],[.722,.9],[.297,.9],[.225,.892]],
      // desk chair: shell + four legs
      [[.1075,.625],[.12,.595],[.165,.58],[.22,.5575],[.245,.565],[.235,.64],[.22,.674],[.165,.689],[.125,.689],[.11,.67]],
      [[.1215,.684],[.1295,.684],[.1165,.799],[.1095,.799]],[[.1885,.676],[.1955,.676],[.2165,.799],[.2095,.799]],
      [[.1485,.688],[.1545,.688],[.1555,.771],[.1495,.771]],[[.2135,.68],[.2195,.68],[.2445,.771],[.2385,.771]]]},
   {id:"rug", name:"Rug", type:"rug", rug:{w:2.6,d:2.2}, intersect:"floor", guided:false, quad:placeRug(bed,-1.3,1.3,2.4,4.6), poly:[]},
  ]},
 {id:"kitchen", name:"Kitchen", src:"rooms/kitchen.jpg", credit:"Unsplash", start:{floor:"m-calacatta"},
  surfaces:[
   {id:"floor", name:"Floor", type:"floor", quad:W(kit.floor(-1.6,1.6,.9,8)),
    poly:[[[0,1],[0,.875],[.096,.7806],[.393,.6028],[.393,.5933],[.56,.5933],[.704,1]]]},
   {id:"rug", name:"Runner", type:"rug", rug:{w:.9,d:3.2}, intersect:"floor", guided:false, quad:placeRug(kit,-.45,.45,1.2,4.4), poly:[]},
  ]},
];
// polygons are lists of rings; placed rugs take their footprint as the outline
for(const r of ROOMS) for(const s of r.surfaces){
  if(s.intersect&&!s.poly.length){ const q=s.quad, H=r.id==="kitchen"?1.5:r.id==="bedroom"?2/3:1; s.poly=[q.img.map(([u,v])=>[u, q.units==="w"?v/H:v])]; }
  if(typeof s.poly[0][0]==="number") s.poly=[s.poly];
}

/* ---------- catalogue ---------- */
const mm=v=>v/1000;
const P=[];
const add=(o)=>P.push(Object.assign({detail:0,gloss:0,variation:.03,bevel:.0012,grout:mm(2),groutCol:"#cfcac2",layout:0,book:false,tint:"#ffffff",surfaces:["floor","wall"]},o));

// marble (baked, polished, large format)
const marble=(id,name,origin,A,B,C,D,p,extra={})=>add({id:"m-"+id,cat:"stone",name,origin,kind:2,finish:"Polished",gloss:.5,grout:mm(1.5),groutCol:"#d9d4cb",
  tile:[1.2,.6],sizes:[[1.6,.8],[1.2,.6],[.8,.8],[.6,.6]],texM:[3.4,3.4],src:{bake:{type:0,A,B,C,D,p1:p[3],p2:p[0],p3:p[1],seed:p[2]}},...extra});
marble("statuario","Statuario Venato","Carrara, Italy","#f3f2ef","#e4e3e0","#6f7277","#a9abb0",[1.5,46,.21,.55]);
marble("calacatta","Calacatta Oro","Tuscany, Italy","#f6f3ec","#ebe4d6","#8f7553","#c8b391",[1.7,40,.53,.8],{book:true,tile:[1.6,.8]});
marble("nero","Nero Marquina","Basque Country, Spain","#121213","#1b1b1d","#dcdad5","#202023",[1.9,90,.77,.35],{groutCol:"#2a2a2b"});
marble("emperador","Emperador Dark","Murcia, Spain","#4b3527","#5c4231","#c2a98e","#54392a",[2.6,70,.13,1.1],{groutCol:"#3a2a20",tile:[.6,.6]});
marble("verde","Verde Alpi","Aosta Valley, Italy","#1b2b24","#263a30","#c9d3c9","#22342b",[2.2,80,.91,.7],{groutCol:"#26352e"});
marble("botticino","Botticino Fiorito","Brescia, Italy","#e4d8c4","#d6c7ad","#ece2d1","#dccfb8",[1.8,50,.44,.2],{finish:"Honed",gloss:.18,tile:[.6,.6]});

// tiles
add({id:"t-ash",cat:"tiles",name:"Ash Grey",origin:"Porcelain",kind:2,finish:"Matt",tile:[1.2,.6],sizes:[[1.2,.6],[.6,.6],[1.2,1.2]],texM:[2.4,2.4],
  src:{bake:{type:2,A:"#9b9893",B:"#8c8984",p1:.6,p2:.25,p3:.03,seed:.3}},grout:mm(2),groutCol:"#8a877f",gloss:.06});
add({id:"t-ivory",cat:"tiles",name:"Ivory Limestone",origin:"Porcelain",kind:2,finish:"Matt",tile:[.6,.6],sizes:[[.6,.6],[.9,.6],[1.2,.6]],texM:[2.4,2.4],
  src:{bake:{type:1,A:"#e6dccb",B:"#d9ccb6",C:"#c4b394",p1:.6,seed:.62}},groutCol:"#d4cab9",gloss:.05,layout:1});
add({id:"t-terrazzo",cat:"tiles",name:"Terrazzo Bianco",origin:"Cement terrazzo",kind:2,finish:"Polished",tile:[.6,.6],sizes:[[.6,.6],[.4,.4],[.9,.9]],texM:[.9,.9],
  src:{terrazzo:{base:"#ece8e1",chips:["#b9b2a6","#8e8a84","#d8cfc2","#c89f86","#6f7378","#ffffff"],seed:9}},groutCol:"#e2ddd4",gloss:.35});
add({id:"t-zellige-sage",cat:"tiles",name:"Zellige Sage",origin:"Handmade · Morocco",kind:2,finish:"Glazed",tile:[.1,.1],sizes:[[.1,.1],[.13,.13]],texM:[.9,.9],
  src:{bake:{type:3,A:"#8c9f8a",B:"#6f8571",C:"#c9d4c3",seed:.21}},grout:mm(1.5),groutCol:"#d8d6cc",gloss:.6,variation:.22,bevel:.004});
add({id:"t-zellige-white",cat:"tiles",name:"Zellige Blanc",origin:"Handmade · Morocco",kind:2,finish:"Glazed",tile:[.1,.1],sizes:[[.1,.1],[.13,.13]],texM:[.9,.9],
  src:{bake:{type:3,A:"#f2efe8",B:"#e3ddd1",C:"#ffffff",seed:.48}},grout:mm(1.5),groutCol:"#dcd8cf",gloss:.65,variation:.12,bevel:.004});
add({id:"t-subway",cat:"tiles",name:"Metro Gloss White",origin:"Ceramic",kind:2,finish:"Gloss",tile:[.3,.075],sizes:[[.3,.075],[.2,.1]],texM:[1.2,1.2],
  src:{bake:{type:2,A:"#f6f5f2",B:"#eeece7",p1:.4,p2:.1,p3:.01,seed:.5}},grout:mm(2),groutCol:"#c9c6bf",gloss:.7,variation:.04,bevel:.005,layout:1,surfaces:["wall"]});
add({id:"t-micro",cat:"tiles",name:"Microcement Taupe",origin:"Seamless finish",kind:2,finish:"Satin",tile:[3,3],sizes:[[3,3]],texM:[3,3],
  src:{bake:{type:2,A:"#b7aa9b",B:"#9d8f80",p1:.9,p2:.35,p3:.02,seed:.8}},grout:0,gloss:.12,variation:0});
add({id:"t-slate",cat:"tiles",name:"Charcoal Slate",origin:"Natural stone",kind:2,finish:"Riven",tile:[.6,.3],sizes:[[.6,.3],[.6,.6]],texM:[1.8,1.8],
  src:{bake:{type:4,A:"#2f3133",B:"#45484b",C:"#5c6064",seed:.33}},groutCol:"#3a3b3d",gloss:.08,variation:.1,layout:1});
add({id:"t-travertine",cat:"tiles",name:"Travertino Classico",origin:"Natural stone",kind:2,finish:"Honed",tile:[.6,.4],sizes:[[.6,.4],[.6,.6]],texM:[2.4,2.4],
  src:{bake:{type:1,A:"#d9c6a6",B:"#c8b18c",C:"#a48d6a",p1:1,seed:.12}},groutCol:"#cdbb9d",gloss:.1,variation:.08,layout:1});

// wood
const wood=(id,name,origin,img,size,extra={})=>add({id:"w-"+id,cat:"wood",name,origin,kind:1,finish:"Matt lacquer",texM:[size,size],src:{img},surfaces:["floor"],gloss:.12,...extra});
wood("herringbone","Herringbone Oak","Engineered oak","tx/herringbone_parquet.jpg",3.4);
wood("oak","Natural Oak Plank","Engineered oak","tx/wood_floor.jpg",1.7);
wood("grey","Grey Washed Oak","Laminate","tx/laminate_floor_02.jpg",1.7);

// wall finishes
const paper=(id,name,origin,kind,cols,extra={})=>add({id:"w-"+id,cat:"wallpaper",name,origin,kind:1,finish:"Wallcovering",texM:[1.0,1.0],src:{wallpaper:{kind,...cols}},surfaces:["wall"],detail:.25,...extra});
add({id:"w-limewash",cat:"wallpaper",name:"Limewash Plaster",origin:"Mineral plaster",kind:1,finish:"Chalky",texM:[1.6,1.6],src:{img:"tx/white_stucco.jpg"},tint:"#efe2cf",surfaces:["wall"],detail:.2});
paper("deco","Deco Fan","Wallpaper","deco",{bg:"#1f2a3a",fg:"#c7a46a"});
paper("botanica","Botanica","Wallpaper","botanical",{bg:"#efe8db",fg:"#6f7d63",fg2:"#a9926a"});
paper("grass","Grasscloth Natural","Woven wallcovering","grasscloth",{bg:"#c9b796",fg:"#a8946f",fg2:"#e2d4b6"},{detail:.15});
paper("stripe","Regency Stripe","Wallpaper","stripe",{bg:"#e9e6dc",fg:"#9aa991",fg2:"#7d8d74"});
paper("arches","Arcadia","Wallpaper","arches",{bg:"#efe3d3",fg:"#c27a5a",fg2:"#d9a588"});

// paint
const paint=(id,name,hex,origin="Matt emulsion")=>add({id:"p-"+id,cat:"paint",name,origin,kind:0,finish:"Matt",tint:hex,surfaces:["wall"],detail:.55});
paint("linen","Warm Linen","#e8dfd0");paint("sage","Sage Mist","#a9b39c");paint("clay","Clay Pink","#d4a99a");paint("olive","Olive Grove","#7d8063");
paint("ochre","Burnt Ochre","#c58b4a");paint("terracotta","Terracotta","#b5654a");paint("sky","Pale Sky","#c9d3d8");paint("navy","Ink Navy","#2e3a4f");
paint("forest","Forest","#3f5446");paint("charcoal","Charcoal","#47484a");paint("blush","Blush","#e6cbc0");paint("chalk","Chalk White","#f1eee8");

// wall panels (slats cut from the oak / ash photos, or painted)
const panel=(id,name,origin,spec,extra={})=>add({id:"n-"+id,cat:"panels",name,origin,kind:1,finish:"Slatted panel",texM:[.9,.9],src:{panel:spec},surfaces:["wall"],detail:.08,gloss:.05,...extra});
panel("oak","Fluted Oak","Solid oak veneer",{wood:"tx/wood_floor.jpg",fluted:true,slat:30,gap:6});
panel("walnut","Walnut Slat","Walnut veneer",{wood:"tx/wood_floor.jpg",slat:26,gap:10,tint:"#7a5641"});
panel("ash","Ash Batten","Ash veneer",{wood:"tx/laminate_floor_02.jpg",slat:34,gap:12});
panel("chalk","Chalk Fluted","Painted MDF",{flat:"#ebe7df",fluted:true,slat:30,gap:4});
panel("charcoal","Charcoal Batten","Painted MDF",{flat:"#3a3a3b",slat:40,gap:14});

// curtains & upholstery: fabric relief from the photo, colour from the product
const fabric=(pre,cat,surf)=>(id,name,origin,hex,weave,extra={})=>add({id:pre+id,cat,name,origin,kind:1,finish:weave[0].toUpperCase()+weave.slice(1),
  texM:weave==="boucle"?[.18,.18]:[.25,.25],src:{fabric:weave},tint:hex,surfaces:[surf],detail:1,gloss:weave==="velvet"?.12:0,...extra});
const curtain=fabric("c-","curtains","curtain");
curtain("ivory","Ivory Linen","Washed linen","#f1ece3","linen");curtain("oat","Oatmeal","Linen blend","#d8cbb3","linen");
curtain("sage","Sage Linen","Washed linen","#a6b19a","linen");curtain("rose","Dusty Rose","Linen blend","#d3aba1","linen");
curtain("terra","Terracotta","Cotton slub","#b8674a","linen");curtain("midnight","Midnight Velvet","Cotton velvet","#28324a","velvet");
curtain("olive","Olive Velvet","Cotton velvet","#5f6343","velvet");curtain("char","Charcoal","Wool blend","#48494b","linen");
const uph=fabric("f-","furniture","furniture");
uph("boucle","Ivory Bouclé","Wool bouclé","#efe8dc","boucle");uph("mushroom","Mushroom Bouclé","Wool bouclé","#a89a8a","boucle");
uph("sand","Sand Linen","Heavy linen","#cdbb9c","linen");uph("emerald","Emerald Velvet","Cotton velvet","#2f5a48","velvet");
uph("rust","Rust Velvet","Cotton velvet","#9c4a2e","velvet");uph("navy","Navy Velvet","Cotton velvet","#2a3550","velvet");
uph("charcoal","Charcoal Linen","Heavy linen","#4b4b4d","linen");

// rugs (texture made at the footprint's own proportions)
const rugP=(id,name,origin,design)=>add({id:"r-"+id,cat:"rugs",name,origin,kind:4,finish:"Hand-knotted",src:{rug:design},surfaces:["rug"],detail:.15});
rugP("atlas","Atlas","Hand-knotted wool","atlas");rugP("kilim","Kilim Terra","Flatweave wool","kilim");rugP("linea","Linea","Hand-tufted wool","linea");
rugP("jute","Jute Natural","Braided jute","jute");rugP("border","Bordered Navy","Wool & viscose","border");rugP("medina","Medina","Vintage wool","medina");

const CATS=[{id:"stone",name:"Stones"},{id:"tiles",name:"Tiles"},{id:"wood",name:"Wood"},{id:"wallpaper",name:"Wallpapers"},{id:"panels",name:"Panels"},
  {id:"paint",name:"Paints"},{id:"curtains",name:"Curtains"},{id:"rugs",name:"Rugs"},{id:"furniture",name:"Furniture"}];
const ALLOWED={floor:["stone","tiles","wood"],wall:["wallpaper","paint","panels","stone","tiles"],rug:["rugs"],curtain:["curtains"],furniture:["furniture"]};
const GROUTS=["#f2efe9","#cfcac2","#8a877f","#3a3b3d","#b49c7c"];
const LAYOUTS=[{id:0,name:"Straight"},{id:1,name:"Brick"},{id:3,name:"Stack"},{id:2,name:"Diagonal"}];

window.MateriaData={ROOMS,PRODUCTS:P,CATS,GROUTS,LAYOUTS,ALLOWED};
})();
