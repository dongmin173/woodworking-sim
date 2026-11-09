window.Wood = {
  create(x, y, w, h) {
    return { x, y, points: [[0, 0], [w, 0], [w, h], [0, h]], mark: null };
  },
  shape(board) {
    return new paper.Path({
      segments: board.points.map(([x, y]) => [board.x + x, board.y + y]),
      closed: true, insert: false
    });
  },
  bounds(board) {
    const path = this.shape(board);
    const bounds = path.bounds.clone();
    path.remove();
    return bounds;
  },
  draw(board, reference = false) {
    const path = this.shape(board);
    path.fillColor = reference ? "#d9bb85" : "#c98e50";
    path.strokeColor = "#72502f";
    path.strokeWidth = 2;
    paper.project.activeLayer.addChild(path);
    const b = path.bounds;
    const mask = path.clone();
    mask.clipMask = true;
    const grain = new paper.Group([mask]);
    for (let y = b.top + 12; y < b.bottom; y += 13) {
      grain.addChild(new paper.Path.Line({
        from: [b.left, y], to: [b.right, y + 3],
        strokeColor: reference ? "#b99c69" : "#ad743e", strokeWidth: 1
      }));
    }
    if (board.mark !== null) {
      const x = board.x + board.mark;
      new paper.Path.Line({
        from: [x, b.top], to: [x, b.bottom],
        strokeColor: "#33312c", strokeWidth: 3
      });
    }
  },
  // 절단선 양쪽 영역과 교집합을 구해 독립된 닫힌 다각형을 만듭니다.
  cut(board) {
    if (board.mark === null) return null;
    const path = this.shape(board);
    const b = path.bounds;
    const x = board.x + board.mark;
    if (x <= b.left + 1 || x >= b.right - 1) return null;
    const regions = [
      new paper.Rectangle(b.left - 1, b.top - 1, x - b.left + 1, b.height + 2),
      new paper.Rectangle(x, b.top - 1, b.right - x + 1, b.height + 2)
    ];
    const pieces = regions.map(rect => {
      const region = new paper.Path.Rectangle({ rectangle: rect, insert: false });
      const result = path.intersect(region, { insert: false });
      const rb = result.bounds;
      const piece = {
        x: rb.left, y: rb.top, mark: null,
        points: result.segments.map(s => [s.point.x - rb.left, s.point.y - rb.top])
      };
      region.remove();
      result.remove();
      return piece;
    });
    path.remove();
    return pieces;
  }
};
