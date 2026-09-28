"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2, AlertTriangle, XCircle, Clock, Check,
  ChevronRight, Square, CheckSquare,
} from "lucide-react";
import { Stamp } from "@/components/stamp";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/accordion";
import { cn } from "@/lib/utils";
import {
  computeRules, getNextSteps,
  type RulesInput, type RulesOutput, type NextStep,
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

// ── Helpers ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  "f1-studying":  "Studying on F-1",
  "applied-opt":  "OPT in progress",
  "on-opt":       "On OPT",
  "on-stem-opt":  "On STEM OPT",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function stampDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(day)}`;
}

function stampMonthYear(d: string): string {
  const [y, m] = d.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function fmtDate(d: string | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(day)}, ${y}`;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Timeline data ──────────────────────────────────────────────────────────

const TIMELINE_ITEMS = [
  {
    value: "f1",
    label: "F-1",
    stages: ["f1-studying", "applied-opt", "on-opt", "on-stem-opt"],
    completedAfter: ["on-opt", "on-stem-opt"],
    currentFor: ["f1-studying", "applied-opt"],
    description:
      "Full-time enrollment authorization. Work outside campus requires CPT or OPT approval from your DSO.",
    question: "What work is allowed on an F-1 visa?",
    endDateKey: "programEndDate" as keyof VisaProfile,
  },
  {
    value: "opt",
    label: "OPT",
    stages: ["applied-opt", "on-opt", "on-stem-opt"],
    completedAfter: ["on-stem-opt"],
    currentFor: ["applied-opt", "on-opt"],
    description:
      "12 months of work authorization after completing your program. You can work for any employer in your field.",
    question: "What is the 90 day unemployment limit on OPT?",
    endDateKey: "optEadEndDate" as keyof VisaProfile,
  },
  {
    value: "stem-opt",
    label: "STEM OPT",
    stages: ["on-stem-opt"],
    completedAfter: [],
    currentFor: ["on-stem-opt"],
    description:
      "24-month extension for STEM graduates. Your employer must use E-Verify and you maintain a training plan on Form I-983.",
    question: "What do I need to do to maintain STEM OPT?",
    endDateKey: "stemEadEndDate" as keyof VisaProfile,
  },
];

