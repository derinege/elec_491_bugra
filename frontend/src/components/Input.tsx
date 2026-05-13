import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label ? <label className="block text-sm font-medium text-foreground">{label}</label> : null}
      <input
        className={`w-full h-9 px-3 bg-input-background border border-input rounded-[var(--radius-input)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 ${
          error ? 'border-destructive' : ''
        } ${className}`}
        {...props}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, options, className = '', ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label ? <label className="block text-sm font-medium text-foreground">{label}</label> : null}
      <select
        className={`w-full h-9 px-3 bg-input-background border border-input rounded-[var(--radius-input)] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 ${
          error ? 'border-destructive' : ''
        } ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
