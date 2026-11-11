window.WorkshopTools = window.WorkshopTools || {};

WorkshopTools.Move = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.board = null;
  }

  activate() {
    this.ctx.say(
      "판자 드래그: 판자 이동 · 빈 곳 드래그: 화면 이동"
      + " · Space+드래그: 어디서나 화면 이동"
    );
  }

  down(point) {
    this.board = this.ctx.pick(point);

    if (this.board) {
      this.ctx.selectBoard(this.board);
      this.ctx.resolveOverlaps();
      this.ctx.geometryChanged();

      this.lastPointer = point.clone();
    }
  }

  drag(point) {
    if (!this.board) return;

    // 막힌 이동량을 누적하지 않고 새 마우스 이동량만 적용합니다.
    const delta = point.subtract(this.lastPointer);
    this.lastPointer = point.clone();

    this.ctx.moveBoard(
      this.board,
      new paper.Point(this.board.x, this.board.y).add(delta)
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

  drawBoard(board) {
    if (this.ctx.scene.selected !== board) return;

    const outline = Wood.shape(board);
    outline.strokeColor = "#386b84";
    outline.strokeWidth = 1.5 / paper.view.zoom;
    outline.dashArray = [
      5 / paper.view.zoom,
      4 / paper.view.zoom
    ];

    paper.project.activeLayer.addChild(outline);
  }
};
