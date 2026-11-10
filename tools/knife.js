window.WorkshopTools = window.WorkshopTools || {};

WorkshopTools.Knife = class extends WorkshopTools.Carver {
  constructor(ctx) {
    super(ctx, {
      name: "구두칼",
      size: 4,
      dragOnly: false
    });
  }
};