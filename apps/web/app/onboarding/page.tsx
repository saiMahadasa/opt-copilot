"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Check, GraduationCap, FileText, Briefcase, Star,
  Upload, CheckCircle2, Loader2,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deriveStemStartDate } from "@/lib/rules";

// ── Stage options ─────────────────────────────────────────────────────────

const STAGES = [
  {
    id: "f1-studying",
    label: "Studying on F-1",
    description: "You are enrolled at a US school and have not yet applied for OPT.",
    icon: GraduationCap,
  },
  {
    id: "applied-opt",
    label: "OPT application in progress",
    description: "You have filed Form I-765 and are waiting for your EAD.",
    icon: FileText,
  },
  {
    id: "on-opt",
    label: "Working on OPT",
    description: "Your EAD has arrived and you are in your 12-month OPT period.",
    icon: Briefcase,
  },
  {
    id: "on-stem-opt",
    label: "Working on STEM OPT",
    description: "You are in the 24-month STEM extension for eligible STEM graduates.",
    icon: Star,
  },
] as const;

type StageId = (typeof STAGES)[number]["id"];

// ── Date form (simplified) ────────────────────────────────────────────────

interface DateForm {
  programEndDate: string;
  optEadEndDate: string;
  stemEadEndDate: string;
  unemploymentDaysUsed: string;
  i765FiledDate: string;
}

const EMPTY: DateForm = {
  programEndDate: "",
  optEadEndDate: "",
  stemEadEndDate: "",
  unemploymentDaysUsed: "0",
  i765FiledDate: "",
};

