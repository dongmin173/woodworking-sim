Workshop.SceneRenderer = class {
  draw(scene, activeTool) {
    paper.project.activeLayer.removeChildren();
    this.drawTable();

    Wood.sorted(scene.boards).forEach(board => {
      Wood.draw(board, activeTool.preview?.(board));
      activeTool.drawBoard?.(board);
    });

    activeTool.drawOverlay?.();
    paper.view.update();
  }

  drawTable() {
    const { width, height, gridSize } = Workshop.config.world;
    const bounds = paper.view.bounds;
    const line = (from, to) => new paper.Path.Line({
      from,
      to,
      strokeColor: "#d8c9af",
      strokeWidth: 1 / paper.view.zoom
    });

    for (let x = Math.max(0, Math.ceil(bounds.left / gridSize) * gridSize);
      x <= Math.min(width, bounds.right); x += gridSize) {
      line([x, 0], [x, height]);
    }

    for (let y = Math.max(0, Math.ceil(bounds.top / gridSize) * gridSize);
      y <= Math.min(height, bounds.bottom); y += gridSize) {
      line([0, y], [width, y]);
    }
  }

  hud(text) {
    new paper.PointText({
      point: paper.view.viewToProject(
        new paper.Point(14, paper.view.viewSize.height - 16)
      ),
      content: text,
      fillColor: "#514335",
      fontFamily: "sans-serif",
      fontSize: 14 / paper.view.zoom
    });
  }
};
