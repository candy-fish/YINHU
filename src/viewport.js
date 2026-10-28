// Scene sizing follows the layout viewport. Only dialogs follow the keyboard's
// visual viewport, so opening an input does not refit or jump the 3D scene.
const root = document.documentElement;
function updateViewport() {
    const viewport = window.visualViewport;
    const zoomed = viewport && Math.abs(viewport.scale - 1) > 0.01;
    root.style.setProperty('--scene-height', `${window.innerHeight}px`);
    root.style.setProperty('--visible-height', `${viewport && !zoomed ? viewport.height : window.innerHeight}px`);
    root.style.setProperty('--visible-top', `${viewport && !zoomed ? viewport.offsetTop : 0}px`);
}
updateViewport();
window.addEventListener('resize', updateViewport, { passive: true });
window.visualViewport?.addEventListener('resize', updateViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', updateViewport, { passive: true });
