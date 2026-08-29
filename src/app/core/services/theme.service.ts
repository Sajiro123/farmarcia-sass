import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  isDarkMode = signal<boolean>(false);

  constructor() {
    this.initTheme();
    effect(() => {
      this.applyTheme(this.isDarkMode());
    });
  }

  private initTheme() {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      this.isDarkMode.set(true);
    } else if (storedTheme === 'light') {
      this.isDarkMode.set(false);
    } else {
      // Default to light as requested by user
      this.isDarkMode.set(false);
    }
  }

  toggleTheme() {
    this.isDarkMode.update(v => !v);
  }

  setTheme(theme: 'dark' | 'light') {
    this.isDarkMode.set(theme === 'dark');
  }

  private applyTheme(isDark: boolean) {
    const root = document.documentElement;
    const body = document.body;

    if (isDark) {
      root.classList.add('dark', 'dark-mode', 'app-dark');
      body.classList.add('dark', 'dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark', 'dark-mode', 'app-dark');
      body.classList.remove('dark', 'dark-mode');
      localStorage.setItem('theme', 'light');
    }
  }
}
