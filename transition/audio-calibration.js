(() => {
    const sync = globalThis.YinhuAudioSync;
    const status = document.getElementById('save-status');

    for (const panel of document.querySelectorAll('[data-track]')) {
        const track = panel.dataset.track;
        const slider = panel.querySelector('input');
        const readout = panel.querySelector('output');
        const bound = sync.limit(track);
        slider.min = -bound;
        slider.max = bound;
        slider.value = sync.read(track);
        panel.querySelector('.track-tempo').textContent = `${sync.bpm[track]} BPM · ±${bound} ms`;

        function showValue() {
            const offset = Number(slider.value);
            const direction = offset < 0 ? '提前' : '延后';
            readout.textContent = offset ? `${direction} ${Math.abs(offset)} ms` : '0 ms';
            slider.setAttribute('aria-valuetext', offset ? readout.textContent : '原位置');
        }

        function save() {
            showValue();
            status.textContent = sync.write(track, Number(slider.value))
                ? '已保存，下次起播生效' : '当前浏览器无法保存设置';
        }

        showValue();
        slider.addEventListener('input', save);
        panel.querySelector('.reset').addEventListener('click', () => { slider.value = 0; save(); });
    }

    const preview = document.getElementById('preview');
    document.getElementById('reset-preview').addEventListener('click', () => {
        preview.contentWindow.location.replace(preview.src);
    });
})();
