import type { LevelId, LevelSettings } from "./levels";

export type PowerPoint = { elapsedSeconds: number; powerW: number };

export type RideHistoryEntry = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  distanceKm: number;
  levelId: LevelId;
  settings: LevelSettings;
  score: number;
  completed: boolean;
  powerCurve: PowerPoint[];
};

export type RideTotals = {
  rides: number;
  durationMs: number;
  distanceKm: number;
  averagePowerW: number;
  maximumPowerW: number;
};

export const RIDE_HISTORY_KEY = "flybike.rideHistory.v1";

export function loadRideHistory(
  storage: Pick<Storage, "getItem"> = localStorage,
): RideHistoryEntry[] {
  try {
    const value = JSON.parse(storage.getItem(RIDE_HISTORY_KEY) ?? "[]") as unknown;
    return validateRideHistory(value);
  } catch {
    return [];
  }
}

export function saveRideHistory(
  entries: RideHistoryEntry[],
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  let retained = entries.slice(0, 250);
  while (retained.length) {
    try {
      storage.setItem(RIDE_HISTORY_KEY, JSON.stringify(retained));
      return;
    } catch {
      retained = retained.slice(0, Math.floor(retained.length * 0.75));
    }
  }
  storage.setItem(RIDE_HISTORY_KEY, "[]");
}

export function validateRideHistory(value: unknown): RideHistoryEntry[] {
  if (!Array.isArray(value)) throw new Error("Ride history must be a JSON array.");
  return value.map((entry): RideHistoryEntry => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid ride entry.");
    const item = entry as Partial<RideHistoryEntry>;
    if (
      typeof item.id !== "string" ||
      !item.startedAt ||
      Number.isNaN(Date.parse(item.startedAt)) ||
      !item.endedAt ||
      Number.isNaN(Date.parse(item.endedAt)) ||
      typeof item.durationMs !== "number" ||
      typeof item.distanceKm !== "number" ||
      typeof item.levelId !== "string" ||
      !item.settings ||
      typeof item.score !== "number" ||
      !Array.isArray(item.powerCurve)
    ) {
      throw new Error("Ride history contains an invalid entry.");
    }
    return item as RideHistoryEntry;
  });
}

export function rideTotals(entries: RideHistoryEntry[]): RideTotals {
  const powers = entries.flatMap((entry) => entry.powerCurve.map(({ powerW }) => powerW));
  return {
    rides: entries.length,
    durationMs: entries.reduce((total, entry) => total + entry.durationMs, 0),
    distanceKm: entries.reduce((total, entry) => total + entry.distanceKm, 0),
    averagePowerW: powers.length
      ? Math.round(powers.reduce((total, power) => total + power, 0) / powers.length)
      : 0,
    maximumPowerW: powers.length ? Math.max(...powers) : 0,
  };
}

export function ridesSince(entries: RideHistoryEntry[], start: Date): RideHistoryEntry[] {
  return entries.filter((entry) => new Date(entry.startedAt) >= start);
}

export function startOfPeriod(period: "day" | "week" | "month" | "year", now: Date): Date {
  const result = new Date(now);
  if (period === "day") result.setHours(0, 0, 0, 0);
  if (period === "week") {
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  }
  if (period === "month") result.setFullYear(result.getFullYear(), result.getMonth(), 1);
  if (period === "year") result.setFullYear(result.getFullYear(), 0, 1);
  if (period === "month" || period === "year") result.setHours(0, 0, 0, 0);
  return result;
}

export function groupRideHistory(
  entries: RideHistoryEntry[],
  unit: "day" | "month" | "year",
): Array<{ key: string; totals: RideTotals }> {
  const groups = new Map<string, RideHistoryEntry[]>();
  for (const entry of entries) {
    const date = new Date(entry.startedAt);
    const key =
      unit === "day"
        ? date.toLocaleDateString()
        : unit === "month"
          ? date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
          : String(date.getFullYear());
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].map(([key, rides]) => ({ key, totals: rideTotals(rides) }));
}
