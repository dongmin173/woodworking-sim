window.WorkshopTools = window.WorkshopTools || {};

WorkshopTools.Move = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.board = null;
  }

  activate() {
    this.ctx.say(
      "판자 드래그: 판자 이동 · 빈 곳 드래그: 화면 이동 · Space+드래그: 어디서나 화면 이동"
    );
  }

  down(point) {
    this.board = this.ctx.pick(point);

    if (this.board) {
      this.offset = point.subtract([
        this.board.x,
        this.board.y
      ]);
    }
  }

  drag(point) {
    if (!this.board) return;

    const b = Wood.bounds(this.board);
    const next = point.subtract(this.offset);

    this.board.x = Math.max(
      12,
      Math.min(1000 - b.width - 12, next.x)
    );

    this.board.y = Math.max(
      65,
      Math.min(600 - b.height - 45, next.y)
    );
  }

  up() {
    if (this.board) this.ctx.geometryChanged();
    this.board = null;
  }

  deactivate() {
    this.up();
  }

  cancel() {
    this.up();
  }
};