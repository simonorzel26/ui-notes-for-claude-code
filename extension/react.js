// Runs in the page itself, where React keeps its dev information on DOM elements. content.js asks
// for it with an event and reads the answer from an attribute. A newer copy replaces an older one.
(() => {
  const previous = window.__uiNotesReact;
  if (previous) removeEventListener("ui-notes:react", previous, true);

  const listener = (e) => {
    const el = e.target;
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    const fiber = key ? el[key] : null;
    const components = [];
    for (let f = fiber; f && components.length < 5; f = f.return) {
      const type = f.type;
      const name =
        typeof type === "function"
          ? type.displayName || type.name
          : type?.displayName || type?.render?.name || type?.type?.name;
      if (name && !components.includes(name)) components.push(name);
    }
    // In a dev build, where this element's JSX was written: the app's own frames, raw.
    const source =
      fiber?._debugStack?.stack
        ?.split("\n")
        .slice(1)
        .map((line) => line.trim())
        .filter((line) => !line.includes("/node_modules/"))
        .slice(0, 3)
        .join("\n") || null;
    el.setAttribute("data-ui-notes-react", JSON.stringify({ components, source }));
  };
  window.__uiNotesReact = listener;
  addEventListener("ui-notes:react", listener, true);
})();
