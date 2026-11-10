import { api, canEdit, canAssign, canDelete } from './auth.js';
import { language, locales, t } from './common.js';

let state = { tasks: [], activity: [] };
let ratesData;
let pendingDeletion;
let moving = false;
let teamMembers = [];
const expandedDescriptions = new Set();
const page = document.body.dataset.page;
const locale = () => locales[language];
const dateText = (value) =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  );
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

// All task data is untrusted text: create nodes and assign textContent, never innerHTML.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function taskDescription(task) {
  const details = element('details', 'task-description');
  const summary = element('summary', '', t('task.description'));
  summary.setAttribute('aria-label', `${t('task.description')}: ${task.name}`);
  details.open = expandedDescriptions.has(task.id);
  details.append(summary, element('p', '', task.description));
  details.addEventListener('toggle', () => {
    if (!details.isConnected) return;
    if (details.open) expandedDescriptions.add(task.id);
    else expandedDescriptions.delete(task.id);
  });
  return details;
}
function assigneeLabel(task) {
  const label = element('p', 'task-assignee');
  if (!task.assignees?.length) {
    label.append(element('span', 'task-assignee-label', t('task.unassigned')));
    return label;
  }
  const names = task.assignees.map(
    (username) => teamMembers.find((user) => user.username === username)?.name || username,
  );
  label.append(
    element('span', 'task-assignee-label', `${t('task.assignedTo')}: `),
    element('span', '', names.join(', ')),
  );
  return label;
}
function taskRowDisclosure(task) {
  const disclosure = element('div', 'task-disclosure');
  const toggle = element('button', 'task-title task-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', `${t('task.description')}: ${task.name}`);
  const chevron = element('span', 'task-chevron', '▸');
  chevron.setAttribute('aria-hidden', 'true');
  toggle.append(chevron, element('span', '', task.name));

  const panel = element('div', 'task-description-panel');
  panel.id = `task-description-${task.id}`;
  toggle.setAttribute('aria-controls', panel.id);
  const clip = element('div', 'task-description-clip');
  clip.append(element('p', 'task-description-text', task.description));
  panel.append(clip);

  function setExpanded(expanded) {
    toggle.setAttribute('aria-expanded', String(expanded));
    panel.classList.toggle('is-open', expanded);
    panel.setAttribute('aria-hidden', String(!expanded));
    panel.inert = !expanded;
    if (expanded) expandedDescriptions.add(task.id);
    else expandedDescriptions.delete(task.id);
  }
  setExpanded(expandedDescriptions.has(task.id));
  toggle.addEventListener('click', () => {
    setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
  });
  disclosure.append(toggle, assigneeLabel(task), panel);
  return disclosure;
}
function feedback(message, error = false) {
  const target = document.querySelector('#task-feedback');
  if (target) {
    target.textContent = message;
    target.classList.toggle('is-error', error);
  }
}
async function refresh(propagate = false) {
  try {
    state = await api('/api/tasks');
    render();
  } catch (error) {
    feedback(error.message || t('network.error'), true);
    if (propagate) throw error;
  }
}
function statistics() {
  const completed = state.tasks.filter((task) => task.status === 'done').length;
  return {
    total: state.tasks.length,
    completed,
    pending: state.tasks.length - completed,
    overdue: state.tasks.filter((task) => task.status !== 'done' && task.dueDate < today()).length,
  };
}
function render() {
  const counts = statistics();
  document.querySelectorAll('[data-stat]').forEach((node) => {
    node.textContent = counts[node.dataset.stat];
    node.classList.toggle('has-tasks', counts[node.dataset.stat] > 0);
  });
  if (page === 'tasks') renderTable();
  if (page === 'analytics') renderAnalytics(counts);
  if (page === 'index') renderActivity();
}
function priorityBadge(priority) {
  return element('span', `badge-priority priority-${priority}`, t(`priority.${priority}`));
}
function actionButton(label, action, task, extra = '') {
  const button = element('button', `small-button ${extra}`, t(label));
  button.type = 'button';
  button.setAttribute('aria-label', `${t(label)}: ${task.name}`);
  button.addEventListener('click', () => action(task, button));
  return button;
}
function matchesStatus(task, status) {
  if (status === 'all') return true;
  if (status === 'pending') return task.status !== 'done';
  if (status === 'overdue') return task.status !== 'done' && task.dueDate < today();
  return task.status === status;
}
function filteredTasks() {
  const search = document.querySelector('#task-search').value.trim().toLocaleLowerCase(locale());
  const status = document.querySelector('#status-filter').value;
  const priority = document.querySelector('#priority-filter').value;
  const sort = document.querySelector('#sort-tasks').value;
  return state.tasks
    .filter(
      (task) =>
        matchesStatus(task, status) &&
        (priority === 'all' || task.priority === priority) &&
        `${task.name} ${task.description}`.toLocaleLowerCase(locale()).includes(search),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, locale())
        : a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, locale()),
    );
}
function renderTable() {
  const body = document.querySelector('#task-table-body');
  const fragment = document.createDocumentFragment();
  const tasks = filteredTasks();
  const selectedStatus = document.querySelector('#status-filter').value;
  const categoryOnly =
    !document.querySelector('#task-search').value.trim() &&
    document.querySelector('#priority-filter').value === 'all';
  document.querySelectorAll('[data-task-filter]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(categoryOnly && button.dataset.taskFilter === selectedStatus),
    );
  });
  for (const task of tasks) {
    const row = element('tr', 'task-row');
    const detail = element('td');
    const disclosure = taskRowDisclosure(task);
    detail.append(disclosure);
    row.addEventListener('click', (event) => {
      if (
        event.target.closest(
          'button, a, input, select, textarea, summary, [role="button"], [contenteditable="true"]',
        ) ||
        window.getSelection()?.toString()
      )
        return;
      disclosure.querySelector('.task-toggle').click();
    });
    const due = element('td', 'task-date', dateText(task.dueDate));
    if (task.status !== 'done' && task.dueDate < today()) due.classList.add('is-error');
    const priority = element('td');
    priority.append(priorityBadge(task.priority));
    const status = element('td');
    status.append(
      element('span', `badge-status status-${task.status}`, t(`status.${task.status}`)),
    );
    const controls = element('td');
    const actions = element('div', 'task-actions');
    if (canEdit()) {
      const deletion = actionButton('task.delete', openDelete, task, 'delete');
      deletion.disabled = !canDelete();
      if (deletion.disabled) deletion.title = t('auth.deleteAdmin');
      actions.append(actionButton('task.edit', openTask, task), deletion);
    }
    if (canEdit() && task.status !== 'done')
      actions.append(actionButton('task.complete', completeTask, task));
    controls.append(actions);
    row.append(detail, due, priority, status);
    if (canEdit()) row.append(controls);
    fragment.append(row);
  }
  body.replaceChildren(fragment);
  const empty = document.querySelector('#tasks-empty');
  empty.hidden = tasks.length > 0;
  empty.querySelector('h3').textContent = state.tasks.length
    ? t('task.noMatches')
    : t('task.empty');
  empty.querySelector('p').hidden = state.tasks.length > 0;
  empty.querySelector('p').textContent = t(canEdit() ? 'task.emptyText' : 'task.emptyViewer');
}
function setAssignmentOpen(open) {
  document.querySelector('#assignee-options').hidden = !open;
  document.querySelector('#task-assignee').setAttribute('aria-expanded', String(open));
}
function updateAssignmentLabel() {
  const names = [...document.querySelectorAll('#assignee-options input:checked')].map(
    (input) => teamMembers.find((user) => user.username === input.value)?.name || input.value,
  );
  document.querySelector('#assignee-selection').textContent = names.length
    ? names.join(', ')
    : t('task.unassigned');
  document.querySelector('#assignee-selection').classList.toggle('is-placeholder', !names.length);
}
function openTask(task) {
  if (!canEdit()) return;
  const form = document.querySelector('#task-form');
  form.reset();
  const options = document.querySelector('#assignee-options');
  options.replaceChildren();
  for (const user of teamMembers) {
    const label = element('label', 'assignee-option');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'assignees';
    checkbox.value = user.username;
    checkbox.checked = task?.assignees?.includes(user.username) || false;
    checkbox.disabled = !canAssign();
    checkbox.addEventListener('change', updateAssignmentLabel);
    label.append(checkbox, element('span', '', user.name));
    options.append(label);
  }
  document.querySelector('#task-assignee').disabled = !canAssign();
  setAssignmentOpen(false);
  updateAssignmentLabel();
  form.querySelectorAll('[required]').forEach((input) => input.setCustomValidity(''));
  for (const field of ['id', 'name', 'description', 'dueDate', 'priority', 'status'])
    form.elements[field].value =
      task?.[field] ?? ({ priority: 'medium', status: 'todo', dueDate: today() }[field] || '');
  document.querySelector('#task-dialog-title').textContent = t(task?.id ? 'task.edit' : 'task.add');
  document.querySelector('#task-form-status').textContent = '';
  document.querySelector('#task-dialog').showModal();
}
function openDelete(task) {
  if (!canDelete()) return;
  pendingDeletion = task.id;
  document.querySelector('#delete-name').textContent = task.name;
  document.querySelector('#delete-status').textContent = '';
  document.querySelector('#delete-dialog').showModal();
}
async function completeTask(task, button) {
  if (!canEdit()) return;
  button.disabled = true;
  try {
    await api(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    });
    await refresh(true);
    feedback(t('task.saved'));
  } catch (error) {
    feedback(error.message, true);
    button.disabled = false;
  }
}
function transientScrollbar(element, scrollTarget = element) {
  let idleTimer;
  element.classList.add('auto-scrollbar');
  scrollTarget.addEventListener(
    'scroll',
    () => {
      element.classList.add('is-scrolling');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => element.classList.remove('is-scrolling'), 850);
    },
    { passive: true },
  );
}
function initializeTasks() {
  transientScrollbar(document.documentElement, document);
  transientScrollbar(document.querySelector('.task-panel .table-responsive'));
  document.querySelector('#task-assignee').addEventListener('click', (event) => {
    if (canAssign())
      setAssignmentOpen(event.currentTarget.getAttribute('aria-expanded') !== 'true');
  });
  document.querySelector('.assignment-field').addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('#assignee-options').hidden) {
      event.preventDefault();
      event.stopPropagation();
      setAssignmentOpen(false);
      document.querySelector('#task-assignee').focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.assignment-field')) setAssignmentOpen(false);
  });
  document.querySelectorAll('[data-task-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector('#status-filter').value = button.dataset.taskFilter;
      document.querySelector('#task-search').value = '';
      document.querySelector('#priority-filter').value = 'all';
      renderTable();
    });
  });
  document.querySelector('#add-task').addEventListener('click', () => openTask());
  for (const id of ['task-search', 'status-filter', 'priority-filter', 'sort-tasks'])
    document
      .querySelector(`#${id}`)
      .addEventListener(id === 'task-search' ? 'input' : 'change', renderTable);
  const form = document.querySelector('#task-form');
  form.addEventListener('input', (event) => event.target.setCustomValidity?.(''));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canEdit()) return;
    for (const field of form.querySelectorAll('[required]'))
      field.setCustomValidity(field.value.trim() ? '' : t('form.required'));
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const input = Object.fromEntries(formData);
    if (canAssign()) input.assignees = formData.getAll('assignees');
    else delete input.assignees;
    const id = input.id;
    delete input.id;
    const status = document.querySelector('#task-form-status');
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = t('task.saving');
    status.classList.remove('is-error');
    try {
      await api(id ? `/api/tasks/${id}` : '/api/tasks', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(input),
      });
      document.querySelector('#task-dialog').close();
      await refresh(true);
      feedback(t('task.saved'));
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('is-error');
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector('#confirm-delete').addEventListener('click', async (event) => {
    if (!canDelete()) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api(`/api/tasks/${pendingDeletion}`, { method: 'DELETE' });
      document.querySelector('#delete-dialog').close();
      await refresh(true);
      feedback(t('task.deleted'));
    } catch (error) {
      document.querySelector('#delete-status').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
function renderAnalytics(counts) {
  const chart = document.querySelector('#status-chart');
  chart.replaceChildren();
  const chartDescription = [];
  for (const [status, count] of [
    ['pending', counts.pending],
    ['completed', counts.completed],
  ]) {
    const row = element('div', 'chart-row');
    const track = element('div', 'chart-track');
    const fill = element('div', `chart-fill ${status === 'completed' ? 'done' : ''}`);
    fill.style.width = `${counts.total ? (count / counts.total) * 100 : 0}%`;
    track.append(fill);
    row.append(element('span', '', t(`stat.${status}`)), track, element('strong', '', count));
    chart.append(row);
    chartDescription.push(`${t(`stat.${status}`)}: ${count}`);
  }
  chart.setAttribute('aria-label', chartDescription.join(', '));
  const percentage = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  document.querySelector('#completion-number').textContent = `${percentage}%`;
  document.querySelector('#completion-progress').value = percentage;
  document.querySelector('#completion-progress').textContent = `${percentage}%`;
  const upcoming = document.querySelector('#upcoming-tasks');
  upcoming.replaceChildren();
  const next = state.tasks
    .filter((task) => task.status !== 'done')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  if (!next.length) upcoming.append(element('li', 'muted', t('upcoming.empty')));
  for (const task of next) {
    const item = element('li', '', task.name);
    const time = element('time', '', dateText(task.dueDate));
    time.dateTime = task.dueDate;
    item.append(time);
    upcoming.append(item);
  }
  renderBoard();
}
async function moveTask(id, status) {
  if (!canEdit()) return;
  if (moving) {
    renderBoard();
    return;
  }
  moving = true;
  try {
    await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await refresh(true);
    feedback(t('task.saved'));
  } catch (error) {
    feedback(error.message, true);
    renderBoard();
  } finally {
    moving = false;
  }
}
function renderBoard() {
  const board = document.querySelector('#kanban-board');
  board.replaceChildren();
  for (const status of ['todo', 'doing', 'done']) {
    const tasks = state.tasks
      .filter((task) => task.status === status)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const column = element('section', 'board-column');
    column.dataset.status = status;
    const heading = element('h3', '', t(`status.${status}`));
    heading.append(element('span', '', tasks.length));
    column.append(heading);
    column.addEventListener('dragover', (event) => {
      if (!canEdit()) return;
      event.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', (event) => {
      if (!column.contains(event.relatedTarget)) column.classList.remove('drag-over');
    });
    column.addEventListener('drop', (event) => {
      if (!canEdit()) return;
      event.preventDefault();
      column.classList.remove('drag-over');
      const id = event.dataTransfer.getData('text/plain');
      if (state.tasks.some((task) => task.id === id && task.status !== status))
        moveTask(id, status);
    });
    if (!tasks.length) column.append(element('p', 'board-empty muted', t('board.empty')));
    for (const task of tasks) {
      const card = element('article', 'board-card');
      card.draggable = canEdit();
      card.dataset.taskId = task.id;
      card.addEventListener('dragstart', (event) => {
        if (!canEdit()) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData('text/plain', task.id);
        event.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      const time = element('time', '', dateText(task.dueDate));
      time.dateTime = task.dueDate;
      const label = element('label', '', t('task.move'));
      label.htmlFor = `move-${task.id}`;
      const select = element('select', 'form-select');
      select.id = label.htmlFor;
      select.setAttribute('aria-label', `${t('task.move')}: ${task.name}`);
      for (const value of ['todo', 'doing', 'done']) {
        const option = element('option', '', t(`status.${value}`));
        option.value = value;
        option.selected = value === status;
        select.append(option);
      }
      select.addEventListener('change', () => {
        select.disabled = true;
        moveTask(task.id, select.value);
      });
      card.append(
        priorityBadge(task.priority),
        element('h4', '', task.name),
        assigneeLabel(task),
        taskDescription(task),
        time,
      );
      if (canEdit()) card.append(label, select);
      column.append(card);
    }
    board.append(column);
  }
}
function renderActivity() {
  const list = document.querySelector('#activity-list');
  list.replaceChildren();
  if (!state.activity.length) list.append(element('li', 'muted', t('activity.empty')));
  for (const activity of state.activity.slice(0, 6)) {
    const item = element('li');
    const time = element(
      'time',
      '',
      new Intl.DateTimeFormat(locale(), {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Athens',
      }).format(new Date(activity.at)),
    );
    time.dateTime = activity.at;
    item.append(
      element('span', 'activity-action', t(`activity.${activity.action}`)),
      element('span', '', activity.name),
      time,
    );
    list.append(item);
  }
}
function renderRates() {
  const target = document.querySelector('#rates');
  target.replaceChildren();
  if (!ratesData) return;
  for (const rate of ratesData) {
    target.append(
      element(
        'div',
        'exchange-rate',
        new Intl.NumberFormat(locale(), {
          style: 'currency',
          currency: rate.quote,
          minimumFractionDigits: 4,
        }).format(rate.rate),
      ),
    );
    target.append(element('p', 'rate-date', t('rates.date') + ': ' + dateText(rate.date)));
  }
  target.append(element('p', '', t('rates.note')));
}
async function loadRates() {
  const target = document.querySelector('#rates');
  const button = document.querySelector('#refresh-rates');
  button.disabled = true;
  target.textContent = t('rates.loading');
  try {
    const response = await fetch('https://api.frankfurter.dev/v2/rates?base=EUR&quotes=USD,GBP', {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Rates unavailable');
    const data = await response.json();
    if (
      !Array.isArray(data) ||
      data.length !== 2 ||
      data.some(
        (row) =>
          !['USD', 'GBP'].includes(row.quote) ||
          !Number.isFinite(row.rate) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(row.date),
      )
    )
      throw new Error('Invalid rates');
    ratesData = data;
    renderRates();
  } catch {
    ratesData = undefined;
    target.textContent = t('rates.unavailable');
  } finally {
    button.disabled = false;
  }
}
export async function initializeWorkspace() {
  document.addEventListener('workspacechange', () => refresh());
  if (['tasks', 'analytics'].includes(page)) teamMembers = (await api('/api/users')).users;
  if (page === 'tasks') initializeTasks();
  document.addEventListener('languagechange', () => {
    render();
    if (page === 'index' && ratesData) renderRates();
  });
  window.addEventListener('focus', () => {
    if (!document.querySelector('dialog[open]')) refresh();
  });
  await refresh();
  if (page === 'index') {
    document.querySelector('#refresh-rates').addEventListener('click', loadRates);
    loadRates();
  }
}
