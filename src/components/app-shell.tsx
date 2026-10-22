import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useTaskSync, useCurrentUser } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";

const LOGO =
  "https://lh3.googleusercontent.com/aida/AEtjO1XNdwqKDvIl9I17vJtOe1My9WIfrEQWi_flLbpXu6Ig46qYzSE9oi1hbqvJYXq2FzGMnmVN_YWBnn3ZJMaVG9aDXC8C6qQHlelY2Bv7SWZ5OfdpyJa_w-Zb7B6eoSyevuU_gVRAiFtzQjmYPGQ0NHuY8oD2zImABvACdqa-kp6-cYjxqhgRzPZ-kj32tLPQN51vWoZ8_So5x2JxlTkCeIfCdJFvbuYuLIX3LRpKx3QWGg_iif4_BUQheII";

export function Icon({ name, className, fill }: { name: string; className?: string; fill?: boolean }) {
  return <span aria-hidden className={cn("msym text-[20px]", fill && "msym-fill", className)}>{name}</span>;
}

const NAV = [
  { to: "/today", icon: "auto_awesome", label: "Today" },
  { to: "/tasks", icon: "folder_supervised", label: "Tasks" },
  { to: "/delegate", icon: "add", label: "Delegate", center: true },
  { to: "/history", icon: "fact_check", label: "History" },
  { to: "/settings", icon: "settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  useTaskSync();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: user } = useCurrentUser();
  const initial = (user?.user_metadata?.full_name ?? user?.email ?? "?").charAt(0).toUpperCase();
  const avatar = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="fixed top-0 inset-x-0 z-50 glass-header">
        <div className="mx-auto max-w-3xl h-16 px-4 flex items-center justify-between">
          <Link to="/today" className="flex items-center gap-1">
            <img alt="Instinct logo" className="h-8 w-auto object-contain" src={LOGO} />
            <span className="ml-1 text-[20px] font-medium tracking-tight">Instinct</span>
            <span className="relative ml-1 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-glow opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
          </Link>
          <Link to="/settings" className="rounded-full p-0.5 hover:bg-surface-high transition-colors" aria-label="Settings">
            {avatar ? (
              <img src={avatar} alt="Profile" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{initial}</span>
            )}
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full mx-auto max-w-3xl pt-16 pb-28 px-4">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-50 glass-header border-t border-border">
        <div className="mx-auto max-w-3xl h-20 px-2 grid grid-cols-5 items-center">
          {NAV.map((n) => {
            const active = path === n.to || (n.to !== "/today" && path.startsWith(n.to + "/"));
            if ("center" in n && n.center) {
              return (
                <Link key={n.to} to={n.to} className="flex flex-col items-center gap-1">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition-transform">
                    <Icon name="add" className="text-[26px]" />
                  </span>
                </Link>
              );
            }
            return (
              <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-0.5 py-1", active ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors", active && "bg-primary-soft")}>
                  <Icon name={n.icon} fill={active} />
                </span>
                <span className="text-[11px] font-semibold">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
