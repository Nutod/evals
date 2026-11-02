import { mix, smooth } from "../state.js";
import { BRIDGES, riverX, roadX, eastPathX } from "./terrain.js";

export function joinZFor(x, z, bank) {
  if ((x > riverX(z) ? 1 : -1) === bank) return z;
  return BRIDGES.reduce((nearest, b) =>
    Math.abs(b[0] - z) < Math.abs(nearest[0] - z) ? b : nearest,
  )[0];
}

export function evacuationPoint(
  startX,
  startZ,
  joinZ,
  targetZ,
  progress,
  lane,
  bank,
) {
  const pathX = bank === 1 ? eastPathX : roadX;
  const homePath = startX > riverX(startZ) ? eastPathX : roadX;
  if (progress < 0.12)
    return {
      x: mix(startX, homePath(startZ) + lane, smooth(0, 0.12, progress)),
      z: startZ,
    };
  if (progress < 0.24) {
    const z = mix(startZ, joinZ, smooth(0.12, 0.24, progress));
    return { x: homePath(z) + lane, z };
  }
  if (progress < 0.5)
    return {
      x: mix(
        homePath(joinZ) + lane,
        pathX(joinZ) + lane,
        smooth(0.24, 0.5, progress),
      ),
      z: joinZ,
    };
  const z = mix(joinZ, targetZ, smooth(0.5, 1, progress));
  return { x: pathX(z) + lane, z };
}

export function bridgeExitPoint(
  startX,
  startZ,
  bridgeZ,
  targetX,
  targetZ,
  progress,
) {
  const bankPath = targetX > riverX(targetZ) ? eastPathX : roadX;
  const atBridge = startX + riverX(bridgeZ) - riverX(startZ);
  if (progress < 0.15) {
    const z = mix(startZ, bridgeZ, smooth(0, 0.15, progress));
    return { x: startX + riverX(z) - riverX(startZ), z };
  }
  if (progress < 0.5)
    return {
      x: mix(atBridge, bankPath(bridgeZ), smooth(0.15, 0.5, progress)),
      z: bridgeZ,
    };
  if (progress < 0.8) {
    const z = mix(bridgeZ, targetZ, smooth(0.5, 0.8, progress));
    return { x: bankPath(z), z };
  }
  return {
    x: mix(bankPath(targetZ), targetX, smooth(0.8, 1, progress)),
    z: targetZ,
  };
}
