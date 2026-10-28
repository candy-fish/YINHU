import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { ARRIVAL_KEY, JOURNEY, createStairway, orderShards, sampleFlight, journeyPhase, paintJourney } from '../transition/images-journey.js';

test('each pair becomes one connected edge and the door stays on-screen across phone and desktop layouts', () => {
    for (const [width, height] of [[320,568], [390,844], [1280,720], [1920,1080], [667,375]]) {
        const stairs = createStairway(width, height);
        assert.equal(stairs.segments.length, 24);
        stairs.segments.forEach(([a,b], i) => {
            for (const [x,y] of [a,b]) assert.ok(x >= 0 && x <= width && y >= 0 && y <= height);
            if (i) {
                const previous = stairs.segments[i-1][1];
                assert.ok(Math.hypot(a[0]-previous[0],a[1]-previous[1]) < 1e-8);
            }
        });
        assert.ok(stairs.top[0] > stairs.start[0] && stairs.top[1] < stairs.start[1]);
        assert.equal(stairs.door.y + stairs.door.height, stairs.top[1]);
        assert.ok(stairs.door.y > 0 && stairs.door.x + stairs.door.width < width);
        assert.ok(stairs.landing[0] > stairs.door.x + stairs.door.width);
    }
});

test('only one chasing pair can be in flight or melting, and every pair waits to arrive before melting', () => {
    const origin = [120,580], stairs = createStairway(1280,720);
    for (let i=0;i<48;i++) {
        const group = Math.floor(i/2), segment = stairs.segments[group];
        const release = JOURNEY.release + group * JOURNEY.pair + i%2 * JOURNEY.follow;
        assert.deepEqual(sampleFlight(origin,segment,i,release).position,origin);
        assert.ok(sampleFlight(origin,segment,i,release).progress<1e-12);
        assert.ok(sampleFlight(origin,segment,i,release+.02).progress>0);
        const arrival = sampleFlight(origin,segment,i,release+JOURNEY.swim+1e-8);
        assert.equal(arrival.morph<1e-10,true);
        const fraction = i%2 ? .25 : .75;
        assert.deepEqual(arrival.position,segment[0].map((a,axis)=>a+(segment[1][axis]-a)*fraction));
        const almost = sampleFlight(origin,segment,i,release+JOURNEY.swim-.0001);
        assert.ok(Math.hypot(almost.position[0]-arrival.position[0],almost.position[1]-arrival.position[1])<.01);
        const melted=sampleFlight(origin,segment,i,JOURNEY.release+group*JOURNEY.pair+JOURNEY.follow+JOURNEY.swim+JOURNEY.melt+1e-8);
        assert.equal(melted.morph,1);
    }
    for(let time=0;time<JOURNEY.door;time+=.007) {
        const active=Array.from({length:48},(_,i)=>sampleFlight(origin,stairs.segments[Math.floor(i/2)],i,time))
            .map((state,i)=>({state,i})).filter(({state})=>state.progress>0&&state.morph<1);
        assert.ok(active.length<=2);
        assert.ok(active.length<2||Math.floor(active[0].i/2)===Math.floor(active[1].i/2));
    }
});

test('horizontal pairs arrive from below, vertical pairs from above, and the follower stays behind in time',()=>{
    const origin=[160,580],stairs=createStairway(1280,720);
    for(let group=0;group<24;group++) {
        const segment=stairs.segments[group],i=group*2;
        const t=JOURNEY.release+group*JOURNEY.pair+JOURNEY.swim*.88;
        const leader=sampleFlight(origin,segment,i,t,720),follower=sampleFlight(origin,segment,i+1,t,720);
        const target=segment[0].map((a,axis)=>a+(segment[1][axis]-a)*.75);
        assert.ok(leader.progress>follower.progress);
        assert.ok(group%2 ? leader.position[1]<target[1] : leader.position[1]>target[1]);
        assert.equal(leader.morph,0);
    }
});

test('source pairs alternate between the lower and upper halves without duplicating a shard',()=>{
    const shards=Array.from({length:48},(_,i)=>({id:i,row:i%4,sector:i%12,outline:[[0,i],[1,i],[2,i],[1,i+1]]}));
    const ordered=orderShards(shards);
    assert.equal(new Set(ordered.map(shard=>shard.id)).size,48);
    ordered.forEach((shard,i)=>assert.ok(Math.floor(i/2)%2 ? shard.id<24 : shard.id>=24));
});

