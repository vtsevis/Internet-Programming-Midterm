import { t } from './common.js';

export function initializeProducts() {
  const filters = document.querySelector('#product-filters');
  if (!filters) return;
  const cards = [...document.querySelectorAll('[data-product]')];
  const search = document.querySelector('#product-search');
  const workflow = document.querySelector('#product-workflow');
  const count = document.querySelector('#product-count');
  const empty = document.querySelector('#product-empty');
  const normalize = (value) =>
    value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
  const searchIndex = new Map();
  function updateSearchIndex() {
    cards.forEach((card) => {
      searchIndex.set(card, normalize(`${card.dataset.search} ${card.textContent}`));
    });
  }

  function filterProducts() {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      const matchesStage =
        workflow.value === 'all' || card.dataset.workflows.split(' ').includes(workflow.value);
      const matchesSearch = terms.every((term) => searchIndex.get(card).includes(term));
      card.hidden = !(matchesStage && matchesSearch);
      if (!card.hidden) visible++;
    }
    count.textContent = t('catalog.results')
      .replace('{count}', visible)
      .replace('{total}', cards.length);
    empty.hidden = visible !== 0;
  }

  filters.hidden = false;
  filters.addEventListener('submit', (event) => event.preventDefault());
  search.addEventListener('input', filterProducts);
  workflow.addEventListener('change', filterProducts);
  filters.addEventListener('reset', (event) => {
    event.preventDefault();
    search.value = '';
    workflow.value = 'all';
    filterProducts();
  });
  document.addEventListener('languagechange', () => {
    updateSearchIndex();
    filterProducts();
  });
  updateSearchIndex();
  filterProducts();
}
