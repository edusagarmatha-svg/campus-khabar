import { Navigate, useParams } from 'react-router-dom';

export default function LegacyEditRedirect() {
  const { id } = useParams();
  return <Navigate to={`/admin/posts/${id}/edit`} replace />;
}