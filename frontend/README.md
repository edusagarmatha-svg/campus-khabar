# Campus Kabar Frontend

React 19 + Vite frontend for the Campus Kabar public news portal and the `/admin` staff console.

## Scripts

```bash
npm ci
npm run dev      # Vite dev server with /api proxy to localhost:4000
npm run build    # production bundle in dist/
npm run preview  # preview the built bundle locally
npm run lint     # ESLint
```

## Environment

Copy `.env.example` to `.env.local` and set:

```env
VITE_PUBLIC_SITE_URL=https://news.example.com
```

`VITE_PUBLIC_SITE_URL` is the canonical public origin. It is used for canonical links, Open Graph URLs, and organization JSON-LD. In development the current Vite origin is used as a fallback; production should set it explicitly.

The frontend expects the API to be available at the same origin under `/api`. The Vite development server proxies that path to `http://localhost:4000`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Public homepage |
| `/category/:slug` | Category listing |
| `/posts/:slug` | Article detail |
| `/search` | Public search |
| `/login` | Staff login |
| `/admin` | Staff dashboard |
| `/admin/posts` | Staff post management |
| `/admin/review` | Admin review queue |
| `/admin/categories` | Category management |
| `/admin/media` | Media library |
| `/admin/staff` | Admin staff management |

Legacy non-admin staff paths redirect into `/admin`.

## Structure

```
src/
├── api/          fetch wrappers and endpoint helpers
├── auth/         session bootstrap, access token handling, route guards
├── components/   layout, media, public UI, shared form controls
├── config/       public site URL and canonical URL helpers
├── editor/       TipTap editor and media ID collection
├── pages/        public and staff screens
└── styles/       design tokens and public/staff styles
```

## Authentication and media

- Access tokens are kept in memory, never in `localStorage`.
- A single-flight refresh flow uses the HttpOnly refresh cookie.
- Uploads go directly to Cloudinary using a short-lived signature from the API, then the asset is registered server-side.

## SEO

Page metadata is applied client-side by `components/public/Seo.jsx`. The backend supplies `robots.txt` and `sitemap.xml`; the deployment proxy must expose those API routes at the site root. For reliable social unfurling, keep the metadata values populated on every public route and consider prerendering in a future release.

## Production hosting

`npm run build` produces a static SPA. Serve `dist/` behind HTTPS with:

- SPA fallback to `dist/index.html`
- `/api/*`, `/sitemap.xml`, and `/robots.txt` proxied to the API
- long-lived caching for hashed assets under `/assets/`
- the security headers configured at the proxy/CDN layer
