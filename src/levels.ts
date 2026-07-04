export const DIFFICULTIES = [
  { id: "relaxed", label: "Relaxed" },
  { id: "standard", label: "Standard" },
  { id: "expert", label: "Expert" },
] as const;

export type DifficultyId = (typeof DIFFICULTIES)[number]["id"];

export type LevelChoice = {
  id: string;
  label: string;
};

export type LevelSettings = {
  mapId: string;
  difficulty: DifficultyId;
  optionId?: string;
  modifierId?: string;
  courseLengthKm?: number;
  maxElevationM?: number;
  steepnessStyle?: "gentle" | "moderate" | "steep" | "mixed";
};

export const HILL_COURSE_LENGTHS = [2.5, 5, 10, 15, 25, 50, 75, 100] as const;
export const HILL_MAX_ELEVATIONS = [500, 1000, 2000, 4000] as const;
export const HILL_STEEPNESS_STYLES = [
  { id: "gentle", label: "Gentle climbs and descents" },
  { id: "moderate", label: "Moderate climbs and descents" },
  { id: "steep", label: "Steep climbs and descents" },
  { id: "mixed", label: "Mixed terrain" },
] as const;

export const LEVELS = [
  {
    id: "ornithopter-run",
    title: "Ornithopter Run",
    description: "Thread Leonardo's pedal-powered flying machine through an endless gate course.",
    scoreLabel: "gates",
    maps: [
      { id: "village-sky", label: "Village Sky" },
      { id: "sunset-range", label: "Sunset Range" },
      { id: "moonlit-peaks", label: "Moonlit Peaks" },
    ],
    optionLabel: "Gate pattern",
    options: [
      { id: "random", label: "Random" },
      { id: "rolling", label: "Rolling" },
      { id: "alternating", label: "Alternating" },
    ],
    modifierLabel: "Upper gate",
    modifiers: [
      { id: "upper-on", label: "Enabled" },
      { id: "upper-off", label: "Disabled — ride hard freely" },
    ],
  },
  {
    id: "asteroids",
    title: "Asteroids",
    description: "Pedal higher or ease lower to dodge an accelerating field of space rocks.",
    scoreLabel: "asteroids",
    maps: [
      { id: "deep-space", label: "Deep Space" },
      { id: "red-nebula", label: "Red Nebula" },
      { id: "ice-nebula", label: "Ice Nebula" },
    ],
    optionLabel: "Rock field",
    options: [
      { id: "small", label: "Small rocks" },
      { id: "mixed", label: "Mixed rocks" },
      { id: "large", label: "Large rocks" },
    ],
  },
  {
    id: "racer",
    title: "Racer",
    description:
      "Race an overhead circuit: pedal harder for speed and the outer line; ease for the inside.",
    scoreLabel: "laps",
    maps: [
      { id: "meadow-circuit", label: "Meadow Circuit" },
      { id: "desert-circuit", label: "Desert Circuit" },
      { id: "night-circuit", label: "Night Circuit" },
    ],
    optionLabel: "Rivals",
    options: [
      { id: "solo", label: "Solo time trial" },
      { id: "trio", label: "Three rivals" },
      { id: "pack", label: "Five rivals" },
    ],
  },
  {
    id: "hill-climber",
    title: "Hill Climber",
    description:
      "Ride a generated mountain course where altitude, scenery, and resistance follow every slope.",
    scoreLabel: "km",
    maps: [
      { id: "rolling-meadows", label: "Rolling Meadows" },
      { id: "highlands", label: "Highlands" },
      { id: "long-climbs", label: "Long Climbs" },
    ],
  },
  {
    id: "submarine-dive",
    title: "Submarine Dive",
    description:
      "Control depth through an underwater world of mines, reefs, bubbles, and shifting currents.",
    scoreLabel: "hazards",
    maps: [
      { id: "coral-sea", label: "Coral Sea" },
      { id: "midnight-trench", label: "Midnight Trench" },
      { id: "arctic-depths", label: "Arctic Depths" },
    ],
    optionLabel: "Hazards",
    options: [
      { id: "mines", label: "Naval mines" },
      { id: "reefs", label: "Coral reefs" },
      { id: "mixed-sea", label: "Mixed hazards" },
    ],
  },
  {
    id: "dragon-flight",
    title: "Dragon Flight",
    description:
      "Collect as many enchanted sky rings as possible during a forgiving five-minute flight.",
    scoreLabel: "rings",
    maps: [
      { id: "emerald-valley", label: "Emerald Valley" },
      { id: "volcanic-sky", label: "Volcanic Sky" },
      { id: "moon-kingdom", label: "Moon Kingdom" },
    ],
    optionLabel: "Ring path",
    options: [
      { id: "random-rings", label: "Random" },
      { id: "rolling-rings", label: "Rolling" },
      { id: "alternating-rings", label: "Alternating" },
    ],
  },
] as const;

export type LevelId = (typeof LEVELS)[number]["id"];

export function getLevel(levelId: LevelId) {
  return LEVELS.find(({ id }) => id === levelId) ?? LEVELS[0];
}

export function defaultLevelSettings(levelId: LevelId): LevelSettings {
  const level = getLevel(levelId);
  const settings: LevelSettings = {
    mapId: level.maps[0].id,
    difficulty: "standard",
    optionId: "options" in level ? level.options[0].id : undefined,
    modifierId: "modifiers" in level ? level.modifiers[0].id : undefined,
  };
  if (levelId === "hill-climber") {
    settings.courseLengthKm = 5;
    settings.maxElevationM = 1000;
    settings.steepnessStyle = "mixed";
  }
  return settings;
}

export function settingsFingerprint(settings: LevelSettings, terrainEffectScale?: number): string {
  const parts = [
    settings.mapId,
    settings.difficulty,
    settings.optionId ?? "default",
    settings.modifierId ?? "default",
  ];
  if (settings.courseLengthKm !== undefined) parts.push(`length-${settings.courseLengthKm}`);
  if (settings.maxElevationM !== undefined) parts.push(`elevation-${settings.maxElevationM}`);
  if (settings.steepnessStyle !== undefined) parts.push(`slopes-${settings.steepnessStyle}`);
  if (terrainEffectScale !== undefined) parts.push(`terrain-${terrainEffectScale}`);
  return parts.join(".").replaceAll(/[^a-z0-9.-]/gi, "-");
}
