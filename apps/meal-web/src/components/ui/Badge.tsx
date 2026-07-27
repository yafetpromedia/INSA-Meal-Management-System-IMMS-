export function Badge({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'success' | 'warning' | 'error' | 'info';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusChip({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'success' | 'warning' | 'error' | 'info';
}) {
  return <span className={`status-chip status-${tone}`}>{children}</span>;
}
