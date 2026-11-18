import { createJourneyClock, readJourney, seededRandom, smooth } from './entry-journey-state.js';

const VINE_GREEN = [130,147,120];
const VINE_GOLD = [244,195,113];
const colorAt = amount => `rgb(${VINE_GREEN.map((value,i)=>Math.round(value+(VINE_GOLD[i]-value)*amount)).join(',')})`;

function makeDustSprite() {
    const sprite=document.createElement('canvas');sprite.width=sprite.height=64;
    const context=sprite.getContext('2d');
    if(!context)return null;
    const glow=context.createRadialGradient(32,32,0,32,32,32);
    glow.addColorStop(0,'rgba(255,244,216,1)');
    glow.addColorStop(.2,'rgba(255,213,138,.72)');
    glow.addColorStop(.52,'rgba(244,195,113,.13)');
    glow.addColorStop(1,'rgba(244,195,113,0)');
    context.fillStyle=glow;context.fillRect(0,0,64,64);
    return sprite;
}

function vinePoint(width,height,origin,index,s,time,reducedMotion) {
    const x=origin.x*width,y=origin.y*height;
    const ends=[[0,0],[width*.3,0],[width*.73,0],[width,0],[width,height*.4],
        [width,height],[width*.65,height],[width*.22,height],[0,height],[0,height*.55],[0,height*.19]];
    const [ex,ey]=ends[index],dx=ex-x,dy=ey-y,length=Math.max(1,Math.hypot(dx,dy));
    const hit=.2+index*.052+1.72,after=Math.max(0,time-hit);
    const taut=smooth(hit,hit+.44,time);
    const snap=Math.sin(after*21)*Math.exp(-after*7)*(time>=hit?1:0);
    const wave=Math.sin(s*Math.PI)*(Math.sin(s*11+index+time*2.3)*.6+Math.sin(s*5-index)*.4);
    const bend=wave*(reducedMotion?18:54)*(1-taut)+snap*22*Math.sin(s*Math.PI);
    return {x:x+dx*s-dy/length*bend,y:y+dy*s+dx/length*bend};
}

function drawVines(context,width,height,origin,state,reducedMotion,grains,sprite) {
    context.clearRect(0,0,width,height);
    const time=Math.min(state.time,2.9),dissolve=state.dissolve;
    const radius=origin.radius*Math.min(width,height);
    context.save();
    context.globalAlpha=1-smooth(0,.55,dissolve);
    context.fillStyle='#010201';context.strokeStyle='#89937e55';context.lineWidth=.65;
    context.beginPath();context.arc(origin.x*width,origin.y*height,radius,0,Math.PI*2);context.fill();context.stroke();
    context.globalAlpha=1;
    for(let index=0;index<11;index++) {
        const start=.2+index*.052,growth=smooth(start,start+1.72,time);
        const taut=smooth(start+1.72,start+2.16,time);
        const tint=smooth(0,.55,dissolve);
        context.strokeStyle=colorAt(tint);context.shadowColor=context.strokeStyle;context.shadowBlur=2;
        context.lineWidth=(.22+smooth(.32,2.24,time)*(1.8+index%3*.45)*(1-taut*.7))*(1-dissolve*.45);
        context.globalAlpha=1-smooth(.2,1,dissolve);
        context.beginPath();
        let connected=false;
        for(let j=0;j<=80;j++) {
            const s=j/80*growth,point=vinePoint(width,height,origin,index,s,time,reducedMotion);
            // Softly break the line where its matching grains detach.
            const erosion=(Math.sin(j*12.9898+index*78.233)*43758.5453)%1;
            const gap=dissolve>0&&Math.abs(erosion)<dissolve*.94;
            if(gap){connected=false;continue;}
            if(connected)context.lineTo(point.x,point.y);else context.moveTo(point.x,point.y);
            connected=true;
        }
        context.stroke();
    }
    context.shadowBlur=0;
    // Grains gently separate from their own vine and disperse independently;
    // their fading can overlap the mist and grace without converging on them.
    context.globalCompositeOperation='lighter';
    for(const grain of grains) {
        const age=Math.max(0,state.time-grain.releaseAt);
        const released=smooth(grain.releaseAt,grain.releaseAt+.45,state.time);
        if(released<=0)continue;
        const alpha=released*(1-smooth(grain.life*.28,grain.life,age))*(.28+grain.seed*.36);
        if(alpha<.003)continue;
        const source=vinePoint(width,height,origin,grain.vine,grain.s,2.9,reducedMotion);
        const angle=Math.atan2(source.y-origin.y*height,source.x-origin.x*width)+grain.turn;
        const motion=reducedMotion ? .35 : 1;
        const easedAge=age-.35*(1-Math.exp(-age/.35));
        const distance=grain.speed*(1-Math.exp(-easedAge*.18))/.18*motion;
        const eddy=(Math.sin(age*.65+grain.phase)-Math.sin(grain.phase))*4*motion;
        const x=source.x+Math.cos(angle)*distance-Math.sin(angle)*eddy;
        const y=source.y+Math.sin(angle)*distance+Math.cos(angle)*eddy-age*.8*motion;
        const size=grain.size*(1+Math.sin(state.time*.65+grain.phase)*.12);
        context.globalAlpha=alpha;
        if(sprite)context.drawImage(sprite,x-size*3.8,y-size*3.8,size*7.6,size*7.6);
    }
    context.restore();
}

