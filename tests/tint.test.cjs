const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const code = fs.readFileSync(path.join(__dirname, "../tint.js"), "utf8");

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.listeners = {};
    this.attrs = {};
    this.style = {};
    this.className = "";
    this.isConnected = true;
    this.classList = {
      contains: name => this.className.split(" ").includes(name),
      toggle: (name, enabled) => {
        const names = new Set(this.className.split(" ").filter(Boolean));
        if (enabled) names.add(name); else names.delete(name);
        this.className = [...names].join(" ");
      },
    };
  }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, reference) {
    if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
    child.parentNode = this;
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    assert.ok(index >= 0);
    this.children.splice(index, 0, child);
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  get firstChild() { return this.children[0] || null; }
  get nextElementSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  closest() { return null; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith("#") && child.id === selector.slice(1)) return child;
      const attr = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
      if (attr && child.attrs[attr[1]] === attr[2]) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  fire(type, event = {}) {
    const ev = { preventDefault() {}, stopPropagation() {}, ...event };
    for (const fn of this.listeners[type] || []) fn(ev);
  }
}

function setup({ ready = true, autoSelect = false, imageTools } = {}) {
  const document = new Element(), body = new Element("body"), head = new Element("head");
  const write = new Element(), mark = new Element("p"), textNode = new Element("text");
  write.id = "write"; write.appendChild(mark); mark.appendChild(textNode);
  const menu = new Element("ul"); menu.id = "context-menu";
  menu.getBoundingClientRect = () => ({ top: 20, left: 20, right: 280, bottom: 500, width: 260, height: 480 });
  const spelling = new Element("li"); spelling.setAttribute("data-group", "spell-check");
  const placeholder = new Element("li"); placeholder.id = "search-service-placeholder";
  const copy = new Element("li"); copy.setAttribute("data-group", "copy-paste");
  menu.appendChild(spelling); menu.appendChild(placeholder); menu.appendChild(copy);
  body.appendChild(write); body.appendChild(menu);
  document.head = head; document.body = body;
  document.getElementById = id => ready ? body.querySelector(`#${id}`) : null;
  document.createElement = tag => new Element(tag);
  let source = "前缀**文字** &amp; 后缀", start = 2, end = 15;
  const nativeRange = {
    startContainer: textNode, endContainer: textNode, commonAncestorContainer: mark,
    cloneRange() { return this; },
    getBoundingClientRect: () => ({ left: 100, top: 40, right: 200, bottom: 64, width: 100, height: 24 }),
  };
  const rangyRange = { ...nativeRange, getBookmark: () => ({ start, end }) };
  const selection = {
    rangeCount: 1, isCollapsed: false,
    getRangeAt: () => nativeRange, removeAllRanges() {},
    addRange(range) { assert.equal(range, nativeRange); },
  };
  const inserted = [], timers = [], errors = [], calls = [];
  const nativeMenu = {
    show(...args) {
      calls.push({ receiver: this, args });
      if (autoSelect) selection.isCollapsed = false;
      if (placeholder.parentNode) {
        const search = new Element("li"); search.setAttribute("data-key", "search-default");
        menu.insertBefore(search, placeholder); placeholder.remove();
      }
      menu.classList.toggle("show", true);
      return "native-result";
    },
    hide() { menu.classList.toggle("show", false); },
  };
  const editor = {
    selection: { getRangy: () => rangyRange }, sourceView: { inSourceMode: false },
    contextMenu: nativeMenu,
    getMarkElem: () => ({ 0: mark, rawText: () => source }),
    insertText: text => inserted.push(text),
  };
  const window = { File: { editor, isLocked: false }, innerWidth: 800, innerHeight: 600, getSelection: () => selection };
  if (imageTools) window.TyporaTintImages = imageTools;
  const context = vm.createContext({ window, document, setTimeout: fn => timers.push(fn), console: { log() {}, warn() {}, error: error => errors.push(error) } });
  vm.runInContext(code, context);
  return {
    window, document, body, head, write, menu, mark, editor, selection, inserted, calls, errors, range: nativeRange,
    get row() { return menu.querySelector("#typora-tint-colors"); },
    get buttons() { return this.row.children[0].children; },
    open(...args) { return editor.contextMenu.show(...args); },
    changeText(value) { source = value; },
    setReady() { ready = true; },
    flush() { const pending = timers.splice(0); pending.forEach(fn => fn()); },
    reload() { vm.runInContext(code, context); },
    expectedText: source.slice(start, end),
  };
}

