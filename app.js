(() => {
  const $ = id => document.getElementById(id);
  const canvas = $("canvas");

  if (!window.paper) {
    $("status").textContent =
      "Paper.js를 불러오지 못했습니다. vendor 폴더를 확인하세요.";
    return;
  }

  paper.setup(canvas);

  const W = 1000;
  const H = 600;
  const gap = 16;
  const snap = 24;

  const states = new Map();

  let stageIndex = 0;
  let mode = "move";
  let dragging = null;
  let offset = null;

  // 연필 미리보기에 사용하는 현재 마우스 위치
  let mousePoint = null;

  const state = () => states.get(stageIndex);

  const say = message => {
    $("status").textContent = message;
  };

  const label = (point, content, color = "#65523c") => {
    return new paper.PointText({
      point,
      content,
      fillColor: color,
      fontFamily: "sans-serif",
      fontSize: 17
    });
  };

  function initial() {
    const s = STAGES[stageIndex];

    return {
      reference: Wood.create(
        150,
        165,
        s.targetWidth,
        s.height
      ),
      pieces: [
        Wood.create(
          400,
          395,
          s.stockWidth,
          s.height
        )
      ]
    };
  }

  // 마우스 아래의 작업 판자 또는 잘린 조각 찾기
  function findBoard(point) {
    return [...state().pieces].reverse().find(board => {
      const shape = Wood.shape(board);
      const hit = shape.contains(point);

      shape.remove();

      return hit;
    });
  }

  // 미리보기와 실제 표시에서 같은 위치 계산을 사용합니다.
  // 판자의 양 끝에 너무 가까우면 절단선을 만들지 않습니다.
  function getMarkX(board, point) {
    const b = Wood.bounds(board);
    const x = point.x;

    if (x <= b.left + 1 || x >= b.right - 1) {
      return null;
    }

    return x;
  }

  function drawPreview() {
    if (mode !== "pencil" || !mousePoint) {
      return;
    }

    const board = findBoard(mousePoint);

    if (!board) {
      return;
    }

    const x = getMarkX(board, mousePoint);

    if (x === null) {
      return;
    }

    // 이미 그어진 선과 같은 위치에서는 겹쳐 그리지 않습니다.
    if (
      board.mark !== null &&
      Math.abs(x - (board.x + board.mark)) < 0.5
    ) {
      return;
    }

    const b = Wood.bounds(board);

    new paper.Path.Line({
      from: [x, b.top],
      to: [x, b.bottom],
      strokeColor: "#33312c",
      strokeWidth: 3,
      opacity: 0.3
    });
  }

  function draw() {
    paper.project.activeLayer.removeChildren();

    // 작업대 격자
    for (let x = 0; x <= W; x += 50) {
      new paper.Path.Line({
        from: [x, 0],
        to: [x, H],
        strokeColor: "#d8c9af"
      });
    }

    for (let y = 0; y <= H; y += 50) {
      new paper.Path.Line({
        from: [0, y],
        to: [W, y],
        strokeColor: "#d8c9af"
      });
    }

    const r = Wood.bounds(state().reference);

    label([38, 45], STAGES[stageIndex].name);
    label([r.left, r.top - 18], "기준 판자 · 고정");

    // 작업 판자를 가져다 놓을 정렬 위치
    new paper.Path.Rectangle({
      rectangle: [
        r.left,
        r.bottom + gap,
        STAGES[stageIndex].stockWidth,
        r.height
      ],
      strokeColor: "#8c967d",
      dashArray: [7, 6],
      strokeWidth: 1.5
    });

    Wood.draw(state().reference, true);

    state().pieces.forEach(board => {
      Wood.draw(board);
    });

    // 판자와 고정된 연필선을 그린 다음 미리보기 표시
    drawPreview();

    label(
      [38, H - 30],
      "판자를 맞추고, 연필로 자를 위치를 클릭하세요."
    );

    paper.view.update();
  }

  function choose(index) {
    dragging = null;
    mousePoint = null;

    stageIndex =
      (index + STAGES.length) % STAGES.length;

    if (!states.has(stageIndex)) {
      states.set(stageIndex, initial());
    }

    $("stage").value = stageIndex;

    say(
      "이동 도구로 작업 판자를 기준 판자 아래의 점선에 맞춰보세요."
    );

    draw();
  }

  const tool = new paper.Tool();

  // 마우스를 움직일 때 연필 미리보기 갱신
  tool.onMouseMove = event => {
    mousePoint = event.point.clone();

    if (mode === "pencil") {
      draw();
    }
  };

  tool.onMouseDown = event => {
    mousePoint = event.point.clone();

    const board = findBoard(event.point);

    if (!board) {
      draw();
      return;
    }

    if (mode === "move") {
      dragging = board;

      offset = event.point.subtract([
        board.x,
        board.y
      ]);

      canvas.style.cursor = "grabbing";
      return;
    }

    if (mode === "pencil") {
      const x = getMarkX(board, event.point);

      if (x === null) {
        say("판자의 끝에서 조금 안쪽을 클릭하세요.");
        return;
      }

      // 판자 내부 좌표로 저장합니다.
      // 따라서 판자를 움직여도 연필선이 함께 움직입니다.
      board.mark = x - board.x;

      say(
        "연필선을 그었습니다. 톱을 선택하고 선을 클릭하세요."
      );
    } else if (mode === "saw") {
      const b = Wood.bounds(board);

      if (
        board.mark === null ||
        Math.abs(
          event.point.x - (board.x + board.mark)
        ) > 8
      ) {
        say("톱은 연필선 근처를 클릭해야 작동합니다.");
        return;
      }

      if (
        event.point.y < b.top ||
        event.point.y > b.bottom
      ) {
        return;
      }

      const pieces = Wood.cut(board);

      if (!pieces) {
        return;
      }

      const i = state().pieces.indexOf(board);

      // 잘렸다는 것이 보이도록 오른쪽 조각을 조금 이동
      pieces[1].x += 14;
      pieces[1].y += 10;

      state().pieces.splice(i, 1, ...pieces);

      say(
        "두 조각으로 잘랐습니다. 이동 도구로 각각 움직여보세요."
      );
    }

    draw();
  };

  tool.onMouseDrag = event => {
    if (!dragging) {
      return;
    }

    const b = Wood.bounds(dragging);
    const next = event.point.subtract(offset);

    dragging.x = Math.max(
      12,
      Math.min(W - b.width - 12, next.x)
    );

    dragging.y = Math.max(
      65,
      Math.min(H - b.height - 65, next.y)
    );

    draw();
  };

  tool.onMouseUp = () => {
    if (!dragging) {
      return;
    }

    const r = Wood.bounds(state().reference);
    const b = Wood.bounds(dragging);

    // 기준 판자의 아래쪽 정렬 위치에 가까우면 자동 정렬
    if (
      Math.abs(b.left - r.left) < snap &&
      Math.abs(b.top - (r.bottom + gap)) < snap
    ) {
      dragging.x += r.left - b.left;
      dragging.y += r.bottom + gap - b.top;

      say(
        "판자를 맞췄습니다. 연필을 선택하고 자를 위치를 클릭하세요."
      );
    }

    dragging = null;
    canvas.style.cursor = "grab";

    draw();
  };

  // 작업대 밖으로 나가면 미리보기 제거
  canvas.addEventListener("mouseleave", () => {
    mousePoint = null;

    if (mode === "pencil") {
      draw();
    }
  });

  document.querySelectorAll("[data-tool]").forEach(button => {
    button.onclick = () => {
      mode = button.dataset.tool;

      dragging = null;
      mousePoint = null;

      document.querySelectorAll("[data-tool]").forEach(b => {
        b.setAttribute(
          "aria-pressed",
          String(b === button)
        );
      });

      canvas.style.cursor =
        mode === "move" ? "grab" : "crosshair";

      const messages = {
        move: "판자나 잘린 조각을 드래그하세요.",
        pencil:
          "판자 위에서 미리보기를 확인하고 클릭하면 선이 그어집니다.",
        saw: "자를 판자의 연필선을 클릭하세요."
      };

      say(messages[mode]);
      draw();
    };
  });

  STAGES.forEach((s, i) => {
    $("stage").add(new Option(s.name, i));
  });

  $("stage").onchange = event => {
    choose(Number(event.target.value));
  };

  $("prev").onclick = () => {
    choose(stageIndex - 1);
  };

  $("next").onclick = () => {
    choose(stageIndex + 1);
  };

  // 스테이지가 하나일 때 선택과 이동 버튼 숨기기
  const singleStage = STAGES.length <= 1;

  $("stage").hidden = singleStage;
  $("prev").hidden = singleStage;
  $("next").hidden = singleStage;

  $("reset").onclick = () => {
    states.set(stageIndex, initial());
    choose(stageIndex);
  };

  function resize() {
    const box = $("workspace");

    paper.view.viewSize = new paper.Size(
      box.clientWidth,
      box.clientHeight
    );

    paper.view.zoom = Math.min(
      box.clientWidth / W,
      box.clientHeight / H
    );

    paper.view.center = new paper.Point(
      W / 2,
      H / 2
    );

    mousePoint = null;

    if (state()) {
      draw();
    }
  }

  new ResizeObserver(resize).observe($("workspace"));

  canvas.style.cursor = "grab";

  choose(0);
  resize();
})();