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
