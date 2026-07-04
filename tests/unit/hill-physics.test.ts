import { describe, expect, it } from "vitest";
import {
  generateHillCourse,
  hillCourseElevation,
  hillCourseGradePercent,
  hillElevationZone,
  hillTargetSpeed,
} from "../../src/game/hill-physics";

describe("hillTargetSpeed", () => {
  it("requires more power to hold speed uphill", () => {
    const flatSpeed = hillTargetSpeed(120, 240, 0);
    expect(hillTargetSpeed(120, 240, 8)).toBeLessThan(flatSpeed);
    expect(hillTargetSpeed(210, 240, 8)).toBeGreaterThanOrEqual(flatSpeed);
  });

  it("allows downhill coasting and strongly rewards downhill pedaling", () => {
    expect(hillTargetSpeed(0, 240, -8)).toBeGreaterThan(0);
    expect(hillTargetSpeed(240, 240, -8)).toBeGreaterThan(hillTargetSpeed(240, 240, 0));
  });
});

describe("generated hill courses", () => {
  it("is deterministic, starts and ends low, and reaches the requested elevation", () => {
    const course = generateHillCourse(25, 2000, "mixed", 42);
    expect(generateHillCourse(25, 2000, "mixed", 42).elevations).toEqual(course.elevations);
    expect(hillCourseElevation(course, 0)).toBeCloseTo(0);
    expect(hillCourseElevation(course, 25)).toBeCloseTo(0);
    expect(Math.max(...course.elevations)).toBeCloseTo(2000);
  });

  it("caps physical grade by slope style and assigns elevation scenery zones", () => {
    const gentle = generateHillCourse(2.5, 4000, "gentle", 9);
    const steep = generateHillCourse(2.5, 4000, "steep", 9);
    expect(Math.abs(hillCourseGradePercent(gentle, 1))).toBeLessThanOrEqual(6);
    expect(Math.abs(hillCourseGradePercent(steep, 1))).toBeLessThanOrEqual(15);
    expect(hillElevationZone(900, 1000)).toBe(4);
  });
});
