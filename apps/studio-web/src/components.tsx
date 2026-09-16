import type { PropsWithChildren, ReactNode } from "react";

export function Eyebrow({ children }: PropsWithChildren) {
  return <p className="eyebrow">{children}</p>;
}

export function Panel({
  children,
  title,
  action,
}: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <section className="panel">
      <header className="panel__header">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const kind = status === "PASSED" ? "pass" : status === "QUALITY_FAILED" ? "fail" : "operational";
  return (
    <span className={`status status--${kind}`}>
      <span aria-hidden="true" className="status__dot" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function EmptyState({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark" aria-hidden="true">
        ∅
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

export function LoadingState({ label = "Loading Studio data" }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-label={label}>
      <span />
      <span />
      <span />
    </div>
  );
}
