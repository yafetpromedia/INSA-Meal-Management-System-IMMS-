import { ButtonHTMLAttributes } from 'react';
import { Plus } from 'lucide-react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
  loading?: boolean;
};

/** Compact page-header create action — modern, minimal. */
export function AddButton({
  label = 'Add',
  loading,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`btn btn-add ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      <span className="btn-add-icon" aria-hidden>
        <Plus size={14} strokeWidth={2.25} />
      </span>
      {loading ? 'Please wait…' : (children ?? label)}
    </button>
  );
}
