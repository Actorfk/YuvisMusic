(function exposeListReorder(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YuvisListReorder = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  // Only replace visible slots: filtered-out and unavailable songs keep their positions.
  function reorderVisibleItems(items, visibleKeys, sourceKey, targetKey, after, keyOf = (item) => item.id) {
    const from = visibleKeys.indexOf(sourceKey);
    if (from < 0 || sourceKey === targetKey || !visibleKeys.includes(targetKey)) return items;
    const byKey = new Map(items.map((item) => [keyOf(item), item]));
    if (byKey.size !== items.length || new Set(visibleKeys).size !== visibleKeys.length || visibleKeys.some((key) => !byKey.has(key))) return items;
    const ordered = visibleKeys.filter((key) => key !== sourceKey);
    ordered.splice(ordered.indexOf(targetKey) + (after ? 1 : 0), 0, sourceKey);
    if (ordered.every((key, index) => key === visibleKeys[index])) return items;
    const visible = new Set(visibleKeys);
    let index = 0;
    return items.map((item) => visible.has(keyOf(item)) ? byKey.get(ordered[index++]) : item);
  }

  function installPointerReorder({ container, scroller = container, rowSelector, keyOfRow, getContext, onMove, refreshRows = () => {} }) {
    let drag = null;
    let frame = 0;
    let suppressClickUntil = 0;

    function finish(commit = false) {
      if (!drag) return;
      const completed = drag;
      drag = null;
      cancelAnimationFrame(frame);
      if (container.hasPointerCapture(completed.pointerId)) container.releasePointerCapture(completed.pointerId);
      completed.marker?.remove();
      completed.label?.remove();
      document.body.classList.remove('list-reordering');
      if (completed.started) {
        suppressClickUntil = performance.now() + 350;
        if (commit && completed.target) onMove(completed.context, completed.sourceKey, completed.target.key, completed.target.after);
      }
    }

    function updateTarget() {
      if (!drag?.started) return;
      const bounds = container.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      drag.label.style.left = `${Math.max(8, Math.min(window.innerWidth - 240, drag.x + 16))}px`;
      drag.label.style.top = `${Math.max(8, Math.min(window.innerHeight - 44, drag.y + 16))}px`;
      drag.target = null;
      drag.marker.hidden = true;
      if (drag.x < bounds.left || drag.x > bounds.right || drag.y < Math.max(bounds.top, viewport.top) || drag.y > Math.min(bounds.bottom, viewport.bottom)) return;
      const rows = [...container.querySelectorAll(rowSelector)];
      const row = rows.find((item) => {
        const rect = item.getBoundingClientRect();
        return drag.y < rect.top + rect.height / 2;
      }) || rows.at(-1);
      if (!row) return;
      const rect = row.getBoundingClientRect();
      const after = drag.y >= rect.top + rect.height / 2;
      const y = after ? rect.bottom : rect.top;
      if (y < viewport.top || y > viewport.bottom) return;
      drag.target = { key: keyOfRow(row), after };
      drag.marker.hidden = false;
      Object.assign(drag.marker.style, { left: `${rect.left}px`, top: `${y - 1}px`, width: `${rect.width}px` });
    }

    function tick(time) {
      if (!drag?.started) return;
      const rect = scroller.getBoundingClientRect();
      const elapsed = Math.min(32, time - (drag.lastTime || time));
      drag.lastTime = time;
      if (drag.x >= rect.left && drag.x <= rect.right && drag.y >= rect.top && drag.y <= rect.bottom) {
        const edge = Math.min(48, rect.height / 4);
        const speed = drag.y < rect.top + edge ? -Math.min(1, (rect.top + edge - drag.y) / edge)
          : drag.y > rect.bottom - edge ? Math.min(1, (drag.y - rect.bottom + edge) / edge) : 0;
        const previous = scroller.scrollTop;
        scroller.scrollTop += speed * elapsed * .8;
        if (scroller.scrollTop !== previous) refreshRows();
      }
      updateTarget();
      frame = requestAnimationFrame(tick);
    }

    container.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return;
      const row = event.target.closest(rowSelector);
      if (!row || event.target.closest('input, select, textarea, a') || (event.target.closest('button') && event.target.closest('button') !== row)) return;
      const context = getContext();
      if (!context) return;
      finish();
      drag = { pointerId: event.pointerId, sourceKey: keyOfRow(row), context, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, text: row.querySelector('strong')?.textContent || row.textContent.trim() };
    });
    document.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!(event.buttons & 1)) return finish();
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6) return;
      event.preventDefault();
      if (!drag.started) {
        drag.started = true;
        container.setPointerCapture(event.pointerId);
        document.body.classList.add('list-reordering');
        drag.marker = document.createElement('div');
        drag.marker.className = 'reorder-insertion-marker';
        drag.label = document.createElement('div');
        drag.label.className = 'reorder-drag-label';
        drag.label.textContent = drag.text;
        document.body.append(drag.marker, drag.label);
        frame = requestAnimationFrame(tick);
      }
      updateTarget();
    }, { passive: false });
    document.addEventListener('pointerup', (event) => {
      if (drag?.pointerId === event.pointerId) finish(true);
    });
    document.addEventListener('pointercancel', () => finish());
    container.addEventListener('lostpointercapture', () => finish());
    container.addEventListener('dragstart', (event) => {
      if (drag) event.preventDefault();
    });
    for (const type of ['click', 'dblclick']) {
      container.addEventListener(type, (event) => {
        if (performance.now() < suppressClickUntil) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drag) {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish();
      }
    }, true);
    window.addEventListener('blur', () => finish());
  }

  return { reorderVisibleItems, installPointerReorder };
}));
