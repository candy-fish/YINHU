import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createJourneyClock, readJourney, ENTRY_KEY, trackAt, seededRandom, smooth } from '../transition/mind/entry-journey-state.js';

function run(clock, seconds) {
    let state;
    for (let i=0;i<Math.round(seconds*20);i++) state=clock.advance(.05);
    return state;
}

test('mist and grace appear before a slow tree is ready', () => {
    const clock=createJourneyClock();
    const state=run(clock,120);
    assert.equal(state.waiting,true);
    assert.equal(state.mist,1);assert.equal(state.grace,1);assert.equal(state.tree,0);assert.equal(state.done,false);
    clock.settle();
    const tree=run(clock,1.5);
    assert.ok(tree.tree>0&&tree.tree<1);assert.equal(tree.mist,1);assert.equal(tree.grace,1);
    assert.equal(run(clock,3).done,true);
});

test('cached trees preserve vines, mist, grace and tree reveal order', () => {
    const clock=createJourneyClock();clock.settle();
    const vines=run(clock,2);assert.ok(vines.vines>0);assert.equal(vines.mist,0);
    const mist=run(clock,2.5);assert.ok(mist.mist>0);assert.equal(mist.grace,0);assert.equal(mist.tree,0);
    const grace=run(clock,5.5);assert.equal(grace.mist,1);assert.equal(grace.grace,1);assert.equal(grace.tree,0);
    const tree=run(clock,1.5);assert.ok(tree.tree>0&&tree.tree<1);
    assert.equal(run(clock,2).done,true);
});

test('reduced motion shortens the sequence while still waiting for the actual tree', () => {
    const clock=createJourneyClock({reducedMotion:true});
    assert.equal(run(clock,30).tree,0);
    clock.settle();assert.equal(run(clock,4).done,true);
});

test('a handoff is single use, bounds checked and expires instead of replaying on reload', () => {
    const values=new Map();
    const storage={getItem:k=>values.get(k),removeItem:k=>values.delete(k)};
    values.set(ENTRY_KEY,JSON.stringify({created:100,x:.8,y:.4,radius:.08}));
    assert.deepEqual(readJourney(storage,200),{x:.8,y:.4,radius:.08});
    assert.equal(readJourney(storage,201),null);
    for(const value of [{created:100,x:1,y:1,radius:.1},{created:41000,x:1,y:1,radius:.1},{created:40000,x:'NaN',y:1,radius:.1}]) {
        values.set(ENTRY_KEY,JSON.stringify(value));assert.equal(readJourney(storage,40000),null);
    }
    assert.equal(readJourney({getItem(){throw Error('blocked');}},100),null);
});

test('the rider track is continuous across a long load with no wrapping camera jumps', () => {
    let last=trackAt(0);
    for(let distance=.05;distance<2000;distance+=.05){
        const current=trackAt(distance);
        assert.ok(Math.hypot(current.x-last.x,current.y-last.y)<.04);
        last=current;
    }
});

