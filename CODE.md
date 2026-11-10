# Matter.js 변경본 — 작성·수정한 코드 전문

이 문서는 아래 파일의 전체 코드를 생략 없이 모았습니다. 각 코드 블록을 같은 이름의 파일에 저장합니다.
실행할 때는 ZIP에 포함된 vendor 폴더도 필요합니다. 외부 라이브러리 배포본 자체는 수정하지 않았으며
ZIP의 vendor/paper-full.min.js와 vendor/matter.min.js에 원문이 포함되어 있습니다.

- index.html: 두 라이브러리와 프로젝트 코드 로딩, 도구 UI
- style.css: 화면 스타일
- stages.js: 두 판자의 크기
- wood.js: 판자 표시, 경계와 경로 검증, 두 다각형으로 절단
- collision.js: Matter.js 충돌 질의와 접촉·접선 이동 제어
- app.js: 두 판자 이동, 면적순 겹침, 연필 시작/미리보기/확정, 톱, Reset
- tests/verify.cjs: 실제 라이브러리를 이용한 계산 및 입력 처리 검사

실행·적용 방법은 README.md, 출처는 SOURCES.txt, AI 작성 내역은 AI_USAGE.md를 확인하세요.

## index.html

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>작은 목공 작업실</title>
  <link rel="stylesheet" href="style.css">
  <script defer src="vendor/paper-full.min.js"></script>
  <script defer src="vendor/matter.min.js"></script>
  <script defer src="stages.js"></script>
  <script defer src="wood.js"></script>
  <script defer src="collision.js"></script>
  <script defer src="app.js"></script>
</head>
<body>
  <header>
    <div><small>COMPUTER GRAPHICS · PROJECT 2</small><h1>작은 목공 작업실</h1></div>
    <nav aria-label="스테이지">
      <button id="prev" aria-label="이전 스테이지">←</button>
      <select id="stage" aria-label="스테이지 선택"></select>
      <button id="next" aria-label="다음 스테이지">→</button>
      <button id="reset">Reset</button>
    </nav>
  </header>
  <main>
    <aside aria-label="도구">
      <button data-tool="move" aria-pressed="true">✋ 이동</button>
      <button data-tool="pencil" aria-pressed="false">✏️ 연필</button>
      <button data-tool="saw" aria-pressed="false">🪚 톱</button>
      <button id="cancel" disabled>자취 취소</button>
      <p>1. 두 판자 겹치기<br>2. 큰 판자의 변 클릭<br>3. 작은 판자 따라 그리기<br>4. 다른 변 클릭으로 확정<br>5. 톱으로 선 클릭</p>
    </aside>
    <section>
      <div id="workspace"><canvas id="canvas" aria-label="목공 작업대"></canvas></div>
      <p id="status" role="status" aria-live="polite">작업대를 준비하고 있습니다.</p>
    </section>
  </main>
  <footer>두 판자를 모두 움직일 수 있습니다. 면적이 작은 판자가 위에 놓입니다. 연필은 위쪽 판자의 모든 변에 막히며, 변을 따라 이동합니다. Esc: 자취 취소</footer>
