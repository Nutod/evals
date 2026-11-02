// Hour streaming: content that belongs to a span of the day is built when the
// slider comes within reach of it, kept warm for the neighbouring hours and
// disposed once the slider is far away. Shared anchors never go through here.

export class HourStream {
  constructor(scene) {
    this.scene = scene;
    this.entries = [];
  }

  /** factory(ctx) returns { object, update(S), dispose() }. Span is [first hour, last hour]. */
  add(name, span, factory) {
    this.entries.push({ name, span, factory, inst: null });
  }

  update(S, ctx, force = false) {
    let built = 0;
    for (const e of this.entries) {
      const [a, b] = e.span;
      const want = S.t > a - 1.05 && S.t < b + 1.05;
      const keep = S.t > a - 1.7 && S.t < b + 1.7;
      if (want && !e.inst && (force || built === 0)) {
        e.inst = e.factory(ctx);
        if (e.inst.object) this.scene.add(e.inst.object);
        built++;
      } else if (!keep && e.inst) {
        if (e.inst.object) this.scene.remove(e.inst.object);
        e.inst.dispose?.();
        e.inst = null;
      }
      if (e.inst) {
        const active = S.t > a - 1 && S.t < b + 1;
        if (e.inst.object) e.inst.object.visible = active;
        if (active) e.inst.update?.(S);
      }
    }
  }

  /** Re-creates resident entries (after a quality change). */
  rebuild(S, ctx) {
    for (const e of this.entries) {
      if (!e.inst) continue;
      if (e.inst.object) this.scene.remove(e.inst.object);
      e.inst.dispose?.();
      e.inst = null;
    }
    this.update(S, ctx, true);
  }

  resident() {
    return this.entries.filter((e) => e.inst).map((e) => e.name);
  }
}

/** Disposes geometries and materials under an object. */
export function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
}
