import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from 'three';

const source = await readFile(new URL('../transition/mind/disco.js', import.meta.url), 'utf8');
const lightingSource = await readFile(new URL('../transition/mind/disco-lighting.js', import.meta.url), 'utf8');
const transitionHtml = await readFile(new URL('../transition/transition.html', import.meta.url), 'utf8');

function createDisco({ reducedMotion = false } = {}) {
    let now = 0;
    let nextFrame;
    let scene;
    let camera;
    let renderedBall;
    let renderCount = 0;
    let timerId = 0;
    const timers = new Map();
    const drawing = [];
    const lightColors = new Set();
    const gradient = { addColorStop(offset, color) { lightColors.add(color.split(',').slice(0, 3).join(',')); } };
    const context = Object.fromEntries(['setTransform', 'save', 'restore', 'translate', 'scale', 'rotate',
        'fillRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'arc'].map(method => [method, () => {}]));
    context.clearRect = () => { drawing.length = 0; lightColors.clear(); };
    context.translate = (...args) => { drawing.push(args); };
    context.createLinearGradient = () => gradient;
    context.createRadialGradient = (...args) => { drawing.push(args); return gradient; };
    class Element {
        constructor() {
            this.listeners = new Map();
            this.style = {};
            this.attributes = {};
            this.children = [];
            this.clientWidth = 1200;
            this.clientHeight = 800;
            const classes = new Set();
            this.classList = {
                add: name => classes.add(name),
                remove: name => classes.delete(name),
                contains: name => classes.has(name),
                toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
            };
        }
        setAttribute(key, value) { this.attributes[key] = value; }
        appendChild(child) { this.children.push(child); }
        closest() { return this.control ? this : null; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 800 }; }
        addEventListener(name, handler) {
            if (!this.listeners.has(name)) this.listeners.set(name, []);
            this.listeners.get(name).push(handler);
        }
        setPointerCapture(id) { this.capture = id; }
        hasPointerCapture(id) { return this.capture === id; }
        releasePointerCapture() { this.capture = null; }
        getContext() { return context; }
    }
    const nodes = Object.fromEntries(['canvas-container', 'discoRope', 'discoRopePath', 'discoRopeTextPath',
        'discoRopeEnd'].map(id => [id, new Element()]));
    const root = new Element();
    const window = new Element();
    window.location = { href: '' };
    window.matchMedia = query => ({ matches: query.includes('reduced-motion') ? reducedMotion : true });
    window.setTimeout = (fn, delay) => { timers.set(++timerId, { fn, time: now + delay }); return timerId; };
    window.clearTimeout = id => timers.delete(id);
    const document = new Element();
    document.documentElement = root;
    document.body = new Element();
    document.getElementById = id => nodes[id];
    document.createElement = () => new Element();
    vm.runInNewContext(lightingSource + '\n' + source, {
        window, document, Element, console, Math,
        performance: { now: () => now },
        requestAnimationFrame: callback => { nextFrame = callback; },
        ResizeObserver: class { observe() {} },
        THREE: {
            ...THREE,
            PMREMGenerator: class {
                fromEquirectangular() { return { texture: new THREE.Texture() }; }
                dispose() {}
            },
            WebGLRenderer: class {
                domElement = new Element();
                setClearColor() {}
                setPixelRatio() {}
                setSize() {}
                render(nextScene, nextCamera) {
                    scene = nextScene;
                    camera = nextCamera;
                    scene.updateMatrixWorld(true);
                    camera.updateMatrixWorld(true);
                    const carrier = scene.children.find(child => child.isGroup);
                    renderedBall = { x: carrier.position.x + 600, y: 400 - carrier.position.y };
                    renderCount++;
                }
            },
            GLTFLoader: class {
                load(path, complete) {
                    complete({ scene: new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial()) });
                }
            }
        }
    });
    function advance(seconds) {
        for (let step = 0; step < Math.ceil(seconds * 120); step++) {
            now += 1000 / 120;
            nextFrame(now);
            for (const [id, timer] of timers) {
                if (timer.time <= now) { timers.delete(id); timer.fn(); }
            }
        }
    }
    function emit(type, x, y, options = {}) {
        const event = { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0,
            target: nodes['canvas-container'].children[1], detail: 1, preventDefault() {}, ...options };
        for (const handler of window.listeners.get(type) || []) handler(event);
    }
    function position() {
        const carrier = scene.children.find(child => child.isGroup);
        return { x: carrier.position.x + 600, y: 400 - carrier.position.y };
    }
    advance(0.02);
    emit('pointermove', 984, 10);
    advance(4);
    return { advance, emit, position, root, window, nodes, scene, drawing, lightColors,
        lighting: document.body.children.find(child => child.id === 'disco-lighting'),
        get renderedBall() { return { ...renderedBall }; },
        get renderCount() { return renderCount; },
        get handle() { return nodes['canvas-container'].children[1]; } };
}

