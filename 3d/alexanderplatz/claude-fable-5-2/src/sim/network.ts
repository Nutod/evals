import { Polyline, type P2 } from '../core/geo';

export interface Edge<T = unknown> {
  id: number;
  from: number;
  to: number;
  line: Polyline;
  data: T;
}

/** Directed graph of polylines joined at shared node ids. */
export class Network<T = unknown> {
  readonly edges: Edge<T>[] = [];
  readonly out = new Map<number, Edge<T>[]>();
  readonly incoming = new Map<number, Edge<T>[]>();
  readonly position = new Map<number, P2>();

  add(from: number, to: number, pts: P2[], data: T): Edge<T> {
    const edge: Edge<T> = { id: this.edges.length, from, to, line: new Polyline(pts), data };
    this.edges.push(edge);
    push(this.out, from, edge);
    push(this.incoming, to, edge);
    this.position.set(from, pts[0]);
    this.position.set(to, pts[pts.length - 1]);
    return edge;
  }

  outgoing(node: number): Edge<T>[] {
    return this.out.get(node) ?? [];
  }

  /** Nodes nothing leads into / out of: where vehicles enter and leave. */
  sources(): number[] {
    return [...this.position.keys()].filter((n) => !this.incoming.get(n)?.length && this.out.get(n)?.length);
  }

  sinks(): number[] {
    return [...this.position.keys()].filter((n) => !this.out.get(n)?.length && this.incoming.get(n)?.length);
  }

  /** Dijkstra over edge lengths; returns the edge used to reach each node. */
  shortestPaths(source: number): { dist: Map<number, number>; via: Map<number, Edge<T>> } {
    const dist = new Map<number, number>([[source, 0]]);
    const via = new Map<number, Edge<T>>();
    const open = new Set<number>([source]);
    while (open.size) {
      let node = -1;
      let best = Infinity;
      for (const n of open) {
        const d = dist.get(n)!;
        if (d < best) {
          best = d;
          node = n;
        }
      }
      open.delete(node);
      for (const e of this.outgoing(node)) {
        const d = best + e.line.length;
        if (d < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, d);
          via.set(e.to, e);
          open.add(e.to);
        }
      }
    }
    return { dist, via };
  }

  pathTo(target: number, via: Map<number, Edge<T>>): Edge<T>[] {
    const path: Edge<T>[] = [];
    let node = target;
    for (let guard = 0; guard < 10000; guard++) {
      const e = via.get(node);
      if (!e) break;
      path.unshift(e);
      node = e.from;
    }
    return path;
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Joins the polylines of consecutive edges into one path. */
export function joinEdges(edges: Edge[]): Polyline {
  const pts: P2[] = [];
  for (const e of edges) {
    const start = pts.length ? 1 : 0;
    for (let i = start; i < e.line.pts.length; i++) pts.push(e.line.pts[i]);
  }
  return new Polyline(pts);
}

export interface Route {
  line: Polyline;
  from: number;
  to: number;
}

/**
 * Through-routes for rail vehicles: for every entry point the longest
 * shortest-paths to exits accepted by `isExit`, skipping near-duplicates.
 */
export function throughRoutes(net: Network, isExit: (p: P2) => boolean, minLength: number, perSource = 2, limit = 10): Route[] {
  const routes: Route[] = [];
  const sinks = net.sinks().filter((n) => isExit(net.position.get(n)!));
  for (const source of net.sources()) {
    if (!isExit(net.position.get(source)!)) continue;
    const { dist, via } = net.shortestPaths(source);
    const reachable = sinks.filter((s) => (dist.get(s) ?? 0) >= minLength).sort((a, b) => dist.get(b)! - dist.get(a)!);
    let taken = 0;
    for (const sink of reachable) {
      const pb = net.position.get(sink)!;
      // exits a few metres apart are the same street; keep one
      if (routes.some((r) => r.from === source && Math.hypot(net.position.get(r.to)![0] - pb[0], net.position.get(r.to)![1] - pb[1]) < 120)) continue;
      routes.push({ line: joinEdges(net.pathTo(sink, via)), from: source, to: sink });
      if (++taken >= perSource) break;
    }
  }
  return routes.sort((a, b) => b.line.length - a.line.length).slice(0, limit);
}
