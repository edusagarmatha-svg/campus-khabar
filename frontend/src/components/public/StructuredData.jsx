import { useEffect } from 'react';

export default function StructuredData({ id, data }) {
  const serialized = data ? JSON.stringify(data).replace(/</g, '\\u003c') : '';

  useEffect(() => {
    if (!id) return undefined;

    const existing = document.getElementById(id);

    if (!serialized) {
      if (existing) existing.remove();
      return undefined;
    }

    let script = existing;
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = id;
      document.head.appendChild(script);
    }
    script.textContent = serialized;

    return () => {
      script.remove();
    };
  }, [id, serialized]);

  return null;
}
