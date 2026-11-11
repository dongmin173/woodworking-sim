window.WorkshopTools = window.WorkshopTools || {};

WorkshopTools.Pencil = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.hover = null;
    this.draft = null;
  }

  activate() {
    this.ctx.say(
      "변이나 기존 끝점에서 시작하고 내부 점을 이어 찍으세요."
    );
  }

  cancel() {
    this.hover = this.draft = null;
    this.ctx.snapper.clear();
    this.ctx.setCancel(false);
  }

  deactivate() {
    this.cancel();
  }

  idlePoint(point) {
    const c = this.ctx;
    const s = c.snapper;

    if (
      this.hover?.kind === "vertex" &&
      this.hover.point.getDistance(point)
        <= s.releasePixels / paper.view.zoom
    ) {
      return this.hover;
    }

    const edge = s.update(
      point,
      paper.view.zoom,
      c.visible
    );

    if (edge) {
      return { ...edge, kind: "edge" };
    }

    let best = null;

    for (const board of Wood.sorted(c.scene.boards).reverse()) {
      for (const mark of board.marks) {
        for (const endpoint of mark) {
          const p = c.world(board, endpoint);
          const distance = p.getDistance(point);

          if (
            distance <= c.tolerance() &&
            (!best || distance < best.distance) &&
            c.visible(board, p)
          ) {
            best = {
              board,
              point: p,
              distance,
              kind: "vertex"
            };
          }
        }
      }
    }

    return best;
  }

  move(point) {
    if (!this.draft) {
      this.hover = this.idlePoint(point);
      return;
    }

    const c = this.ctx;
    const d = this.draft;
    const start = c.world(d.board, d.start);

    const result = c.snapper.move(
      d.motion,
      point,
      paper.view.zoom,
      null,
      start
    );

    const end = Wood.limit(
      d.board,
      start,
      result.point
    );

    d.end = c.local(d.board, end);
    d.motion.point = end.clone();
    d.blocked = result.blocked;
  }

  drag(point) {
    this.move(point);
  }

  down(point) {
    this.move(point);

    const c = this.ctx;
    const s = c.snapper;

    if (!this.draft) {
      const h = this.hover;

      if (!h) {
        return c.say(
          "판자의 변 또는 기존 끝점을 클릭하세요."
        );
      }

      const start = c.local(h.board, h.point);
      const contacts =
        s.hoverMotion?.board === h.board
          ? s.hoverMotion.contacts
          : [];

      this.draft = {
        board: h.board,
        start,
        end: [...start],
        blocked: h.blocked || false,
        motion: s.motion(h.board, h.point, contacts)
      };

      this.hover = null;
      s.clear();
      c.setCancel(true);

      c.say(
        "다음 점을 클릭하면 직선을 확정하고 그 점에서 이어 그립니다. Esc로 끝냅니다."
      );
      return;
    }

    const d = this.draft;
    const mark = [d.start, d.end];

    if (
      !Wood.contains(d.board, point) &&
      Wood.edge(d.board, point).distance > c.tolerance() &&
      !d.blocked
    ) {
      return c.say("선택한 판자 안쪽을 클릭하세요.");
    }

    if (!Wood.validMark(d.board, mark)) {
      return c.say("3단위보다 긴 선을 그려주세요.");
    }

    d.board.marks.push(mark.map(p => [...p]));

    const next = [...d.end];

    this.draft = {
      board: d.board,
      start: next,
      end: [...next],
      motion: d.motion,
      blocked: false
    };

    s.clear();
    c.say(
      "선을 확정했습니다. 이어 그리거나 Esc로 연결을 끝내세요."
    );
  }

  preview(board) {
    return this.draft?.board === board
      ? [this.draft.start, this.draft.end]
      : null;
  }

  drawOverlay() {
    const c = this.ctx;
    const d = this.draft;
    const radius = 4 / paper.view.zoom;

    if (d) {
      new paper.Path.Circle({
        center: c.world(d.board, d.start),
        radius,
        strokeColor: "#344b55",
        strokeWidth: 1.5 / paper.view.zoom
      });

      new paper.Path.Circle({
        center: c.world(d.board, d.end),
        radius,
        fillColor: d.blocked ? "#ce693c" : "#344b55"
      });

      c.hud(
        `${d.board.name} · 클릭: 선 확정 · Esc: 연결 종료`
      );
    } else if (this.hover) {
      new paper.Path.Circle({
        center: this.hover.point,
        radius,
        fillColor: this.hover.blocked
          ? "#ce693c"
          : "#486749"
      });

      c.hud(
        `${this.hover.board.name} · ${
          this.hover.kind === "vertex"
            ? "기존 끝점"
            : "선택한 변"
        }`
      );
    }
  }
};
