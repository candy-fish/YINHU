(() => {
    const key = 'blackdoor.images.arrival.v1';
    let created;
    try {
        created = Number(sessionStorage.getItem(key));
        sessionStorage.removeItem(key);
    } catch { return; }
    const age = Date.now() - created;
    if (!created || !Number.isFinite(age) || age < 0 || age > 15000) return;
    const root = document.documentElement;
    root.classList.add('images-arriving');
    window.addEventListener('pageshow', () => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            root.classList.add('images-reveal');
            setTimeout(() => root.classList.remove('images-arriving', 'images-reveal'), 650);
        }));
    }, { once: true });
})();
