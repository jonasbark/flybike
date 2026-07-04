import { describe, expect, it } from "vitest";
import {
  groupRideHistory,
  rideTotals,
  ridesSince,
  startOfPeriod,
  validateRideHistory,
  type RideHistoryEntry,
} from "../../src/ride-history";

const ride = (startedAt: string, distanceKm = 10): RideHistoryEntry => ({
  id: startedAt,
  startedAt,
  endedAt: new Date(Date.parse(startedAt) + 3_600_000).toISOString(),
  durationMs: 3_600_000,
  distanceKm,
  levelId: "hill-climber",
  settings: { mapId: "rolling-meadows", difficulty: "standard" },
  score: 10,
  completed: true,
  powerCurve: [
    { elapsedSeconds: 0, powerW: 100 },
    { elapsedSeconds: 5, powerW: 200 },
  ],
});

describe("ride history", () => {
  it("aggregates distance, time, and power", () => {
    expect(rideTotals([ride("2026-07-04T10:00:00Z"), ride("2026-07-03T10:00:00Z", 20)])).toEqual({
      rides: 2,
      durationMs: 7_200_000,
      distanceKm: 30,
      averagePowerW: 150,
      maximumPowerW: 200,
    });
  });

  it("filters and groups calendar periods", () => {
    const entries = [ride("2026-07-04T10:00:00Z"), ride("2026-06-03T10:00:00Z")];
    expect(ridesSince(entries, new Date("2026-07-01T00:00:00Z"))).toHaveLength(1);
    expect(groupRideHistory(entries, "month")).toHaveLength(2);
    expect(startOfPeriod("year", new Date("2026-07-04T12:00:00Z")).getMonth()).toBe(0);
  });

  it("rejects malformed imports", () => {
    expect(validateRideHistory([ride("2026-07-04T10:00:00Z")])).toHaveLength(1);
    expect(() => validateRideHistory([{ nope: true }])).toThrow();
  });
});
