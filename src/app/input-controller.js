// Paper.js 도구 입력과 화면 이동용 pointer capture를 한 곳에서 조정합니다.
Workshop.InputController = class {
  constructor(app) {
    this.app = app;
    this.canvas = app.controls.get("canvas");
    this.space = false;
    this.panPointer = null;
    this.overCanvas = false;
  }

  bind() {
    this.canvas.tabIndex = 0;
    this.bindToolInput();
    this.bindPanInput();
    this.bindKeyboard();
  }

  syncControl(event) {
    if (typeof event?.ctrlKey === "boolean") {
      this.app.ctx.modifiers.control = event.ctrlKey;
    }
  }

  bindToolInput() {
    const app = this.app;
    this.tool = new paper.Tool();

    const route = action => event => {
      if (this.panPointer !== null) return;
      this.syncControl(event.event);
      app.viewport.focus = event.point.clone();
      action(event);
      app.draw();
    };

    this.tool.onMouseDown = route(event => {
      if (this.space || event.event?.button === 1) {
        app.viewport.panStart(event.point);
      } else {
        app.activeTool.down?.(event.point);
      }
    });

    this.tool.onMouseMove = route(event => app.activeTool.move?.(event.point));

    this.tool.onMouseDrag = route(event => {
      if (app.viewport.panning) app.viewport.panMove(event.point);
      else app.activeTool.drag?.(event.point);
    });

    this.tool.onMouseUp = () => {
      if (this.panPointer !== null) return;
      if (app.viewport.panning) app.viewport.panEnd();
      else app.activeTool.up?.();
      app.draw();
    };
  }

  screenPoint(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return new paper.Point(
      (event.clientX - bounds.left) * paper.view.viewSize.width / bounds.width,
      (event.clientY - bounds.top) * paper.view.viewSize.height / bounds.height
    );
  }

  stopPan() {
    const pointer = this.panPointer;
    this.panPointer = null;
    this.app.viewport.panEnd();
    if (pointer !== null && this.canvas.hasPointerCapture?.(pointer)) {
      this.canvas.releasePointerCapture(pointer);
    }
    this.app.controls.setCursor(this.app.current);
  }

  consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  bindPanInput() {
    const app = this.app;
    const canvas = this.canvas;

    canvas.addEventListener("pointerenter", () => { this.overCanvas = true; });
    canvas.addEventListener("pointerleave", () => { this.overCanvas = false; });

    canvas.addEventListener("pointerdown", event => {
      canvas.focus({ preventScroll: true });
      const blank = app.current === "move" && event.button === 0
        && !app.ctx.pick(paper.view.viewToProject(this.screenPoint(event)));
      if (!(event.button === 1 || (event.button === 0 && this.space) || blank)) return;

      this.consume(event);
      app.activeTool.up?.();
      this.panPointer = event.pointerId;
      app.viewport.panStartScreen(this.screenPoint(event));
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    }, true);

    canvas.addEventListener("pointermove", event => {
      if (event.pointerId !== this.panPointer) return;
      this.consume(event);
      const point = this.screenPoint(event);
      app.viewport.panMoveScreen(point);
      app.viewport.focus = paper.view.viewToProject(point);
    }, true);

    canvas.addEventListener("pointerup", event => {
      if (event.pointerId !== this.panPointer) return;
      this.consume(event);
      this.stopPan();
      app.draw();
    }, true);

    canvas.addEventListener("pointercancel", event => {
      if (event.pointerId === this.panPointer) this.stopPan();
    }, true);

    canvas.addEventListener("lostpointercapture", event => {
      if (event.pointerId === this.panPointer) this.stopPan();
    });
  }

  bindKeyboard() {
    const app = this.app;

    document.addEventListener("keydown", event => {
      if (event.key === "Control") app.ctx.modifiers.control = true;
      else this.syncControl(event);

      if (event.key === "Escape") {
        app.activeTool.cancel?.();
        this.stopPan();
        app.draw();
      }

      const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)
        || event.target?.isContentEditable;
      if ((event.code === "Space" || event.key === " ") && !editing
        && (this.overCanvas || document.activeElement === this.canvas
          || event.target?.tagName !== "BUTTON")) {
        this.space = true;
        event.preventDefault();
      }

      if (app.current === "knife") app.draw();
    }, true);

    document.addEventListener("keyup", event => {
      if (event.key === "Control") app.ctx.modifiers.control = false;
      else this.syncControl(event);
      if (event.code === "Space" || event.key === " ") this.space = false;
      if (app.current === "knife") app.draw();
    }, true);

    window.addEventListener?.("blur", () => {
      this.space = false;
      app.ctx.modifiers.control = false;
      this.stopPan();
      app.activeTool.up?.();
      app.draw();
    });
  }
};