const launcher=await readFile(new URL('../transition/mind/entry-launch.js',import.meta.url),'utf8');
function createLauncher({blocked=false,reducedMotion=false}={}){
    const storage=new Map(),timers=[],children=[],classes=new Set(),listeners={},properties=new Map();
    let now=0;
    const window={
        matchMedia:()=>({matches:reducedMotion}),
        setTimeout:(fn,delay)=>{const timer={id:timers.length+1,fn,delay,at:now+delay,cancelled:false,fired:false};timers.push(timer);return timer.id;},
        clearTimeout:id=>{const timer=timers.find(timer=>timer.id===id);if(timer)timer.cancelled=true;},
        addEventListener:(name,fn)=>{listeners[name]=fn;}
    };
    const document={getElementById:()=>({getBoundingClientRect:()=>({left:20,top:10})}),
        createElement:()=>({style:{setProperty(){}},setAttribute(){}}),
        body:{appendChild:child=>children.push(child)},documentElement:{style:{setProperty:(key,value)=>properties.set(key,value)},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}},
        querySelector:()=>({remove:()=>children.pop()})};
    vm.runInNewContext(launcher,{window,document,innerWidth:1200,innerHeight:800,
        sessionStorage:{setItem:(k,v)=>{if(blocked)throw Error('denied');storage.set(k,v);}}});
    return {start:window.BlackDoorMindEntry.start,storage,timers,children,classes,listeners,properties,
        advance(milliseconds){now+=milliseconds;for(const timer of timers){if(!timer.cancelled&&!timer.fired&&timer.at<=now){timer.fired=true;timer.fn();}}}};
}
test('the silver edge reveals rainbow halfway before blackening, vanishing and navigating once',()=>{
    const page=createLauncher();let navigation=0;
    const options={x:940,y:310,radius:60,onNavigate:()=>navigation++};
    assert.equal(page.start(options),true);assert.equal(page.start(options),true);
    assert.equal(page.timers.length,1);assert.equal(navigation,0);
    const origin=JSON.parse(page.storage.get(ENTRY_KEY));
    assert.equal(origin.x,.8);assert.equal(origin.y,.40375);assert.equal(origin.radius,.07125);
    const duration=name=>parseFloat(page.properties.get(`--entry-${name}`));
    assert.equal(duration('rainbow-delay'),duration('wire-duration')/2);
    assert.ok(duration('blacken-delay')>=duration('wire-duration'));
    assert.ok(duration('wire-fade-delay')>=duration('blacken-delay')+duration('blacken-duration'));
    assert.ok(duration('scene-fade-delay')>=duration('blacken-delay'));
    assert.equal(page.timers[0].delay,1400);
    assert.ok(duration('wire-fade-delay')+duration('wire-fade-duration')<page.timers[0].delay);
    assert.ok(duration('scene-fade-delay')+duration('scene-fade-duration')<page.timers[0].delay);
    page.advance(1399);assert.equal(navigation,0);
    page.advance(1);assert.equal(navigation,1);
    page.advance(1400);assert.equal(navigation,1);
});
test('reduced motion scales every launch phase and navigation together',()=>{
    const normal=createLauncher(),reduced=createLauncher({reducedMotion:true});
    const options={x:940,y:310,radius:60,onNavigate(){}};
    normal.start(options);reduced.start(options);
    for(const [name,value] of normal.properties){
        assert.match(reduced.properties.get(name),/ms$/);
        assert.ok(Math.abs(parseFloat(reduced.properties.get(name))-parseFloat(value)*.58)<1e-9);
    }
    assert.equal(reduced.timers[0].delay,1400*.58);
});
test('browser back cancels pending navigation, clears the launch and permits a fresh pull',()=>{
    const page=createLauncher();let navigation=0;
    const options={x:940,y:310,radius:60,onNavigate:()=>navigation++};
    page.start(options);page.advance(500);
    page.listeners.pageshow({persisted:true});
    assert.equal(page.children.length,0);assert.equal(page.classes.has('mind-entry-launch'),false);
    assert.equal(page.timers[0].cancelled,true);
    page.advance(2000);assert.equal(navigation,0);
    assert.equal(page.start(options),true);assert.equal(page.timers.length,2);
    page.advance(1400);assert.equal(navigation,1);
});
test('blocked storage falls back to ordinary navigation without leaving a black overlay',()=>{
    const page=createLauncher({blocked:true});
    assert.equal(page.start({x:1,y:1,radius:1,onNavigate(){}}),false);
    assert.equal(page.children.length,0);assert.equal(page.timers.length,0);
    assert.equal(page.properties.size,0);assert.equal(page.classes.size,0);
});

