"use strict";
const $ = id => document.getElementById(id);
const paths = {
  score:'<path d="m13 2-9 12h7l-1 8 10-13h-7z" fill="currentColor" stroke="none"/>',
  trophy:'<path d="M7 3h10v6c0 4-2 6-5 6s-5-2-5-6zM7 5H3v3c0 3 2 4 5 4m9-7h4v3c0 3-2 4-5 4m-4 3v4m-4 2h8"/>',
  level:'<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  heart:'<path fill="currentColor" stroke="none" d="M1 5h3V2h5v2h2v2h2V4h2V2h5v3h3v7h-3v3h-3v3h-3v3h-4v-3H7v-3H4v-3H1z"/>',
  sound:'<path d="M3 9h4l5-4v14l-5-4H3zm13-1q4 4 0 8m3-11q7 7 0 14"/>',
  mute:'<path d="M3 9h4l5-4v14l-5-4H3zm13 0 6 6m0-6-6 6"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 0 1 5 .6c0 1.8-2.5 2-2.5 4M12 16v.5"/>',
  play:'<path d="m6 3 14 9-14 9z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M6 4h4v16H6zm8 0h4v16h-4z" fill="currentColor" stroke="none"/>',
  expand:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>'
};
const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
document.querySelectorAll("[data-icon]").forEach(el=>el.innerHTML=icon(el.dataset.icon));

