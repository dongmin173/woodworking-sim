/* Matter.js 충돌 검사 + 변을 자처럼 사용하는 직선 안내.
   자와 접촉한 동안에는 마우스를 변의 접선에 투영해 같은 직선을 유지합니다. */
window.PencilCollision = class {
  constructor(boards, { snap = 10, release = 20 } = {}) {
    this.boards = boards;
    this.snap = snap;
    this.release = release;
    this.clearance = 2;
    this.lock = null;
    this.probe = Matter.Bodies.circle(0, 0, 1.5, { isSensor: true });
    this.edges = boards.flatMap(board => {
      const points = board.points;
      const area2 = points.reduce((sum, [x, y], i) => {
        const next = points[(i + 1) % points.length];
        return sum + x * next[1] - next[0] * y;
      }, 0);
      return points.map(([x, y], i) => {
        const next = points[(i + 1) % points.length];
        const a = new paper.Point(board.x + x, board.y + y);
        const b = new paper.Point(board.x + next[0], board.y + next[1]);
        const delta = b.subtract(a), length = delta.length, tangent = delta.divide(length);
        const normal = new paper.Point(tangent.y, -tangent.x).multiply(area2 >= 0 ? 1 : -1);
        const body = Matter.Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2,
          length, 0.2, { isStatic: true, angle: Math.atan2(delta.y, delta.x) });
        body.plugin = { a, b, length, tangent, normal, board };
        return body;
      });
    });
  }
  hits(point) {
    Matter.Body.setPosition(this.probe, { x: point.x, y: point.y });
    return Matter.Query.collides(this.probe, this.edges);
  }
  safe(point, allowed) {
    return allowed(point) && !this.hits(point).length
      && !this.boards.some(board => Wood.contains(board, point));
  }
  // 자 바깥쪽의 일정한 거리에 있는 평행선 위로 투영합니다.
  projected(edge, point) {
    const e = edge.plugin, along = point.subtract(e.a).dot(e.tangent);
    return { along, point: e.a.add(e.tangent.multiply(Math.max(0, Math.min(e.length, along))))
      .add(e.normal.multiply(this.clearance)) };
  }
  nearby(point, allowed) {
    let best = null;
    for (const edge of this.edges) {
      const projection = this.projected(edge, point), e = edge.plugin;
      if (projection.along < -0.001 || projection.along > e.length + 0.001) continue;
      const distance = projection.point.getDistance(point);
      if (distance <= this.snap && (!best || distance < best.distance)
        && this.safe(projection.point, allowed)) best = { edge, point: projection.point, distance };
    }
    return best;
  }
  startAt(point, allowed) {
    const contact = this.nearby(point, allowed);
    if (contact) {
      this.lock = contact.edge;
      return contact.point;
    }
    return this.safe(point, allowed) ? point.clone() : null;
  }
  advance(from, target, allowed) {
    if (this.lock) return this.guided(from, target, allowed);
    return this.free(from, target, allowed);
  }
  guided(from, target, allowed) {
    const edge = this.lock, e = edge.plugin;
    const distanceOut = target.subtract(e.a).dot(e.normal);
    if (distanceOut > this.clearance + this.release) {
      this.lock = null;
      return this.free(from, target, allowed, false);
    }
    const projection = this.projected(edge, target);
    const result = this.free(from, projection.point, allowed, false);
    result.touched = true;
    // 자 끝을 지나면 모서리를 돌아가거나 자유롭게 움직일 수 있습니다.
    if ((projection.along < 0 || projection.along > e.length)
      && result.point.getDistance(projection.point) < 0.01) {
      this.lock = null;
      const rest = this.free(result.point, target, allowed);
      return { point: rest.point, trail: [...result.trail, ...rest.trail], touched: rest.touched };
    }
    return result;
  }
  free(from, target, allowed, capture = true) {
    let current = from.clone(), touched = false;
    const trail = [], delta = target.subtract(from);
    const steps = Math.max(1, Math.ceil(delta.length)), step = delta.divide(steps);
    for (let i = 0; i < steps; i++) {
      const next = current.add(step);
      if (!allowed(next)) break;
      const contact = capture ? this.nearby(next, allowed) : null;
      if (contact && this.safe(current, allowed)) {
        // 접촉선까지도 이동 구간 전체를 검사하므로 다른 판자를 가로질러 붙지 않습니다.
        const approach = this.free(current, contact.point, allowed, false);
        if (approach.point.getDistance(contact.point) < 0.01) {
          trail.push(...approach.trail);
          current = approach.point;
          this.lock = contact.edge;
          const rest = this.guided(current, target, allowed);
          return { point: rest.point, trail: [...trail, ...rest.trail], touched: true };
        }
      }
      const hits = this.hits(next);
      if (!hits.length && !this.boards.some(board => Wood.contains(board, next))) {
        current = next;
      } else {
        touched = true;
        let lo = 0, hi = 1;
        for (let j = 0; j < 10; j++) {
          const mid = (lo + hi) / 2;
          if (!this.safe(current.add(step.multiply(mid)), allowed)) hi = mid;
          else lo = mid;
        }
        current = current.add(step.multiply(lo));
        const tangents = hits.flatMap(hit => {
          const edge = hit.bodyA === this.probe ? hit.bodyB : hit.bodyA;
          return [edge.plugin.tangent, new paper.Point(-hit.normal.y, hit.normal.x)];
        });
        let best = current, progress = 0;
        for (const tangent of tangents) {
          const motion = tangent.multiply(step.dot(tangent) * (1 - lo));
          const slide = current.add(motion), score = motion.dot(step);
          if (score > progress && this.safe(slide, allowed)) { best = slide; progress = score; }
        }
        current = best;
      }
      trail.push(current.clone());
    }
    return { point: current, trail, touched };
  }
};
