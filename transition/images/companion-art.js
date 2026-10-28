// The two companions share a quiet, carved-ivory / silver palette with the light road.
// All joints are local SVG groups, so walking never distorts the animal silhouettes.
export const deerRig = [
  { name: 'hind-far', hip: [60, 163], thigh: 26, thighAngle: -26, upper: 34, lower: 64, foot: [57, 282], phase: .5, bend: 1 },
  { name: 'front-far', hip: [137, 164], upper: 54, lower: 64, foot: [137, 282], phase: .75, bend: -1 },
  { name: 'hind-near', hip: [67, 163], thigh: 26, thighAngle: -26, upper: 34, lower: 64, foot: [72, 282], phase: 0, bend: 1 },
  { name: 'front-near', hip: [145, 162], upper: 56, lower: 64, foot: [145, 282], phase: .25, bend: -1 },
];

function standingAngles(leg) {
  const thighAngle = (leg.thighAngle || 0) * Math.PI / 180;
  const originX = leg.hip[0] - Math.sin(thighAngle) * (leg.thigh || 0);
  const originY = leg.hip[1] + Math.cos(thighAngle) * (leg.thigh || 0);
  const dx = leg.foot[0] - originX, dy = leg.foot[1] - originY;
  const distance = Math.hypot(dx, dy);
  const knee = -leg.bend * Math.acos(Math.max(-1, Math.min(1,
    (distance * distance - leg.upper * leg.upper - leg.lower * leg.lower) / (2 * leg.upper * leg.lower))));
  const hip = Math.atan2(-dx, dy) - Math.atan2(leg.lower * Math.sin(knee), leg.upper + leg.lower * Math.cos(knee));
  return [hip * 180 / Math.PI - (leg.thighAngle || 0), knee * 180 / Math.PI];
}

function legArtwork(leg) {
  const far = leg.name.endsWith('far'), hind = leg.name.startsWith('hind');
  const [hipAngle, kneeAngle] = standingAngles(leg);
  const u = leg.upper, l = leg.lower;
  const upperWidth = hind ? 5.2 : 6.2;
  return `<g data-leg="${leg.name}" transform="translate(${leg.hip.join(' ')})"${far ? ' opacity=".72"' : ''}>
    ${hind ? `<g data-thigh="${leg.name}" transform="rotate(${leg.thighAngle})">
      <path d="M-10 -9C-16 -4 -14 9 -9 20L-5 ${leg.thigh + 3}Q0 ${leg.thigh + 7} 5 ${leg.thigh + 2}L8 ${leg.thigh - 8}C12 6 11 -6 4 -10Z" fill="url(#deer-${far ? 'far-leg' : 'leg'})"/>
      <path d="M-5 -3C-8 7 -4 20 -1 ${leg.thigh - 2}" fill="none" stroke="#fff9e9" stroke-opacity="${far ? '.18' : '.4'}" stroke-width="1.1"/>
      <g transform="translate(0 ${leg.thigh})">` : ''}
    <g data-upper="${leg.name}" transform="rotate(${hipAngle.toFixed(3)})">
      <path d="M${-upperWidth} -7C${-upperWidth - 3} 6 -7 ${u * .42} -3.5 ${u - 7}L-3 ${u + 2}Q0 ${u + 5} 3.4 ${u + 1}L4 ${u - 8}C6 ${u * .47} ${upperWidth} 9 ${upperWidth - 1} -5Z" fill="url(#deer-${far ? 'far-leg' : 'leg'})"/>
      <path d="M${hind ? -5 : -3} 2C-4 ${u * .4} -1 ${u * .7} -1 ${u - 5}" fill="none" stroke="#fff9e9" stroke-opacity="${far ? '.2' : '.46'}" stroke-width="1.1"/>
      <g data-lower="${leg.name}" transform="translate(0 ${u}) rotate(${kneeAngle.toFixed(3)})">
        <path d="M-3.6 -3C-4.3 3 -2.1 ${l * .32} -2 ${l - 11}L-3.7 ${l - 3}L3.8 ${l - 3}L2.1 ${l - 12}C2.4 ${l * .32} 4.2 3 3.3 -2Q0 -5 -3.6 -3Z" fill="url(#deer-${far ? 'far-leg' : 'leg'})"/>
        <path d="M-.8 4L-.4 ${l - 12}" stroke="#f6f0dd" stroke-opacity="${far ? '.2' : '.46'}" stroke-width=".85"/>
        <g data-hoof="${leg.name}" transform="rotate(${(-(leg.thighAngle || 0) - hipAngle - kneeAngle).toFixed(3)} 0 ${l})">
          <path d="M-3.7 ${l - 5}Q.5 ${l - 4} 3.4 ${l - 6}L5 ${l - 1}L4.4 ${l}H-4.8L-4.6 ${l - 2}Z" fill="${far ? '#7b8072' : '#919686'}"/>
          <path d="M.4 ${l - 4}L.7 ${l}" stroke="#626c5c" stroke-opacity=".7" stroke-width=".6"/>
        </g>
      </g>
    </g>
    ${hind ? '</g></g>' : ''}
  </g>`;
}

