import { t } from './common.js';
import {
  accounts,
  addSampleTasks,
  exportTasks,
  importTasks,
  exportEnquiries,
  storageKey,
} from './browser-service.js';

function download(name, contents) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initializeBrowserTools() {
  const select = document.querySelector('#login-username');
  const updateAccounts = () => {
    const selected = select.value;
    select.replaceChildren(
      ...accounts.map(
        (account) => new Option(`${account.name} — ${t(`demo.${account.role}`)}`, account.username),
      ),
    );
    select.value = accounts.some((account) => account.username === selected) ? selected : 'vtsevis';
  };
  updateAccounts();
  document.addEventListener('languagechange', updateAccounts);
  const panel = document.querySelector('#demo-tools');
  if (!panel) return;
  const status = document.querySelector('#demo-status');
  const report = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };
  const refresh = () => document.dispatchEvent(new CustomEvent('workspacechange'));
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) refresh();
  });
  panel.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-demo-action]');
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      switch (button.dataset.demoAction) {
        case 'samples': {
          const count = await addSampleTasks();
          refresh();
          report(t('demo.samplesDone').replace('{count}', count));
          break;
        }
        case 'export':
          download('idx-demo-tasks.json', exportTasks());
          report(t('demo.downloaded'));
          break;
        case 'enquiries':
          download('idx-unsent-enquiries.json', exportEnquiries());
          report(t('demo.downloaded'));
          break;
        case 'import':
          document.querySelector('#demo-import').click();
          break;
      }
    } catch (error) {
      report(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector('#demo-import').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) return report(t('demo.fileSize'), true);
    if (!window.confirm(t('demo.importConfirm'))) return;
    try {
      await importTasks(await file.text());
      refresh();
      report(t('demo.importDone'));
    } catch (error) {
      report(error.message, true);
    }
  });
}
