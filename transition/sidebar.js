(() => {
    'use strict';
    const link = document.getElementById('counterShortcut');
    const number = document.getElementById('honeyCount');
    const sidebar = document.querySelector('.transition-shortcuts');
    const reveal = sidebar.querySelector('.shortcut-reveal');
    let wasOpen = false;

    function setOpen(open) {
        sidebar.classList.toggle('is-open', open);
        reveal.setAttribute('aria-expanded', String(open));
        reveal.setAttribute('aria-label', open ? '收起工具入口' : '展开工具入口');
    }

    function close() {
        setOpen(false);
        if (sidebar.contains(document.activeElement)) document.activeElement.blur();
    }

    sidebar.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse') setOpen(true);
    });
    sidebar.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse' && !sidebar.contains(document.activeElement)) setOpen(false);
    });
    sidebar.addEventListener('focusin', () => setOpen(true));
    sidebar.addEventListener('focusout', event => {
        if (!sidebar.contains(event.relatedTarget)) setOpen(false);
    });
    reveal.addEventListener('pointerdown', () => { wasOpen = sidebar.classList.contains('is-open'); });
    reveal.addEventListener('click', event => {
        if (event.detail === 0 || matchMedia('(hover: hover)').matches) setOpen(true);
        else if (wasOpen) close();
        else setOpen(true);
    });
    document.addEventListener('pointerdown', event => {
        if (!sidebar.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') close();
    });
    window.addEventListener('pageshow', () => {
        setOpen(false);
        if (sidebar.contains(document.activeElement)) document.activeElement.blur();
    });
    globalThis.BlackDoorCounter.subscribe(state => {
        number.textContent = state.value;
        number.setAttribute('font-size', String(Math.min(20, 54 / (state.value.length * .64))));
        link.setAttribute('aria-label', `打开计数器，累计 ${state.value} 次${state.pending ? '，有点击等待同步' : ''}`);
        link.title = `计数器 · ${state.value}${state.error ? '（暂时无法同步）' : ''}`;
    });
})();
