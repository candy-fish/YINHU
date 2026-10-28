import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

self.onmessage = (event) => {
    try {
        const { position, positionNormalized = false, positionStride = 3, positionOffset = 0,
            index, groups, options } = event.data;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", positionStride === 3 && positionOffset === 0
            ? new THREE.BufferAttribute(position, 3, positionNormalized)
            : new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(position, positionStride),
                3, positionOffset, positionNormalized));
        if (index) geometry.setIndex(new THREE.BufferAttribute(index, 1));
        for (const group of groups) {
            geometry.addGroup(group.start, group.count, group.materialIndex);
        }

        const boundsTree = new MeshBVH(geometry, options);
        const serialized = MeshBVH.serialize(boundsTree, { cloneBuffers: false });
        const transferable = [...serialized.roots];
        if (serialized.index) transferable.push(serialized.index.buffer);
        if (serialized.indirectBuffer) transferable.push(serialized.indirectBuffer.buffer);

        self.postMessage({ serialized }, transferable);
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
