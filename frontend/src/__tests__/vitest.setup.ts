global.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id: number) => clearTimeout(id);
