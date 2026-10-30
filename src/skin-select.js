// The skin's dropdown lists. In the skinned (kit) layout every <select> keeps its real element, which
// holds the value and tells the app about changes, but its open list is drawn by the page in the
// skin's colors, frame and lettering, the same in every browser.
// Pointer: press the field to open, choose an entry (or press, drag and release on it). Keyboard:
// Enter, Space or the arrows open it; arrows, Home/End and Page Up/Down move; typing jumps to an
// entry; Enter or Space chooses; Escape or Tab leaves the value as it was.

const PAGE = 8;

export function installSkinSelect() {
  if (typeof document === 'undefined' || typeof HTMLSelectElement === 'undefined') return;
  const list = document.createElement('div');
  list.className = 'skin-select-list';
  list.id = 'skin-select-list';
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  // In the top layer when the browser has popovers, so no window or panel can clip it.
  const popover = typeof list.showPopover === 'function';
  if (popover) list.popover = 'manual';
  document.body.append(list);

  let current = null; // { select, items: [{ el, option }], active, typed, typedAt, observer }

  const skinned = select => select instanceof HTMLSelectElement && document.documentElement.dataset.layout === 'kit'
    && !!select.closest('.app-shell') && !select.multiple && select.size <= 1 && !select.disabled;
  const enabled = item => !!item && !item.option.disabled && !item.option.closest('optgroup')?.disabled;

  function render(select) {
    list.replaceChildren();
    const items = [];
    const add = option => {
      if (option.hidden) return;
      const el = document.createElement('div');
      el.className = 'skin-select-option';
      el.id = `skin-select-option-${items.length}`;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(option.selected));
      if (option.disabled || option.closest('optgroup')?.disabled) el.setAttribute('aria-disabled', 'true');
      el.dataset.index = String(items.length);
      el.textContent = option.label || option.text;
      list.append(el);
      items.push({ el, option });
    };
    for (const child of select.children) {
      if (child instanceof HTMLOptGroupElement) {
        const group = document.createElement('div');
        group.className = 'skin-select-group'; group.setAttribute('role', 'presentation'); group.textContent = child.label;
        list.append(group);
        for (const option of child.children) if (option instanceof HTMLOptionElement) add(option);
      } else if (child instanceof HTMLOptionElement) add(child);
    }
    return items;
  }

  // Under the field, or above it when there's more room there; never past the window's edges.
  function place(select) {
    const r = select.getBoundingClientRect(), gap = 2, margin = 8;
    list.style.minWidth = `${Math.round(r.width)}px`;
    list.style.maxHeight = 'none';
    const natural = list.offsetHeight, below = innerHeight - r.bottom - gap - margin, above = r.top - gap - margin;
    const down = natural <= below || below >= above, room = Math.max(48, Math.floor(down ? below : above));
    list.style.maxHeight = `${room}px`;
    const height = Math.min(natural, room);
    list.style.top = `${Math.round(down ? r.bottom + gap : r.top - gap - height)}px`;
    list.style.left = `${Math.round(Math.max(margin, Math.min(r.left, innerWidth - list.offsetWidth - margin)))}px`;
  }

  function setActive(index, scroll = true) {
    if (!current) return;
    current.items[current.active]?.el.classList.remove('active');
    current.active = index;
    const item = current.items[index];
    if (!item) { list.removeAttribute('aria-activedescendant'); return; }
    item.el.classList.add('active');
    list.setAttribute('aria-activedescendant', item.el.id);
    if (scroll) item.el.scrollIntoView({ block: 'nearest' });
  }

  function open(select) {
    close(false);
    const items = render(select);
    if (!items.length) return;
    const name = select.getAttribute('aria-label') || select.labels?.[0]?.textContent?.trim() || '';
    list.setAttribute('aria-label', name ? `${name} choices` : 'Choices');
    if (popover) list.showPopover(); else list.classList.add('open');
    place(select);
    // The app can redraw or remove the field while the list is open: the list goes with it.
    const observer = new MutationObserver(() => { if (current && (!current.select.isConnected || current.select.disabled)) close(false); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    current = { select, items, active: -1, typed: '', typedAt: 0, observer };
    select.setAttribute('aria-expanded', 'true');
    select.setAttribute('aria-controls', list.id);
    const chosen = items.findIndex(item => item.option.selected);
    setActive(chosen >= 0 ? chosen : items.findIndex(enabled));
    list.focus({ preventScroll: true });
  }

  function close(refocus = true) {
    if (!current) return;
    const { select, observer } = current;
    current = null;
    observer.disconnect();
    if (popover) { if (list.matches(':popover-open')) list.hidePopover(); } else list.classList.remove('open');
    list.replaceChildren();
    list.removeAttribute('aria-activedescendant');
    select.removeAttribute('aria-expanded');
    if (refocus && select.isConnected) select.focus({ preventScroll: true });
  }

  // The chosen entry becomes the field's value, and the app hears about it as from the browser's own list.
  function choose(index) {
    const item = current?.items[index];
    if (!enabled(item)) return;
    const { select } = current, { option } = item;
    close();
    if (!option.isConnected || option.closest('select') !== select || option.selected) return;
    option.selected = true;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const step = (from, dir) => { const { items } = current; for (let i = from + dir; i >= 0 && i < items.length; i += dir) if (enabled(items[i])) return i; return from; };
  const first = dir => { const { items } = current, order = [...items.keys()]; if (dir < 0) order.reverse(); return order.find(i => enabled(items[i])) ?? -1; };
  function type(ch) {
    const now = performance.now();
    current.typed = now - current.typedAt < 700 ? current.typed + ch.toLowerCase() : ch.toLowerCase();
    current.typedAt = now;
    const { items, active, typed } = current;
    // The same letter again moves on to the next entry with it, as in the browser's own lists.
    const again = [...typed].every(c => c === typed[0]), needle = again ? typed[0] : typed, start = again ? active + 1 : Math.max(0, active);
    for (let k = 0; k < items.length; k++) {
      const i = (start + k) % items.length;
      if (enabled(items[i]) && items[i].el.textContent.trim().toLowerCase().startsWith(needle)) { setActive(i); return; }
    }
  }

  // A press on a field opens the skin's list instead of the browser's; a press anywhere else closes it.
  document.addEventListener('mousedown', event => {
    const target = event.target instanceof Element ? event.target : null;
    const select = target?.closest('select');
    if (current && !list.contains(target) && select !== current.select) close(false);
    if (!select || !skinned(select) || event.button !== 0) return;
    event.preventDefault();
    if (current?.select === select) { close(); return; }
    select.focus({ preventScroll: true });
    open(select);
  }, true);
  document.addEventListener('keydown', event => {
    if (current || !(event.target instanceof HTMLSelectElement) || !skinned(event.target) || event.ctrlKey || event.metaKey) return;
    if (!['Enter', ' ', 'ArrowDown', 'ArrowUp', 'F4'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    open(event.target);
  }, true);

  list.addEventListener('keydown', event => {
    if (!current) return;
    const { active } = current;
    let handled = true;
    if (event.key === 'ArrowDown') setActive(step(active, 1));
    else if (event.key === 'ArrowUp') setActive(step(active, -1));
    else if (event.key === 'Home') setActive(first(1));
    else if (event.key === 'End') setActive(first(-1));
    else if (event.key === 'PageDown' || event.key === 'PageUp') { let i = active; for (let k = 0; k < PAGE; k++) i = step(i, event.key === 'PageDown' ? 1 : -1); setActive(i); }
    else if (event.key === 'Enter') choose(active);
    else if (event.key === ' ') { if (current.typed && performance.now() - current.typedAt < 700) type(' '); else choose(active); }
    else if (event.key === 'Escape' || event.key === 'Tab') close();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) type(event.key);
    else handled = false;
    if (handled) event.preventDefault();
    // Keys meant for the list never reach the page's shortcuts (Space plays, arrows nudge, A/B…).
    event.stopPropagation();
  });
  list.addEventListener('mousedown', event => event.preventDefault()); // focus stays in the list
  list.addEventListener('mousemove', event => {
    const el = event.target instanceof Element ? event.target.closest('.skin-select-option') : null;
    if (!el || !current) return;
    const index = Number(el.dataset.index);
    if (index !== current.active && enabled(current.items[index])) setActive(index, false);
  });
  list.addEventListener('mouseup', event => {
    const el = event.target instanceof Element ? event.target.closest('.skin-select-option') : null;
    if (el && current && event.button === 0) choose(Number(el.dataset.index));
  });
  list.addEventListener('focusout', event => { if (current && !list.contains(event.relatedTarget)) close(false); });
  addEventListener('scroll', event => { if (current && !list.contains(event.target)) close(false); }, true);
  addEventListener('resize', () => close(false));
}
