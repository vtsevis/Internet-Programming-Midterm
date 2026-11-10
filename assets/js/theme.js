// Run before the stylesheets to avoid a flash of the wrong theme.
(() => {
  let theme;
  try {
    theme = localStorage.getItem('idx-theme');
  } catch {
    /* Storage can be disabled. */
  }
  if (!['light', 'dark'].includes(theme))
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
