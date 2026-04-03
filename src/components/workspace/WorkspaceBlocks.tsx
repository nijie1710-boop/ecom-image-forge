import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function WorkspaceSection({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-border bg-card p-5 shadow-sm ${className}`.trim()}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function WorkspaceEmptyState({
  icon: Icon,
  title,
  description,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/70 px-6 py-10 text-center ${className}`.trim()}
    >
      <div className="rounded-3xl bg-primary/10 p-4 text-primary">
        <Icon className="h-10 w-10" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export function WorkspaceStatGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-muted/70 px-3 py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {item.label}
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
