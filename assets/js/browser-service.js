// This is a browser demonstration, not an authentication or authorization boundary.
import { validateTask, validateEnquiry } from './browser-validation.js';

export const storageKey = 'idx-submission-workspace-v1';
export const sessionKey = 'idx-submission-session-v1';
export const accounts = Object.freeze([
  { username: 'vtsevis', name: 'Vasileios Tsevis', role: 'admin' },
  { username: 'admin', name: 'Admin', role: 'admin' },
  { username: 'lmageiros', name: 'Leonardos Mageiros', role: 'viewer' },
  ...[1, 2, 3, 4].map((number) => ({
    username: `user${number}`,
    name: `User${number}`,
    role: 'member',
  })),
]);
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail = (message, status = 400, code) => {
  throw Object.assign(new Error(message), { status, code });
};

function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getSaved(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return fail('Browser storage is unavailable. Allow site storage to use the demo.', 507);
  }
}

function putSaved(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    fail('The browser could not save this change. Check available site storage.', 507);
  }
}

function validateState(input) {
  if (
    !input ||
    input.version !== 1 ||
    !Array.isArray(input.tasks) ||
    input.tasks.length > 2000 ||
    !Array.isArray(input.activity) ||
    input.activity.length > 100 ||
    !Array.isArray(input.enquiries) ||
    input.enquiries.length > 100
  )
    fail('Invalid workspace backup.');
  const ids = new Set();
  const tasks = input.tasks.map((task) => {
    if (!task || typeof task.id !== 'string' || !uuidPattern.test(task.id) || ids.has(task.id))
      fail('Invalid or duplicate task identifier.');
    ids.add(task.id);
    const clean = validateTask(task);
    validateAssignees(clean);
    if (!Number.isFinite(Date.parse(task.createdAt))) fail('Invalid task date.');
    return {
      ...clean,
      id: task.id,
      createdAt: task.createdAt,
      ...(task.updatedAt && Number.isFinite(Date.parse(task.updatedAt))
        ? { updatedAt: task.updatedAt }
        : {}),
    };
  });
  const activity = input.activity.map((entry) => {
    if (
      !entry ||
      !uuidPattern.test(entry.id) ||
      !uuidPattern.test(entry.taskId) ||
      !['added', 'updated', 'moved', 'completed', 'deleted'].includes(entry.action) ||
      typeof entry.name !== 'string' ||
      !entry.name ||
      entry.name.length > 120 ||
      !Number.isFinite(Date.parse(entry.at))
    )
      fail('Invalid activity record.');
    return {
      id: entry.id,
      taskId: entry.taskId,
      action: entry.action,
      name: entry.name,
      at: entry.at,
    };
  });
  const enquiries = input.enquiries.map((enquiry) => {
    if (
      !enquiry ||
      !uuidPattern.test(enquiry.id) ||
      !Number.isFinite(Date.parse(enquiry.createdAt))
    )
      fail('Invalid enquiry record.');
    return { ...validateEnquiry(enquiry), id: enquiry.id, createdAt: enquiry.createdAt };
  });
  return { version: 1, tasks, activity, enquiries };
}

function readState() {
  const raw = getSaved(localStorage, storageKey);
  if (raw === null) return { version: 1, tasks: [], activity: [], enquiries: [] };
  try {
    return validateState(JSON.parse(raw));
  } catch {
    return fail(
      'Saved demo data is invalid. Export a backup before clearing this site’s storage.',
      409,
    );
  }
}

function readSession() {
  const raw = getSaved(sessionStorage, sessionKey);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    return saved.expires > Date.now()
      ? accounts.find((account) => account.username === saved.username)
      : null;
  } catch {
    return null;
  }
}

function requireAccount() {
  return readSession() || fail('Choose a demo account to access the workspace.', 401);
}

function requireEditor(account) {
  if (account.role === 'viewer') fail('This account has view-only access.', 403, 'READ_ONLY');
}

function requireAdmin() {
  const account = requireAccount();
  if (account.role !== 'admin')
    fail('Only an administrator can perform this action.', 403, 'ADMIN_ONLY');
  return account;
}

