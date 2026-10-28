(() => {
    'use strict';

    const root = document.documentElement;
    const started = performance.now();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let finished = false;
    root.classList.add('is-loading');

    function reveal() {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        root.classList.add('is-revealing');
        root.classList.remove('is-loading');
        document.dispatchEvent(new Event('counter:ready'));
        setTimeout(() => {
            const screen = document.querySelector('.loading-screen');
            if (screen) screen.hidden = true;
            root.classList.remove('is-revealing');
        }, reducedMotion.matches ? 0 : 360);
    }

    // A slow/broken asset must never leave the page trapped behind the loader.
    const deadline = setTimeout(reveal, 8000);
    const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

    async function prepare() {
        if (finished) return;
        const images = [...document.images].map(image => image.decode());
        const background = getComputedStyle(document.body, '::before').backgroundImage;
        const backgroundURL = background.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
        if (backgroundURL) {
            const image = new Image();
            image.src = backgroundURL;
            images.push(image.decode());
        }
        // Wait for visual assets, independently of the shared counter's network state.
        await Promise.allSettled([...images, document.fonts.ready]);
        const minimum = reducedMotion.matches ? 0 : 1100;
        await pause(Math.max(0, minimum - (performance.now() - started)));
        reveal();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { prepare().catch(reveal); }, { once: true });
    } else {
        prepare().catch(reveal);
    }
    window.addEventListener('pagehide', reveal, { once: true });
})();
