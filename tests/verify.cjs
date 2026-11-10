const fs = require("fs");
const vm = require("vm");
const root = require("node:path").resolve(__dirname, "..") + "/";

const c = vm.createContext({
  console,
  self: { navigator: { userAgent: "vector-test" } },
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {}
});

for (const file of [
  "vendor/paper-full.min.js",
  "vendor/matter.min.js"
]) {
  vm.runInContext(fs.readFileSync(root + file, "utf8"), c);
}

vm.runInContext(`
window = globalThis;
paper.setup(new paper.Size(1000, 600));

const elements = Object.fromEntries(
  ["canvas", "workspace", "status", "cancel", "reset"].map(id => [
    id, {
      style: {},
      textContent: "",
      disabled: false,
      clientWidth: 1000,
      clientHeight: 600
    }
  ])
);

const buttons = ["move", "pencil", "saw"].map(mode => ({
  dataset: { tool: mode },
  setAttribute() {}
}));

const keyHandlers = [];

document = {
  getElementById: id => elements[id],
  querySelectorAll: () => buttons,
  addEventListener: (type, fn) => keyHandlers.push(fn)
};

ResizeObserver = class {
  constructor(fn) { this.fn = fn; }
  observe() { this.fn(); }
};

const originalSetup = paper.setup.bind(paper);
paper.setup = () => originalSetup(new paper.Size(1000, 600));
`, c);

for (const file of ["wood.js", "collision.js"]) {
  vm.runInContext(fs.readFileSync(root + file, "utf8"), c);
}

const app = fs.readFileSync(root + "app.js", "utf8").replace(
  '  new ResizeObserver(resize).observe($("workspace"));',
  `  window.inspect = () => ({
    scene, draft, hover, snapper, mode
  });
  new ResizeObserver(resize).observe($("workspace"));`
);

vm.runInContext(app, c);

const result = vm.runInContext(`(() => {
  const check = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const P = (x, y) => new paper.Point(x, y);

  const owner = Wood.create(0, 0, 800, 600);
  const guide = Wood.create(300, 200, 160, 120);
  const solver = new EdgeSnap();

  solver.rebuild([owner, guide]);

  for (const [a, b, expected] of [
    [[100, 250], [700, 250], [300, 250]],
    [[700, 250], [100, 250], [460, 250]],
    [[370, 50], [370, 550], [370, 200]],
    [[370, 550], [370, 50], [370, 320]]
  ]) {
    const r = solver.limit(
      owner,
      new paper.Point(a),
      new paper.Point(b)
    );

    check(
      r.edge?.board === guide &&
      r.point.getDistance(new paper.Point(expected)) < 0.001,
      "All four faces must block the line"
    );
  }

  let r = solver.limit(owner, P(300, 250), P(700, 280));
  check(
    r.point.getDistance(P(300, 280)) < 0.001,
    "Anchor on ruler slides tangentially"
  );

  r = solver.limit(owner, P(300, 250), P(100, 280));
  check(
    !r.edge && r.point.getDistance(P(100, 280)) < 0.001,
    "Point may move away from ruler"
  );

  r = solver.limit(owner, P(300, 200), P(300, 400));
  check(
    r.point.getDistance(P(300, 400)) < 0.001,
    "Tangent line may pass a corner"
  );

  r = solver.limit(owner, P(350, 250), P(700, 250));
  check(
    r.point.getDistance(P(460, 250)) < 0.001,
    "Ruler works from either side"
  );

  const snap = new EdgeSnap();
  snap.rebuild([owner, guide]);
  snap.update(P(350, 202), 1);

  const heldBoard = snap.lock.board;
  const heldEdge = snap.lock.index;

  snap.update(P(301, 215), 1);
  check(
    snap.lock.board === heldBoard &&
    snap.lock.index === heldEdge,
    "Hover retains board and face"
  );

  snap.update(P(700, 500), 1);
  check(!snap.lock, "Distant pointer releases");

  const notch = Wood.create(0, 0, 400, 300);
  notch.marks.push(
    [[100, 0], [100, 100]],
    [[100, 100], [180, 180]]
  );

  check(
    Wood.validMark(notch, notch.marks[1]),
    "Interior start is valid"
  );

  r = Wood.cut(notch, 0, 6);
  check(
    r.pieces.length === 1 &&
    Math.abs(r.removedArea - 600) < 0.01,
    "Finite notch"
  );

  const internal = Wood.create(0, 0, 400, 300);
  internal.marks.push([[100, 100], [180, 180]]);
  r = Wood.cut(internal, 0, 6);

  check(
    r.pieces.length === 1 &&
    !Wood.contains(r.pieces[0], P(140, 140)),
    "Interior line creates a groove"
  );

  for (const board of [owner, guide, ...r.pieces]) {
    paper.project.activeLayer.removeChildren();
    Wood.draw(board);

    check(
      paper.project.activeLayer.children[0]
        .fillColor.toCSS(true) === "#cb945a",
      "Same color before and after cutting"
    );
  }

  const down = (x, y) =>
    paper.tool.emit("mousedown", { point: P(x, y) });

  const move = (x, y) =>
    paper.tool.emit("mousemove", { point: P(x, y) });

  const mode = name =>
    buttons.find(b => b.dataset.tool === name).onclick();

  mode("pencil");
  down(300, 320);
  move(320, 380);
  down(320, 380);
  move(380, 430);
  down(380, 430);

  const a = inspect().scene.boards[0];

  check(
    a.marks.length === 2 &&
    inspect().draft.start[0] === 240 &&
    inspect().draft.start[1] === 110,
    "Clicks chain from interior points"
  );

  keyHandlers[0]({ key: "Escape" });
  check(
    !inspect().draft && a.marks.length === 2,
    "Escape preserves committed lines"
  );

  move(320, 380);
  down(320, 380);

  check(
    inspect().draft.board === a &&
    inspect().draft.start[0] === 180 &&
    inspect().draft.start[1] === 60,
    "Existing interior endpoint can restart"
  );

  keyHandlers[0]({ key: "Escape" });
  mode("saw");
  down(340, 397);

  check(
    inspect().scene.boards.length === 2,
    "Saw accepts an interior-start line"
  );

  elements.reset.onclick();

  const boards = inspect().scene.boards;
  boards[0].x = 100;
  boards[0].y = 200;
  boards[1].x = 350;
  boards[1].y = 140;

  mode("pencil");
  move(100, 240);
  down(100, 240);
  move(700, 260);

  check(
    inspect().draft.board === boards[0] &&
    inspect().draft.blocked,
    "Owner remains fixed beyond ruler"
  );

  check(
    Math.abs(inspect().draft.end[0] + 100 - 350) < 0.001,
    "Preview stops at first ruler face"
  );

  keyHandlers[0]({ key: "Escape" });

  mode("pencil");
  move(420, 140);
  down(420, 140);
  move(420, 230);

  check(
    inspect().draft.board === boards[1] &&
    inspect().draft.blocked,
    "Both board sizes can be guided"
  );

  check(
    Math.abs(inspect().draft.end[1] + 140 - 200) < 0.001,
    "Lower board also blocks the line"
  );

  keyHandlers[0]({ key: "Escape" });
  elements.reset.onclick();

  check(
    inspect().scene.boards.length === 2 &&
    inspect().scene.boards.every(b => !b.marks.length),
    "Single scene reset"
  );

  return "PASS";
})()`, c);

console.log(result);
