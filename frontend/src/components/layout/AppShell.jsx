import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

function navClass({ isActive }) {
  return isActive ? "nav-link nav-link--active" : "nav-link";
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title">Campus Khabar</div>
        <nav className="sidebar-nav" aria-label="Staff sections">
          <NavLink to="/admin" end className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/admin/posts" className={navClass}>
            Posts
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin/review" className={navClass}>
              Review queue
            </NavLink>
          )}
          <NavLink to="/admin/categories" className={navClass}>
            Categories
          </NavLink>
          <NavLink to="/admin/media" className={navClass}>
            Media
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin/staff" className={navClass}>
              Staff
            </NavLink>
          )}
        </nav>
        <NavLink to="/" className="sidebar-footer-link">
          View public site
        </NavLink>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span>
            {user?.name} ({user?.role})
          </span>
          <button
            type="button"
            className="button button--secondary"
            onClick={handleLogout}
          >
            Log out
          </button>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
