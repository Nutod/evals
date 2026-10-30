import * as THREE from 'three';
import type { OsmEdge } from '../osm';

export interface NetEdge {
  index: number;
  a: number;
  b: number;
  pts: THREE.Vector2[];
  /** Cumulative distance at each point. */
  cum: number[];
  length: number;
  src: OsmEdge;
}

export interface Link {
  edge: NetEdge;
  forward: boolean;
}

/** Undirected (or one-way aware) graph over baked OSM polylines. */
export class Network {
  edges: NetEdge[];
  private out = new Map<number, Link[]>();
  private degree = new Map<number, number>();

  constructor(src: OsmEdge[], respectOneway = false) {
    this.edges = src.map((e, index) => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < e.p.length; i += 2) pts.push(new THREE.Vector2(e.p[i], e.p[i + 1]));
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      return { index, a: e.a, b: e.b, pts, cum, length: cum[cum.length - 1], src: e };
    }).filter((e) => e.length > 0.5);
    for (const edge of this.edges) {
      for (const n of [edge.a, edge.b]) this.degree.set(n, (this.degree.get(n) ?? 0) + 1);
      this.link(edge.a, { edge, forward: true });
      if (!(respectOneway && edge.src.o)) this.link(edge.b, { edge, forward: false });
    }
  }

  private link(node: number, link: Link) {
    const list = this.out.get(node);
    if (list) list.push(link); else this.out.set(node, [link]);
  }

  /** Links leaving `node`. */
  from(node: number): Link[] {
    return this.out.get(node) ?? [];
  }

  /** Links that enter the network at a dead end (used to respawn agents at the edge of the map). */
  entries(): Link[] {
    const result: Link[] = [];
    for (const [node, links] of this.out) {
      if (links.length === 1 && this.degree.get(node) === 1) result.push(links[0]);
    }
    return result;
  }

  /** Position and unit direction at distance s along an edge (s measured from a). */
  sample(edge: NetEdge, s: number, pos: THREE.Vector2, dir: THREE.Vector2) {
    s = THREE.MathUtils.clamp(s, 0, edge.length);
    let i = 1;
    while (i < edge.cum.length - 1 && edge.cum[i] < s) i++;
    const a = edge.pts[i - 1], b = edge.pts[i];
    const seg = edge.cum[i] - edge.cum[i - 1];
    const t = seg > 0 ? (s - edge.cum[i - 1]) / seg : 0;
    pos.copy(a).lerp(b, t);
    dir.subVectors(b, a).normalize();
  }
}

export type Chooser = (options: Link[], heading: THREE.Vector2) => Link | null;

const tmpPos = new THREE.Vector2();
const tmpDir = new THREE.Vector2();

/** Picks a random continuation that does not turn more than `maxTurnDeg`, preferring straighter ones. */
export function gentleChooser(random: () => number, maxTurnDeg = 70): Chooser {
  const minDot = Math.cos(THREE.MathUtils.degToRad(maxTurnDeg));
  return (options, heading) => {
    const scored = options.map((link) => {
      const e = link.edge;
      const p0 = link.forward ? e.pts[0] : e.pts[e.pts.length - 1];
      const p1 = link.forward ? e.pts[1] : e.pts[e.pts.length - 2];
      return { link, dot: tmpDir.subVectors(p1, p0).normalize().dot(heading) };
    }).filter((o) => o.dot > minDot);
    if (!scored.length) return null;
    const weights = scored.map((o) => Math.pow(o.dot + 1, 4));
    let r = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < scored.length; i++) if ((r -= weights[i]) <= 0) return scored[i].link;
    return scored[scored.length - 1].link;
  };
}

interface TrailEntry {
  link: Link;
  /** Odometer reading when this link was entered at its start. */
  start: number;
}

/**
 * Moves along the network, remembering recently traversed links so that the
 * trailing cars of a tram or train can follow exactly in the head's track.
 */
export class Walker {
  odometer = 0;
  private trail: TrailEntry[] = [];
  /** Set when the walker hit a dead end on the last advance. */
  stuck = false;

  constructor(private net: Network, private choose: Chooser, link: Link, s = 0, private maxTrail = 220) {
    this.reset(link, s);
  }

  get link() {
    return this.trail[this.trail.length - 1].link;
  }

  /** Distance travelled along the current link. */
  get along() {
    return this.odometer - this.trail[this.trail.length - 1].start;
  }

  reset(link: Link, along = 0) {
    this.odometer = along;
    this.trail = [{ link, start: 0 }];
    this.stuck = false;
  }

  advance(ds: number) {
    this.odometer += ds;
    this.stuck = false;
    let guard = 0;
    while (this.along > this.link.edge.length && guard++ < 20) {
      const { edge, forward } = this.link;
      const end = forward ? edge.b : edge.a;
      this.sampleLink(this.link, edge.length, tmpPos, tmpDir);
      const options = this.net.from(end).filter((l) => l.edge !== edge);
      const next = this.choose(options, tmpDir);
      const enteredAt = this.trail[this.trail.length - 1].start + edge.length;
      if (!next) {
        this.odometer = enteredAt;
        this.stuck = true;
        return;
      }
      this.trail.push({ link: next, start: enteredAt });
    }
    // Drop history further back than any follower needs.
    while (this.trail.length > 2 && this.odometer - this.trail[1].start > this.maxTrail) this.trail.shift();
  }

  private sampleLink(link: Link, along: number, pos: THREE.Vector2, dir: THREE.Vector2) {
    const { edge, forward } = link;
    this.net.sample(edge, forward ? along : edge.length - along, pos, dir);
    if (!forward) dir.negate();
  }

  /** Position and heading `back` metres behind the head. */
  sampleBack(back: number, pos: THREE.Vector2, dir: THREE.Vector2) {
    const o = this.odometer - back;
    let i = this.trail.length - 1;
    while (i > 0 && this.trail[i].start > o) i--;
    const entry = this.trail[i];
    this.sampleLink(entry.link, Math.max(0, o - entry.start), pos, dir);
  }

  /** Distance to the end of the current link. */
  get remaining() {
    return this.link.edge.length - this.along;
  }
}
