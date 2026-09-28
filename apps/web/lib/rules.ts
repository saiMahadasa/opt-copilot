// Pure date-only rules engine — no React, no network.
// All arithmetic is UTC so DST and time zones never affect day counts.

// ── Types ─────────────────────────────────────────────────────────────────

export type WindowStatus = "upcoming" | "open" | "closed" | "unknown";

export interface WindowResult {
  status: WindowStatus;
  startDate?: string;
  endDate?: string;
  /** Days until the next state change (open → close, or upcoming → open). 0 when closed. */
  daysUntilChange?: number;
}

export interface UnemploymentResult {
  daysUsed: number;
  daysLeft: number;
  limit: number;
  level: "ok" | "watch" | "over";
}

export interface PendingEadResult {
  daysSinceFiling: number;
}

export interface RulesInput {
  stage: string;
  programEndDate?: string;
  optEadEndDate?: string;
  stemEadEndDate?: string;
  unemploymentDaysUsed?: number;
  i765FiledDate?: string;
  eadReceived?: boolean;
}

export interface RulesOutput {
  optFilingWindow: WindowResult;
  gracePeriod: WindowResult;
  stemFilingWindow: WindowResult;
  unemployment: UnemploymentResult | null;
  pendingEad: PendingEadResult | null;
}

export interface NextStep {
  title: string;
  date?: string;
  daysAway?: number;
  askQuestion: string;
}

// ── Date helpers (UTC only) ───────────────────────────────────────────────

/** Add (or subtract) N calendar days to a YYYY-MM-DD string. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Signed number of calendar days from `from` to `to` (UTC). */
export function diffDays(from: string, to: string): number {
  return Math.round(
    (new Date(to + "T00:00:00Z").getTime() -
      new Date(from + "T00:00:00Z").getTime()) /
      86_400_000
  );
}

function classify(
  today: string,
  start: string,
  end: string
): WindowResult {
  if (today < start)
    return {
      status: "upcoming",
      startDate: start,
      endDate: end,
      daysUntilChange: diffDays(today, start),
    };
  if (today <= end)
    return {
      status: "open",
      startDate: start,
      endDate: end,
      daysUntilChange: diffDays(today, end),
    };
  return { status: "closed", startDate: start, endDate: end, daysUntilChange: 0 };
}

// ── Individual rule functions ─────────────────────────────────────────────

/**
 * OPT filing window for a student still studying.
 * Opens 90 days before programEndDate, closes 60 days after it.
 */
export function computeOptFilingWindow(
  programEndDate: string | undefined,
  today: string
): WindowResult {
  if (!programEndDate) return { status: "unknown" };
  const start = addDays(programEndDate, -90);
  const end = addDays(programEndDate, 60);
  return classify(today, start, end);
}

/**
 * 60-day grace period after the relevant end date for the stage.
 * on-stem-opt uses stemEadEndDate, on-opt uses optEadEndDate,
 * all others use programEndDate.
 */
export function computeGracePeriod(
  input: Pick<
    RulesInput,
    "stage" | "programEndDate" | "optEadEndDate" | "stemEadEndDate"
  >,
  today: string
): WindowResult {
  const { stage, programEndDate, optEadEndDate, stemEadEndDate } = input;
  const anchor =
    stage === "on-stem-opt"
      ? stemEadEndDate
      : stage === "on-opt"
      ? optEadEndDate
      : programEndDate;
  if (!anchor) return { status: "unknown" };
  const end = addDays(anchor, 60);
  return classify(today, anchor, end);
}

/**
 * STEM OPT filing window for a student currently on OPT.
 * Opens 90 days before optEadEndDate; must be filed no later than optEadEndDate.
 * After the DSO issues the STEM I-20 the student has 60 days to file —
 * that deadline is tracked separately because the I-20 issue date is not
 * stored here.
 */
export function computeStemFilingWindow(
  optEadEndDate: string | undefined,
  today: string
): WindowResult {
  if (!optEadEndDate) return { status: "unknown" };
  const start = addDays(optEadEndDate, -90);
  return classify(today, start, optEadEndDate);
}

/**
 * Unemployment day tracking.
 * Limit is 90 days on OPT, 150 days total on STEM OPT.
 * level "watch" fires when fewer than 30 days remain.
 */
