import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WorkspaceStat = {
  label: string;
  value: string | number;
};

export function WorkspaceHeader({
  icon: Icon,
  badge,
  title,
  description,
  steps = [],
  stats = [],
}: {
  icon: LucideIcon;
  badge: string;
  title: string;
  description: string;
  steps?: string[];
  stats?: WorkspaceStat[];
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Icon className="h-3.5 w-3.5" />
            {badge}
          </div>
          <h1 className="mt-3 text-2xl font-bold text-foreground md:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          {!!steps.length && (
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {steps.map((step) => (
                <span key={step} className="rounded-full bg-muted px-2.5 py-1">
                  {step}
                </span>
              ))}
            </div>
          )}
        </div>

        {!!stats.length && (
          <div className="grid grid-cols-3 gap-3 rounded-2xl bg-muted/60 p-3 text-center">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-background px-4 py-3">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{stat.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkspaceShell({
  sidebar,
  content,
  sidebarWidthClassName = "xl:grid-cols-[380px_minmax(0,1fr)]",
}: {
  sidebar: ReactNode;
  content: ReactNode;
  sidebarWidthClassName?: string;
}) {
  return (
    <div className={cn("grid gap-6", sidebarWidthClassName)}>
      <aside className="xl:sticky xl:top-24 xl:self-start">{sidebar}</aside>
      <section className="min-w-0 space-y-6">{content}</section>
    </div>
  );
}
