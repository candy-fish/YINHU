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
                assert.strictEqual(a,previous);
            }
        });
        assert.strictEqual(stairs.segments[0][0],stairs.start);
        assert.strictEqual(stairs.segments.at(-1)[1],stairs.top);
        assert.ok(stairs.top[0] > stairs.start[0] && stairs.top[1] < stairs.start[1]);
        assert.ok(stairs.door.y + stairs.door.height <= stairs.top[1] - 12);
        assert.ok(Math.abs(stairs.door.x + stairs.door.width / 2 - (stairs.top[0] + stairs.landing[0]) / 2) < 1e-8);
        assert.ok(stairs.door.y > 0 && stairs.door.x + stairs.door.width < width);
        assert.ok(stairs.landing[0] > stairs.door.x + stairs.door.width);
    }
});

test('adjacent chasing pairs overlap near arrival, while each pair arrives before melting', () => {
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
    let sawOverlap=false;
    for(let time=0;time<JOURNEY.door;time+=.007) {
        const active=Array.from({length:48},(_,i)=>sampleFlight(origin,stairs.segments[Math.floor(i/2)],i,time))
            .map((state,i)=>({state,i})).filter(({state})=>state.progress>0&&state.morph<1);
        assert.ok(active.length<=4);
        const groups=[...new Set(active.map(({i})=>Math.floor(i/2)))];
        assert.ok(groups.length<=2);
        if(groups.length===2) { sawOverlap=true;assert.equal(groups[1]-groups[0],1); }
    }
    assert.ok(sawOverlap);
    for(let group=0;group<23;group++) {
        const nextLaunch=JOURNEY.release+(group+1)*JOURNEY.pair;
        const previous=sampleFlight(origin,stairs.segments[group],group*2+1,nextLaunch);
        assert.ok(previous.progress>.9 && previous.progress<1);
        assert.equal(previous.morph,0);
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

test('asymmetric shard tips settle onto exact half-edges and the finished stairs use one joined stroke',()=>{
    const strokes=[];
    let vertices=[];
    const context=new Proxy({
        createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),
        beginPath(){vertices=[];},moveTo(x,y){vertices.push([x,y]);},lineTo(x,y){vertices.push([x,y]);},
        stroke(){strokes.push({vertices:vertices.slice(),color:this.strokeStyle,join:this.lineJoin});}
    },{get:(object,key)=>object[key]??(()=>{}),set:(object,key,value)=>{object[key]=value;return true;}});
    const shards=Array.from({length:48},()=>({outline:[[90,570],[99,562],[110,570],[99,578]],fills:[]}));
    const stairs=createStairway(1280,720);
    const firstEnd=JOURNEY.release+JOURNEY.follow+JOURNEY.swim+JOURNEY.melt;
    paintJourney(context,1280,720,shards,firstEnd-1e-7);
    const melting=strokes.filter(stroke=>stroke.color==='rgb(197,217,81)');
    assert.equal(melting.length,2);
    melting.forEach(({vertices},i)=>{
        for(const [tip,fraction]of [[0,i ? 0 : .5],[2,i ? .5 : 1]]) {
            const expected=stairs.segments[0][0].map((value,axis)=>value+(stairs.segments[0][1][axis]-value)*fraction);
            assert.ok(Math.hypot(vertices[tip][0]-expected[0],vertices[tip][1]-expected[1])<1e-7);
        }
    });
    strokes.length=0;
    const ready=JOURNEY.release+23*JOURNEY.pair+JOURNEY.follow+JOURNEY.swim+JOURNEY.melt;
    paintJourney(context,1280,720,shards,ready+.001);
    const settled=strokes.filter(stroke=>stroke.color==='#C5D951');
    assert.equal(settled.length,1);
    assert.equal(settled[0].join,'miter');
    assert.deepEqual(settled[0].vertices,[stairs.start,...stairs.segments.map(segment=>segment[1])]);
    strokes.length=0;
    paintJourney(context,1280,720,shards,JOURNEY.eyes-.05);
    const frame=strokes.find(stroke=>stroke.color==='#C5D951' && stroke.vertices.length===5);
    assert.ok(frame,'the floating door has its own closed frame');
    assert.deepEqual(frame.vertices[0],frame.vertices.at(-1));
    assert.ok(frame.vertices.every(([,y])=>y<stairs.top[1]-12));
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
    const gradient=(...args)=>{check(...args);return {addColorStop:check};};
    const context=new Proxy({createRadialGradient:gradient,createLinearGradient:gradient},
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
test('only the final animation blackout waits for model readiness; direct visits and reloads stay visible', () => {
    for(const age of [100,20000,-100,null,'blocked']) {
        const values=new Map(age===null?[]:[[ARRIVAL_KEY,String(Date.now()-age)]]),classes=new Set();
        const frames=[],timers=[],body={inert:false},listeners=new Map();
        const scope={sessionStorage:{getItem:key=>{if(age==='blocked')throw Error('denied');return values.get(key);},removeItem:key=>values.delete(key)},
            document:{body,addEventListener:(name,fn)=>listeners.set(name,fn),documentElement:{classList:{add:(...names)=>names.forEach(name=>classes.add(name)),
                remove:(...names)=>names.forEach(name=>classes.delete(name))}}},
            window:{},requestAnimationFrame:fn=>frames.push(fn),setTimeout:fn=>timers.push(fn)};
        vm.runInNewContext(arrival,scope);
        if(age!=='blocked')assert.equal(values.has(ARRIVAL_KEY),false);
        if(age!==100) {
            assert.equal(classes.size,0);assert.equal(body.inert,false);
            assert.equal(scope.window.BlackDoorImagesArrival,undefined);
            continue;
        }
        assert.equal(classes.has('images-arriving'),true);
        assert.equal(classes.has('images-reveal'),false);
        listeners.get('DOMContentLoaded')();
        assert.equal(body.inert,true);
        assert.equal(frames.length,0,'loading never starts a timed reveal');
        scope.window.BlackDoorImagesArrival.ready();
        assert.equal(classes.has('images-reveal'),false);
        frames.shift()();assert.equal(classes.has('images-reveal'),false);
        frames.shift()();assert.equal(classes.has('images-reveal'),true);
        assert.equal(body.inert,false);
        scope.window.BlackDoorImagesArrival.ready();assert.equal(frames.length,0);
        timers.shift()();assert.equal(classes.size,0);
    }
});

test('failed models keep the scene black and offer retry and return instead of a partial reveal',()=>{
    const classes=new Set(),children=[];
    class Element {
        handlers={};children=[];
        setAttribute(){}addEventListener(name,fn){this.handlers[name]=fn;}
        append(...elements){this.children.push(...elements);}focus(){this.focused=true;}
    }
    let reloads=0,retryToken=null;
    const listeners=new Map();
    const scope={sessionStorage:{getItem:()=>String(Date.now()),removeItem(){},setItem(key,value){retryToken=[key,value];}},window:{location:{reload(){reloads++;}}},
        document:{body:{inert:true,append:element=>children.push(element)},
            addEventListener:(name,fn)=>listeners.set(name,fn),
            documentElement:{classList:{add:name=>classes.add(name)}},
            querySelector:()=>children.find(element=>element.className==='images-load-error'),createElement:()=>new Element()}};
    vm.runInNewContext(arrival,scope);
    scope.window.BlackDoorImagesArrival.fail();scope.window.BlackDoorImagesArrival.fail();
    assert.equal(children.length,1);assert.equal(classes.has('images-reveal'),false);
    assert.equal(scope.document.body.inert,false);
    listeners.get('DOMContentLoaded')();assert.equal(scope.document.body.inert,false);
    const [,retry,back]=children[0].children;
    assert.equal(retry.focused,true);assert.equal(back.href,'../transition.html');
    retry.handlers.click();assert.equal(reloads,1);assert.equal(retryToken[0],ARRIVAL_KEY);
    assert.ok(Date.now()-Number(retryToken[1])<1000);
});

const launcher = (await readFile(new URL('../transition/images-journey.js',import.meta.url),'utf8')).replace(/^export /gm,'');
function launcherHarness({reduced=false,blockedStorage=false}={}) {
    const listeners=new Map(),windowListeners=new Map(),queue=new Map(),navigation=[],storage=new Map();
    let now=0,nextId=0,resets=0;
    const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})},
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
