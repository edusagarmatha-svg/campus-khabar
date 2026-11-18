import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title">Campus Kabar</div>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/categories">Categories</Link>
          <Link to="/posts">Posts</Link>
          <Link to="/media">Media</Link>
          {user?.role === 'admin' && <Link to="/staff">Staff</Link>}
        </nav>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span>{user?.name} ({user?.role})</span>
          <button onClick={handleLogout}>Log out</button>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
