(() => {
    'use strict';

    const cards = [...document.querySelectorAll('.effect-card')];
    const status = document.getElementById('card-status');
    const counts = new Map(cards.map(card => [card.dataset.effect, 0n]));
    let selected = null;

    function render() {
        const previous = document.body.dataset.cardEffect || null;
        for (const card of cards) {
            const effect = card.dataset.effect;
            const value = counts.get(effect).toString();
            card.dataset.count = value;
            card.querySelector('.stack-count').textContent = value;
            card.setAttribute('aria-pressed', String(selected === effect));
            card.setAttribute('aria-label', `${card.dataset.name}，累计 ${value} 次；${selected === effect ? '已激活，点击主按钮计数' : '点击激活效果，再点击主按钮计数'}`);
        }
        if (selected) document.body.dataset.cardEffect = selected;
        else delete document.body.dataset.cardEffect;
        if (previous !== selected) document.dispatchEvent(new CustomEvent('counter:effect', { detail: selected }));
    }

    for (const card of cards) {
        card.addEventListener('click', () => {
            selected = card.dataset.effect;
            render();
            status.textContent = `${card.dataset.name}已激活，下一次主按钮将同时计入总数和该卡牌次数。`;
        });
        card.addEventListener('keydown', event => {
            if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
        });
    }

    // Attribute only this page's successful main-button activations, never remote sync updates.
    document.addEventListener('counter:increment', () => {
        if (!selected) return;
        counts.set(selected, counts.get(selected) + 1n);
        render();
        const card = cards.find(candidate => candidate.dataset.effect === selected);
        status.textContent = `${card.dataset.name}，累计 ${counts.get(selected)} 次。`;
    });

    document.addEventListener('visibilitychange', () => {
        document.body.classList.toggle('effects-paused', document.hidden);
    });
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        selected = null;
        for (const effect of counts.keys()) counts.set(effect, 0n);
        render();
    });
    render();
})();
