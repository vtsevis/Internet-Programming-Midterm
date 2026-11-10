import { initializeCommon, t } from './common.js';
import { initializeAuth } from './auth.js';

import { initializeBrowserTools } from './browser-tools.js';
async function initializeApplication() {
  initializeBrowserTools();
  initializeCommon();
  if (document.querySelector('#product-filters')) {
    const { initializeProducts } = await import('./products.js');
    initializeProducts();
  }
  if (document.querySelector('#contact-form')) {
    const { initializeContact } = await import('./contact.js');
    initializeContact();
  }
  const auth = await initializeAuth();
  if (auth.authenticated && ['index', 'tasks', 'analytics'].includes(document.body.dataset.page)) {
    const { initializeWorkspace } = await import('./workspace.js');
    await initializeWorkspace();
  }

  const slides = [...document.querySelectorAll('.approach-slide')];
  if (slides.length) {
    let active = 0;
    const move = (delta) => {
      active = (active + delta + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        slide.hidden = index !== active;
      });
      document.querySelector('#carousel-status').textContent =
        `${t('carousel.slide')} ${active + 1} / ${slides.length}`;
    };
    document.querySelector('#carousel-prev').addEventListener('click', () => move(-1));
    document.querySelector('#carousel-next').addEventListener('click', () => move(1));
  }
}
initializeApplication().catch((error) => {
  console.error(error);
  const message = document.createElement('p');
  message.className = 'container is-error';
  message.setAttribute('role', 'alert');
  message.textContent = error.message;
  document.querySelector('main').prepend(message);
});
