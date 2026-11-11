Object.assign(Wood, {
  cleanRing(ring) {
    const points = ring.map(p => [...p]), epsilon = 1e-9;
    let changed = true;

    while (changed && points.length >= 3) {
      changed = false;

      for (let i = 0; i < points.length; i++) {
        const a = points[(i + points.length - 1) % points.length];
        const b = points[i], c = points[(i + 1) % points.length];

        const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
        const cross = (b[0] - a[0]) * (c[1] - b[1])
          - (b[1] - a[1]) * (c[0] - b[0]);

        if (ab <= epsilon || bc <= epsilon
          || Math.abs(cross) <= epsilon * (ab + bc)) {
          points.splice(i, 1);
          changed = true;
          break;
        }
      }
    }

    return points.length >= 3 ? points : [];
  },

  clipPolygon(points, { a, b, side }) {
    if (!points.length) return [];

    const distance = p => side * (
      (b[0] - a[0]) * (p[1] - a[1])
      - (b[1] - a[1]) * (p[0] - a[0])
    );

    const output = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      const dp = distance(p), dq = distance(q);

      if (dp >= 0) output.push(p);

      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);

        output.push([
          p[0] + (q[0] - p[0]) * t,
          p[1] + (q[1] - p[1]) * t
        ]);
      }
    }

    return this.cleanRing(output);
  },

  shape(board) {
    const paths = board.contours.map(points => new paper.Path({
      segments: points.map(([x, y]) => [board.x + x, board.y + y]),
      closed: true,
      insert: false
    }));

    return paths.length === 1 ? paths[0]
      : new paper.CompoundPath({ children: paths, insert: false });
  },

  line(board, mark) {
    return new paper.Path({
      segments: mark.map(([x, y]) => [board.x + x, board.y + y]),
      insert: false
    });
  },

  area(board) {
    const path = this.shape(board);
    const area = Math.abs(path.area);
    path.remove();
    return area;
  },

  bounds(board) {
    const path = this.shape(board);
    const bounds = path.bounds.clone();
    path.remove();
    return bounds;
  },

  contains(board, point) {
    const path = this.shape(board);
    const inside = path.contains(point);
    path.remove();
    return inside;
  },

  edge(board, point) {
    const path = this.shape(board);
    const nearest = path.getNearestPoint(point);

    const result = {
      point: nearest.clone(),
      distance: nearest.getDistance(point)
    };

    path.remove();
    return result;
  },

  intervals(path, a, b) {
    const delta = b.subtract(a);
    const length2 = delta.dot(delta);

    if (length2 < 0.000001) return [];

    const line = new paper.Path({
      segments: [a, b],
      insert: false
    });

    const values = [
      0, 1,
      ...path.getIntersections(line).map(hit =>
        hit.point.subtract(a).dot(delta) / length2
      )
    ].filter(t => t >= 0 && t <= 1).sort((x, y) => x - y);

    const cuts = values.filter(
      (t, i) => !i || t - values[i - 1] > 0.000001
    );

    const intervals = [];

    for (let i = 0; i < cuts.length - 1; i++) {
      const left = cuts[i], right = cuts[i + 1];
      const mid = a.add(delta.multiply((left + right) / 2));

      if (path.contains(mid)
        || path.getNearestPoint(mid).getDistance(mid) < 0.001) {
        intervals.push([left, right]);
      }
    }

    line.remove();
    return intervals;
  },

  limit(board, a, b) {
    const path = this.shape(board);
    const spans = this.intervals(path, a, b);
    let end = 0;

    for (const [left, right] of spans) {
      if (left > end + 0.000001) break;
      end = right;
    }

    path.remove();
    return a.add(b.subtract(a).multiply(end));
  },

  validMark(board, mark) {
    if (mark.length !== 2) return false;

    const [a, b] = mark.map(([x, y]) =>
      new paper.Point(board.x + x, board.y + y)
    );

    return a.getDistance(b) > 3
      && (this.contains(board, a) || this.edge(board, a).distance < 0.05)
      && this.limit(board, a, b).getDistance(b) < 0.01;
  }
});
