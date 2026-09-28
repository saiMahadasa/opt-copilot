import { describe, it, expect } from "vitest";
import {
  addDays,
  diffDays,
  computeOptFilingWindow,
  computeGracePeriod,
  computeStemFilingWindow,
  computeUnemployment,
  computePendingEad,
  getStemReporting,
  deriveStemStartDate,
  getNextSteps,
} from "./rules";

// ── Fixture dates ────────────────────────────────────────────────────────

const PROGRAM_END = "2026-12-15";
const OPT_EAD_END = "2027-06-30";

// ── OPT filing window ────────────────────────────────────────────────────

describe("computeOptFilingWindow", () => {
  it("opens 90 days before and closes 60 days after programEndDate", () => {
    const today = "2026-08-01"; // well before the window
    const result = computeOptFilingWindow(PROGRAM_END, today);
    expect(result.startDate).toBe("2026-09-16"); // Dec 15 - 90 days
    expect(result.endDate).toBe("2027-02-13");   // Dec 15 + 60 days
  });

  it("is upcoming when today is before the window opens", () => {
    const result = computeOptFilingWindow(PROGRAM_END, "2026-08-01");
    expect(result.status).toBe("upcoming");
    expect(result.daysUntilChange).toBe(diffDays("2026-08-01", "2026-09-16"));
  });

  it("is open on the exact opening day (boundary)", () => {
    const result = computeOptFilingWindow(PROGRAM_END, "2026-09-16");
    expect(result.status).toBe("open");
  });

  it("is open when today is inside the window", () => {
    const result = computeOptFilingWindow(PROGRAM_END, "2026-11-01");
    expect(result.status).toBe("open");
  });

  it("is open on the exact closing day (boundary)", () => {
    const result = computeOptFilingWindow(PROGRAM_END, "2027-02-13");
    expect(result.status).toBe("open");
  });

  it("is closed one day after the closing day", () => {
    const result = computeOptFilingWindow(PROGRAM_END, "2027-02-14");
    expect(result.status).toBe("closed");
    expect(result.daysUntilChange).toBe(0);
  });

  it("returns unknown when programEndDate is missing", () => {
    const result = computeOptFilingWindow(undefined, "2026-08-01");
    expect(result.status).toBe("unknown");
  });

  // Leap year: Feb 28, 2028 + 1 day = Feb 29, 2028 (leap)
  it("handles leap-year date correctly", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  // Month-end rollover
  it("handles month-end rollover correctly", () => {
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
  });
});

// ── STEM OPT filing window ────────────────────────────────────────────────

describe("computeStemFilingWindow", () => {
  it("opens 90 days before optEadEndDate and closes on optEadEndDate", () => {
    const today = "2027-01-01";
    const result = computeStemFilingWindow(OPT_EAD_END, today);
    expect(result.startDate).toBe("2027-04-01"); // Jun 30 - 90 days
    expect(result.endDate).toBe("2027-06-30");
  });

  it("is upcoming before the window opens", () => {
    const result = computeStemFilingWindow(OPT_EAD_END, "2027-01-01");
    expect(result.status).toBe("upcoming");
  });

  it("is open on the exact opening day", () => {
    const result = computeStemFilingWindow(OPT_EAD_END, "2027-04-01");
    expect(result.status).toBe("open");
  });

  it("is open on the deadline day", () => {
    const result = computeStemFilingWindow(OPT_EAD_END, "2027-06-30");
    expect(result.status).toBe("open");
  });

  it("is closed after the deadline", () => {
    const result = computeStemFilingWindow(OPT_EAD_END, "2027-07-01");
    expect(result.status).toBe("closed");
  });

  it("returns unknown when optEadEndDate is missing", () => {
    expect(computeStemFilingWindow(undefined, "2027-01-01").status).toBe("unknown");
  });
});

// ── Grace period ─────────────────────────────────────────────────────────

describe("computeGracePeriod", () => {
  it("ends 60 days after optEadEndDate when on-opt", () => {
    const result = computeGracePeriod(
      { stage: "on-opt", optEadEndDate: OPT_EAD_END },
      "2027-07-01"
    );
    expect(result.endDate).toBe("2027-08-29"); // Jun 30 + 60 days
  });

  it("ends 60 days after programEndDate when f1-studying", () => {
    const result = computeGracePeriod(
      { stage: "f1-studying", programEndDate: PROGRAM_END },
      "2027-01-01"
    );
    expect(result.endDate).toBe("2027-02-13");
  });

  it("returns unknown when the required date for the stage is missing", () => {
    const result = computeGracePeriod({ stage: "on-opt" }, "2027-07-01");
    expect(result.status).toBe("unknown");
  });
});

// ── Unemployment ──────────────────────────────────────────────────────────

describe("computeUnemployment — OPT (90-day limit)", () => {
  it("0 days used → ok, 90 left", () => {
    const r = computeUnemployment("on-opt", 0);
    expect(r.level).toBe("ok");
    expect(r.daysLeft).toBe(90);
  });

  it("60 days used → ok, 30 left (edge of watch)", () => {
    const r = computeUnemployment("on-opt", 60);
    expect(r.level).toBe("ok");
    expect(r.daysLeft).toBe(30);
  });

  it("61 days used → watch, 29 left", () => {
    const r = computeUnemployment("on-opt", 61);
    expect(r.level).toBe("watch");
    expect(r.daysLeft).toBe(29);
  });

  it("89 days used → watch, 1 left", () => {
    const r = computeUnemployment("on-opt", 89);
    expect(r.level).toBe("watch");
    expect(r.daysLeft).toBe(1);
  });

  it("90 days used → over, 0 left", () => {
    const r = computeUnemployment("on-opt", 90);
    expect(r.level).toBe("over");
    expect(r.daysLeft).toBe(0);
  });

  it("91 days used → over, 0 left", () => {
    const r = computeUnemployment("on-opt", 91);
    expect(r.level).toBe("over");
    expect(r.daysLeft).toBe(0);
  });
});

describe("computeUnemployment — STEM OPT (150-day limit)", () => {
  it("0 days used → ok, 150 left", () => {
    const r = computeUnemployment("on-stem-opt", 0);
    expect(r.limit).toBe(150);
    expect(r.level).toBe("ok");
    expect(r.daysLeft).toBe(150);
  });

  it("121 days used → watch, 29 left", () => {
    const r = computeUnemployment("on-stem-opt", 121);
    expect(r.level).toBe("watch");
  });

  it("150 days used → over", () => {
    const r = computeUnemployment("on-stem-opt", 150);
    expect(r.level).toBe("over");
  });
});

// ── Pending EAD ───────────────────────────────────────────────────────────

describe("computePendingEad", () => {
  it("returns daysSinceFiling when i765 is filed and EAD not received", () => {
    const r = computePendingEad("2027-01-01", false, "2027-03-01");
    expect(r).not.toBeNull();
    expect(r!.daysSinceFiling).toBe(59);
  });

  it("returns null when eadReceived is true", () => {
    expect(computePendingEad("2027-01-01", true, "2027-03-01")).toBeNull();
  });

  it("returns null when no filing date", () => {
    expect(computePendingEad(undefined, false, "2027-03-01")).toBeNull();
  });
});

// ── diffDays ──────────────────────────────────────────────────────────────

describe("diffDays", () => {
  it("returns 0 for same date", () => {
    expect(diffDays("2027-06-30", "2027-06-30")).toBe(0);
  });

  it("correctly crosses a month boundary", () => {
    expect(diffDays("2027-01-31", "2027-02-01")).toBe(1);
  });

  it("correctly crosses a year boundary", () => {
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
  });
});

// ── deriveStemStartDate ───────────────────────────────────────────────────

describe("deriveStemStartDate", () => {
  it("derives 2026-01-20 from end date 2028-01-19", () => {
    expect(deriveStemStartDate("2028-01-19")).toBe("2026-01-20");
  });

  it("derives 2026-06-15 from end date 2028-06-14", () => {
    expect(deriveStemStartDate("2028-06-14")).toBe("2026-06-15");
  });
});

// ── getStemReporting — exact date fixtures ────────────────────────────────

describe("getStemReporting — STEM start 2026-01-20", () => {
  const items = getStemReporting("2026-01-20", "2026-01-01");

  it("returns exactly four items", () => {
    expect(items).toHaveLength(4);
  });

  it("6-month due date is 2026-07-20", () => {
    expect(items[0].dueDate).toBe("2026-07-20");
  });
  it("12-month due date is 2027-01-20", () => {
    expect(items[1].dueDate).toBe("2027-01-20");
  });
  it("18-month due date is 2027-07-20", () => {
    expect(items[2].dueDate).toBe("2027-07-20");
  });
  it("24-month due date is 2028-01-20", () => {
    expect(items[3].dueDate).toBe("2028-01-20");
  });

  it("6-month does not include self-evaluation", () => {
    expect(items[0].includesSelfEvaluation).toBe(false);
  });
  it("12-month includes self-evaluation", () => {
    expect(items[1].includesSelfEvaluation).toBe(true);
  });
  it("18-month does not include self-evaluation", () => {
    expect(items[2].includesSelfEvaluation).toBe(false);
  });
  it("24-month includes self-evaluation", () => {
    expect(items[3].includesSelfEvaluation).toBe(true);
  });

  it("month marks are 6, 12, 18, 24", () => {
    expect(items.map((i) => i.monthMark)).toEqual([6, 12, 18, 24]);
  });
});

describe("getStemReporting — STEM start 2026-08-31 (month-end clamping)", () => {
  const items = getStemReporting("2026-08-31", "2026-01-01");

  it("6-month clamps to Feb 28 (non-leap 2027)", () => {
    expect(items[0].dueDate).toBe("2027-02-28");
  });
  it("12-month stays Aug 31 (2027)", () => {
    expect(items[1].dueDate).toBe("2027-08-31");
  });
  it("18-month clamps to Feb 29 (leap 2028)", () => {
    expect(items[2].dueDate).toBe("2028-02-29");
  });
  it("24-month stays Aug 31 (2028)", () => {
    expect(items[3].dueDate).toBe("2028-08-31");
  });
});

// ── getStemReporting — status transitions ─────────────────────────────────

describe("getStemReporting — status transitions for start 2026-01-20", () => {
  // First mark: due 2026-07-20, submit-by 2026-07-30.

  it("status is upcoming when today is before dueDate", () => {
    expect(getStemReporting("2026-01-20", "2026-07-19")[0].status).toBe("upcoming");
  });
  it("status is due on dueDate itself", () => {
    expect(getStemReporting("2026-01-20", "2026-07-20")[0].status).toBe("due");
  });
  it("status is due inside the submit-by window", () => {
    expect(getStemReporting("2026-01-20", "2026-07-25")[0].status).toBe("due");
  });
  it("status is due on submit-by date", () => {
    expect(getStemReporting("2026-01-20", "2026-07-30")[0].status).toBe("due");
  });
  it("status is past after submit-by date", () => {
    expect(getStemReporting("2026-01-20", "2026-07-31")[0].status).toBe("past");
  });
});

// ── getNextSteps — STEM OPT reporting ─────────────────────────────────────

describe("getNextSteps — STEM OPT reporting marks", () => {
  // today before all marks
  it("shows the 6-month mark when no marks are completed", () => {
    const steps = getNextSteps(
      { stage: "on-stem-opt", stemStartDate: "2026-01-20" },
      "2026-01-21"
    );
    const r = steps.find((s) => s.title.includes("STEM OPT report"));
    expect(r?.title).toMatch(/^6-month/);
    expect(r?.date).toBe("2026-07-20");
  });

  it("skips the 6-month mark when it is completed and shows the 12-month mark", () => {
    const steps = getNextSteps(
      { stage: "on-stem-opt", stemStartDate: "2026-01-20", reportingCompleted: [6] },
      "2026-08-01"
    );
    const r = steps.find((s) => s.title.includes("STEM OPT report"));
    expect(r?.title).toMatch(/^12-month/);
    expect(r?.date).toBe("2027-01-20");
  });

  it("shows no report step when all marks are completed", () => {
    const steps = getNextSteps(
      {
        stage: "on-stem-opt",
        stemStartDate: "2026-01-20",
        reportingCompleted: [6, 12, 18, 24],
      },
      "2028-02-01"
    );
    expect(steps.every((s) => !s.title.includes("STEM OPT report"))).toBe(true);
  });

  it("shows no report step when stemStartDate is missing", () => {
    const steps = getNextSteps({ stage: "on-stem-opt" }, "2026-08-01");
    expect(steps.every((s) => !s.title.includes("STEM OPT report"))).toBe(true);
  });

  it("12-month step title mentions self-evaluation", () => {
    const steps = getNextSteps(
      { stage: "on-stem-opt", stemStartDate: "2026-01-20", reportingCompleted: [6] },
      "2026-08-01"
    );
    const r = steps.find((s) => s.title.includes("STEM OPT report"));
    expect(r?.title).toContain("self-evaluation");
  });
});
