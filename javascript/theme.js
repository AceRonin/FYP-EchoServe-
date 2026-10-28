const storageKey = 'echoserve-theme';

const getPreferredTheme = () => {
  const stored = localStorage.getItem(storageKey);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme) => {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  document.querySelectorAll('#theme-toggle').forEach((button) => {
    const icon = button.querySelector('.theme-toggle-icon');
    const label = button.querySelector('.theme-toggle-label');
    button.setAttribute('aria-pressed', String(isDark));
    button.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
    if (icon) icon.textContent = isDark ? '☀' : '☾';
    if (label) label.textContent = isDark ? 'Light' : 'Dark';
  });
};

applyTheme(getPreferredTheme());

document.querySelectorAll('#theme-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
  });
});
