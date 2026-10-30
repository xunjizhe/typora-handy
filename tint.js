// Standalone Typora plugin. No framework or npm dependencies.
(() => {
  "use strict";

  function start() {
    if (window.__typoraTintLoaded) return;
    const editor = window.File?.editor;
    const menu = document.getElementById("context-menu");
    const write = document.getElementById("write");
    if (!write || !menu || !editor?.selection?.getRangy || !editor.contextMenu?.show || !editor.insertText) return false;

    // Hide only spelling suggestions and dictionary actions in the context menu.
    // Typora recreates those items on every right click, so use scoped CSS.
    const style = document.createElement("style");
    style.id = "typora-tint-style";
    style.textContent = '#context-menu > [data-group="spell-check"] { display: none !important; }';
    document.head.appendChild(style);

    const row = document.createElement("li");
    row.id = "typora-tint-colors";
    row.className = "has-btn-submenu hide";
    row.setAttribute("role", "none");
    const palette = document.createElement("span");
    palette.className = "menu-item-container";
    palette.setAttribute("role", "group");
    palette.setAttribute("aria-label", "文字颜色");
    palette.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 20px";
    row.appendChild(palette);
    let saved = null;

    function readSelection() {
      if (window.File.isLocked || editor.sourceView?.inSourceMode) return null;
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return null;
      const range = editor.selection.getRangy();
      if (!range || !write.contains(range.commonAncestorContainer)) return null;
      const mark = editor.getMarkElem(range.startContainer);
      if (!mark?.[0]?.contains(range.startContainer) || !mark[0].contains(range.endContainer)) return null;
      if (mark[0].closest("pre, .md-fences")) return null;
      const bookmark = range.getBookmark(mark[0]);
      const source = mark.rawText();
      const text = source.slice(bookmark.start, bookmark.end);
      if (!text) return null;
      return { range: selection.getRangeAt(0).cloneRange(), text, source, mark: mark[0], start: bookmark.start, end: bookmark.end };
    }

    function placeRow() {
      // The first native menu open replaces the search placeholder with Google.
      const search = menu.querySelector('[data-key="search-default"]') || menu.querySelector("#search-service-placeholder");
      if (search) {
        if (row.nextElementSibling !== search) menu.insertBefore(row, search);
      } else if (row.parentNode !== menu) {
        menu.insertBefore(row, menu.firstChild);
      }
    }

    function positionMenu(range) {
      const gap = 8;
      // A tall menu should scroll rather than force itself over the selection.
      menu.style.boxSizing = "border-box";
      menu.style.maxHeight = `${Math.max(1, window.innerHeight - gap * 2)}px`;
      menu.style.overflowY = "auto";
      const box = menu.getBoundingClientRect();
      const text = range.getBoundingClientRect();
      const clampX = x => Math.max(gap, Math.min(x, window.innerWidth - box.width - gap));
      const clampY = y => Math.max(gap, Math.min(y, window.innerHeight - box.height - gap));
      const candidates = [
        { left: text.left, top: text.bottom + gap },
        { left: text.left, top: text.top - box.height - gap },
        { left: text.right + gap, top: text.top },
        { left: text.left - box.width - gap, top: text.top },
      ];
      let best = null;
      let smallestOverlap = Infinity;
      for (const candidate of candidates) {
        const left = clampX(candidate.left);
        const top = clampY(candidate.top);
        const overlapWidth = Math.max(0, Math.min(left + box.width, text.right + gap) - Math.max(left, text.left - gap));
        const overlapHeight = Math.max(0, Math.min(top + box.height, text.bottom + gap) - Math.max(top, text.top - gap));
        const overlap = overlapWidth * overlapHeight;
        if (overlap < smallestOverlap) {
          best = { left, top };
          smallestOverlap = overlap;
        }
        if (overlap === 0) break;
      }
      // Account for any native menu margins between CSS offsets and its bounds.
      const cssLeft = parseFloat(menu.style.left);
      const cssTop = parseFloat(menu.style.top);
      menu.style.left = `${best.left + (Number.isFinite(cssLeft) ? cssLeft - box.left : 0)}px`;
      menu.style.top = `${best.top + (Number.isFinite(cssTop) ? cssTop - box.top : 0)}px`;
    }

    function applyColor(color) {
      const target = saved;
      saved = null;
      if (!target?.mark.isConnected || !target.range.startContainer.isConnected || !target.range.endContainer.isConnected) return;
      editor.contextMenu.hide();
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(target.range);
      const current = readSelection();
      if (!current || current.mark !== target.mark || current.source !== target.source || current.start !== target.start || current.end !== target.end) return;
      editor.insertText(`<span style="color: ${color}">${current.text}</span>`);
    }

    const colors = [
      ["红色", "#e53935"], ["橙色", "#ef6c00"], ["绿色", "#2e7d32"],
      ["蓝色", "#1565c0"], ["紫色", "#8e24aa"], ["灰色", "#757575"],
    ];
    for (const [name, color] of colors) {
      const button = document.createElement("button");
      button.type = "button";
      button.title = name;
      button.setAttribute("aria-label", name);
      button.style.cssText = `flex:0 0 24px;width:24px;height:24px;min-width:0;margin:0;padding:0;border:1px solid #888;border-radius:4px;cursor:pointer;background:${color}`;
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        applyColor(color);
      });
      palette.appendChild(button);
    }
    row.addEventListener("mousedown", event => {
      event.preventDefault();
      event.stopPropagation();
    });
    placeRow();

    // Let Typora build and position its own menu, including all native actions.
    const show = editor.contextMenu.show;
    editor.contextMenu.show = function (...args) {
      const result = show.apply(this, args);
      try {
        // Read the final selection: Typora may select the right-clicked word.
        saved = readSelection();
        row.classList.toggle("hide", !saved);
        placeRow();
        if (saved && menu.classList.contains("show")) {
          positionMenu(saved.range);
        }
      } catch (error) {
        saved = null;
        row.classList.toggle("hide", true);
        console.warn("[typora-handy] Could not read the menu selection:", error);
      }
      return result;
    };

    if (window.TyporaTintImages) {
      try { window.TyporaTintImages(editor, write); }
      catch (error) { console.warn("[typora-handy] Image tools could not initialize:", error); }
    }
    window.__typoraTintLoaded = true;
    console.log("[typora-handy] Ready: native context menu.");
  }

  let attempts = 0;
  function boot() {
    try {
      if (start() !== false) return;
      if (++attempts < 120) setTimeout(boot, 500);
      else console.warn("[typora-handy] Editor did not become ready.");
    } catch (error) {
      console.error("[typora-handy] Could not initialize:", error);
    }
  }
  boot();
})();