// Draw custom slanted arcade lettering at high resolution for sharp chrome edges.
function wordmark(){
  const ctx=$("wordmark").getContext("2d");
  const letters={
    G:["10,0 53,0 53,11 15,11 12,14 12,36 15,39 41,39 41,30 28,30 28,20 53,20 53,50 9,50 0,41 0,10"],
    A:["12,0 43,0 54,12 54,50 41,50 41,33 13,33 13,50 0,50 0,12","16,11 13,15 13,22 41,22 41,15 38,11"],
    P:["0,0 44,0 54,10 54,24 44,34 14,34 14,50 0,50","14,11 14,23 38,23 41,20 41,14 38,11"],
    E:["0,0 52,0 52,11 14,11 14,20 45,20 45,30 14,30 14,39 52,39 52,50 0,50"],
    R:["0,0 44,0 54,10 54,23 43,32 56,50 39,50 27,33 14,33 14,50 0,50","14,11 14,22 37,22 41,19 41,14 38,11"]};
  ctx.setTransform(2.28,0,-.46,2.62,32,9);
  const p=new Path2D();let x=0;
  for(const letter of "GAPPER"){
    for(const ring of letters[letter]){ring.split(" ").forEach((v,i)=>{const [a,b]=v.split(",").map(Number);p[i?"lineTo":"moveTo"](x+a,b);});p.closePath();}x+=60;
  }
  ctx.save();ctx.translate(0,5);ctx.fillStyle="#531a64";ctx.lineWidth=3;ctx.strokeStyle="#170b29";ctx.stroke(p);ctx.fill(p,"evenodd");ctx.restore();
  const g=ctx.createLinearGradient(0,0,0,50);
  [[0,"#ffffff"],[.17,"#e7f4ff"],[.43,"#9fbadb"],[.49,"#6885b3"],[.50,"#3a295d"],[.55,"#725089"],[.79,"#bf8abd"],[1,"#ffddf4"]].forEach(([a,b])=>g.addColorStop(a,b));
  ctx.fillStyle=g;ctx.fill(p,"evenodd");ctx.lineWidth=.8;ctx.strokeStyle="#f0d8ff";ctx.stroke(p);
  ctx.save();ctx.clip(p,"evenodd");ctx.fillStyle="#fff2";for(let y=29;y<51;y+=2)ctx.fillRect(0,y,365,.35);ctx.restore();
}
wordmark();
function pixels(ctx,rows,colors,size){
  rows.forEach((row,y)=>[...row].forEach((v,x)=>{if(colors[v]){ctx.fillStyle=colors[v];ctx.fillRect(x*size,y*size,size,size);}}));
}
pixels($("brand-icon").getContext("2d"),["...ppppppppp...","..pvvvvvvvvvp..","..pvtttttttvp..","..pvtttttttvp..","..pvvvvvvvvvp..","..ppppppppppp..","...pvvvvvvvp...","..pptttppptpp..",".pvvvvvvvvvvvp.",".ppppppppppppp."],{p:"#ac87f8",v:"#673f9f",t:"#52f5de"},2.25);
const ship=[".....a.........","....abb........","...abccbb......","..abccccdbb....","aaabbdddcddbb..",".bbdddeeeeeddba","aaabbdddcddbb..","..abccccdbb....","...abccbb......","....abb........",".....a........."];
const bug=["..a......a..","...a....a...","...abbbba...","..abccccba..",".abdeccedba.","abbddeeddbba","abbbccccbbba","a.abbb bba.a".replace(" ",""),"..aa....aa..",".aa......aa."];
const shipColors={a:"#268ca7",b:"#43dddf",c:"#b0ffff",d:"#57eff1",e:"#fff"};
const bugColors={a:"#9c306a",b:"#f34d99",c:"#ff9fcb",d:"#4a1b5f",e:"#fff7c5"};
function spriteSheet(rows,colors){
  const sheet=document.createElement("canvas");sheet.width=Math.max(...rows.map(row=>row.length));sheet.height=rows.length;
  pixels(sheet.getContext("2d"),rows,colors,1);return sheet;
}
const runnerSprite=spriteSheet(ship,shipColors),seekerSprite=spriteSheet(bug,bugColors);
const game=new Circuit.Game(onEvent);
function read(key,fallback){try{return localStorage.getItem(key)??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,value);}catch{}}
let soundOn=read("gapper.sound","on")==="on";
const scores=new Scoreboard(act,quitToStart);
game.setScheme(read("gapper.controls","third"));
let typed="",pauseBeforeWord=null;
let audioCtx,boardCache=null,bursts=[],elapsed=0,prevTime=0,guidePaused=false;
const canvas=$("board"),ctx=canvas.getContext("2d"),reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
function unlock(){if(!soundOn)return;try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume().catch(()=>{});}catch{}}
function tone(hz,end,length=.1,type="triangle",delay=0,volume=.04){
  if(!audioCtx||!soundOn)return;
  const t=audioCtx.currentTime+delay,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(hz,t);osc.frequency.exponentialRampToValueAtTime(end,t+length);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+length);
  osc.connect(gain).connect(audioCtx.destination);osc.start(t);osc.stop(t+length+.01);
}
function onEvent(ev){
  boardCache=null;
  if(ev==="rail"){tone(350+game.traced.size%5*65,650,.06,"sine",0,.025);burst(game.pos(game.player),"#6affed",4);}
  if(ev==="start"){tone(260,400);tone(530,790,.17,"triangle",.09);}
  if(ev==="gap"){tone(850,120,.2,"sawtooth",0,.025);}
  if(ev==="hit"){tone(155,34,.45,"sawtooth");burst(game.pos(game.player),"#ff6bab",28);}
  if(ev==="clear"){[0,4,7,12].forEach((n,i)=>tone(330*2**(n/12),660,.22,"triangle",i*.09));}
  sync();
  if(ev==="hit" && game.state==="over") scores.finish(game);
}
function burst(p,color,n){if(reduced)return;for(let i=0;i<n;i++)bursts.push({p,color,age:0,dx:(Math.random()-.5)*90,dy:(Math.random()-.5)*90});}
const states={
  ready:["Ready player one","Light up every rail. Evade the seeker.","Start game"],
  paused:["Game paused","Your circuit is waiting.","Resume"],
  playing:["Circuit live","Steer at junctions. Space cuts a gap behind you.","Pause"],
  caught:["Runner caught","Your traced rails are safe. Launch your next ship.","Continue"],
  over:["Game over","The seeker caught your last ship.","Play again"],
  clear:["Circuit cleared","Every rail is lit. The next circuit awaits.","Next level"]
};
function sync(){
  const [state,msg,action]=states[game.state];
  $("score").textContent=String(game.score).padStart(6,"0");scores.updateBest();
  $("score-open").hidden=game.state!=="ready";$("best-label").hidden=game.state==="ready";
  $("level").textContent=$("sector").textContent=String(game.level).padStart(2,"0");$("circuit").textContent=game.name;
  $("lives").innerHTML=Array.from({length:3},(_,i)=>'<span class="'+(i>=game.lives?"spent":"")+'">'+icon("heart")+'</span>').join("");
  $("lives").setAttribute("aria-label",game.lives+" lives");
  const percent=Math.floor(game.traced.size/game.rails.size*100);
  $("percent").textContent=percent+"%";$("trace-bars").innerHTML=Array.from({length:12},(_,i)=>'<i class="'+(i<Math.floor(percent*12/100)?"lit":"")+'"></i>').join("");
  if($("status").textContent!==state)$("status").textContent=state;
  $("message").textContent=game.gap && game.state==="playing"?"Gap open. The broken rail will repair shortly.":msg;
  if(game.state==="caught" && game.scheme==="first") $("message").textContent="Your next ship launches automatically.";
  if(game.state==="over" && game.practiced) $("message").textContent="Practice runs do not count toward your best score.";
  $("pax").hidden=!game.practice;
  $("steering").hidden=!(game.state==="ready" || game.state==="paused" || game.state==="over");
  $("action-label").textContent=action;$("action").firstElementChild.innerHTML=icon(game.state==="playing"?"pause":"play");
}
function updateSound(){$("sound-label").textContent=soundOn?"Sound on":"Sound off";$("sound").setAttribute("aria-pressed",soundOn);$("sound").firstElementChild.innerHTML=icon(soundOn?"sound":"mute");}
function act(){
  pauseBeforeWord=null;
  unlock();
  if(game.state==="playing"){game.state="paused";sync();}
  else if(game.state==="paused"){game.state="playing";sync();}
  else game.start();
  canvas.focus({preventScroll:true});
}
function quitToStart(){
  game.reset();
  boardCache=null;
  bursts=[];
  sync();
  $("action").focus();
}
function showScheme(){
  const first=game.scheme==="first";
  const hint=first?"Use Left/Right or A/D to turn relative to your ship.":"Use the arrow keys or WASD to steer in screen directions.";
  document.body.classList.toggle("first-person",first);
  document.querySelectorAll("[data-scheme]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.scheme===game.scheme));
  $("scheme-hint").textContent=hint;
  $("guide").querySelector("dd").textContent=hint+(first?" Your ship follows corners automatically.":" You can queue a turn before a junction.");
  $("board").setAttribute("aria-label","Rail maze. "+hint+" Press Space to cut a gap.");
  document.querySelector(".controls .key-help > span:last-child").textContent=first?"Turn":"Move";
  for(const d of ["left","right"])document.querySelector('[data-dir="'+d+'"]').setAttribute("aria-label",(first?"Turn ":"Move ")+d);
}
document.querySelectorAll("[data-scheme]").forEach(b=>b.onclick=()=>{
  game.setScheme(b.dataset.scheme);save("gapper.controls",game.scheme);showScheme();
});
$("action").onclick=act;
$("sound").onclick=()=>{soundOn=!soundOn;save("gapper.sound",soundOn?"on":"off");updateSound();unlock();tone(500,680);};
$("help").onclick=()=>{pauseBeforeWord=null;guidePaused=game.state==="playing";if(guidePaused){game.state="paused";sync();}$("guide").showModal();};
$("got-it").onclick=()=>$("guide").close();
$("guide").addEventListener("close",()=>{if(guidePaused && !document.hidden){game.state="playing";sync();}guidePaused=false;});
const keyDirs={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",a:"left",d:"right",w:"up",s:"down"};
window.addEventListener("keydown",e=>{
  if(e.defaultPrevented || e.target===$("initials"))return;
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const k=e.key.length===1?e.key.toLowerCase():e.key;
  if(!e.repeat && e.key.length===1){
    typed=(typed+k).slice(-3);
    if(k==="p")pauseBeforeWord=null;
    if(typed==="pax"){
      game.togglePractice();
      if(pauseBeforeWord && (game.state==="paused" || game.state==="playing")) game.state=pauseBeforeWord;
      pauseBeforeWord=null;sync();return;
    }
  }
  if($("guide").open || $("score-dialog").open)return;
  if(keyDirs[k]){e.preventDefault();if(!e.repeat)game.steer(keyDirs[k]);}
  else if(k===" " && (game.state==="playing" || e.target.tagName!=="BUTTON")){e.preventDefault();if(!e.repeat)game.cut();}
  else if(k==="p" && ["playing","paused"].includes(game.state)){e.preventDefault();if(!e.repeat){const before=game.state;act();pauseBeforeWord=before;}}
  else if(k==="Enter" && e.target.tagName!=="BUTTON"){e.preventDefault();if(!e.repeat)act();}
});
document.querySelectorAll("[data-dir]").forEach(b=>b.onpointerdown=e=>{e.preventDefault();game.steer(b.dataset.dir);});
$("touch-gap").onpointerdown=e=>{e.preventDefault();game.cut();};
let touchOrigin=null;
canvas.onpointerdown=e=>{
  if(game.scheme==="first" || !e.isPrimary)return;
  touchOrigin=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);
};
function swipe(e){
  if(!touchOrigin || !e.isPrimary)return;
  const dx=e.clientX-touchOrigin[0],dy=e.clientY-touchOrigin[1];
  if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;
  touchOrigin=null;
  game.steer(Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up"));
}
canvas.onpointermove=swipe;
canvas.onpointerup=e=>{if(e.isPrimary){swipe(e);touchOrigin=null;}};
canvas.onpointercancel=e=>{if(e.isPrimary)touchOrigin=null;};
document.addEventListener("visibilitychange",()=>{if(document.hidden){pauseBeforeWord=null;if(game.state==="playing"){game.state="paused";sync();}}});
$("expand").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$("expand").lastElementChild.textContent="Fullscreen unavailable";}};
document.addEventListener("fullscreenchange",()=>{$("expand").lastElementChild.textContent=document.fullscreenElement?"Exit fullscreen":"Fullscreen";});
if(!document.fullscreenEnabled)$("expand").hidden=true;

