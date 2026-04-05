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
    <section className={`rounded-[28px] border border-border bg-card p-4 shadow-sm sm:p-5 ${className}`.trim()}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground sm:text-lg">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">{actions}</div> : null}
      </div>
      <div className="mt-4 sm:mt-5">{children}</div>
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
      className={`flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-border bg-card/70 px-5 py-8 text-center sm:min-h-[360px] sm:px-6 sm:py-10 ${className}`.trim()}
    >
      <div className="rounded-3xl bg-primary/10 p-3 text-primary sm:p-4">
        <Icon className="h-8 w-8 sm:h-10 sm:w-10" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground sm:text-lg">{title}</h3>
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
