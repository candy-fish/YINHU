(() => {
    "use strict";

    // Both the mirror reflections and the room lighting are generated locally.
    window.createDiscoLighting = ({ scene, renderer, reducedMotionQuery }) => {
        const canvas = document.createElement("canvas");
        canvas.id = "disco-lighting";
        canvas.setAttribute("aria-hidden", "true");
        document.body.appendChild(canvas);
        const ctx = canvas.getContext("2d", { alpha: true });
        let width = 1;
        let height = 1;
        let opacity = 0;
        let lightTime = 0;
        let active = false;

        // A small HDR studio: bright rectangular lamps, dark areas and a warm ceiling.
        // Metal needs an environment to reflect; direct lights alone look like white clay.
        const envWidth = 512;
        const envHeight = 256;
        const pixels = new Float32Array(envWidth * envHeight * 4);
        const panels = [
            { u: 0.12, v: 0.43, w: 0.026, h: 0.19, power: 7, tint: [0.84, 0.91, 1] },
            { u: 0.36, v: 0.28, w: 0.10, h: 0.026, power: 5, tint: [1, 0.89, 0.65] },
            { u: 0.58, v: 0.52, w: 0.05, h: 0.13, power: 9, tint: [1, 0.97, 0.87] },
            { u: 0.83, v: 0.40, w: 0.018, h: 0.24, power: 6, tint: [0.77, 0.86, 1] },
            { u: 0.96, v: 0.72, w: 0.10, h: 0.035, power: 2, tint: [1, 0.80, 0.49] }
        ];
        for (let y = 0; y < envHeight; y++) {
            for (let x = 0; x < envWidth; x++) {
                const u = x / envWidth;
                const v = y / envHeight;
                const index = (y * envWidth + x) * 4;
                const room = 0.018 + 0.075 * Math.max(0, Math.sin(u * Math.PI * 12)) * Math.sin(v * Math.PI);
                pixels[index] = room;
                pixels[index + 1] = room * 0.98;
                pixels[index + 2] = room * 0.92;
                for (const panel of panels) {
                    const du = Math.min(Math.abs(u - panel.u), 1 - Math.abs(u - panel.u));
                    const rectangle = Math.exp(-Math.pow(du / panel.w, 8) - Math.pow((v - panel.v) / panel.h, 8));
                    for (let c = 0; c < 3; c++) pixels[index + c] += rectangle * panel.power * panel.tint[c];
                }
                pixels[index + 3] = 1;
            }
        }
        const environment = new THREE.DataTexture(pixels, envWidth, envHeight, THREE.RGBAFormat, THREE.FloatType);
        environment.mapping = THREE.EquirectangularReflectionMapping;
        environment.needsUpdate = true;
        const pmrem = new THREE.PMREMGenerator(renderer);
        const environmentTarget = pmrem.fromEquirectangular(environment);
        scene.environment = environmentTarget.texture;
        environment.dispose();
        pmrem.dispose();

        const mirror = new THREE.MeshPhysicalMaterial({
            color: 0xdde0df,
            metalness: 1,
            roughness: 0.145,
            envMapIntensity: 1.2,
            clearcoat: 0.6,
            clearcoatRoughness: 0.09
        });

        function createModel() {
            const model = new THREE.Group();
            model.name = "disco-mirror-ball";
            const backing = new THREE.MeshStandardMaterial({ color: 0x111313, metalness: 0.85, roughness: 0.38 });
            model.add(new THREE.Mesh(new THREE.SphereGeometry(0.995, 64, 32), backing));

            // Individual tangent planes give each little mirror its own true reflection.
            // Keeping square facets separate also preserves the fine, dark grout lines.
            const rows = 32;
            const pitch = Math.PI / rows;
            const rings = Array.from({ length: rows }, (_, row) => {
                const latitude = -Math.PI / 2 + (row + 0.5) * pitch;
                return { latitude, count: Math.max(6, Math.round(Math.PI * 2 * Math.cos(latitude) / pitch)) };
            });
            const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mirror,
                rings.reduce((total, ring) => total + ring.count, 0));
            tiles.name = "disco-mirror-tiles";
            const normal = new THREE.Vector3();
            const east = new THREE.Vector3();
            const north = new THREE.Vector3();
            const matrix = new THREE.Matrix4();
            const basis = new THREE.Matrix4();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            const color = new THREE.Color();
            let index = 0;
            for (const ring of rings) {
                const horizontalPitch = Math.PI * 2 * Math.cos(ring.latitude) / ring.count;
                for (let column = 0; column < ring.count; column++) {
                    const longitude = column / ring.count * Math.PI * 2;
                    normal.set(Math.cos(ring.latitude) * Math.sin(longitude), Math.sin(ring.latitude),
                        Math.cos(ring.latitude) * Math.cos(longitude));
                    east.set(Math.cos(longitude), 0, -Math.sin(longitude));
                    north.crossVectors(normal, east);
                    basis.makeBasis(east, north, normal);
                    rotation.setFromRotationMatrix(basis);
                    scale.set(horizontalPitch * 0.95, pitch * 0.95, 1);
                    matrix.compose(normal.multiplyScalar(1.002), rotation, scale);
                    tiles.setMatrixAt(index, matrix);
                    const silver = 0.78 + 0.20 * ((Math.sin(index * 127.1) * 43758.5453) % 1 + 1) / 2;
                    tiles.setColorAt(index, color.setRGB(silver, silver, silver));
                    index++;
                }
            }
            model.add(tiles);
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.05, 24), mirror);
            cap.position.y = 1.012;
            model.add(cap);
            const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 24), mirror);
            eyelet.name = "disco-eyelet";
            eyelet.position.y = 1.067;
            model.add(eyelet);
            const attachment = new THREE.Object3D();
            attachment.name = "disco-rope-attachment";
            attachment.position.y = 1.102;
            model.add(attachment);
            return model;
        }

        // Stable, irregular spacing avoids a repeating wallpaper of light dots.
        let seed = 58319;
        const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        const palette = ["255,221,158", "245,226,188", "239,211,164", "200,222,244",
            "238,194,215", "185,219,202", "205,192,240"];
        const reflections = Array.from({ length: 155 }, () => ({
            x: random(), y: random(), phase: random() * Math.PI * 2,
            size: 2 + Math.pow(random(), 1.8) * 10, stretch: 0.45 + random() * 0.85,
            angle: random() * Math.PI, strength: 0.24 + random() * 0.54,
            color: palette[Math.floor(Math.pow(random(), 1.6) * palette.length)]
        }));
        const dust = Array.from({ length: 38 }, () => ({
            x: random(), y: random(), phase: random() * Math.PI * 2, radius: 0.4 + random() * 1.1
        }));
        const stars = Array.from({ length: 24 }, () => ({
            x: random(), y: random(), phase: random() * Math.PI * 2,
            size: 2 + random() * 2.4, color: palette[Math.floor(random() * palette.length)]
        }));

        function resize(nextWidth, nextHeight) {
            width = nextWidth;
            height = nextHeight;
            const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        }

        function glow(x, y, radius, color, strength, scaleX = 1, scaleY = 1) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scaleX, scaleY);
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
            gradient.addColorStop(0, `rgba(${color},${strength})`);
            gradient.addColorStop(0.35, `rgba(${color},${strength * 0.44})`);
            gradient.addColorStop(1, `rgba(${color},0)`);
            ctx.fillStyle = gradient;
            ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
            ctx.restore();
        }

        function beam(x, y, targetX, targetY, startWidth, endWidth, color, strength) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(targetY - y, targetX - x) - Math.PI / 2);
            const length = Math.hypot(targetX - x, targetY - y);
            // An elongated radial falloff has no polygon edges or visible feathering bands.
            glow(0, length * 0.48, 1, color, strength,
                (startWidth + endWidth) * 0.7, length * 0.58);
            ctx.restore();
        }

        function star(x, y, size, color, strength) {
            glow(x, y, size * 4.5, color, strength * 0.18);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(0.12);
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
            gradient.addColorStop(0, `rgba(255,250,235,${strength})`);
            gradient.addColorStop(0.25, `rgba(${color},${strength * 0.7})`);
            gradient.addColorStop(1, `rgba(${color},0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = i * Math.PI / 4;
                const reach = i % 2 ? size * 0.14 : size;
                const px = Math.cos(angle) * reach;
                const py = Math.sin(angle) * reach;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        function update({ visible, x, y, radius, spin, tilt, delta }) {
            const target = visible ? 1 : 0;
            opacity += (target - opacity) * (1 - Math.exp(-delta * (visible ? 2.5 : 4.5)));
            if (Math.abs(opacity - target) < 0.003) opacity = target;
            const lit = opacity > 0.01;
            if (lit !== active) {
                active = lit;
                document.documentElement.classList.toggle("is-disco-lit", lit);
            }
            canvas.style.opacity = String(opacity);
            if (!ctx || !lit || document.hidden) return;
            const reduced = reducedMotionQuery.matches;
            if (!reduced) lightTime += delta;
            const rotation = reduced ? 0 : spin;
            const lightTilt = reduced ? 0 : tilt;
            const swayX = (x / width - 0.82) * 90;
            const swayY = lightTilt * 50;
            ctx.clearRect(0, 0, width, height);

            // The source stays in the upper-right corner; the moving ball scatters its light.
            const sourceX = width + Math.min(90, width * 0.12);
            const sourceY = -50;
            const hitX = x + radius * 0.35;
            const hitY = y - radius * 0.25;
            glow(width * 0.43 + swayX, height * 0.67, width * 0.65, "176,153,116", 0.095, 1, 0.60);
            glow(x - radius, y + radius, width * 0.40, "206,181,145", 0.10, 1.15, 0.85);
            beam(sourceX, sourceY, hitX, hitY, 34, radius * 0.42, "249,234,206", 0.19);
            beam(sourceX, sourceY, hitX, hitY, 90, radius * 1.2, "230,219,200", 0.055);
            glow(hitX, hitY, radius * 1.3, "249,230,194", 0.14);

            // Broad, overlapping spectral rays read as refracted light instead of neon stripes.
            const spectrum = ["255,132,152", "255,181,104", "255,226,128", "133,225,177",
                "118,192,255", "164,147,242", "211,135,238"];
            const distance = Math.hypot(width, height) * 0.95;
            for (let band = 0; band < spectrum.length; band++) {
                const angle = 2.37 + band * 0.075 + lightTilt * 0.32 + Math.sin(rotation * 0.12) * 0.025;
                beam(x - radius * 0.12, y + radius * 0.12,
                    x + Math.cos(angle) * distance, y + Math.sin(angle) * distance,
                    radius * 0.13, distance * 0.045, spectrum[band], 0.12);
            }

            // The reflected mirror tiles travel in slow arcs and lean with the pendulum.
            for (const spot of reflections) {
                const depth = 0.28 + spot.y * 0.72;
                const travel = rotation * 0.12 + spot.phase;
                const px = spot.x * (width + 100) - 50 + Math.sin(travel) * 55 * depth + swayX * depth;
                const py = spot.y * height + Math.cos(travel * 0.65) * 18 + swayY * depth;
                const pulse = 0.72 + 0.28 * Math.sin(rotation * 0.8 + spot.phase);
                const corridor = Math.exp(-Math.pow((px - x + (py - y) * 1.2) / (width * 0.42), 2));
                const strength = spot.strength * pulse * (0.18 + corridor * 0.82) * (0.45 + depth * 0.55);
                const size = spot.size * (0.7 + depth * 0.7) * Math.min(width / 900, 1.2);
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(spot.angle * 0.4 + Math.sin(travel) * 0.20 + lightTilt * 0.5);
                glow(0, 0, size * 2.3, spot.color, strength * 0.18, 1.5, spot.stretch);
                glow(0, 0, size, spot.color, strength * 0.52, 1.2, spot.stretch * 0.65);
                ctx.restore();
            }

            for (const sparkle of stars) {
                const twinkle = Math.pow(0.5 + 0.5 * Math.sin(lightTime * 0.65 + sparkle.phase), 3);
                const px = sparkle.x * width + swayX * 0.22;
                const py = sparkle.y * height + Math.sin(lightTime * 0.08 + sparkle.phase) * 7;
                star(px, py, sparkle.size, sparkle.color, 0.08 + twinkle * 0.60);
            }
            star(x + radius * 0.72, y - radius * 0.70, 4.5, "245,233,211", 0.55);
            star(x - radius * 0.82, y + radius * 0.54, 2.8, "204,215,239", 0.30);

            for (const particle of dust) {
                const px = particle.x * width + Math.sin(lightTime * 0.12 + particle.phase) * 15;
                const py = ((particle.y * height - lightTime * 2.5) % height + height) % height;
                const proximity = Math.max(0, 1 - Math.abs(px - x) / (width * 0.5));
                ctx.fillStyle = `rgba(247,230,186,${proximity * 0.15})`;
                ctx.beginPath();
                ctx.arc(px, py, particle.radius, 0, Math.PI * 2);
                ctx.fill();
            }

            // Restrained spill around the ball; the facets supply the sharp highlights.
            glow(x, y, radius * 2.1, "244,226,177", 0.12);
        }

        return {
            resize,
            update,
            createModel
        };
    };
})();