test('the upright doorway stays in the scene and all edges use the timeline road width',()=>{
    for(const [width,height]of [[390,844],[1280,720],[1920,1080]]) {
        const stairs=createStairway(width,height),door=stairs.door;
        assert.ok(door.x>0 && door.x+door.width<width);
        assert.ok(door.y>0 && door.y+door.height<height);
    }
    assert.ok(Math.abs(createStairway(1280,720).roadWidth-6*370/650)<1e-9);
    assert.ok(Math.abs(createStairway(390,844).roadWidth-6*486/650)<1e-9);
});

test('the door follows the last pair and solid eyes pulse once before a direct cut to held black', () => {
    assert.ok(JOURNEY.release + 23 * JOURNEY.pair + JOURNEY.follow + JOURNEY.swim + JOURNEY.melt < JOURNEY.door);
    assert.equal(journeyPhase(JOURNEY.door).door,0);
    assert.equal(journeyPhase(JOURNEY.eyes).door,1);
    assert.equal(journeyPhase(JOURNEY.eyes).eyes,0);
    assert.ok(journeyPhase(JOURNEY.eyes+.275).eyes>.99999);
    assert.equal(journeyPhase(JOURNEY.blackout).eyes,0);
    assert.equal(journeyPhase(JOURNEY.blackout-.001).black,0);
    assert.equal(journeyPhase(JOURNEY.blackout).black,1);
    assert.equal(journeyPhase(JOURNEY.end-.01).done,false);
    assert.equal(journeyPhase(JOURNEY.end).done,true);
    assert.equal(journeyPhase(.38,true).done,true);
    assert.equal(journeyPhase(.38,true).eyes,0);
});

test('all animated phases draw finite geometry, including narrow viewports and the reduced-motion path', () => {
    let operations=0;
    const check=(...args)=>{operations++;for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value));};
    const context=new Proxy({createRadialGradient:(...args)=>{check(...args);return {addColorStop:check};}},
        {get:(object,key)=>object[key]??check,set:(object,key,value)=>{object[key]=value;return true;}});
    const shards=Array.from({length:48},(_,i)=>({row:i%4,sector:i%12,
        outline:[[90,570],[100,562],[110,570],[100,578]],fills:[[[94,570],[100,566],[100,570]]]}));
    for(const [width,height] of [[390,844],[1280,720]]) {
        for(let time=0;time<=JOURNEY.end;time+=.1) paintJourney(context,width,height,shards,time);
    }
    assert.ok(operations>10000);
    assert.equal(paintJourney(context,390,844,shards,.4,true).done,true);
});

const arrival=await readFile(new URL('../transition/images/images-arrival.js',import.meta.url),'utf8');
test('arrival is single-use, expires, and direct visits do not receive a black overlay', () => {
    for(const age of [100,20000,-100]) {
        const values=new Map([[ARRIVAL_KEY,String(Date.now()-age)]]),classes=new Set();
        const scope={sessionStorage:{getItem:key=>values.get(key),removeItem:key=>values.delete(key)},
            document:{documentElement:{classList:{add:name=>classes.add(name)}}},
            window:{addEventListener(){}},Date,Number};
        vm.runInNewContext(arrival,scope);
        assert.equal(values.has(ARRIVAL_KEY),false);
        assert.equal(classes.has('images-arriving'),age===100);
        classes.clear();vm.runInNewContext(arrival,scope);
        assert.equal(classes.size,0);
    }
});

