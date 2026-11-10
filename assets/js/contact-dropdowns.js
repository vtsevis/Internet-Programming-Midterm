import { t } from './common.js';

// Keep native selects for FormData and constraint validation; present an anchored menu.
export function initializeContactDropdowns(form) {
  const controls = [];
  let opened;
  const normalize = (text) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase();

  for (const select of form.querySelectorAll('select')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'contact-dropdown';
    select.before(wrapper);
    wrapper.append(select);
    select.hidden = true;
    const label = form.querySelector(`label[for="${select.id}"]`);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = `${select.id}-trigger`;
    trigger.className = 'form-select contact-dropdown-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    if (label) label.htmlFor = trigger.id;
    const panel = document.createElement('div');
    panel.className = 'contact-dropdown-panel';
    panel.hidden = true;
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'contact-dropdown-search';
    search.autocomplete = 'off';
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('aria-expanded', 'true');
    const list = document.createElement('div');
    list.id = `${select.id}-options`;
    list.className = 'contact-dropdown-options';
    list.setAttribute('role', 'listbox');
    trigger.setAttribute('aria-controls', list.id);
    search.setAttribute('aria-controls', list.id);
    const empty = document.createElement('p');
    empty.className = 'contact-dropdown-empty';
    empty.setAttribute('role', 'status');
    const error = document.createElement('p');
    error.id = `${select.id}-error`;
    error.className = 'contact-dropdown-error';
    error.hidden = true;
    trigger.setAttribute('aria-describedby', error.id);
    panel.append(search, list, empty);
    wrapper.append(trigger, panel, error);
    let visible = [];
    let active = -1;
    let typeAhead = '';
    let typedAt = 0;

    function highlight(index) {
      if (!visible.length) return;
      active = (index + visible.length) % visible.length;
      for (const [position, option] of visible.entries())
        option.classList.toggle('is-active', position === active);
      const option = visible[active];
      trigger.setAttribute('aria-activedescendant', option.id);
      search.setAttribute('aria-activedescendant', option.id);
      const offset = option.offsetTop - list.offsetTop;
      if (offset < list.scrollTop) list.scrollTop = offset;
      else if (offset + option.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = offset + option.offsetHeight - list.clientHeight;
    }
    function close(focus = false) {
      panel.hidden = true;
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      search.removeAttribute('aria-activedescendant');
      if (opened === control) opened = undefined;
      if (focus) trigger.focus({ preventScroll: true });
    }
    function choose(value) {
      select.value = value;
      select.setCustomValidity('');
      close(true);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      refreshAll();
    }
    function render() {
      list.replaceChildren();
      const query = normalize(search.value);
      visible = [];
      for (const [index, source] of [...select.options].entries()) {
        if (source.disabled || (query && !normalize(source.textContent).includes(query))) continue;
        const option = document.createElement('div');
        option.id = `${select.id}-option-${index}`;
        option.className = 'contact-dropdown-option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(source.selected));
        option.dataset.value = source.value;
        option.textContent = source.textContent;
        option.addEventListener('pointerdown', (event) => event.preventDefault());
        option.addEventListener('click', () => choose(source.value));
        list.append(option);
        visible.push(option);
      }
      empty.textContent = t('contactForm.noOptions');
      empty.hidden = visible.length > 0;
      active = -1;
      highlight(
        Math.max(
          0,
          visible.findIndex((option) => option.dataset.value === select.value),
        ),
      );
    }
    function fitBelow() {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const viewportTop = viewport?.offsetTop ?? 0;
      const headerBottom =
        document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 95;
      const safeTop = Math.max(viewportTop, headerBottom) + 12;
      const anchor = trigger.getBoundingClientRect();
      panel.style.maxHeight = `${Math.max(100, Math.min(340, height + viewportTop - safeTop - anchor.height - 28))}px`;
      const overflow = panel.getBoundingClientRect().bottom - (viewportTop + height - 16);
      const delta =
        anchor.top < safeTop
          ? anchor.top - safeTop
          : Math.min(Math.max(0, overflow), anchor.top - safeTop);
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'smooth' });
      highlight(active);
    }
    function open() {
      if (select.disabled) return;
      opened?.close();
      opened = control;
      search.value = '';
      search.hidden = select.options.length < 10;
      panel.hidden = false;
      wrapper.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      render();
      fitBelow();
      if (!search.hidden) search.focus({ preventScroll: true });
    }
    function refresh() {
      trigger.textContent = select.selectedOptions[0]?.textContent ?? '';
      trigger.disabled = select.disabled;
      trigger.setAttribute('aria-required', String(select.required));
      list.setAttribute('aria-label', label?.textContent.trim() ?? select.name);
      search.placeholder = t('contactForm.searchOptions');
      search.setAttribute(
        'aria-label',
        `${t('contactForm.searchOptions')}: ${label?.textContent.trim() ?? select.name}`,
      );
      if (select.validity.valid) {
        error.hidden = true;
        trigger.removeAttribute('aria-invalid');
      }
      if (select.disabled || wrapper.closest('[hidden]')) close();
      else if (!panel.hidden) render();
    }
    const control = { close, refresh, fitBelow };
    controls.push(control);
    trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
    search.addEventListener('input', (event) => {
      event.stopPropagation();
      render();
      highlight(0);
    });
    wrapper.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') return close();
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault();
        return close(true);
      }
      if (
        ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key) ||
        (event.key === ' ' && event.target === trigger)
      ) {
        event.preventDefault();
        if (panel.hidden) return open();
        if (event.key === 'Enter' || event.key === ' ') {
          if (visible[active]) choose(visible[active].dataset.value);
        } else if (event.key === 'Home') highlight(0);
        else if (event.key === 'End') highlight(visible.length - 1);
        else highlight(active + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (
        event.target === trigger &&
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (panel.hidden) open();
        if (!search.hidden) {
          search.value += event.key;
          render();
          highlight(0);
        } else {
          typeAhead = Date.now() - typedAt > 700 ? event.key : typeAhead + event.key;
          typedAt = Date.now();
          const index = visible.findIndex((option) =>
            normalize(option.textContent).startsWith(normalize(typeAhead)),
          );
          if (index >= 0) highlight(index);
        }
      }
    });
    select.addEventListener('invalid', (event) => {
      event.preventDefault();
      error.textContent = select.validity.valueMissing
        ? t('form.required')
        : t('form.invalidField');
      error.hidden = false;
      trigger.setAttribute('aria-invalid', 'true');
      if (form.querySelector('input:invalid, select:invalid, textarea:invalid') === select) {
        trigger.focus({ preventScroll: true });
        open();
      }
    });
    wrapper.addEventListener('focusout', (event) => {
      if (!wrapper.contains(event.relatedTarget)) close();
    });
  }
  function refreshAll() {
    for (const control of controls) control.refresh();
  }
  form.addEventListener('change', refreshAll);
  form.addEventListener('reset', () => queueMicrotask(refreshAll));
  document.addEventListener('languagechange', refreshAll);
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.contact-dropdown.is-open')) opened?.close();
  });
  window.addEventListener('resize', () => opened?.fitBelow());
  window.visualViewport?.addEventListener('resize', () => opened?.fitBelow());
  const observer = new MutationObserver(refreshAll);
  for (const select of form.querySelectorAll('select'))
    observer.observe(select, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['disabled', 'required'],
    });
  refreshAll();
}
