"use client";

import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import type { InputHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export const Button = ({
  variant = "primary",
  size,
  block,
  loading,
  children,
  className,
  disabled,
  ...rest
}: {
  variant?: Variant;
  size?: "sm";
  block?: boolean;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) => {
  const classes = [
    "btn",
    `btn--${variant}`,
    size === "sm" ? "btn--sm" : "",
    block ? "btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={classes} disabled={disabled ?? loading} {...rest}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
};

export const Card = ({
  title,
  subtitle,
  actions,
  children,
  tight,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tight?: boolean;
}) => (
  <section className="card">
    {(title ?? actions) && (
      <div className="card__header">
        <div>
          {title && <h2 className="card__title">{title}</h2>}
          {subtitle && <p className="card__subtitle">{subtitle}</p>}
        </div>
        {actions}
      </div>
    )}
    <div className={tight ? "card__body card__body--tight" : "card__body"}>{children}</div>
  </section>
);

export const Stat = ({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) => (
  <div className="stat">
    <span className="stat__label">{label}</span>
    <span className="stat__value">{value}</span>
    {hint && <span className="stat__hint">{hint}</span>}
  </div>
);

export const Field = ({
  label,
  hint,
  error,
  id,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) => (
  <div className="field">
    <label className="field__label" htmlFor={id}>
      {label}
    </label>
    <input id={id} className="field__input" aria-invalid={error ? true : undefined} {...rest} />
    {error ? (
      <span className="field__error" role="alert">
        {error}
      </span>
    ) : (
      hint && <span className="field__hint">{hint}</span>
    )}
  </div>
);

export const SelectField = ({
  label,
  id,
  children,
  ...rest
}: {
  label: string;
} & SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="field">
    <label className="field__label" htmlFor={id}>
      {label}
    </label>
    <select id={id} className="field__input" {...rest}>
      {children}
    </select>
  </div>
);

export const EmptyState = ({ icon, children }: { icon?: string; children: ReactNode }) => (
  <div className="empty">
    {icon && <span className="empty__icon">{icon}</span>}
    <p>{children}</p>
  </div>
);
