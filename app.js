(() => {
  const $ = id => document.getElementById(id), canvas = $("canvas");
  if (!window.paper || !window.Matter) {
    $("status").textContent = "Paper.js 또는 Matter.js를 불러오지 못했습니다. vendor 폴더를 확인하세요.";
    return;
  }
  paper.setup(canvas);
  const W = 1000, H = 600, states = new Map();
  let stageIndex = 0, mode = "move", dragging = null, offset = null;
  let draft = null, hover = null, rawMouse = null;
  const state = () => states.get(stageIndex);
  const say = message => { $("status").textContent = message; };
  const local = (board, p) => [p.x - board.x, p.y - board.y];
  const world = (board, p) => new paper.Point(board.x + p[0], board.y + p[1]);
  const edgeTolerance = () => 9 / paper.view.zoom;
  const label = (point, content, size = 15) => new paper.PointText({
    point, content, fillColor: "#65523c", fontFamily: "sans-serif", fontSize: size
  });
  function initial() {
    const s = STAGES[stageIndex];
    return { boards: [Wood.create(140, 320, ...s.wide, "넓은 판자"),
      Wood.create(450, 130, ...s.narrow, "좁은 판자")] };
  }
  function cancel() {
    draft = null;
    $("cancel").disabled = true;
  }
  function topBoards(board) {
    const sorted = Wood.sorted(state().boards);
    return sorted.slice(sorted.indexOf(board) + 1);
  }
  function covered(board, p) {
    return topBoards(board).some(b => Wood.contains(b, p) || Wood.edge(b, p).distance < 1.7);
  }
  function findBoard(p) {
    return Wood.sorted(state().boards).reverse().find(b => Wood.contains(b, p));
  }
  function findEdge(p) {
    for (const board of Wood.sorted(state().boards).reverse()) {
      const edge = Wood.edge(board, p);
      if (edge.distance <= edgeTolerance() && !covered(board, edge.point)) return { board, ...edge };
    }
    return null;
  }
  function draw() {
    paper.project.activeLayer.removeChildren();
    for (let x = 0; x <= W; x += 50) new paper.Path.Line({
      from: [x, 0], to: [x, H], strokeColor: "#d8c9af"
    });
    for (let y = 0; y <= H; y += 50) new paper.Path.Line({
      from: [0, y], to: [W, y], strokeColor: "#d8c9af"
    });
    label([30, 38], STAGES[stageIndex].name, 18);
    const sorted = Wood.sorted(state().boards);
    sorted.forEach((board, index) => {
      Wood.draw(board, index);
      // 아래 판자의 자취를 위 판자보다 먼저 그려 가려짐을 유지합니다.
      if (draft && draft.board === board) {
        const line = Wood.line(board, draft.points);
        line.strokeColor = "#3c4550";
        line.strokeWidth = 2;
        line.opacity = 0.4;
        line.strokeCap = "round";
        paper.project.activeLayer.addChild(line);
      }
    });
    if (draft) {
      const tip = world(draft.board, draft.points[draft.points.length - 1]);
      if (rawMouse && tip.getDistance(rawMouse) > 5) new paper.Path.Line({
        from: tip, to: rawMouse, strokeColor: "#7e7770", dashArray: [3, 5], opacity: 0.4
      });
      new paper.Path.Circle({ center: tip, radius: 4, fillColor: draft.touched ? "#ce693c" : "#344b55" });
      new paper.Path.Circle({ center: world(draft.board, draft.points[0]), radius: 4,
        strokeColor: "#344b55", strokeWidth: 2 });
    } else if (mode === "pencil" && hover) {
      new paper.Path.Circle({ center: hover.point, radius: 5, fillColor: "#486749" });
    }
    if (draft) label([30, H - 20], "다른 변 클릭: 선 확정 · Esc: 자취 취소");
    paper.view.update();
  }
  function choose(index) {
    cancel();
    dragging = hover = rawMouse = null;
    stageIndex = (index + STAGES.length) % STAGES.length;
    if (!states.has(stageIndex)) states.set(stageIndex, initial());
    $("stage").value = stageIndex;
    say("이동 도구로 두 판자를 겹쳐보세요. 면적이 작은 판자가 위에 놓입니다.");
    draw();
  }
  function append(p) {
    const points = draft.points, q = local(draft.board, p);
    const last = points[points.length - 1];
    if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.03) return;
    // 같은 방향의 일직선 중간점만 제거하고 모서리와 접촉 경로는 유지합니다.
    if (points.length > 1) {
      const a = points[points.length - 2];
      const ab = new paper.Point(last[0] - a[0], last[1] - a[1]);
      const bc = new paper.Point(q[0] - last[0], q[1] - last[1]);
      if (Math.abs(ab.cross(bc)) < 0.00001 && ab.dot(bc) > 0) points.pop();
    }
    points.push(q);
  }
  function follow(p) {
    if (!draft) return;
    const board = draft.board, path = Wood.shape(board);
    const from = world(board, draft.points[draft.points.length - 1]);
    // 판자 경계를 가로질러 외부로 나갔다가 다시 들어가는 것도 막습니다.
    const allowed = q => path.contains(q) || path.getNearestPoint(q).getDistance(q) < 0.005;
    const result = draft.collision.advance(from, p, allowed);
    result.trail.forEach(append);
    draft.touched = result.touched;
    rawMouse = p.clone();
    path.remove();
  }
  function start(edge) {
    const collision = new PencilCollision(topBoards(edge.board));
    if (collision.hits(edge.point).length) return say("위쪽 판자에 가려지지 않은 변에서 시작하세요.");
    draft = { board: edge.board, points: [local(edge.board, edge.point)], collision, touched: false };
    $("cancel").disabled = false;
    say("마우스를 움직여 자취를 그리세요. 다른 변을 클릭하면 확정합니다. Esc로 취소합니다.");
  }
  function finish(p) {
    const board = draft.board, edge = Wood.edge(board, p);
    if (edge.distance > edgeTolerance() || covered(board, edge.point)) {
      return say("현재 그리는 판자의 보이는 변을 클릭해서 확정하세요.");
    }
    follow(edge.point);
    const last = world(board, draft.points[draft.points.length - 1]);
    if (last.getDistance(edge.point) > 1.1) return say("연필이 판자에 막혀 있습니다. 변을 따라 끝점까지 이동하세요.");
    const points = draft.points.map(p => [...p]);
    points[points.length - 1] = local(board, edge.point);
    if (!Wood.validMark(board, points)) return say("경로가 교차하거나 경계에 다시 닿았습니다. 취소 후 판자 내부를 지나 다른 변까지 그려주세요.");
    board.marks.push(points);
    cancel();
    say("선을 확정했습니다. 톱 도구로 이 선을 클릭하면 자릅니다.");
  }
  function saw(p) {
    for (const board of Wood.sorted(state().boards).reverse()) {
      if (covered(board, p)) continue;
      const index = board.marks.findIndex(mark => {
        const line = Wood.line(board, mark), nearest = line.getNearestPoint(p);
        const hit = nearest.getDistance(p) <= edgeTolerance();
        line.remove();
        return hit;
      });
      if (index < 0) continue;
      const pieces = Wood.cut(board, board.marks[index]);
      if (!pieces) return say("이 경로로는 두 조각을 만들 수 없습니다. 경계와 선을 확인하세요.");
      // 나머지 확정선은 절단 때 지웁니다. 새 조각에서 다시 그릴 수 있습니다.
      state().boards.splice(state().boards.indexOf(board), 1, ...pieces);
      say("선을 따라 두 조각으로 잘랐습니다. 이동 도구로 조각을 드래그해 확인하세요.");
      return;
    }
    say("보이는 확정 연필선 근처를 클릭하세요.");
  }
  const tool = new paper.Tool();
  tool.onMouseDown = event => {
    const p = event.point;
    if (mode === "move") {
      dragging = findBoard(p);
      if (dragging) offset = p.subtract([dragging.x, dragging.y]);
    } else if (mode === "pencil") {
      if (draft) finish(p);
      else {
        const edge = findEdge(p);
        if (edge) start(edge);
        else say("선을 시작할 판자의 보이는 변을 클릭하세요.");
      }
    } else saw(p);
    draw();
  };
  function motion(event) {
    rawMouse = event.point.clone();
    if (mode === "move" && dragging) {
      const b = Wood.bounds(dragging), next = event.point.subtract(offset);
      dragging.x = Math.max(12, Math.min(W - b.width - 12, next.x));
      dragging.y = Math.max(65, Math.min(H - b.height - 45, next.y));
    } else if (mode === "pencil") {
      if (draft) follow(event.point);
      else hover = findEdge(event.point);
    }
    draw();
  }
  tool.onMouseMove = motion;
  tool.onMouseDrag = motion;
  tool.onMouseUp = () => { dragging = null; };
  document.querySelectorAll("[data-tool]").forEach(button => {
    button.onclick = () => {
      cancel();
      mode = button.dataset.tool;
      dragging = hover = null;
      document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      canvas.style.cursor = mode === "move" ? "grab" : "crosshair";
      say({ move: "판자와 조각을 자유롭게 드래그하세요.",
        pencil: "판자의 보이는 변을 클릭해 자취를 시작하세요.",
        saw: "확정한 연필선을 클릭하세요. 가려진 선은 위 판자를 옮긴 뒤 자르세요." }[mode]);
      draw();
    };
  });
  $("cancel").onclick = () => { cancel(); say("자취를 취소했습니다."); draw(); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("cancel").onclick(); });
  STAGES.forEach((s, i) => $("stage").add(new Option(s.name, i)));
  $("stage").onchange = e => choose(Number(e.target.value));
  $("prev").onclick = () => choose(stageIndex - 1);
  $("next").onclick = () => choose(stageIndex + 1);
  $("reset").onclick = () => { states.set(stageIndex, initial()); choose(stageIndex); };
  function resize() {
    const box = $("workspace");
    paper.view.viewSize = new paper.Size(box.clientWidth, box.clientHeight);
    paper.view.zoom = Math.min(box.clientWidth / W, box.clientHeight / H);
    paper.view.center = new paper.Point(W / 2, H / 2);
    if (state()) draw();
  }
  new ResizeObserver(resize).observe($("workspace"));
  choose(0);
  resize();
})();
