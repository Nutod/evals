import { buildBuildings } from './buildings';
import { buildGround } from './ground';
import { buildLandmarks } from './landmarks';
import type { Landmark } from './landmarks/types';
import { buildRail } from './rail';
import { buildStreets } from './streets';
import { buildVegetation } from './vegetation';
import { buildFountains } from './fountains';
import { buildFurniture } from './furniture';
import { buildPeople } from '../sim/people';
import { buildTraffic } from '../sim/traffic';
import { buildTrains } from '../sim/trains';
import { buildTrams } from '../sim/trams';
import { buildStreetNames } from './labels';
import type { World } from './world';

export interface BuildStep {
  label: string;
  run: (world: World) => Landmark[] | void;
}

export const BUILD_STEPS: BuildStep[] = [
  { label: 'Laying out the ground', run: buildGround },
  { label: 'Paving streets and tram tracks', run: buildStreets },
  { label: 'Raising buildings from OSM footprints', run: (w) => void buildBuildings(w) },
  { label: 'Building the Stadtbahn viaduct', run: buildRail },
  { label: 'Modelling the landmarks', run: buildLandmarks },
  { label: 'Filling the fountains', run: buildFountains },
  { label: 'Planting trees', run: buildVegetation },
  { label: 'Placing lamps, benches and shelters', run: buildFurniture },
  { label: 'Putting trams on the tracks', run: (w) => void (w.sims.trams = buildTrams(w)) },
  { label: 'Scheduling S-Bahn and regional trains', run: (w) => void (w.sims.trains = buildTrains(w)) },
  { label: 'Releasing traffic', run: (w) => void (w.sims.cars = buildTraffic(w)) },
  { label: 'Lettering the streets', run: buildStreetNames },
  { label: 'Sending people out', run: (w) => void (w.sims.people = buildPeople(w)) },
];
