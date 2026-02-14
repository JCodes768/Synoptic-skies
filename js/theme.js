/**
 * Theme system for Synoptic Skies
 * Handles dark/light mode toggle with localStorage persistence
 * and prefers-color-scheme auto-detection
 */

const STORAGE_KEY = 'synoptic-skies-theme';

/**
 * Initialize the theme system
 * Call on DOMContentLoaded
 */
export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    setTheme(saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    setTheme('dark');
  } else {
    setTheme('dark');
  }

  // Listen for OS-level theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });

  // Bind the toggle button
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', toggleTheme);
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateToggleButton(theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  localStorage.setItem(STORAGE_KEY, next);
}

function updateToggleButton(theme) {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  if (theme === 'dark') {
    toggle.textContent = 'Light Mode';
    toggle.setAttribute('aria-label', 'Switch to light mode');
  } else {
    toggle.textContent = 'Dark Mode';
    toggle.setAttribute('aria-label', 'Switch to dark mode');
  }
}
