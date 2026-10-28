(() => {
    'use strict';

    // Stream two copies instead of decoding the ten-minute song into memory.
    // The incoming copy overlaps the tail, avoiding media-element loop gaps.
    const source = new URL('assets/ancient-egypt-theme.mp3', document.currentScript.src).href;
    const overlap = 4;
    const volume = .32;
    const tracks = [new Audio(source), new Audio(source)];
    for (const track of tracks) track.preload = 'auto';
    let context;
    let master;
    let gains;
    let active = 0;
    let incoming = null;
    let preparing = false;
    let starting = false;
    let playing = false;
    let frame = 0;
    let pauseTimer = 0;
    let generation = 0;
    let leaving = false;

    function connect() {
        if (context) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = 0;
        master.connect(context.destination);
        gains = tracks.map(track => {
            const gain = context.createGain();
            gain.gain.value = 0;
            context.createMediaElementSource(track).connect(gain);
            gain.connect(master);
            return gain;
        });
        gains[active].gain.value = 1;
    }

    function fadeTo(value, seconds) {
        if (!master) return;
        const now = context.currentTime;
        master.gain.cancelAndHoldAtTime(now);
        master.gain.linearRampToValueAtTime(value, now + seconds);
    }

    function endOf(track) {
        return track.duration - .04;
    }

    async function beginOverlap() {
        if (preparing || incoming !== null) return;
        preparing = true;
        const token = generation;
        const next = 1 - active;
        tracks[next].currentTime = 0;
        gains[next].gain.value = 0;
        try {
            await tracks[next].play();
            if (token !== generation) return;
            incoming = { index: next, start: tracks[active].currentTime,
                length: Math.max(.05, endOf(tracks[active]) - tracks[active].currentTime) };
        } catch {
            // Keep the current copy playing; the next timeupdate can retry.
        } finally {
            if (token !== generation) tracks[next].pause();
            preparing = false;
        }
    }

    function update() {
        if (!playing) return;
        const current = tracks[active];
        if (incoming) {
            const progress = Math.min(1, Math.max(0, (current.currentTime - incoming.start) / incoming.length));
            gains[active].gain.setTargetAtTime(Math.cos(progress * Math.PI / 2), context.currentTime, .015);
            gains[incoming.index].gain.setTargetAtTime(Math.sin(progress * Math.PI / 2), context.currentTime, .015);
            if (progress >= 1 || current.ended) {
                gains[active].gain.setTargetAtTime(0, context.currentTime, .015);
                current.pause();
                current.currentTime = 0;
                active = incoming.index;
                gains[active].gain.setTargetAtTime(1, context.currentTime, .015);
                incoming = null;
            }
        } else if (Number.isFinite(current.duration) && endOf(current) - current.currentTime <= overlap) {
            void beginOverlap();
        }
    }

    function tick() {
        update();
        frame = playing ? requestAnimationFrame(tick) : 0;
    }

    async function start() {
        if (starting || playing || leaving || document.hidden ||
            document.documentElement.classList.contains('is-loading')) return;
        starting = true;
        clearTimeout(pauseTimer);
        const token = generation;
        try {
            connect();
            // The outgoing copy may have ended during the short hide fade.
            if (tracks[active].ended && incoming) {
                tracks[active].pause();
                tracks[active].currentTime = 0;
                gains[active].gain.setTargetAtTime(0, context.currentTime, .015);
                active = incoming.index;
                incoming = null;
                gains[active].gain.setTargetAtTime(1, context.currentTime, .015);
            }
            // Both calls happen in the gesture handler, before awaiting either.
            // A blocked autoplay attempt is retried by the first user gesture.
            await Promise.all([context.resume(), tracks[active].play(),
                ...(incoming ? [tracks[incoming.index].play()] : [])]);
            if (token !== generation || document.hidden || leaving) return;
            playing = true;
            fadeTo(volume, .8);
            if (!frame) frame = requestAnimationFrame(tick);
        } catch {
            tracks.forEach(track => track.pause());
        } finally {
            if (token !== generation) tracks.forEach(track => track.pause());
            starting = false;
        }
    }

    function pause(fade = .2) {
        generation++;
        playing = false;
        cancelAnimationFrame(frame);
        frame = 0;
        clearTimeout(pauseTimer);
        fadeTo(0, fade);
        const stop = () => tracks.forEach(track => track.pause());
        if (fade) pauseTimer = setTimeout(stop, fade * 1000);
        else stop();
    }

    for (const track of tracks) {
        track.addEventListener('timeupdate', update);
        track.addEventListener('ended', update);
    }
    document.addEventListener('counter:ready', start);
    document.addEventListener('pointerdown', start, { passive: true });
    document.addEventListener('keydown', start);
    document.addEventListener('visibilitychange', () => document.hidden ? pause() : void start());
    window.addEventListener('pagehide', () => { leaving = true; pause(0); });
    window.addEventListener('pageshow', () => { leaving = false; void start(); });
    document.querySelector('.counter-back')?.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (!playing && !starting) return;
        event.preventDefault();
        if (leaving) return;
        leaving = true;
        pause(.25);
        const destination = event.currentTarget.href;
        setTimeout(() => window.location.assign(destination), 250);
    });
    if (!document.documentElement.classList.contains('is-loading')) void start();
})();
