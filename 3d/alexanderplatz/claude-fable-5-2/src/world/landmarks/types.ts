import type { OrbitView, StreetView } from '../../camera/rig';

/** A hand-modelled landmark and the camera poses that show it off. */
export interface Landmark {
  id: string;
  name: string;
  kind: string;
  /** Overall height in metres. */
  height: number;
  /** Short factual lines for the info card. */
  facts: string[];
  /** What was simplified or invented in this model. */
  approximated: string;
  /** Label anchor in scene metres. */
  anchor: [number, number, number];
  orbit: OrbitView;
  street: StreetView;
}