export function createMindJourney({onFrame=()=>{},onFinish=()=>{}}={}) {
    let origin;
    try{origin=readJourney(window.sessionStorage);}catch{}
    const root=document.documentElement;
    if(!origin){root.classList.remove('mind-journey-pending');return null;}
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wrapper=document.createElement('section');wrapper.className='mind-journey';
    wrapper.setAttribute('aria-label','进入思维阁');
    const veil=document.createElement('div');veil.className='journey-veil';
    const ink=document.createElement('canvas');
    const context=ink.getContext('2d');
    if(!context){root.classList.remove('mind-journey-pending');return null;}
    const skip=document.createElement('button');skip.className='journey-skip';skip.textContent='跳过';
    wrapper.append(veil,ink,skip);document.body.appendChild(wrapper);
    root.classList.add('mind-journey-active');
    const random=seededRandom(0x632ac),grains=[],sprite=makeDustSprite();
    for(let vine=0;vine<11;vine++)for(let i=0;i<(innerWidth<700?44:80);i++) {
        grains.push({vine,s:(i+random())/(innerWidth<700?44:80),releaseAt:2.85+random()*2.5,
            life:4.2+random()*1.2,speed:9+random()*12,turn:(random()-.5)*1.8,
            seed:random(),phase:random()*Math.PI*2,size:.65+random()*1.05});
    }
    const clock=createJourneyClock({reducedMotion});
    let active=true,frame=null,last=performance.now(),progress=0,resolveFinished;
    const finished=new Promise(resolve=>{resolveFinished=resolve;});
    function resize(){
        const ratio=Math.min(devicePixelRatio||1,1.4);
        ink.width=Math.round(innerWidth*ratio);ink.height=Math.round(innerHeight*ratio);
        context.setTransform(ratio,0,0,ratio,0,0);
    }
    function dispose(){
        if(!active)return;active=false;cancelAnimationFrame(frame);
        window.removeEventListener('resize',resize);window.removeEventListener('pagehide',dispose);
        document.removeEventListener('visibilitychange',visibility);document.removeEventListener('keydown',key);
        root.classList.remove('mind-journey-pending','mind-journey-active');wrapper.remove();
        onFrame({mist:1,grace:1,tree:1,done:true});resolveFinished();onFinish();
    }
    function key(event){if(event.key==='Escape'){event.preventDefault();dispose();}}
    function visibility(){
        cancelAnimationFrame(frame);frame=null;last=performance.now();
        if(!document.hidden&&active)frame=requestAnimationFrame(animate);
    }
    function animate(now){
        if(!active||document.hidden)return;
        const state=clock.advance(Math.min((now-last)/1000,.1));last=now;
        onFrame(state);
        if(state.done){dispose();return;}
        if(state.mist>0)root.classList.remove('mind-journey-pending');
        veil.style.opacity=String(1-smooth(3.6,6.3,state.time));
        wrapper.style.setProperty('--journey-shade',String(1-state.mist));
        drawVines(context,innerWidth,innerHeight,origin,state,reducedMotion,grains,sprite);
        wrapper.dataset.phase=state.tree>0?'tree':state.grace>0?'grace':state.mist>0?'mist':'vines';
        wrapper.dataset.loadProgress=String(Math.round(progress*100));
        frame=requestAnimationFrame(animate);
    }
    skip.addEventListener('click',dispose);document.addEventListener('keydown',key);
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('resize',resize,{passive:true});window.addEventListener('pagehide',dispose,{once:true});
    resize();frame=requestAnimationFrame(animate);
    return{get active(){return active;},finished,
        progress(event){if(event.total>0)progress=Math.max(progress,Math.min(.99,event.loaded/event.total));},
        ready(){progress=1;clock.settle();},fail(){clock.settle();},dispose};
}
