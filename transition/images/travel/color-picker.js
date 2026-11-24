const clamp = value => Math.max(0, Math.min(1, value));

export function hsvToHex(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  s = clamp(s); v = clamp(v);
  const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
  const rgb = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h)];
  return '#' + rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
}

export function hexToHSV(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('请输入六位十六进制颜色，例如 #86CBB7。');
  const [r,g,b] = hex.slice(1).match(/../g).map(value => parseInt(value,16) / 255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  let h = d === 0 ? 0 : max === r ? ((g-b)/d)%6 : max === g ? (b-r)/d+2 : (r-g)/d+4;
  return { h: (h*60+360)%360, s: max === 0 ? 0 : d/max, v: max };
}

export function hslToHex(h, s, l) {
  l = clamp(l); s = clamp(s);
  const v = l + s * Math.min(l, 1-l);
  return hsvToHex(h, v === 0 ? 0 : 2*(1-l/v), v);
}

export function hexToHSL(hex) {
  const { h, s, v } = hexToHSV(hex), l = v*(1-s/2);
  return { h, s: l === 0 || l === 1 ? 0 : (v-l)/Math.min(l,1-l), l };
}

export function setupColorPicker({ initial, onChange }) {
  const hue = document.getElementById('colorHue'), gray = document.getElementById('colorGray');
  const saturation = document.getElementById('colorSaturation'), hex = document.getElementById('colorHex');
  const preview = document.getElementById('colorPreview'), eraser = document.getElementById('eraseColor');
  let state = hexToHSL(initial);
  for (let i=0; i<18; i++) {
    for (const [id,color] of [['hueBlocks',hslToHex(i*20,1,.5)],['grayBlocks',hslToHex(0,0,i/17)],['saturationBlocks',hslToHex(state.h,i/17,state.l)]]) {
      const block = document.createElement('i'); block.style.background = color; document.getElementById(id).append(block);
    }
  }
  function commit() {
    const color = hslToHex(state.h,state.s,state.l);
    hue.value = state.h; gray.value = state.l*100; saturation.value = state.s*100;
    hue.setAttribute('aria-valuetext', `${Math.round(state.h)} 度`);
    gray.setAttribute('aria-valuetext', `明度 ${Math.round(state.l*100)}%`);
    document.querySelector('.saturation-strip .strip-gradient').style.backgroundImage = `linear-gradient(to right,${hslToHex(state.h,0,state.l)},${hslToHex(state.h,1,state.l)})`;
    for (const [i,block] of [...document.getElementById('saturationBlocks').children].entries()) block.style.background = hslToHex(state.h,i/17,state.l);
    hex.value = color.toUpperCase(); hex.setCustomValidity('');
    preview.style.background = color; preview.classList.remove('is-empty');
    eraser.setAttribute('aria-pressed','false'); onChange(color);
  }
  hue.addEventListener('input', () => { state.h = Number(hue.value); if (!state.s) state.s = 1; commit(); });
  gray.addEventListener('input', () => { state.l = Number(gray.value)/100; commit(); });
  saturation.addEventListener('input', () => { state.s = Number(saturation.value)/100; commit(); });
  hex.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(hex.value)) { state = hexToHSL(hex.value); commit(); }
    else hex.setCustomValidity('请输入 # 加六位十六进制颜色。');
  });
  hex.addEventListener('change', () => { if (!hex.checkValidity()) hex.reportValidity(); });
  eraser.addEventListener('click', () => {
    eraser.setAttribute('aria-pressed','true'); preview.style.background = 'transparent'; preview.classList.add('is-empty'); onChange(null);
  });
  function setEnabled(enabled) {
    for (const input of [hue,gray,saturation,eraser]) input.disabled = !enabled;
    hex.readOnly = !enabled;
  }
  commit(); setEnabled(false);
  return { setEnabled };
}
