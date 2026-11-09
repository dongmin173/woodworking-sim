# 작은 목공 작업실 코드 전문

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
  <script defer src="stages.js"></script>
  <script defer src="wood.js"></script>
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
      <p>1. 판자 맞추기<br>2. 연필로 표시<br>3. 톱으로 자르기</p>
    </aside>
    <section>
      <div id="workspace"><canvas id="canvas" aria-label="목공 작업대"></canvas></div>
      <p id="status" role="status" aria-live="polite">작업대를 준비하고 있습니다.</p>
    </section>
  </main>
  <footer>기준 판자는 고정되어 있습니다. 작업 판자를 옆에 대어 길이를 옮겨보세요.</footer>
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

```js
// 길이 단위는 데모용 논리 좌표입니다. 새 목공 동작은 이후에 추가합니다.
window.STAGES = [
  { name: "01 · 기본 길이 옮기기", targetWidth: 260, stockWidth: 440, height: 90 },
  { name: "02 · 짧은 판자", targetWidth: 180, stockWidth: 400, height: 90 },
  { name: "03 · 긴 판자", targetWidth: 340, stockWidth: 530, height: 100 }
];
```

## wood.js

```js
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
```

## app.js

```js
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $("canvas");
  if (!window.paper) {
    $("status").textContent = "Paper.js를 불러오지 못했습니다. vendor 폴더를 확인하세요.";
    return;
  }
  paper.setup(canvas);
  const W = 1000, H = 600, gap = 16, snap = 24;
  const states = new Map();
  let stageIndex = 0, mode = "move", dragging = null, offset = null;
  const state = () => states.get(stageIndex);
  const say = message => { $("status").textContent = message; };
  const label = (point, content, color = "#65523c") => new paper.PointText({
    point, content, fillColor: color, fontFamily: "sans-serif", fontSize: 17
  });
  function initial() {
    const s = STAGES[stageIndex];
    return {
      reference: Wood.create(150, 165, s.targetWidth, s.height),
      pieces: [Wood.create(400, 395, s.stockWidth, s.height)]
    };
  }
  function aligned(board) {
    const r = Wood.bounds(state().reference), b = Wood.bounds(board);
    return Math.abs(b.left - r.left) < 1 && Math.abs(b.top - r.bottom - gap) < 1;
  }
  function draw() {
    paper.project.activeLayer.removeChildren();
    for (let x = 0; x <= W; x += 50) {
      new paper.Path.Line({ from: [x, 0], to: [x, H], strokeColor: "#d8c9af" });
    }
    for (let y = 0; y <= H; y += 50) {
      new paper.Path.Line({ from: [0, y], to: [W, y], strokeColor: "#d8c9af" });
    }
    const r = Wood.bounds(state().reference);
    label([38, 45], STAGES[stageIndex].name);
    label([r.left, r.top - 18], "기준 판자 · 고정");
    new paper.Path.Rectangle({
      rectangle: [r.left, r.bottom + gap, STAGES[stageIndex].stockWidth, r.height],
      strokeColor: "#8c967d", dashArray: [7, 6], strokeWidth: 1.5
    });
    Wood.draw(state().reference, true);
    state().pieces.forEach(b => Wood.draw(b));
    label([38, H - 30], "점선 위치에 판자를 맞춘 뒤 연필로 판자를 클릭하세요.");
    paper.view.update();
  }
  function choose(index) {
    dragging = null;
    stageIndex = (index + STAGES.length) % STAGES.length;
    if (!states.has(stageIndex)) states.set(stageIndex, initial());
    $("stage").value = stageIndex;
    say("이동 도구로 작업 판자를 점선 위치에 가져다 놓으세요.");
    draw();
  }
  function findBoard(point) {
    return [...state().pieces].reverse().find(board => {
      const shape = Wood.shape(board);
      const hit = shape.contains(point);
      shape.remove();
      return hit;
    });
  }
  const tool = new paper.Tool();
  tool.onMouseDown = event => {
    const board = findBoard(event.point);
    if (!board) return;
    if (mode === "move") {
      dragging = board;
      offset = event.point.subtract([board.x, board.y]);
      return;
    }
    if (mode === "pencil") {
      if (!aligned(board)) return say("이동 도구로 왼쪽 끝과 점선 위치를 먼저 맞춰주세요.");
      const x = Wood.bounds(state().reference).right;
      const b = Wood.bounds(board);
      if (x <= b.left + 1 || x >= b.right - 1) return say("기준 판자보다 긴 조각에 표시할 수 있습니다.");
      board.mark = x - board.x; // 판자 내부 좌표로 저장: 이동해도 선이 따라옵니다.
      say("표시했습니다. 판자를 옮겨도 선은 남습니다. 톱으로 선을 클릭하세요.");
    } else if (mode === "saw") {
      const b = Wood.bounds(board);
      if (board.mark === null || Math.abs(event.point.x - board.x - board.mark) > 8) {
        return say("톱은 연필선 근처를 클릭해야 작동합니다.");
      }
      if (event.point.y < b.top || event.point.y > b.bottom) return;
      const pieces = Wood.cut(board);
      if (!pieces) return;
      const i = state().pieces.indexOf(board);
      pieces[1].x += 14;
      pieces[1].y += 10;
      state().pieces.splice(i, 1, ...pieces);
      say("두 조각으로 잘랐습니다. 이동 도구로 각각 움직여보세요.");
    }
    draw();
  };
  tool.onMouseDrag = event => {
    if (!dragging) return;
    const b = Wood.bounds(dragging);
    const next = event.point.subtract(offset);
    dragging.x = Math.max(12, Math.min(W - b.width - 12, next.x));
    dragging.y = Math.max(65, Math.min(H - b.height - 65, next.y));
    draw();
  };
  tool.onMouseUp = () => {
    if (!dragging) return;
    const r = Wood.bounds(state().reference), b = Wood.bounds(dragging);
    if (Math.abs(b.left - r.left) < snap && Math.abs(b.top - r.bottom - gap) < snap) {
      dragging.x += r.left - b.left;
      dragging.y += r.bottom + gap - b.top;
      say("판자를 맞췄습니다. 연필 도구로 작업 판자를 클릭하세요.");
    }
    dragging = null;
    draw();
  };
  document.querySelectorAll("[data-tool]").forEach(button => {
    button.onclick = () => {
      mode = button.dataset.tool;
      dragging = null;
      document.querySelectorAll("[data-tool]").forEach(b => {
        b.setAttribute("aria-pressed", String(b === button));
      });
      canvas.style.cursor = mode === "move" ? "grab" : "crosshair";
      say({ move: "판자나 잘린 조각을 드래그하세요.", pencil: "판자를 맞춘 뒤 작업 판자를 클릭하세요.", saw: "자를 판자의 연필선을 클릭하세요." }[mode]);
    };
  });
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

