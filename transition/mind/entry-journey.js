import * as THREE from 'three';
import { GOLDEN_LIGHT } from './golden-light.js';
import { createJourneyClock, readJourney, seededRandom, smooth, trackAt } from './entry-journey-state.js';

const DEPTH = 128;
const VINE_COLOR = '#829378';
const pathGLSL = `
vec2 track(float d) {
    return vec2(sin(d*.036)*5.8+sin(d*.081)*1.7,
        sin(d*.045+.6)*2.5+sin(d*.092)*.9);
}
`;

function makeLeafGeometry() {
    const vertices = [], normals = [], folds = [];
    // Each level is a pair of overlapping triangular laminae. The same geometry
    // starts as a flat paper construction and folds along its central vein.
    for (let i = 0; i < 6; i++) {
        const y = i / 6, tip = Math.min(1.06, y + 0.28);
        const width = Math.sin((y + 0.08) * Math.PI) * 0.30;
        for (const side of [-1, 1]) {
            vertices.push(0, y - 0.04, 0, side * width, y + 0.06, 0, 0, tip, 0);
            for (let v = 0; v < 3; v++) {
                normals.push(side * .35, .15, 1);
                folds.push(v === 1 ? side * width : 0);
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('aFold', new THREE.Float32BufferAttribute(folds, 1));
    return geometry;
}

function makeForest(scene, uniforms, compact) {
    const random = seededRandom();
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();
    const placements = [], stems = [], stemBands = [];
    const addStem = (a, b, band) => {
        stems.push(...a, ...b);
        stemBands.push(band, band);
    };
    const plants = compact ? 32 : 52;
    for (let plant = 0; plant < plants; plant++) {
        const side = plant % 2 ? -1 : 1;
        const band = (plant / plants * DEPTH + random() * 2) % DEPTH;
        const x = side * (5.1 + random() * 4.8);
        const base = -5.2 - random() * 1.4;
        const height = 3.8 + random() * 5.6;
        const lean = -side * (0.4 + random());
        let last = [x, base, 0];
        for (let j = 1; j <= 12; j++) {
            const s = j / 12;
            const next = [x + lean * s * s, base + height * s, Math.sin(s * 3) * .4];
            addStem(last, next, band); last = next;
        }
        const crown = last;
        for (let frond = 0; frond < 7; frond++) {
            const angle = frond / 7 * Math.PI * 2 + random() * .4;
            const length = 2.4 + random() * 2.2;
            const sample = t => [crown[0] + Math.cos(angle) * length * t,
                crown[1] + Math.sin(t * Math.PI * .8) * 1.1 - t * t * 1.8,
                crown[2] + Math.sin(angle) * length * t];
            let previous = crown;
            for (let j = 1; j <= 10; j++) {
                const t = j / 10, point = sample(t);
                addStem(previous, point, band); previous = point;
                for (const flank of [-1, 1]) {
                    const span = Math.sin(t * Math.PI * .88) * (1.05 + random() * .35);
                    const dx = -Math.sin(angle) * flank;
                    const dz = Math.cos(angle) * flank;
                    placements.push({
                        x: point[0], y: point[1], z: band - point[2],
                        dx, dy: -.2 + random() * .65, dz,
                        size: span, width: .65 + random() * .5,
                        seed: random(), birth: plant / plants * .35 + random() * .28
                    });
                }
            }
        }
        // Broad understory leaves add distinct silhouettes below the fine fern crowns.
        for (let j = 0; j < 9; j++) {
            const a = random() * Math.PI * 2;
            placements.push({ x: x - side * .8, y: base + .3, z: band,
                dx: Math.cos(a), dy: .6 + random(), dz: Math.sin(a),
                size: 1.7 + random() * 1.9, width: 1.5, seed: random(), birth: random() * .4 });
        }
    }
    // Small overlapping canopy clusters give the passage near, middle and far
    // detail, instead of repeating the same large fern silhouette down a hall.
    for (let cluster = 0; cluster < (compact ? 36 : 64); cluster++) {
        const ceiling = cluster % 3 === 0, side = cluster % 2 ? -1 : 1;
        const x = ceiling ? (random() - .5) * 8 : side * (4.2 + random() * 2.8);
        const y = ceiling ? 3.7 + random() * 2 : -2 + random() * 5.8;
        const band = random() * DEPTH;
        for (let leaf = 0; leaf < 18; leaf++) {
            const angle = random() * Math.PI * 2;
            placements.push({x: x + (random() - .5) * 2, y: y + (random() - .5) * 1.5,
                z: band + (random() - .5) * 2.4,
                dx: Math.cos(angle), dy: -.3 + random(), dz: Math.sin(angle),
                size: .28 + random() * .68, width: 1 + random() * .7,
                seed: random(), birth: .2 + random() * .42});
        }
    }
    const geometry = makeLeafGeometry();
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(placements.map(p => p.seed)), 1));
    geometry.setAttribute('aBirth', new THREE.InstancedBufferAttribute(new Float32Array(placements.map(p => p.birth)), 1));
    const material = new THREE.ShaderMaterial({ uniforms, side: THREE.DoubleSide, transparent: true,
        vertexShader: `
attribute float aFold; attribute float aSeed; attribute float aBirth;
uniform float uTime,uTravel,uGrowth,uFold,uGold,uBurst,uEnding;
varying float vDepth,vLight,vSeed,vVein;varying vec2 vLeaf;
${pathGLSL}
void main(){
    float grow=smoothstep(aBirth,aBirth+.52,uGrowth);
    vec3 p=position*grow;
    p.z+=abs(aFold)*uFold*(1.3+sin(position.y*3.)*.6);
    p.x+=sin(uTime*1.1+aSeed*25.+position.y*3.)*.06*position.y*grow;
    vec3 center=instanceMatrix[3].xyz;
    vec3 local=(instanceMatrix*vec4(p,0.)).xyz;
    float depth=mod(center.z-uTravel,128.);
    vec3 world=vec3(center.xy+local.xy,-depth+local.z);
    world.xy+=track(uTravel+depth-local.z);
    float detach=smoothstep(3.1,3.42,uEnding)*(.15+aSeed*.35);
    world.xy+=normalize(center.xy+vec2(.001))*detach;world.z+=detach*2.;
    vec3 n=normalize(mat3(instanceMatrix)*vec3(normal.xy,1.-uFold*.35));
    vLight=.34+abs(dot(n,normalize(vec3(-.4,.8,1.))))*.66;
    vDepth=depth;vSeed=aSeed;vVein=abs(position.x);vLeaf=position.xy;
    gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
}`,
        fragmentShader: `
uniform float uGold,uBurst,uGrowth,uEnding;varying float vDepth,vLight,vSeed,vVein;varying vec2 vLeaf;
void main(){
    vec3 green=mix(vec3(.045,.14,.085),vec3(.24,.39,.19),vSeed);
    vec3 gold=mix(vec3(.34,.18,.035),vec3(1.,.81,.34),vSeed);
    float gild=smoothstep(vSeed*.24,.78+vSeed*.22,uGold);
    vec3 c=mix(green,gold,gild)*vLight;
    c+=vec3(.33,.32,.18)*pow(vLight,12.)*(.08+gild*.48);
    c+=vec3(.18,.16,.06)*exp(-vVein*80.)*(.15+gild*.5);
    float charge=smoothstep(2.5,3.1,uEnding)*(1.-smoothstep(3.1,3.4,uEnding));
    c+=vec3(.72,.43,.10)*charge*(.3+pow(vLight,5.));
    float fog=exp(-vDepth*.024);
    float grain=fract(sin(dot(floor(vLeaf*28.),vec2(127.1,311.7))+vSeed*74.)*43758.5453);
    float dissolve=smoothstep(3.12+grain*.13,3.33+grain*.13,uEnding);
    float alpha=(1.-dissolve)*smoothstep(0.,.06,uGrowth);
    if(alpha<.01)discard;
    gl_FragColor=vec4(mix(vec3(.012,.023,.017),c,fog),alpha);
}`
    });
    const leaves = new THREE.InstancedMesh(geometry, material, placements.length);
    placements.forEach((p, index) => {
        dummy.position.set(p.x, p.y, p.z);
        direction.set(p.dx, p.dy, p.dz).normalize();
        dummy.quaternion.setFromUnitVectors(up, direction);
        dummy.rotateY((p.seed - .5) * .7);
        dummy.scale.set(p.size * p.width, p.size, p.size);
        dummy.updateMatrix(); leaves.setMatrixAt(index, dummy.matrix);
    });
    leaves.frustumCulled = false;
    leaves.name = 'journey-folded-triangle-leaves';
    scene.add(leaves);
    const stemGeometry = new THREE.BufferGeometry();
    stemGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stems, 3));
    stemGeometry.setAttribute('aBand', new THREE.Float32BufferAttribute(stemBands, 1));
    const stemMaterial = makeLineMaterial(uniforms, false);
    const branches = new THREE.LineSegments(stemGeometry, stemMaterial);
    branches.frustumCulled = false; scene.add(branches);
    return placements;
}

