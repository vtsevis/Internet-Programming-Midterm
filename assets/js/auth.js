import { localRequest } from './browser-service.js';
import { t } from './common.js';

let session = { authenticated: false };
export const isSignedIn = () => session.authenticated;
export const canEdit = () => session.authenticated && ['admin', 'member'].includes(session.role);
export const canAssign = () => session.authenticated && session.role === 'admin';
export const canDelete = canAssign;
export function openLogin() {
  document.querySelector('#login-dialog').showModal();
}

export async function api(path, options = {}) {
  const response = await localRequest(path, options);
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') {
      session = { authenticated: false };
      applySession();
      location.assign('index.html?signin=1');
      throw new Error(t('auth.expired'));
    }
    const error = new Error(
      response.status === 503
        ? t('auth.setup')
        : data.code === 'READ_ONLY'
          ? t('auth.readOnly')
          : data.code === 'ADMIN_ONLY'
            ? t('auth.adminOnly')
            : data.error || t('network.error'),
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

function applySession() {
  document.querySelectorAll('[data-member]').forEach((element) => {
    element.hidden = !session.authenticated;
  });
  document.querySelectorAll('[data-editor]').forEach((element) => {
    element.hidden = !canEdit();
  });
  document.querySelectorAll('[data-admin]').forEach((element) => {
    element.hidden = !canAssign();
  });
  document.querySelectorAll('[data-viewer]').forEach((element) => {
    element.hidden = !session.authenticated || canEdit();
  });
  document.querySelectorAll('[data-guest]').forEach((element) => {
    element.hidden = session.authenticated;
  });
}

export async function initializeAuth() {
  document
    .querySelectorAll('[data-signin]')
    .forEach((button) => button.addEventListener('click', openLogin));
  document
    .querySelectorAll('[data-close-dialog]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        document.querySelector(`#${button.dataset.closeDialog}`).close(),
      ),
    );
  const form = document.querySelector('#login-form');
  const status = document.querySelector('#login-status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = t('auth.wait');
    status.classList.remove('is-error');
    try {
      const input = new FormData(form);
      session = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: input.get('username') }),
      });
      form.reset();
      const destination = new URLSearchParams(location.search).get('next');
      location.assign(
        ['tasks.html', 'analytics.html'].includes(destination) ? destination : 'tasks.html',
      );
    } catch (error) {
      status.textContent =
        error.status === 401 ? t('auth.error') : error.message || t('network.error');
      status.classList.add('is-error');
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector('#signout').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api('/api/logout', { method: 'POST', body: '{}' });
      location.assign('index.html');
    } catch {
      event.currentTarget.disabled = false;
    }
  });
  try {
    session = await api('/api/session');
  } catch {
    session = { authenticated: false };
  }
  applySession();
  if (new URLSearchParams(location.search).has('signin') && !session.authenticated) openLogin();
  if (['tasks', 'analytics'].includes(document.body.dataset.page) && !session.authenticated)
    location.replace('index.html?signin=1');
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  return session;
}
