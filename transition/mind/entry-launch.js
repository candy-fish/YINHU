(() => {
    const key = 'blackdoor.mind.journey.v2';
    let entering = false;
    let navigationTimer = null;
    window.BlackDoorMindEntry = {
        start({ x, y, radius, onNavigate }) {
            if (entering) return true;
            const sphereY = y + radius * .05, sphereRadius = radius * .95;
            try {
                const bounds = document.getElementById('canvas-container').getBoundingClientRect();
                sessionStorage.setItem(key, JSON.stringify({ created: Date.now(),
                    x: (x + bounds.left) / innerWidth, y: (sphereY + bounds.top) / innerHeight,
                    radius: sphereRadius / Math.min(innerWidth, innerHeight) }));
            } catch { return false; }
            entering = true;
            const portal = document.createElement('div');
            portal.className = 'mind-entry-portal';
            portal.setAttribute('aria-hidden', 'true');
            const bounds = document.getElementById('canvas-container').getBoundingClientRect();
            portal.style.setProperty('--portal-x', `${x + bounds.left}px`);
            portal.style.setProperty('--portal-y', `${y + bounds.top}px`);
            portal.style.setProperty('--portal-size', `${radius * 2}px`);
            const speed = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? .58 : 1;
            // Trace the visible sphere's edge before replacing it with the seed.
            // The model bounds include its small suspension cap above the sphere.
            for (const [name, milliseconds] of Object.entries({
                'wire-duration': 920, 'rainbow-delay': 460, 'rainbow-duration': 880,
                'blacken-delay': 960, 'blacken-duration': 220,
                'wire-fade-delay': 1180, 'wire-fade-duration': 160,
                'scene-fade-delay': 960, 'scene-fade-duration': 380
            })) document.documentElement.style.setProperty(`--entry-${name}`, `${milliseconds * speed}ms`);
            portal.innerHTML = `<span class="mind-entry-refraction"></span>
            <svg class="mind-entry-wire" viewBox="0 0 100 100" fill="none" aria-hidden="true">
                <defs>
                    <linearGradient id="entry-silver" x1="12" y1="8" x2="87" y2="91" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#626e79"/><stop offset=".2" stop-color="#f1f6fa"/>
                        <stop offset=".4" stop-color="#8d9ca8"/><stop offset=".56" stop-color="#fff"/>
                        <stop offset=".76" stop-color="#a9b4bf"/><stop offset="1" stop-color="#e6edf3"/>
                    </linearGradient>
                    <linearGradient id="entry-prism" x1="6" y1="20" x2="91" y2="84" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#9bbaff"/><stop offset=".22" stop-color="#ba9aef"/>
                        <stop offset=".43" stop-color="#efa3ba"/><stop offset=".61" stop-color="#f2d2a0"/>
                        <stop offset=".8" stop-color="#b1dfba"/><stop offset="1" stop-color="#9acde8"/>
                    </linearGradient>
                </defs>
                <circle class="entry-prism-rim" cx="50" cy="52.5" r="47.5"/>
                <circle class="entry-wire-edge" cx="50" cy="52.5" r="47.5" pathLength="1" transform="rotate(-90 50 52.5)"/>
            </svg>`;
            document.body.appendChild(portal);
            document.documentElement.classList.add('mind-entry-launch');
            navigationTimer = window.setTimeout(() => { navigationTimer = null; onNavigate(); }, 1400 * speed);
            return true;
        }
    };
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        window.clearTimeout(navigationTimer);
        navigationTimer = null;
        entering = false;
        document.documentElement.classList.remove('mind-entry-launch');
        document.querySelector('.mind-entry-portal')?.remove();
    });
})();
