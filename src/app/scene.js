Workshop.createScene = () => ({
  boards: Workshop.config.initialBoards.map(spec => ({
    ...Wood.create(spec.x, spec.y, spec.width, spec.height, spec.name),
    layer: spec.layer
  })),
  selected: null
});

// 도구가 공유하는 장면 API. DOM과 입력 이벤트는 여기서 다루지 않습니다.
Workshop.createContext = ({ scene, snapper, solids, controls, renderer }) => ({
  scene,
  snapper,
  modifiers: { control: false },

  say: text => controls.say(text),
  setCancel: enabled => controls.setCancel(enabled),
  hud: text => renderer.hud(text),
  local: (board, point) => [point.x - board.x, point.y - board.y],
  world: (board, point) => new paper.Point(board.x + point[0], board.y + point[1]),
  tolerance: () => 9 / paper.view.zoom,

  geometryChanged() {
    // 절삭 후에는 위치를 바꾸지 않고 선택과 연필 스냅만 갱신합니다.
    if (scene.selected && !scene.boards.includes(scene.selected)) {
      const stack = scene.selected.stack ?? scene.selected.id;
      scene.selected = scene.boards
        .filter(board => (board.stack ?? board.id) === stack)
        .sort((a, b) => Wood.area(b) - Wood.area(a))[0] || null;
    }

    snapper.rebuild(scene.boards);
    controls.updateLayers(scene);
  },

  resolveOverlaps() {
    return solids.separate(scene.boards);
  },

  moveBoard(board, target) {
    solids.move(board, target, scene.boards);
  },

  selectBoard(board) {
    scene.selected = board;
    controls.updateLayers(scene);
  },

  // 콜백으로 전달해도 동작하도록 this 대신 scene을 사용합니다.
  visible(board, point, excluded = [board]) {
    const ordered = Wood.sorted([
      ...scene.boards.filter(other => other !== board && !excluded.includes(other)),
      board
    ]);

    return !ordered.slice(ordered.indexOf(board) + 1).some(other =>
      Wood.contains(other, point) && Wood.edge(other, point).distance > 0.1
    );
  },

  pick(point, margin = 0) {
    return Wood.sorted(scene.boards).reverse().find(board =>
      Wood.contains(board, point)
      || (margin > 0 && Wood.edge(board, point).distance <= margin)
    );
  },

  replace(oldParts, newParts, rebuild = true) {
    const positions = oldParts
      .map(board => scene.boards.indexOf(board))
      .filter(index => index >= 0);
    const index = positions.length ? Math.min(...positions) : scene.boards.length;

    scene.boards = scene.boards.filter(board => !oldParts.includes(board));
    scene.boards.splice(index, 0, ...newParts);

    if (oldParts.includes(scene.selected) && newParts.length) {
      scene.selected = [...newParts].sort((a, b) => Wood.area(b) - Wood.area(a))[0];
    }

    if (rebuild) this.geometryChanged();
  }
});
