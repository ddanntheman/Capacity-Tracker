import { describe, it, expect } from "vitest";
import { mondayOf, weekRange, shiftWeeks, weekLabel } from "./weeks";

describe("weeks helper functions", () => {
  describe("mondayOf", () => {
    it("should return the Monday of the week for a given date", () => {
      // 2026-06-03 is Wednesday
      const date = new Date("2026-06-03T12:00:00");
      expect(mondayOf(date)).toBe("2026-06-01");
    });

    it("should return the same date if the date is a Monday", () => {
      // 2026-06-01 is Monday
      const date = new Date("2026-06-01T12:00:00");
      expect(mondayOf(date)).toBe("2026-06-01");
    });
  });

  describe("weekRange", () => {
    it("should return range of consecutive Monday ISO dates", () => {
      const start = "2026-06-01";
      const range = weekRange(start, 3);
      expect(range).toEqual(["2026-06-01", "2026-06-08", "2026-06-15"]);
    });
  });

  describe("shiftWeeks", () => {
    it("should shift a week start ISO date forward", () => {
      expect(shiftWeeks("2026-06-01", 1)).toBe("2026-06-08");
    });

    it("should shift a week start ISO date backward", () => {
      expect(shiftWeeks("2026-06-01", -2)).toBe("2026-05-18");
    });
  });

  describe("weekLabel", () => {
    it("should return a formatted label for the week", () => {
      expect(weekLabel("2026-06-01")).toBe("Jun 1");
    });
  });
});
