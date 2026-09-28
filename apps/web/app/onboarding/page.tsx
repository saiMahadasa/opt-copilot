"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STAGES = [
  {
    id: "f1-studying",
    label: "F-1 (studying)",
    description: "Currently enrolled at a US school",
  },
  {
    id: "applied-opt",
    label: "Applied for OPT",
    description: "USCIS application pending",
  },
  {
    id: "on-opt",
    label: "On OPT",
    description: "12-month post-completion work authorization",
  },
  {
    id: "on-stem-opt",
    label: "On STEM OPT",
    description: "24-month STEM extension",
  },
] as const;

type StageId = (typeof STAGES)[number]["id"];

interface DateFormState {
  programEndDate: string;
  optEadEndDate: string;
  stemEadEndDate: string;
  unemploymentDaysUsed: string;
  i765FiledDate: string;
  eadReceived: boolean;
}

const EMPTY_DATES: DateFormState = {
  programEndDate: "",
  optEadEndDate: "",
  stemEadEndDate: "",
  unemploymentDaysUsed: "0",
  i765FiledDate: "",
  eadReceived: false,
};

function isValidDate(s: string): boolean {
  if (!s) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

function validateDates(stage: StageId, form: DateFormState): string | null {
  if (stage === "f1-studying" && form.programEndDate) {
    if (!isValidDate(form.programEndDate)) return "Program end date is not a valid date.";
  }
  if ((stage === "on-opt" || stage === "applied-opt") && form.optEadEndDate) {
    if (!isValidDate(form.optEadEndDate)) return "OPT EAD end date is not a valid date.";
  }
  if (stage === "on-stem-opt" && form.stemEadEndDate) {
    if (!isValidDate(form.stemEadEndDate)) return "STEM EAD end date is not a valid date.";
  }
  if (form.i765FiledDate && !isValidDate(form.i765FiledDate)) {
    return "I-765 filing date is not a valid date.";
  }
  const days = Number(form.unemploymentDaysUsed);
  if (form.unemploymentDaysUsed !== "" && (isNaN(days) || days < 0)) {
    return "Unemployment days must be 0 or more.";
  }
  return null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<StageId | null>(null);
  const [form, setForm] = useState<DateFormState>(EMPTY_DATES);
  const [error, setError] = useState<string | null>(null);

  function handleStageSelect(id: StageId) {
    setSelected(id);
    setStep(2);
  }

  function handleSave() {
    if (!selected) return;
    const err = validateDates(selected, form);
    if (err) { setError(err); return; }
    setError(null);

    const profile = {
      stage: selected,
      ...(form.programEndDate && { programEndDate: form.programEndDate }),
      ...(form.optEadEndDate && { optEadEndDate: form.optEadEndDate }),
      ...(form.stemEadEndDate && { stemEadEndDate: form.stemEadEndDate }),
      unemploymentDaysUsed: form.unemploymentDaysUsed !== "" ? Number(form.unemploymentDaysUsed) : 0,
      ...(form.i765FiledDate && { i765FiledDate: form.i765FiledDate }),
      eadReceived: form.eadReceived,
    };

    localStorage.setItem("visaProfile", JSON.stringify(profile));
    localStorage.setItem("visaStage", selected); // keep for backwards compat
    router.push("/dashboard");
  }

  function handleSkip() {
    if (!selected) return;
    localStorage.setItem("visaProfile", JSON.stringify({ stage: selected, unemploymentDaysUsed: 0, eadReceived: false }));
    localStorage.setItem("visaStage", selected);
    router.push("/dashboard");
  }

  function set(field: keyof DateFormState, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  // ── Step 1: stage picker ─────────────────────────────────────────────

  if (step === 1) {
    return (
      <main className="min-h-screen bg-background flex flex-col justify-center px-6 py-16 max-w-sm mx-auto">
        <div className="mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
            Step 1 of 2
          </p>
          <h1 className="text-2xl font-semibold text-foreground leading-snug">
            Where are you in your F-1 journey?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We'll tailor your deadlines and reminders to your stage.
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {STAGES.map((stage) => (
            <li key={stage.id}>
              <button
                onClick={() => handleStageSelect(stage.id)}
                className="w-full text-left"
              >
                <Card className="px-5 py-4 rounded-xl border border-border bg-card hover:bg-secondary/60 transition-colors duration-100">
                  <p className="text-sm font-medium text-foreground">{stage.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  // ── Step 2: date inputs ───────────────────────────────────────────────

  const showOptDates = selected === "on-opt" || selected === "applied-opt";
  const showStemDates = selected === "on-stem-opt";
  const showUnemployment = selected === "on-opt" || selected === "on-stem-opt";
  const showWaiting = selected === "on-opt" || selected === "on-stem-opt" || selected === "applied-opt";
  const selectedLabel = STAGES.find((s) => s.id === selected)?.label ?? "";

  return (
    <main className="min-h-screen bg-background flex flex-col justify-center px-6 py-16 max-w-sm mx-auto">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          Step 2 of 2 · {selectedLabel}
        </p>
        <h1 className="text-2xl font-semibold text-foreground leading-snug">
          Add your key dates
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          These stay on your device only. All fields are optional — skip if you don't have them yet.
        </p>
      </div>

      <div className="flex flex-col gap-5">

        {/* Program end date — studying */}
        {(selected === "f1-studying" || selected === "applied-opt") && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Program end date</span>
            <input
              type="date"
              value={form.programEndDate}
              onChange={(e) => set("programEndDate", e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        )}

        {/* OPT EAD end date */}
        {showOptDates && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">OPT EAD end date</span>
            <input
              type="date"
              value={form.optEadEndDate}
              onChange={(e) => set("optEadEndDate", e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        )}

        {/* STEM EAD end date */}
        {showStemDates && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">STEM EAD end date</span>
            <input
              type="date"
              value={form.stemEadEndDate}
              onChange={(e) => set("stemEadEndDate", e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        )}

        {/* Unemployment days */}
        {showUnemployment && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Days of unemployment used so far</span>
            <input
              type="number"
              min={0}
              value={form.unemploymentDaysUsed}
              onChange={(e) => set("unemploymentDaysUsed", e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="0"
            />
          </label>
        )}

        {/* I-765 filed date + EAD received */}
        {showWaiting && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                Date you filed your I-765{" "}
                <span className="font-normal text-muted-foreground">(optional, only if still waiting)</span>
              </span>
              <input
                type="date"
                value={form.i765FiledDate}
                onChange={(e) => set("i765FiledDate", e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.eadReceived}
                onChange={(e) => set("eadReceived", e.target.checked)}
                className="w-4 h-4 rounded border-border accent-foreground"
              />
              <span className="text-sm">I received my EAD card</span>
            </label>
          </>
        )}

        {error && (
          <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={handleSave} className="w-full">
            Save and continue
          </Button>
          <button
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-1"
          >
            Skip for now
          </button>
        </div>
      </div>
    </main>
  );
}
