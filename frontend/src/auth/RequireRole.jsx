import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-center">Loading…</div>;
  }

  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
