window.WorkshopTools = window.WorkshopTools || {};

WorkshopTools.Carver = class {
  constructor(ctx, { name, size, dragOnly }) {
    this.ctx = ctx;
    this.name = name;
    this.size = size;
    this.dragOnly = dragOnly;
    this.stroke = null;
    this.tip = null;
    this.hoverBoard = null;
  }

  activate() {
    this.ctx.say(
      this.dragOnly
        ? `톱 끝을 누른 채 드래그하세요. 끝부분 주변 ${this.size}×${this.size}px를 깎습니다. 클릭만 하면 깎이지 않습니다.`
        : `구두칼: 클릭 위치 중심 ${this.size}×${this.size}px를 깎습니다. 빈 곳에서 드래그를 시작해도 됩니다.`
    );
  }

  // 클릭 위치를 중심으로 브러시 사각형을 계산합니다.
  brush(board, point) {
    const x =
      Math.round(point.x - board.x - (board.gridX || 0))
      - this.size / 2;

    const y =
      Math.round(point.y - board.y - (board.gridY || 0))
      - this.size / 2;

    return [x, y];
  }

  move(point) {
    this.tip = point.clone();
    this.hoverBoard = this.ctx.pick(point, this.size);
  }

  down(point) {
    if (this.stroke) this.up();

    this.move(point);

    // 판자 밖을 클릭해도 드래그 작업을 시작합니다.
    const snapshot = [...this.ctx.scene.boards];
    const order = Wood.sorted(snapshot).reverse();

    this.stroke = {
      snapshot,
      order,
      start: point.clone(),
      last: point.clone(),
      started: false,
      records: new Map(),
      shapes: new Map(
        order.map(board => [board, Wood.shape(board)])
      ),
      bounds: new Map(
        order.map(board => [board, Wood.bounds(board)])
      )
    };

    this.ctx.setCancel(true);

    // 구두칼은 클릭 즉시, 톱은 드래그가 시작된 뒤 깎습니다.
    if (!this.dragOnly) {
      this.stamp(point);
    }
  }

  drag(point) {
    if (!this.stroke) return;

    this.move(point);

    if (
      this.dragOnly &&
      !this.stroke.started &&
      this.stroke.start.getDistance(point)
        * paper.view.zoom < 1
    ) {
      return;
    }

    this.stroke.started = true;
    this.stamp(point);
  }

  stamp(point) {
    const s = this.stroke;
    const delta = point.subtract(s.last);

    // 빠른 드래그에서도 중간 픽셀이 빠지지 않도록 나눠 검사합니다.
    const steps = Math.max(
      1,
      Math.ceil(
        Math.max(Math.abs(delta.x), Math.abs(delta.y)) * 2
      )
    );

    const pending = new Map();

    for (let i = 0; i <= steps; i++) {
      const p = s.last.add(delta.multiply(i / steps));

      for (let layer = 0; layer < s.order.length; layer++) {
        const source = s.order[layer];
        const cell = this.brush(source, p);
        const origin = Wood.cellOrigin(source, cell);

        const brushRect = new paper.Rectangle(
          origin,
          new paper.Size(this.size, this.size)
        );

        if (!brushRect.intersects(s.bounds.get(source))) {
          continue;
        }

        let record = s.records.get(source);

        if (!record) {
          record = {
            source,
            shown: [source],
            cells: new Set(),
            stencil: null,
            removedArea: 0
          };

          s.records.set(source, record);
        }

        for (let y = 0; y < this.size; y++) {
          for (let x = 0; x < this.size; x++) {
            const pixel = [
              cell[0] + x,
              cell[1] + y
            ];

            const key = pixel.join(",");
            if (record.cells.has(key)) continue;

            const corner = Wood.cellOrigin(source, pixel);

            const pixelRect = new paper.Rectangle(
              corner,
              new paper.Size(1, 1)
            );

            if (
              !pixelRect.intersects(s.bounds.get(source))
            ) {
              continue;
            }

            const center = corner.add([0.5, 0.5]);

            // 한 번의 드래그 중에는 위 판자에 가려져 있던
            // 아래 판자까지 연속으로 뚫지 않습니다.
            const covered = s.order
              .slice(0, layer)
              .some(board =>
                s.shapes.get(board).contains(center)
              );

            if (covered) continue;

            record.cells.add(key);

            if (!pending.has(record)) {
              pending.set(record, []);
            }

            pending.get(record).push(pixel);
          }
        }
      }
    }

    s.last = point.clone();

    for (const [record, cells] of pending) {
      const next = Wood.stencil(record.source, cells);

      record.stencil = record.stencil
        ? martinez.union(record.stencil, next)
        : next;

      const result = Wood.carve(
        record.source,
        record.stencil
      );

      if (!result) continue;

      this.ctx.replace(
        record.shown,
        result.pieces,
        false
      );

      record.shown = result.pieces;
      record.removedArea = result.removedArea;
    }

    const area = [...s.records.values()].reduce(
      (sum, record) => sum + record.removedArea,
      0
    );

    this.ctx.say(
      `${this.name}: ${area.toFixed(2)}px² 깎았습니다. Esc: 이번 드래그 취소`
    );
  }

  releaseShapes() {
    this.stroke?.shapes.forEach(shape => shape.remove());
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
      this.ctx.scene.boards = [
        ...this.stroke.snapshot
      ];

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
      ? [...this.stroke.records.values()].some(record =>
          record.shown.includes(board)
        )
      : this.hoverBoard === board;

    if (active) Wood.grid(board);
  }

  drawOverlay() {
    if (!this.tip) return;

    const board = this.hoverBoard || {
      x: 0,
      y: 0,
      gridX: 0,
      gridY: 0
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

    this.ctx.hud(
      `${this.name} · 끝부분 기준 ${this.size}×${this.size}px`
    );
  }
};