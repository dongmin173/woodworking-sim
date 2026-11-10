/* 판자 도형, 톱 절단, 픽셀 격자와 구두칼 차집합. */
window.Wood = {
  nextId: 1,

  create(x, y, w, h, name = "판자") {
    return {
      id: this.nextId++,
      name,
      x,
      y,
      contours: [[[0, 0], [w, 0], [w, h], [0, h]]],
      marks: [],
      gridX: 0,
      gridY: 0
    };
  },

  shape(board) {
    const paths = board.contours.map(points => new paper.Path({
      segments: points.map(([x, y]) => [board.x + x, board.y + y]),
      closed: true,
      insert: false
    }));

    return paths.length === 1
      ? paths[0]
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

  sorted(boards) {
    return [...boards].sort(
      (a, b) => this.area(b) - this.area(a) || a.id - b.id
    );
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
      0,
      1,
      ...path.getIntersections(line).map(hit =>
        hit.point.subtract(a).dot(delta) / length2
      )
    ]
      .filter(t => t >= 0 && t <= 1)
      .sort((x, y) => x - y);

    const cuts = values.filter(
      (t, i) => !i || t - values[i - 1] > 0.000001
    );

    const intervals = [];

    for (let i = 0; i < cuts.length - 1; i++) {
      const left = cuts[i];
      const right = cuts[i + 1];
      const mid = a.add(delta.multiply((left + right) / 2));

      if (
        path.contains(mid) ||
        path.getNearestPoint(mid).getDistance(mid) < 0.001
      ) {
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

    return (
      a.getDistance(b) > 3 &&
      (
        this.contains(board, a) ||
        this.edge(board, a).distance < 0.05
      ) &&
      this.limit(board, a, b).getDistance(b) < 0.01
    );
  },

  draw(board, preview = null) {
    const path = this.shape(board);

    path.fillColor = "#cb945a";
    path.strokeColor = "#72502f";

    // 확대했을 때 외곽선이 1픽셀짜리 구멍을 덮지 않도록 합니다.
    path.strokeWidth = Math.min(2, 1.5 / paper.view.zoom);

    paper.project.activeLayer.addChild(path);

    const mask = path.clone({ insert: false });
    mask.clipMask = true;

    const contents = new paper.Group([mask]);
    const b = path.bounds;

    for (let y = b.top + 12; y < b.bottom; y += 13) {
      contents.addChild(new paper.Path.Line({
        from: [b.left, y],
        to: [b.right, y + 3],
        strokeColor: "#a97845",
        strokeWidth: 1
      }));
    }

    for (const mark of [
      ...board.marks,
      ...(preview ? [preview] : [])
    ]) {
      const line = this.line(board, mark);
      line.strokeColor = "#34322e";
      line.strokeWidth = 2;
      line.opacity = mark === preview ? 0.35 : 1;
      contents.addChild(line);
    }
  },

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
      -direction.y,
      direction.x
    ).multiply(width / 2);

    const cutter = new paper.Path({
      closed: true,
      insert: false,
      segments: [
        a.add(normal),
        b.add(normal),
        b.subtract(normal),
        a.subtract(normal)
      ]
    });

    const source = this.shape(board);
    const result = source.subtract(cutter, { insert: false });

    const removedArea =
      Math.abs(source.area) - Math.abs(result.area);

    if (removedArea < 0.00001) {
      [source, cutter, result].forEach(p => p.remove());
      return null;
    }

    result.reorient(true, true);

    const pieces = this.parts(board, result, index);

    [source, cutter, result].forEach(p => p.remove());

    return { pieces, removedArea };
  },

  parts(board, result, skip = -1) {
    const paths = result instanceof paper.CompoundPath
      ? result.children
      : [result];

    const groups = paths
      .filter(p => p.clockwise && Math.abs(p.area) > 0.00001)
      .map(outer => ({ outer, holes: [] }));

    for (const hole of paths.filter(p => !p.clockwise)) {
      const owners = groups
        .filter(g => g.outer.contains(hole.getInteriorPoint()))
        .sort((a, b) =>
          Math.abs(a.outer.area) - Math.abs(b.outer.area)
        );

      if (owners.length) owners[0].holes.push(hole);
    }

    const pieces = groups.map(({ outer, holes }) => {
      const origin = outer.bounds.topLeft;

      const piece = {
        id: this.nextId++,
        name: board.name,
        x: origin.x,
        y: origin.y,

        // 조각의 원점이 바뀌어도 기존 픽셀 격자를 유지합니다.
        gridX: board.x + (board.gridX || 0) - origin.x,
        gridY: board.y + (board.gridY || 0) - origin.y,

        contours: [outer, ...holes].map(p =>
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

          if (points[0].getDistance(points[1]) > 3) {
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

    return pieces;
  },

  cell(board, point) {
    return [
      Math.floor(
        point.x - board.x - (board.gridX || 0) + 1e-9
      ),
      Math.floor(
        point.y - board.y - (board.gridY || 0) + 1e-9
      )
    ];
  },

  cellOrigin(board, cell) {
    return new paper.Point(
      board.x + (board.gridX || 0) + cell[0],
      board.y + (board.gridY || 0) + cell[1]
    );
  },

  // 선택한 픽셀 사각형들을 하나의 제거 영역으로 합칩니다.
  stencil(board, cells) {
    let shapes = cells.map(([x, y]) => {
      x += board.gridX || 0;
      y += board.gridY || 0;

      return [[[
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
        [x, y]
      ]]];
    });

    while (shapes.length > 1) {
      const next = [];

      for (let i = 0; i < shapes.length; i += 2) {
        next.push(
          i + 1 < shapes.length
            ? martinez.union(shapes[i], shapes[i + 1])
            : shapes[i]
        );
      }

      shapes = next;
    }

    return shapes[0] || null;
  },

  carve(board, stencil) {
    if (!stencil) return null;

    const subject = board.contours.map(ring => [
      ...ring,
      ring[0]
    ]);

    const geometry = martinez.diff(subject, stencil) || [];

    const children = geometry.flatMap(polygon =>
      polygon.map((ring, index) => {
        const path = new paper.Path({
          insert: false,
          closed: true,
          segments: ring.slice(0, -1).map(([x, y]) => [
            board.x + x,
            board.y + y
          ])
        });

        path.clockwise = index === 0;
        return path;
      })
    );

    const result = new paper.CompoundPath({
      children,
      insert: false
    });

    const removedArea =
      this.area(board) - Math.abs(result.area);

    const pieces = this.parts(board, result);
    result.remove();

    return removedArea > 0.00000001
      ? { pieces, removedArea }
      : null;
  },

  grid(board) {
    if (paper.view.zoom < 6) return;

    const bounds = this.bounds(board).intersect(
      paper.view.bounds
    );

    if (bounds.width <= 0 || bounds.height <= 0) return;

    const origin = this.cellOrigin(board, [0, 0]);
    const mask = this.shape(board);
    mask.clipMask = true;

    const group = new paper.Group([mask]);

    for (
      let x = Math.ceil(bounds.left - origin.x);
      x <= bounds.right - origin.x;
      x++
    ) {
      group.addChild(new paper.Path.Line({
        from: [origin.x + x, bounds.top],
        to: [origin.x + x, bounds.bottom],
        strokeColor: "#735d43",
        strokeWidth: 0.5 / paper.view.zoom,
        opacity: 0.45
      }));
    }

    for (
      let y = Math.ceil(bounds.top - origin.y);
      y <= bounds.bottom - origin.y;
      y++
    ) {
      group.addChild(new paper.Path.Line({
        from: [bounds.left, origin.y + y],
        to: [bounds.right, origin.y + y],
        strokeColor: "#735d43",
        strokeWidth: 0.5 / paper.view.zoom,
        opacity: 0.45
      }));
    }
  }
};