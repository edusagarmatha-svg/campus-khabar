import { useEffect } from 'react';
import { absoluteUrl, SITE_NAME } from '../../config/site';

function upsertMeta(name, content, attr = 'name') {
  const existing = document.head.querySelector(`meta[${attr}="${name}"]`);

  if (!content) {
    if (existing) existing.remove();
    return;
  }

  const element = existing || document.createElement('meta');
  element.setAttribute(attr, name);
  element.setAttribute('content', content);

  if (!existing) document.head.appendChild(element);
}

function upsertLink(rel, href) {
  const existing = document.head.querySelector(`link[rel="${rel}"]`);

  if (!href) {
    if (existing) existing.remove();
    return;
  }

  const element = existing || document.createElement('link');
  element.setAttribute('rel', rel);
  element.setAttribute('href', href);

  if (!existing) document.head.appendChild(element);
}

export default function Seo({
  title,
  description,
  image,
  url,
  type = 'website',
  robots,
  jsonLd,
}) {
  const canonicalUrl =
    url ||
    (typeof window !== 'undefined'
      ? absoluteUrl(window.location.pathname)
      : absoluteUrl('/'));
  const jsonLdString = jsonLd ? JSON.stringify(jsonLd).replace(/</g, '\\u003c') : '';

  useEffect(() => {
    document.title = title || SITE_NAME;

    upsertMeta('description', description);
    upsertMeta('robots', robots);
    upsertLink('canonical', canonicalUrl);

    upsertMeta('og:title', title || SITE_NAME, 'property');
    upsertMeta('og:description', description, 'property');
    upsertMeta('og:type', type, 'property');
    upsertMeta('og:site_name', SITE_NAME, 'property');
    upsertMeta('og:url', canonicalUrl, 'property');
    if (image) upsertMeta('og:image', image, 'property');
    else upsertMeta('og:image', null, 'property');

    upsertMeta('twitter:card', image ? 'summary_large_image' : 'summary');
    upsertMeta('twitter:title', title || SITE_NAME);
    upsertMeta('twitter:description', description);
    if (image) upsertMeta('twitter:image', image);
    else upsertMeta('twitter:image', null);

    const scriptId = 'page-structured-data';
    let script = document.getElementById(scriptId);

    if (jsonLdString) {
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = scriptId;
        document.head.appendChild(script);
      }
      script.textContent = jsonLdString;
    } else if (script) {
      script.remove();
    }

    return () => {
      const current = document.getElementById(scriptId);
      if (current && current.textContent === jsonLdString) {
        current.remove();
      }
    };
  }, [
    title,
    description,
    image,
    canonicalUrl,
    type,
    robots,
    jsonLdString,
  ]);

  return null;
}