function validateAssignees(input) {
  if (Object.hasOwn(input, 'assignee')) fail('Use the multiple-user assignment selector.');
  if (
    input.assignees !== undefined &&
    (!Array.isArray(input.assignees) ||
      input.assignees.some(
        (name) =>
          typeof name !== 'string' ||
          !accounts.some(
            (account) =>
              account.role !== 'viewer' && account.username === name.trim().toLowerCase(),
          ),
      ))
  )
    fail('Choose active team members.');
}

function record(state, action, task) {
  state.activity.unshift({
    id: uuid(),
    taskId: task.id,
    name: task.name,
    action,
    at: new Date().toISOString(),
  });
  state.activity = state.activity.slice(0, 100);
}

// Every transaction reads current storage. Web Locks serialize same-origin tabs when supported.
async function mutate(operation) {
  const commit = () => {
    const state = readState();
    const result = operation(state);
    putSaved(localStorage, storageKey, state);
    return result;
  };
  return globalThis.navigator?.locks ? navigator.locks.request(storageKey, commit) : commit();
}

export async function localRequest(path, options = {}) {
  const response = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => structuredClone(body),
  });
  try {
    const method = options.method || 'GET';
    const input = options.body ? JSON.parse(options.body) : {};
    if (path === '/api/session' && method === 'GET') {
      const account = readSession();
      return response(
        200,
        account ? { authenticated: true, ...account } : { authenticated: false, configured: true },
      );
    }
    if (path === '/api/login' && method === 'POST') {
      const account = accounts.find(
        (item) => item.username === input.username?.trim().toLowerCase(),
      );
      if (!account) fail('Choose a demo account.', 401);
      // Store only the chosen profile; never copy company credentials into the submission.
      putSaved(sessionStorage, sessionKey, {
        username: account.username,
        expires: Date.now() + 8 * 60 * 60 * 1000,
      });
      return response(200, { authenticated: true, ...account });
    }
    if (path === '/api/enquiries' && method === 'POST') {
      const clean = validateEnquiry(input);
      const enquiry = { ...clean, id: uuid(), createdAt: new Date().toISOString() };
      await mutate((state) => {
        if (state.enquiries.length >= 100)
          fail('This demo can save up to 100 enquiries in this browser.');
        state.enquiries.unshift(enquiry);
      });
      return response(201, { reference: enquiry.id });
    }
    const account = requireAccount();
    if (path === '/api/logout' && method === 'POST') {
      sessionStorage.removeItem(sessionKey);
      return response(200, { authenticated: false });
    }
    if (path === '/api/users' && method === 'GET')
      return response(200, {
        users: accounts
          .filter((item) => item.role !== 'viewer')
          .map(({ username, name }) => ({ username, name })),
      });
    if (path === '/api/enquiries' && method === 'GET') {
      requireAdmin();
      return response(200, { enquiries: readState().enquiries });
    }
    if (path === '/api/tasks' && method === 'GET') {
      const { tasks, activity } = readState();
      const visible =
        account.role === 'member'
          ? tasks.filter((task) => task.assignees.includes(account.username))
          : tasks;
      const ids = new Set(visible.map((task) => task.id));
      return response(200, {
        tasks: visible,
        activity:
          account.role === 'member' ? activity.filter((entry) => ids.has(entry.taskId)) : activity,
      });
    }
    requireEditor(account);
    const match = path.match(/^\/api\/tasks\/([a-f0-9-]{36})$/i);
    if ((path === '/api/tasks' && method === 'POST') || (match && method === 'PATCH')) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid task.');
      if (Object.hasOwn(input, 'assignees') || Object.hasOwn(input, 'assignee')) {
        requireAdmin();
        validateAssignees(input);
      }
      const task = await mutate((state) => {
        if (method === 'POST') {
          if (state.tasks.length >= 2000) fail('The workspace supports up to 2,000 tasks.');
          const task = {
            ...validateTask(
              account.role === 'member' ? { ...input, assignees: [account.username] } : input,
            ),
            id: uuid(),
            createdAt: new Date().toISOString(),
          };
          state.tasks.push(task);
          record(state, 'added', task);
          return task;
        }
        const index = state.tasks.findIndex(
          (task) =>
            task.id === match[1] &&
            (account.role !== 'member' || task.assignees.includes(account.username)),
        );
        if (index < 0) fail('Task not found.', 404);
        const old = state.tasks[index];
        const task = {
          ...old,
          ...validateTask({ ...old, ...input }),
          updatedAt: new Date().toISOString(),
        };
        state.tasks[index] = task;
        record(
          state,
          old.status === task.status ? 'updated' : task.status === 'done' ? 'completed' : 'moved',
          task,
        );
        return task;
      });
      return response(method === 'POST' ? 201 : 200, { task });
    }
    if (match && method === 'DELETE') {
      requireAdmin();
      await mutate((state) => {
        const task = state.tasks.find((item) => item.id === match[1]);
        if (!task) fail('Task not found.', 404);
        state.tasks = state.tasks.filter((item) => item.id !== task.id);
        record(state, 'deleted', task);
      });
      return response(200, { deleted: true });
    }
    return response(404, { error: 'Demo operation not found.' });
  } catch (error) {
    return response(error.status || 400, {
      error: error.message,
      code: error.code,
      field: error.field,
    });
  }
}

