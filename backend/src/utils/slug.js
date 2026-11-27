const SLUG_MAX_LENGTH = 200;

function slugify(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (slug.length === 0) {
    return '';
  }

  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '');
}

function isValidSlug(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= SLUG_MAX_LENGTH &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

module.exports = { slugify, isValidSlug, SLUG_MAX_LENGTH };
