"use strict";
const Circuit = (() => {
  const directions = {right:[1,0], left:[-1,0], up:[0,-1], down:[0,1]};
  const names = ["Midnight grid", "Violet relay", "Ghost junction", "Afterburn", "Night drive", "Last light"];
  const key = (x,y) => x + "," + y;
  const railId = (a,b) => [a,b].sort().join("/");

  function build(level) {
    const nodes = new Map(), rails = new Map();
    function node(x,y) {
      const id = key(x,y);
      if (!nodes.has(id)) nodes.set(id,{id,x,y,exits:{}});
      return nodes.get(id);
    }
    function line(x,y,endX,endY) {
      const dx = Math.sign(endX-x), dy = Math.sign(endY-y);
      while (x!==endX || y!==endY) {
        const a=node(x,y), b=node(x+dx,y+dy), id=railId(a.id,b.id);
        a.exits[dx===1?"right":dx===-1?"left":dy===1?"down":"up"]=b.id;
        b.exits[dx===1?"left":dx===-1?"right":dy===1?"up":"down"]=a.id;
        rails.set(id,{id,a:a.id,b:b.id}); x+=dx; y+=dy;
      }
    }
    // Stepped outer loop with shorter cross streets and continuous switchbacks.
    const outline=[[1,0],[11,0],[11,1],[12,1],[12,4],[11,4],[11,5],[1,5],[1,4],[0,4],[0,1],[1,1],[1,0]];
    for(let i=1;i<outline.length;i++) line(...outline[i-1],...outline[i]);
    const layout=(level-1)%3;
    if(layout===0){
      line(0,2,5,2);line(5,1,5,4);line(2,1,9,1);line(2,1,2,4);line(0,4,5,4);
      line(3,0,3,1);line(3,4,3,5);line(5,3,12,3);line(8,0,8,3);
      line(9,1,9,2);line(9,2,12,2);line(7,3,7,5);line(10,3,10,5);
    }else if(layout===1){
      line(0,2,12,2);line(0,3,4,3);line(4,0,4,4);line(2,4,10,4);
      line(2,2,2,5);line(6,2,6,5);line(9,0,9,4);line(7,1,11,1);line(7,1,7,2);line(10,4,10,5);
    }else{
      line(0,3,12,3);line(1,1,5,1);line(5,1,5,5);line(2,0,2,3);
      line(3,3,3,5);line(5,2,12,2);line(7,0,7,4);line(7,4,11,4);line(10,2,10,5);
    }
    return {nodes,rails};
  }
  function actor(id,dir) {return {at:id,to:null,t:0,dir};}
  class Game {
    constructor(event=()=>{}) {this.event=event;this.reset();}
    reset() {this.score=0;this.lives=3;this.level=1;this.load();this.state="ready";}
    load() {Object.assign(this,build(this.level));this.traced=new Set();this.spawn();}
    spawn() {
      this.player=actor("1,5","right");this.seeker=actor("11,0","left");
      this.queued=null;this.lastRail=null;this.gap=null;this.grace=1.4;
    }
    start() {
      if(this.state==="over") this.reset();
      if(this.state==="clear"){this.level++;this.load();}
      if(this.state==="caught") this.spawn();
      this.state="playing";this.event("start");
    }
    steer(dir) {if(this.state==="playing" && directions[dir]) this.queued=dir;}
    cut() {
      if(this.state!=="playing" || this.gap || !this.lastRail) return false;
      for(const a of [this.player,this.seeker]) if(a.to && railId(a.at,a.to)===this.lastRail) return false;
      this.gap={id:this.lastRail,time:3.6};this.event("gap");return true;
    }
    exit(at,dir) {
      const next=this.nodes.get(at).exits[dir];
      return next && railId(at,next)!==this.gap?.id ? next : null;
    }
    chase() {
      const goal=this.player.to || this.player.at, from=this.seeker.at;
      const queue=[[from,null]], seen=new Set([from]);
      for(let i=0;i<queue.length;i++){
        const [at,first]=queue[i];if(at===goal)return first;
        for(const dir of Object.keys(this.nodes.get(at).exits)){
          const next=this.exit(at,dir);
          if(next && !seen.has(next)){seen.add(next);queue.push([next,first||dir]);}
        }
      }
      return null;
    }
    move(a,distance,isPlayer) {
      while(distance>0 && this.state==="playing"){
        if(!a.to){
          let dir=a.dir;
          if(isPlayer){
            if(this.queued && this.exit(a.at,this.queued)){dir=this.queued;this.queued=null;}
          }else dir=this.chase();
          a.to=this.exit(a.at,dir);
          if(!a.to) return;
          a.dir=dir;
        }
        const step=Math.min(distance,1-a.t);a.t+=step;distance-=step;
        if(a.t>=1){
          const id=railId(a.at,a.to);a.at=a.to;a.to=null;a.t=0;
          if(isPlayer){
            this.lastRail=id;
            if(!this.traced.has(id)){
              this.traced.add(id);this.score+=10;this.event("rail");
              if(this.traced.size===this.rails.size){this.score+=100*this.level;this.state="clear";this.event("clear");}
            }
          }
        }
      }
    }
    pos(a) {
      const p=this.nodes.get(a.at), q=this.nodes.get(a.to) || p;
      return [p.x+(q.x-p.x)*a.t,p.y+(q.y-p.y)*a.t];
    }
    step(dt) {
      if(this.state!=="playing")return;
      if(this.gap){this.gap.time-=dt;if(this.gap.time<=0){this.gap=null;this.event("repair");}}
      this.grace=Math.max(0,this.grace-dt);
      this.move(this.player,dt*3.6,true);
      if(this.state!=="playing" || this.grace>0)return;
      this.move(this.seeker,dt*Math.min(3.25,2.02+.15*(this.level-1)),false);
      const p=this.pos(this.player),s=this.pos(this.seeker);
      if(Math.hypot(p[0]-s[0],p[1]-s[1])<.3){
        this.lives--;this.state=this.lives?"caught":"over";this.event("hit");
      }
    }
    get name(){return names[(this.level-1)%names.length];}
  }
  return {Game,railId};
})();
