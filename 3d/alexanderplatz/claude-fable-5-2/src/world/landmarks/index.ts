import type { World } from '../world';
import { buildFernsehturm } from './fernsehturm';
import { buildMarienkirche } from './marienkirche';
import { buildParkInn } from './parkinn';
import { buildRathaus } from './rathaus';
import { buildStation } from './station';
import type { Landmark } from './types';
import { buildWeltzeituhr } from './weltzeituhr';

export function buildLandmarks(world: World): Landmark[] {
  return [buildFernsehturm(world), buildParkInn(world), buildWeltzeituhr(world), buildStation(world), buildRathaus(world), buildMarienkirche(world)];
}
