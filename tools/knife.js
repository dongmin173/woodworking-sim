window.WorkshopTools = window.WorkshopTools || {};

WorkshopTools.Knife = class extends WorkshopTools.Carver {
  constructor(ctx) {
    super(ctx, {
      name: "구두칼",
      size: 4,
      dragOnly: false
    });
  }

  activate() {
    this.previousTip = null;

    this.ctx.say(
      "구두칼: 클릭·드래그로 4×4px를 깎습니다. "
      + "연필선과 꺾인 모서리에서 칼 면적이 막힙니다. "
      + "선 끝을 돌아가거나 마우스를 놓고 반대편에서 다시 시작하세요."
    );
  }

  move(point) {
    if (this.tip && this.tip.getDistance(point) > 1e-9) {
      this.previousTip = this.tip.clone();
    }

    super.move(point);
  }

  prepare(record) {
    if (record.prepared) return;

    record.prepared = true;
    record.barrierBounds = [];

    const strips = [];

    for (const mark of record.source.marks) {
      if (mark.length !== 2) continue;

      const [a, b] = mark.map(p =>
        this.ctx.world(record.source, p)
      );

      if (a.getDistance(b) < 1e-9) continue;

      const tangent = b.subtract(a).normalize();
      const normal = new paper.Point(-tangent.y, tangent.x);

      // 2px 연필선과 모서리를 빈틈없이 보호하는 유한한 띠입니다.
      const start = a.subtract(tangent);
      const end = b.add(tangent);

      const strip = new paper.Path({
        closed: true,
        insert: false,
        segments: [
          start.add(normal),
          end.add(normal),
          end.subtract(normal),
          start.subtract(normal)
        ]
      });

      record.barrierBounds.push(strip.bounds.clone());
      strips.push(strip);
    }

    record.barrier = Wood.union(strips);
  }

  footprint(record, point) {
    const square = super.footprint(record, point);
    if (!square) return null;

    this.prepare(record);

    let pieces;

    if (record.barrier && record.barrierBounds.some(
      bounds => bounds.intersects(square.bounds)
    )) {
      const free = square.subtract(
        record.barrier,
        { insert: false }
      );

      pieces = Wood.components(free);

      square.remove();
      free.remove();
    } else {
      pieces = [square];
    }

    let allowed;

    if (record.lastFootprint) {
      // 직전 칼 영역과 실제로 이어지는 쪽만 선택합니다.
      // 선 너머로 건너뛰지 않습니다.
      allowed = pieces.filter(piece => {
        const overlap = piece.intersect(
          record.lastFootprint,
          { insert: false }
        );

        const connected = Math.abs(overlap.area) > 1e-8;
        overlap.remove();

        return connected;
      });
    } else {
      // 선 위에서 시작하면 직전에 마우스가 있던 쪽을 우선합니다.
      const reference = pieces.some(piece =>
        piece.contains(point)
      ) ? point : (this.previousTip || point);

      const distance = piece => piece.contains(reference)
        ? 0
        : piece.getNearestPoint(reference).getDistance(reference);

      allowed = pieces.length
        ? [pieces.reduce((best, piece) =>
          distance(piece) < distance(best) ? piece : best
        )]
        : [];
    }

    pieces
      .filter(piece => !allowed.includes(piece))
      .forEach(piece => piece.remove());

    const footprint = Wood.union(allowed);
    if (!footprint) return null;

    record.lastFootprint?.remove();
    record.lastFootprint = footprint.clone({ insert: false });

    return footprint;
  }

  drawOverlay() {
    if (!this.tip) return;

    const record = this.stroke
      && [...this.stroke.records.values()].find(r =>
        r.shown.includes(this.hoverBoard)
        || r.source === this.hoverBoard
      );

    const source = record?.source || this.hoverBoard || {
      x: 0,
      y: 0,
      gridX: 0,
      gridY: 0,
      marks: []
    };

    // 실제 드래그 상태를 바꾸지 않는 별도의 미리보기입니다.
    const preview = {
      source,
      prepared: record?.prepared,
      barrier: record?.barrier,
      barrierBounds: record?.barrierBounds,
      lastFootprint: record?.lastFootprint?.clone({
        insert: false
      })
    };

    const path = this.footprint(preview, this.tip);

    if (path) {
      path.fillColor = new paper.Color(0.85, 0.15, 0.1, 0.18);
      path.strokeColor = "#c23d2d";
      path.strokeWidth = 1 / paper.view.zoom;

      paper.project.activeLayer.addChild(path);
    }

    preview.lastFootprint?.remove();

    if (!record?.prepared) preview.barrier?.remove();

    this.ctx.hud("구두칼 · 4×4px · 연필선 경계 보호");
  }
};