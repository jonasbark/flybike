export function hillTerrainY(worldX: number, mapId = "rolling-meadows"): number {
  if (mapId === "highlands") {
    return (
      126 +
      Math.sin(worldX / 112) * 21 +
      Math.sin(worldX / 44 + 0.5) * 8 +
      Math.sin(worldX / 250 + 1.8) * 7
    );
  }
  if (mapId === "long-climbs") {
    return 126 + Math.sin(worldX / 285) * 25 + Math.sin(worldX / 105 + 1.1) * 7;
  }
  return (
    126 +
    Math.sin(worldX / 160) * 17 +
    Math.sin(worldX / 62 + 0.8) * 6 +
    Math.sin(worldX / 330 + 2.1) * 10
  );
}

export function hillTerrainDerivative(worldX: number, mapId = "rolling-meadows"): number {
  if (mapId === "highlands") {
    return (
      (Math.cos(worldX / 112) * 21) / 112 +
      (Math.cos(worldX / 44 + 0.5) * 8) / 44 +
      (Math.cos(worldX / 250 + 1.8) * 7) / 250
    );
  }
  if (mapId === "long-climbs") {
    return (Math.cos(worldX / 285) * 25) / 285 + (Math.cos(worldX / 105 + 1.1) * 7) / 105;
  }
  return (
    (Math.cos(worldX / 160) * 17) / 160 +
    (Math.cos(worldX / 62 + 0.8) * 6) / 62 +
    (Math.cos(worldX / 330 + 2.1) * 10) / 330
  );
}

export function hillGradePercent(worldX: number, mapId = "rolling-meadows"): number {
  return Math.max(-14, Math.min(14, -hillTerrainDerivative(worldX, mapId) * 100));
}

export function hillTargetSpeed(powerW: number, hardPowerW: number, gradePercent: number): number {
  const normalizedEffort = Math.max(0, Math.min(1, powerW / hardPowerW));
  const pedalingSpeed = normalizedEffort * 78;
  const downhillBoost = Math.max(0, -gradePercent) * 4.8;
  const uphillPenalty = Math.max(0, gradePercent) * 3.5;
  return Math.max(0, Math.min(126, pedalingSpeed + downhillBoost - uphillPenalty));
}

export type HillSteepness = "gentle" | "moderate" | "steep" | "mixed";

export type HillCourse = {
  lengthKm: number;
  maxElevationM: number;
  steepness: HillSteepness;
  seed: number;
  elevations: number[];
};

function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function generateHillCourse(
  lengthKm: number,
  maxElevationM: number,
  steepness: HillSteepness,
  seed: number,
): HillCourse {
  const random = randomSource(seed);
  const sampleCount = 257;
  const roughness = steepness === "gentle" ? 0.08 : steepness === "steep" ? 0.2 : 0.13;
  const peakCount = Math.max(1, Math.min(5, Math.round(lengthKm / 18 + random() * 1.5)));
  const peaks = Array.from({ length: peakCount }, (_, index) => ({
    center: (index + 1) / (peakCount + 1) + (random() - 0.5) * (0.18 / peakCount),
    width:
      (steepness === "gentle" ? 0.3 : steepness === "steep" ? 0.13 : 0.21) / Math.sqrt(peakCount),
    height: 0.78 + random() * 0.22,
  }));
  const raw = Array.from({ length: sampleCount }, (_, index) => {
    const t = index / (sampleCount - 1);
    const mountain = Math.max(
      ...peaks.map(
        (peak) => peak.height * Math.exp(-Math.pow((t - peak.center) / peak.width, 2) / 2),
      ),
    );
    const undulation = Math.sin(t * Math.PI * (peakCount * 4 + 3) + random() * 0.15) * roughness;
    return Math.max(0, (mountain + undulation) * Math.sin(Math.PI * t));
  });
  const maximum = Math.max(...raw);
  return {
    lengthKm,
    maxElevationM,
    steepness,
    seed,
    elevations: raw.map((value) => (value / maximum) * maxElevationM),
  };
}

export function hillCourseElevation(course: HillCourse, distanceKm: number): number {
  const position = Math.max(0, Math.min(1, distanceKm / course.lengthKm));
  const scaled = position * (course.elevations.length - 1);
  const index = Math.min(course.elevations.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  return course.elevations[index]! * (1 - fraction) + course.elevations[index + 1]! * fraction;
}

export function hillCourseGradePercent(course: HillCourse, distanceKm: number): number {
  const stepKm = course.lengthKm / (course.elevations.length - 1);
  const before = hillCourseElevation(course, distanceKm - stepKm / 2);
  const after = hillCourseElevation(course, distanceKm + stepKm / 2);
  const rawGrade = ((after - before) / (stepKm * 1000)) * 100;
  const cap =
    course.steepness === "gentle"
      ? 6
      : course.steepness === "moderate"
        ? 10
        : course.steepness === "steep"
          ? 15
          : 12;
  return Math.max(-cap, Math.min(cap, rawGrade));
}

export function hillElevationZone(elevationM: number, maximumM: number): number {
  return Math.max(0, Math.min(4, Math.floor((elevationM / Math.max(1, maximumM)) * 5)));
}
