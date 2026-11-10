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
    const stock = Wood.create(140, 320, ...s.wide, "작업 판자");
    const guide = Wood.create(450, 130, ...s.narrow, "자 판자");
    stock.role = "stock";
    guide.role = "guide";
    return { boards: [stock, guide] };
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
      // 위쪽 판자는 자입니다. 겹친 모서리에서도 그리기 대상으로 선택하지 않습니다.
      if (board.role === "guide") continue;
      const edge = Wood.edge(board, p);
      if (edge.distance > edgeTolerance()) continue;
      const collision = makeCollision(board);
      const point = collision.startAt(edge.point, q =>
        Wood.edge(board, q).distance < 0.02 && !covered(board, q));
      if (point) return { board, ...edge, point, collision };
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
      new paper.Path.Circle({ center: tip, radius: 4, fillColor: draft.touched ? "#ce693c" : "#344b55" });
      new paper.Path.Circle({ center: world(draft.board, draft.points[0]), radius: 4,
        strokeColor: "#344b55", strokeWidth: 2 });
    } else if (mode === "pencil" && hover) {
      new paper.Path.Circle({ center: hover.point, radius: 5, fillColor: "#486749" });
    }
    if (draft) label([30, H - 20], draft.collision.lock
      ? "자에 붙어 직선 그리기 · 바깥으로 떼면 자유 이동 · 다른 변 클릭: 확정"
      : "작업 판자에 그리는 중 · 다른 변 클릭: 선 확정 · Esc: 취소");
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
    // 자를 따라 되짚은 구간도 겹쳐 쌓지 않고 현재 끝점까지의 한 선으로 유지합니다.
    while (points.length > 1) {
      const last = points[points.length - 1];
      const a = points[points.length - 2];
      const ab = new paper.Point(last[0] - a[0], last[1] - a[1]);
      const aq = new paper.Point(q[0] - a[0], q[1] - a[1]);
      if (Math.abs(ab.cross(aq)) >= 0.00001) break;
      const distance = aq.dot(ab);
      if (distance >= 0 && distance <= ab.dot(ab)) {
        if (aq.length < 0.03) points.pop();
        else points[points.length - 1] = q;
        return;
      }
      points.pop();
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
  function makeCollision(board) {
    return new PencilCollision(topBoards(board), {
      snap: 10 / paper.view.zoom, release: 20 / paper.view.zoom
    });
  }
  function start(edge) {
    const collision = edge.collision;
    draft = { board: edge.board, points: [local(edge.board, edge.point)], collision, touched: false };
    $("cancel").disabled = false;
    say("작업 판자에 그립니다. 작은 판자의 변에 연필을 대면 직선으로 안내합니다. 다른 변을 클릭해 확정하세요.");
  }
  function finish(p) {
    const board = draft.board, edge = Wood.edge(board, p);
    if (edge.distance > edgeTolerance()) {
      return say("작업 판자의 다른 변을 클릭해서 확정하세요.");
    }
    follow(edge.point);
    const last = world(board, draft.points[draft.points.length - 1]);
    const end = Wood.edge(board, last);
    // 마우스가 자 안쪽에 있어도 실제 연필 끝이 도착한 작업 판자 경계에서 끝냅니다.
    if (end.distance > 1.1 || last.getDistance(edge.point) > 30 / paper.view.zoom) {
      return say("실제 연필 끝을 작업 판자의 다른 변까지 이동한 뒤 클릭하세요.");
    }
    const points = draft.points.map(p => [...p]);
    points[points.length - 1] = local(board, end.point);
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
      pieces.forEach(piece => { piece.role = "stock"; });
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
        else say("큰 작업 판자의 변을 클릭하세요. 작은 판자는 선을 곧게 안내하는 자입니다.");
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
        pencil: "큰 작업 판자의 변을 클릭하세요. 작은 판자는 자로 사용합니다.",
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
