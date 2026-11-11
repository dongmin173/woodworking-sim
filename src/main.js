(() => {
  const status = document.getElementById("status");
  if (!window.paper || !window.Matter) {
    status.textContent = "vendor 폴더의 Paper.js와 Matter.js 파일을 확인하세요.";
    return;
  }

  const woodMethods = [
    "create", "shape", "parts", "carve", "union", "draw", "grid"
  ];
  const toolTypes = ["Move", "Pencil", "Saw", "Carver", "Knife"];
  const appTypes = ["Application", "Controls", "SceneRenderer", "InputController"];

  if (!window.Workshop?.config || !Workshop.createScene || !Workshop.createContext
    || !appTypes.every(name => typeof Workshop[name] === "function")
    || !woodMethods.every(name => typeof window.Wood?.[name] === "function")
    || !toolTypes.every(name => typeof window.WorkshopTools?.[name] === "function")
    || !window.WorkshopCursors || !window.WorkshopViewport
    || !window.EdgeSnap || !window.BoardCollision) {
    status.textContent = "index.html의 src·tools 파일 경로와 스크립트 로딩 순서를 확인하세요.";
    return;
  }

  paper.setup(document.getElementById("canvas"));
  Workshop.app = new Workshop.Application(new Workshop.Controls());
  Workshop.app.start();
})();