export function exportTasks() {
  requireAdmin();
  const { tasks, activity } = readState();
  return JSON.stringify({ version: 1, tasks, activity }, null, 2);
}

export async function importTasks(text) {
  requireAdmin();
  if (text.length > 6 * 1024 * 1024) fail('Choose a task backup smaller than 6 MB.');
  const input = JSON.parse(text);
  if (input.version !== 1) fail('Unsupported backup version.');
  const clean = validateState({ ...input, enquiries: [] });
  // A validated backup replaces tasks only; existing enquiry receipts are retained.
  return mutate((state) => {
    state.tasks = clean.tasks;
    state.activity = clean.activity;
  });
}

export function exportEnquiries() {
  requireAdmin();
  return JSON.stringify({ enquiries: readState().enquiries }, null, 2);
}

export async function addSampleTasks() {
  requireAdmin();
  const names = [
    'Review laboratory equipment requests',
    'Plan an incubator demonstration',
    'Check the diagnostics catalogue',
    'Confirm a technical support visit',
    'Prepare a biosafety cabinet checklist',
    'Review cold storage options',
    'Update the laboratory training agenda',
    'Check product documentation',
    'Prepare a microscope demonstration',
    'Review a maintenance schedule',
    'Compare sample preparation workflows',
    'Plan an equipment handover',
    'Review the contact information',
    'Check the product photographs',
    'Prepare an instrument cleaning checklist',
    'Review next week’s priorities',
    'Check the translated product categories',
    'Plan a team training session',
    'Review completed demonstrations',
    'Prepare the monthly activity summary',
  ];
  return mutate((state) => {
    let count = 0;
    for (const [index, label] of names.entries()) {
      const name = `Demo: ${label}`;
      if (state.tasks.some((task) => task.name === name)) continue;
      if (state.tasks.length >= 2000) fail('There is not enough space for the sample tasks.');
      const date = new Date();
      date.setDate(date.getDate() + (index % 9) - 4);
      const dueDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Athens',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
      const task = {
        name,
        description: `Sample task for demonstrating the workspace. ${index % 4 === 0 ? 'Use this longer description to check smooth expansion, wrapping and the alignment of the date, status and action buttons. All details are fictional and can be edited or deleted. '.repeat(3) : 'All details are fictional and can be edited or deleted.'}`,
        dueDate,
        priority: ['low', 'medium', 'high'][index % 3],
        status: ['todo', 'doing', 'done'][Math.floor(index / 3) % 3],
        assignees:
          index % 5 === 0 ? [] : index % 4 === 0 ? ['user1', 'user2'] : [`user${(index % 4) + 1}`],
        id: uuid(),
        createdAt: new Date().toISOString(),
      };
      state.tasks.push(
        validateState({ version: 1, tasks: [task], activity: [], enquiries: [] }).tasks[0],
      );
      record(state, 'added', task);
      count++;
    }
    return count;
  });
}
