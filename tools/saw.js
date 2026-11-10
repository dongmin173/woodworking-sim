window.WorkshopTools = window.WorkshopTools || {};

WorkshopTools.Saw = class {
  constructor(ctx) {
    this.ctx = ctx;

    this.width = 6;
    this.guidePixels = 8;

    this.stroke = null;
    this.hover = null;
  }

  activate() {
    this.ctx.say(
      "연필선의 끝점을 누른 채 선을 따라 드래그하세요. 선 옆으로 벗어나면 멈춥니다."
    );
  }

  // 연필선의 양쪽 끝점만 선택 대상으로 검사합니다.
  endpoint(point) {
    const c = this.ctx;
    let best = null;

    for (const board of Wood.sorted(c.scene.boards).reverse()) {
      board.marks.forEach((mark, index) => {
        if (mark.length !== 2) return;

        const ends = mark.map(p => c.world(board, p));

        if (ends[0].getDistance(ends[1]) < 0.0001) {
          return;
        }

        ends.forEach((end, side) => {
          const distance = end.getDistance(point);

          if (
            distance <= c.tolerance() &&
            (!best || distance < best.distance) &&
            c.visible(board, end)
          ) {
            best = {
              board,
              index,
              a: end,
              b: ends[1 - side],
              distance
            };
          }
        });
      });
    }

    return best;
  }

  move(point) {
    if (!this.stroke) {
      this.hover = this.endpoint(point);
    }
  }

  down(point) {
    if (this.stroke) this.up();

    this.hover = this.endpoint(point);

    if (!this.hover) {
      return this.ctx.say(
        "선 중간이 아니라 연필선의 끝점을 클릭하세요."
      );
    }

    const h = this.hover;
    const delta = h.b.subtract(h.a);

    this.stroke = {
      source: h.board,
      shown: [h.board],
      index: h.index,

      a: h.a,
      b: h.b,
      direction: delta.normalize(),
      length: delta.length,

      progress: 0,
      position: 0,
      tracking: true,

      mouse: point.clone(),
      removedArea: 0
    };

    this.hover = null;
    this.ctx.setCancel(true);

    this.ctx.say(
      "끝점을 잡았습니다. 누른 채 선을 따라 움직이면 이동한 길이만큼 파고듭니다."
    );
  }

  // 시작점부터 현재 절단 깊이까지만 제거합니다.
  cutTo(distance) {
    const s = this.stroke;
    const c = this.ctx;

    const front = s.a.add(
      s.direction.multiply(distance)
    );

    const normal = new paper.Point(
      -s.direction.y,
      s.direction.x
    ).multiply(this.width / 2);

    // 선택한 선은 남은 길이를 직접 관리합니다.
    // 따라서 짧게 남은 선도 다시 끝점을 잡을 수 있습니다.
    const base = {
      ...s.source,
      marks: s.source.marks.filter(
        (_, i) => i !== s.index
      )
    };

    const cutter = new paper.Path({
      insert: false,
      closed: true,
      segments: [
        s.a.add(normal),
        front.add(normal),
        front.subtract(normal),
        s.a.subtract(normal)
      ]
    });

    const shape = Wood.shape(base);

    const difference = shape.subtract(
      cutter,
      { insert: false }
    );

    difference.reorient(true, true);

    const removedArea =
      Math.abs(shape.area) -
      Math.abs(difference.area);

    const result = removedArea > 0.00000001
      ? {
          pieces: Wood.parts(base, difference),
          removedArea
        }
      : null;

    [shape, cutter, difference].forEach(
      path => path.remove()
    );

    if (!result) return false;

    // 아직 자르지 않은 선을 새 조각의 내부 좌표로 남깁니다.
    if (distance < s.length - 0.0001) {
      for (const piece of result.pieces) {
        const shape = Wood.shape(piece);

        for (
          const [left, right] of
          Wood.intervals(shape, front, s.b)
        ) {
          const ends = [left, right].map(t =>
            front.add(
              s.b.subtract(front).multiply(t)
            )
          );

          if (
            ends[0].getDistance(ends[1]) > 0.0001
          ) {
            piece.marks.push(
              ends.map(p => c.local(piece, p))
            );
          }
        }

        shape.remove();
      }
    }

    c.replace(
      s.shown,
      result.pieces,
      false
    );

    s.shown = result.pieces;
    s.removedArea = result.removedArea;

    return true;
  }

  drag(point) {
    const s = this.stroke;
    if (!s) return;

    s.mouse = point.clone();

    const delta = point.subtract(s.a);
    const along = delta.dot(s.direction);
    const sideways = Math.abs(
      delta.cross(s.direction)
    );

    const tolerance =
      this.guidePixels / paper.view.zoom;

    // 선을 벗어나면 새 재료를 제거하지 않습니다.
    if (
      sideways > tolerance ||
      along < -tolerance
    ) {
      s.tracking = false;
      s.position = s.progress;

      return this.ctx.say(
        "선에서 벗어나 톱이 멈췄습니다. 현재 파고든 끝부분으로 돌아오세요."
      );
    }

    const wanted = Math.max(
      0,
      Math.min(s.length, along)
    );

    // 선 밖으로 나갔다가 아직 자르지 않은 위치로
    // 다시 들어와 절단 구간을 건너뛰는 동작을 막습니다.
    if (
      !s.tracking &&
      wanted > s.progress + tolerance
    ) {
      return this.ctx.say(
        "아직 자르지 않은 곳으로 건너뛸 수 없습니다. 절단 끝부분에서 다시 시작하세요."
      );
    }

    s.tracking = true;
    s.position = wanted;

    // 이미 자른 구간을 되짚어도 재료를 복원하지 않습니다.
    // 클릭 중 미세한 흔들림으로 잘리는 것도 방지합니다.
    if (
      wanted <= s.progress ||
      wanted * paper.view.zoom < 1
    ) {
      return;
    }

    let allowed = s.progress;

    const steps = Math.max(
      1,
      Math.ceil((wanted - s.progress) * 2)
    );

    // 위쪽 판자에 가려진 부분으로는 진행하지 않습니다.
    for (let i = 1; i <= steps; i++) {
      const depth =
        s.progress +
        (wanted - s.progress) * i / steps;

      const pointOnLine = s.a.add(
        s.direction.multiply(depth)
      );

      if (
        !this.ctx.visible(
          s.source,
          pointOnLine,
          s.shown
        )
      ) {
        break;
      }

      allowed = depth;
    }

    if (allowed < wanted - 0.0001) {
      s.position = allowed;
      s.tracking = false;
    }

    if (
      allowed > s.progress + 0.000001 &&
      this.cutTo(allowed)
    ) {
      s.progress = allowed;
    }

    this.ctx.say(
      `${
        s.tracking
          ? "톱"
          : "다른 판자에 가려 톱이 멈춤"
      }: ${s.progress.toFixed(1)} / ${
        s.length.toFixed(1)
      }px 진행 · Esc: 이번 절단 취소`
    );
  }

  up() {
    if (!this.stroke) return;

    const mouse = this.stroke.mouse;

    this.stroke = null;
    this.ctx.geometryChanged();
    this.ctx.setCancel(false);

    this.move(mouse);
  }

  cancel() {
    if (this.stroke) {
      this.ctx.replace(
        this.stroke.shown,
        [this.stroke.source]
      );
    }

    this.stroke = this.hover = null;
    this.ctx.setCancel(false);
    this.ctx.say("이번 톱 절단을 취소했습니다.");
  }

  deactivate() {
    this.up();
    this.hover = null;
  }

  drawBoard(board) {
    const active = this.stroke
      ? this.stroke.shown.includes(board)
      : this.hover?.board === board;

    if (active) Wood.grid(board);
  }

  drawOverlay() {
    const s = this.stroke;
    const radius = 4 / paper.view.zoom;

    if (s) {
      const tip = s.a.add(
        s.direction.multiply(s.position)
      );

      const front = s.a.add(
        s.direction.multiply(s.progress)
      );

      new paper.Path.Circle({
        center: tip,
        radius,
        fillColor: s.tracking
          ? "#344b55"
          : "#ce693c"
      });

      new paper.Path.Circle({
        center: front,
        radius: radius * 1.5,
        strokeColor: "#386b84",
        strokeWidth: 1 / paper.view.zoom
      });

      this.ctx.hud(
        `톱 · 선을 따라 ${
          s.progress.toFixed(1)
        } / ${s.length.toFixed(1)}px`
      );
    } else if (this.hover) {
      new paper.Path.Circle({
        center: this.hover.a,
        radius: radius * 1.3,
        fillColor: "#386b84"
      });

      this.ctx.hud(
        "연필선 끝점 · 누른 채 선을 따라 드래그"
      );
    }
  }
};