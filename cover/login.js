(() => {
    const form = document.querySelector('.login');
    const input = form.querySelector('input');
    let unlocked = false;

    function unlock() {
        if (unlocked || input.value !== '567') return false;
        unlocked = true;
        input.value = '';
        input.blur();
        form.remove();
        document.documentElement.classList.remove('cover-locked');
        window.dispatchEvent(new Event('blackdoor:unlocked'));
        return true;
    }

    input.addEventListener('input', () => {
        input.removeAttribute('aria-invalid');
        unlock();
    });

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!unlock()) {
            input.setAttribute('aria-invalid', 'true');
            input.select();
        }
    });
})();
