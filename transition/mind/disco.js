(() => {
    "use strict";

    const MODEL_PATH = window.BLACKDOOR_ASSETS?.models?.disco || "../models/disco.glb";
    const STATE = Object.freeze({
        LOADING: "loading",
        ARMED: "armed",
        RELEASED: "released",
        DRAGGING: "dragging",
        ENTERING: "entering",
        RETRACTING: "retracting",
        ERROR: "error"
    });

    const FIXED_STEP = 1 / 120;
    const MAX_FRAME_TIME = 0.05;
    const ROPE_POINT_COUNT = 20;
    const CONSTRAINT_ITERATIONS = 7;
    const MAX_STEPS_PER_FRAME = 8;
    const DRAG_THRESHOLD = 6;

    const container = document.getElementById("canvas-container");
    const ropeSvg = document.getElementById("discoRope");
    const ropePath = document.getElementById("discoRopePath");
    const ropeTextPath = document.getElementById("discoRopeTextPath");
    const ropeEnd = document.getElementById("discoRopeEnd");
    const finePointerQuery = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!container || !ropeSvg || !ropePath || typeof THREE === "undefined" || !THREE.GLTFLoader) {
        console.error("Disco animation could not start: required DOM nodes or Three.js loader are missing.");
        return;
    }

    let state = STATE.LOADING;
    let width = container.clientWidth;
    let height = container.clientHeight;
    let anchor = { x: 0, y: 4 };
    let naturalRopeLength = 0;
    let ballDiameter = 0;
    let ballRadius = 0;
    let modelDiameter = 1;
    let pointerInHotspot = false;
    let lastPointer = null;
    let retractElapsed = 0;
    let accumulator = 0;
    let previousTime = performance.now();
    let spinAngle = 0;
    let pitchAngle = 0;
    let singleClickTimer = 0;
    let lastBallTap = null;
    let lastTouchTime = -Infinity;
    let drag = null;
    let suppressBallClickUntil = 0;

    const ball = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0
    };

    const ropePoints = [];
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const attachmentLocal = new THREE.Vector3();
    const attachmentOffset = new THREE.Vector3();
    let hasModelAttachment = false;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
        -width / 2,
        width / 2,
        height / 2,
        -height / 2,
        0.1,
        2000
    );
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    if ("outputEncoding" in renderer && THREE.sRGBEncoding) {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Only the ball receives pointer input; the rest of the canvas stays transparent to clicks.
    const dragHandle = document.createElement("div");
    dragHandle.className = "disco-ball-handle";
    dragHandle.hidden = true;
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.title = "拖拽摆动 · 下拉进入 · 单击收起 · 双击进入";
    container.appendChild(dragHandle);

    scene.add(new THREE.AmbientLight(0xdde5f0, 0.24));
    const keyLight = new THREE.DirectionalLight(0xfff2d0, 2.4);
    keyLight.position.set(220, 300, 700);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xb8d5ff, 1.4);
    rimLight.position.set(-300, 80, 350);
    scene.add(rimLight);

    const lighting = window.createDiscoLighting?.({ scene, renderer, reducedMotionQuery });

    const ballCarrier = new THREE.Group();
    const ballSpinner = new THREE.Group();
    ballCarrier.add(ballSpinner);
    ballCarrier.visible = false;
    scene.add(ballCarrier);

    let discoModel = null;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function computeLayout() {
        anchor.y = 4;
        naturalRopeLength = clamp(height * 0.12, 84, 112);
        ballDiameter = clamp(height * 0.16, 110, 160);
        ballRadius = ballDiameter / 2;
        anchor.x = Math.max(ballRadius + 12, Math.min(width * 0.82, width - ballRadius - 12));
        dragHandle.style.width = `${ballDiameter}px`;
        dragHandle.style.height = `${ballDiameter}px`;
        lighting?.resize(width, height);

        ropeSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        ropeSvg.setAttribute("width", String(width));
        ropeSvg.setAttribute("height", String(height));
    }

    function hiddenBallPosition() {
        return {
            x: anchor.x + Math.min(18, width * 0.014),
            y: Math.min(anchor.y - naturalRopeLength + attachmentDistance(), -ballRadius - 18)
        };
    }

    function attachmentDistance() {
        return hasModelAttachment ? attachmentLocal.length() * ballDiameter / modelDiameter : ballRadius * 0.88;
    }

    function ballAttachment() {
        if (hasModelAttachment) {
            attachmentOffset.copy(attachmentLocal).multiplyScalar(ballDiameter / modelDiameter)
                .applyEuler(ballSpinner.rotation).applyEuler(ballCarrier.rotation);
            return { x: ball.x + attachmentOffset.x, y: ball.y - attachmentOffset.y };
        }
        return {
            x: ball.x,
            y: ball.y - ballRadius * 0.88
        };
    }

    function initializeRope() {
        const end = ballAttachment();
        const waveAmplitude = Math.min(34, naturalRopeLength * 0.085);
        ropePoints.length = 0;

        for (let index = 0; index < ROPE_POINT_COUNT; index += 1) {
            const t = index / (ROPE_POINT_COUNT - 1);
            const point = {
                x: anchor.x + (end.x - anchor.x) * t + Math.sin(t * Math.PI * 4) * waveAmplitude,
                y: anchor.y + (end.y - anchor.y) * t - Math.sin(t * Math.PI) * 18,
                previousX: 0,
                previousY: 0
            };
            point.previousX = point.x;
            point.previousY = point.y;
            ropePoints.push(point);
        }
    }

    function resetToArmed() {
        const hidden = hiddenBallPosition();
        ball.x = hidden.x;
        ball.y = hidden.y;
        ball.vx = 0;
        ball.vy = 0;
        retractElapsed = 0;
        accumulator = 0;
        spinAngle = 0;
        pitchAngle = 0;
        ballCarrier.rotation.set(0, 0, 0);
        ballSpinner.rotation.set(0, 0, 0);
        ballCarrier.visible = false;
        ropeSvg.classList.remove("is-visible");
        document.documentElement.classList.remove("is-over-disco-ball");
        initializeRope();
        updateVisuals();
        state = STATE.ARMED;
    }

    function releaseBall() {
        if (state !== STATE.ARMED || !discoModel) return;

        const reduced = reducedMotionQuery.matches;
        ball.vx = reduced ? -28 : -105;
        ball.vy = reduced ? 16 : 32;
        ballCarrier.visible = true;
        ropeSvg.classList.add("is-visible");
        state = STATE.RELEASED;
    }

    function retractBall() {
        if (state !== STATE.RELEASED) return;
        state = STATE.RETRACTING;
        retractElapsed = 0;
        document.documentElement.classList.remove("is-over-disco-ball");
    }

    function maximumRopeDistance() {
        return (naturalRopeLength + attachmentDistance()) * (reducedMotionQuery.matches ? 1.10 : 1.18);
    }

    function stepReleased(dt) {
        const reduced = reducedMotionQuery.matches;
        const gravity = 1700;
        const springStrength = reduced ? 110 : 90;
        const radialDamping = reduced ? 9.5 : 5.5;
        const airDamping = Math.exp(-(reduced ? 0.72 : 0.22) * dt);
        const restDistance = naturalRopeLength + attachmentDistance();

        let accelerationX = 0;
        let accelerationY = gravity;
        const deltaX = ball.x - anchor.x;
        const deltaY = ball.y - anchor.y;
        const distance = Math.hypot(deltaX, deltaY) || 0.0001;
        const extension = distance - restDistance;

        if (extension > 0) {
            const directionX = deltaX / distance;
            const directionY = deltaY / distance;
            const radialVelocity = ball.vx * directionX + ball.vy * directionY;
            const tension = springStrength * extension + radialDamping * Math.max(radialVelocity, 0);
            accelerationX -= directionX * tension;
            accelerationY -= directionY * tension;
        }

        ball.vx = (ball.vx + accelerationX * dt) * airDamping;
        ball.vy = (ball.vy + accelerationY * dt) * airDamping;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // A partial entrance pull can stretch the rope beyond its usual reach.
        // Relax that extra reach continuously instead of teleporting on release.
        const maximumDistance = Math.max(maximumRopeDistance(), distance * Math.exp(-3 * dt));
        const finalDeltaX = ball.x - anchor.x;
        const finalDeltaY = ball.y - anchor.y;
        const finalDistance = Math.hypot(finalDeltaX, finalDeltaY) || 0.0001;

        if (finalDistance > maximumDistance) {
            const directionX = finalDeltaX / finalDistance;
            const directionY = finalDeltaY / finalDistance;
            ball.x = anchor.x + directionX * maximumDistance;
            ball.y = anchor.y + directionY * maximumDistance;

            const outwardSpeed = ball.vx * directionX + ball.vy * directionY;
            if (outwardSpeed > 0) {
                const rebound = reduced ? 0.04 : 0.16;
                ball.vx -= directionX * outwardSpeed * (1 + rebound);
                ball.vy -= directionY * outwardSpeed * (1 + rebound);
            }
        }
    }

    function stepRetracting(dt) {
        retractElapsed += dt;
        const target = hiddenBallPosition();
        const stiffness = reducedMotionQuery.matches ? 92 : 118;
        const damping = reducedMotionQuery.matches ? 18 : 14.5;

        const accelerationX = (target.x - ball.x) * stiffness - ball.vx * damping;
        const accelerationY = (target.y - ball.y) * stiffness - ball.vy * damping;
        ball.vx += accelerationX * dt;
        ball.vy += accelerationY * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        const distanceToTarget = Math.hypot(target.x - ball.x, target.y - ball.y);
        if ((distanceToTarget < 4 && Math.hypot(ball.vx, ball.vy) < 34) || retractElapsed > 1.7) {
            resetToArmed();
        }
    }

    function pinRopeEnds() {
        if (!ropePoints.length) return;
        const end = ballAttachment();
        const first = ropePoints[0];
        const last = ropePoints[ropePoints.length - 1];

        first.x = anchor.x;
        first.y = anchor.y;
        first.previousX = first.x;
        first.previousY = first.y;
        last.x = end.x;
        last.y = end.y;
        last.previousX = last.x;
        last.previousY = last.y;
    }

    function stepRope(dt) {
        if (ropePoints.length !== ROPE_POINT_COUNT) return;

        const ropeGravity = 1600;
        const verletDamping = state === STATE.RETRACTING ? 0.91 : 0.985;
        const segmentLength = naturalRopeLength / (ROPE_POINT_COUNT - 1);

        pinRopeEnds();
        for (let index = 1; index < ropePoints.length - 1; index += 1) {
            const point = ropePoints[index];
            const velocityX = (point.x - point.previousX) * verletDamping;
            const velocityY = (point.y - point.previousY) * verletDamping;
            point.previousX = point.x;
            point.previousY = point.y;
            point.x += velocityX;
            point.y += velocityY + ropeGravity * dt * dt;
        }

        for (let iteration = 0; iteration < CONSTRAINT_ITERATIONS; iteration += 1) {
            pinRopeEnds();
            for (let index = 0; index < ropePoints.length - 1; index += 1) {
                const first = ropePoints[index];
                const second = ropePoints[index + 1];
                const deltaX = second.x - first.x;
                const deltaY = second.y - first.y;
                const distance = Math.hypot(deltaX, deltaY) || 0.0001;
                const correction = (distance - segmentLength) / distance;

                if (index === 0) {
                    second.x -= deltaX * correction;
                    second.y -= deltaY * correction;
                } else if (index + 1 === ropePoints.length - 1) {
                    first.x += deltaX * correction;
                    first.y += deltaY * correction;
                } else {
                    const halfCorrection = correction * 0.5;
                    first.x += deltaX * halfCorrection;
                    first.y += deltaY * halfCorrection;
                    second.x -= deltaX * halfCorrection;
                    second.y -= deltaY * halfCorrection;
                }
            }
        }
        pinRopeEnds();
    }

    function updateRopePath() {
        if (!ropePoints.length || state === STATE.ARMED || state === STATE.LOADING || state === STATE.ERROR) {
            ropePath.setAttribute("d", "");
            ropeEnd?.setAttribute("d", "");
            return;
        }

        let pathData = `M ${ropePoints[0].x.toFixed(2)} ${ropePoints[0].y.toFixed(2)}`;
        for (let index = 1; index < ropePoints.length - 1; index += 1) {
            const point = ropePoints[index];
            const next = ropePoints[index + 1];
            const midpointX = (point.x + next.x) * 0.5;
            const midpointY = (point.y + next.y) * 0.5;
            pathData += ` Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${midpointX.toFixed(2)} ${midpointY.toFixed(2)}`;
        }
        const last = ropePoints[ropePoints.length - 1];
        pathData += ` T ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
        ropePath.setAttribute("d", pathData);
        // Leave room for complete lettering and a short connector into the actual eyelet.
        const length = typeof ropePath.getTotalLength === "function" ? ropePath.getTotalLength() :
            ropePoints.slice(1).reduce((total, point, i) =>
                total + Math.hypot(point.x - ropePoints[i].x, point.y - ropePoints[i].y), 0);
        ropeTextPath?.setAttribute("textLength", String(Math.max(1, length - 15)));
        const before = ropePoints[ropePoints.length - 2];
        const dx = last.x - before.x;
        const dy = last.y - before.y;
        const directionLength = Math.hypot(dx, dy) || 1;
        ropeEnd?.setAttribute("d", `M ${last.x - dx / directionLength * 12} ${last.y - dy / directionLength * 12} L ${last.x} ${last.y}`);
    }

    function updateVisuals(frameDelta = 0) {
        ballCarrier.position.set(ball.x - width / 2, height / 2 - ball.y, 0);
        dragHandle.hidden = state !== STATE.RELEASED && state !== STATE.DRAGGING;
        dragHandle.style.transform = `translate3d(${ball.x - ballRadius}px, ${ball.y - ballRadius}px, 0)`;
        if (discoModel) {
            ballSpinner.scale.setScalar(ballDiameter / modelDiameter);
            const ropeAngle = Math.atan2(ball.x - anchor.x, Math.max(1, ball.y - anchor.y));
            const motionTilt = clamp(-ball.vx / 900, -0.22, 0.22);
            const targetTilt = ropeAngle * 0.22 + motionTilt;
            const tiltBlend = 1 - Math.exp(-5.5 * frameDelta);

            ballCarrier.rotation.z += (targetTilt - ballCarrier.rotation.z) * tiltBlend;
            pitchAngle += frameDelta * clamp(ball.vy / 1050, -0.38, 0.38);
            pitchAngle *= Math.exp(-0.42 * frameDelta);
            pitchAngle = clamp(pitchAngle, -0.24, 0.24);
            spinAngle += frameDelta * (reducedMotionQuery.matches ? 0.14 : 0.32);
            ballSpinner.rotation.set(pitchAngle, spinAngle, 0);
        }
        pinRopeEnds();
        updateRopePath();
        lighting?.update({
            visible: ballCarrier.visible,
            x: ball.x,
            y: ball.y,
            radius: ballRadius,
            spin: spinAngle,
            tilt: ballCarrier.rotation.z,
            delta: frameDelta
        });
    }

    function isInteractiveControl(target) {
        return target instanceof Element && Boolean(target.closest(
            "#calendarIcon, #calendarContainer, #calendarModal, button, a, input, select, textarea"
        ));
    }

    function isBallHit(clientX, clientY) {
        if (!discoModel || !ballCarrier.visible || state !== STATE.RELEASED) return false;
        const bounds = container.getBoundingClientRect();
        pointerNdc.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
        pointerNdc.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        return raycaster.intersectObject(ballSpinner, true).length > 0;
    }

    function hotspotContains(clientX, clientY) {
        const hotspotRadius = 100;
        const deltaX = clientX - anchor.x;
        const deltaY = clientY - anchor.y;
        const insideCircle = deltaX * deltaX + deltaY * deltaY <= hotspotRadius * hotspotRadius;
        return deltaY >= 0 && insideCircle;
    }

    function onPointerMove(event) {
        if (drag && event.pointerId === drag.pointerId) {
            event.preventDefault();
            moveDraggedBall(event);
            return;
        }
        if (event.pointerType && event.pointerType !== "mouse") return;
        lastPointer = { x: event.clientX, y: event.clientY };

        if (finePointerQuery.matches) {
            const inHotspot = hotspotContains(event.clientX, event.clientY);
            if (inHotspot && !pointerInHotspot) releaseBall();
            pointerInHotspot = inHotspot;
        }

        if (isInteractiveControl(event.target)) {
            document.documentElement.classList.remove("is-over-disco-ball");
            return;
        }
        document.documentElement.classList.toggle(
            "is-over-disco-ball",
            isBallHit(event.clientX, event.clientY)
        );
    }

    function onPointerDown(event) {
        if (drag || event.button !== 0 || isInteractiveControl(event.target) ||
            !isBallHit(event.clientX, event.clientY)) return;

        window.clearTimeout(singleClickTimer);
        singleClickTimer = 0;
        const bounds = container.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            offsetX: ball.x - (event.clientX - bounds.left),
            offsetY: ball.y - (event.clientY - bounds.top),
            moved: false,
            entryY: Math.min(height - ballRadius - 20, Math.max(height * 0.42,
                anchor.y + naturalRopeLength + attachmentDistance() + 110)),
            sampleTime: performance.now()
        };
        ball.vx = 0;
        ball.vy = 0;
        accumulator = 0;
        state = STATE.DRAGGING;
        dragHandle.setPointerCapture(event.pointerId);
        document.documentElement.classList.add("is-dragging-disco-ball");
    }

    function moveDraggedBall(event) {
        if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.moved = true;
        lastBallTap = null;

        const bounds = container.getBoundingClientRect();
        const pointerX = event.clientX - bounds.left + drag.offsetX;
        const pointerY = event.clientY - bounds.top + drag.offsetY;
        const pullingDown = pointerY > drag.startY - bounds.top && Math.abs(pointerX - anchor.x) < ballDiameter * 1.25;
        const extension = pullingDown ? Math.min(height * 0.30,
            Math.max(0, pointerY - anchor.y - naturalRopeLength - attachmentDistance()) * 0.85) : 0;
        const maximumDistance = maximumRopeDistance() + extension;
        let x = clamp(event.clientX - bounds.left + drag.offsetX, ballRadius + 8, width - ballRadius - 8);
        let y = clamp(event.clientY - bounds.top + drag.offsetY, ballRadius + 8, height - ballRadius - 8);
        const distance = Math.hypot(x - anchor.x, y - anchor.y);
        if (distance > maximumDistance) {
            x = anchor.x + (x - anchor.x) * maximumDistance / distance;
            y = anchor.y + (y - anchor.y) * maximumDistance / distance;
        }
        // Keep the whole ball on screen even when pulled almost horizontally.
        y = Math.max(ballRadius + 8, y);
        const horizontalReach = Math.sqrt(Math.max(0, maximumDistance ** 2 - (y - anchor.y) ** 2));
        x = clamp(x, anchor.x - horizontalReach, anchor.x + horizontalReach);

        const now = performance.now();
        const dt = Math.max((now - drag.sampleTime) / 1000, 0.001);
        const blend = 1 - Math.exp(-dt / 0.035);
        const speedLimit = reducedMotionQuery.matches ? 650 : 1800;
        let vx = (x - ball.x) / dt;
        let vy = (y - ball.y) / dt;
        const speed = Math.hypot(vx, vy);
        if (speed > speedLimit) {
            vx *= speedLimit / speed;
            vy *= speedLimit / speed;
        }
        ball.vx += (vx - ball.vx) * blend;
        ball.vy += (vy - ball.vy) * blend;
        ball.x = x;
        ball.y = y;
        drag.sampleTime = now;
        updateVisuals();
        if (pullingDown && pointerY >= drag.entryY && event.clientY - drag.startY >= 85) {
            beginMindEntry();
        }
    }

    function beginMindEntry() {
        const origin = { x: ball.x, y: ball.y, radius: ballRadius };
        finishDrag(null, true);
        window.clearTimeout(singleClickTimer);
        singleClickTimer = 0;
        state = STATE.ENTERING;
        // The threshold can be crossed between render frames. Freeze the ball
        // at this pointer position so the silver wire and black seed align.
        updateVisuals();
        renderer.render(scene, camera);
        dragHandle.hidden = true;
        document.documentElement.classList.remove('is-over-disco-ball');
        try {
            if (window.BlackDoorMindEntry?.start({ ...origin, onNavigate: openMindPage })) return;
        } catch (error) { console.warn('Mind journey could not start.', error); }
        openMindPage();
    }

    function finishDrag(event, cancelled = false) {
        if (!drag || (event && event.pointerId !== drag.pointerId)) return;
        const { pointerId, moved, sampleTime } = drag;
        // A paused hand should drop the ball gently instead of replaying an old fling.
        const momentum = cancelled ? 0 : Math.exp(-Math.max(0, performance.now() - sampleTime - 40) / 70);
        ball.vx *= momentum;
        ball.vy *= momentum;
        if (moved) {
            suppressBallClickUntil = performance.now() + 600;
            lastBallTap = null;
        }
        drag = null;
        state = STATE.RELEASED;
        document.documentElement.classList.remove("is-dragging-disco-ball");
        if (dragHandle.hasPointerCapture(pointerId)) dragHandle.releasePointerCapture(pointerId);
    }

    function openMindPage() {
        window.clearTimeout(singleClickTimer);
        singleClickTimer = 0;
        window.location.href = "mind/mind.html";
    }

    function onBallClick(event) {
        if (state === STATE.ENTERING || drag || performance.now() < suppressBallClickUntil) return;
        if (event.button !== 0 || isInteractiveControl(event.target)) return;

        const touch = event.pointerType === 'touch' || performance.now() - lastTouchTime < 700;
        if (touch && state === STATE.ARMED && hotspotContains(event.clientX, event.clientY)) {
            releaseBall();
            return;
        }

        const ballWasHit = isBallHit(event.clientX, event.clientY);
        const doubleTap = touch && lastBallTap && performance.now() - lastBallTap.time < 400 &&
            Math.hypot(event.clientX - lastBallTap.x, event.clientY - lastBallTap.y) < 32;
        if ((doubleTap || event.detail >= 2) && (ballWasHit || singleClickTimer)) {
            lastBallTap = null;
            openMindPage();
            return;
        }

        if (!ballWasHit) return;
        lastBallTap = { x: event.clientX, y: event.clientY, time: performance.now() };
        window.clearTimeout(singleClickTimer);
        singleClickTimer = window.setTimeout(() => {
            retractBall();
            singleClickTimer = 0;
        }, 500);
    }

    function onDoubleClick(event) {
        if (state === STATE.ENTERING || drag || performance.now() < suppressBallClickUntil) return;
        if (isInteractiveControl(event.target)) return;
        if (!singleClickTimer && !isBallHit(event.clientX, event.clientY)) return;
        openMindPage();
    }

    function onResize() {
        if (drag) finishDrag(null, true);
        const previousAnchor = { ...anchor };
        const previousLength = naturalRopeLength || 1;

        width = container.clientWidth;
        height = container.clientHeight;
        computeLayout();
        const scale = naturalRopeLength / previousLength;

        if (state === STATE.ARMED || state === STATE.LOADING) {
            const hidden = hiddenBallPosition();
            ball.x = hidden.x;
            ball.y = hidden.y;
            initializeRope();
        } else {
            ball.x = anchor.x + (ball.x - previousAnchor.x) * scale;
            ball.y = anchor.y + (ball.y - previousAnchor.y) * scale;
            ball.vx *= scale;
            ball.vy *= scale;

            for (const point of ropePoints) {
                point.x = anchor.x + (point.x - previousAnchor.x) * scale;
                point.y = anchor.y + (point.y - previousAnchor.y) * scale;
                point.previousX = anchor.x + (point.previousX - previousAnchor.x) * scale;
                point.previousY = anchor.y + (point.previousY - previousAnchor.y) * scale;
            }
        }

        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        pointerInHotspot = Boolean(lastPointer && hotspotContains(lastPointer.x, lastPointer.y));
        updateVisuals();

    }

    function animate(timestamp) {
        requestAnimationFrame(animate);
        if (state === STATE.ENTERING) { previousTime = timestamp; return; }
        const frameDelta = Math.min((timestamp - previousTime) / 1000, MAX_FRAME_TIME);
        previousTime = timestamp;

        if (state === STATE.RELEASED || state === STATE.DRAGGING || state === STATE.RETRACTING) {
            accumulator += frameDelta;
            let steps = 0;
            while (accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
                if (state === STATE.RELEASED) stepReleased(FIXED_STEP);
                if (state === STATE.RETRACTING) stepRetracting(FIXED_STEP);
                if (state === STATE.RELEASED || state === STATE.DRAGGING || state === STATE.RETRACTING) stepRope(FIXED_STEP);
                accumulator -= FIXED_STEP;
                steps += 1;
            }
            if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
        }

        updateVisuals(frameDelta);
        renderer.render(scene, camera);
    }

    computeLayout();
    const initialHidden = hiddenBallPosition();
    ball.x = initialHidden.x;
    ball.y = initialHidden.y;
    initializeRope();

    function mountModel(model) {
        discoModel = model;
        const bounds = new THREE.Box3().setFromObject(discoModel);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        modelDiameter = Math.max(size.x, size.y, size.z) || 1;
        discoModel.position.sub(center);
        const attachment = discoModel.getObjectByName("disco-rope-attachment");
        hasModelAttachment = Boolean(attachment);
        if (attachment) attachmentLocal.copy(attachment.position).add(discoModel.position);
        ballSpinner.add(discoModel);
        resetToArmed();
    }

    if (lighting) {
        mountModel(lighting.createModel());
    } else {
        // Retain the original asset as a fallback when the lighting script is unavailable.
        const loader = new THREE.GLTFLoader();
        loader.load(
            MODEL_PATH,
            gltf => mountModel(gltf.scene),
            undefined,
            (error) => {
                state = STATE.ERROR;
                ballCarrier.visible = false;
                ropeSvg.classList.remove("is-visible");
                ropePath.setAttribute("d", "");
                console.error("Disco model failed to load:", error);
            }
        );
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener('pointerup', event => {
        if (event.pointerType === 'touch') lastTouchTime = performance.now();
        finishDrag(event);
    }, { passive: true });
    window.addEventListener("pointercancel", event => finishDrag(event, true), { passive: true });
    dragHandle.addEventListener("lostpointercapture", event => finishDrag(event, true));
    window.addEventListener("blur", () => finishDrag(null, true));
    window.addEventListener("click", onBallClick);
    window.addEventListener("dblclick", onDoubleClick, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener('pageshow', event => {
        if (event.persisted && state === STATE.ENTERING) resetToArmed();
    });
    new ResizeObserver(onResize).observe(container);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) finishDrag(null, true);
        previousTime = performance.now();
        accumulator = 0;
    });

    requestAnimationFrame(animate);
})();
