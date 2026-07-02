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
