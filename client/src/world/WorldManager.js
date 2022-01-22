import * as THREE from "three";

import textureManager from "../managers/TextureManager";
import workerManager from "../managers/WorkerManager";
import { g, scene } from "../globals";

class World {
  constructor() {
    this.blockSize = 16;
    this.cellSize = undefined;
    this.buildHeight = undefined;
    this.itemId = undefined;
    this.blockId = undefined;
    this.blockOrder = undefined;
    this.entities = undefined;
  }

  computeVoxelOffset(x, y, z) {
    const { cellSize, cellSliceSize } = this;
    const voxelX = THREE.MathUtils.euclideanModulo(x, cellSize) | 0;
    const voxelY = THREE.MathUtils.euclideanModulo(y, cellSize) | 0;
    const voxelZ = THREE.MathUtils.euclideanModulo(z, cellSize) | 0;
    return voxelY * cellSliceSize + voxelZ * cellSize + voxelX;
  }

  computeCellId(x, y, z) {
    const { cellSize } = this;
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellZ = Math.floor(z / cellSize);
    return `${cellX},${cellY},${cellZ}`;
  }
  computeCoordsFromId(id) {
    const [cellX, cellY, cellZ] = id.split(",").map(Number);
    return {
      x: cellX * this.cellSize,
      y: cellY * this.cellSize,
      z: cellZ * this.cellSize,
    };
  }
  computeCellFromPlayer(x, y, z) {
    const { cellSize } = this;
    const cellX = Math.floor(x / cellSize / this.blockSize);
    const cellY = Math.floor(y / cellSize / this.blockSize);
    const cellZ = Math.floor(z / cellSize / this.blockSize);
    return {
      x: cellX,
      y: cellY,
      z: cellZ,
      id: `${cellX},${cellY},${cellZ}`,
    };
  }
  addCellForVoxel(x, y, z) {
    const cellId = this.computeCellId(x, y, z);
    let cell = this.cells[cellId];
    if (!cell) {
      const { cellSize } = this;
      cell = new Uint8Array(new SharedArrayBuffer(cellSize * cellSize * cellSize));
      this.cells[cellId] = cell;
    }
    return cell;
  }
  getCellForVoxel(x, y, z) {
    if (!this.cells) return;
    return this.cells[this.computeCellId(x, y, z)];
  }
  getCellPosFromId(id) {
    let pos = id.split(",");
    return {
      x: parseInt(pos[0]),
      y: parseInt(pos[1]),
      z: parseInt(pos[2]),
    };
  }
  setVoxel(x, y, z, v, addCell = true) {
    let cell = this.getCellForVoxel(x, y, z);
    if (!cell) {
      if (!addCell) {
        return;
      }
      cell = this.addCellForVoxel(x, y, z);
    }
    const voxelOffset = this.computeVoxelOffset(x, y, z);
    cell[voxelOffset] = v;
  }
  getVoxel(x, y, z) {
    const cell = this.getCellForVoxel(x, y, z);
    if (!cell) {
      return 0;
    }
    const voxelOffset = this.computeVoxelOffset(x, y, z);
    return cell[voxelOffset];
  }

  generateCell(cellX, cellY, cellZ) {
    if (!this.cells[`${cellX},${cellY},${cellZ}`]) {
      // Check if chunk already exists
      const { cellSize } = this;
      this.cells[`${cellX},${cellY},${cellZ}`] = new Uint8Array(new SharedArrayBuffer(Math.pow(cellSize, 3))).fill(255);
    }
  }

  deleteChunk(chunk, permanently) {
    for (let i = 0; i < world.buildHeight / this.cellSize + 1; i++) {
      let id = `${chunk.x},${i},${chunk.z}`;

      this.deleteCell(id, permanently);
    }
  }

  deleteCell(id, permanently) {
    if (g.cellIdToMesh[id]) {
      let opaqueMesh = g.cellIdToMesh[id][0];
      let transparentMesh = g.cellIdToMesh[id][1];

      if (opaqueMesh) {
        opaqueMesh.visible = false;
      }
      if (transparentMesh) {
        transparentMesh.visible = false;
      }

      // Delete cell permanently
      if (permanently) {
        if (opaqueMesh) {
          opaqueMesh.geometry.dispose();
          opaqueMesh.material.dispose();
          scene.remove(opaqueMesh);
        }

        if (transparentMesh) {
          transparentMesh.geometry.dispose();
          transparentMesh.material.dispose();
          scene.remove(transparentMesh);
        }

        delete g.cellIdToMesh[id];
      }
    }
  }

  generateGeometryBlockEntity(uvVoxel) {
    const { tileSize, tileTextureWidth, tileTextureHeight } = this;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    // There is a voxel here but do we need faces for it?
    for (const { dir, corners, uvRow } of World.faces) {
      // this voxel has no neighbor in this direction so we need a face.
      const ndx = positions.length / 3;
      for (const { pos, uv } of corners) {
        positions.push((pos[0] * this.blockSize) / 4, (pos[1] * this.blockSize) / 4, (pos[2] * this.blockSize) / 4);
        normals.push(...dir);
        uvs.push(((uvVoxel + uv[0]) * tileSize) / tileTextureWidth, 1 - ((uvRow + 1 - uv[1]) * tileSize) / tileTextureHeight);
      }
      indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
    }

    return {
      positions,
      normals,
      uvs,
      indices,
    };
  }

