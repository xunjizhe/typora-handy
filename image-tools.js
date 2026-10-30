// Image controls for typora-handy. Loaded before tint.js; no external dependencies.
(() => {
  "use strict";

  window.TyporaTintImages = function (editor, write) {
    if (window.__typoraTintImagesLoaded) return;
    const style = document.createElement("style");
    style.textContent = `
      #typora-tint-image-frame { position:fixed; z-index:10000; border:2px solid #1976d2; box-sizing:border-box; cursor:move; touch-action:none; }
      #typora-tint-image-frame[hidden] { display:none !important; }
      #typora-tint-image-frame .tint-image-handle { position:absolute; width:12px; height:12px; padding:0; background:#fff; border:2px solid #1976d2; border-radius:2px; }
      #typora-tint-image-frame [data-corner="nw"] { left:-7px;top:-7px;cursor:nwse-resize; }
      #typora-tint-image-frame [data-corner="ne"] { right:-7px;top:-7px;cursor:nesw-resize; }
      #typora-tint-image-frame [data-corner="sw"] { left:-7px;bottom:-7px;cursor:nesw-resize; }
      #typora-tint-image-frame [data-corner="se"] { right:-7px;bottom:-7px;cursor:nwse-resize; }
    `;
    document.head.appendChild(style);
    const frame = document.createElement("div");
    frame.id = "typora-tint-image-frame";
    frame.hidden = true;
    frame.setAttribute("role", "group");
    frame.setAttribute("aria-label", "图片拖动和等比例缩放");
    for (const corner of ["nw", "ne", "sw", "se"]) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "tint-image-handle";
      handle.dataset.corner = corner;
      handle.setAttribute("aria-label", `缩放图片 ${corner}`);
      frame.appendChild(handle);
    }
    document.body.appendChild(frame);

    let active = null;
    let gesture = null;
    const editable = () => !window.File.isLocked && !editor.sourceView?.inSourceMode;
    const raw = wrapper => typeof wrapper.rawText === "function" ? wrapper.rawText() : wrapper.textContent;
    const scrollTop = () => (document.querySelector("content")?.scrollTop || 0) + window.scrollY;
    const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

    function restorePreview(target) {
      if (!target?.image.isConnected) return;
      if (target.previewStyle === null) target.image.removeAttribute("style");
      else target.image.setAttribute("style", target.previewStyle);
    }

    function hide() {
      if (gesture) restorePreview(gesture.target);
      gesture = null;
      active = null;
      frame.hidden = true;
    }

    function refresh() {
      if (!active || !editable() || !active.image.isConnected || !write.contains(active.wrapper)) return hide();
      const rect = active.image.getBoundingClientRect();
      frame.style.left = `${rect.left}px`;
      frame.style.top = `${rect.top}px`;
      frame.style.width = `${rect.width}px`;
      frame.style.height = `${rect.height}px`;
    }

    function select(image) {
      if (!editable() || !write.contains(image)) return false;
      const wrapper = image.closest(".md-image[md-inline]");
      if (!wrapper || wrapper.closest("pre, .md-fences, .md-htmlblock")) return false;
      const rect = image.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      active = { image, wrapper };
      frame.hidden = false;
      refresh();
      return true;
    }

    function snapshot() {
      if (!active || !editable() || !active.wrapper.isConnected) return null;
      const { image, wrapper } = active;
      const rect = image.getBoundingClientRect();
      const target = {
        image, wrapper, source: raw(wrapper), previewStyle: image.getAttribute("style"),
        state: { x: 0, y: 0, width: rect.width, height: rect.height },
      };
      // Typora sanitizes data-* attributes off its displayed IMG. Read our
      // metadata from the untouched source text, not the rendered image.
      const source = sourceImage(target);
      target.state.x = number(source.getAttribute("data-tint-x"));
      target.state.y = number(source.getAttribute("data-tint-y"));
      return target;
    }

    function sourceImage(target) {
      // The editing wrapper contains the original HTML/Markdown source as text.
      // Parse only an existing IMG tag; preserve attributes such as relative src.
      const template = document.createElement("template");
      template.innerHTML = target.source.trim();
      const parsed = template.content.firstElementChild;
      if (/^<img\b/i.test(target.source.trim()) && parsed?.tagName === "IMG") return parsed;
      const image = document.createElement("img");
      image.setAttribute("src", target.wrapper.getAttribute("data-src") || target.image.getAttribute("src") || "");
      for (const name of ["alt", "title"]) {
        if (target.image.hasAttribute(name)) image.setAttribute(name, target.image.getAttribute(name));
      }
      if (target.previewStyle) image.setAttribute("style", target.previewStyle);
      return image;
    }

    function persist(target, state) {
      restorePreview(target);
      if (!editable() || !target.wrapper.isConnected || !write.contains(target.wrapper) || raw(target.wrapper) !== target.source) return hide();
      const image = sourceImage(target);
      image.dataset.tintX = String(Math.round(state.x));
      image.dataset.tintY = String(Math.round(state.y));
      image.style.translate = `${Math.round(state.x)}px ${Math.round(state.y)}px`;
      image.style.width = `${Math.round(state.width)}px`;
      image.style.height = `${Math.round(state.height)}px`;
      image.style.maxWidth = "none";
      image.style.maxHeight = "none";
      image.style.zoom = "1";
      frame.hidden = true;
      active = null;
      // One replacement per gesture, using Typora's normal save/undo pipeline.
      editor.writingArea?.focus({ preventScroll: true });
      if (!target.wrapper.isConnected || raw(target.wrapper) !== target.source) return;
      const range = document.createRange();
      range.selectNode(target.wrapper);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      editor.insertText(image.outerHTML);
    }

    function begin(event, corner) {
      const target = snapshot();
      if (!target) return;
      gesture = { target, corner, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, scroll: scrollTop(), moved: false, state: { ...target.state } };
    }

    document.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      if (gesture && gesture.pointer !== event.pointerId) return;
      if (frame.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        begin(event, event.target.closest("[data-corner]")?.dataset.corner);
        return;
      }
      const image = event.target.closest("img");
      if (image && select(image)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        begin(event);
      } else hide();
    }, true);

    document.addEventListener("pointermove", event => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      if (!editable() || !gesture.target.image.isConnected) return hide();
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY + scrollTop() - gesture.scroll;
      if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      gesture.moved = true;
      const original = gesture.target.state;
      const next = { ...original };
      if (gesture.corner) {
        const sx = gesture.corner.includes("w") ? -1 : 1;
        const sy = gesture.corner.includes("n") ? -1 : 1;
        const scale = 1 + (sx * dx * original.width + sy * dy * original.height) / (original.width ** 2 + original.height ** 2);
        const minScale = 24 / Math.min(original.width, original.height);
        const factor = Math.max(minScale, Math.min(scale, 20000 / Math.max(original.width, original.height)));
        next.width = original.width * factor;
        next.height = original.height * factor;
        if (sx < 0) next.x += original.width - next.width;
        if (sy < 0) next.y += original.height - next.height;
      } else {
        next.x += dx;
        next.y += dy;
      }
      gesture.state = next;
      const image = gesture.target.image;
      image.style.translate = `${next.x}px ${next.y}px`;
      image.style.width = `${next.width}px`;
      image.style.height = `${next.height}px`;
      image.style.maxWidth = "none";
      image.style.maxHeight = "none";
      image.style.zoom = "1";
      refresh();
    }, true);

    document.addEventListener("pointerup", event => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      const finished = gesture;
      gesture = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (finished.moved) persist(finished.target, finished.state);
    }, true);
    document.addEventListener("pointercancel", event => {
      if (gesture?.pointer === event.pointerId) hide();
    }, true);
    document.addEventListener("click", event => {
      if (frame.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (active && event.target === active.image) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    document.addEventListener("keydown", event => {
      if (active && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (gesture) {
          restorePreview(gesture.target);
          gesture = null;
          refresh();
        } else hide();
      }
    }, true);
    document.addEventListener("contextmenu", () => { if (active) hide(); }, true);
    document.addEventListener("scroll", () => { if (active) refresh(); }, true);
    window.addEventListener("resize", () => { if (active) refresh(); });
    window.addEventListener("blur", hide);
    new MutationObserver(() => { if (active && !active.image.isConnected) hide(); }).observe(write, { childList: true, subtree: true });
    window.__typoraTintImagesLoaded = true;
  };
})();