export function computeUnemployment(
  stage: string,
  daysUsed = 0
): UnemploymentResult {
  const limit = stage === "on-stem-opt" ? 150 : 90;
  const daysLeft = Math.max(0, limit - daysUsed);
  const level: UnemploymentResult["level"] =
    daysUsed >= limit ? "over" : daysLeft < 30 ? "watch" : "ok";
  return { daysUsed, daysLeft, limit, level };
}

/**
 * Pending EAD tracker.
 * Returns null when no filing date is set or EAD is already received.
 * Does NOT label anything overdue; does NOT embed a processing time.
 */
export function computePendingEad(
  i765FiledDate: string | undefined,
  eadReceived: boolean | undefined,
  today: string
): PendingEadResult | null {
  if (!i765FiledDate || eadReceived) return null;
  return { daysSinceFiling: Math.max(0, diffDays(i765FiledDate, today)) };
}

// ── Aggregate ─────────────────────────────────────────────────────────────

export function computeRules(input: RulesInput, today: string): RulesOutput {
  const showUnemployment =
    input.stage === "on-opt" || input.stage === "on-stem-opt";
  return {
    optFilingWindow: computeOptFilingWindow(input.programEndDate, today),
    gracePeriod: computeGracePeriod(input, today),
    stemFilingWindow: computeStemFilingWindow(input.optEadEndDate, today),
    unemployment: showUnemployment
      ? computeUnemployment(input.stage, input.unemploymentDaysUsed)
      : null,
    pendingEad: computePendingEad(input.i765FiledDate, input.eadReceived, today),
  };
}

// ── Next steps ────────────────────────────────────────────────────────────

export function getNextSteps(input: RulesInput, today: string): NextStep[] {
  const { stage, programEndDate, optEadEndDate, stemEadEndDate } = input;
  const steps: NextStep[] = [];

  if (stage === "f1-studying") {
    if (programEndDate) {
      const windowOpen = addDays(programEndDate, -90);
      const daysToOpen = diffDays(today, windowOpen);
      if (daysToOpen > 0) {
        steps.push({
          title: "OPT filing window opens",
          date: windowOpen,
          daysAway: daysToOpen,
          askQuestion: "When should I start preparing my OPT application?",
        });
      }
      const daysToEnd = diffDays(today, programEndDate);
      steps.push({
        title: "Program end date",
        date: programEndDate,
        daysAway: daysToEnd,
        askQuestion:
          "What do I need to do before my program end date to apply for OPT?",
      });
    }
  }

  if (stage === "applied-opt") {
    if (programEndDate) {
      const daysToEnd = diffDays(today, programEndDate);
      steps.push({
        title: "Program end date",
        date: programEndDate,
        daysAway: daysToEnd,
        askQuestion: "What happens to my OPT application after my program ends?",
      });
    }
    steps.push({
      title: "Receive EAD card",
      askQuestion:
        "How long does it typically take to receive the EAD card after I-765 approval?",
    });
  }

  if (stage === "on-opt") {
    if (optEadEndDate) {
      const stemWindowOpen = addDays(optEadEndDate, -90);
      const daysToStem = diffDays(today, stemWindowOpen);
      if (daysToStem > 0) {
        steps.push({
          title: "STEM OPT window opens",
          date: stemWindowOpen,
          daysAway: daysToStem,
          askQuestion:
            "What do I need to prepare before the STEM OPT window opens?",
        });
      }
      const daysToExpiry = diffDays(today, optEadEndDate);
      steps.push({
        title: "OPT EAD expires",
        date: optEadEndDate,
        daysAway: daysToExpiry,
        askQuestion: "What happens if my STEM OPT is not approved before my OPT EAD expires?",
      });
    }
  }

  if (stage === "on-stem-opt") {
    if (stemEadEndDate) {
      const daysToExpiry = diffDays(today, stemEadEndDate);
      steps.push({
        title: "STEM OPT EAD expires",
        date: stemEadEndDate,
        daysAway: daysToExpiry,
        askQuestion: "What are my options when my STEM OPT expires?",
      });
    }
    steps.push({
      title: "Annual self-evaluation due",
      askQuestion: "When is the I-983 annual self-evaluation due for STEM OPT?",
    });
  }

  // Steps with defined daysAway sort before steps without.
  steps.sort((a, b) => {
    if (a.daysAway === undefined && b.daysAway === undefined) return 0;
    if (a.daysAway === undefined) return 1;
    if (b.daysAway === undefined) return -1;
    return a.daysAway - b.daysAway;
  });

  return steps;
}
