import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { listCategories } from "../../api/categories";
import StructuredData from "./StructuredData";
import { SITE_NAME, SITE_URL } from "../../config/site";

const ORGANIZATION_SCHEMA = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/favicon.svg`,
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  },
];

export default function PublicLayout() {
  const [categories, setCategories] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    (async () => {
      try {
        const cats = await listCategories();
        setCategories(
          Array.isArray(cats) ? cats.filter((c) => c.is_active !== false) : [],
        );
      } catch {
        setCategories([]);
      }
    })();
  }, []);

  return (
    <div className="public-shell">
      <StructuredData id="organization-structured-data" data={ORGANIZATION_SCHEMA} />
      <header className="site-header">
        <div className="container site-header-inner">
          <Link to="/" className="site-logo">
            {SITE_NAME}
          </Link>
          <button
            type="button"
            className="site-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
            <span aria-hidden="true">☰</span>
          </button>
          <nav
            id="primary-navigation"
            className={`site-nav ${menuOpen ? 'site-nav--open' : ''}`}
            aria-label="Primary"
          >
            <Link to="/" className={location.pathname === "/" ? "active" : ""} onClick={() => setMenuOpen(false)}>
              Home
            </Link>
            {categories.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                to={`/category/${c.slug}`}
                className={location.pathname === `/category/${c.slug}` ? 'active' : ''}
                onClick={() => setMenuOpen(false)}
              >
                {c.name}
              </Link>
            ))}
            <Link to="/search" className={location.pathname === '/search' ? 'active' : ''} onClick={() => setMenuOpen(false)}>
              Search
            </Link>
          </nav>
          <Link
            to="/login"
            className="staff-login-link"
            aria-label="Staff login"
            title="Staff login"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="m10 17 5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
          </Link>
        </div>
        <div className="site-header-rule" />
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-inner">
            <span className="footer-brand">Campus Kabar</span>
            <span className="footer-meta">
              © {new Date().getFullYear()} Campus Kabar. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