const journeySource=await readFile(new URL('../transition/mind/entry-journey.js',import.meta.url),'utf8');
function createSceneHarness({canvasFailure=false}={}){
    const elements=[],classes=new Set(['mind-journey-pending']),vineStrokes=[],states=[];
    let nextFrame,now=0,finished=0,pathSegments=0;
    const context=new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),
        beginPath(){pathSegments=0;},lineTo(){pathSegments++;},
        stroke(){if(pathSegments>0)vineStrokes.push({color:context.strokeStyle,shadow:context.shadowColor});}
    },{get:(target,key)=>target[key]??(()=>{})});
    class Element {
        children=[];style={setProperty(){}};dataset={};listeners={};
        setAttribute(){} append(...children){this.children.push(...children);}
        appendChild(child){this.children.push(child);} prepend(child){this.children.unshift(child);}
        remove(){this.removed=true;} getContext(){return canvasFailure?null:context;}
        addEventListener(name,fn){this.listeners[name]=fn;}
    }
    const root={classList:{add:name=>classes.add(name),remove:(...names)=>names.forEach(name=>classes.delete(name))}};
    const document={documentElement:root,body:new Element(),createElement:()=>{const e=new Element();elements.push(e);return e;},
        addEventListener(){},removeEventListener(){},hidden:false};
    const storage=new Map([[ENTRY_KEY,JSON.stringify({created:Date.now(),x:.82,y:.4,radius:.08})]]);
    const window={sessionStorage:{getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},
        matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}};
    const scope={createJourneyClock,readJourney,seededRandom,smooth,trackAt,
        window,document,innerWidth:1200,innerHeight:800,devicePixelRatio:1,
        performance:{now:()=>now},requestAnimationFrame:fn=>{nextFrame=fn;return 1;},cancelAnimationFrame(){}};
    vm.runInNewContext(journeySource.replace(/^import .*;\r?\n/gm,'').replace('export function createMindJourney','function createMindJourney')+'\nglobalThis.createJourney=createMindJourney;',scope);
    const journey=scope.createJourney({onFrame:state=>states.push(state),onFinish(){finished++;}});
    return {journey,elements,classes,vineStrokes,states,get finished(){return finished;},advance(seconds){for(let i=0;i<Math.round(seconds*10);i++){now+=100;nextFrame(now);}}};
}

test('all growing vines keep a single shared color and glow through growth and edge recoil',()=>{
    const page=createSceneHarness();page.advance(2.5);
    assert.ok(page.vineStrokes.length>100);
    const colors=new Set(page.vineStrokes.map(stroke=>stroke.color));
    assert.equal(colors.size,1);
    for(const stroke of page.vineStrokes)assert.equal(stroke.shadow,stroke.color);
    page.journey.dispose();
});

test('dissolving vines overlap mist and grace before the final tree',async()=>{
    const page=createSceneHarness();page.advance(5.5);
    let state=page.states.at(-1);
    assert.ok(state.dissolve>0);assert.ok(state.mist>.5);assert.ok(state.grace>0);assert.equal(state.tree,0);
    assert.equal(page.elements.some(element=>element.className==='journey-status'),false);
    page.journey.progress({loaded:70,total:100});page.advance(20);
    state=page.states.at(-1);
    assert.equal(page.journey.active,true);assert.equal(state.mist,1);assert.equal(state.grace,1);assert.equal(state.tree,0);
    page.journey.ready();page.advance(1.5);
    assert.ok(page.states.at(-1).tree>0&&page.states.at(-1).tree<1);
    page.advance(2);await page.journey.finished;
    assert.equal(page.journey.active,false);assert.equal(page.classes.size,0);assert.equal(page.finished,1);
});

test('skipping and unavailable canvas restore the actual mind page',()=>{
    const page=createSceneHarness();
    const skip=page.elements.find(element=>element.className==='journey-skip');
    skip.listeners.click();page.journey.dispose();
    assert.equal(page.finished,1);assert.equal(page.classes.size,0);
    assert.equal(page.states.at(-1).mist,1);assert.equal(page.states.at(-1).grace,1);assert.equal(page.states.at(-1).tree,1);
    const fallback=createSceneHarness({canvasFailure:true});
    assert.equal(fallback.journey,null);assert.equal(fallback.classes.size,0);
});
