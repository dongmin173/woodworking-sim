Object.assign(Wood, {
  cut(board, index, width = 6) {
    const mark = board.marks[index];

    if (!mark || !this.validMark(board, mark) || width <= 0) {
      return null;
    }

    const [a, b] = mark.map(([x, y]) =>
      new paper.Point(board.x + x, board.y + y)
    );

    const direction = b.subtract(a).normalize();
    const normal = new paper.Point(
      -direction.y, direction.x
    ).multiply(width / 2);

    const cutter = new paper.Path({
      closed: true,
      insert: false,
      segments: [
        a.add(normal), b.add(normal),
        b.subtract(normal), a.subtract(normal)
      ]
    });

    const source = this.shape(board);
    const result = source.subtract(cutter, { insert: false });
    const removedArea = Math.abs(source.area) - Math.abs(result.area);

    if (removedArea < 0.00001) {
      [source, cutter, result].forEach(p => p.remove());
      return null;
    }

    result.reorient(true, true);

    const pieces = this.parts(board, result, index);

    [source, cutter, result].forEach(p => p.remove());

    return { pieces, removedArea };
  },

  components(result) {
    const oriented = result.clone({ insert: false });
    oriented.reorient(true, true);

    const original = oriented instanceof paper.CompoundPath
      ? oriented.children : [oriented];

    const paths = original.map(p => new paper.Path({
      closed: true,
      insert: false,
      segments: this.cleanRing(
        p.segments.map(s => [s.point.x, s.point.y])
      )
    }));

    const groups = paths
      .filter(p => p.clockwise && Math.abs(p.area) > 0.00001)
      .map(outer => ({ outer, holes: [] }));

    for (const hole of paths.filter(p => !p.clockwise)) {
      const owners = groups.filter(g =>
        Math.abs(g.outer.area) > Math.abs(hole.area)
        && g.outer.contains(hole.segments[0].point)
      ).sort((a, b) =>
        Math.abs(a.outer.area) - Math.abs(b.outer.area)
      );

      if (owners.length) owners[0].holes.push(hole);
    }

    const regions = groups.map(({ outer, holes }) =>
      holes.length
        ? new paper.CompoundPath({
          children: [outer, ...holes].map(p =>
            p.clone({ insert: false })
          ),
          insert: false
        })
        : outer.clone({ insert: false })
    );

    paths.forEach(path => path.remove());
    oriented.remove();

    return regions;
  },

  parts(board, result, skip = -1) {
    const regions = this.components(result);

    const pieces = regions.map(region => {
      const paths = region instanceof paper.CompoundPath
        ? region.children : [region];

      const origin = region.bounds.topLeft;

      const piece = {
        id: this.nextId++,
        stack: board.stack ?? board.id,
        layer: this.level(board),
        name: board.name,
        x: origin.x,
        y: origin.y,
        gridX: board.x + (board.gridX || 0) - origin.x,
        gridY: board.y + (board.gridY || 0) - origin.y,
        contours: paths.map(p =>
          p.segments.map(s => [
            s.point.x - origin.x,
            s.point.y - origin.y
          ])
        ),
        marks: []
      };

      const shape = this.shape(piece);

      board.marks.forEach((other, i) => {
        if (i === skip) return;

        const [start, end] = other.map(([x, y]) =>
          new paper.Point(board.x + x, board.y + y)
        );

        for (const [left, right] of this.intervals(shape, start, end)) {
          const points = [left, right].map(t =>
            start.add(end.subtract(start).multiply(t))
          );

          if (points[0].getDistance(points[1]) > 0.000001) {
            piece.marks.push(points.map(p => [
              p.x - origin.x,
              p.y - origin.y
            ]));
          }
        }
      });

      shape.remove();
      return piece;
    });

    regions.forEach(region => region.remove());
    return pieces;
  },

  stencil(board, cells, planes = []) {
    const shapes = cells.map(([x, y]) => {
      x += board.gridX || 0;
      y += board.gridY || 0;

      let ring = [
        [x, y], [x + 1, y],
        [x + 1, y + 1], [x, y + 1]
      ];

      for (const plane of planes) {
        ring = this.clipPolygon(ring, plane);
      }

      return ring.length
        ? new paper.Path({
          segments: ring.map(([px, py]) => [
            board.x + px, board.y + py
          ]),
          closed: true,
          insert: false
        })
        : null;
    }).filter(Boolean);

    return this.union(shapes);
  },

  union(shapes) {
    shapes = [...shapes];

    while (shapes.length > 1) {
      const next = [];

      for (let i = 0; i < shapes.length; i += 2) {
        if (i + 1 === shapes.length) {
          next.push(shapes[i]);
        } else {
          next.push(shapes[i].unite(
            shapes[i + 1], { insert: false }
          ));
          shapes[i].remove();
          shapes[i + 1].remove();
        }
      }

      shapes = next;
    }

    return shapes[0] || null;
  },

  carve(board, stencil, remaining = null) {
    if (!stencil) return null;

    const rings = board.contours
      .map(ring => this.cleanRing(ring))
      .filter(ring => ring.length);

    const cleaned = JSON.stringify(rings)
      !== JSON.stringify(board.contours);

    let touched = false;

    if (cleaned) {
      const outline = this.shape(board);

      touched = outline.getIntersections(stencil).length > 0
        || board.contours.some(points =>
          points.some(([x, y]) =>
            stencil.contains([board.x + x, board.y + y])
          )
        );

      outline.remove();
    }

    const source = remaining
      ? remaining.clone({ insert: false })
      : this.shape({ ...board, contours: rings });

    const before = Math.abs(source.area);
    const budget = Math.abs(stencil.area);

    const intersection = source.intersect(
      stencil,
      { insert: false }
    );

    const removable = Math.abs(intersection.area);
    intersection.remove();

    const result = source.subtract(stencil, { insert: false });
    result.reorient(true, true);

    const after = Math.abs(result.area);
    const removedArea = before - after;
    const tolerance = Math.max(1e-6, before * 1e-9);

    source.remove();

    if (![before, after, budget, removable].every(Number.isFinite)
      || removable > budget + tolerance
      || removedArea < -tolerance
      || removedArea > budget + tolerance
      || Math.abs(removedArea - removable) > tolerance) {
      result.remove();
      return { invalid: true };
    }

    if (removedArea <= 0.00000001 && !touched) {
      result.remove();
      return null;
    }

    const pieces = this.parts(board, result);

    const represented = pieces.reduce(
      (sum, piece) => sum + this.area(piece),
      0
    );

    if (Math.abs(represented - after) > tolerance) {
      result.remove();
      return { invalid: true };
    }

    if (!remaining) result.remove();

    return {
      pieces,
      removedArea: Math.max(0, removedArea),
      cleaned: touched,
      remaining: remaining ? result : null
    };
  }
});
