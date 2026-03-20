import '@testing-library/jest-dom/vitest';

global.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id: number) => clearTimeout(id);
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
