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
    let revealed = false, failed = false;
    document.addEventListener('DOMContentLoaded', () => {
        if (!revealed && !failed) document.body.inert = true;
    }, { once: true });
    window.BlackDoorImagesArrival = {
        ready() {
            if (revealed) return;
            revealed = true;
            // Models/textures have already rendered; allow the posed scene to paint behind black.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                root.classList.add('images-reveal');
                document.body.inert = false;
                setTimeout(() => root.classList.remove('images-arriving', 'images-reveal'), 650);
            }));
        },
        fail() {
            if (revealed || document.querySelector('.images-load-error')) return;
            failed = true;
            const message = document.createElement('div');
            message.className = 'images-load-error'; message.setAttribute('role', 'alert');
            const text = document.createElement('p'); text.textContent = 'The deer and fish could not load.';
            const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry';
            retry.addEventListener('click', () => {
                try { sessionStorage.setItem(key, String(Date.now())); } catch { /* Reload still retries without storage. */ }
                window.location.reload();
            });
            const back = document.createElement('a'); back.href = '../transition.html'; back.textContent = 'Back';
            message.append(text, retry, back); document.body.append(message);
            document.body.inert = false; retry.focus();
        }
    };
})();
