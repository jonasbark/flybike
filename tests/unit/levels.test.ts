import { describe, expect, it } from "vitest";
import { defaultLevelSettings, settingsFingerprint } from "../../src/levels";

describe("level settings", () => {
  it("provides stable defaults for every level", () => {
    expect(defaultLevelSettings("ornithopter-run")).toEqual({
      mapId: "village-sky",
      difficulty: "standard",
      optionId: "random",
      modifierId: "upper-on",
    });
    expect(defaultLevelSettings("hill-climber")).toEqual({
      mapId: "rolling-meadows",
      difficulty: "standard",
      optionId: undefined,
      modifierId: undefined,
      courseLengthKm: 5,
      maxElevationM: 1000,
      steepnessStyle: "mixed",
    });
  });

  it("keys scores by every selected setting", () => {
    const base = { mapId: "highlands", difficulty: "expert" as const };
    expect(settingsFingerprint(base, 1.5)).toBe("highlands.expert.default.default.terrain-1.5");
    expect(settingsFingerprint({ ...base, optionId: "large" })).toBe(
      "highlands.expert.large.default",
    );
    expect(
      settingsFingerprint({
        ...base,
        courseLengthKm: 25,
        maxElevationM: 2000,
        steepnessStyle: "steep",
      }),
    ).toContain("length-25.elevation-2000.slopes-steep");
  });
});
