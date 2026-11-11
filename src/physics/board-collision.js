window.BoardCollision = class {
  constructor() {
    this.epsilon = 1e-7;
    this.limits = new paper.Rectangle(...Workshop.config.movementBounds);
  }

  candidates(board, boards, delta = new paper.Point(0, 0)) {
    const bounds = Wood.bounds(board);

    const sweep = bounds.unite(new paper.Rectangle(
      bounds.topLeft.add(delta),
      bounds.size
    ));

    const body = r => Matter.Bodies.rectangle(
      r.center.x,
      r.center.y,
      Math.max(0.000001, r.width + 0.000001),
      Math.max(0.000001, r.height + 0.000001),
      { isStatic: true, isSensor: true }
    );

    const probe = body(sweep);

    const bodies = boards
      .filter(b =>
        b !== board && Wood.level(b) === Wood.level(board)
      )
      .map(b => {
        const shape = body(Wood.bounds(b));
        shape.plugin.board = b;
        return shape;
      });

    return Matter.Query.collides(probe, bodies).map(hit =>
      (hit.bodyA === probe ? hit.bodyB : hit.bodyA).plugin.board
    );
  }

  overlap(a, b, delta = new paper.Point(0, 0)) {
    const moving = Wood.shape(a);
    const fixed = Wood.shape(b);

    moving.translate(delta);

    const intersection = moving.intersect(
      fixed,
      { insert: false }
    );

    const area = Math.abs(intersection.area);

    [moving, fixed, intersection].forEach(p => p.remove());

    return area > this.epsilon;
  }

  vertices(board) {
    return board.contours.map(ring =>
      ring.map(([x, y]) => ({
        x: board.x + x,
        y: board.y + y
      }))
    );
  }

  events(a, b, delta) {
    const events = [{ t: 0 }, { t: 1 }];
    const av = this.vertices(a);
    const bv = this.vertices(b);

    const collect = (vertices, rings, velocity) => {
      for (const ring of vertices) {
        for (const p of ring) {
          for (const edgeRing of rings) {
            for (let i = 0; i < edgeRing.length; i++) {
              const q = edgeRing[i];
              const end = edgeRing[(i + 1) % edgeRing.length];
              const sx = end.x - q.x;
              const sy = end.y - q.y;
              const denominator = velocity.x * sy - velocity.y * sx;

              if (Math.abs(denominator) < 1e-12) continue;

              const qx = q.x - p.x;
              const qy = q.y - p.y;
              const t = (qx * sy - qy * sx) / denominator;
              const u = (qx * velocity.y - qy * velocity.x)
                / denominator;

              if (t < -1e-9 || t > 1 + 1e-9
                || u < -1e-9 || u > 1 + 1e-9) continue;

              let normal = new paper.Point(-sy, sx).normalize();

              if (normal.dot(delta) > 0) {
                normal = normal.negate();
              }

              events.push({
                t: Math.max(0, Math.min(1, t)),
                normal
              });
            }
          }
        }
      }
    };

    collect(av, bv, delta);
    collect(bv, av, delta.negate());

    return events.sort((x, y) => x.t - y.t);
  }

  times(events) {
    return events.map(e => e.t).filter(
      (t, i, all) => !i || t - all[i - 1] > 1e-9
    );
  }

  firstHit(board, boards, delta) {
    let best = null;

    for (const other of this.candidates(board, boards, delta)) {
      const events = this.events(board, other, delta);
      const times = this.times(events);

      for (let i = 0; i < times.length - 1; i++) {
        const middle = delta.multiply(
          (times[i] + times[i + 1]) / 2
        );

        if (!this.overlap(board, other, middle)) continue;

        const t = times[i];

        let normals = events
          .filter(e => e.normal && Math.abs(e.t - t) < 1e-8)
          .map(e => e.normal);

        // 모서리에서 실제로 막지 않는 면은 제외합니다.
        const contact = delta.multiply(t);

        const blocking = normals.filter(normal =>
          [1e-4, 1e-6, 1e-8].some(distance =>
            this.overlap(
              board,
              other,
              contact.subtract(normal.multiply(distance))
            )
          )
        );

        if (blocking.length) normals = blocking;

        if (!normals.length) {
          normals.push(delta.normalize().negate());
        }

        if (!best || t < best.t - 1e-8) {
          best = { t, normals };
        } else if (Math.abs(t - best.t) < 1e-8) {
          best.normals.push(...normals);
        }

        break;
      }
    }

    return best;
  }

  move(board, target, boards) {
    let delta = target.subtract([board.x, board.y]);

    for (let i = 0; i < 8 && delta.length > 1e-8; i++) {
      const bounds = Wood.bounds(board);

      delta = new paper.Point(
        Math.max(
          this.limits.left - bounds.left,
          Math.min(this.limits.right - bounds.right, delta.x)
        ),
        Math.max(
          this.limits.top - bounds.top,
          Math.min(this.limits.bottom - bounds.bottom, delta.y)
        )
      );

      if (delta.length <= 1e-8) break;

      const hit = this.firstHit(board, boards, delta);

      if (!hit) {
        board.x += delta.x;
        board.y += delta.y;
        break;
      }

      board.x += delta.x * hit.t;
      board.y += delta.y * hit.t;

      let rest = delta.multiply(1 - hit.t);

      for (const normal of hit.normals) {
        const inward = rest.dot(normal);

        if (inward < 0) {
          rest = rest.subtract(normal.multiply(inward));
        }
      }

      if (rest.getDistance(delta) < 1e-9) break;

      delta = rest;
    }
  }

  exit(board, other, boards) {
    const a = Wood.bounds(board);
    const b = Wood.bounds(other);
    const common = a.intersect(b);

    const rx = common.width / a.width;
    const ry = common.height / a.height;

    const distances = [
      b.left - a.right,
      b.right - a.left,
      b.top - a.bottom,
      b.bottom - a.top
    ];

    const xSign = Math.abs(distances[0])
      <= Math.abs(distances[1]) ? -1 : 1;

    const ySign = Math.abs(distances[2])
      <= Math.abs(distances[3]) ? -1 : 1;

    const xFirst = Math.abs(rx - ry) > 1e-9
      ? rx < ry
      : Math.min(Math.abs(distances[0]), Math.abs(distances[1]))
          / a.width
        <= Math.min(Math.abs(distances[2]), Math.abs(distances[3]))
          / a.height;

    const horizontal = [[xSign, 0], [-xSign, 0]];
    const vertical = [[0, ySign], [0, -ySign]];

    const directions = xFirst
      ? [...horizontal, ...vertical]
      : [...vertical, ...horizontal];

    for (const [x, y] of directions) {
      const length = x < 0
        ? a.left - this.limits.left
        : x > 0
          ? this.limits.right - a.right
          : y < 0
            ? a.top - this.limits.top
            : this.limits.bottom - a.bottom;

      if (length <= 1e-9) continue;

      const delta = new paper.Point(x * length, y * length);
      const obstacles = this.candidates(board, boards, delta);

      const events = [
        { t: 0 },
        { t: 1 },
        ...obstacles.flatMap(obstacle =>
          this.events(board, obstacle, delta)
        )
      ].sort((left, right) => left.t - right.t);

      for (const t of this.times(events)) {
        if (t < 1e-10) continue;

        const shift = delta.multiply(t);
        const placed = new paper.Rectangle(
          a.topLeft.add(shift),
          a.size
        );

        if (placed.left < this.limits.left - 1e-7
          || placed.right > this.limits.right + 1e-7
          || placed.top < this.limits.top - 1e-7
          || placed.bottom > this.limits.bottom + 1e-7) continue;

        if (obstacles.some(obstacle =>
          this.overlap(board, obstacle, shift))) continue;

        board.x += shift.x;
        board.y += shift.y;

        return true;
      }
    }

    return false;
  }

  separate(boards) {
    const moved = new Set();

    for (let pass = 0; pass < boards.length * boards.length; pass++) {
      let changed = false;

      for (const a of boards) {
        for (const b of this.candidates(a, boards)) {
          if (a.id >= b.id || !this.overlap(a, b)) continue;

          const areaA = Wood.area(a);
          const areaB = Wood.area(b);

          const small = areaA < areaB - 1e-7
            ? a
            : areaB < areaA - 1e-7
              ? b
              : (a.id > b.id ? a : b);

          const large = small === a ? b : a;

          if (this.exit(small, large, boards)) {
            moved.add(small);
            changed = true;
          }
        }
      }

      if (!changed) break;
    }

    return moved;
  }
};
