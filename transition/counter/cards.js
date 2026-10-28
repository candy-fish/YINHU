(() => {
    'use strict';

    const deck = document.querySelector('.interactive-deck');
    const status = document.getElementById('card-status');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const stacks = new Map();
    let gesture = null;

    function render(stack, announce = true) {
        const { button, image, layers, badge, name, count } = stack;
        button.dataset.count = String(count);
        button.classList.toggle('is-empty', count === 0);
        button.setAttribute('aria-label', count
            ? `${name}，当前 ${count} 张；点击增加，拖出页面删除一张`
            : `${name}，当前没有卡牌；点击重新添加`);
        badge.textContent = String(count);
        badge.hidden = count < 2;

        // Show a bounded sample of the back cards while retaining the exact quantity.
        const fragment = document.createDocumentFragment();
        for (let i = Math.min(5, count - 1); i >= 1; i--) {
            const layer = image.cloneNode();
            layer.className = 'stack-layer';
            layer.style.setProperty('--layer', i);
            layer.setAttribute('aria-hidden', 'true');
            fragment.append(layer);
        }
        layers.replaceChildren(fragment);
        if (announce) status.textContent = `${name}，${count} 张`;
    }

    function canRemove(event, drag) {
        const left = drag.rect.left + event.clientX - drag.x;
        const top = drag.rect.top + event.clientY - drag.y;
        const right = left + drag.rect.width;
        const bottom = top + drag.rect.height;
        const w = innerWidth;
        const h = innerHeight;
        // A small edge zone makes releasing at the screen edge possible on touch devices.
        return event.clientX <= 8 && left < 0 || event.clientX >= w - 8 && right > w ||
            event.clientY <= 8 && top < 0 || event.clientY >= h - 8 && bottom > h ||
            (left + right) / 2 < 0 || (left + right) / 2 > w ||
            (top + bottom) / 2 < 0 || (top + bottom) / 2 > h;
    }

    function move(event) {
        const drag = gesture;
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.preview && Math.hypot(dx, dy) < 8) return;

        if (!drag.preview) {
            drag.preview = drag.stack.image.cloneNode();
            drag.preview.className = 'dragged-card';
            drag.preview.setAttribute('aria-hidden', 'true');
            drag.preview.style.width = `${drag.rect.width}px`;
            drag.preview.style.height = `${drag.rect.height}px`;
            document.body.append(drag.preview);
            drag.stack.button.classList.add('is-dragging');
        }
        drag.preview.style.transform = `translate(${drag.rect.left + dx}px, ${drag.rect.top + dy}px)`;
        drag.removable = canRemove(event, drag);
        drag.preview.classList.toggle('is-removable', drag.removable);
    }

    function finish(event, cancelled = false) {
        const drag = gesture;
        if (!drag || event && event.pointerId !== drag.id) return;
        if (!cancelled && event) move(event);
        gesture = null;
        drag.stack.button.classList.remove('is-dragging');
        if (drag.stack.button.hasPointerCapture(drag.id)) drag.stack.button.releasePointerCapture(drag.id);
        if (!drag.preview) return;

        // Suppress the synthetic click after dragging; keyboard activation still works.
        drag.stack.suppressClick = true;
        if (!cancelled && drag.removable) {
            drag.stack.count = Math.max(0, drag.stack.count - 1);
            render(drag.stack);
        }
        drag.preview.remove();
    }

    for (const button of deck.querySelectorAll('.stack-card')) {
        const stack = {
            button, name: button.dataset.name, count: 1, suppressClick: false,
            image: button.querySelector('.stack-top'),
            layers: button.querySelector('.stack-layers'),
            badge: button.querySelector('.stack-count')
        };
        stacks.set(button, stack);
        render(stack, false);

        button.addEventListener('click', event => {
            if (stack.suppressClick && event.detail !== 0) {
                stack.suppressClick = false;
                return;
            }
            stack.count += 1;
            render(stack);
            if (!reducedMotion.matches) stack.layers.animate([
                { opacity: .55 }, { opacity: 1 }
            ], { duration: 140, easing: 'ease-out' });
        });

        button.addEventListener('pointerdown', event => {
            if (event.button !== 0 || !event.isPrimary || gesture) return;
            stack.suppressClick = false;
            if (!stack.count) return;
            gesture = {
                stack, id: event.pointerId, x: event.clientX, y: event.clientY,
                rect: button.getBoundingClientRect(), preview: null, removable: false
            };
            button.setPointerCapture(event.pointerId);
        });
        button.addEventListener('pointermove', move);
        button.addEventListener('pointerup', event => finish(event));
        button.addEventListener('pointercancel', event => finish(event, true));
        button.addEventListener('lostpointercapture', event => finish(event, true));
        button.addEventListener('keydown', event => {
            if (event.key === 'Escape') finish(null, true);
            if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
            // Keyboard users can remove a card without a dragging gesture.
            if ((event.key === 'Delete' || event.key === 'Backspace') && stack.count) {
                event.preventDefault();
                stack.count -= 1;
                render(stack);
            }
        });
        button.addEventListener('contextmenu', event => event.preventDefault());
    }

    window.addEventListener('blur', () => finish(null, true));
    window.addEventListener('resize', () => finish(null, true));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) finish(null, true);
    });
    window.addEventListener('pagehide', () => finish(null, true));
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        for (const stack of stacks.values()) {
            stack.count = 1;
            render(stack, false);
        }
    });
})();
