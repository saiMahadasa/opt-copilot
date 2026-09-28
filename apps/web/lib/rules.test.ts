import { describe, it, expect } from "vitest";
import {
  addDays,
  diffDays,
  computeOptFilingWindow,
  computeGracePeriod,
  computeStemFilingWindow,
  computeUnemployment,
  computePendingEad,
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
