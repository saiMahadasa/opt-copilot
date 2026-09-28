"use client";

import { Fragment, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  computeRules,
  getNextSteps,
  type RulesInput,
  type RulesOutput,
  type NextStep,
} from "@/lib/rules";

// ── Types ──────────────────────────────────────────────────────────────────

interface VisaProfile {
  stage: string;
  programEndDate?: string;
  optEadEndDate?: string;
  stemEadEndDate?: string;
  unemploymentDaysUsed?: number;
  i765FiledDate?: string;
  eadReceived?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  "f1-studying": "F-1 (studying)",
  "applied-opt": "Applied for OPT",
  "on-opt": "On OPT",
  "on-stem-opt": "On STEM OPT",
};

const TIMELINE_STAGES = ["F-1", "OPT", "STEM OPT"] as const;

function getTimelineState(stage: string) {
  return TIMELINE_STAGES.map((label) => {
    const complete =
      (label === "F-1" && ["on-opt", "on-stem-opt", "applied-opt"].includes(stage)) ||
      (label === "OPT" && stage === "on-stem-opt");
    const current =
      (label === "F-1" && stage === "f1-studying") ||
      (label === "OPT" && (stage === "on-opt" || stage === "applied-opt")) ||
      (label === "STEM OPT" && stage === "on-stem-opt");
    return { label, complete, current };
  });
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m) - 1]} ${Number(day)}, ${y}`;
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<VisaProfile | null>(null);
  const [rules, setRules] = useState<RulesOutput | null>(null);
  const [nextSteps, setNextSteps] = useState<NextStep[]>([]);
  const [quickInput, setQuickInput] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("visaProfile");
    const legacyStage = localStorage.getItem("visaStage");

    if (!raw && !legacyStage) {
      router.replace("/onboarding");
      return;
    }

    const p: VisaProfile = raw
      ? JSON.parse(raw)
      : { stage: legacyStage!, unemploymentDaysUsed: 0, eadReceived: false };

    setProfile(p);

    const today = todayUTC();
    const input: RulesInput = {
      stage: p.stage,
      programEndDate: p.programEndDate,
      optEadEndDate: p.optEadEndDate,
      stemEadEndDate: p.stemEadEndDate,
      unemploymentDaysUsed: p.unemploymentDaysUsed,
      i765FiledDate: p.i765FiledDate,
      eadReceived: p.eadReceived,
    };
    setRules(computeRules(input, today));
    setNextSteps(getNextSteps(input, today));
  }, [router]);

  if (!profile) return null;

  const stageLabel = STAGE_LABELS[profile.stage] ?? profile.stage;
  const timeline = getTimelineState(profile.stage);
  const today = todayUTC();

  // Determine whether the user entered any useful dates
  const hasDates = !!(
    profile.programEndDate ||
    profile.optEadEndDate ||
    profile.stemEadEndDate
  );

  function handleQuickSend(e: React.FormEvent) {
    e.preventDefault();
    const text = quickInput.trim();
    if (!text) return;
    router.push(`/ask?q=${encodeURIComponent(text)}`);
  }

  return (
    <main className="px-5 pt-10 pb-24 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Current stage
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{stageLabel}</h1>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          Active
        </span>
      </div>

      {/* ── No dates prompt ── */}
      {!hasDates && (
        <Link href="/onboarding">
          <Card className="p-4 border-dashed border-border hover:bg-muted/30 transition-colors cursor-pointer">
            <p className="text-sm font-medium">Add your dates to see your timeline</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap to enter program end date, EAD expiry, and more.
            </p>
          </Card>
        </Link>
      )}

      {/* ── Metric cards (only when relevant data exists) ── */}
      {rules?.unemployment && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground leading-snug">
              Unemployment days used
            </p>
            <p className="mt-2 text-[1.75rem] font-semibold leading-none">
              {rules.unemployment.daysUsed}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}/ {rules.unemployment.limit}
              </span>
            </p>
            {rules.unemployment.level === "watch" && (
              <p className="mt-1 text-xs text-amber-600">
                {rules.unemployment.daysLeft} days left — watch your count
              </p>
            )}
            {rules.unemployment.level === "over" && (
              <p className="mt-1 text-xs text-red-600">Limit exceeded</p>
            )}
          </Card>

          {/* Next deadline card */}
          <Card className="p-4">
            <p className="text-xs text-muted-foreground leading-snug">
              Next deadline
            </p>
            {nextSteps[0]?.date ? (
              <p className="mt-2 text-[1.75rem] font-semibold leading-none">
                {nextSteps[0].daysAway}
                <span className="text-sm font-normal text-muted-foreground"> days</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">—</p>
            )}
            {nextSteps[0]?.title && (
              <p className="mt-1 text-xs text-muted-foreground leading-snug">
                {nextSteps[0].title}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* ── Pending EAD alert ── */}
      {rules?.pendingEad && (
        <Card className="p-4 border-border bg-muted/40">
          <div className="flex gap-3 items-start">
            <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Your EAD has been pending for {rules.pendingEad.daysSinceFiling} days.
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Processing times change, so check the current estimate on the USCIS
                site and ask your DSO if this feels long.
              </p>
              <Link
                href={`/ask?q=${encodeURIComponent("My EAD has been pending — what should I check and when should I contact my DSO?")}`}
                className="mt-3 inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Ask about this
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* ── Ask quick input ── */}
      <div>
        <form onSubmit={handleQuickSend}>
          <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-muted/50 transition-colors">
            <input
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="Ask about your status…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </form>
      </div>

      {/* ── Timeline ── */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Your path
        </p>
        <div className="flex items-start">
          {timeline.map((step, i) => (
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
              {i < timeline.length - 1 && (
                <div className="flex-1 h-px bg-border mt-3 min-w-[8px]" />
              )}
            </Fragment>
          ))}
        </div>

        {/* Date summary under timeline */}
        {hasDates && (
          <div className="mt-4 pt-4 border-t border-border space-y-1">
            {profile.programEndDate && (
              <p className="text-xs text-muted-foreground">
                Program end: <span className="text-foreground">{fmtDate(profile.programEndDate)}</span>
                {rules?.optFilingWindow.status !== "unknown" && (
                  <span className="ml-2 text-muted-foreground">
                    · OPT window {rules?.optFilingWindow.status === "open" ? "open" : rules?.optFilingWindow.status === "upcoming" ? `opens ${fmtDate(rules?.optFilingWindow.startDate)}` : "closed"}
                  </span>
                )}
              </p>
            )}
            {profile.optEadEndDate && (
              <p className="text-xs text-muted-foreground">
                OPT EAD expires: <span className="text-foreground">{fmtDate(profile.optEadEndDate)}</span>
                {rules?.stemFilingWindow.status !== "unknown" && (
                  <span className="ml-2 text-muted-foreground">
                    · STEM window {rules?.stemFilingWindow.status === "open" ? "open" : rules?.stemFilingWindow.status === "upcoming" ? `opens ${fmtDate(rules?.stemFilingWindow.startDate)}` : "closed"}
                  </span>
                )}
              </p>
            )}
            {profile.stemEadEndDate && (
              <p className="text-xs text-muted-foreground">
                STEM EAD expires: <span className="text-foreground">{fmtDate(profile.stemEadEndDate)}</span>
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ── What to do next ── */}
      {nextSteps.length > 0 && (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            What to do next
          </p>
          <ul className="space-y-4">
            {nextSteps.map((step, i) => (
              <li key={i} className="flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{step.title}</p>
                    {step.date && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(step.date)}
                        {step.daysAway !== undefined && (
                          <span>
                            {step.daysAway >= 0
                              ? ` · in ${step.daysAway} days`
                              : ` · ${Math.abs(step.daysAway)} days ago`}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/ask?q=${encodeURIComponent(step.askQuestion)}`}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                  >
                    Ask
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-muted-foreground leading-snug">
          Dates are estimates from general rules. Confirm with your DSO.
        </p>
        <Link
          href="/onboarding"
          className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors shrink-0 ml-3"
        >
          Edit my dates
        </Link>
      </div>

    </main>
  );
}
