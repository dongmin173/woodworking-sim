window.WorkshopTools = window.WorkshopTools || {};

WorkshopTools.Knife = class extends WorkshopTools.Carver {
  constructor(ctx) {
    super(ctx, { name: "구두칼", size: 4, dragOnly: false });
  }

  activate() {
    this.previousTip = null;
    this.ctx.say(
      "구두칼: 클릭·드래그로 4×4px를 자유롭게 깎습니다. "
      + "Ctrl을 누르면 연필선을 보호합니다."
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
    const protect = !!this.ctx.modifiers.control;

    // Ctrl 상태가 달라지면 이전 보호 영역의 연결 상태를 초기화합니다.
    if (record.protect !== protect) {
      record.lastFootprint?.remove();
      record.lastFootprint = null;
      record.brushKey = null;
      record.protect = protect;
    }

    const square = super.footprint(record, point);
    if (!square) return null;

    // 기본 모드에서는 연필선을 무시합니다.
    if (!protect) return square;

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

    const preview = {
      source,
      prepared: record?.prepared,
      protect: record?.protect,
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

    this.ctx.hud(this.ctx.modifiers.control
      ? "구두칼 · 4×4px · Ctrl: 연필선 보호"
      : "구두칼 · 4×4px · 자유 깎기 · Ctrl: 연필선 보호");
  }
};
