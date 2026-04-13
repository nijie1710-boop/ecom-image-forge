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
    <div className="rounded-[26px] border border-border bg-card px-4 py-4 shadow-sm sm:px-5 sm:py-5 md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary sm:text-xs">
            <Icon className="h-3.5 w-3.5" />
            {badge}
          </div>
          <h1 className="mt-3 text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          {!!steps.length && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {steps.map((step) => (
                <span key={step} className="rounded-full bg-muted px-2.5 py-1">
                  {step}
                </span>
              ))}
            </div>
          )}
        </div>

        {!!stats.length && (
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/60 p-2 text-center sm:min-w-[280px] sm:gap-3 sm:p-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-background px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="text-[11px] text-muted-foreground">{stat.label}</div>
                <div className="mt-1 text-base font-semibold text-foreground sm:text-lg">{stat.value}</div>
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
  sidebarWidthClassName = "lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] 2xl:grid-cols-[440px_minmax(0,1fr)]",
}: {
  sidebar: ReactNode;
  content: ReactNode;
  sidebarWidthClassName?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:gap-4 lg:gap-5 xl:gap-6", sidebarWidthClassName)}>
      <aside className="lg:sticky lg:top-24 lg:self-start">{sidebar}</aside>
      <section className="min-w-0 space-y-4 lg:space-y-5">{content}</section>
    </div>
  );
}