// ── Dashboard ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<VisaProfile | null>(null);
  const [rules, setRules] = useState<RulesOutput | null>(null);
  const [nextSteps, setNextSteps] = useState<NextStep[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const raw = localStorage.getItem("visaProfile");
    const legacyStage = localStorage.getItem("visaStage");
    if (!raw && !legacyStage) { router.replace("/onboarding"); return; }

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

    const savedChecked = localStorage.getItem("checkedSteps");
    if (savedChecked) setChecked(new Set(JSON.parse(savedChecked)));
  }, [router]);

  if (!profile) return null;

  const today = todayUTC();
  const hasDates = !!(profile.programEndDate || profile.optEadEndDate || profile.stemEadEndDate);
  const stageLabel = STAGE_LABELS[profile.stage] ?? profile.stage;

  function toggleCheck(title: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      localStorage.setItem("checkedSteps", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  // ── Unemployment status ──
  const unemp = rules?.unemployment;
  const unempLevel = unemp?.level ?? "ok";
  const unempIcon =
    unempLevel === "over" ? <XCircle className="w-4 h-4" /> :
    unempLevel === "watch" ? <AlertTriangle className="w-4 h-4" /> :
    <CheckCircle2 className="w-4 h-4" />;
  const unempWord =
    unempLevel === "over" ? "Over the limit" :
    unempLevel === "watch" ? "Watch this" : "On track";
  const unempColor =
    unempLevel === "over"  ? "text-over" :
    unempLevel === "watch" ? "text-watch" : "text-ok";

  // ── Hero: first upcoming step ──
  const heroStep = nextSteps.find((s) => s.date && (s.daysAway ?? 0) >= 0);

  // ── Timeline state ──
  function stepState(item: typeof TIMELINE_ITEMS[0]) {
    const complete = item.completedAfter.includes(profile!.stage);
    const current  = item.currentFor.includes(profile!.stage);
    return { complete, current, upcoming: !complete && !current };
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-6 md:grid md:grid-cols-[1fr_320px] md:gap-6 md:items-start md:space-y-0">

      {/* ── Left column ────────────────────────────────────────────── */}
      <div className="space-y-5">

        {/* Stage label */}
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-h1 font-semibold text-foreground">{stageLabel}</h1>
          <Link
            href="/onboarding"
            className="text-caption text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Edit my dates
          </Link>
        </div>

        {/* Hero stamp */}
        {heroStep?.date ? (
          <div className="rounded-hero bg-card border border-border p-6 flex flex-col items-start gap-4">
            <p className="text-caption text-muted-foreground font-medium">Your next date</p>
            <Stamp animated size="md">
              {stampDate(heroStep.date)}
            </Stamp>
            <p className="text-body text-foreground max-w-[52ch]">
              {heroStep.title}{" "}
              {heroStep.daysAway !== undefined && heroStep.daysAway >= 0 && (
                <span className="text-muted-foreground">
                  in {heroStep.daysAway} {heroStep.daysAway === 1 ? "day" : "days"}.
                </span>
              )}
            </p>
          </div>
        ) : !hasDates ? (
          // Empty state
          <div className="rounded-hero bg-card border border-dashed border-border p-8 flex flex-col items-center gap-4 text-center">
            <p className="text-body font-medium text-foreground">Add your dates to see your timeline</p>
            <p className="text-small text-muted-foreground max-w-[40ch]">
              Enter your program end date or EAD expiry to see deadlines and next steps.
            </p>
            <Link
              href="/onboarding"
              className={cn(
                "inline-flex items-center justify-center rounded-md font-sans font-medium text-small",
                "min-h-[44px] h-11 px-5 py-2 transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              )}
            >
              Add dates
            </Link>
          </div>
        ) : null}

        {/* Pending EAD banner */}
        {rules?.pendingEad && (
          <div className="flex gap-3 items-start rounded-lg bg-muted/40 border-l-4 border-teal px-4 py-3">
            <Clock className="w-4 h-4 text-teal mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-small font-medium text-foreground">
                Your EAD has been pending for {rules.pendingEad.daysSinceFiling} days.
              </p>
              <p className="mt-1 text-caption text-muted-foreground leading-snug">
                Processing times change. Check the current estimate on the USCIS website and ask your DSO if this feels long.
              </p>
              <Link
                href={`/ask?q=${encodeURIComponent("My EAD has been pending for a while. What should I check and when should I contact my DSO?")}`}
                className="mt-2 inline-flex items-center gap-1.5 text-caption font-semibold text-teal hover:underline"
              >
                Ask about this <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* What to do next */}
        {nextSteps.length > 0 && (
          <div className="rounded-lg bg-card border border-border p-4">
            <h2 className="font-heading text-h3 font-semibold text-foreground mb-4">
              What to do next
            </h2>
            <ul className="space-y-3">
              {nextSteps.map((step) => {
                const done = checked.has(step.title);
                return (
                  <li key={step.title} className="flex items-start gap-3">
                    <button
                      onClick={() => toggleCheck(step.title)}
                      aria-label={done ? `Uncheck ${step.title}` : `Check off ${step.title}`}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-teal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      {done
                        ? <CheckSquare className="w-4.5 h-4.5 text-teal" />
                        : <Square className="w-4.5 h-4.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-small font-medium leading-snug", done && "line-through text-muted-foreground")}>
                        {step.title}
                      </p>
                      {step.date && (
                        <p className="text-caption text-muted-foreground mt-0.5">
                          {fmtDate(step.date)}
                          {step.daysAway !== undefined && (
                            <span className="ml-1.5">
                              {step.daysAway >= 0
                                ? `· in ${step.daysAway} days`
                                : `· ${Math.abs(step.daysAway)} days ago`}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/ask?q=${encodeURIComponent(step.askQuestion)}`}
                      className="shrink-0 text-caption font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 hover:bg-muted transition-colors"
                    >
                      Ask
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* ── Right column ───────────────────────────────────────────── */}
      <div className="space-y-5">

        {/* Unemployment meter */}
        {unemp && (
          <div className="rounded-lg bg-card border border-border p-4 space-y-3">
            <h2 className="font-heading text-h3 font-semibold text-foreground">Unemployment days</h2>
            <div className="flex items-center gap-2">
              <span className={cn("flex items-center gap-1.5 text-small font-medium", unempColor)}>
                {unempIcon}
                {unempWord}
              </span>
            </div>
            <div>
              <div className="flex justify-between text-caption text-muted-foreground mb-1.5">
                <span>{unemp.daysUsed} of {unemp.limit} days used</span>
                <span>{unemp.daysLeft} left</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    unempLevel === "over"  ? "bg-over" :
                    unempLevel === "watch" ? "bg-watch" : "bg-teal"
                  )}
                  style={{ width: `${Math.min(100, (unemp.daysUsed / unemp.limit) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-lg bg-card border border-border p-4">
          <h2 className="font-heading text-h3 font-semibold text-foreground mb-4">Your path</h2>
          <Accordion type="single" collapsible className="space-y-0">
            {TIMELINE_ITEMS.map((item, i) => {
              const { complete, current, upcoming } = stepState(item);
              const endDate = profile[item.endDateKey] as string | undefined;

              return (
                <div key={item.value} className="flex gap-3">
                  {/* Connector column */}
                  <div className="flex flex-col items-center shrink-0 pt-3">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center border-2 shrink-0",
                        complete  ? "bg-teal border-teal" :
                        current   ? "border-teal bg-card" :
                                    "border-border bg-card"
                      )}
                    >
                      {complete && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      {current  && <div className="w-2 h-2 rounded-full bg-teal" />}
                    </div>
                    {i < TIMELINE_ITEMS.length - 1 && (
                      <div className={cn("w-0.5 flex-1 mt-1", complete ? "bg-teal" : "bg-border")} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-1">
                    <AccordionItem value={item.value} className="border-0">
                      <AccordionTrigger
                        className={cn(
                          "py-2",
                          current ? "text-foreground font-semibold" : "text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span>{item.label}</span>
                          {complete && endDate && (
                            <Stamp size="sm" className="ml-1">
                              {stampMonthYear(endDate)}
                            </Stamp>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-small text-muted-foreground leading-relaxed mb-3">
                          {item.description}
                        </p>
                        <Link
                          href={`/ask?q=${encodeURIComponent(item.question)}`}
                          className="inline-flex items-center gap-1.5 text-caption font-semibold text-teal hover:underline"
                        >
                          {item.question} <ChevronRight className="w-3 h-3" />
                        </Link>
                      </AccordionContent>
                    </AccordionItem>
                  </div>
                </div>
              );
            })}
          </Accordion>
        </div>

        {/* Disclaimer */}
        <p className="text-caption text-muted-foreground text-center leading-snug">
          Dates are estimates from general rules. Confirm with your DSO.
        </p>
      </div>
    </div>
  );
}
