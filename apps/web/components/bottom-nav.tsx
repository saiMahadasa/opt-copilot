"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ask",       label: "Ask",        icon: MessageCircle  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 h-16 z-40",
        "bg-card border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.06)]",
        "flex md:hidden" // hidden on desktop — AppHeader shows tabs instead
      )}
      aria-label="Main navigation"
    >
      <div className="flex w-full max-w-[960px] mx-auto">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px]",
                "transition-colors",
                active ? "text-teal" : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.5} />
              <span className="text-caption font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
