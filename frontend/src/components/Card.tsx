import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'warning' | 'danger';
  title?: string;
  action?: React.ReactNode;
}

export function Card({ children, className = '', variant = 'default', title, action }: CardProps) {
  const variantStyles = {
    default: 'border-border',
    warning: 'border-state-warning',
    danger: 'border-state-danger',
  };

  return (
    <div className={`bg-card backdrop-blur-sm border ${variantStyles[variant]} rounded-[var(--radius-card)] ${className}`}>
      {title ? (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold">{title}</h3>
          {action ? <div>{action}</div> : null}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </div>
  );
}
