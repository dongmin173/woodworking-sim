/* SVG 커서의 핫스폿을 실제 연필/날 끝에 둡니다. */
window.WorkshopCursors = (() => {
  const cursor = (body, x, y) => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `width="32" height="32" viewBox="0 0 32 32">` +
      `<g stroke="#302820" stroke-width="1.4" ` +
      `stroke-linejoin="round">${body}</g></svg>`;

    return (
      `url("data:image/svg+xml,${encodeURIComponent(svg)}") ` +
      `${x} ${y}, crosshair`
    );
  };

  return {
    move: "grab",

    pencil: cursor(
      '<path fill="#e9b750" d="M7 20L22 5L27 10L12 25Z"/>' +
      '<path fill="#ead1a2" d="M4 28L7 20L12 25Z"/>' +
      '<path fill="#333" d="M4 28L6 23L9 26Z"/>' +
      '<path fill="#db8175" d="M22 5L24 3Q26 1 28 3L29 4Q31 6 29 8L27 10Z"/>',
      4,
      28
    ),

    saw: cursor(
      '<path fill="#d1d9df" d="M3 27L7 15L21 8L26 17L23 18L22 21L19 21L18 24L15 24L14 27L11 27L10 30Z"/>' +
      '<path fill="#a56c3a" d="M21 8L23 3Q29 1 31 7L28 17L25 18Z"/>' +
      '<path fill="#f5eee0" d="M25 7L27 6L28 8L26 13Z"/>',
      3,
      27
    ),

    knife: cursor(
      '<path fill="#cbd4dc" d="M4 28L9 15L18 9L22 13Z"/>' +
      '<path fill="#976438" d="M18 9L24 2Q26 0 28 2L30 4Q32 6 30 8L22 13Z"/>' +
      '<path fill="none" stroke="#fff" d="M7 24L17 13"/>',
      4,
      28
    )
  };
})();
