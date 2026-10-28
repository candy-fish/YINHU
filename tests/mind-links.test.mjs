import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThoughtConnections, createBoltGeometry, getDiamondBoundary } from '../transition/mind/thought-links.js';

const head = { x: 200, y: 500 };
const cards = [
    { x: 80, y: 100, rx: 55, ry: 55 },
    { x: 300, y: 100, rx: 55, ry: 55 },
    { x: 200, y: 280, rx: 55, ry: 55 }
];
const onEdge = (point, card) => Math.abs(point.x - card.x) / card.rx + Math.abs(point.y - card.y) / card.ry;
const atVertex = (point, card) => (point.x === card.x && Math.abs(Math.abs(point.y - card.y) - card.ry) < 1e-10)
    || (point.y === card.y && Math.abs(Math.abs(point.x - card.x) - card.rx) < 1e-10);

test('lightning ends on the outer outline, including its offset beyond the rotated border', () => {
    for (const size of [76, 92, 114]) {
        const rotatedSize = size * Math.SQRT2;
        const boundary = getDiamondBoundary({ x: 10, y: 20, width: rotatedSize, height: rotatedSize }, 5, 1);
        assert.ok(Math.abs(boundary.rx - (size / 2 + 6) * Math.SQRT2) < 1e-10);
        const connections = buildThoughtConnections(head, [boundary]);
        assert.ok(Math.abs(onEdge(connections[0].to, boundary) - 1) < 1e-10);
        const inner = { ...boundary, rx: rotatedSize / 2, ry: rotatedSize / 2 };
        assert.ok(onEdge(connections[0].to, inner) > 1);
    }
});

test('each equipped card connects to the head and other cards at outer diamond vertices', () => {
    assert.deepEqual(buildThoughtConnections(head, []), []);
    const one = buildThoughtConnections(head, cards.slice(0, 1));
    assert.equal(one.length, 1);
    assert.deepEqual(one[0].from, head);
    const connections = buildThoughtConnections(head, cards);
    assert.equal(connections.length, 6);
    connections.slice(0, 3).forEach((connection, index) => {
        assert.deepEqual(connection.from, head);
        assert.ok(Math.abs(onEdge(connection.to, cards[index]) - 1) < 1e-10);
        assert.ok(atVertex(connection.to, cards[index]));
    });
    for (const connection of connections.slice(3)) {
        assert.ok(cards.some(card => atVertex(connection.from, card)));
        assert.ok(cards.some(card => atVertex(connection.to, card)));
    }
    assert.ok(new Set(connections.map(connection => connection.width)).size > 1);
});

test('head lightning selects the facing vertex for each approach direction', () => {
    const card = { x: 200, y: 200, rx: 65, ry: 65 };
    for (const [origin, target] of [
        [{ x: 230, y: 500 }, { x: 200, y: 265 }],
        [{ x: 180, y: -100 }, { x: 200, y: 135 }],
        [{ x: 500, y: 230 }, { x: 265, y: 200 }],
        [{ x: -100, y: 180 }, { x: 135, y: 200 }]
    ]) assert.deepEqual(buildThoughtConnections(origin, [card])[0].to, target);
});

test('large collections retain a connected network with a bounded number of bolts', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ x: index % 6 * 150, y: Math.floor(index / 6) * 200, rx: 55, ry: 55 }));
    const connections = buildThoughtConnections(head, many);
    assert.equal(connections.slice(0, many.length).length, 60);
    assert.ok(connections.length <= many.length * 4);
    assert.ok(connections.slice(60).every(connection => Math.hypot(connection.to.x - connection.from.x, connection.to.y - connection.from.y) > 0));
});

test('lightning moves continuously, varies thickness and preserves the connection anchors', () => {
    const connection = buildThoughtConnections(head, cards)[0];
    const first = createBoltGeometry(connection, 0);
    const moved = createBoltGeometry(connection, 1);
    assert.notEqual(first.body, moved.body);
    assert.deepEqual(first, createBoltGeometry(connection, 0));
    for (const geometry of [first, moved]) {
        assert.ok(!/NaN|Infinity/.test(geometry.body + geometry.branch + geometry.spine));
        assert.equal((geometry.branch.match(/M/g) || []).length, 2);
        const points = [...geometry.body.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
        const half = points.length / 2;
        const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const start = middle(points[0], points.at(-1));
        const end = middle(points[half - 1], points[half]);
        assert.ok(Math.hypot(start.x - connection.from.x, start.y - connection.from.y) < .01);
        assert.ok(Math.hypot(end.x - connection.to.x, end.y - connection.to.y) < .01);
        const widths = points.slice(0, half).map((point, index) => Math.hypot(point.x - points.at(-1 - index).x, point.y - points.at(-1 - index).y));
        assert.ok(Math.max(...widths) > Math.min(...widths) * 2);
    }
    assert.deepEqual(createBoltGeometry({ ...connection, from: head, to: head }, 0), { body: '', branch: '', spine: '' });
});

test('every fine branch starts and ends on the animated main lightning', () => {
    for (const distance of [25, 150, 500]) {
        const connection = { from: head, to: { x: head.x + 60, y: head.y - distance }, width: 2, seed: 3 };
        for (const time of [0, .6, 1.8]) {
            const geometry = createBoltGeometry(connection, time);
            const coordinates = path => [...path.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].map(match => `${match[1]},${match[2]}`);
            const spine = new Set(coordinates(geometry.spine));
            for (const branch of geometry.branch.split('M').filter(Boolean)) {
                const points = coordinates(branch);
                assert.ok(spine.has(points[0]), 'branch starts on the main lightning');
                assert.ok(spine.has(points.at(-1)), 'branch merges back into the main lightning');
                assert.ok(points.slice(1, -1).some(point => !spine.has(point)), 'branch diverges between its anchors');
            }
        }
    }
});
