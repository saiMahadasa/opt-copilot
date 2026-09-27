"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";

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

export default function OnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<StageId | null>(null);

  function handleSelect(id: StageId) {
    setSelected(id);
    localStorage.setItem("visaStage", id);
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-background flex flex-col justify-center px-6 py-16 max-w-sm mx-auto">
      <div className="mb-12">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          Step 1 of 1
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
              onClick={() => handleSelect(stage.id)}
              className="w-full text-left"
              aria-pressed={selected === stage.id}
            >
              <Card
                className={[
                  "px-5 py-4 rounded-xl border transition-colors duration-100",
                  selected === stage.id
                    ? "border-foreground bg-secondary"
                    : "border-border bg-card hover:bg-secondary/60",
                ].join(" ")}
              >
                <p className="text-sm font-medium text-foreground">
                  {stage.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stage.description}
                </p>
              </Card>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
