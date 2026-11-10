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
