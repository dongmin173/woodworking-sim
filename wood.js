/* Paper.js: 판자 도형, 직선 제한, 톱 폭만큼의 유한한 홈 파기. */
window.Wood = {
  nextId: 1,

  create(x, y, w, h, name = "판자") {
    return {
      id: this.nextId++, name, x, y,
      contours: [[[0, 0], [w, 0], [w, h], [0, h]]],
      marks: [], gridX: 0, gridY: 0
    };
  },

  // 면적이 없는 왕복 선분과 중복 꼭짓점을 제거합니다.
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
    const path = this.shape(board), area = Math.abs(path.area);
    path.remove();
    return area;
  },

  bounds(board) {
    const path = this.shape(board), bounds = path.bounds.clone();
    path.remove();
    return bounds;
  },

  sorted(boards) {
    return [...boards].sort(
      (a, b) => this.area(b) - this.area(a) || a.id - b.id
    );
  },

  contains(board, point) {
    const path = this.shape(board), inside = path.contains(point);
    path.remove();
    return inside;
  },

  edge(board, point) {
    const path = this.shape(board), nearest = path.getNearestPoint(point);
    const result = {
      point: nearest.clone(),
      distance: nearest.getDistance(point)
    };

    path.remove();
    return result;
  },

  // 직선과 윤곽의 교점으로 재료 안쪽 구간을 구합니다.
  intervals(path, a, b) {
    const delta = b.subtract(a), length2 = delta.dot(delta);
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
    const path = this.shape(board), spans = this.intervals(path, a, b);
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
  },

  draw(board, preview = null) {
    const path = this.shape(board);

    path.fillColor = "#cb945a";
    path.strokeColor = "#72502f";
    path.strokeWidth = Math.min(2, 1.5 / paper.view.zoom);

    paper.project.activeLayer.addChild(path);

    const mask = path.clone({ insert: false });
    mask.clipMask = true;

    const contents = new paper.Group([mask]), b = path.bounds;

    for (let y = b.top + 12; y < b.bottom; y += 13) {
      contents.addChild(new paper.Path.Line({
        from: [b.left, y],
        to: [b.right, y + 3],
        strokeColor: "#a97845",
        strokeWidth: 1
      }));
    }

    for (const mark of [...board.marks, ...(preview ? [preview] : [])]) {
      const line = this.line(board, mark);

      line.strokeColor = "#34322e";
      line.strokeWidth = 2;
      line.opacity = mark === preview ? 0.35 : 1;

      contents.addChild(line);
    }
  },

  cut(board, index, width = 6) {
    const mark = board.marks[index];
    if (!mark || !this.validMark(board, mark) || width <= 0) return null;

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

  // 바깥 윤곽과 그 안의 구멍을 묶어 실제 연결된 영역을 반환합니다.
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
      // 구멍 안의 섬을 구멍의 부모로 선택하면 면적이 뒤집힙니다.
      // 구멍보다 큰 바깥 윤곽 중 실제로 포함하는 윤곽을 찾습니다.
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

  cell(board, point) {
    return [
      Math.floor(point.x - board.x - (board.gridX || 0) + 1e-9),
      Math.floor(point.y - board.y - (board.gridY || 0) + 1e-9)
    ];
  },

  cellOrigin(board, cell) {
    return new paper.Point(
      board.x + (board.gridX || 0) + cell[0],
      board.y + (board.gridY || 0) + cell[1]
    );
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

  // 임시 경로를 병합한 뒤 중간 경로는 바로 해제합니다.
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

    // 면적 없는 잔여선에 닿으면 윤곽만 바뀌어도 수정 결과를 반영합니다.
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

    const result = source.subtract(stencil, { insert: false });
    result.reorient(true, true);

    const removedArea = Math.abs(source.area) - Math.abs(result.area);
    source.remove();

    if (removedArea <= 0.00000001 && !touched) {
      result.remove();
      return null;
    }

    const pieces = this.parts(board, result);

    if (!remaining) result.remove();

    return {
      pieces,
      removedArea: Math.max(0, removedArea),
      cleaned: touched,
      remaining: remaining ? result : null
    };
  },

  grid(board) {
    if (paper.view.zoom < 6) return;

    const bounds = this.bounds(board).intersect(paper.view.bounds);
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const origin = this.cellOrigin(board, [0, 0]);
    const mask = this.shape(board);
    mask.clipMask = true;

    const group = new paper.Group([mask]);

    for (let x = Math.ceil(bounds.left - origin.x);
      x <= bounds.right - origin.x; x++) {
      group.addChild(new paper.Path.Line({
        from: [origin.x + x, bounds.top],
        to: [origin.x + x, bounds.bottom],
        strokeColor: "#735d43",
        strokeWidth: 0.5 / paper.view.zoom,
        opacity: 0.45
      }));
    }

    for (let y = Math.ceil(bounds.top - origin.y);
      y <= bounds.bottom - origin.y; y++) {
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