test('drag follows the pointer, bends the rope and releases into a damped swing without a click', () => {
    const disco = createDisco();
    const initial = disco.position();
    assert.equal(disco.handle.hidden, false);
    disco.emit('pointerdown', initial.x, initial.y);
    assert.ok(disco.root.classList.contains('is-dragging-disco-ball'));
    const originalRope = disco.nodes.discoRopePath.attributes.d;
    for (let i = 1; i <= 12; i++) {
        disco.advance(1 / 60);
        disco.emit('pointermove', initial.x - i * 12, initial.y - i * 6);
    }
    const held = disco.position();
    assert.ok(held.x < initial.x - 130);
    assert.notEqual(disco.nodes.discoRopePath.attributes.d, originalRope);
    disco.emit('pointerup', held.x, held.y);
    disco.emit('click', held.x, held.y);
    disco.emit('dblclick', held.x, held.y, { detail: 2 });
    assert.equal(disco.root.classList.contains('is-dragging-disco-ball'), false);
    assert.equal(disco.handle.capture, null);
    disco.advance(0.7);
    assert.equal(disco.handle.hidden, false, 'drag must not schedule single-click retraction');
    assert.equal(disco.window.location.href, '', 'drag must not trigger navigation');
    assert.ok(Math.hypot(disco.position().x - held.x, disco.position().y - held.y) > 30);
    const samples = [];
    for (let i = 0; i < 60; i++) {
        disco.advance(0.1);
        samples.push(disco.position().x - 984);
        assert.ok(Number.isFinite(disco.position().y));
    }
    assert.ok(samples.some(x => x < -10) && samples.some(x => x > 10), 'ball must swing across the anchor');
    disco.advance(25);
    assert.ok(Math.abs(disco.position().x - 984) < 10, 'air damping must settle the swing');
});

test('rope reach, other pointers and cancellation remain bounded during a drag', () => {
    const disco = createDisco();
    const initial = disco.position();
    disco.emit('pointerdown', initial.x, initial.y);
    disco.emit('pointermove', 50, 500, { pointerId: 2 });
    assert.deepEqual(disco.position(), initial);
    disco.advance(0.1);
    disco.emit('pointermove', -1000, 1800);
    const held = disco.position();
    assert.ok(Math.hypot(held.x - 984, held.y - 4) <= (96 + 64) * 1.18 + 0.01);
    disco.emit('pointerup', 0, 0, { pointerId: 2 });
    assert.ok(disco.root.classList.contains('is-dragging-disco-ball'));
    disco.emit('pointercancel', 0, 0);
    assert.equal(disco.root.classList.contains('is-dragging-disco-ball'), false);
    disco.advance(0.7);
    assert.equal(disco.handle.hidden, false);
    assert.ok(Number.isFinite(disco.position().x));
});

test('a short click still retracts and a double click still opens the mind page', () => {
    const disco = createDisco();
    const ball = disco.position();
    disco.emit('pointerdown', ball.x, ball.y);
    disco.emit('pointermove', ball.x + 2, ball.y + 1);
    disco.emit('pointerup', ball.x, ball.y);
    disco.emit('click', ball.x, ball.y);
    disco.advance(3);
    assert.equal(disco.handle.hidden, true);

    const second = createDisco();
    const target = second.position();
    second.emit('click', target.x, target.y);
    second.emit('dblclick', target.x, target.y, { detail: 2 });
    assert.equal(second.window.location.href, 'mind/mind.html');
});

test('mirror facets reflect the environment and the room light fades out with the ball', () => {
    const disco = createDisco();
    const tiles = disco.scene.getObjectByName('disco-mirror-tiles');
    assert.ok(tiles.isInstancedMesh && tiles.count > 1000);
    assert.equal(tiles.material.metalness, 1);
    assert.ok(disco.scene.environment.isTexture);
    assert.equal(disco.lighting.attributes['aria-hidden'], 'true');
    assert.ok(Number(disco.lighting.style.opacity) > 0.95);
    assert.ok(disco.drawing.some(([x, y]) => x > 1200 && y < 0), 'main light comes from above the upper-right corner');
    assert.ok(disco.lightColors.has('rgba(255,132,152') && disco.lightColors.has('rgba(118,192,255'),
        'the reflected fan includes warm and cool spectral colors');
    const before = JSON.stringify(disco.drawing);
    const ball = disco.position();
    disco.emit('pointerdown', ball.x, ball.y);
    disco.advance(0.1);
    disco.emit('pointermove', ball.x - 140, ball.y - 70);
    disco.advance(0.1);
    assert.notEqual(JSON.stringify(disco.drawing), before, 'light projections follow the dragged ball');
    disco.emit('pointerup', 0, 0);
    disco.advance(3);
    const settled = disco.position();
    disco.emit('click', settled.x, settled.y);
    disco.advance(5);
    assert.equal(disco.handle.hidden, true);
    assert.equal(Number(disco.lighting.style.opacity), 0);
    assert.equal(disco.root.classList.contains('is-disco-lit'), false);
});

