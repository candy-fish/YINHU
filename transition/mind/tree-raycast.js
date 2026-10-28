// Copy buffer layout as well as values: Meshopt positions are normalized,
// interleaved Int16 attributes with a padding component after each XYZ vertex.
export function createBoundsTreeRequest(geometry) {
    const attribute = geometry.attributes.position;
    const position = attribute.array.slice();
    const index = geometry.index ? geometry.index.array.slice() : null;
    return {
        position,
        positionNormalized: attribute.normalized,
        positionStride: attribute.isInterleavedBufferAttribute ? attribute.data.stride : 3,
        positionOffset: attribute.isInterleavedBufferAttribute ? attribute.offset : 0,
        index,
        groups: geometry.groups,
        options: { indirect: true, setBoundingBox: false, targetLeafSize: 12 }
    };
}

export function generateBoundsTree(worker, geometry, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const request = createBoundsTreeRequest(geometry);
        const transferable = [request.position.buffer];
        if (request.index) transferable.push(request.index.buffer);
        const finish = (error, serialized) => {
            clearTimeout(timer);
            worker.onmessage = worker.onerror = worker.onmessageerror = null;
            if (error) reject(error);
            else resolve(serialized);
        };
        const timer = setTimeout(() => finish(new Error('Tree surface indexing timed out.')), timeoutMs);
        worker.onmessage = event => finish(event.data.error ? new Error(event.data.error) : null, event.data.serialized);
        worker.onerror = event => finish(new Error(event.message || 'Tree surface indexing failed.'));
        worker.onmessageerror = () => finish(new Error('Tree surface index could not be read.'));
        try { worker.postMessage(request, transferable); }
        catch (error) { finish(error); }
    });
}
