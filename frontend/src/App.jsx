import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import RequireRole from './auth/RequireRole';
import AppShell from './components/layout/AppShell';
import PublicLayout from './components/public/PublicLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Categories from './pages/Categories';
import PostsList from './pages/PostsList';
import ReviewQueue from './pages/ReviewQueue';
import PostEditor from './pages/PostEditor';
import MediaLibrary from './pages/MediaLibrary';
import Staff from './pages/Staff';
import Home from './pages/public/Home';
import LegacyEditRedirect from './components/public/LegacyEditRedirect';
import Category from './pages/public/Category';
import Article from './pages/public/Article';
import Search from './pages/public/Search';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public portal */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/category/:slug" element={<Category />} />
            <Route path="/posts/:slug" element={<Article />} />
            <Route path="/search" element={<Search />} />
          </Route>

          {/* Staff auth */}
          <Route path="/login" element={<Login />} />

          {/* Staff application */}
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="categories" element={<Categories />} />
            <Route path="posts" element={<PostsList />} />
            <Route path="posts/new" element={<PostEditor />} />
            <Route path="posts/:id/edit" element={<PostEditor />} />
            <Route
              path="review"
              element={
                <RequireRole roles={['admin']}>
                  <ReviewQueue />
                </RequireRole>
              }
            />
            <Route path="media" element={<MediaLibrary />} />
            <Route
              path="staff"
              element={
                <RequireRole roles={['admin']}>
                  <Staff />
                </RequireRole>
              }
            />
          </Route>

          {/* Legacy staff route redirects */}
          <Route path="/categories" element={<Navigate to="/admin/categories" replace />} />
          <Route path="/posts" element={<Navigate to="/admin/posts" replace />} />
          <Route path="/posts/new" element={<Navigate to="/admin/posts/new" replace />} />
          <Route path="/posts/:id/edit" element={<LegacyEditRedirect />} />
          <Route path="/media" element={<Navigate to="/admin/media" replace />} />
          <Route path="/staff" element={<Navigate to="/admin/staff" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}