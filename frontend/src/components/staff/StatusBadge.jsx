const STATUS_LABELS = {
  draft: 'Draft',
  pending_review: 'Pending review',
  changes_requested: 'Changes requested',
  published: 'Published',
  unpublished: 'Unpublished',
};

const STATUS_CLASSES = {
  draft: 'badge--muted',
  pending_review: 'badge--warning',
  changes_requested: 'badge--attention',
  published: 'badge--success',
  unpublished: 'badge--muted',
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '—';
}

export default function StatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_CLASSES[status] || 'badge--muted'}`}>
      {statusLabel(status)}
    </span>
  );
}
