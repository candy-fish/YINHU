import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export { createAuroraScene } from './aurora-3d.js';

const radians = THREE.MathUtils.degToRad;
const vertexShader = `
  #include <common>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>
  varying vec2 vPattern;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vBuild;
  uniform float uBuildBase;
  uniform float uBuildHeight;
  void main() {
    #include <morphinstance_vertex>
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vNormal = normalize(transformedNormal);
    vView = -mvPosition.xyz;
    vPattern = position.xy;
    vBuild = clamp((mvPosition.y - uBuildBase) / uBuildHeight, 0.0, 1.0);
  }
`;
const fragmentShader = `
  uniform sampler2D uCode;
  uniform sampler2D uSurface;
  uniform float uTime;
  uniform float uFish;
  uniform float uReveal;
  varying vec2 vPattern;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vBuild;
  void main() {
    float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.15);
    vec2 codeUV = vPattern * vec2(1.25, .67) + vec2(uTime * .018, -uTime * .075);
    float code = texture2D(uCode, codeUV).r;
    float scales = texture2D(uSurface, vPattern * vec2(.9, 1.2)).r;
    float scan = .91 + .09 * sin(vPattern.y * 195.0 - uTime * 5.0);
    float density = (.13 + edge * .77 + code * 1.05 + scales * mix(.035, .16, uFish)) * scan;
    vec3 color = vec3(197.0, 217.0, 81.0) / 255.0; // #C5D951
    float alpha = clamp(density, .0, .94);
    if (uReveal < .999) {
      float front = uReveal * 1.35 - .12;
      float filled = 1.0 - smoothstep(front - .07, front + .025, vBuild);
      float contour = (1.0 - smoothstep(front + .07, front + .25, vBuild)) * (1.0 - filled);
      float ribbon = exp(-pow((vBuild - front) / .045, 2.0));
      float digits = smoothstep(.45, .85, code);
      alpha = (alpha * filled + (edge * .85 + digits * .65) * contour + ribbon * .35) * smoothstep(0.0, .035, uReveal);
    }
    gl_FragColor = vec4(color * (.82 + edge * .18 + code * .15), clamp(alpha, .0, .94));
  }
`;

