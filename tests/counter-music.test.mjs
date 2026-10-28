import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../transition/counter/music.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function player({ blocked = false, loading = false } = {}) {
    const audios = [];
    const gains = [];
    const frames = new Map();
    const timers = new Map();
    const navigations = [];
    let id = 0;
    const document = Object.assign(new EventTarget(), { hidden: false,
        currentScript: { src: 'https://blackdoor.test/transition/counter/music.js' },
        documentElement: { classList: { contains: () => loading } } });
    const back = Object.assign(new EventTarget(), { href: 'https://blackdoor.test/transition/transition.html' });
    document.querySelector = () => back;
    class Audio extends EventTarget {
        constructor(src) {
            super();
            Object.assign(this, { src, currentTime: 0, duration: 60, ended: false, paused: true });
            audios.push(this);
        }
        async play() {
            if (blocked) throw new Error('Autoplay denied');
            this.paused = false;
        }
        pause() { this.paused = true; }
    }
    class AudioContext {
        currentTime = 0;
        destination = {};
        async resume() { if (blocked) throw new Error('Gesture required'); }
        createGain() {
            const node = { connect() {}, gain: { value: 0, cancelAndHoldAtTime() {},
                linearRampToValueAtTime(value) { this.value = value; },
                setTargetAtTime(value) { this.value = value; } } };
            gains.push(node);
            return node;
        }
        createMediaElementSource() { return { connect() {} }; }
    }
    const window = Object.assign(new EventTarget(), { AudioContext, location: { assign: url => navigations.push(url) } });
    vm.runInNewContext(source, { document, window, Audio, URL,
        requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
        cancelAnimationFrame: key => frames.delete(key),
        setTimeout: callback => { timers.set(++id, callback); return id; },
        clearTimeout: key => timers.delete(key) });
    return { audios, gains, document, window, back, navigations,
        allow() { blocked = false; },
        ready() { loading = false; document.dispatchEvent(new Event('counter:ready')); },
        tick() { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn()); },
        flushTimers() { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); } };
}

test('waits for page reveal and retries blocked autoplay on a gesture', async () => {
    const p = player({ blocked: true, loading: true });
    await settle();
    assert.ok(p.audios.every(audio => audio.paused));
    p.ready();
    await settle();
    assert.ok(p.audios.every(audio => audio.paused));
    p.allow();
    p.document.dispatchEvent(new Event('pointerdown'));
    await settle();
    assert.equal(p.audios[0].paused, false);
    assert.equal(p.gains[0].gain.value, .32);
});

test('overlaps the next copy before the tail ends and repeats across several loops', async () => {
    const p = player();
    await settle();
    for (let lap = 0; lap < 3; lap++) {
        const outgoing = lap % 2;
        const next = 1 - outgoing;
        p.audios[outgoing].currentTime = 56;
        p.tick();
        await settle();
        assert.ok(p.audios.every(audio => !audio.paused), 'both copies play during the overlap');
        p.audios[outgoing].currentTime = 57.98;
        p.audios[next].currentTime = 1.98;
        p.tick();
        assert.ok(Math.abs(p.gains[1].gain.value ** 2 + p.gains[2].gain.value ** 2 - 1) < 1e-8);
        p.audios[outgoing].currentTime = 59.96;
        p.audios[next].currentTime = 3.96;
        p.tick();
        assert.equal(p.audios[outgoing].paused, true);
        assert.equal(p.audios[next].paused, false);
        assert.equal(p.gains[next + 1].gain.value, 1);
    }
});

test('handles an ended event arriving before the overlap can finish', async () => {
    const p = player();
    await settle();
    p.audios[0].currentTime = 60;
    p.audios[0].ended = true;
    p.audios[0].dispatchEvent(new Event('ended'));
    await settle();
    p.tick();
    assert.equal(p.audios[1].paused, false);
    assert.equal(p.gains[2].gain.value, 1, 'new copy remains audible after late startup');
});

test('pauses while hidden, resumes, and cleans up on pagehide and bfcache restore', async () => {
    const p = player();
    await settle();
    p.audios[0].currentTime = 20;
    p.document.hidden = true;
    p.document.dispatchEvent(new Event('visibilitychange'));
    p.flushTimers();
    assert.ok(p.audios.every(audio => audio.paused));
    p.document.hidden = false;
    p.document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    assert.equal(p.audios[0].paused, false);
    assert.equal(p.audios[0].currentTime, 20);
    p.window.dispatchEvent(new Event('pagehide'));
    assert.ok(p.audios.every(audio => audio.paused));
    p.window.dispatchEvent(new Event('pageshow'));
    await settle();
    assert.equal(p.audios[0].paused, false);
});

test('the return link fades out before navigating with the captured URL', async () => {
    const p = player();
    await settle();
    const click = Object.assign(new Event('click', { cancelable: true }), { button: 0 });
    p.back.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true);
    assert.equal(p.navigations.length, 0);
    p.flushTimers();
    assert.deepEqual(p.navigations, [p.back.href]);
    assert.ok(p.audios.every(audio => audio.paused));
});

test('resuming a hidden overlap promotes the incoming copy if the tail already ended', async () => {
    const p = player();
    await settle();
    p.audios[0].currentTime = 59.8;
    p.tick();
    await settle();
    p.document.hidden = true;
    p.document.dispatchEvent(new Event('visibilitychange'));
    p.audios[0].currentTime = 60;
    p.audios[0].ended = true;
    p.flushTimers();
    p.document.hidden = false;
    p.document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    assert.equal(p.audios[0].paused, true);
    assert.equal(p.audios[1].paused, false);
    assert.equal(p.gains[2].gain.value, 1);
});