  getFirstEntity() {
    if (Object.keys(this.entities).length) {
      return this.entities[Object.keys(this.entities)[0]];
    }
  }
}

World.faces = [
  {
    // left
    uvRow: 0,
    dir: [-1, 0, 0],
    corners: [
      { pos: [0, 1, 0], uv: [0, 1] },
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [0, 0, 1], uv: [1, 0] },
    ],
  },
  {
    // right
    uvRow: 0,
    dir: [1, 0, 0],
    corners: [
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [1, 0, 0], uv: [1, 0] },
    ],
  },
  {
    // bottom
    uvRow: 1,
    dir: [0, -1, 0],
    corners: [
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 1] },
      { pos: [0, 0, 0], uv: [0, 1] },
    ],
  },
  {
    // top
    uvRow: 2,
    dir: [0, 1, 0],
    corners: [
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 0] },
    ],
  },
  {
    // back
    uvRow: 0,
    dir: [0, 0, -1],
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 1] },
    ],
  },
  {
    // front
    uvRow: 0,
    dir: [0, 0, 1],
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [0, 1] },
      { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
];

let cells = [];

const neighborOffsets = [
  [0, 0, 0], // self
  [-1, 0, 0], // left
  [1, 0, 0], // right
  [0, -1, 0], // down
  [0, 1, 0], // up
  [0, 0, -1], // back
  [0, 0, 1], // front
];

export function updateVoxelGeometry(x, y, z, neighbor, forceUpdate) {
  let { cellSize } = world;

  cells.length = 0;
  const updatedCellIds = {};

  for (let offset of neighborOffsets) {
    const ox = x + offset[0];
    const oy = y + offset[1];
    const oz = z + offset[2];
    const cellId = world.computeCellId(ox, oy, oz);

    if (!updatedCellIds[cellId]) {
      // Don't reupdate the cell once updated
      updatedCellIds[cellId] = true;

      const cellX = Math.floor(ox / cellSize);
      const cellY = Math.floor(oy / cellSize);
      const cellZ = Math.floor(oz / cellSize);

      let cell = new Int16Array(new ArrayBuffer(4 * 4)); // Int8 is enough for now (max of 256 chunk radius)
      cell[0] = cellX;
      cell[1] = cellY;
      cell[2] = cellZ;
      cell[3] = forceUpdate ? 1 : 0;

      cells.push(cell);
    }

    if (!neighbor) break;
  }

  workerManager.updateVoxelWorkers(cells);
}

// Update the voxel geometry for a single cell
export function updateCellMesh(data) {
  let [opaqueGeometry, cellX, cellY, cellZ, transparentGeometry, forceUpdate] = data;
  let meshO, meshT;

  let cellId = cellX + "," + cellY + "," + cellZ;

  if (g.cellIdToMesh[cellId]) {
    meshO = g.cellIdToMesh[cellId][0];
    meshT = g.cellIdToMesh[cellId][1];
  } else if (g.cellIdToMesh[cellId]) {
    g.cellIdToMesh[cellId].length = 0;
  } else {
    g.cellIdToMesh[cellId] = [];
  }

  // OPAQUE TEXTURES
  if (opaqueGeometry.positions.length > 0 || forceUpdate) {
    const geometry = meshO ? meshO.geometry : new THREE.BufferGeometry();
    setGeometry(geometry, opaqueGeometry);

    if (!meshO) {
      meshO = new THREE.Mesh(geometry, textureManager.material);
      g.cellIdToMesh[cellId][0] = meshO;
      setChunkMesh(cellX, cellY, cellZ, cellId, meshO);
    }
  }

  // TRANSPARENT TEXTURES
  if (transparentGeometry.positions.length > 0 || forceUpdate) {
    const geometry = meshT ? meshT.geometry : new THREE.BufferGeometry();
    setGeometry(geometry, transparentGeometry);

    if (!meshT) {
      meshT = new THREE.Mesh(geometry, textureManager.materialTransparent);
      g.cellIdToMesh[cellId][1] = meshT;
      setChunkMesh(cellX, cellY, cellZ, cellId, meshT);
    }
  }
}

// Set the geometry of the mesh
export function setGeometry(geometry, data) {
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
}

// Set the mesh in the chunk
export function setChunkMesh(cellX, cellY, cellZ, cellId, mesh) {
  let { blockSize, cellSize } = world;
  mesh.name = cellId;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(cellX * cellSize * blockSize, cellY * cellSize * blockSize, cellZ * cellSize * blockSize);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);
}

const world = new World();
globalThis.world = world;
export default world;
