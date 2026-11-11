Workshop.Controls = class {
  constructor(root = document) {
    const ids = [
      "canvas", "workspace", "status", "cancel", "reset", "zoom-in", "zoom-out",
      "zoom-fit", "zoom-level", "board-up", "board-down", "selected-board"
    ];
    this.elements = Object.fromEntries(ids.map(id => [id, root.getElementById(id)]));
    this.buttons = [...root.querySelectorAll("[data-tool]")];
  }

  get(id) {
    return this.elements[id];
  }

  say(text) {
    this.get("status").textContent = text;
  }

  setCancel(enabled) {
    this.get("cancel").disabled = !enabled;
  }

  setCursor(name) {
    this.get("canvas").style.cursor = WorkshopCursors[name] || "crosshair";
  }

  selectTool(name) {
    this.buttons.forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.tool === name));
    });
    this.setCursor(name);
  }

  updateLayers(scene) {
    const board = scene.boards.includes(scene.selected) ? scene.selected : null;

    this.get("selected-board").textContent = board
      ? `${board.name} · 높이 ${Wood.level(board)}`
      : "이동 도구로 판자를 선택하세요.";
    this.get("board-up").disabled = !board;
    this.get("board-down").disabled = !board || Wood.level(board) <= 0;
  }

  bind(app) {
    this.buttons.forEach(button => {
      button.onclick = () => app.select(button.dataset.tool);
    });

    this.get("cancel").onclick = () => app.cancel();
    this.get("zoom-in").onclick = () => app.viewport.zoom(2);
    this.get("zoom-out").onclick = () => app.viewport.zoom(0.5);
    this.get("zoom-fit").onclick = () => app.viewport.fit();
    this.get("board-up").onclick = () => app.shiftLayer(1);
    this.get("board-down").onclick = () => app.shiftLayer(-1);
    this.get("reset").onclick = () => app.reset();
  }
};
