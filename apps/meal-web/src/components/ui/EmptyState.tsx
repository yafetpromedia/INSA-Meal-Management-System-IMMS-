import { AddButton } from './AddButton';

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state panel">
      <h3>{title}</h3>
      {description ? <p style={{ margin: 0 }}>{description}</p> : null}
      {actionLabel && onAction ? (
        <AddButton type="button" label={actionLabel} onClick={onAction} />
      ) : null}
    </div>
  );
}