test("six colors are inside the native menu directly above Google on every open", () => {
  const app = setup();
  assert.equal(app.row.classList.contains("hide"), true);
  app.open();
  assert.equal(app.row.parentNode, app.menu);
  assert.equal(app.row.classList.contains("hide"), false);
  assert.equal(app.row.nextElementSibling.attrs["data-key"], "search-default");
  assert.equal(app.buttons.length, 6);
  app.open(); app.reload(); app.open();
  assert.equal(app.menu.children.filter(child => child.id === "typora-tint-colors").length, 1);
  assert.equal(app.row.nextElementSibling.attrs["data-key"], "search-default");
});

test("native show receives its receiver and arguments and retains its return value", () => {
  const app = setup(), event = { target: app.mark }, target = app.mark;
  assert.equal(app.open(event, target), "native-result");
  assert.equal(app.calls[0].receiver, app.editor.contextMenu);
  assert.deepEqual(app.calls[0].args, [event, target]);
});

test("the first right click shows colors for a word selected by Typora's native menu", () => {
  const app = setup({ autoSelect: true });
  app.selection.isCollapsed = true;
  app.open();
  assert.equal(app.row.classList.contains("hide"), false);
  app.buttons[0].fire("click");
  assert.deepEqual(app.inserted, [`<span style="color: #e53935">${app.expectedText}</span>`]);
});

test("a plugin selection error does not prevent the native menu from opening", () => {
  const app = setup();
  app.editor.getMarkElem = () => { throw new Error("selection error"); };
  assert.doesNotThrow(() => app.open());
  assert.equal(app.calls.length, 1);
  assert.equal(app.menu.classList.contains("show"), true);
  assert.equal(app.row.classList.contains("hide"), true);
});

test("adding colors after native positioning keeps the menu inside the viewport", () => {
  const app = setup({ autoSelect: true });
  app.selection.isCollapsed = true;
  app.menu.getBoundingClientRect = () => ({ top: 300, left: 600, right: 860, bottom: 780, width: 260, height: 480 });
  app.range.getBoundingClientRect = () => ({ left: 700, top: 550, right: 760, bottom: 574, width: 60, height: 24 });
  app.open();
  assert.equal(app.menu.style.top, "62px");
  assert.equal(app.menu.style.left, "532px");
});

test("menu opens below the selected text instead of covering the screenshot's top line", () => {
  const app = setup();
  app.window.innerHeight = 800;
  app.range.getBoundingClientRect = () => ({ left: 12, top: 13, right: 156, bottom: 48, width: 144, height: 35 });
  app.open();
  assert.equal(app.menu.style.left, "12px");
  assert.equal(app.menu.style.top, "56px");
});

test("menu moves to the right when neither above nor below has enough space", () => {
  const app = setup();
  app.range.getBoundingClientRect = () => ({ left: 100, top: 280, right: 200, bottom: 304, width: 100, height: 24 });
  app.open();
  assert.equal(app.menu.style.left, "208px");
  assert.equal(app.menu.style.top, "112px");
});

test("menu moves to the left when the selected text is near the right edge", () => {
  const app = setup();
  app.range.getBoundingClientRect = () => ({ left: 600, top: 280, right: 760, bottom: 304, width: 160, height: 24 });
  app.open();
  assert.equal(app.menu.style.left, "332px");
  assert.equal(app.menu.style.top, "112px");
});