export const deerArtwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" fill="none" aria-hidden="true">
  <defs>
    <radialGradient id="deer-coat" cx="0" cy="0" r="1" gradientTransform="translate(88 142) rotate(74) scale(62 98)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f6efda"/><stop offset=".42" stop-color="#dcd5bf"/><stop offset=".82" stop-color="#b1b29f"/><stop offset="1" stop-color="#858e7f"/>
    </radialGradient>
    <linearGradient id="deer-neck" x1="153" y1="107" x2="131" y2="171" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f2ecd8"/><stop offset=".45" stop-color="#d9d4be"/><stop offset="1" stop-color="#9da694"/>
    </linearGradient>
    <linearGradient id="deer-face" x1="174" y1="91" x2="184" y2="117" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f6efda"/><stop offset=".55" stop-color="#d7d3bd"/><stop offset="1" stop-color="#a4ab97"/>
    </linearGradient>
    <linearGradient id="deer-leg" x1="-10" y1="0" x2="7" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#e4ddc6"/><stop offset=".47" stop-color="#c3c4ae"/><stop offset="1" stop-color="#9fa996"/>
    </linearGradient>
    <linearGradient id="deer-far-leg" x1="-7" y1="0" x2="5" y2="52" gradientUnits="userSpaceOnUse">
      <stop stop-color="#b6b59f"/><stop offset="1" stop-color="#818d7d"/>
    </linearGradient>
    <linearGradient id="deer-antler" x1="150" y1="14" x2="169" y2="98" gradientUnits="userSpaceOnUse">
      <stop stop-color="#e9dfc4"/><stop offset=".53" stop-color="#bdbca4"/><stop offset="1" stop-color="#8d9783"/>
    </linearGradient>
  </defs>
  <g data-deer-body="" stroke-linejoin="round" stroke-linecap="round">
    ${deerRig.slice(0, 2).map(legArtwork).join('\n')}
    <path d="M46 145C35 141 29 133 27 128C35 129 45 133 50 140L52 149Z" fill="#bfc4ac"/>
    <path d="M31 131Q39 135 45 143" stroke="#f4edda" stroke-width="1.5" stroke-opacity=".7"/>
    <path d="M41 155C39 141 50 133 66 134C86 133 104 141 122 137C135 134 143 134 149 140C158 150 154 166 141 178C127 185 111 182 96 180C84 181 77 185 64 183C48 181 41 169 41 155Z" fill="url(#deer-coat)"/>
    <path d="M47 143C66 135 82 141 101 143C115 145 126 141 135 136" stroke="#fff5df" stroke-opacity=".53" stroke-width="1.4"/>
    <path d="M48 171C61 179 77 179 89 175C104 172 119 178 131 175" stroke="#f0ead5" stroke-opacity=".32" stroke-width="2"/>
    <path d="M46 148C45 162 53 172 62 174C69 170 72 159 69 146" fill="#f3ead3" fill-opacity=".12"/>
    ${deerRig.slice(2).map(legArtwork).join('\n')}
    <path d="M58 151C64 149 72 153 76 161C77 165 76 171 74 174" stroke="#efe8d2" stroke-opacity=".44" stroke-width="1.25"/>
    <path d="M137 151C143 153 148 162 147 171" stroke="#f4ecda" stroke-opacity=".46" stroke-width="1.2"/>
    <g data-deer-neck="" data-pivot="133 170">
    <path d="M119 147C134 137 143 117 152 102C156 94 162 91 168 97C175 106 173 118 167 131L153 164C149 177 138 184 125 178C122 166 125 155 119 147Z" fill="url(#deer-neck)"/>
    <path d="M146 151C151 135 156 125 160 113C163 106 162 101 160 99" stroke="#fff5e0" stroke-opacity=".55" stroke-width="1.4"/>
    <path d="M141 169C147 158 152 141 155 133" stroke="#939f8b" stroke-opacity=".5" stroke-width="1"/>
    <g data-deer-head="" data-pivot="158 108">
      <path d="M159 95C153 83 145 69 147 52C148 36 152 23 150 13M150 42C142 37 138 29 137 20M148 56C138 52 130 43 128 33M149 69C140 65 135 60 131 55M150 28L159 20L161 11" stroke="url(#deer-antler)" stroke-width="2.6"/>
      <path d="M172 94C174 79 180 64 181 49C183 34 181 25 185 14M181 48C191 43 197 35 199 24M182 34L173 26L170 17M177 66C187 63 194 56 198 50M193 39L207 35L211 27" stroke="url(#deer-antler)" stroke-width="2.5"/>
      <path d="M139 32L130 26L127 19M133 43L122 39L117 32M142 62L137 48M177 24L181 16M196 31L194 19M189 60L190 48M206 35L212 39M151 23L149 13" stroke="#dbd6bd" stroke-opacity=".86" stroke-width="1.15"/>
      <g data-deer-ear="far" data-pivot="160 89">
      <path d="M158 91C149 87 145 78 145 69C154 71 160 79 162 88" fill="#c7cbb2"/>
      <path d="M158 87C153 82 150 77 149 74" stroke="#8d9b84" stroke-width="1.2"/>
      </g>
      <g data-deer-ear="near" data-pivot="173 91">
      <path d="M171 89C172 78 179 70 187 67C188 76 182 87 175 94" fill="#e5dfc6"/>
      <path d="M175 87C177 80 181 75 183 73" stroke="#a1aa92" stroke-width="1.35"/>
      </g>
      <path d="M158 99C157 92 163 86 170 87C180 87 185 95 190 99L207 105C212 107 215 110 213 114C210 118 202 116 196 116L183 111C176 110 173 114 168 112C164 110 159 106 158 99Z" fill="url(#deer-face)"/>
      <path d="M164 94C171 90 178 93 181 98M181 102C190 104 197 109 206 109" stroke="#fff7df" stroke-opacity=".58" stroke-width="1"/>
      <path d="M166 105C170 108 174 108 177 107" stroke="#9da68f" stroke-opacity=".7" stroke-width="1"/>
      <g data-deer-eye="">
      <path d="M176 98Q179 95.8 182 98.2Q179.2 101.3 176 98Z" fill="#414d40"/>
      <circle cx="179.1" cy="97.8" r=".63" fill="#fdf8df"/>
      </g>
      <g data-deer-muzzle="" data-pivot="194 110">
      <path d="M196 110C201 111 207 111.5 211 111L211 114C206 116.3 202 115.8 197 114Z" fill="#c2c6af"/>
      <path d="M208 106.4Q214.1 108.3 213.4 111.8Q209.6 112.5 207.6 110Z" fill="#65715e"/>
      <path d="M199 113Q205 114.8 209 113.8" stroke="#7f8c75" stroke-width=".8"/>
      </g>
      <path d="M166 110C165 116 161 120 159 123" stroke="#f8eed8" stroke-opacity=".32" stroke-width="1.7"/>
    </g>
    </g>
  </g>
