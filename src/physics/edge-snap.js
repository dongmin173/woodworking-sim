window.EdgeSnap = class {
  constructor() {
    this.lock = null;
    this.hoverMotion = null;
    this.edges = [];
    this.shapes = new Map();
    this.probe = null;
    this.radius = 0;
    this.snapPixels = 10;
    this.releasePixels = 26;
  }

  clear() {
    this.lock = null;
    this.hoverMotion = null;
  }

  rebuild(boards) {
    this.clear();
    this.shapes.forEach(shape => shape.remove());

    this.shapes = new Map(
      boards.map(board => [board.id, Wood.shape(board)])
    );

    this.edges = Wood.sorted(boards).reverse().flatMap(board =>
      board.contours.flatMap((points, contour) =>
        points.map(([x, y], index) => {
          const next = points[(index + 1) % points.length];
          const a = new paper.Point(board.x + x, board.y + y);
          const b = new paper.Point(
            board.x + next[0], board.y + next[1]
          );
          const delta = b.subtract(a);

          if (delta.length < 0.000001) return null;

          const body = Matter.Bodies.rectangle(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            delta.length,
            0.2,
            {
              isStatic: true,
              angle: Math.atan2(delta.y, delta.x)
            }
          );

          body.plugin.edge = { board, contour, index, a, b };
          return body;
        }).filter(Boolean)
      )
    );
  }

  nearest(edge, point) {
    const delta = edge.b.subtract(edge.a);
    const t = Math.max(0, Math.min(
      1,
      point.subtract(edge.a).dot(delta) / delta.dot(delta)
    ));

    return edge.a.add(delta.multiply(t));
  }

  motion(board, point, contacts = []) {
    return { board, point: point.clone(), contacts: [...contacts] };
  }

  crossing(owner, a, b) {
    const direction = b.subtract(a);
    if (direction.length < 0.000001) return null;

    const bodies = this.edges.filter(body =>
      Wood.blocks(owner, body.plugin.edge.board)
    );

    const candidates = new Set(
      Matter.Query.ray(bodies, a, b, 0.001)
        .map(hit => hit.body)
    );

    let best = null;

    for (const body of bodies) {
      if (!candidates.has(body)) continue;

      const edge = body.plugin.edge;
      const side = edge.b.subtract(edge.a);
      const denominator = direction.cross(side);

      if (Math.abs(denominator) < 0.0000001) continue;

      const delta = edge.a.subtract(a);
      const t = delta.cross(side) / denominator;
      const u = delta.cross(direction) / denominator;

      if (t < -0.000001 || t > 1.000001
        || u < -0.000001 || u > 1.000001) continue;

      const shape = this.shapes.get(edge.board.id);
      const dt = Math.min(0.001, 0.02 / direction.length);

      const inside = p => shape.contains(p)
        && shape.getNearestPoint(p).getDistance(p) > 0.000001;

      const before = inside(a.add(direction.multiply(t - dt)));
      const after = inside(a.add(direction.multiply(t + dt)));

      if (before === after || (t <= 0.000001 && !after)) continue;

      if (!best || t < best.t) {
        best = {
          edge,
          t: Math.max(0, t),
          point: a.add(direction.multiply(
            Math.max(0, Math.min(1, t))
          ))
        };
      }
    }

    return best;
  }

  contact(hit, from, target) {
    const tangent = hit.edge.b.subtract(hit.edge.a).normalize();
    let normal = new paper.Point(-tangent.y, tangent.x);

    const sample = hit.t > 0.000001
      ? from
      : from.subtract(target.subtract(from).normalize(0.01));

    if (sample.subtract(hit.edge.a).dot(normal) < 0) {
      normal = normal.negate();
    }

    return { edge: hit.edge, normal };
  }

  constrain(target, contacts, rail = null) {
    if (rail) {
      const delta = rail.b.subtract(rail.a);
      let low = 0, high = 1;

      for (const c of contacts) {
        const slope = delta.dot(c.normal);
        const base = rail.a.subtract(c.edge.a).dot(c.normal);

        if (Math.abs(slope) < 0.0000001) continue;

        const t = -base / slope;
        if (slope > 0) low = Math.max(low, t);
        else high = Math.min(high, t);
      }

      const t = target.subtract(rail.a).dot(delta) / delta.dot(delta);

      return rail.a.add(
        delta.multiply(Math.max(low, Math.min(high, t)))
      );
    }

    let point = target.clone();

    for (let i = 0; i < 8; i++) {
      for (const c of contacts) {
        const distance = point.subtract(c.edge.a).dot(c.normal);

        if (distance < 0) {
          point = point.subtract(c.normal.multiply(distance));
        }
      }
    }

    return point;
  }

  move(state, target, zoom, rail = null, anchor = null) {
    const from = state.point.clone();

    state.contacts = state.contacts.filter(c =>
      Wood.blocks(state.board, c.edge.board)
      && target.subtract(c.edge.a).dot(c.normal)
        <= this.releasePixels / zoom
    );

    let point = from.clone();

    for (let i = 0; i < this.edges.length + 2; i++) {
      const wanted = this.constrain(target, state.contacts, rail);
      point = rail ? wanted : Wood.limit(state.board, from, wanted);

      let hit = this.crossing(state.board, from, point);
      let source = from;

      if ((!hit || hit.t >= 0.999999) && anchor) {
        hit = this.crossing(state.board, anchor, point);
        source = anchor;
      }

      if (!hit || hit.t >= 0.999999) break;

      const exists = state.contacts.some(c =>
        c.edge.board === hit.edge.board
        && c.edge.contour === hit.edge.contour
        && c.edge.index === hit.edge.index
      );

      if (exists) {
        point = hit.point;
        break;
      }

      state.contacts.push(this.contact(hit, source, point));
    }

    state.point = point;

    const blocked = state.contacts.some(c =>
      Math.abs(point.subtract(c.edge.a).dot(c.normal)) < 0.001
    );

    return { point, blocked };
  }

  update(point, zoom, visible = () => true) {
    if (this.lock) {
      const target = this.nearest(this.lock, point);

      if (target.getDistance(point) <= this.releasePixels / zoom) {
        const result = this.move(
          this.hoverMotion, target, zoom, this.lock
        );
        return { ...this.lock, ...result };
      }

      this.clear();
    }

    const radius = this.snapPixels / zoom;

    if (!this.probe || Math.abs(radius - this.radius) > 0.0001) {
      this.probe = Matter.Bodies.circle(
        0, 0, radius * 1.1, { isSensor: true }
      );
      this.radius = radius;
    }

    Matter.Body.setPosition(this.probe, {
      x: point.x,
      y: point.y
    });

    const candidates = new Set(
      Matter.Query.collides(this.probe, this.edges).map(hit =>
        hit.bodyA === this.probe ? hit.bodyB : hit.bodyA
      )
    );

    let best = null;

    for (const body of this.edges) {
      if (!candidates.has(body)) continue;

      const edge = body.plugin.edge;
      const snapped = this.nearest(edge, point);
      const distance = snapped.getDistance(point);

      if (distance <= radius
        && (!best || distance < best.distance - 0.0001)
        && visible(edge.board, snapped)) {
        best = {
          ...edge,
          point: snapped,
          distance,
          blocked: false
        };
      }
    }

    if (best) {
      this.lock = {
        board: best.board,
        contour: best.contour,
        index: best.index,
        a: best.a,
        b: best.b
      };
      this.hoverMotion = this.motion(best.board, best.point);
    }

    return best;
  }
};
