import { createThoughtRepository, openThoughtStorage, validateThought } from './thought-store.js';
import { createThoughtLinks } from './thought-links.js';
import { sharedCloudEnabled } from '../../src/api-url.js';

export function createCabinet({ onRecords, onReturn, onPick }) {
    const el = id => document.getElementById(id);
    const panel = el('thoughtCabinet');
    const form = el('thoughtForm');
    const links = createThoughtLinks({ stage: el('thoughtConstellation'), svg: el('thoughtLinks'), cards: el('thoughtCards'), portrait: el('mindPortrait') });
    const urls = new Map();
    let repository = null;
    let selectedId = null;
    let image = null;
    let pickedPosition = null;
    let imageVersion = 0;
    let imageBusy = false;
    let busy = false;
    let visible = false;
    let storageError = '';

    function announce(message, error = false) {
        el('cabinetStatus').textContent = message;
        el('cabinetStatus').classList.toggle('is-error', error);
    }
    function url(blob) {
        if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
        return urls.get(blob);
    }
    function releaseImages() {
        for (const value of urls.values()) URL.revokeObjectURL(value);
        urls.clear();
    }
    function showImage(container, blob, alt = '') {
        container.replaceChildren();
        if (blob) {
            const img = document.createElement('img');
            img.src = url(blob);
            img.alt = alt;
            container.append(img);
        } else if (container.id === 'uploadPreview') {
            const ornament = document.createElement('span');
            ornament.textContent = '✧';
            ornament.setAttribute('aria-hidden', 'true');
            container.append(ornament);
        }
    }
    function updateButtons() {
        el('thoughtFields').disabled = busy || !repository;
        el('saveThought').disabled = busy || imageBusy || !repository;
        el('saveThought').querySelector('.button-label').textContent = busy ? 'SAVING…' : 'SAVE';
        el('saveThought').querySelector('.button-icon').hidden = busy;
        el('equipThought').disabled = busy || !repository || !selectedId;
    }
    function render() {
        if (!visible) return;
        releaseImages();
        showImage(el('uploadPreview'), image, '待保存的思维图片');
        el('removeImage').hidden = !image;
        const records = repository?.records || [];
        const equippedCount = records.filter(record => record.equipped).length;
        el('thoughtCount').textContent = `${String(records.length).padStart(2, '0')} | ${String(equippedCount).padStart(2, '0')}`;
        el('thoughtCount').setAttribute('aria-label', `${records.length} 条思维，${equippedCount} 条已装备`);
        el('collectionEmpty').hidden = records.length > 0;
        const cards = el('thoughtCards');
        const cardScrollTop = cards.scrollTop;
        cards.replaceChildren();
        for (const record of records) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'thought-card';
            button.classList.toggle('is-equipped', record.equipped);
            button.setAttribute('aria-pressed', String(record.id === selectedId));
            button.setAttribute('aria-label', `${record.name}${record.equipped ? '，已装备' : '，未装备'}`);
            const frame = document.createElement('span');
            frame.className = 'thought-diamond';
            showImage(frame, record.image);
            const title = document.createElement('span');
            title.className = 'thought-card-name';
            title.textContent = record.name;
            const caption = document.createElement('span');
            caption.className = 'thought-card-caption';
            caption.append(title);
            if (record.equipped) {
                const state = document.createElement('span');
                state.className = 'thought-card-state';
                state.textContent = '◆';
                state.setAttribute('aria-hidden', 'true');
                title.append(state);
            }
            button.append(frame, caption);
            button.addEventListener('click', () => {
                selectedId = record.id;
                render();
                // Restore focus after replacing the selected card's DOM.
                cards.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
            });
            cards.append(button);
        }
        cards.scrollTop = cardScrollTop;
        links.refresh();
        const selected = records.find(record => record.id === selectedId);
        showImage(el('detailImage'), selected?.image, selected?.name || '');
        el('detailTitle').textContent = selected?.name || '';
        el('detailState').textContent = selected ? (selected.equipped ? '◆ 已装备 | EQUIPPED' : '◇ 未装备 | UNEQUIPPED') : '尚未选择';
        el('detailCoordinates').textContent = selected ? ['x', 'y', 'z'].map(axis => `${axis.toUpperCase()} ${selected.position[axis].toFixed(2)}`).join(' | ') : '';
        el('detailDescription').textContent = selected?.description || '';
        el('equipThought').querySelector('.button-label').textContent = selected?.equipped ? 'UNEQUIP' : 'EQUIP';
        el('equipThought').querySelector('.button-icon').textContent = selected?.equipped ? '−' : '◇';
        updateButtons();
    }

    el('returnToTree').addEventListener('click', onReturn);
    el('pickPoint').addEventListener('click', onPick);
    el('removeImage').addEventListener('click', () => {
        imageVersion += 1;
        imageBusy = false;
        image = null;
        el('thoughtImage').value = '';
        render();
    });
    el('thoughtImage').addEventListener('change', async event => {
        const file = event.target.files[0];
        const version = ++imageVersion;
        image = null;
        imageBusy = Boolean(file);
        render();
        if (!file) return;
        let decodingUrl;
        try {
            validateThought({ name: 'image', position: { x: 0, y: 0, z: 0 }, image: file });
            decodingUrl = URL.createObjectURL(file);
            const probe = new Image();
            probe.src = decodingUrl;
            await probe.decode();
            if (version !== imageVersion) return;
            image = file;
            announce('');
        } catch (error) {
            if (version !== imageVersion) return;
            event.target.value = '';
            announce(error.message.startsWith('请选择') ? error.message : '图片无法解码，请选择有效的图片。', true);
        } finally {
            if (decodingUrl) URL.revokeObjectURL(decodingUrl);
            if (version === imageVersion) { imageBusy = false; render(); }
        }
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!repository || busy || imageBusy || !form.reportValidity()) return;
        if (!pickedPosition) {
            announce('请先从树上取点。', true);
            el('pickPoint').focus();
            return;
        }
        busy = true;
        updateButtons();
        try {
            const saved = await repository.add({ name: form.elements.name.value,
                description: form.elements.description.value, position: pickedPosition, image });
            selectedId = saved.id;
            imageVersion += 1;
            image = null;
            form.reset();
            pickedPosition = null;
            onRecords(repository.records);
            announce('');
        } catch (error) {
            announce(`保存失败：${error.message} 输入内容已保留。`, true);
        } finally { busy = false; render(); }
    });
    el('equipThought').addEventListener('click', async () => {
        if (!repository || !selectedId || busy) return;
        const selected = repository.records.find(record => record.id === selectedId);
        busy = true;
        updateButtons();
        try {
            await repository.setEquipped(selected.id, !selected.equipped);
            onRecords(repository.records);
            announce('');
        } catch (error) { announce(`装备状态未保存：${error.message}`, true); }
        finally { busy = false; render(); }
    });

    updateButtons();
    announce(sharedCloudEnabled() ? '正在读取共享思维…' : '正在读取本地思维…');
    openThoughtStorage().then(async storage => {
        const next = createThoughtRepository(storage);
        await next.load();
        repository = next;
        selectedId = repository.records[0]?.id || null;
        onRecords(repository.records);
        announce('');
        updateButtons();
        render();
    }).catch(error => {
        storageError = sharedCloudEnabled() ? `共享存储暂时不可用：${error.message} 请稍后刷新重试。` : `本地存储不可用：${error.message} 请允许此站点保存浏览器数据后刷新。`;
        announce(storageError, true);
        updateButtons();
    });
    let refreshing = false;
    async function refreshShared() {
        if (!sharedCloudEnabled() || !repository || busy || refreshing || document.hidden) return;
        refreshing = true;
        try {
            await repository.load();
            if (selectedId && !repository.records.some(record => record.id === selectedId)) selectedId = null;
            onRecords(repository.records);
            storageError = ''; render();
        } catch (error) { announce('共享刷新失败：' + error.message, true); }
        finally { refreshing = false; }
    }
    const sharedTimer = sharedCloudEnabled() ? setInterval(refreshShared, 8000) : null;
    window.addEventListener('focus', refreshShared);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshShared(); });
    window.addEventListener('pagehide', event => {
        if (!event.persisted && sharedTimer) clearInterval(sharedTimer);
        releaseImages(); links.setVisible(false);
    });
    window.addEventListener('pageshow', () => { if (visible) { links.setVisible(true); render(); } });
    return {
        setVisible(value) {
            visible = value;
            panel.hidden = !value;
            links.setVisible(value);
            if (value) {
                render();
                if (storageError) announce(storageError, true);
                el('cabinetTitle').focus({ preventScroll: true });
            } else {
                releaseImages();
                panel.querySelectorAll('img[src^="blob:"]').forEach(img => img.removeAttribute('src'));
            }
        },
        setPosition(point) {
            pickedPosition = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, point[axis]]));
            for (const axis of ['x', 'y', 'z']) form.elements[axis].value = Number(point[axis].toFixed(4));
            announce('');
            form.elements.x.focus();
        }
    };
}