test('reduced motion keeps reflected light still while the ball is held', () => {
    const disco = createDisco({ reducedMotion: true });
    const ball = disco.position();
    disco.emit('pointerdown', ball.x, ball.y);
    disco.advance(0.1);
    const before = JSON.stringify(disco.drawing);
    disco.advance(1);
    assert.equal(JSON.stringify(disco.drawing), before);
    disco.emit('pointerup', ball.x, ball.y);
});

test('the short rope ends at the rotating eyelet and reserves space after the two complete words', () => {
    assert.equal(transitionHtml.match(/id="discoRopeTextPath"[^>]*>([^<]*)<\/textPath>/)[1], 'HappyTown HappyTown');
    const disco = createDisco();
    const attachment = disco.scene.getObjectByName('disco-rope-attachment');
    const point = new THREE.Vector3();
    function checkConnection() {
        attachment.getWorldPosition(point);
        const path = disco.nodes.discoRopePath.attributes.d;
        const numbers = path.match(/-?\d+(?:\.\d+)?/g).map(Number);
        assert.ok(numbers[1] >= 0, 'the first word starts inside the viewport');
        assert.ok(Math.abs(numbers.at(-2) - (point.x + 600)) < 0.02);
        assert.ok(Math.abs(numbers.at(-1) - (400 - point.y)) < 0.02);
        assert.ok(Number(disco.nodes.discoRopeTextPath.attributes.textLength) > 60);
        assert.ok(Number(disco.nodes.discoRopeTextPath.attributes.textLength) < 150);
        const connector = disco.nodes.discoRopeEnd.attributes.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        assert.ok(Math.abs(connector.at(-2) - (point.x + 600)) < 0.001);
        assert.ok(Math.abs(connector.at(-1) - (400 - point.y)) < 0.001);
    }
    checkConnection();
    const ball = disco.position();
    assert.ok(ball.y < 190, 'two-word rope should hang much higher than the old long rope');
    disco.emit('pointerdown', ball.x, ball.y);
    disco.advance(0.1);
    disco.emit('pointermove', ball.x - 110, ball.y - 30);
    disco.advance(0.25);
    checkConnection();
    disco.emit('pointerup', 0, 0);
    for (let i = 0; i < 12; i++) { disco.advance(0.1); checkConnection(); }
});

test('only an intentional downward pull crosses the entrance threshold and navigates directly', () => {
    const disco=createDisco();
    const initial=disco.position();
    disco.emit('pointerdown',initial.x,initial.y);
    disco.advance(.1);
    disco.emit('pointermove',initial.x-100,initial.y-35);
    assert.equal(disco.window.location.href,'');
    disco.emit('pointermove',984,350);
    assert.equal(disco.window.location.href,'mind/mind.html');
    assert.equal(disco.handle.capture,null);
    assert.equal(disco.handle.hidden,true);
    disco.emit('pointermove',984,450);
    disco.emit('click',984,350);
    disco.emit('dblclick',984,350);
    assert.equal(disco.window.location.href,'mind/mind.html');
});

test('crossing the threshold between frames renders the ball at the entrance origin before freezing', () => {
    const disco=createDisco();
    const initial=disco.position();
    let origin,visibleAtLaunch;
    disco.window.BlackDoorMindEntry={start(options){
        origin={x:options.x,y:options.y};
        visibleAtLaunch=disco.renderedBall;
        return true;
    }};
    disco.emit('pointerdown',initial.x,initial.y);
    disco.advance(.1);
    disco.emit('pointermove',984,280);
    disco.advance(1/120);
    const previous=disco.renderedBall;
    const previousRenderCount=disco.renderCount;
    // No animation frame runs between this event and the launch hook.
    disco.emit('pointermove',984,350);
    assert.ok(origin);
    assert.ok(Math.hypot(origin.x-previous.x,origin.y-previous.y)>20);
    assert.deepEqual(visibleAtLaunch,origin,'the wire must wrap the last visible ball, not the previous frame');
    assert.equal(disco.renderCount,previousRenderCount+1);
    assert.equal(disco.window.location.href,'','the entrance hook owns the delayed navigation');
    disco.advance(.2);
    assert.deepEqual(disco.renderedBall,origin);
    assert.equal(disco.renderCount,previousRenderCount+1,'entering keeps the aligned frame frozen');
});

test('releasing below the entry threshold keeps the usual damped swing', () => {
    const disco=createDisco();
    const initial=disco.position();
    disco.emit('pointerdown',initial.x,initial.y);
    disco.advance(.1);
    disco.emit('pointermove',984,280);
    const held=disco.position();
    disco.emit('pointerup',984,280);
    disco.advance(1/120);
    assert.ok(disco.position().y>held.y-12, 'an incomplete pull must not snap to the original rope length');
    disco.advance(1);
    assert.equal(disco.window.location.href,'');
    assert.equal(disco.handle.hidden,false);
    assert.ok(disco.position().y<240);
});
