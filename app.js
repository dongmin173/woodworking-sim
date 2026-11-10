(() => {
  const $ = id => document.getElementById(id);
  const canvas = $("canvas");

  if (!window.paper || !window.Matter || !window.martinez) {
    $("status").textContent =
      "vendor 폴더의 Paper.js, Matter.js, Martinez 파일을 확인하세요.";
    return;
  }

  if (
    !window.WorkshopCursors ||
    !window.WorkshopTools?.Carver ||
    !window.WorkshopTools?.Saw ||
    !window.WorkshopTools?.Knife
  ) {
    $("status").textContent =
      "tools/cursors.js, tools/carver.js와 도구 파일의 경로 및 로딩 순서를 확인하세요.";
    return;
  }

  paper.setup(canvas);

  const scene = { boards: [] };
  const snapper = new EdgeSnap();

  const initial = () => [
    Wood.create(140, 320, 560, 180, "판자 A"),
    Wood.create(450, 130, 240, 110, "판자 B")
  ];

  scene.boards = initial();

  let current = "move";
  let viewport;
  let space = false;
  let panPointer = null;
  let overCanvas = false;

  canvas.tabIndex = 0;

  const ctx = {
    scene,
    snapper,

    say: text => {
      $("status").textContent = text;
    },

    setCancel: enabled => {
      $("cancel").disabled = !enabled;
    },

    local: (board, p) => [
      p.x - board.x,
      p.y - board.y
    ],

    world: (board, p) =>
      new paper.Point(board.x + p[0], board.y + p[1]),

    tolerance: () => 9 / paper.view.zoom,

    geometryChanged: () =>
      snapper.rebuild(scene.boards),

    visible(board, p, excluded = [board]) {
      const ordered = Wood.sorted([
        ...scene.boards.filter(b =>
          b !== board && !excluded.includes(b)
        ),
        board
      ]);

      return !ordered
        .slice(ordered.indexOf(board) + 1)
        .some(b =>
          Wood.contains(b, p) &&
          Wood.edge(b, p).distance > 0.1
        );
    },

    pick(point, margin = 0) {
      return Wood.sorted(scene.boards)
        .reverse()
        .find(b =>
          Wood.contains(b, point) ||
          (
            margin > 0 &&
            Wood.edge(b, point).distance <= margin
          )
        );
    },

    replace(oldParts, newParts, rebuild = true) {
      const positions = oldParts
        .map(b => scene.boards.indexOf(b))
        .filter(i => i >= 0);

      const index = positions.length
        ? Math.min(...positions)
        : scene.boards.length;

      scene.boards = scene.boards.filter(
        b => !oldParts.includes(b)
      );

      scene.boards.splice(index, 0, ...newParts);

      if (rebuild) {
        snapper.rebuild(scene.boards);
      }
    },

    hud(text) {
      new paper.PointText({
        point: paper.view.viewToProject(
          new paper.Point(
            14,
            paper.view.viewSize.height - 16
          )
        ),
        content: text,
        fillColor: "#514335",
        fontFamily: "sans-serif",
        fontSize: 14 / paper.view.zoom
      });
    }
  };

  const tools = {
    move: new WorkshopTools.Move(ctx),
    pencil: new WorkshopTools.Pencil(ctx),
    saw: new WorkshopTools.Saw(ctx),
    knife: new WorkshopTools.Knife(ctx)
  };

  function toolCursor() {
    canvas.style.cursor =
      WorkshopCursors[current] || "crosshair";
  }

  function draw() {
    paper.project.activeLayer.removeChildren();

    const b = paper.view.bounds;
    const active = tools[current];

    for (
      let x = Math.max(0, Math.ceil(b.left / 50) * 50);
      x <= Math.min(1000, b.right);
      x += 50
    ) {
      new paper.Path.Line({
        from: [x, 0],
        to: [x, 600],
        strokeColor: "#d8c9af",
        strokeWidth: 1 / paper.view.zoom
      });
    }

    for (
      let y = Math.max(0, Math.ceil(b.top / 50) * 50);
      y <= Math.min(600, b.bottom);
      y += 50
    ) {
      new paper.Path.Line({
        from: [0, y],
        to: [1000, y],
        strokeColor: "#d8c9af",
        strokeWidth: 1 / paper.view.zoom
      });
    }

    Wood.sorted(scene.boards).forEach(board => {
      Wood.draw(board, active.preview?.(board));
      active.drawBoard?.(board);
    });

    active.drawOverlay?.();
    paper.view.update();
  }

  function select(name) {
    tools[current].deactivate?.();
    current = name;

    ctx.setCancel(false);
    ctx.geometryChanged();

    document.querySelectorAll("[data-tool]").forEach(button =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.tool === name)
      )
    );

    toolCursor();
    tools[name].activate?.();
    draw();
  }

  const input = new paper.Tool();

  input.onMouseDown = e => {
    if (panPointer !== null) return;

    viewport.focus = e.point.clone();

    if (space || e.event?.button === 1) {
      viewport.panStart(e.point);
    } else {
      tools[current].down?.(e.point);
    }

    draw();
  };

  input.onMouseMove = e => {
    if (panPointer !== null) return;

    viewport.focus = e.point.clone();
    tools[current].move?.(e.point);
    draw();
  };

  input.onMouseDrag = e => {
    if (panPointer !== null) return;

    viewport.focus = e.point.clone();

    if (viewport.panning) {
      viewport.panMove(e.point);
    } else {
      tools[current].drag?.(e.point);
    }

    draw();
  };

  input.onMouseUp = () => {
    if (panPointer !== null) return;

    if (viewport.panning) {
      viewport.panEnd();
    } else {
      tools[current].up?.();
    }

    draw();
  };

  function screenPoint(e) {
    const r = canvas.getBoundingClientRect();

    return new paper.Point(
      (e.clientX - r.left)
        * paper.view.viewSize.width / r.width,
      (e.clientY - r.top)
        * paper.view.viewSize.height / r.height
    );
  }

  function stopPan() {
    const id = panPointer;

    panPointer = null;
    viewport.panEnd();

    if (
      id !== null &&
      canvas.hasPointerCapture?.(id)
    ) {
      canvas.releasePointerCapture(id);
    }

    toolCursor();
  }

  canvas.addEventListener("pointerenter", () => {
    overCanvas = true;
  });

  canvas.addEventListener("pointerleave", () => {
    overCanvas = false;
  });

  canvas.addEventListener("pointerdown", e => {
    canvas.focus({ preventScroll: true });

    const blank =
      current === "move" &&
      e.button === 0 &&
      !ctx.pick(
        paper.view.viewToProject(screenPoint(e))
      );

    if (!(
      e.button === 1 ||
      (e.button === 0 && space) ||
      blank
    )) {
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();

    tools[current].up?.();

    panPointer = e.pointerId;
    viewport.panStartScreen(screenPoint(e));

    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  }, true);

  canvas.addEventListener("pointermove", e => {
    if (e.pointerId !== panPointer) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const p = screenPoint(e);

    viewport.panMoveScreen(p);
    viewport.focus = paper.view.viewToProject(p);
  }, true);

  canvas.addEventListener("pointerup", e => {
    if (e.pointerId !== panPointer) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    stopPan();
    draw();
  }, true);

  canvas.addEventListener("pointercancel", e => {
    if (e.pointerId === panPointer) stopPan();
  }, true);

  canvas.addEventListener("lostpointercapture", e => {
    if (e.pointerId === panPointer) stopPan();
  });

  document.querySelectorAll("[data-tool]").forEach(button => {
    button.onclick = () => select(button.dataset.tool);
  });

  $("cancel").onclick = () => {
    tools[current].cancel?.();
    draw();
  };

  $("zoom-in").onclick = () => viewport.zoom(2);
  $("zoom-out").onclick = () => viewport.zoom(0.5);
  $("zoom-fit").onclick = () => viewport.fit();

  $("reset").onclick = () => {
    tools[current].cancel?.();
    scene.boards = initial();
    ctx.geometryChanged();
    viewport.fit();
    select(current);
  };

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      tools[current].cancel?.();
      stopPan();
      draw();
    }

    const editing =
      ["INPUT", "TEXTAREA", "SELECT"]
        .includes(e.target?.tagName) ||
      e.target?.isContentEditable;

    if (
      (e.code === "Space" || e.key === " ") &&
      !editing &&
      (
        overCanvas ||
        document.activeElement === canvas ||
        e.target?.tagName !== "BUTTON"
      )
    ) {
      space = true;
      e.preventDefault();
    }
  }, true);

  document.addEventListener("keyup", e => {
    if (e.code === "Space" || e.key === " ") {
      space = false;
    }
  }, true);

  window.addEventListener?.("blur", () => {
    space = false;
    stopPan();
    tools[current].up?.();
    draw();
  });

  ctx.geometryChanged();

  viewport = new WorkshopViewport(
    $("workspace"),
    $("zoom-level"),
    draw
  );

  toolCursor();
  tools[current].activate();
})();