</svg>`;

export const fishArtwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="fish-silver" x1="115" y1="34" x2="119" y2="67" gradientUnits="userSpaceOnUse">
      <stop stop-color="#9cafa5"/><stop offset=".26" stop-color="#d9e3d8"/><stop offset=".48" stop-color="#fbf6e6"/><stop offset=".73" stop-color="#cbd7c7"/><stop offset="1" stop-color="#879e90"/>
    </linearGradient>
    <linearGradient id="fish-silk" x1="62" y1="51" x2="14" y2="48" gradientUnits="userSpaceOnUse">
      <stop stop-color="#d9e4d4" stop-opacity=".76"/><stop offset="1" stop-color="#dbe1d2" stop-opacity=".13"/>
    </linearGradient>
    <linearGradient id="fish-fin" x1="132" y1="44" x2="108" y2="80" gradientUnits="userSpaceOnUse">
      <stop stop-color="#d5e2d1" stop-opacity=".8"/><stop offset="1" stop-color="#dce5d1" stop-opacity=".13"/>
    </linearGradient>
  </defs>
  <g data-fish-body="" stroke-linecap="round" stroke-linejoin="round">
    <g data-fish-tail="" data-pivot="60 50">
      <path d="M63 47C47 44 29 24 14 18C18 31 25 43 37 50C24 57 17 68 12 80C29 74 47 57 63 54C67 52 66 49 63 47Z" fill="url(#fish-silk)" stroke="#dce6d5" stroke-opacity=".65" stroke-width=".8"/>
      <path d="M60 49C43 44 28 31 18 23M60 51C43 52 29 63 17 75M57 50L34 48M51 47L29 37M49 54L28 64" stroke="#dce8d4" stroke-opacity=".55" stroke-width=".65"/>
    </g>
    <g data-fish-dorsal="" data-pivot="111 36">
      <path d="M82 41C88 31 103 25 115 25C111 29 116 34 128 37L137 41Z" fill="url(#fish-fin)" stroke="#d4e0d0" stroke-opacity=".6" stroke-width=".65"/>
      <path d="M91 37L98 29M100 35L105 28M110 35L113 29M118 37L116 32" stroke="#e6ecdb" stroke-opacity=".48" stroke-width=".55"/>
    </g>
    <path d="M111 62C110 73 99 79 90 82C91 75 94 68 99 61M133 62C139 70 146 74 155 75C151 68 146 63 141 60" fill="url(#fish-fin)" stroke="#d1deca" stroke-opacity=".56" stroke-width=".65"/>
    <path d="M102 66L94 77M108 65L99 76M140 66L150 72" stroke="#dfe9d5" stroke-opacity=".48" stroke-width=".55"/>
    <path d="M57 47C73 45 87 37 105 35C128 32 151 37 167 44C176 48 181 50 183 53C177 58 169 60 160 62C140 68 120 69 101 64C83 60 73 55 57 54L61 51Z" fill="url(#fish-silver)" stroke="#d8e1d0" stroke-opacity=".8" stroke-width=".75"/>
    <path d="M69 48C93 39 119 35 145 42" stroke="#f6f7e8" stroke-opacity=".66" stroke-width=".95"/>
    <path d="M75 54C100 57 116 65 143 61" stroke="#718f7d" stroke-opacity=".45" stroke-width=".65"/>
    <path d="M91 43Q95 46 91 49M101 40Q105 43 101 46M111 39Q115 42 111 45M121 39Q125 42 121 45M131 40Q135 43 131 46M81 48Q85 51 81 54M97 48Q101 51 97 54M107 46Q111 49 107 52M117 46Q121 49 117 52M127 47Q131 50 127 53M137 46Q141 49 137 52M102 55Q106 58 102 61M113 54Q117 57 113 60M124 55Q128 58 124 61M135 54Q139 57 135 60" stroke="#819b89" stroke-opacity=".27" stroke-width=".58"/>
    <path d="M147 40C141 46 141 56 147 62" stroke="#819887" stroke-opacity=".8" stroke-width=".8"/>
    <g data-fish-fin="" data-pivot="135 57">
      <path d="M140 54C133 58 123 69 116 76C130 75 139 67 146 60" fill="url(#fish-fin)" stroke="#e0e8d5" stroke-opacity=".65" stroke-width=".65"/>
      <path d="M139 58L122 72M141 60L127 72M136 58L120 70" stroke="#eaf0de" stroke-opacity=".52" stroke-width=".5"/>
    </g>
    <path d="M153 44Q159 42 166 46" stroke="#eff1df" stroke-opacity=".65" stroke-width=".8"/>
    <circle cx="164" cy="49" r="2.1" fill="#4f6b59" stroke="#eaf0dd" stroke-width=".7"/>
    <circle cx="164.5" cy="48.4" r=".55" fill="#fffae9"/>
    <path d="M178 52.2Q182 52 184 53M179 55C184 55 188 57 191 59M178 51C183 47 187 47 191 48" stroke="#dce6d0" stroke-opacity=".8" stroke-width=".7"/>
  </g>
</svg>`;