test("a short window scrolls the menu and keeps the selection visible beside it", () => {
  const app = setup();
  app.window.innerHeight = 200;
  app.range.getBoundingClientRect = () => ({ left: 100, top: 90, right: 200, bottom: 114, width: 100, height: 24 });
  app.menu.getBoundingClientRect = () => {
    const height = Math.min(480, parseFloat(app.menu.style.maxHeight) || 480);
    return { top: 20, left: 20, right: 280, bottom: 20 + height, width: 260, height };
  };
  app.open();
  assert.equal(app.menu.style.maxHeight, "184px");
  assert.equal(app.menu.style.overflowY, "auto");
  assert.equal(app.menu.style.top, "8px");
  assert.equal(app.menu.style.left, "208px");
});

test("color click restores the selection and replaces only its Markdown, then closes the native menu", () => {
  const app = setup(); app.open();
  let prevented = false, stopped = false;
  app.row.fire("mousedown", { preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented && stopped, true);
  app.buttons[0].fire("click");
  assert.deepEqual(app.inserted, [`<span style="color: #e53935">${app.expectedText}</span>`]);
  assert.equal(app.menu.classList.contains("show"), false);
  assert.deepEqual(app.errors, []);
});

test("no floating button, popup, selection listener or keyboard shortcut is installed", () => {
  const app = setup();
  assert.equal(app.body.children.length, 2); // Only the original editor and context menu.
  assert.deepEqual(app.document.listeners, {});
  assert.equal(app.body.querySelector("#typora-tint-trigger"), null);
  assert.equal(app.body.querySelector("#typora-tint"), null);
});

test("only context-menu spelling entries are hidden; native editing items stay intact", () => {
  const app = setup(); app.open();
  assert.equal(app.head.children[0].textContent, '#context-menu > [data-group="spell-check"] { display: none !important; }');
  assert.ok(app.menu.querySelector('[data-group="spell-check"]'));
  assert.ok(app.menu.querySelector('[data-group="copy-paste"]'));
});

for (const [name, configure] of [
  ["empty selection", app => { app.selection.isCollapsed = true; }],
  ["source mode", app => { app.editor.sourceView.inSourceMode = true; }],
  ["locked document", app => { app.window.File.isLocked = true; }],
  ["multiple paragraphs", app => { app.mark.contains = () => false; }],
  ["code block", app => { app.mark.closest = () => ({}); }],
]) {
  test(`hides colors for ${name} without stopping the original menu`, () => {
    const app = setup(); configure(app); app.open();
    assert.equal(app.row.classList.contains("hide"), true);
    assert.equal(app.menu.classList.contains("show"), true);
    assert.deepEqual(app.inserted, []);
  });
}

test("changed, detached or newly locked documents cannot be overwritten by a stale menu", () => {
  for (const change of [
    app => app.changeText("changed"),
    app => { app.mark.isConnected = false; },
    app => { app.window.File.isLocked = true; },
  ]) {
    const app = setup(); app.open(); change(app); app.buttons[0].fire("click");
    assert.deepEqual(app.inserted, []);
  }
});

test("waits for initialization and does not duplicate native menu hooks", () => {
  const app = setup({ ready: false });
  assert.equal(app.row, null);
  app.setReady(); app.flush();
  assert.ok(app.row);
  const show = app.editor.contextMenu.show;
  app.reload(); assert.equal(app.editor.contextMenu.show, show);
  assert.equal(app.head.children.length, 1);
});

test("image controls initialize once with the same editor and document", () => {
  const calls = [];
  const app = setup({ imageTools: (...args) => calls.push(args) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], app.editor);
  assert.equal(calls[0][1], app.write);
  app.reload();
  assert.equal(calls.length, 1);
});

test("an image module failure does not disable the original color menu", () => {
  const app = setup({ imageTools: () => { throw new Error("image initialization failed"); } });
  app.open();
  assert.equal(app.row.classList.contains("hide"), false);
  assert.equal(app.window.__typoraTintLoaded, true);
});
