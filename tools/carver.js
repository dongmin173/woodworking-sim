/* 클릭 위치 중심의 픽셀 브러시. 절삭은 항상 직전 도형에서 차감합니다. */
window.WorkshopTools = window.WorkshopTools || {};

WorkshopTools.Carver = class {
  constructor(ctx, { name, size, dragOnly }) {
    Object.assign(this, { ctx, name, size, dragOnly });
    this.stroke = this.tip = this.hoverBoard = null;
  }

  activate() {
    this.ctx.say(
      `${this.name}: 클릭 위치 중심 ${this.size}×${this.size}px를 깎습니다.`
    );
  }

  brush(board, point) {
    return [
      Math.round(point.x - board.x - (board.gridX || 0))
        - this.size / 2,
      Math.round(point.y - board.y - (board.gridY || 0))
        - this.size / 2
    ];
  }

  move(point) {
    this.tip = point.clone();
    this.hoverBoard = this.ctx.pick(point, this.size);
  }

  down(point) {
    if (this.stroke) this.up();

    this.move(point);

    const snapshot = [...this.ctx.scene.boards];
    const order = Wood.sorted(snapshot).reverse();

    this.stroke = {
      snapshot,
      order,
      start: point.clone(),
      last: point.clone(),
      started: false,
      records: new Map(order.map(source => [
        source,
        {
          source,
          shown: [source],
          remaining: Wood.shape(source),
          removedArea: 0
        }
      ])),
      shapes: new Map(order.map(b => [b, Wood.shape(b)])),
      bounds: new Map(order.map(b => [b, Wood.bounds(b)]))
    };

    this.ctx.setCancel(true);

    if (!this.dragOnly) this.stamp(point);
  }

  drag(point) {
    if (!this.stroke) return;

    this.move(point);

    if (this.dragOnly && !this.stroke.started
      && this.stroke.start.getDistance(point) * paper.view.zoom < 1) {
      return;
    }

    this.stroke.started = true;
    this.stamp(point);
  }

  footprint(record, point) {
    const cell = this.brush(record.source, point);
    const key = cell.join(",");

    if (record.brushKey === key) return null;
    record.brushKey = key;

    return new paper.Path.Rectangle({
      insert: false,
      rectangle: new paper.Rectangle(
        Wood.cellOrigin(record.source, cell),
        new paper.Size(this.size, this.size)
      )
    });
  }

  erase(record, cutter) {
    const s = this.stroke;
    const layer = s.order.indexOf(record.source);

    for (const upper of s.order.slice(0, layer)) {
      if (!cutter.bounds.intersects(s.bounds.get(upper))) continue;

      const visible = cutter.subtract(
        s.shapes.get(upper),
        { insert: false }
      );

      cutter.remove();
      cutter = visible;
    }

    const result = Wood.carve(
      record.source,
      cutter,
      record.remaining
    );

    cutter.remove();

    if (!result) return true;
    if (result.invalid) return false;

    this.ctx.replace(record.shown, result.pieces, false);

    record.remaining.remove();
    record.remaining = result.remaining;
    record.shown = result.pieces;
    record.removedArea += result.removedArea;
    record.cleaned ||= result.cleaned;

    return true;
  }

  stamp(point) {
    const s = this.stroke;
    const delta = point.subtract(s.last);

    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) * 2)
    );

    const pending = new Map();

    for (let i = 0; i <= steps; i++) {
      const p = s.last.add(delta.multiply(i / steps));

      for (const record of s.records.values()) {
        const footprint = this.footprint(record, p);
        if (!footprint) continue;

        if (!footprint.bounds.intersects(
          s.bounds.get(record.source)
        )) {
          footprint.remove();
          continue;
        }

        if (!pending.has(record)) pending.set(record, []);
        pending.get(record).push(footprint);
      }
    }

    s.last = point.clone();

    for (const [record, footprints] of pending) {
      const budget = footprints.reduce(
        (sum, path) => sum + Math.abs(path.area),
        0
      );

      const envelope = footprints.reduce(
        (bounds, path) => bounds
          ? bounds.unite(path.bounds)
          : path.bounds.clone(),
        null
      );

      const cutter = Wood.union(footprints);
      const bounds = cutter.bounds;

      const valid = Number.isFinite(cutter.area)
        && Math.abs(cutter.area) <= budget + 1e-6
        && bounds.left >= envelope.left - 1e-6
        && bounds.right <= envelope.right + 1e-6
        && bounds.top >= envelope.top - 1e-6
        && bounds.bottom <= envelope.bottom + 1e-6;

      if (valid && this.erase(record, cutter)) continue;
      if (!valid) cutter.remove();

      // 병합 결과가 불안정하면 작은 칼 영역을 하나씩 적용합니다.
      for (const footprint of footprints) {
        this.erase(
          record,
          footprint.clone({ insert: false })
        );
      }
    }

    const records = [...s.records.values()];
    const area = records.reduce(
      (sum, r) => sum + r.removedArea,
      0
    );

    this.ctx.say(
      `${this.name}: ${area.toFixed(2)}px² 깎았습니다.`
      + `${records.some(r => r.cleaned)
        ? " 잔여 윤곽을 정리했습니다." : ""}`
      + " Esc: 이번 드래그 취소"
    );
  }

  releaseShapes() {
    if (!this.stroke) return;

    this.stroke.shapes.forEach(shape => shape.remove());

    this.stroke.records.forEach(record => {
      record.remaining.remove();
      record.lastFootprint?.remove();
      record.barrier?.remove();
    });
  }

  up() {
    if (!this.stroke) return;

    const last = this.stroke.last;

    this.releaseShapes();
    this.stroke = null;

    this.ctx.geometryChanged();
    this.ctx.setCancel(false);
    this.move(last);
  }

  cancel() {
    if (this.stroke) {
      this.ctx.scene.boards = [...this.stroke.snapshot];

      this.releaseShapes();
      this.stroke = null;
      this.ctx.geometryChanged();
    }

    this.tip = this.hoverBoard = null;
    this.ctx.setCancel(false);
    this.ctx.say("이번 깎기 작업을 취소했습니다.");
  }

  deactivate() {
    this.up();
    this.tip = this.hoverBoard = null;
  }

  drawBoard(board) {
    const active = this.stroke
      ? [...this.stroke.records.values()].some(r =>
        r.shown.includes(board))
      : this.hoverBoard === board;

    if (active) Wood.grid(board);
  }

  drawOverlay() {
    if (!this.tip) return;

    const board = this.hoverBoard || {
      x: 0, y: 0, gridX: 0, gridY: 0
    };

    const origin = Wood.cellOrigin(
      board,
      this.brush(board, this.tip)
    );

    new paper.Path.Rectangle({
      rectangle: new paper.Rectangle(
        origin,
        new paper.Size(this.size, this.size)
      ),
      fillColor: new paper.Color(0.85, 0.15, 0.1, 0.18),
      strokeColor: "#c23d2d",
      strokeWidth: 1 / paper.view.zoom
    });

    this.ctx.hud(`${this.name} · ${this.size}×${this.size}px`);
  }
};
