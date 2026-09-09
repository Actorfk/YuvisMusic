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
    const settling = new Set();
    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function animate(element, keyframes, onFinish = () => {}) {
      if (reducedMotion()) return onFinish();
      const animation = element.animate(keyframes, { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      settling.add(animation);
      animation.finished.catch(() => {}).finally(() => {
        settling.delete(animation);
        animation.cancel();
        onFinish();
      });
    }

    // Translated rows must keep their original hit areas while making room for the drop.
    function layoutRect(row) {
      const rect = row.getBoundingClientRect();
      const transform = getComputedStyle(row).transform;
      const offset = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
      return { left: rect.left, top: rect.top - offset, bottom: rect.bottom - offset, width: rect.width, height: rect.height };
    }

    function previewRows(rows, destination) {
      for (const row of rows) {
        const key = keyOfRow(row);
        const index = drag.indexByKey.get(key);
        row.classList.toggle('reorder-source', key === drag.sourceKey);
        if (!drag.rowStyles.has(row)) drag.rowStyles.set(row, row.style.transform);
        row.classList.add('reorder-shifting');
        let offset = 0;
        if (destination > drag.sourceIndex && index > drag.sourceIndex && index <= destination) offset = -drag.rowStep;
        else if (destination < drag.sourceIndex && index >= destination && index < drag.sourceIndex) offset = drag.rowStep;
        const transform = `translateY(${offset}px)`;
        if (row.style.transform !== transform) row.style.transform = transform;
      }
      // Virtual scrolling replaces rows; do not retain detached DOM for the whole drag.
      for (const row of drag.rowStyles.keys()) if (!row.isConnected) drag.rowStyles.delete(row);
    }

    function finish(commit = false) {
      if (!drag) return;
      const completed = drag;
      const previousRects = new Map([...container.querySelectorAll(rowSelector)].map((row) => [keyOfRow(row), row.getBoundingClientRect()]));
      const transitions = new Map();
      drag = null;
      cancelAnimationFrame(frame);
      if (container.hasPointerCapture(completed.pointerId)) container.releasePointerCapture(completed.pointerId);
      completed.marker?.remove();
      for (const [row, transform] of completed.rowStyles || []) {
        transitions.set(row, row.style.transition);
        row.style.transition = 'none';
        row.classList.remove('reorder-source', 'reorder-shifting');
        row.style.transform = transform;
      }
      document.body.classList.remove('list-reordering');
      if (completed.started) {
        suppressClickUntil = performance.now() + 350;
        if (commit && completed.target) onMove(completed.context, completed.sourceKey, completed.target.key, completed.target.after);
        const rows = [...container.querySelectorAll(rowSelector)];
        const finalRects = new Map(rows.map((row) => [keyOfRow(row), row.getBoundingClientRect()]));
        for (const row of rows) {
          const key = keyOfRow(row);
          const previous = previousRects.get(key);
          const rect = finalRects.get(key);
          if (key === completed.sourceKey) {
            animate(row, [{ opacity: .3 }, { opacity: 1 }]);
          } else if (previous && Math.abs(previous.top - rect.top) > .5) {
            animate(row, [{ transform: `translateY(${previous.top - rect.top}px)` }, { transform: 'translateY(0)' }]);
          }
        }
        const rect = finalRects.get(completed.sourceKey);
        const viewport = scroller.getBoundingClientRect();
        const visible = rect && rect.bottom > viewport.top && rect.top < viewport.bottom;
        const from = completed.preview.style.transform;
        const to = visible ? `translate3d(${rect.left}px, ${rect.top}px, 0)` : from;
        completed.preview.classList.add('reorder-settling');
        animate(completed.preview, [
          { transform: from, opacity: .96, scale: '1.012' },
          { transform: to, opacity: 0, scale: visible ? '1' : '.97' }
        ], () => completed.preview.remove());
      }
      for (const [row, transition] of transitions) row.style.transition = transition;
    }

    function updateTarget() {
      if (!drag?.started) return;
      const bounds = container.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      const rows = [...container.querySelectorAll(rowSelector)];
      drag.target = null;
      drag.marker.hidden = true;
      if (drag.x < bounds.left || drag.x > bounds.right || drag.y < Math.max(bounds.top, viewport.top) || drag.y > Math.min(bounds.bottom, viewport.bottom)) {
        previewRows(rows, drag.sourceIndex);
        return;
      }
      const row = rows.find((item) => {
        const rect = layoutRect(item);
        return drag.y < rect.top + rect.height / 2;
      }) || rows.at(-1);
      if (!row) return;
      const rect = layoutRect(row);
      const after = drag.y >= rect.top + rect.height / 2;
      const insertion = drag.indexByKey.get(keyOfRow(row)) + (after ? 1 : 0);
      const destination = insertion - (insertion > drag.sourceIndex ? 1 : 0);
      const y = (after ? rect.bottom : rect.top) - (destination > drag.sourceIndex ? drag.rowStep : 0);
      if (y < viewport.top || y > viewport.bottom) {
        previewRows(rows, drag.sourceIndex);
        return;
      }
      drag.target = { key: keyOfRow(row), after };
      drag.marker.hidden = destination === drag.sourceIndex;
      Object.assign(drag.marker.style, { left: `${rect.left}px`, top: `${y - 1}px`, width: `${rect.width}px` });
      previewRows(rows, destination);
    }

    function tick(time) {
      if (!drag?.started) return;
      const rect = scroller.getBoundingClientRect();
      const elapsed = Math.min(32, time - (drag.lastTime || time - 16));
      drag.lastTime = time;
      const follow = reducedMotion() ? 1 : 1 - Math.exp(-elapsed / 35);
      const targetX = Math.max(4, Math.min(window.innerWidth - drag.width - 4, drag.x - drag.offsetX));
      const targetY = Math.max(4, Math.min(window.innerHeight - drag.height - 4, drag.y - drag.offsetY));
      drag.previewX += (targetX - drag.previewX) * follow;
      drag.previewY += (targetY - drag.previewY) * follow;
      drag.preview.style.transform = `translate3d(${drag.previewX}px, ${drag.previewY}px, 0)`;
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
      for (const animation of settling) animation.cancel();
      const rect = row.getBoundingClientRect();
      const keys = Array.isArray(context) ? context : context.ids;
      const indexByKey = new Map(keys.map((key, index) => [key, index]));
      const style = getComputedStyle(row);
      drag = {
        pointerId: event.pointerId, sourceKey: keyOfRow(row), context, sourceRow: row,
        sourceIndex: indexByKey.get(keyOfRow(row)), indexByKey, rowStyles: new Map(),
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
        offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
        width: rect.width, height: rect.height, previewX: rect.left, previewY: rect.top,
        rowStep: rect.height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0)
      };
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
        drag.preview = drag.sourceRow.cloneNode(true);
        drag.preview.classList.add('reorder-drag-preview');
        drag.preview.classList.remove('reorder-source', 'reorder-shifting');
        drag.preview.removeAttribute('id');
        drag.preview.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        drag.preview.inert = true;
        drag.preview.setAttribute('aria-hidden', 'true');
        Object.assign(drag.preview.style, { width: `${drag.width}px`, height: `${drag.height}px`, transform: `translate3d(${drag.previewX}px, ${drag.previewY}px, 0)` });
        document.body.append(drag.marker, drag.preview);
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
