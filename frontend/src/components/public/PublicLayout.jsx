import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { listCategories } from "../../api/categories";

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
      <header className="site-header">
        <div className="container site-header-inner">
          <Link to="/" className="site-logo">
            Campus Khabar
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
          <Link to="/login" className="staff-login-link">
            Staff Login
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
            <Link to="/login" className="staff-login-link">
              Staff Login
            </Link>
            <span className="footer-meta">
              © {new Date().getFullYear()} Campus Kabar. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
