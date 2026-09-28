import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* Mark: stamp outline with climbing path and gold dot */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-teal"
      >
        <rect
          x="2" y="2" width="32" height="32" rx="6"
          stroke="currentColor" strokeWidth="2" strokeDasharray="2.5 2.5"
        />
        <path
          d="M9 26 L15 19 L21 23 L27 11"
          stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
        <circle cx="27" cy="11" r="3.5" fill="#E3A93B" />
      </svg>

      {/* Wordmark */}
      <span className="font-heading font-semibold text-[1.125rem] text-foreground tracking-tight leading-none">
        {APP_NAME}
      </span>
    </div>
  );
}
