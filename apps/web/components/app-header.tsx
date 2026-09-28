"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV_TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ask",       label: "Ask" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 h-14 bg-card border-b border-border shadow-[0_1px_0_hsl(var(--border))]">
      <div className="flex items-center justify-between h-full max-w-[960px] mx-auto px-4">
        <Link href="/dashboard" aria-label="Go to dashboard">
          <Logo />
        </Link>

        <div className="flex items-center gap-1">
          {/* Desktop tabs */}
          <nav className="hidden md:flex items-center gap-1 mr-2" aria-label="Main navigation">
            {NAV_TABS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "h-9 px-4 flex items-center rounded-md text-small font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