function isValidDate(s: string): boolean {
  if (!s) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

function validateDates(stage: StageId, form: DateForm): string | null {
  if ((stage === "f1-studying" || stage === "applied-opt") && form.programEndDate) {
    if (!isValidDate(form.programEndDate))
      return "Program end date is not a valid date. Check your I-20 and try again.";
  }
  if ((stage === "on-opt" || stage === "applied-opt") && form.optEadEndDate) {
    if (!isValidDate(form.optEadEndDate))
      return "OPT EAD end date is not a valid date. Check the date printed on your EAD card.";
  }
  if (stage === "on-stem-opt" && form.stemEadEndDate) {
    if (!isValidDate(form.stemEadEndDate))
      return "STEM EAD end date is not a valid date. Check the date printed on your EAD card.";
  }
  if (form.i765FiledDate && !isValidDate(form.i765FiledDate))
    return "I-765 filing date is not a valid date. Check your filing receipt notice.";
  const days = Number(form.unemploymentDaysUsed);
  if (form.unemploymentDaysUsed !== "" && (isNaN(days) || days < 0))
    return "Unemployment days must be 0 or a positive number.";
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<StageId | null>(null);
  const [form, setForm] = useState<DateForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [i20Note, setI20Note] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  function pickStage(id: StageId) {
    setSelected(id);
    setStep(2);
    setI20Note(null);
    setError(null);
  }

  function setField(field: keyof DateForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleI20Upload(file: File) {
    setUploading(true);
    setI20Note(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/extract-i20`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? "Could not read the document. Enter your dates manually.");
        return;
      }
      const data = await res.json();
      let filled = 0;
      if (data.programEndDate && isValidDate(data.programEndDate)) {
        setField("programEndDate", data.programEndDate);
        filled++;
      }
      const meta: string[] = [];
      if (data.school) meta.push(data.school);
      if (data.major) meta.push(data.major);
      setI20Note(
        filled > 0
          ? `Auto-filled from your I-20${meta.length ? ` · ${meta.join(", ")}` : ""}. Review and correct if needed.`
          : "No dates found — enter your dates below.",
      );
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleSave() {
    if (!selected) return;
    const err = validateDates(selected, form);
    if (err) { setError(err); return; }

    const stemStartDate =
      selected === "on-stem-opt" && form.stemEadEndDate
        ? deriveStemStartDate(form.stemEadEndDate)
        : undefined;

    const profile = {
      stage: selected,
      ...(form.programEndDate && { programEndDate: form.programEndDate }),
      ...(form.optEadEndDate  && { optEadEndDate:  form.optEadEndDate }),
      ...(form.stemEadEndDate && { stemEadEndDate: form.stemEadEndDate }),
      ...(stemStartDate       && { stemStartDate, stemStartDateDerived: true }),
      unemploymentDaysUsed: form.unemploymentDaysUsed !== "" ? Number(form.unemploymentDaysUsed) : 0,
      ...(form.i765FiledDate  && { i765FiledDate:  form.i765FiledDate }),
      eadReceived: selected !== "applied-opt",
    };
    localStorage.setItem("visaProfile", JSON.stringify(profile));
    localStorage.setItem("visaStage", selected);
    router.push("/dashboard");
  }

  function handleSkip() {
    if (!selected) return;
    localStorage.setItem("visaProfile", JSON.stringify({
      stage: selected,
      unemploymentDaysUsed: 0,
      eadReceived: selected !== "applied-opt",
    }));
    localStorage.setItem("visaStage", selected);
    router.push("/dashboard");
  }

  const inputClass =
    "w-full rounded-md border border-border bg-card px-3 py-2.5 text-small focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground";
  const labelClass = "flex flex-col gap-1.5 text-small font-medium text-foreground";
  const helperClass = "text-caption text-muted-foreground";

  // I-20 upload is only useful when the program end date matters
  const showI20Upload = selected === "f1-studying" || selected === "applied-opt";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal header */}
      <header className="h-14 flex items-center justify-between px-5 border-b border-border bg-card">
        <Logo />
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col items-center px-5 py-10">
        <div className="w-full max-w-[460px] flex flex-col gap-8">

          {/* Step indicator */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-caption text-muted-foreground">
              <span>Step {step} of 2</span>
              <span>{step === 1 ? "Choose your stage" : "Add your dates"}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-teal rounded-full transition-all duration-300"
                style={{ width: step === 1 ? "50%" : "100%" }}
              />
            </div>
          </div>

          {step === 1 ? (
            <>
              <div>
                <h1 className="font-heading text-h1 font-semibold text-foreground">
                  Where are you in your F-1 journey?
                </h1>
                <p className="mt-2 text-small text-muted-foreground">
                  Pick the option that describes you right now. You can update this at any time.
                </p>
              </div>

              <ul className="flex flex-col gap-3" role="list">
                {STAGES.map((stage) => {
                  const Icon = stage.icon;
                  const active = selected === stage.id;
                  return (
                    <li key={stage.id}>
                      <button
                        onClick={() => pickStage(stage.id)}
                        aria-pressed={active}
                        className={cn(
                          "w-full text-left rounded-lg border-2 p-4 flex items-start gap-4",
                          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-teal bg-accent/30"
                            : "border-border bg-card hover:border-teal/40 hover:bg-muted/30"
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 w-9 h-9 rounded-md flex items-center justify-center shrink-0",
                            active ? "bg-teal text-white" : "bg-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-small text-foreground">{stage.label}</p>
                          <p className="mt-0.5 text-caption text-muted-foreground leading-snug">
                            {stage.description}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center",
                            active ? "border-teal bg-teal" : "border-border"
                          )}
                        >
                          {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <div>
                <h1 className="font-heading text-h1 font-semibold text-foreground">
                  Add your key dates
                </h1>
                <p className="mt-2 text-small text-muted-foreground">
                  Everything stays on your device only. All fields are optional.
                </p>
              </div>

              <div className="flex flex-col gap-5">

                {/* I-20 upload — auto-fills program end date */}
                {showI20Upload && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-small font-medium text-foreground">
                        Upload your I-20 to auto-fill dates
                      </p>
                    </div>
                    <p className="text-caption text-muted-foreground leading-snug">
                      Gemini reads your program end date directly from the PDF.
                      The file is deleted immediately after — nothing is stored.
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleI20Upload(f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                      className={cn(
                        "inline-flex items-center gap-2 self-start rounded-md border border-border",
                        "px-3 py-2 text-small font-medium transition-colors",
                        uploading
                          ? "opacity-60 cursor-not-allowed bg-muted text-muted-foreground"
                          : "bg-card text-foreground hover:bg-muted"
                      )}
                    >
                      {uploading ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading…</>
                      ) : (
                        <><Upload className="w-3.5 h-3.5" /> Choose PDF or photo</>
                      )}
                    </button>
                    {i20Note && (
                      <p className={cn(
                        "flex items-start gap-1.5 text-caption leading-snug",
                        i20Note.startsWith("Auto-filled") ? "text-teal" : "text-muted-foreground"
                      )}>
                        {i20Note.startsWith("Auto-filled") && (
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        )}
                        {i20Note}
                      </p>
                    )}
                  </div>
                )}

                {/* Program end date */}
                {(selected === "f1-studying" || selected === "applied-opt") && (
                  <label className={labelClass}>
                    Program end date
                    <input
                      type="date"
                      value={form.programEndDate}
                      onChange={(e) => setField("programEndDate", e.target.value)}
                      className={inputClass}
                    />
                    <span className={helperClass}>Printed on your I-20 under "Program end date"</span>
                  </label>
                )}

                {/* OPT EAD end date */}
                {(selected === "on-opt" || selected === "applied-opt") && (
                  <label className={labelClass}>
                    OPT EAD end date
                    <input
                      type="date"
                      value={form.optEadEndDate}
                      onChange={(e) => setField("optEadEndDate", e.target.value)}
                      className={inputClass}
                    />
                    <span className={helperClass}>
                      {selected === "applied-opt"
                        ? "Fill this in once your EAD card arrives"
                        : "Printed on the front of your EAD card"}
                    </span>
                  </label>
                )}

                {/* STEM EAD end date */}
                {selected === "on-stem-opt" && (
                  <label className={labelClass}>
                    STEM EAD end date
                    <input
                      type="date"
                      value={form.stemEadEndDate}
                      onChange={(e) => setField("stemEadEndDate", e.target.value)}
                      className={inputClass}
                    />
                    <span className={helperClass}>Printed on the front of your STEM EAD card</span>
                  </label>
                )}

                {/* Unemployment days — only when actively on OPT/STEM OPT */}
                {(selected === "on-opt" || selected === "on-stem-opt") && (
                  <label className={labelClass}>
                    Unemployment days used so far
                    <input
                      type="number"
                      min={0}
                      value={form.unemploymentDaysUsed}
                      onChange={(e) => setField("unemploymentDaysUsed", e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                    <span className={helperClass}>
                      Count days you were not employed. Limit is 90 days on OPT or 150 total on STEM OPT.
                    </span>
                  </label>
                )}

                {/* I-765 filing date — only for applied-opt (tracking pending EAD) */}
                {selected === "applied-opt" && (
                  <label className={labelClass}>
                    Date you filed Form I-765
                    <span className="text-caption font-normal text-muted-foreground -mt-1">
                      Optional — helps track how long your EAD has been pending
                    </span>
                    <input
                      type="date"
                      value={form.i765FiledDate}
                      onChange={(e) => setField("i765FiledDate", e.target.value)}
                      className={inputClass}
                    />
                    <span className={helperClass}>Listed on your I-765 receipt notice from USCIS</span>
                  </label>
                )}

                {error && (
                  <p
                    role="alert"
                    className="text-small text-over bg-over-bg border border-over/30 rounded-md px-4 py-3 leading-snug"
                  >
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-3 pt-2">
                  <Button onClick={handleSave} className="w-full">
                    Save and continue
                  </Button>
                  <button
                    onClick={handleSkip}
                    className="text-small text-muted-foreground hover:text-foreground transition-colors py-2 text-center"
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
