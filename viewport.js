/* 화면 좌표를 기준으로 확대·축소와 화면 이동을 처리합니다. */
window.WorkshopViewport = class {
  constructor(box, output, redraw) {
    this.box = box;
    this.output = output;
    this.redraw = redraw;
    this.factor = 1;
    this.focus = new paper.Point(500, 300);
    this.panning = null;
    this.ready = false;

    new ResizeObserver(() => this.resize()).observe(box);
    this.resize();
  }

  resize() {
    const center = this.ready
      ? paper.view.center.clone()
      : new paper.Point(500, 300);

    paper.view.viewSize = new paper.Size(
      this.box.clientWidth,
      this.box.clientHeight
    );

    this.fitZoom = Math.min(
      this.box.clientWidth / 1000,
      this.box.clientHeight / 600
    );

    paper.view.zoom = this.fitZoom * this.factor;
    paper.view.center = center;
    this.ready = true;
    this.update();
  }

  update() {
    this.output.textContent =
      `${Math.round(this.factor * 100)}%`;

    this.redraw();
  }

  zoom(multiplier) {
    const anchor = this.focus.clone();
    const screen = paper.view.projectToView(anchor);

    this.factor = Math.max(
      1,
      Math.min(32, this.factor * multiplier)
    );

    paper.view.zoom = this.fitZoom * this.factor;

    paper.view.center = paper.view.center.add(
      anchor.subtract(paper.view.viewToProject(screen))
    );

    this.update();
  }

  fit() {
    this.factor = 1;
    this.focus = new paper.Point(500, 300);
    paper.view.zoom = this.fitZoom;
    paper.view.center = this.focus;
    this.update();
  }

  panStart(point) {
    this.panStartScreen(
      paper.view.projectToView(point)
    );
  }

  panMove(point) {
    this.panMoveScreen(
      paper.view.projectToView(point)
    );
  }

  panStartScreen(point) {
    this.panning = {
      screen: point.clone(),
      center: paper.view.center.clone()
    };
  }

  panMoveScreen(point) {
    if (!this.panning) return;

    const delta = point
      .subtract(this.panning.screen)
      .divide(paper.view.zoom);

    paper.view.center =
      this.panning.center.subtract(delta);

    this.redraw();
  }

  panEnd() {
    this.panning = null;
  }
};