export function pageForPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/auth/callback') return 'alexa-sim';
  if (path === '/check-in' || path === '/handoff') return 'incident-history';
  return path.slice(1);
}