const launcher = (await readFile(new URL('../transition/images-journey.js',import.meta.url),'utf8')).replace(/^export /gm,'');
function launcherHarness({reduced=false,blockedStorage=false}={}) {
    const listeners=new Map(),windowListeners=new Map(),queue=new Map(),navigation=[],storage=new Map();
    let now=0,nextId=0,resets=0;
    const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}})},
        {get:(object,key)=>object[key]??(()=>{}),set:(object,key,value)=>{object[key]=value;return true;}});
    class Element {
        children=[];dataset={};inert=false;isConnected=true;handlers=new Map();
        classList={add(){},toggle(){}};
        setAttribute(){} getContext(){return ctx;}
        append(...children){this.children.push(...children);children.forEach(child=>child.parent=this);}
        remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);this.isConnected=false;}
        addEventListener(name,fn){this.handlers.set(name,fn);}
        focus(){doc.activeElement=this;}
    }
    const body=new Element(),entry=new Element(),previouslyInert=new Element();
    previouslyInert.inert=true;body.append(entry,previouslyInert);
    const doc={body,activeElement:entry,hidden:false,createElement:()=>new Element(),
        addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
    const motion={matches:reduced,addEventListener(name,fn){this.listener=fn;},removeEventListener(){this.listener=null;}};
    const win={matchMedia:()=>motion,location:{assign:href=>navigation.push(href)},
        addEventListener:(name,fn)=>windowListeners.set(name,fn),removeEventListener:name=>windowListeners.delete(name)};
    const scope={window:win,document:doc,innerWidth:1280,innerHeight:720,devicePixelRatio:1,
        sessionStorage:{setItem:(key,value)=>{if(blockedStorage)throw Error('denied');storage.set(key,value);}},
        requestAnimationFrame:fn=>{queue.set(++nextId,fn);return nextId;},cancelAnimationFrame:id=>queue.delete(id)};
    vm.runInNewContext(launcher,scope);
    const shards=Array.from({length:48},(_,i)=>({row:i%4,sector:i%12,
        outline:[[90,570],[100,562],[110,570],[100,578]],fills:[]}));
    return {doc,body,entry,previouslyInert,navigation,storage,listeners,windowListeners,queue,motion,
        start:()=>win.BlackDoorImagesJourney.start({href:'/transition/images/images.html',shards,onReset:()=>resets++}),
        get resets(){return resets;},
        advance(seconds){for(let i=0;i<seconds*20;i++){now+=50;const callbacks=[...queue.values()];queue.clear();callbacks.forEach(fn=>fn(now));}},
        escape(){listeners.get('keydown')?.({key:'Escape',preventDefault(){}});}
    };
}

test('duplicate launches navigate once without a skip control; blocked storage still permits entry',()=>{
    for(const blockedStorage of [false,true]) {
        const page=launcherHarness({blockedStorage});
        assert.equal(page.start(),true);assert.equal(page.start(),true);
        assert.equal(page.body.children.length,3);
        assert.equal(page.body.children.at(-1).children.length,2);
        assert.equal(page.doc.activeElement,page.body.children.at(-1));
        page.advance(1);assert.equal(page.navigation.length,0);
        page.advance(JOURNEY.end+1);page.advance(1);
        assert.deepEqual(page.navigation,['/transition/images/images.html']);
        assert.equal(page.storage.has(ARRIVAL_KEY),!blockedStorage);
    }
});

test('Escape and browser-back remove the overlay, preserve prior inert states and allow replay',()=>{
    const page=launcherHarness();page.start();page.advance(2);
    assert.equal(page.entry.inert,true);
    page.escape();page.advance(10);
    assert.equal(page.navigation.length,0);assert.equal(page.body.children.length,2);
    assert.equal(page.entry.inert,false);assert.equal(page.previouslyInert.inert,true);
    assert.equal(page.doc.activeElement,page.entry);assert.equal(page.queue.size,0);
    page.start();page.advance(JOURNEY.end+1);assert.equal(page.navigation.length,1);
    page.windowListeners.get('pageshow')({persisted:true});
    assert.equal(page.body.children.length,2);assert.equal(page.resets,2);
    page.start();page.advance(JOURNEY.end+1);assert.equal(page.navigation.length,2);
});

test('reduced motion uses a short black transition and backgrounding pauses the full sequence',()=>{
    const reduced=launcherHarness({reduced:true});reduced.start();reduced.advance(.3);
    assert.equal(reduced.navigation.length,0);reduced.advance(.2);assert.equal(reduced.navigation.length,1);
    const normal=launcherHarness();normal.start();normal.advance(2);
    normal.doc.hidden=true;normal.listeners.get('visibilitychange')();normal.advance(30);
    assert.equal(normal.navigation.length,0);
    normal.doc.hidden=false;normal.listeners.get('visibilitychange')();normal.advance(JOURNEY.end);
    assert.equal(normal.navigation.length,1);
});
