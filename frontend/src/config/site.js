const configuredSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || '').trim();

// In development Vite can run on a different port than the configured site.
// Production builds should set VITE_PUBLIC_SITE_URL to the canonical HTTPS
// origin; the current origin is a safer fallback than hard-coding localhost.
const fallbackSiteUrl =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

export const SITE_URL = (configuredSiteUrl || fallbackSiteUrl).replace(/\/+$/, '');
export const SITE_NAME = 'Campus Kabar';

export function absoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
}
