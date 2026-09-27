import { Fragment } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "F-1",      complete: true,  current: false },
  { label: "CPT",      complete: true,  current: false },
  { label: "OPT",      complete: true,  current: false },
  { label: "STEM OPT", complete: false, current: true  },
];

const DOCS = [
  { name: "I-20 (STEM extension)",    status: "complete" },
  { name: "Form I-983 training plan", status: "complete" },
  { name: "EAD card",                 status: "pending"  },
];

export default function DashboardPage() {
  return (
    <main className="px-5 pt-10 pb-24 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Current stage
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">STEM OPT</h1>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          Active
        </span>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground leading-snug">
            Unemployment days used
          </p>
          <p className="mt-2 text-[1.75rem] font-semibold leading-none">
            12
            <span className="text-sm font-normal text-muted-foreground"> / 90</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground leading-snug">
            Next report due
          </p>
          <p className="mt-2 text-[1.75rem] font-semibold leading-none">
            18
            <span className="text-sm font-normal text-muted-foreground"> days</span>
          </p>
        </Card>
      </div>

      {/* ── Warning alert ── */}
      <Card className="p-4 border-red-200 bg-red-50">
        <div className="flex gap-3 items-start">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              EAD card is 6 days overdue
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Filed March 2, expected by now
            </p>
            <Link
              href="/ask"
              className="mt-3 inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition-colors"
            >
              Ask what to do
            </Link>
          </div>
        </div>
      </Card>

      {/* ── Ask input ── */}
      <div>
        <Link href="/ask" className="block">
          <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-muted/50 transition-colors">
            <span className="flex-1 text-sm text-muted-foreground">
              Ask about your status…
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </Link>
        <div className="flex gap-2 mt-3">
          {["Can I freelance?", "Report address change"].map((chip) => (
            <Link
              key={chip}
              href="/ask"
              className="text-xs px-3 py-1.5 rounded-full border border-border text-foreground hover:bg-muted transition-colors"
            >
              {chip}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Timeline ── */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Your path
        </p>
        <div className="flex items-start">
          {STEPS.map((step, i) => (
            <Fragment key={step.label}>
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center",
                    step.complete
                      ? "bg-foreground"
                      : step.current
                      ? "border-2 border-foreground bg-background"
                      : "border-2 border-border bg-background"
                  )}
                >
                  {step.complete && (
                    <Check className="w-3 h-3 text-background" strokeWidth={3} />
                  )}
                  {step.current && (
                    <div className="w-2 h-2 rounded-full bg-foreground" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] text-center leading-tight",
                    step.current
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px bg-border mt-3 min-w-[8px]" />
              )}
            </Fragment>
          ))}
        </div>
      </Card>

      {/* ── Documents on file ── */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Documents on file
        </p>
        <ul className="space-y-3">
          {DOCS.map((doc) => (
            <li key={doc.name} className="flex items-center gap-3">
              <div
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                  doc.status === "complete"
                    ? "bg-foreground"
                    : "border-2 border-border"
                )}
              >
                {doc.status === "complete" && (
                  <Check className="w-2.5 h-2.5 text-background" strokeWidth={3} />
                )}
              </div>
              <span className="text-sm flex-1">{doc.name}</span>
              <span
                className={cn(
                  "text-xs font-medium",
                  doc.status === "complete"
                    ? "text-muted-foreground"
                    : "text-amber-600"
                )}
              >
                {doc.status}
              </span>
            </li>
          ))}
        </ul>
      </Card>

    </main>
  );
}
