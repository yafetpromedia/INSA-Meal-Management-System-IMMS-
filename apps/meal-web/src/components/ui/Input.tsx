import { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, id, className = '', ...rest }: Props) {
  const inputId = id ?? rest.name;
  return (
    <label className="field" htmlFor={inputId}>
      {label}
      <input id={inputId} className={`input ${className}`.trim()} aria-invalid={!!error} {...rest} />
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}
