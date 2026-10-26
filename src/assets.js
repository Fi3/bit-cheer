// Vite supplies BASE_URL for root Sites and repository-scoped GitHub Pages.
// Optional chaining keeps the same helper importable in Node unit tests.
export function normalizeBase(base = '/') {
  const value = String(base || '/');
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(value)) return value.replace(/\/+$/, '') + '/';
  if (value === './' || value === '.') return './';
  const path = value.replace(/^\/+|\/+$/g, '');
  return path ? `/${path}/` : '/';
}
export const BASE_PATH = normalizeBase(import.meta.env?.BASE_URL || '/');

export function assetUrl(path, base = BASE_PATH) {
  if (typeof path !== 'string') throw new TypeError('Asset paths must be strings.');
  if (!path || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(path)) return path;
  const prefix = normalizeBase(base);
  const relative = path.replace(/^\/+/, '').replace(/^\.\//, '');
  if (prefix === './') return `./${relative}`;
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(prefix)) return prefix + relative;
  if (prefix === '/') return `/${relative}`;
  const scoped = prefix.slice(1);
  if (relative === scoped.slice(0, -1) || relative.startsWith(scoped)) return `/${relative}`;
  return prefix + relative;
}
