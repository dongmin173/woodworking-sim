window.Workshop = window.Workshop || {};

// 화면 좌표, 이동 한계, 초기 판자를 한 곳에서 관리합니다.
Workshop.config = Object.freeze({
  world: Object.freeze({ width: 1000, height: 600, gridSize: 50 }),
  movementBounds: Object.freeze([12, 65, 976, 490]),
  zoom: Object.freeze({ min: 1, max: 32 }),
  initialBoards: Object.freeze([
    Object.freeze({ x: 140, y: 320, width: 560, height: 180, name: "판자 A", layer: 0 }),
    Object.freeze({ x: 450, y: 130, width: 240, height: 110, name: "판자 B", layer: 1 })
  ])
});
