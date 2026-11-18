import { useEffect } from 'react';

export default function Seo({ title, description, image, url, type = 'website' }) {
  useEffect(() => {
    if (title) document.title = title;

    function setMeta(name, content, attr = 'name') {
      if (!content) return;
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    }

    setMeta('description', description);
    setMeta('og:title', title, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:type', type, 'property');
    if (image) setMeta('og:image', image, 'property');
    if (url) setMeta('og:url', url, 'property');
    setMeta('twitter:card', image ? 'summary_large_image' : 'summary');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    if (image) setMeta('twitter:image', image);
  }, [title, description, image, url, type]);

  return null;
}