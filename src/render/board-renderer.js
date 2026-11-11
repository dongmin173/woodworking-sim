Object.assign(Wood, {
  draw(board, preview = null) {
    const path = this.shape(board);
    path.fillColor = "#cb945a";
    path.strokeColor = "#72502f";
    path.strokeWidth = Math.min(2, 1.5 / paper.view.zoom);

    paper.project.activeLayer.addChild(path);

    const mask = path.clone({ insert: false });
    mask.clipMask = true;

    const contents = new paper.Group([mask]);
    const b = path.bounds;

    for (let y = b.top + 12; y < b.bottom; y += 13) {
      contents.addChild(new paper.Path.Line({
        from: [b.left, y],
        to: [b.right, y + 3],
        strokeColor: "#a97845",
        strokeWidth: 1
      }));
    }

    for (const mark of [...board.marks, ...(preview ? [preview] : [])]) {
      const line = this.line(board, mark);
      line.strokeColor = "#34322e";
      line.strokeWidth = 2;
      line.opacity = mark === preview ? 0.35 : 1;
      contents.addChild(line);
    }
  },

  grid(board) {
    if (paper.view.zoom < 6) return;

    const bounds = this.bounds(board).intersect(paper.view.bounds);
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const origin = this.cellOrigin(board, [0, 0]);
    const mask = this.shape(board);
    mask.clipMask = true;

    const group = new paper.Group([mask]);

    for (let x = Math.ceil(bounds.left - origin.x);
      x <= bounds.right - origin.x; x++) {
      group.addChild(new paper.Path.Line({
        from: [origin.x + x, bounds.top],
        to: [origin.x + x, bounds.bottom],
        strokeColor: "#735d43",
        strokeWidth: 0.5 / paper.view.zoom,
        opacity: 0.45
      }));
    }

    for (let y = Math.ceil(bounds.top - origin.y);
      y <= bounds.bottom - origin.y; y++) {
      group.addChild(new paper.Path.Line({
        from: [bounds.left, origin.y + y],
        to: [bounds.right, origin.y + y],
        strokeColor: "#735d43",
        strokeWidth: 0.5 / paper.view.zoom,
        opacity: 0.45
      }));
    }
  }
});
