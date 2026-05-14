const FALLBACK_APP_VERSION = 'dev-local';

export const APP_VERSION = (
  import.meta.env.VITE_APP_VERSION?.trim() || FALLBACK_APP_VERSION
);

export function getDisplayAppVersion() {
  if (APP_VERSION === FALLBACK_APP_VERSION) {
    return APP_VERSION;
  }

  return APP_VERSION.slice(0, 7);
}
