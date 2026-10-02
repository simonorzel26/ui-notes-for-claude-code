// Hold Option on any localhost page: the element under the pointer is highlighted the way Chrome's
// element picker does it. Click it to leave a note; the note goes to ~/.ui-notes/queue.jsonl. A pill
// in the corner counts the queue and opens it to read, edit and delete notes.
(() => {
  // A copy left behind by an extension reload still has its pill on the page.
  for (const stale of document.querySelectorAll('[data-ui-notes="pill"]')) stale.remove();

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;background:rgba(111,168,220,.45);outline:1px solid rgb(111,168,220)";
  const label = document.createElement("div");
  label.style.cssText =
    "position:absolute;left:0;padding:2px 6px;border-radius:3px;background:#333740;color:#fff;font:11px/1.5 ui-monospace,monospace;white-space:nowrap";
  box.append(label);

  const nameOf = (el) => {
    const classes = [...el.classList].slice(0, 2).map((c) => `.${c}`).join("");
    return `${el.localName}${el.id ? `#${el.id}` : ""}${classes}`;
  };

  const show = (el) => {
    const r = el.getBoundingClientRect();
    Object.assign(box.style, {
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    Object.assign(label.style, r.top < 24 ? { top: "100%", bottom: "" } : { top: "", bottom: "100%" });
    label.textContent = `${nameOf(el)}  ${Math.round(r.width)} × ${Math.round(r.height)}`;
    if (!box.isConnected) document.body.append(box);
  };
  const hide = () => box.remove();

  // Events from our own modals and pill are typing and clicking inside them, never picking.
  const ours = (e) => e.target instanceof Element && e.target.hasAttribute("data-ui-notes");

  const PILL_CSS = `
    button { padding: 6px 12px; border: 0; border-radius: 999px; background: #333740; color: #fff;
      font: 13px/1.4 system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.2); cursor: pointer; }
    button:hover { background: #18181b; }
    button:empty { display: none; }
    button.error { background: #b91c1c; }`;

  // Always on the page: the queue's length, and the way into the list.
  const pillHost = document.createElement("div");
  pillHost.setAttribute("data-ui-notes", "pill");
  pillHost.style.cssText = "position:fixed;z-index:2147483647;right:16px;bottom:16px";
  const pillRoot = pillHost.attachShadow({ mode: "closed" });
  pillRoot.innerHTML = `<style>${PILL_CSS}</style><button type="button"></button>`;
  const pill = pillRoot.querySelector("button");

  const listening = [];
  const teardown = () => {
    hide();
    pillHost.remove();
    for (const [t, l] of listening) removeEventListener(t, l, true);
  };
  // A tab that loads while the extension installs gets this script twice, from the manifest and
  // from background.js. Both run in the extension's one isolated world, so the newer one retires
  // the older.
  globalThis.uiNotesTeardown?.();
  globalThis.uiNotesTeardown = teardown;

  // After the extension reloads, this copy can no longer save notes: it removes itself and the
  // freshly injected copy takes over.
  const on = (type, handle) => {
    const listener = (e) => {
      if (chrome.runtime?.id) return ours(e) ? undefined : handle(e);
      teardown();
    };
    listening.push([type, listener]);
    addEventListener(type, listener, true);
  };

  // React's component names and the place each element was written live on page properties this
  // script cannot see; react.js runs beside the page and hands them over on request.
  const reactOf = (el) => {
    el.dispatchEvent(new CustomEvent("ui-notes:react", { bubbles: true, composed: true }));
    const found = el.getAttribute("data-ui-notes-react");
    el.removeAttribute("data-ui-notes-react");
    return found ? JSON.parse(found) : { components: [], source: null };
  };

  // Resolves with the host's reply, or with the reason there is none; never throws, also not after
  // the extension reloaded under an open modal.
  const call = (request) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(request, (reply) =>
          resolve(reply ?? { ok: false, error: chrome.runtime.lastError?.message ?? "no reply" }),
        );
      } catch (error) {
        resolve({ ok: false, error: error.message });
      }
    });

  const noteCount = (count) => (count === 1 ? "1 note" : `${count} notes`);

  const showReply = (reply, failure) => {
    pill.className = reply.ok ? "" : "error";
    pill.textContent = reply.ok ? noteCount(reply.notes.length) : `${failure}: ${reply.error}`;
    return reply;
  };

  const refresh = async () => {
    if (!pillHost.isConnected) document.body.append(pillHost);
    showReply(await call({ op: "list" }), "UI notes");
  };

  const BASE_CSS = `
    dialog { width: min(640px, calc(100vw - 32px)); padding: 20px; border: 1px solid #d4d4d8;
      border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,.25); background: #fff; color: #18181b;
      font: 14px/1.5 system-ui, sans-serif; }
    dialog::backdrop { background: rgba(0,0,0,.2); }
    textarea { box-sizing: border-box; width: 100%; padding: 10px 12px;
      border: 1px solid #d4d4d8; border-radius: 8px; font: inherit; color: inherit; resize: vertical; }
    textarea:focus { outline: 2px solid rgb(111,168,220); outline-offset: 1px; }
    button { padding: 6px 14px; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff;
      color: #18181b; font: 14px/1.5 system-ui, sans-serif; cursor: pointer; }
    button[value="save"] { border-color: #18181b; background: #18181b; color: #fff; }`;

  const ASK_CSS = `
    p { margin: 0 0 10px; color: #52525b; font: 12px/1.4 ui-monospace, monospace; overflow-wrap: anywhere; }
    textarea { min-height: 180px; }
    footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 12px;
      color: #71717a; font-size: 12px; }`;

  const LIST_CSS = `
    dialog { width: min(720px, calc(100vw - 32px)); height: calc(100vh - 32px); max-height: none; padding: 0; }
    [hidden] { display: none !important; }
    .sheet { display: flex; flex-direction: column; height: 100%; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px;
      padding: 14px 20px; border-bottom: 1px solid #e4e4e7; }
    h2 { margin: 0; font-size: 16px; }
    header span { color: #71717a; font-size: 12px; }
    ol { flex: 1; overflow-y: auto; margin: 0; padding: 0 20px; list-style: none; }
    li { padding: 14px 0; border-bottom: 1px solid #f4f4f5; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; color: #71717a; font-size: 12px; }
    .meta a { color: inherit; }
    .meta code { font: 12px ui-monospace, monospace; }
    .actions { display: flex; gap: 6px; margin-left: auto; }
    .actions button, .buttons button { padding: 2px 10px; font-size: 13px; }
    button.armed { border-color: #b91c1c; background: #b91c1c; color: #fff; }
    .text { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    textarea { field-sizing: content; min-height: 96px; margin-top: 8px; }
    .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .error { margin: 6px 0 0; color: #b91c1c; }
    .empty { display: none; padding: 24px 20px; color: #71717a; }
    ol:empty + .empty { display: block; }`;

  // A native modal in a closed shadow root, so the page's CSS cannot restyle it and the page's
  // scripts cannot read it.
  const modal = (css, html) => {
    const host = document.createElement("div");
    host.setAttribute("data-ui-notes", "");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${BASE_CSS}${css}</style><dialog>${html}</dialog>`;
    const dialog = root.querySelector("dialog");
    // Keys typed here must not reach the app's own shortcuts.
    for (const type of ["keydown", "keyup", "keypress"]) {
      dialog.addEventListener(type, (e) => e.stopPropagation());
    }
    dialog.addEventListener("close", () => host.remove());
    document.body.append(host);
    dialog.showModal();
    return { root, dialog };
  };

  // Room for paragraphs. Resolves with the note, or null when cancelled.
  const ask = (title) =>
    new Promise((resolve) => {
      const { root, dialog } = modal(
        ASK_CSS,
        `<form method="dialog">
          <p></p>
          <textarea rows="8" placeholder="What should change? Several paragraphs are fine."></textarea>
          <footer><span>Cmd+Enter saves, Esc cancels</span>
            <span><button type="button" value="cancel">Cancel</button> <button value="save">Save note</button></span>
          </footer>
        </form>`,
      );
      const textarea = root.querySelector("textarea");
      root.querySelector("p").textContent = title;
      root.querySelector('button[value="cancel"]').addEventListener("click", () => dialog.close());
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) dialog.close("save");
      });
      dialog.addEventListener("close", () =>
        resolve(dialog.returnValue === "save" ? textarea.value.trim() || null : null),
      );
      textarea.focus();
    });

  // One note in the list. Its text lives in the DOM; the host's reply is what changes it.
  const item = (note, update) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="meta"><a target="_blank"></a><code></code><time></time>
        <span class="actions"><button type="button" value="edit">Edit</button>
          <button type="button" value="delete">Delete</button></span></div>
      <p class="text"></p>
      <div class="editor" hidden><textarea></textarea>
        <div class="buttons"><button type="button" value="cancel">Cancel</button>
          <button type="button" value="save">Save</button></div></div>
      <p class="error" hidden></p>`;
    const $ = (selector) => li.querySelector(selector);
    const page = URL.canParse(note.url) ? new URL(note.url) : null;
    $("a").href = page?.href ?? "";
    $("a").textContent = page ? `${page.host}${page.pathname}${page.search}` : "";
    $("code").textContent = note.name ?? "";
    $("time").textContent = new Date(note.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    $(".text").textContent = note.text;

    const textarea = $("textarea");
    const fail = (error) => {
      $(".error").textContent = error;
      $(".error").hidden = false;
    };
    const editing = (on) => {
      $(".text").hidden = on;
      $(".actions").hidden = on;
      $(".editor").hidden = !on;
      $(".error").hidden = true;
    };
    $('[value="edit"]').addEventListener("click", () => {
      textarea.value = $(".text").textContent;
      editing(true);
      textarea.focus();
    });
    $('[value="cancel"]').addEventListener("click", () => editing(false));
    const save = async () => {
      const reply = update(await call({ op: "edit", id: note.id, text: textarea.value }));
      if (!reply.ok) return fail(reply.error);
      $(".text").textContent = reply.notes.find((n) => n.id === note.id)?.text ?? textarea.value;
      editing(false);
    };
    $('[value="save"]').addEventListener("click", save);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
      if (e.key !== "Escape") return;
      // Esc leaves the edit, not the whole list.
      e.preventDefault();
      editing(false);
    });

    // Two clicks, so a stray one cannot lose a note.
    const remove = $('[value="delete"]');
    remove.addEventListener("click", async () => {
      if (!remove.classList.contains("armed")) {
        remove.classList.add("armed");
        remove.textContent = "Click again to delete";
        setTimeout(() => {
          remove.classList.remove("armed");
          remove.textContent = "Delete";
        }, 3000);
        return;
      }
      const reply = update(await call({ op: "delete", id: note.id }));
      reply.ok ? li.remove() : fail(reply.error);
    });
    return li;
  };

  // Every note in the queue, as tall as the window, to scroll, edit and delete.
  const browse = async () => {
    const reply = showReply(await call({ op: "list" }), "UI notes");
    if (!reply.ok) return;
    const { root, dialog } = modal(
      LIST_CSS,
      `<div class="sheet">
        <header><div><h2></h2><span>Waiting in ~/.ui-notes/queue.jsonl until Claude takes them</span></div>
          <button type="button" value="close">Close</button></header>
        <ol></ol>
        <p class="empty">No notes in the queue. Hold Option and click an element to add one.</p>
      </div>`,
    );
    const heading = root.querySelector("h2");
    const update = (next) => {
      showReply(next, "UI notes");
      if (next.ok) heading.textContent = noteCount(next.notes.length);
      return next;
    };
    update(reply);
    root.querySelector("ol").replaceChildren(...reply.notes.map((note) => item(note, update)));
    root.querySelector('[value="close"]').addEventListener("click", () => dialog.close());
    // A click on the backdrop lands on the dialog itself; clicks inside land on the sheet.
    dialog.addEventListener("click", (e) => e.target === dialog && dialog.close());
  };

  pill.addEventListener("click", browse);

  const selectorOf = (el) => {
    const parts = [];
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (node.id) return [`#${CSS.escape(node.id)}`, ...parts].join(" > ");
      const tag = node.localName;
      const same = [...(node.parentElement?.children ?? [])].filter((c) => c.localName === tag);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    }
    return ["body", ...parts].join(" > ");
  };

  const noteOn = (el, text) => ({
    url: location.href,
    heading: document.querySelector("h1")?.innerText.trim() ?? null,
    text,
    name: nameOf(el),
    innerText: el.innerText?.trim().slice(0, 300) ?? null,
    selector: selectorOf(el),
    ...reactOf(el),
    element: el.outerHTML.slice(0, 600),
    parent: el.parentElement?.outerHTML.slice(0, 1200) ?? null,
    viewport: `${innerWidth}x${innerHeight}`,
  });

  // The element under the pointer, so pressing Option without moving still highlights it.
  let hovered = null;
  on("mousemove", (e) => {
    hovered = e.target;
    e.altKey ? show(hovered) : hide();
  });
  on("keydown", (e) => e.key === "Alt" && hovered && show(hovered));
  on("keyup", (e) => e.key === "Alt" && hide());
  on("blur", (e) => e.target === window && hide());

  // Option-click must not also press the button or follow the link underneath.
  const block = (e) => {
    if (!e.altKey) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  };
  on("pointerdown", block);
  on("mousedown", block);
  on("click", async (e) => {
    if (!block(e)) return;
    const el = e.target;
    show(el);
    const text = await ask(`Note on ${nameOf(el)}`);
    hide();
    if (!text) return;
    const reply = showReply(await call({ op: "add", note: noteOn(el, text) }), "Note not saved");
    if (reply.ok) pill.animate([{ transform: "scale(1.2)" }, { transform: "none" }], { duration: 400, easing: "ease-out" });
  });

  // The agent empties the queue while you are in another window, so the count is read again on return.
  on("focus", (e) => e.target === window && refresh());
  on("visibilitychange", () => document.visibilityState === "visible" && refresh());
  refresh();
})();
