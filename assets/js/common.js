import { translations } from './translations.js';

export let language = 'en';
export const locales = { en: 'en-GB', el: 'el-GR', de: 'de-DE', fr: 'fr-FR' };
const languageNames = { en: 'English', el: 'Ελληνικά', de: 'Deutsch', fr: 'Français' };
export const t = (key) => translations[language][key] ?? translations.en[key] ?? key;

export function setLanguage(next) {
  language = Object.hasOwn(locales, next) ? next : 'en';
  document.documentElement.lang = language;
  try {
    localStorage.setItem('idx-language', language);
  } catch {
    /* Preferences are optional. */
  }
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nLabel));
  });
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  });
  document.querySelector('#language-flag').src = `assets/img/flags/${language}.svg`;
  document
    .querySelector('#language-toggle')
    .setAttribute('aria-label', `${t('language.choose')}: ${languageNames[language]}`);
  document.title = `${t(`title.${document.body.dataset.page}`)} | iDx P.C.`;
  document.querySelector('meta[name="description"]').content = t('meta.description');
  updateThemeButton();
  document.dispatchEvent(new CustomEvent('languagechange'));
}

function updateThemeButton() {
  const button = document.querySelector('#theme-toggle');
  const dark = document.documentElement.dataset.theme === 'dark';
  button.setAttribute('aria-label', t(dark ? 'theme.light' : 'theme.dark'));
  button.title = button.getAttribute('aria-label');
  button.setAttribute('aria-pressed', String(dark));
}

function initializeCategoryContext(context, updateOffset) {
  const title = document.querySelector('#category-title');
  const header = context.closest('.site-header');
  let frame = 0;

  function show(visible) {
    const collapsed = !visible;
    if (context.classList.contains('is-collapsed') === collapsed) return;
    context.classList.toggle('is-collapsed', collapsed);
    context.setAttribute('aria-hidden', String(collapsed));
    context.inert = collapsed;
    updateOffset();
  }

  function update() {
    frame = 0;
    show(title.getBoundingClientRect().bottom <= header.getBoundingClientRect().bottom);
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!frame) frame = requestAnimationFrame(update);
    },
    { passive: true },
  );
  window.addEventListener('pageshow', update);
  window.addEventListener('resize', update);
  document.addEventListener('languagechange', update);
  update();
}

export function initializeCommon() {
  let saved;
  try {
    saved = localStorage.getItem('idx-language');
  } catch {
    /* Use English. */
  }
  const requested = new URLSearchParams(location.search).get('lang');
  setLanguage(requested ?? saved ?? 'en');

  // Keep in-page links clear of the sticky navigation at every breakpoint.
  const header = document.querySelector('.site-header');
  const categoryContext = header.querySelector('.catalog-context');
  const categoryContent = header.querySelector('.catalog-context-content');
  const updateHeaderOffset = () => {
    const headerHeight = Math.ceil(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--site-header-height', `${headerHeight}px`);
    const categoryHeight = Math.ceil(categoryContent?.getBoundingClientRect().height ?? 0);
    const visibleCategoryHeight = categoryContext?.classList.contains('is-collapsed')
      ? 0
      : categoryHeight;
    document.documentElement.style.setProperty(
      '--header-scroll-offset',
      `${headerHeight + visibleCategoryHeight + 16}px`,
    );
  };
  updateHeaderOffset();
  new ResizeObserver(updateHeaderOffset).observe(header);
  if (categoryContext) {
    new ResizeObserver(updateHeaderOffset).observe(categoryContent);
    initializeCategoryContext(categoryContext, updateHeaderOffset);
  }

  // This explicitly requested navigation animation is independent of the
  // reduced-motion rules used for hover effects and workspace transitions.
  let scrollFrame = 0;
  const stopScroll = () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  };
  for (const eventName of ['wheel', 'touchstart', 'pointerdown']) {
    window.addEventListener(eventName, stopScroll, { passive: true });
  }
  document.addEventListener('keydown', (event) => {
    if (
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', ' '].includes(
        event.key,
      )
    )
      stopScroll();
  });
  document.querySelectorAll('[data-smooth-scroll]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      stopScroll();
      if (location.hash !== link.hash) history.pushState(null, '', link.hash);
      const start = window.scrollY;
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const destination = Math.max(
        0,
        Math.min(
          start + target.getBoundingClientRect().top - padding,
          document.documentElement.scrollHeight - window.innerHeight,
        ),
      );
      const started = performance.now();
      const animate = (now) => {
        const progress = Math.min(1, (now - started) / 650);
        const eased = 1 - (1 - progress) ** 3;
        window.scrollTo({ top: start + (destination - start) * eased, behavior: 'instant' });
        scrollFrame = progress < 1 ? requestAnimationFrame(animate) : 0;
      };
      scrollFrame = requestAnimationFrame(animate);
    });
  });

  const languageSelector = document.querySelector('#language-selector');
  const languageToggle = document.querySelector('#language-toggle');
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.delete('lang');
      history.replaceState(null, '', url);
      setLanguage(button.dataset.language);
      languageSelector.open = false;
      languageToggle.focus();
    });
  });
  document.querySelector('#theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('idx-theme', theme);
    } catch {
      /* Continue without persistence. */
    }
    updateThemeButton();
  });

  const toggle = document.querySelector('#menu-toggle');
  const navigation = document.querySelector('#primary-navigation');
  function closeMenu() {
    toggle.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
  }
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('is-open', open);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && languageSelector.open) {
      languageSelector.open = false;
      languageToggle.focus();
    }
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      toggle.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!languageSelector.contains(event.target)) languageSelector.open = false;
    if (!navigation.contains(event.target) && !toggle.contains(event.target)) closeMenu();
  });
  matchMedia('(min-width: 1280px)').addEventListener('change', closeMenu);
}
