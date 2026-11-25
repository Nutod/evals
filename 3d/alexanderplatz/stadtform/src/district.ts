// Reuse the repository's metre-based OSM extract, individual landmark builders and transit simulations.
export { osm } from '../../claude-fable-5-2/src/data/osm';
export { CameraRig, type CameraMode } from '../../claude-fable-5-2/src/camera/rig';
export { shared } from '../../claude-fable-5-2/src/core/materials';
export { setMaxAnisotropy } from '../../claude-fable-5-2/src/core/textures';
export {
  createCollision,
  createWorld,
  LAYERS,
  QUALITY,
  type LayerId,
} from '../../claude-fable-5-2/src/world/world';
export { BUILD_STEPS } from '../../claude-fable-5-2/src/world/build';
export type { Landmark } from '../../claude-fable-5-2/src/world/landmarks/types';
export { MeshBuilder, xf, type V3 } from '../../claude-fable-5-2/src/core/mesh';
export { toRing, pointInRing, type P2 } from '../../claude-fable-5-2/src/core/geo';
export { canvasTexture, textSign } from '../../claude-fable-5-2/src/core/textures';