</body>
</html>
```

## style.css

```css
* { box-sizing: border-box; }
body { margin: 0; padding: 28px; background: #f4f0e7; color: #362c23; font: 16px/1.6 "Malgun Gothic", sans-serif; }
header, nav, main { display: flex; gap: 12px; }
header { max-width: 1240px; margin: auto auto 22px; justify-content: space-between; align-items: center; flex-wrap: wrap; }
small { color: #82725e; letter-spacing: 2px; font-size: 11px; }
h1 { margin: 2px 0; font-size: 28px; }
nav { align-items: center; flex-wrap: wrap; }
button, select { padding: 11px 15px; border: 1px solid #c7bba7; border-radius: 8px; background: #fffdf8; color: inherit; font: inherit; cursor: pointer; }
button:hover { background: #e9e1d1; }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible, select:focus-visible { outline: 3px solid #bc7a36; outline-offset: 2px; }
button[aria-pressed="true"] { background: #435f48; color: white; border-color: #435f48; }
main { max-width: 1240px; margin: auto; align-items: stretch; }
aside { width: 130px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; }
aside p { color: #82725e; font-size: 13px; }
section { min-width: 0; flex: 1; }
#workspace { width: 100%; aspect-ratio: 5 / 3; overflow: hidden; border-radius: 14px; border: 1px solid #b5a58e; background: #e4d6bd; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; }
#status { min-height: 30px; padding: 10px 14px; background: #fffdf8; border-radius: 8px; }
footer { max-width: 1240px; margin: 18px auto; color: #82725e; font-size: 13px; }
@media (max-width: 650px) {
  body { padding: 12px; }
  main { flex-direction: column; }
  aside { width: 100%; flex-direction: row; flex-wrap: wrap; }
  aside p { display: none; }
  button, select { padding: 8px 10px; }
}
```

## stages.js

```javascript
// 논리 좌표 1000 × 600. 면적이 큰 판자가 항상 아래에 그려집니다.
window.STAGES = [
  { name: "01 · 기본 판자", wide: [560, 180], narrow: [240, 110] },
  { name: "02 · 작은 틀", wide: [500, 200], narrow: [170, 130] },
  { name: "03 · 긴 판자", wide: [650, 170], narrow: [310, 100] }
];
```

## wood.js

```javascript
/* Paper.js: 판자 표시, 경계 위치, 선 검증, 경계와 절단 경로로 두 다각형 만들기. */
window.Wood = {
  nextId: 1,
  create(x, y, w, h, name = "판자") {
    return { id: this.nextId++, name, x, y,
      points: [[0, 0], [w, 0], [w, h], [0, h]], marks: [] };
  },
  shape(board) {
    return new paper.Path({
      segments: board.points.map(([x, y]) => [board.x + x, board.y + y]),
      closed: true, insert: false
    });
  },
  line(board, points) {
    return new paper.Path({
      segments: points.map(([x, y]) => [board.x + x, board.y + y]), insert: false
    });
  },
  area(board) {
    const path = this.shape(board), area = Math.abs(path.area);
    path.remove();
    return area;
  },
  bounds(board) {
    const path = this.shape(board), bounds = path.bounds.clone();
    path.remove();
    return bounds;
  },
  sorted(boards) {
    return [...boards].sort((a, b) => this.area(b) - this.area(a) || a.id - b.id);
  },
  contains(board, point) {
    const path = this.shape(board), inside = path.contains(point);
    path.remove();
    return inside;
  },
  edge(board, point) {
    const path = this.shape(board), location = path.getNearestLocation(point);
    const result = { point: location.point.clone(), offset: location.offset,
      distance: location.point.getDistance(point) };
    path.remove();
    return result;
  },
  draw(board, index) {
    const path = this.shape(board);
    path.fillColor = index === 0 ? "#cb945a" : "#e3c18b";
    path.strokeColor = "#72502f";
    path.strokeWidth = 2;
    path.shadowColor = new paper.Color(0, 0, 0, 0.16);
    path.shadowBlur = 5;
    path.shadowOffset = new paper.Point(2, 4);
    paper.project.activeLayer.addChild(path);
    const b = path.bounds, mask = path.clone({ insert: false });
    mask.shadowColor = null;
    mask.clipMask = true;
    const grain = new paper.Group([mask]);
    for (let y = b.top + 12; y < b.bottom; y += 13) {
      grain.addChild(new paper.Path.Line({
        from: [b.left, y], to: [b.right, y + 3], strokeColor: "#a97845", strokeWidth: 1
      }));
    }
    for (const mark of board.marks) {
      const line = this.line(board, mark);
      line.strokeColor = "#34322e";
      line.strokeWidth = 2.5;
      line.strokeCap = "round";
      paper.project.activeLayer.addChild(line);
    }
  },
  // 절단선은 열린 단순 경로이며, 양 끝만 판자 경계에 닿아야 합니다.
  validMark(board, points) {
    if (points.length < 2) return false;
    const path = this.shape(board), line = this.line(board, points);
    const ends = [line.firstSegment.point, line.lastSegment.point];
    let valid = line.length > 8 && ends[0].getDistance(ends[1]) > 4
      && ends.every(p => path.getNearestPoint(p).getDistance(p) < 0.05)
      && line.getIntersections().length === 0;
    if (valid) {
      // 중간 경계 접촉/이탈은 두 조각으로 나누는 열린 절단으로 인정하지 않습니다.
      valid = path.getIntersections(line).every(hit =>
        ends.some(p => p.getDistance(hit.point) < 0.1));
      for (let offset = 0.5; valid && offset < line.length - 0.5; offset += 1) {
        const p = line.getPointAt(offset);
        valid = path.contains(p) && path.getNearestPoint(p).getDistance(p) > 0.02;
      }
    }
    path.remove();
    line.remove();
    return valid;
  },
  cut(board, mark) {
    if (!this.validMark(board, mark)) return null;
    const path = this.shape(board), line = this.line(board, mark);
    const a = path.getNearestLocation(line.firstSegment.point).offset;
    const b = path.getNearestLocation(line.lastSegment.point).offset;
    // start → end 방향으로 원래 판자 테두리를 걷습니다. 마지막 변 이후에는 순환합니다.
    const walk = (start, end) => {
      const length = path.length, distance = (end - start + length) % length;
      const vertices = path.segments.map(s => ({
        p: s.point, distance: (s.location.offset - start + length) % length
      })).filter(s => s.distance > 0.001 && s.distance < distance - 0.001)
        .sort((x, y) => x.distance - y.distance);
      return [path.getPointAt(start), ...vertices.map(s => s.p), path.getPointAt(end)];
    };
    const trace = line.segments.map(s => s.point);
    const polygons = [
      [...trace, ...walk(b, a).slice(1, -1)],
      [...trace].reverse().concat(walk(a, b).slice(1, -1))
    ].map(segments => new paper.Path({ segments, closed: true, insert: false }));
    const totalArea = polygons.reduce((sum, p) => sum + Math.abs(p.area), 0);
    const valid = polygons.every(p => Math.abs(p.area) > 2 && !p.getIntersections().length)
      && Math.abs(totalArea - Math.abs(path.area)) < 0.1;
    const pieces = valid ? polygons.map(p => {
      const origin = p.bounds.topLeft;
      return { id: this.nextId++, name: `${board.name} 조각`, x: origin.x, y: origin.y,
        points: p.segments.map(s => [s.point.x - origin.x, s.point.y - origin.y]), marks: [] };
    }) : null;
    [...polygons, path, line].forEach(p => p.remove());
    return pieces;
  }
};
```

## collision.js

```javascript
/* Matter.js로 연필과 위쪽 판자의 모든 테두리를 검사합니다.
   중력/반발력 대신 접촉 지점에서 멈추고 접선 방향 이동을 허용합니다. */
window.PencilCollision = class {
  constructor(boards) {
    this.radius = 1.5;
    this.probe = Matter.Bodies.circle(0, 0, this.radius, { isSensor: true });
    // 변마다 얇은 충돌체를 만들면 절단 후 오목한 조각도 볼록 껍질로 바뀌지 않습니다.
    this.edges = boards.flatMap(board => board.points.map(([x, y], i, points) => {
      const next = points[(i + 1) % points.length];
      const dx = next[0] - x, dy = next[1] - y, length = Math.hypot(dx, dy);
      const body = Matter.Bodies.rectangle(board.x + x + dx / 2,
        board.y + y + dy / 2, length, 0.2,
        { isStatic: true, angle: Math.atan2(dy, dx) });
      body.plugin.tangent = new paper.Point(dx / length, dy / length);
      return body;
    }));
  }
  hits(point) {
    Matter.Body.setPosition(this.probe, { x: point.x, y: point.y });
    return Matter.Query.collides(this.probe, this.edges);
  }
  advance(from, target, allowed) {
    let current = from.clone(), touched = false;
    const trail = [], delta = target.subtract(from);
    // 1논리 단위 이하의 이동을 검사해 빠른 마우스 이동도 판자를 통과하지 못하게 합니다.
    const steps = Math.max(1, Math.ceil(delta.length));
    const step = delta.divide(steps);
    for (let i = 0; i < steps; i++) {
      const next = current.add(step), hits = this.hits(next);
      if (!allowed(next)) break;
      if (!hits.length) {
        current = next;
      } else {
        touched = true;
        // 접촉 직전까지 이분 탐색으로 이동하고, 남은 이동량은 접선에 투영합니다.
        let lo = 0, hi = 1;
        for (let j = 0; j < 10; j++) {
          const mid = (lo + hi) / 2;
          if (this.hits(current.add(step.multiply(mid))).length) hi = mid;
          else lo = mid;
        }
        current = current.add(step.multiply(lo));
        // 모서리에서는 두 변이 동시에 닿을 수 있으므로 가능한 접선을 모두 검사합니다.
        const tangents = hits.flatMap(hit => {
          const edge = hit.bodyA === this.probe ? hit.bodyB : hit.bodyA;
          return [edge.plugin.tangent, new paper.Point(-hit.normal.y, hit.normal.x)];
        });
        let best = current, progress = 0;
        for (const tangent of tangents) {
          const motion = tangent.multiply(step.dot(tangent) * (1 - lo));
          const slide = current.add(motion), score = motion.dot(step);
          if (score > progress && allowed(slide) && !this.hits(slide).length) {
            best = slide;
            progress = score;
          }
        }
        current = best;
      }
      trail.push(current.clone());
    }
    return { point: current, trail, touched };
  }
};
```

## app.js

```javascript
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
```

## tests/verify.cjs

```javascript
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..')+'/';
const c=vm.createContext({console,self:{navigator:{userAgent:'vector-test'}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{}});
for(const f of ['vendor/paper-full.min.js','vendor/matter.min.js']) vm.runInContext(fs.readFileSync(root+f,'utf8'),c);
vm.runInContext(`
window=globalThis;
paper.setup(new paper.Size(1000,600));
const elements=Object.fromEntries(['canvas','workspace','status','cancel','stage','prev','next','reset'].map(id=>[id,{style:{},textContent:'',disabled:false,value:'0',clientWidth:1000,clientHeight:600,add(){}}]));
const buttons=['move','pencil','saw'].map(mode=>({dataset:{tool:mode},setAttribute(){}}));
const keyHandlers=[];
document={getElementById:id=>elements[id], querySelectorAll:()=>buttons, addEventListener:(type,fn)=>keyHandlers.push(fn)};
Option=function(){};
ResizeObserver=class{constructor(fn){this.fn=fn}observe(){this.fn()}};
const originalSetup=paper.setup.bind(paper);
paper.setup=()=>originalSetup(new paper.Size(1000,600));
`,c);
for(const f of ['stages.js','wood.js','collision.js'])vm.runInContext(fs.readFileSync(root+f,'utf8'),c);
const app=fs.readFileSync(root+'app.js','utf8').replace('  choose(0);','  window.inspect = () => ({states, state:state(), draft, mode, stageIndex, dragging});\n  choose(0);');
vm.runInContext(app,c);
const result=vm.runInContext(`(()=>{
const check=(bool,msg)=>{if(!bool)throw Error(msg)};
const b=Wood.create(0,0,400,300), results={};
const cases={vertical:[[200,0],[200,300]], horizontal:[[0,150],[400,150]],
 diagonal:[[0,0],[400,300]], bent:[[90,0],[90,180],[220,180],[220,300]],
 sameEdge:[[90,0],[90,180],[220,180],[220,0]], reversed:[[220,0],[220,180],[90,180],[90,0]],
 crossing:[[0,100],[400,200],[0,200],[400,100]], boundary:[[0,0],[0,300]],outside:[[90,0],[500,150],[220,300]]};
for(const [k,mark]of Object.entries(cases)){
 const pieces=Wood.cut(b,mark);results[k]={valid:Wood.validMark(b,mark),pieces:pieces?.length,areas:pieces?.map(p=>Wood.area(p))};
 if(['crossing','boundary','outside'].includes(k))check(!results[k].valid,k+' should fail');
 else {check(pieces?.length===2,k+' should cut');check(Math.abs(pieces.reduce((a,p)=>a+Wood.area(p),0)-120000)<0.1,k+' area');}
}
const guide=Wood.create(300,200,160,120),collision=new PencilCollision([guide]),collisions={};
const cc={left:[[200,250],[500,250]],right:[[550,250],[200,250]],top:[[370,100],[370,400]],bottom:[[370,420],[370,100]],slide:[[200,220],[310,290]],fast:[[0,250],[1000,250]]};
for(const [k,[a,b]] of Object.entries(cc)){
 const r=collision.advance(new paper.Point(a),new paper.Point(b),()=>true);
 collisions[k]={x:r.point.x,y:r.point.y,touched:r.touched};
 check(!r.trail.some(p=>Wood.contains(guide,p)),k+' should not enter guide');
}
check(collisions.left.x<300,'left');check(collisions.right.x>460,'right');check(collisions.top.y<200,'top');check(collisions.bottom.y>320,'bottom');
check(collisions.slide.x<300 && collisions.slide.y>280,'sliding');check(collisions.fast.x<300,'fast movement');
const P=(x,y)=>new paper.Point(x,y);
const down=(x,y)=>paper.tool.emit('mousedown',{point:P(x,y)});
const move=(x,y)=>paper.tool.emit('mousemove',{point:P(x,y)});
const drag=(x,y)=>paper.tool.emit('mousedrag',{point:P(x,y)});
const up=()=>paper.tool.emit('mouseup',{});
const mode=name=>buttons.find(b=>b.dataset.tool===name).onclick();
down(200,400);drag(220,400);up();check(inspect().state.boards[0].x===160,'large board draggable');
down(500,170);drag(390,340);up();check(inspect().state.boards[1].x===340 && inspect().state.boards[1].y===300,'guide draggable');
check(Wood.sorted(inspect().state.boards)[0].name==='넓은 판자','area stacking');
mode('pencil');down(200,400);check(!inspect().draft,'interior cannot start');
down(330,320);check(!!inspect().draft,'edge start');
move(350,390);check(inspect().draft.touched,'colliding with guide');check(inspect().draft.points.at(-1)[0]+160<340,'clamped tip');
move(350,425);move(590,425);move(610,500);down(610,500);
check(inspect().state.boards[0].marks.length===1,'commit traced line: '+elements.status.textContent);
const mark=inspect().state.boards[0].marks[0];check(mark.length>3,'bent polyline saved');
for(const [x,y] of mark)check(!Wood.contains(inspect().state.boards[1],new paper.Point(x+160,y+320)),'trace never enters guide');
mode('saw');down(470,425);check(inspect().state.boards.length===3,'saw produces pieces: '+elements.status.textContent);
check(Math.abs(inspect().state.boards.reduce((sum,b)=>sum+Wood.area(b),0)-127200)<0.1,'UI area conservation');
mode('move');const piece=inspect().state.boards.find(b=>b.name.includes('조각'));
const bb=Wood.bounds(piece);const pos=Wood.shape(piece).getInteriorPoint();down(pos.x,pos.y);drag(pos.x+15,pos.y+5);up();
elements.next.onclick();check(inspect().stageIndex===1,'next');elements.prev.onclick();check(inspect().state.boards.length===3,'stage state preserved');
elements.reset.onclick();check(inspect().state.boards.length===2,'reset');
mode('pencil');down(200,320);move(200,360);keyHandlers[0]({key:'Escape'});check(!inspect().draft && elements.cancel.disabled,'escape cancellation');
// Marks stay attached when a board moves.
down(200,320);move(220,380);down(240,500);check(inspect().state.boards[0].marks.length===1,'second mark');
const original=JSON.stringify(inspect().state.boards[0].marks);mode('move');down(300,400);drag(350,400);up();check(JSON.stringify(inspect().state.boards[0].marks)===original,'local mark preserved');
return {geometry:results,collisions,ui:'PASS: drag both, stacking, boundary start, constrained preview, bent cut, area, stage state, reset, escape, local marks'};
})()`,c);
console.log(JSON.stringify(result,null,2));
```