function makeLineMaterial(uniforms, grid) {
    return new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false,
        vertexShader: `
attribute float aBand;uniform float uTravel,uGrowth,uTime;
varying float vDepth,vY;
${pathGLSL}
void main(){
    float depth=mod(aBand-uTravel,128.);
    vec3 p=position;
    ${grid ? '' : 'p.y=-5.4+(p.y+5.4)*smoothstep(0.,.8,uGrowth);'}
    p.z-=depth;p.xy+=track(uTravel+depth-position.z);
    vDepth=depth;vY=position.y;
    gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`,
        fragmentShader: `
uniform float uSpace,uGold,uBurst,uGrowth,uEnding;
varying float vDepth,vY;
void main(){
    float opacity=${grid ? '.22*uSpace*(1.-uGrowth*.4)' : '.48*smoothstep(0.,.18,uGrowth)'};
    opacity*=exp(-vDepth*.026)*(1.-smoothstep(3.14,3.48,uEnding));
    vec3 c=mix(${grid ? 'vec3(.45,.48,.35)' : 'vec3(.16,.29,.13)'},vec3(.7,.52,.19),uGold);
    gl_FragColor=vec4(c,opacity);
}` });
}

function makeGrid(scene, uniforms) {
    const points = [], bands = [];
    const line = (a, b, band) => { points.push(...a, ...b); bands.push(band, band); };
    for (let frame = 0; frame < 16; frame++) {
        const band = frame * 8;
        for (let y = -5; y <= 5; y += 2.5) {
            line([-8, y, 0], [8, y, 0], band);
            for (const x of [-8, 8]) line([x, y, -4], [x, y, 4], band);
        }
        for (let x = -8; x <= 8; x += 2) {
            for (const y of [-5, 5]) line([x, y, -4], [x, y, 4], band);
        }
        line([-8, -5, 0], [-8, 5, 0], band);
        line([8, -5, 0], [8, 5, 0], band);
    }
    // Restrained suspended geometry echoes the reference's spatial markers.
    const random = seededRandom(0x75ab);
    for (let i = 0; i < 38; i++) {
        const band = random() * DEPTH;
        const x = (i % 2 ? -1 : 1) * (2.6 + random() * 3.3);
        const y = -2.8 + random() * 6, size = .25 + random() * .65;
        const tilt = random() * Math.PI, depthTilt = (random() - .5) * .9;
        const shape = i % 3 === 0 ? [[0,1],[-.86,-.5],[.86,-.5],[0,1]]
            : i % 3 === 1 ? [[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]
                : Array.from({length:17},(_,j)=>[Math.cos(j/16*Math.PI*1.65),Math.sin(j/16*Math.PI*1.65)]);
        const point = ([a,b]) => [x+(a*Math.cos(tilt)-b*Math.sin(tilt))*size,
            y+(a*Math.sin(tilt)+b*Math.cos(tilt))*size,b*size*depthTilt];
        for (let j = 1; j < shape.length; j++) line(point(shape[j-1]),point(shape[j]),band);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute('aBand', new THREE.Float32BufferAttribute(bands, 1));
    const grid = new THREE.LineSegments(geometry, makeLineMaterial(uniforms, true));
    grid.name = 'journey-fine-spatial-grid';
    grid.frustumCulled = false; scene.add(grid);
}

function makeStars(scene, uniforms, compact, leafOrigins) {
    const random = seededRandom(0x32ac);
    const positions = [], seeds = [], scatter = [];
    const count = compact ? 3600 : 8200;
    for (let i = 0; i < count; i++) {
        // The first glints belong to the leaves themselves. Their final release
        // keeps the same depth bands and curved flight path as the foliage.
        const leaf = leafOrigins?.length ? leafOrigins[Math.floor(random() * leafOrigins.length)] : null;
        positions.push(leaf ? leaf.x + (random() - .5) * .18 : (random() - .5) * 25,
            leaf ? leaf.y + (random() - .5) * .18 : (random() - .5) * 16,
            leaf ? leaf.z : random() * DEPTH);
        seeds.push(random(), random(), random(), random());
        scatter.push((random() - .5) * 2.18, (random() - .5) * 2.18);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
    geometry.setAttribute('aScatter', new THREE.Float32BufferAttribute(scatter, 2));
    const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
        vertexShader: `
attribute vec4 aSeed;attribute vec2 aScatter;
uniform float uTravel,uTime,uEnding,uBurst,uGold,uDpr;
varying float vSeed,vAlpha,vStreak,vHero,vGlint,vHaloBreath,vDefocus;
varying vec2 vDirection,vGrainAxis;
${pathGLSL}
void main(){
 float d=mod(position.z-uTravel,128.);
 vec3 p=vec3(position.xy+track(uTravel+d),-d);
 vec4 eye=viewMatrix*vec4(p,1.);
 vec4 baseClip=projectionMatrix*eye;
 vec2 baseNdc=baseClip.xy/max(.08,baseClip.w);
 float aspect=projectionMatrix[1][1]/projectionMatrix[0][0];
 vec2 radial=normalize(baseNdc*vec2(aspect,1.)+vec2(.0001));
 float hero=step(.977,aSeed.x);
 float streak=step(.85,aSeed.x)*(1.-hero);
 float fine=1.-max(hero,streak);
 float since=max(0.,uEnding-3.1);
 float delay=aSeed.z*.17;
 float age=max(0.,since-delay);
 float released=step(3.1,uEnding)*step(delay,since);
 float life=.64+aSeed.w*.65;
 float run=min(1.,age/life);
 float thrust=pow(run,1.48);
 float depth=max(.08,-eye.z);
 // A genuinely forward-moving particle grows in perspective, races outwards,
 // then dies before crossing the near plane; it can never flip behind us.
 eye.xy+=radial*vec2(1.,1.)*depth*thrust*(.10+aSeed.y*.20);
 eye.z+=max(0.,depth-.055)*thrust;
 vec4 flyingClip=projectionMatrix*eye;
 vec2 flyingNdc=flyingClip.xy/max(.055,flyingClip.w);
 float nearFade=smoothstep(.07,.8,-eye.z);
 float pulse=sin(min(1.,age/.12)*1.5707963);
 float flightAlpha=released*pulse*nearFade*(1.-smoothstep(.78,1.,run));
 float glint=pow(.5+.5*sin(uTime*.68+aSeed.z*47.),10.);
 float twinkle=.8+.16*sin(uTime*.48+aSeed.y*53.)+glint*.12;
 float preAlpha=(.008+smoothstep(.35,1.,uGold)*.15)*(1.-released);
 float tail=smoothstep(life+.06,life+.43,age)*fine*released;
 vec2 dustNdc=aScatter+vec2(sin(uTime*.19+aSeed.z*35.),cos(uTime*.15+aSeed.w*41.))*.019;
 // Reuse the fine particles only after their outgoing streak has vanished.
 // This leaves a full screen of slow gold dust instead of an empty last frame.
 float inTail=step(life,age)*released;
 vec2 ndc=mix(mix(baseNdc,flyingNdc,released),dustNdc,inTail);
 float z=mix(baseClip.z/max(.08,baseClip.w),flyingClip.z/max(.055,flyingClip.w),released);
 z=mix(z,0.,inTail);
 gl_Position=vec4(ndc,z,1.);
 float dustSize=1.35+pow(aSeed.y,2.)*2.6;
 float flightSize=mix(dustSize*(1.+thrust*1.8),21.+aSeed.y*24.,streak);
 flightSize=mix(flightSize,24.+aSeed.y*36.,hero);
 flightSize*=.68+thrust*.68;
 // One sprite contains the same tight grain and 3.8x warm halo as the
 // guiding current. Streaks keep their wide card but a narrow bright spine.
 float pointSize=mix((1.2+aSeed.y*2.)*3.8,flightSize*mix(3.8,1.,max(streak,hero)),released);
 float tailBlur=step(.995,aSeed.w)*fine;
 float tailCore=(2.4+pow(aSeed.y,.8)*4.6)*mix(1.,2.5,tailBlur);
 pointSize=mix(pointSize,tailCore*3.8,inTail);
 pointSize=mix(pointSize,1.,inTail*(1.-fine));
 gl_PointSize=min(${compact ? '54.' : '78.'},pointSize*uDpr);
 vSeed=aSeed.y;vDirection=radial;
 float angle=aSeed.z*6.283185+sin(uTime*.17+aSeed.w*31.)*.09;
 vGrainAxis=vec2(cos(angle),sin(angle));
 vGlint=glint;vHaloBreath=.82+.18*sin(uTime*.32+aSeed.w*39.);
 vDefocus=max(step(.995,aSeed.x)*(1.-inTail)*released,tailBlur*inTail);
 vStreak=streak*(1.-inTail)*released;
 vHero=hero*(1.-inTail)*released;
 vAlpha=(preAlpha+flightAlpha*(.9+streak*.4+hero*1.35)+tail*(.62+aSeed.w*.65))*twinkle;
 vAlpha*=mix(1.,.34,vDefocus);
 if(baseClip.w<=.08&&released<.5)vAlpha=0.;
}`,
        fragmentShader: `
uniform vec3 uDustGold,uDustCore,uDustTint;
varying float vSeed,vAlpha,vStreak,vHero,vGlint,vHaloBreath,vDefocus;
varying vec2 vDirection,vGrainAxis;
void main(){
 if(vAlpha<.002)discard;
 vec2 p=gl_PointCoord-.5;p.y=-p.y;
 // Slightly uneven ellipses read as floating gold powder, while the softly
 // clipped Gaussian core/halo matches the particles that flow into grace.
 vec2 q=vec2(dot(p,vGrainAxis),dot(p,vec2(-vGrainAxis.y,vGrainAxis.x)))*2.;
 q*=vec2(.92+vSeed*.3,.8+vSeed*.19);
 float uneven=1.+sin(q.x*13.+vSeed*31.)*sin(q.y*11.-vSeed*17.)*.065;
 float radius=length(q)*uneven;
 float grainRadius=radius*mix(3.8,2.3,vDefocus);
 float grain=exp(-grainRadius*grainRadius*mix(4.5,2.9,vDefocus));
 grain*=1.-smoothstep(.65,1.,grainRadius);
 float halo=exp(-radius*radius*3.)*(1.-smoothstep(.65,1.,radius));
 float along=dot(p,vDirection);
 float across=dot(p,vec2(-vDirection.y,vDirection.x));
 float trail=exp(-across*across*1150.)*exp(-along*along*10.);
 float trailHalo=exp(-across*across*170.)*exp(-along*along*7.);
 float head=exp(-dot(p-vDirection*.17,p-vDirection*.17)*190.);
 float coreWeight=mix(grain*.86,trail*.9+head*.95,vStreak)*(1.+vGlint*.3);
 float haloWeight=mix(halo*.11,trailHalo*.14+halo*.04,vStreak)*vHaloBreath;
 haloWeight*=1.+vHero*.35;
 float weight=coreWeight+haloWeight;
 float alpha=weight*vAlpha;
 if(alpha<.002)discard;
 vec3 tint=mix(uDustGold,uDustTint,.48+vSeed*.32);
 vec3 core=mix(tint,uDustCore,.30+vSeed*.32+vGlint*.22+vHero*.12);
 vec3 color=(core*coreWeight+uDustGold*haloWeight)/max(.0001,weight);
 color*=1.+vHero*.2;
 gl_FragColor=vec4(color,alpha);
}` });
    const stars = new THREE.Points(geometry, material);
    stars.name = 'journey-leafborn-gold-burst';
    stars.frustumCulled = false; scene.add(stars);
}

function drawVines(context, width, height, origin, state, reducedMotion) {
    context.clearRect(0, 0, width, height);
    const time = state.time, fade = 1 - smooth(3.4, 5.1, time);
    if (fade <= 0) return;
    context.globalAlpha = fade;
    const x = origin.x * width, y = origin.y * height;
    const radius = origin.radius * Math.min(width, height);
    const glow = context.createRadialGradient(x, y, 0, x, y, Math.max(width, height)*.8);
    glow.addColorStop(0, '#3439272b'); glow.addColorStop(.35, '#17261b12'); glow.addColorStop(1, '#03050300');
    context.fillStyle = glow; context.fillRect(0, 0, width, height);
    context.fillStyle = '#010201'; context.strokeStyle = '#89937e55'; context.lineWidth=.65;
    context.beginPath();context.ellipse(x,y,radius*(1-smooth(2.8,4.6,time)*.92),radius*(1-smooth(2.8,4.6,time)*.92),0,0,Math.PI*2);context.fill();context.stroke();
    const ends = [[0,0],[width*.3,0],[width*.73,0],[width,0],[width,height*.4],
        [width,height],[width*.65,height],[width*.22,height],[0,height],[0,height*.55],[0,height*.19]];
    ends.forEach(([ex,ey],index) => {
        const start = .2 + index * .052;
        const growth = smooth(start, start + 1.72, time);
        const hit = start + 1.72;
        const after = Math.max(0, time-hit);
        const taut = smooth(hit, hit+.44, time);
        const snap = Math.sin(after*21)*Math.exp(-after*7)*(time>=hit?1:0);
        const dx = ex-x, dy = ey-y, length = Math.hypot(dx,dy);
        const nx = -dy/length, ny = dx/length;
        context.beginPath();context.moveTo(x,y);
        for(let j=1;j<=70;j++) {
            const s = j/70*growth;
            const wave = Math.sin(s*Math.PI)*(Math.sin(s*11+index+time*2.3)*.6+Math.sin(s*5-index)*.4);
            const bend = (wave*(reducedMotion?18:54)*(1-taut)+snap*22*Math.sin(s*Math.PI))*(.25+growth*.75);
            context.lineTo(x+dx*s+nx*bend, y+dy*s+ny*bend);
        }
        context.lineWidth = .22 + smooth(.32,2.24,time)*(1.8+index%3*.45)*(1-taut*.7);
        context.strokeStyle = VINE_COLOR;
        context.shadowColor=VINE_COLOR;context.shadowBlur=3;context.stroke();context.shadowBlur=0;
        if(taut>0){context.fillStyle=VINE_COLOR;context.globalAlpha=fade*.4*Math.exp(-after*4);context.beginPath();context.arc(ex,ey,3+after*7,0,Math.PI*2);context.fill();context.globalAlpha=fade;}
    });
    context.globalAlpha=1;
}

function drawBurstLight(context, width, height, state, reducedMotion) {
    if (state.ending < 2.5) return;
    const age = state.ending - 3.1;
    const charge = smooth(2.5,3.08,state.ending)*(1-smooth(3.08,3.24,state.ending));
    const flash = age > 0 ? (1-Math.exp(-age*32))*Math.exp(-age*5.4) : 0;
    const afterglow = smooth(0,.5,age)*(1-smooth(1.5,3.2,age))*.045;
    const power = charge*.1 + flash*(reducedMotion ? .22 : .68) + afterglow;
    if (power < .001) return;
    const x = width*.5, y = height*.46, radius = Math.hypot(width,height)*.7;
    context.save();context.globalCompositeOperation='lighter';context.globalAlpha=power;
    const glow=context.createRadialGradient(x,y,0,x,y,radius);
    glow.addColorStop(0,'#fff5ce');glow.addColorStop(.06,'#ffdf88e0');
    glow.addColorStop(.28,'#dfa13a78');glow.addColorStop(.62,'#b16b1c1c');glow.addColorStop(1,'#b16b1c00');
    context.fillStyle=glow;context.fillRect(0,0,width,height);
    if(age>0&&age<1.3&&!reducedMotion){
        const ring=radius*(.035+1.12*(1-Math.exp(-age*3.4)));
        context.globalAlpha=.38*Math.exp(-age*3.1)*smooth(0,.035,age);
        context.strokeStyle='#ffe6a8';context.lineWidth=1.6+flash*2;
        context.shadowColor='#ffd075';context.shadowBlur=15;
        context.beginPath();context.arc(x,y,ring,0,Math.PI*2);context.stroke();context.shadowBlur=0;
        const flare=context.createLinearGradient(0,y,width,y);
        flare.addColorStop(0,'#ffdc8800');flare.addColorStop(.46,'#ffdc8830');
        flare.addColorStop(.5,'#fff4cd');flare.addColorStop(.54,'#ffdc8830');flare.addColorStop(1,'#ffdc8800');
        context.globalAlpha=flash*.7;context.fillStyle=flare;context.fillRect(0,y-1,width,2);
    }
    context.restore();
}

export function createMindJourney({ onFinish = () => {} } = {}) {
    let origin;
    try { origin = readJourney(window.sessionStorage); } catch { /* denied storage */ }
    const root = document.documentElement;
    if (!origin) { root.classList.remove('mind-journey-pending'); return null; }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compact = innerWidth < 700;
    const wrapper = document.createElement('section');
    wrapper.className='mind-journey';wrapper.setAttribute('aria-label','雨林中的思维树正在生长');
    const skip = document.createElement('button');skip.className='journey-skip';skip.textContent='跳过';
    const status = document.createElement('span');status.className='journey-status';status.setAttribute('role','status');status.textContent='藤蔓正在苏醒';
    wrapper.append(skip,status);document.body.appendChild(wrapper);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'}); }
    catch { wrapper.remove();root.classList.remove('mind-journey-pending');return null; }
    renderer.setClearColor(0x030503,1);
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,compact?1.15:1.4));
    wrapper.prepend(renderer.domElement);
    const ink = document.createElement('canvas'); wrapper.appendChild(ink);
    const context = ink.getContext('2d');
    if(!context){renderer.dispose();wrapper.remove();root.classList.remove('mind-journey-pending');return null;}
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.08,160);
    const uniforms={};
    for(const name of ['Time','Travel','Growth','Fold','Gold','Burst','Space','Ending']) uniforms[`u${name}`]={value:0};
    uniforms.uDpr={value:renderer.getPixelRatio()};
    uniforms.uDustGold={value:new THREE.Color(GOLDEN_LIGHT.halo)};
    uniforms.uDustCore={value:new THREE.Color(GOLDEN_LIGHT.core)};
    uniforms.uDustTint={value:new THREE.Color(GOLDEN_LIGHT.dust)};
    makeGrid(scene,uniforms);
    const leafOrigins=makeForest(scene,uniforms,compact);
    makeStars(scene,uniforms,compact,leafOrigins);
    const clock=createJourneyClock({reducedMotion});
    let frame=null,last=performance.now(),travel=0,active=true,progress=0;
    let resolveFinished;
    const finished=new Promise(resolve=>{resolveFinished=resolve;});
    function resize(){
        renderer.setSize(innerWidth,innerHeight,false);
        camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
        const ratio=renderer.getPixelRatio();ink.width=Math.round(innerWidth*ratio);ink.height=Math.round(innerHeight*ratio);
        context.setTransform(ratio,0,0,ratio,0,0);
    }
    function dispose(){
        if(!active)return;active=false;cancelAnimationFrame(frame);
        window.removeEventListener('resize',resize);window.removeEventListener('pagehide',dispose);
        document.removeEventListener('visibilitychange',visibility);document.removeEventListener('keydown',key);
        root.classList.remove('mind-journey-pending');wrapper.remove();
        scene.traverse(object=>{object.geometry?.dispose();if(object.material)object.material.dispose();});
        renderer.dispose();renderer.forceContextLoss();resolveFinished();onFinish();
    }
    function key(event){if(event.key==='Escape'){event.preventDefault();dispose();}}
    function visibility(){
        cancelAnimationFrame(frame);frame=null;last=performance.now();
        if(!document.hidden&&active)frame=requestAnimationFrame(animate);
    }
    function animate(now){
        if(!active||document.hidden)return;
        const delta=Math.min((now-last)/1000,.1);last=now;
        const state=clock.advance(delta);
        if(state.done){dispose();return;}
        const charge=smooth(2.55,3.08,state.ending)*(1-smooth(3.1,3.24,state.ending));
        const age=Math.max(0,state.ending-3.1);
        const impact=(1-Math.exp(-age*22))*Math.exp(-age*2.4);
        const coast=1-smooth(3.5,4.7,state.ending)*.85;
        travel+=delta*(reducedMotion?0:(3.6+state.space*4.5+state.gold*3))*(1-charge*.8)*coast*state.space;
        uniforms.uTime.value=state.elapsed;uniforms.uTravel.value=travel;
        for(const name of ['Growth','Fold','Gold','Burst','Space','Ending'])uniforms[`u${name}`].value=state[name.toLowerCase()];
        const position=trackAt(travel),ahead=trackAt(travel+10);
        const bank=reducedMotion?0:(Math.sin(travel*.05)*.24+Math.sin(travel*.021)*.05)*coast;
        camera.position.set(position.x,position.y+(reducedMotion?0:Math.sin(travel*.08)*.14),0);
        camera.up.set(bank,1,0);
        camera.lookAt(ahead.x,ahead.y,-10);
        camera.fov=reducedMotion?68:68-charge*7+impact*12;
        // The tunnel's vanishing point grows out of the former ball center,
        // then eases onto the rider's gaze as the camera enters the grid.
        const offset=1-smooth(3.2,6.2,state.time);
        camera.setViewOffset(innerWidth,innerHeight,(.5-origin.x)*innerWidth*offset,(.5-origin.y)*innerHeight*offset,innerWidth,innerHeight);
        renderer.domElement.style.opacity=String(state.space);
        renderer.render(scene,camera);
        drawVines(context,innerWidth,innerHeight,origin,state,reducedMotion);
        drawBurstLight(context,innerWidth,innerHeight,state,reducedMotion);
        const message=state.ending>=3.1?'万叶成星':charge>.08?'星光正在汇聚':state.gold>.03?'林叶正染上金色':state.growth>.2?'穿行于林间':state.space>.2?'空间正在展开':'藤蔓正在苏醒';
        if(status.dataset.phase!==message){status.dataset.phase=message;status.textContent=message;}
        wrapper.dataset.phase=state.burst>.05?'stars':state.gold>.03?'gold':state.growth>.2?'forest':state.space>.2?'grid':'vines';
        wrapper.dataset.loadProgress=String(Math.round(progress*100));
        if(state.reveal>0){root.classList.remove('mind-journey-pending');wrapper.style.opacity=String(1-state.reveal);}
        frame=requestAnimationFrame(animate);
    }
    skip.addEventListener('click',dispose);
    document.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);
    window.addEventListener('resize',resize,{passive:true});window.addEventListener('pagehide',dispose,{once:true});
    resize();frame=requestAnimationFrame(animate);
    return { get active(){return active;},finished,
        progress(event){if(event.total>0)progress=Math.max(progress,Math.min(.99,event.loaded/event.total));},
        ready(){progress=1;clock.settle();},
        fail(){clock.settle();},dispose };
}
