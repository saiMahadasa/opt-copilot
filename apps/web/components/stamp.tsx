"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface StampProps {
  children: React.ReactNode;
  size?: "sm" | "md";
  /** Play the press-in entrance animation once per session. */
  animated?: boolean;
  className?: string;
}

export function Stamp({ children, size = "md", animated = false, className }: StampProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (!animated) return;
    const key = "stampAnimated";
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      setShouldAnimate(true);
    }
  }, [animated]);

  return (
    // Outer: permanent -2° rotation
    <div className={cn("inline-block rotate-[-2deg]", className)}>
      {/* Inner: only this element gets the scale animation */}
      <div className={cn(shouldAnimate && "animate-stamp-press")}>
        <div
          className={cn(
            "border-2 border-teal rounded-stamp",
            size === "sm" ? "p-[4px]" : "p-[5px]"
          )}
        >
          <div
            className={cn(
              "border border-dashed border-teal rounded-[8px]",
              "flex items-center justify-center",
              size === "sm" ? "px-2.5 py-1" : "px-5 py-3"
            )}
          >
            <span
              className={cn(
                "font-heading font-semibold text-teal select-none",
                size === "sm" ? "text-xs leading-tight" : "text-display"
              )}
            >
              {children}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
