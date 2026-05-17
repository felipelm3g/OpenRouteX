export const env = {
  apiBaseUrl: (() => {
    const backend = String(process.env.NEXT_PUBLIC_URL_BACKEND ?? '').trim();
    if (backend && backend.toLowerCase() !== 'localhost') return backend.replace(/\/+$/, '');
    const host = String(process.env.NEXT_PUBLIC_HOST ?? '').trim();
    if (!host) return '';
    return `http://${host}:3994`;
  })(),
};