let W=0,H=0,scale=1,px,py,ox,oy;
function resize(){
  W=canvas.clientWidth;H=canvas.clientHeight;if(!W||!H)return;
  scale=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*scale);canvas.height=Math.round(H*scale);
  ox=W<600?18:Math.max(48,W*.065);oy=W<600?19:21;px=(W-2*ox)/12;py=(H-2*oy)/5;
  boardCache=null;
}
const xy=p=>[ox+p[0]*px,oy+p[1]*py];
function point(id){const n=game.nodes.get(id);return xy([n.x,n.y]);}
const demo=new Set();
for(const [x,y,ex,ey] of [[1,5,3,5],[3,5,3,4],[3,4,2,4],[2,4,2,2],[2,2,5,2]]){
  let a=x,b=y;const dx=Math.sign(ex-x),dy=Math.sign(ey-y);
  while(a!==ex||b!==ey){demo.add(Circuit.railId(a+","+b,(a+dx)+","+(b+dy)));a+=dx;b+=dy;}
}
function rails(){
  const c=document.createElement("canvas");c.width=canvas.width;c.height=canvas.height;
  const g=c.getContext("2d");g.scale(scale,scale);
  // Short etched traces sit under the luminous, traversable rails.
  g.lineWidth=.8;g.strokeStyle="#423252";g.fillStyle="#513a62";g.globalAlpha=.52;
  for(let row=0;row<5;row++)for(let col=0;col<12;col++){
    if((col*7+row*3)%5!==0)continue;
    const x=ox+(col+.20)*px,y=oy+(row+.52)*py,s=Math.min(px/38,py/35);
    for(let k=0;k<3;k++){
      const yy=y+k*3*s;g.beginPath();g.moveTo(x,yy);g.lineTo(x+8*s,yy);g.lineTo(x+12*s,yy-4*s);g.lineTo(x+(19+k)*s,yy-4*s);g.stroke();
      g.fillRect(x+(19+k)*s,yy-5*s,2*s,2*s);
    }
  }
  g.globalAlpha=1;
  // Faint etched registration marks along the edge of the phosphor display.
  g.fillStyle="#a894c52d";for(let x=16;x<W-15;x+=12){g.fillRect(x,6,1,2);g.fillRect(x,H-7,1,2);}
  const lit=game.state==="ready"?demo:game.traced;
  const passive=new Path2D(),active=new Path2D(),activeNodes=new Set();let broken;
  for(const r of game.rails.values()){
    const a=point(r.a),b=point(r.b);if(r.id===game.gap?.id){broken=[a,b];continue;}
    const on=lit.has(r.id),p=on?active:passive;p.moveTo(...a);p.lineTo(...b);
    if(on){activeNodes.add(r.a);activeNodes.add(r.b);}
  }
  const weight=W<600?.75:1;
  g.lineCap="round";g.lineJoin="round";
  function stroke(p,color,width,glow=0){g.strokeStyle=color;g.lineWidth=width*weight;g.shadowColor=color;g.shadowBlur=glow;g.stroke(p);g.shadowBlur=0;}
  stroke(passive,"#53377e",7,7);stroke(passive,"#ab86eb",3.4);stroke(passive,"#d4baff",.9);
  stroke(active,"#1f968e",8,13);stroke(active,"#59f6e3",4.4,5);stroke(active,"#c6fff4",1.4);
  for(const n of game.nodes.values()){
    const exits=Object.keys(n.exits),joint=exits.length>2,corner=exits.length===2 && !(n.exits.left&&n.exits.right) && !(n.exits.up&&n.exits.down);
    if(!joint && !corner)continue;
    const [x,y]=point(n.id),on=activeNodes.has(n.id),r=(joint?4:2.7)*weight;
    g.fillStyle=on?"#2ca99b":"#725599";g.fillRect(x-r,y-r,2*r,2*r);
    g.fillStyle=on?"#bdfff4":"#e1ceff";g.fillRect(x-r/2,y-r/2,r,r);
  }
  if(broken){
    const [a,b]=broken;g.setLineDash([3,6]);g.strokeStyle="#ff82a5";g.lineWidth=1;g.beginPath();g.moveTo(...a);g.lineTo(...b);g.stroke();g.setLineDash([]);
    const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;g.fillStyle="#ff98b1";g.font="bold 14px monospace";g.fillText("×",mx-4,my+4);
  }
  boardCache=c;
}
function sprite(isShip,pos,dir,t){
  const [x,y]=xy(pos),unit=W<600?1.65:2.2;
  ctx.save();ctx.translate(x,y);ctx.imageSmoothingEnabled=false;
  if(isShip){
    ctx.rotate({right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2}[dir]);
    if(!reduced){
      const flame=4+Math.sin(t*10)*2;ctx.fillStyle="#2ceede55";ctx.fillRect(-19*unit,-1.5*unit,12*unit,3*unit);
      ctx.fillStyle="#67fbea";ctx.fillRect((-8-flame)*unit,-unit,flame*unit,2*unit);
    }
    ctx.shadowColor="#2efee5";ctx.shadowBlur=8;
    ctx.drawImage(runnerSprite,-7.5*unit,-5.5*unit,runnerSprite.width*unit,runnerSprite.height*unit);
  }else{
    ctx.shadowColor="#ff378f";ctx.shadowBlur=8;
    ctx.drawImage(seekerSprite,-6*unit,-5*unit,seekerSprite.width*unit,seekerSprite.height*unit);
  }
  ctx.restore();
}
function frame(now){
  const dt=Math.min(.05,(now-(prevTime||now))/1000);prevTime=now;
  if(!document.hidden){
    elapsed+=dt;if(!$("guide").open)game.step(dt);
    if(W>0 && H>0){
      if(!boardCache)rails();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(boardCache,0,0);ctx.setTransform(scale,0,0,scale,0,0);
      const ready=game.state==="ready";
      if(!ready && game.player.to){
        const from=point(game.reversing?game.player.to:game.player.at),to=xy(game.pos(game.player));
        ctx.save();ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(...to);ctx.strokeStyle="#7fffe9";ctx.lineWidth=W<600?3:4;ctx.shadowBlur=8;ctx.shadowColor="#3affdf";ctx.stroke();ctx.restore();
      }
      const playerPos=game.pos(game.player),decay=Math.exp(-30*dt);
      for(let axis=0;axis<2;axis++){game.visualOffset[axis]*=decay;playerPos[axis]+=game.visualOffset[axis];}
      sprite(true,ready?[5,2]:playerPos,ready?"right":game.player.dir,elapsed);
      sprite(false,ready?[10.5,3]:game.pos(game.seeker),game.seeker.dir,elapsed);
      for(const s of bursts){s.age+=dt;const [x,y]=xy(s.p);ctx.globalAlpha=Math.max(0,1-s.age/.5);ctx.fillStyle=s.color;ctx.fillRect(x+s.dx*s.age,y+s.dy*s.age,2,2);}
      ctx.globalAlpha=1;bursts=bursts.filter(s=>s.age<.5);
    }
  }
  requestAnimationFrame(frame);
}
new ResizeObserver(resize).observe(canvas);resize();showScheme();sync();updateSound();requestAnimationFrame(frame);
