Workshop.Application = class {
  constructor(controls) {
    this.controls = controls;
    this.scene = Workshop.createScene();
    this.snapper = new EdgeSnap();
    this.solids = new BoardCollision();
    this.renderer = new Workshop.SceneRenderer();
    this.ctx = Workshop.createContext({
      scene: this.scene,
      snapper: this.snapper,
      solids: this.solids,
      controls,
      renderer: this.renderer
    });

    this.current = "move";
    this.tools = {
      move: new WorkshopTools.Move(this.ctx),
      pencil: new WorkshopTools.Pencil(this.ctx),
      saw: new WorkshopTools.Saw(this.ctx),
      knife: new WorkshopTools.Knife(this.ctx)
    };
    this.input = new Workshop.InputController(this);
  }

  get activeTool() {
    return this.tools[this.current];
  }

  start() {
    this.ctx.resolveOverlaps();
    this.ctx.geometryChanged();
    this.viewport = new WorkshopViewport(
      this.controls.get("workspace"),
      this.controls.get("zoom-level"),
      () => this.draw()
    );

    this.controls.bind(this);
    this.input.bind();
    this.controls.setCursor(this.current);
    this.activeTool.activate();
  }

  draw() {
    this.renderer.draw(this.scene, this.activeTool);
    this.controls.updateLayers(this.scene);
  }

  select(name) {
    this.activeTool.deactivate?.();
    this.current = name;
    this.ctx.setCancel(false);
    this.ctx.geometryChanged();
    this.controls.selectTool(name);
    this.activeTool.activate?.();
    this.draw();
  }

  shiftLayer(delta) {
    this.activeTool.deactivate?.();
    this.input.stopPan();

    const board = this.scene.selected;
    if (!board || !this.scene.boards.includes(board)) return;

    board.layer = Math.max(0, Wood.level(board) + delta);
    this.ctx.resolveOverlaps();
    this.ctx.geometryChanged();
    this.activeTool.activate?.();
    this.ctx.say(
      `${board.name}: 높이 ${board.layer}. `
      + "같은 높이의 판자는 서로 맞닿고, 연필은 같은 높이와 위쪽 판자에 막힙니다."
    );
    this.draw();
  }

  cancel() {
    this.activeTool.cancel?.();
    this.draw();
  }

  reset() {
    this.activeTool.cancel?.();
    Object.assign(this.scene, Workshop.createScene());
    this.ctx.geometryChanged();
    this.viewport.fit();
    this.select(this.current);
  }
};