// One draw call per skinned animal; the page's existing clock owns animation.
export async function createHologramCompanions(root) {
  const loader = new GLTFLoader();
  const textures = new THREE.TextureLoader();
  const actors = [];
  let disposed = false;
  let code, surface;
  try {
    [code, surface] = await Promise.all([
      textures.loadAsync(new URL('./hologram-code.png', import.meta.url).href),
      textures.loadAsync(new URL('./fish-surface.png', import.meta.url).href)
    ]);
    for (const texture of [code, surface]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }
    for (const role of ['deer', 'fish']) {
      const gltf = await loader.loadAsync(new URL(`./${role}-companion.glb`, import.meta.url).href);
      let model;
      gltf.scene.traverse(object => { if (object.userData.imagesRole === role) model = object; });
      if (!model) throw new Error(`Missing ${role} armature`);
      const scene = new THREE.Scene();
      scene.add(model);
      const holder = root.querySelector(`.${role}-facing`);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      const fish = role === 'fish';
      const width = fish ? 60 : 180, height = fish ? 30 : 192;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.domElement.className = 'companion-hologram';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      // More space above the deer keeps high jumps/antlers in view. The camera
      // scale and bottom edge stay fixed, so the animal and road alignment do not change.
      const halfHeight = fish ? .68 : 2.36 * height / 150;
      const camera = new THREE.OrthographicCamera(-halfHeight * width / height, halfHeight * width / height, halfHeight, -halfHeight, .1, 40);
      if (fish) { camera.position.set(.2, .18, 8); camera.lookAt(-.08, 0, 0); }
      else { const center = 1.60 + halfHeight - 2.36; camera.position.set(1.1, center, 10); camera.lookAt(-.28, center, 0); }
      const material = new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: { uCode: { value: code }, uSurface: { value: surface }, uTime: { value: 0 }, uFish: { value: Number(fish) },
          uReveal: { value: 1 }, uBuildBase: { value: 0 }, uBuildHeight: { value: 1 } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const bones = new Map();
      const surfaces = [];
      const rest = new Map();
      const axes = new Map();
      const yawAxes = new Map();
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      material.uniforms.uBuildBase.value = bounds.min.y - camera.position.y - .04;
      material.uniforms.uBuildHeight.value = bounds.max.y - bounds.min.y + .08;
      model.traverse(object => {
        if (object.isMesh) { object.material?.dispose(); object.material = material; object.frustumCulled = false; surfaces.push(object); }
        if (!object.isBone) return;
        bones.set(object.name, object);
        rest.set(object.name, { quaternion: object.quaternion.clone(), position: object.position.clone() });
        const inverse = object.getWorldQuaternion(new THREE.Quaternion()).invert();
        // Blender sagittal rotation about +Y becomes glTF rotation about -Z.
        axes.set(object.name, new THREE.Vector3(0, 0, -1).applyQuaternion(inverse));
        yawAxes.set(object.name, new THREE.Vector3(0, 1, 0).applyQuaternion(inverse));
      });
      const body = bones.get(fish ? 'fish-body' : 'body');
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(body.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      const neutral = JSON.parse(model.userData.imagesNeutralAngles || '{}');
      const actor = { role, model, scene, camera, renderer, material, holder, bones, rest, axes, yawAxes, neutral, down, surfaces };
      actors.push(actor);
      // Compile before hiding the fallback, so a shader failure preserves the SVG.
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      holder.append(renderer.domElement);
      holder.parentElement.classList.add('has-hologram');
    }
    root.dataset.renderer = 'hologram-3d';
  } catch (error) {
    for (const actor of actors) { actor.holder.parentElement.classList.remove('has-hologram'); actor.renderer.domElement.remove(); actor.renderer.dispose(); actor.material.dispose(); }
    code?.dispose(); surface?.dispose();
    throw error;
  }
  const rotation = new THREE.Quaternion();
  function turn(actor, name, angle, axis = actor.axes.get(name)) {
    const bone = actor.bones.get(name);
    if (bone && axis) bone.quaternion.copy(actor.rest.get(name).quaternion).multiply(rotation.setFromAxisAngle(axis, radians(angle)));
  }
  return {
    update(pose, legs, time, reduced) {
      if (disposed) return;
      for (const actor of actors) {
        actor.material.uniforms.uTime.value = reduced ? 0 : time;
        const reveal = pose.reveal ?? 1;
        actor.material.uniforms.uReveal.value = reduced ? 1 : actor.role === 'fish' ? THREE.MathUtils.clamp((reveal - .045) / .955, 0, 1) : reveal;
        if (actor.role === 'deer') {
          actor.model.rotation.y = (1 - pose.facing) * Math.PI / 2;
          turn(actor, 'body', pose.tilt);
          const body = actor.bones.get('body');
          body.position.copy(actor.rest.get('body').position).addScaledVector(actor.down, pose.bob / 100);
          turn(actor, 'neck', pose.neck * (104 / 124));
          turn(actor, 'neck-mid', pose.graze * 46 + (pose.neckSpring || 0));
          turn(actor, 'neck-upper', -pose.graze * 8 - (pose.neckSpring || 0) * .55);
          turn(actor, 'head', pose.head * (88 / 61));
          for (const surface of actor.surfaces) {
            const index = surface.morphTargetDictionary?.[actor.model.userData.imagesGrazeCorrective];
            if (index !== undefined) surface.morphTargetInfluences[index] = pose.graze;
            for (const [key, value] of [['imagesRunCoil', pose.coil], ['imagesRunReach', pose.reach]]) {
              const morph = surface.morphTargetDictionary?.[actor.model.userData[key]];
              if (morph !== undefined) surface.morphTargetInfluences[morph] = value || 0;
            }
          }
          const head = actor.bones.get('head');
          head.quaternion.multiply(rotation.setFromAxisAngle(actor.yawAxes.get('head'), (1 - pose.yaw) * 1.4));
          turn(actor, 'ear-near', pose.ear * -.7);
          turn(actor, 'ear-far', pose.ear);
          turn(actor, 'muzzle', pose.chew);
          for (const leg of legs) {
            const rest = actor.neutral[leg.name] || {};
            for (const part of ['thigh', 'upper', 'lower', 'hoof']) {
              turn(actor, `${part}-${leg.name}`, (leg.angles[part] || 0) - (rest[part] || 0) - (part === 'hoof' ? pose.tilt : 0));
            }
          }
        } else {
          actor.model.rotation.y = (1 - pose.fishFacing) * Math.PI / 2;
          turn(actor, 'fish-body', pose.fishBend || 0, actor.yawAxes.get('fish-body'));
          turn(actor, 'fish-tail', pose.tail, actor.yawAxes.get('fish-tail'));
          turn(actor, 'fish-dorsal', pose.fin * .35, actor.axes.get('fish-dorsal'));
          turn(actor, 'fish-fin-near', pose.fin, actor.axes.get('fish-fin-near'));
          turn(actor, 'fish-fin-far', -pose.fin * .8, actor.axes.get('fish-fin-far'));
        }
        actor.renderer.render(actor.scene, actor.camera);
      }
    },
    dispose() {
      disposed = true;
      for (const actor of actors) {
        actor.holder.parentElement.classList.remove('has-hologram');
        actor.renderer.domElement.remove(); actor.renderer.dispose(); actor.material.dispose();
        actor.model.traverse(object => object.geometry?.dispose());
      }
      code.dispose(); surface.dispose();
    }
  };
}
