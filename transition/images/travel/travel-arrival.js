const outline = document.querySelector('.lunar-outline');
const doorFrame = outline.querySelector('.lunar-door-frame');
const stroke = outline.querySelector('.lunar-outline-stroke');

function resizeOutline() {
  const groundY = doorFrame.offsetHeight - 1;
  stroke.setAttribute('d', `M ${outline.clientWidth - 1} ${groundY} H 1 V 1 H ${doorFrame.offsetWidth - 1} V ${groundY}`);
}

resizeOutline();
window.addEventListener('resize', resizeOutline);
const outlineReady = Promise.allSettled(stroke.getAnimations().map(animation => animation.finished));

import('../assets/travel-globe.bundle.js')
  .then(({ createGlobe }) => createGlobe(outline, outlineReady))
  .catch(error => {
    console.error('Travel globe could not load:', error);
    const canvas = document.getElementById('earth');
    canvas.hidden = true;
    canvas.setAttribute('aria-busy', 'false');
    document.getElementById('loadError').hidden = false;
  });
