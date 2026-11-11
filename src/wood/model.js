window.Wood = {
  nextId: 1,

  create(x, y, w, h, name = "판자") {
    const id = this.nextId++;

    return {
      id, stack: id, layer: 0, name, x, y,
      contours: [[[0, 0], [w, 0], [w, h], [0, h]]],
      marks: [], gridX: 0, gridY: 0
    };
  },

  sorted(boards) {
    return [...boards].sort((a, b) =>
      this.level(a) - this.level(b)
      || (a.stack ?? a.id) - (b.stack ?? b.id)
      || a.id - b.id
    );
  },

  level(board) {
    return Number.isFinite(board.layer) ? board.layer : 0;
  },

  blocks(owner, other) {
    return owner !== other && this.level(other) >= this.level(owner);
  },

  cell(board, point) {
    return [
      Math.floor(point.x - board.x - (board.gridX || 0) + 1e-9),
      Math.floor(point.y - board.y - (board.gridY || 0) + 1e-9)
    ];
  },

  cellOrigin(board, cell) {
    return new paper.Point(
      board.x + (board.gridX || 0) + cell[0],
      board.y + (board.gridY || 0) + cell[1]
    );
  }
};
