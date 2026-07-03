import Phaser from "phaser";
import type { CalibrationProfile } from "../calibration";
import { EffortMapper, TRAINER_VELOCITY_RESPONSE_MS, trainerAltitudeVelocity } from "../effort";
import type { LevelId, LevelSettings } from "../levels";
import { emitGameEvent, gameEvents } from "./events";
import {
  hillGradePercent,
  hillTargetSpeed,
  hillTerrainDerivative,
  hillTerrainY,
} from "./hill-physics";

type ObstaclePair = {
  top: Phaser.GameObjects.Rectangle;
  bottom: Phaser.GameObjects.Rectangle;
  topCap: Phaser.GameObjects.Rectangle;
  bottomCap: Phaser.GameObjects.Rectangle;
  scored: boolean;
};

type AsteroidObstacle = {
  body: Phaser.GameObjects.Image;
  radius: number;
  spin: number;
  scored: boolean;
};

type SeaObstacle = {
  body: Phaser.GameObjects.Image;
  radius: number;
  scored: boolean;
};

type DragonRing = {
  body: Phaser.GameObjects.Arc;
  radius: number;
  resolved: boolean;
};

type RaceRival = {
  body: Phaser.GameObjects.Container;
  startProgress: number;
  progress: number;
  lane: number;
  speed: number;
};

type StartRunDetail = {
  profile: CalibrationProfile;
  demo: boolean;
  mode: "game" | "trace";
  levelId: LevelId;
  settings: LevelSettings;
};

type PauseRunDetail = {
  reason: "ui" | "signal";
};

type PreviewLevelDetail = {
  levelId: LevelId;
  settings: LevelSettings;
};

export type TrajectoryPoint = {
  elapsedMs: number;
  y: number;
  velocityY: number;
  targetVelocityY: number;
};

const WIDTH = 320;
const HEIGHT = 180;
const PLAYER_X = 65;
const PLAYER_WIDTH = 66;
const PLAYER_HEIGHT = 44;
const PITCH_STEP = Phaser.Math.DegToRad(2);
const HILL_PLAYER_X = 76;
const DRAGON_RUN_SECONDS = 5 * 60;
const DRAGON_RING_COLLECTION_MARGIN = 6;
const RACER_TRACKS = {
  "meadow-circuit": [
    { x: 55, y: 143 },
    { x: 125, y: 148 },
    { x: 171, y: 126 },
    { x: 238, y: 143 },
    { x: 286, y: 119 },
    { x: 270, y: 78 },
    { x: 221, y: 66 },
    { x: 195, y: 33 },
    { x: 130, y: 31 },
    { x: 94, y: 55 },
    { x: 45, y: 43 },
    { x: 28, y: 83 },
    { x: 38, y: 119 },
  ],
  "desert-circuit": [
    { x: 48, y: 142 },
    { x: 119, y: 146 },
    { x: 157, y: 111 },
    { x: 210, y: 147 },
    { x: 279, y: 132 },
    { x: 286, y: 86 },
    { x: 245, y: 54 },
    { x: 184, y: 65 },
    { x: 151, y: 29 },
    { x: 86, y: 34 },
    { x: 43, y: 61 },
    { x: 29, y: 104 },
  ],
  "night-circuit": [
    { x: 49, y: 139 },
    { x: 103, y: 151 },
    { x: 149, y: 132 },
    { x: 190, y: 153 },
    { x: 266, y: 137 },
    { x: 288, y: 101 },
    { x: 260, y: 71 },
    { x: 213, y: 82 },
    { x: 190, y: 43 },
    { x: 132, y: 27 },
    { x: 79, y: 48 },
    { x: 35, y: 42 },
    { x: 24, y: 88 },
  ],
} as const;

export class FlyScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private ornithopterPedals!: Phaser.GameObjects.Graphics;
  private shadow!: Phaser.GameObjects.Ellipse;
  private skyBackdrop!: Phaser.GameObjects.Container;
  private spaceBackdrop!: Phaser.GameObjects.Container;
  private racerBackdrop!: Phaser.GameObjects.Container;
  private hillBackdrop!: Phaser.GameObjects.Container;
  private submarineBackdrop!: Phaser.GameObjects.Container;
  private dragonBackdrop!: Phaser.GameObjects.Container;
  private skyMapOverlay!: Phaser.GameObjects.Rectangle;
  private spaceMapOverlay!: Phaser.GameObjects.Rectangle;
  private racerMapOverlay!: Phaser.GameObjects.Rectangle;
  private racerTrack!: Phaser.GameObjects.Graphics;
  private hillMapOverlay!: Phaser.GameObjects.Rectangle;
  private submarineMapOverlay!: Phaser.GameObjects.Rectangle;
  private dragonMapOverlay!: Phaser.GameObjects.Rectangle;
  private clouds: Phaser.GameObjects.Ellipse[] = [];
  private skyParallaxLayers: Array<{ container: Phaser.GameObjects.Container; speed: number }> = [];
  private stars: Phaser.GameObjects.Rectangle[] = [];
  private bubbles: Phaser.GameObjects.Arc[] = [];
  private dragonClouds: Phaser.GameObjects.Ellipse[] = [];
  private seaMotes: Phaser.GameObjects.Arc[] = [];
  private dragonMotes: Phaser.GameObjects.Arc[] = [];
  private submarineParallaxLayers: Array<{
    container: Phaser.GameObjects.Container;
    speed: number;
  }> = [];
  private dragonParallaxLayers: Array<{
    container: Phaser.GameObjects.Container;
    speed: number;
  }> = [];
  private racerPlayer!: Phaser.GameObjects.Container;
  private hillPlayer!: Phaser.GameObjects.Container;
  private hillPedals?: Phaser.GameObjects.Graphics;
  private submarinePlayer!: Phaser.GameObjects.Sprite;
  private dragonPlayer!: Phaser.GameObjects.Sprite;
  private hillFarTerrain!: Phaser.GameObjects.Graphics;
  private hillMidTerrain!: Phaser.GameObjects.Graphics;
  private hillGround!: Phaser.GameObjects.Graphics;
  private raceRivals: RaceRival[] = [];
  private obstacles: ObstaclePair[] = [];
  private asteroids: AsteroidObstacle[] = [];
  private seaObstacles: SeaObstacle[] = [];
  private dragonRings: DragonRing[] = [];
  private mapper?: EffortMapper;
  private powerW = 0;
  private cadenceRpm?: number;
  private displayedCadenceRpm = 0;
  private pedalPhase = 0;
  private lastTelemetryAt = 0;
  private velocityY = 0;
  private running = false;
  private pausedForSignal = false;
  private waitingForSignal = false;
  private elapsed = 0;
  private spawnElapsed = 0;
  private score = 0;
  private velocityResponseMs = 350;
  private mode: "game" | "trace" = "game";
  private rawPlayerY = 88;
  private lastTrajectoryAt = 0;
  private trainerRun = false;
  private levelId: LevelId = "ornithopter-run";
  private levelSettings: LevelSettings = {
    mapId: "village-sky",
    difficulty: "standard",
    optionId: "random",
  };
  private racerProgress = 0;
  private racerSpeed = 0;
  private racerLane = 0;
  private racerHardPowerW = 260;
  private hillDistance = 0;
  private hillSpeed = 0;
  private hillStallElapsed = 0;
  private hillHardPowerW = 260;
  private lastTerrainGradeAt = 0;

  constructor() {
    super("fly");
  }

  preload(): void {
    this.load.image("ornithopter", "assets/ornithopter.png");
    this.load.spritesheet("submarine-dive", "assets/submarine-dive-sheet.png", {
      frameWidth: 362,
      frameHeight: 350,
    });
    this.load.spritesheet("dragon-flight", "assets/dragon-flight-sheet-v2.png", {
      frameWidth: 430,
      frameHeight: 430,
    });
    this.load.spritesheet("asteroid-art", "assets/asteroids-sheet.png", {
      frameWidth: 362,
      frameHeight: 410,
    });
    this.load.spritesheet("sea-art", "assets/sea-sheet.png", {
      frameWidth: 362,
      frameHeight: 505,
    });
  }

  create(): void {
    this.cameras.main
      .setBounds(0, 0, WIDTH, HEIGHT)
      .setZoom(3)
      .centerOn(WIDTH / 2, HEIGHT / 2);
    // The generated sprite contains much finer detail than the logical game grid.
    // Linear filtering avoids nearest-neighbor shimmer while it is pitched in flight.
    this.textures.get("ornithopter").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("submarine-dive").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("dragon-flight").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.createBackdrops();
    this.shadow = this.add.ellipse(PLAYER_X, 158, 38, 5, 0x553a2c, 0.16);
    this.player = this.add
      .image(PLAYER_X, 88, "ornithopter")
      .setDisplaySize(PLAYER_WIDTH, PLAYER_HEIGHT);
    this.player.setOrigin(0.5);
    this.ornithopterPedals = this.add.graphics().setPosition(PLAYER_X, 88).setDepth(2);
    this.drawOrnithopterPedals();
    this.createRaceCars();
    this.createHillBike();
    this.createSubmarine();
    this.createDragon();
    this.setBackdrop("ornithopter-run");

    gameEvents.addEventListener("start-run", this.onStartRun);
    gameEvents.addEventListener("preview-level", this.onPreviewLevel);
    gameEvents.addEventListener("telemetry", this.onTelemetry);
    gameEvents.addEventListener("pause-run", this.onPauseRun);
    gameEvents.addEventListener("resume-run", this.onResumeRun);
    gameEvents.addEventListener("stop-run", this.onStopRun);

    emitGameEvent("scene-ready", undefined);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.animateBackdrop(dt);
    this.animateOrnithopterPedals(dt);
    if (!this.running || this.pausedForSignal || !this.mapper) return;

    this.elapsed += dt;
    this.spawnElapsed += dt;
    const effortVelocity = this.mapper.update(this.powerW, delta);
    if (this.levelId === "racer") {
      this.updateRacer(dt);
      this.checkTelemetryHealth();
      return;
    }
    if (this.levelId === "hill-climber") {
      this.updateHillClimber(dt);
      this.checkTelemetryHealth();
      return;
    }
    const targetVelocity = this.trainerRun
      ? this.trainerTargetVelocity(effortVelocity)
      : effortVelocity;
    const velocityEase = 1 - Math.exp(-delta / this.velocityResponseMs);
    this.velocityY += (targetVelocity - this.velocityY) * velocityEase;
    this.rawPlayerY += this.velocityY * dt;
    if (this.levelId === "asteroids") {
      this.rawPlayerY = Phaser.Math.Wrap(this.rawPlayerY, 0, HEIGHT);
    }
    if (this.levelId === "dragon-flight") {
      const clampedY = Phaser.Math.Clamp(this.rawPlayerY, 8, HEIGHT - 8);
      if (clampedY !== this.rawPlayerY) this.velocityY = 0;
      this.rawPlayerY = clampedY;
    }
    if (
      this.levelId === "ornithopter-run" &&
      this.levelSettings.modifierId === "upper-off" &&
      this.rawPlayerY < 10
    ) {
      this.rawPlayerY = 10;
      this.velocityY = Math.max(0, this.velocityY);
    }
    this.player.y =
      this.mode === "trace" ? Phaser.Math.Clamp(this.rawPlayerY, 10, HEIGHT - 20) : this.rawPlayerY;
    const targetPitch = Phaser.Math.Clamp(this.velocityY / 500, -0.25, 0.25);
    this.player.rotation = Math.round(targetPitch / PITCH_STEP) * PITCH_STEP;
    this.ornithopterPedals
      .setPosition(this.player.x, this.player.y)
      .setRotation(this.player.rotation);
    if (this.levelId === "submarine-dive")
      this.submarinePlayer.setPosition(PLAYER_X, this.player.y).setRotation(this.player.rotation);
    if (this.levelId === "dragon-flight")
      this.dragonPlayer.setPosition(PLAYER_X, this.player.y).setRotation(this.player.rotation);
    this.shadow.scaleX = Phaser.Math.Clamp(1.25 - this.player.y / HEIGHT, 0.35, 1);
    this.shadow.alpha = Phaser.Math.Clamp(this.player.y / HEIGHT / 4, 0.05, 0.2);

    if (this.mode === "trace") {
      if (performance.now() - this.lastTrajectoryAt >= 100) {
        this.lastTrajectoryAt = performance.now();
        emitGameEvent<TrajectoryPoint>("trajectory", {
          elapsedMs: this.elapsed * 1000,
          y: this.rawPlayerY,
          velocityY: this.velocityY,
          targetVelocityY: targetVelocity,
        });
      }
      this.checkTelemetryHealth();
      return;
    }

    const difficulty = Math.min(1, this.elapsed / 90);
    if (this.levelId === "asteroids") this.updateAsteroids(difficulty, dt);
    else if (this.levelId === "submarine-dive") this.updateSubmarine(difficulty, dt);
    else if (this.levelId === "dragon-flight") this.updateDragon(difficulty, dt);
    else this.updateGates(difficulty, dt);

    if (!this.running) return;
    if (!this.checkTelemetryHealth()) return;
    if (this.collides()) this.endRun();
  }

  private updateGates(difficulty: number, dt: number): void {
    const settingMultiplier = this.difficultyMultiplier();
    const speed =
      (this.trainerRun
        ? Phaser.Math.Linear(38, 60, difficulty)
        : Phaser.Math.Linear(45, 76, difficulty)) * settingMultiplier;
    const spawnEvery =
      (this.trainerRun
        ? Phaser.Math.Linear(2.45, 1.85, difficulty)
        : Phaser.Math.Linear(2.15, 1.55, difficulty)) / settingMultiplier;
    if (this.spawnElapsed >= spawnEvery) {
      this.spawnGate(difficulty);
      this.spawnElapsed = 0;
    }

    for (const pair of this.obstacles) {
      for (const part of [pair.top, pair.bottom, pair.topCap, pair.bottomCap]) part.x -= speed * dt;
      if (!pair.scored && pair.top.x + pair.top.width / 2 < PLAYER_X) {
        pair.scored = true;
        this.incrementScore();
      }
    }
    this.removeOldObstacles();
  }

  private updateAsteroids(difficulty: number, dt: number): void {
    const settingMultiplier = this.difficultyMultiplier();
    const speed =
      (this.trainerRun
        ? Phaser.Math.Linear(42, 70, difficulty)
        : Phaser.Math.Linear(50, 88, difficulty)) * settingMultiplier;
    const spawnEvery =
      (this.trainerRun
        ? Phaser.Math.Linear(2.05, 1.25, difficulty)
        : Phaser.Math.Linear(1.8, 1.05, difficulty)) / settingMultiplier;
    if (this.spawnElapsed >= spawnEvery) {
      this.spawnAsteroid();
      this.spawnElapsed = 0;
    }

    for (const asteroid of this.asteroids) {
      asteroid.body.x -= speed * dt;
      asteroid.body.rotation += asteroid.spin * dt;
      if (!asteroid.scored && asteroid.body.x + asteroid.radius < PLAYER_X) {
        asteroid.scored = true;
        this.incrementScore();
      }
    }
    this.removeOldAsteroids();
  }

  private updateSubmarine(difficulty: number, dt: number): void {
    const settingMultiplier = this.difficultyMultiplier();
    const speed = Phaser.Math.Linear(35, 67, difficulty) * settingMultiplier;
    const spawnEvery = Phaser.Math.Linear(2.35, 1.35, difficulty) / settingMultiplier;
    if (this.spawnElapsed >= spawnEvery) {
      this.spawnSeaObstacle();
      this.spawnElapsed = 0;
    }
    for (const obstacle of this.seaObstacles) {
      obstacle.body.x -= speed * dt;
      obstacle.body.rotation += 0.18 * dt;
      if (!obstacle.scored && obstacle.body.x + obstacle.radius < PLAYER_X) {
        obstacle.scored = true;
        this.incrementScore();
      }
    }
    this.removeOldSeaObstacles();
  }

  private updateDragon(difficulty: number, dt: number): void {
    if (this.elapsed >= DRAGON_RUN_SECONDS) {
      this.completeDragonRun();
      return;
    }
    const settingMultiplier = this.difficultyMultiplier();
    const speed = Phaser.Math.Linear(40, 74, difficulty) * settingMultiplier;
    const spawnEvery = Phaser.Math.Linear(2.6, 1.55, difficulty) / settingMultiplier;
    if (this.spawnElapsed >= spawnEvery) {
      this.spawnDragonRing(difficulty);
      this.spawnElapsed = 0;
    }
    for (const ring of this.dragonRings) {
      ring.body.x -= speed * dt;
      if (!ring.resolved && ring.body.x <= PLAYER_X) {
        ring.resolved = true;
        const playerHalfHeight = this.trainerRun ? 7 : 9;
        const passedThrough =
          Math.abs(this.player.y - ring.body.y) + playerHalfHeight <=
          ring.radius + DRAGON_RING_COLLECTION_MARGIN;
        if (passedThrough) this.collectDragonRing(ring);
      }
    }
    this.removeOldDragonRings();
  }

  private collectDragonRing(ring: DragonRing): void {
    this.incrementScore();
    const { x, y, strokeColor } = ring.body;
    const colors = [strokeColor, 0xffffff, 0xffd36b, 0xe46d9b];
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.18, 0.18);
      const distance = Phaser.Math.Between(15, 34);
      const confetti = this.add
        .rectangle(x, y, index % 3 === 0 ? 3 : 2, index % 2 === 0 ? 1 : 2, colors[index % 4]!)
        .setDepth(4)
        .setRotation(angle);
      this.tweens.add({
        targets: confetti,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance + Phaser.Math.Between(-5, 8),
        rotation: angle + Math.PI * 1.5,
        alpha: 0,
        duration: Phaser.Math.Between(420, 680),
        ease: "Cubic.easeOut",
        onComplete: () => confetti.destroy(),
      });
    }
    this.tweens.add({
      targets: ring.body,
      rotation: Math.PI * 1.5,
      scaleX: 1.45,
      scaleY: 1.45,
      alpha: 0,
      duration: 380,
      ease: "Back.easeIn",
      onComplete: () => ring.body.destroy(),
    });
  }

  private completeDragonRun(): void {
    this.running = false;
    emitGameEvent("run-complete", this.score);
  }

  private updateRacer(dt: number): void {
    const normalizedEffort = Phaser.Math.Clamp(
      this.mapper!.getSmoothedPower() / this.racerHardPowerW,
      0,
      1,
    );
    const targetSpeed =
      Phaser.Math.Linear(0.003, 0.062, normalizedEffort) / this.difficultyMultiplier();
    const speedEase = 1 - Math.exp(-dt / (this.trainerRun ? 0.8 : 0.35));
    this.racerSpeed += (targetSpeed - this.racerSpeed) * speedEase;
    this.racerLane +=
      (Phaser.Math.Linear(8, -8, normalizedEffort) - this.racerLane) * (1 - Math.exp(-dt / 0.55));

    this.racerProgress += this.racerSpeed * dt;
    const completedLaps = Math.floor(this.racerProgress);
    if (completedLaps > this.score) {
      this.score = completedLaps;
      emitGameEvent("score", this.score);
    }
    this.positionRaceCar(this.racerPlayer, this.racerProgress, this.racerLane);

    for (const rival of this.raceRivals.slice(0, this.activeRivalCount())) {
      rival.progress += rival.speed * dt;
      this.positionRaceCar(rival.body, rival.progress, rival.lane);
    }
  }

  private updateHillClimber(dt: number): void {
    const worldX = this.hillDistance + HILL_PLAYER_X;
    const gradePercent = hillGradePercent(worldX, this.levelSettings.mapId);
    const targetSpeed = hillTargetSpeed(
      this.mapper!.getSmoothedPower(),
      this.hillHardPowerW,
      gradePercent * this.difficultyMultiplier(),
    );
    const responseSeconds = this.trainerRun ? 0.85 : 0.4;
    this.hillSpeed += (targetSpeed - this.hillSpeed) * (1 - Math.exp(-dt / responseSeconds));
    this.hillDistance += this.hillSpeed * dt;

    const currentScore = Math.floor(this.hillDistance / 500);
    if (currentScore > this.score) {
      this.score = currentScore;
      emitGameEvent("score", this.score);
    }

    const currentWorldX = this.hillDistance + HILL_PLAYER_X;
    const currentGrade = hillGradePercent(currentWorldX, this.levelSettings.mapId);
    const terrainAngle = Math.atan(hillTerrainDerivative(currentWorldX, this.levelSettings.mapId));
    this.hillPlayer
      .setPosition(HILL_PLAYER_X, hillTerrainY(currentWorldX, this.levelSettings.mapId) - 11)
      .setRotation(terrainAngle);
    this.drawHillLandscape();

    if (performance.now() - this.lastTerrainGradeAt >= 750) {
      this.lastTerrainGradeAt = performance.now();
      emitGameEvent("terrain-grade", { gradePercent: currentGrade });
    }

    if (this.elapsed > 3 && this.hillSpeed < 2.5) this.hillStallElapsed += dt;
    else this.hillStallElapsed = 0;
    if (this.hillStallElapsed >= 4) this.endRun();
  }

  private drawHillLandscape(): void {
    this.drawDistantHillLayer(this.hillFarTerrain, this.hillDistance * 0.14, 112, 17, 0x789b72);
    this.drawDistantHillLayer(this.hillMidTerrain, this.hillDistance * 0.34, 132, 22, 0x557b56);

    const surface: Phaser.Math.Vector2[] = [];
    for (let x = 0; x <= WIDTH; x += 4) {
      surface.push(
        new Phaser.Math.Vector2(x, hillTerrainY(this.hillDistance + x, this.levelSettings.mapId)),
      );
    }
    this.hillGround.clear();
    this.hillGround
      .fillStyle(0x47733e)
      .fillPoints(
        [new Phaser.Math.Vector2(0, HEIGHT), ...surface, new Phaser.Math.Vector2(WIDTH, HEIGHT)],
        true,
      );
    this.hillGround.lineStyle(3, 0x87a94f).strokePoints(surface);
    this.hillGround.lineStyle(1, 0xd8c86e, 0.65);
    const firstMarker = Math.floor(this.hillDistance / 64);
    for (let marker = firstMarker; marker < firstMarker + 7; marker += 1) {
      const worldX = marker * 64 + 21;
      const x = worldX - this.hillDistance;
      if (x < 0 || x > WIDTH) continue;
      const y = hillTerrainY(worldX, this.levelSettings.mapId) - 2;
      const flowerColor = marker % 3 === 0 ? 0xf4d35e : marker % 3 === 1 ? 0xf2eee2 : 0xd96c75;
      this.hillGround.lineBetween(x, y, x, y - 5);
      this.hillGround.fillStyle(flowerColor).fillCircle(x, y - 6, 1.5);
    }
  }

  private drawDistantHillLayer(
    graphics: Phaser.GameObjects.Graphics,
    scroll: number,
    baseY: number,
    amplitude: number,
    color: number,
  ): void {
    const points = [new Phaser.Math.Vector2(0, HEIGHT)];
    for (let x = 0; x <= WIDTH; x += 6) {
      const y =
        baseY +
        Math.sin((x + scroll) / 58) * amplitude +
        Math.sin((x + scroll) / 23 + 1.4) * amplitude * 0.22;
      points.push(new Phaser.Math.Vector2(x, y));
    }
    points.push(new Phaser.Math.Vector2(WIDTH, HEIGHT));
    graphics.clear().fillStyle(color).fillPoints(points, true);
  }

  private positionRaceCar(car: Phaser.GameObjects.Container, progress: number, lane: number): void {
    const pose = this.trackPose(progress, lane);
    car.setPosition(pose.x, pose.y).setRotation(pose.angle);
  }

  private incrementScore(): void {
    this.score += 1;
    emitGameEvent("score", this.score);
  }

  private difficultyMultiplier(): number {
    if (this.levelSettings.difficulty === "relaxed") return 0.85;
    if (this.levelSettings.difficulty === "expert") return 1.16;
    return 1;
  }

  private activeRivalCount(): number {
    if (this.levelSettings.optionId === "solo") return 0;
    if (this.levelSettings.optionId === "pack") return 5;
    return 3;
  }

  private animateOrnithopterPedals(dt: number): void {
    const fallbackCadence =
      this.powerW < 8 ? 0 : Phaser.Math.Clamp(38 + this.powerW * 0.23, 42, 112);
    const targetCadence =
      this.running && !this.pausedForSignal ? (this.cadenceRpm ?? fallbackCadence) : 0;
    this.displayedCadenceRpm +=
      (targetCadence - this.displayedCadenceRpm) * (1 - Math.exp(-dt / 0.22));
    this.pedalPhase = Phaser.Math.Wrap(
      this.pedalPhase + (this.displayedCadenceRpm / 60) * Math.PI * 2 * dt,
      0,
      Math.PI * 2,
    );
    this.drawOrnithopterPedals();
  }

  private drawOrnithopterPedals(): void {
    this.drawPedalMechanism(this.ornithopterPedals);
    if (this.hillPedals) this.drawPedalMechanism(this.hillPedals);
  }

  private drawPedalMechanism(graphics: Phaser.GameObjects.Graphics): void {
    const crank = new Phaser.Math.Vector2(3.2, 11.1);
    const hip = new Phaser.Math.Vector2(7.2, 3.8);
    const crankX = Math.cos(this.pedalPhase) * 4.2;
    const crankY = Math.sin(this.pedalPhase) * 3.2;
    const frontFoot = new Phaser.Math.Vector2(crank.x + crankX, crank.y + crankY);
    const rearFoot = new Phaser.Math.Vector2(crank.x - crankX, crank.y - crankY);
    const kneeFor = (foot: Phaser.Math.Vector2, bend: number) =>
      new Phaser.Math.Vector2(
        Phaser.Math.Linear(hip.x, foot.x, 0.5) + bend,
        Phaser.Math.Linear(hip.y, foot.y, 0.5) - 1.7,
      );
    const rearKnee = kneeFor(rearFoot, -1.5);
    const frontKnee = kneeFor(frontFoot, 1.8);

    graphics.clear();
    graphics.lineStyle(2.1, 0x49362c, 0.9);
    graphics.lineBetween(hip.x, hip.y, rearKnee.x, rearKnee.y);
    graphics.lineBetween(rearKnee.x, rearKnee.y, rearFoot.x, rearFoot.y);
    graphics.lineStyle(1.2, 0xa66c2f, 0.95);
    graphics.strokeCircle(crank.x, crank.y, 3.8);
    graphics.lineBetween(crank.x, crank.y, rearFoot.x, rearFoot.y);
    graphics.lineStyle(2.5, 0x604536, 1);
    graphics.lineBetween(hip.x, hip.y, frontKnee.x, frontKnee.y);
    graphics.lineStyle(2.2, 0x9a5b32, 1);
    graphics.lineBetween(frontKnee.x, frontKnee.y, frontFoot.x, frontFoot.y);
    graphics.lineStyle(1.3, 0xd1a44d, 1);
    graphics.lineBetween(crank.x, crank.y, frontFoot.x, frontFoot.y);
    graphics.fillStyle(0x332820, 1).fillCircle(frontFoot.x, frontFoot.y, 1.2);
    graphics.fillCircle(rearFoot.x, rearFoot.y, 1);
  }

  private createBackdrops(): void {
    this.cameras.main.setBackgroundColor("#080b18");
    const skyObjects: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(160, 90, 320, 180, 0x86b9c2),
      this.add.rectangle(160, 108, 320, 54, 0xa8c9bd, 0.34),
      this.add.circle(269, 31, 18, 0xf7d28a, 0.85),
    ];

    const farMountains = this.add.container();
    const midMountains = this.add.container();
    const nearHills = this.add.container();
    const foreground = this.add.container();
    for (const tileX of [0, WIDTH]) {
      for (let index = 0; index < 5; index += 1) {
        farMountains.add(
          this.add.triangle(
            tileX + index * 74 - 24,
            137 + (index % 2) * 3,
            0,
            39,
            43,
            0,
            86,
            39,
            index % 2 === 0 ? 0x78918a : 0x829a90,
            0.72,
          ),
        );
      }
      for (let index = 0; index < 4; index += 1) {
        midMountains.add(
          this.add.triangle(
            tileX + index * 92 - 30,
            149,
            0,
            55,
            55,
            0,
            110,
            55,
            index % 2 === 0 ? 0x657956 : 0x71865d,
          ),
        );
      }
      for (let index = 0; index < 6; index += 1) {
        nearHills.add(
          this.add.ellipse(
            tileX + index * 62 - 15,
            147 + (index % 2) * 3,
            92,
            40,
            index % 2 === 0 ? 0x879361 : 0x77875a,
          ),
        );
      }
      foreground.add(this.add.rectangle(tileX + WIDTH / 2, 163, WIDTH, 34, 0xa5a66a));
      foreground.add(this.add.rectangle(tileX + WIDTH / 2, 151, WIDTH, 4, 0xd3b36e));
      for (let index = 0; index < 12; index += 1) {
        const x = tileX + index * 29;
        const height = 17 + (index % 4) * 3;
        foreground.add(this.add.rectangle(x, 165 - height / 2, 18, height, 0x67513c));
        foreground.add(this.add.rectangle(x, 153, 21, 3, 0xd8b76e));
        foreground.add(this.add.rectangle(x - 4, 160, 2, 3, 0xf0d28b, 0.7));
      }
    }
    this.skyParallaxLayers = [
      { container: farMountains, speed: 1.8 },
      { container: midMountains, speed: 4.2 },
      { container: nearHills, speed: 7.5 },
      { container: foreground, speed: 12 },
    ];
    const skyClouds: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 7; i += 1) {
      const cloud = this.add.ellipse(35 + i * 58, 30 + (i % 3) * 17, 36, 9, 0xf3ead6, 0.5);
      cloud.setData("drift", 2.5 + (i % 3) * 1.4);
      this.clouds.push(cloud);
      skyClouds.push(cloud);
    }
    this.skyMapOverlay = this.add.rectangle(160, 90, WIDTH, HEIGHT, 0xffffff, 0);
    skyObjects.push(
      ...skyClouds,
      farMountains,
      midMountains,
      nearHills,
      foreground,
      this.skyMapOverlay,
    );
    this.skyBackdrop = this.add.container(0, 0, skyObjects).setDepth(-10);

    const spaceObjects: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(160, 90, 320, 180, 0x080b18),
    ];
    const starColors = [0xffffff, 0xc9ddff, 0xffe6ae];
    for (let i = 0; i < 52; i += 1) {
      const size = i % 9 === 0 ? 2 : 1;
      const star = this.add.rectangle(
        Phaser.Math.Between(0, WIDTH),
        Phaser.Math.Between(3, HEIGHT - 3),
        size,
        size,
        starColors[i % starColors.length],
        i % 5 === 0 ? 0.65 : 1,
      );
      star.setData("drift", 5 + (i % 4) * 4);
      this.stars.push(star);
      spaceObjects.push(star);
    }
    this.spaceMapOverlay = this.add.rectangle(160, 90, WIDTH, HEIGHT, 0xffffff, 0);
    spaceObjects.push(this.spaceMapOverlay);
    this.spaceBackdrop = this.add.container(0, 0, spaceObjects).setDepth(-10);

    const raceObjects: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(160, 90, 320, 180, 0x477342),
    ];
    this.racerTrack = this.add.graphics();
    this.drawRacerTrack();
    raceObjects.push(this.racerTrack);
    raceObjects.push(this.add.ellipse(150, 82, 42, 20, 0x345c52, 0.9));
    raceObjects.push(this.add.rectangle(148, 81, 34, 2, 0x8cb4a4, 0.45));
    const trees: Array<[number, number]> = [
      [78, 94],
      [114, 102],
      [222, 101],
      [246, 43],
      [300, 160],
    ];
    for (const [x, y] of trees) {
      raceObjects.push(this.add.circle(x, y, 5, 0x274f31));
      raceObjects.push(this.add.circle(x - 2, y - 2, 2, 0x5d8d4f));
    }
    this.racerMapOverlay = this.add.rectangle(160, 90, WIDTH, HEIGHT, 0xffffff, 0);
    raceObjects.push(this.racerMapOverlay);
    this.racerBackdrop = this.add.container(0, 0, raceObjects).setDepth(-10);

    this.hillFarTerrain = this.add.graphics();
    this.hillMidTerrain = this.add.graphics();
    this.hillGround = this.add.graphics();
    const hillObjects: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(160, 30, 320, 60, 0x83c7d8),
      this.add.rectangle(160, 90, 320, 60, 0xaed7ce),
      this.add.rectangle(160, 150, 320, 60, 0xe5d59f),
      this.add.circle(264, 28, 17, 0xffd477, 0.9),
      this.add.ellipse(53, 27, 44, 8, 0xf7f0d8, 0.7),
      this.add.ellipse(185, 42, 54, 10, 0xf7f0d8, 0.55),
      this.hillFarTerrain,
      this.hillMidTerrain,
      this.hillGround,
    ];
    this.hillMapOverlay = this.add.rectangle(160, 90, WIDTH, HEIGHT, 0xffffff, 0);
    hillObjects.push(this.hillMapOverlay);
    this.hillBackdrop = this.add.container(0, 0, hillObjects).setDepth(-10);
    this.drawHillLandscape();

    const submarineObjects: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(160, 30, WIDTH, 60, 0x287f9a),
      this.add.rectangle(160, 95, WIDTH, 70, 0x15536f),
      this.add.rectangle(160, 155, WIDTH, 50, 0x0b354d),
      this.add.rectangle(160, 9, WIDTH, 3, 0x8dd7d5, 0.65),
      this.add.triangle(65, 75, 0, 0, 24, 0, 70, 75, 0x9ee3dc, 0.08),
      this.add.triangle(210, 88, 0, 0, 32, 0, 88, 88, 0x9ee3dc, 0.07),
      this.add.rectangle(160, 173, WIDTH, 18, 0x806f55),
    ];
    const distantReef = this.add.container();
    const nearReef = this.add.container();
    for (const tileX of [0, WIDTH]) {
      for (let index = 0; index < 7; index += 1) {
        distantReef.add(
          this.add.ellipse(
            tileX + index * 52,
            151 + (index % 2) * 5,
            68,
            24,
            index % 2 === 0 ? 0x16485b : 0x1d5962,
            0.66,
          ),
        );
      }
      for (let index = 0; index < 12; index += 1) {
        const x = tileX + index * 29;
        nearReef.add(this.add.triangle(x, 176, 0, 28, 6, 0, 13, 28, 0x244b42, 0.9));
        if (index % 3 === 0) nearReef.add(this.add.circle(x + 11, 166, 4, 0xb85c67, 0.72));
      }
    }
    this.submarineParallaxLayers = [
      { container: distantReef, speed: 2.2 },
      { container: nearReef, speed: 7.5 },
    ];
    for (let index = 0; index < 9; index += 1) {
      const x = 12 + index * 39;
      submarineObjects.push(this.add.triangle(x, 165, 0, 14, 5, 0, 10, 14, 0x397052));
      submarineObjects.push(this.add.circle(x + 12, 169, 3 + (index % 3), 0xa55a58, 0.8));
    }
    for (let index = 0; index < 24; index += 1) {
      const bubble = this.add.circle(
        Phaser.Math.Between(0, WIDTH),
        Phaser.Math.Between(18, HEIGHT - 20),
        index % 5 === 0 ? 2 : 1,
        0xbce8e4,
        0.32,
      );
      bubble.setData("rise", 2 + (index % 4));
      this.bubbles.push(bubble);
      submarineObjects.push(bubble);
    }
    for (let index = 0; index < 34; index += 1) {
      const mote = this.add.circle(
        Phaser.Math.Between(0, WIDTH),
        Phaser.Math.Between(12, HEIGHT - 12),
        index % 8 === 0 ? 0.8 : 0.45,
        0xc6eee0,
        0.18 + (index % 4) * 0.05,
      );
      mote.setData("drift", 3 + (index % 6));
      this.seaMotes.push(mote);
      submarineObjects.push(mote);
    }
    this.submarineMapOverlay = this.add.rectangle(160, 90, WIDTH, HEIGHT, 0xffffff, 0);
    submarineObjects.push(distantReef, nearReef, this.submarineMapOverlay);
    this.submarineBackdrop = this.add.container(0, 0, submarineObjects).setDepth(-10);

    const dragonObjects: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(160, 90, WIDTH, HEIGHT, 0x91bfd1),
      this.add.circle(267, 29, 16, 0xffd67d, 0.9),
      this.add.triangle(54, 164, 0, 62, 48, 0, 96, 62, 0x5d785d),
      this.add.triangle(155, 166, 0, 75, 62, 0, 124, 75, 0x71835e),
      this.add.triangle(266, 165, 0, 58, 49, 0, 98, 58, 0x526c58),
      this.add.rectangle(160, 171, WIDTH, 18, 0x4d6947),
      this.add.rectangle(277, 138, 20, 32, 0x675260),
      this.add.rectangle(266, 143, 8, 23, 0x675260),
      this.add.rectangle(288, 143, 8, 23, 0x675260),
    ];
    const farDragonPeaks = this.add.container();
    const nearDragonPeaks = this.add.container();
    for (const tileX of [0, WIDTH]) {
      for (let index = 0; index < 5; index += 1) {
        farDragonPeaks.add(
          this.add.triangle(tileX + index * 78 - 20, 160, 0, 54, 48, 0, 96, 54, 0x718774, 0.58),
        );
      }
      for (let index = 0; index < 6; index += 1) {
        nearDragonPeaks.add(
          this.add.triangle(
            tileX + index * 64 - 25,
            176,
            0,
            46,
            40,
            0,
            80,
            46,
            index % 2 === 0 ? 0x465f4b : 0x526b50,
            0.9,
          ),
        );
      }
    }
    this.dragonParallaxLayers = [
      { container: farDragonPeaks, speed: 2.4 },
      { container: nearDragonPeaks, speed: 6.4 },
    ];
    for (let index = 0; index < 7; index += 1) {
      const cloud = this.add.ellipse(25 + index * 55, 29 + (index % 3) * 20, 38, 9, 0xf5ead4, 0.55);
      cloud.setData("drift", 2 + (index % 3));
      this.dragonClouds.push(cloud);
      dragonObjects.push(cloud);
    }
    for (let index = 0; index < 22; index += 1) {
      const mote = this.add.circle(
        Phaser.Math.Between(0, WIDTH),
        Phaser.Math.Between(8, HEIGHT - 18),
        index % 6 === 0 ? 1.1 : 0.65,
        index % 3 === 0 ? 0xffd57b : 0xf5efe1,
        0.3,
      );
      mote.setData("drift", 4 + (index % 5) * 1.5);
      mote.setData("phase", index * 0.7);
      this.dragonMotes.push(mote);
      dragonObjects.push(mote);
    }
    this.dragonMapOverlay = this.add.rectangle(160, 90, WIDTH, HEIGHT, 0xffffff, 0);
    dragonObjects.push(farDragonPeaks, nearDragonPeaks, this.dragonMapOverlay);
    this.dragonBackdrop = this.add.container(0, 0, dragonObjects).setDepth(-10);
  }

  private createRaceCars(): void {
    this.racerPlayer = this.createRaceCar(0xd14b3f).setDepth(2);
    const rivals = [
      { progress: 0.2, lane: -8, speed: 0.032, color: 0xf0c74f },
      { progress: 0.48, lane: 0, speed: 0.036, color: 0x4c79c6 },
      { progress: 0.73, lane: 8, speed: 0.029, color: 0xe8e2cb },
      { progress: 0.34, lane: 8, speed: 0.034, color: 0x9d5eb5 },
      { progress: 0.86, lane: -8, speed: 0.031, color: 0x52a68a },
    ];
    this.raceRivals = rivals.map(({ color, ...rival }) => ({
      ...rival,
      startProgress: rival.progress,
      body: this.createRaceCar(color).setDepth(1),
    }));
  }

  private drawRacerTrack(): void {
    const trackPoints = Array.from({ length: 180 }, (_, index) => this.trackPoint(index / 180));
    this.racerTrack.clear();
    this.racerTrack.lineStyle(42, 0x263128, 0.95).strokePoints(trackPoints, true);
    this.racerTrack.lineStyle(34, 0x77766f).strokePoints(trackPoints, true);
    this.racerTrack.lineStyle(1, 0xd9cf9a, 0.5);
    for (let index = 0; index < trackPoints.length; index += 10) {
      const current = trackPoints[index]!;
      const next = trackPoints[(index + 4) % trackPoints.length]!;
      this.racerTrack.lineBetween(current.x, current.y, next.x, next.y);
    }
    for (let index = 0; index < 90; index += 3) {
      const color = index % 6 === 0 ? 0xf2e5c4 : 0xb94d3c;
      const outer = this.trackPose(index / 90, 17);
      const inner = this.trackPose(index / 90, -17);
      this.racerTrack.fillStyle(color).fillCircle(outer.x, outer.y, 1.7);
      this.racerTrack.fillCircle(inner.x, inner.y, 1.7);
    }
    const finishInner = this.trackPose(0, -16);
    const finishOuter = this.trackPose(0, 16);
    this.racerTrack
      .lineStyle(3, 0xf5eee0)
      .lineBetween(finishInner.x, finishInner.y, finishOuter.x, finishOuter.y);
  }

  private createHillBike(): void {
    const ornithopter = this.add.image(0, 0, "ornithopter").setDisplaySize(38, 25).setOrigin(0.5);
    this.hillPedals = this.add.graphics().setScale(38 / PLAYER_WIDTH);
    this.drawPedalMechanism(this.hillPedals);
    this.hillPlayer = this.add.container(HILL_PLAYER_X, 100, [ornithopter, this.hillPedals]);
    this.hillPlayer.setVisible(false);
  }

  private createSubmarine(): void {
    this.anims.create({
      key: "submarine-pedal",
      frames: this.anims.generateFrameNumbers("submarine-dive", { start: 0, end: 5 }),
      frameRate: 9,
      repeat: -1,
    });
    this.submarinePlayer = this.add
      .sprite(PLAYER_X, 88, "submarine-dive", 0)
      .setDisplaySize(64, 62)
      .play("submarine-pedal");
    this.submarinePlayer.setVisible(false);
  }

  private createDragon(): void {
    this.dragonPlayer = this.add
      .sprite(PLAYER_X, 88, "dragon-flight", 0)
      .setDisplaySize(68, 68)
      .setOrigin(245 / 430, 270 / 430);
    this.dragonPlayer.setVisible(false);
  }

  private createRaceCar(color: number): Phaser.GameObjects.Container {
    const body = this.add.rectangle(0, 0, 13, 7, color).setStrokeStyle(1, 0x211d1a);
    const cabin = this.add.rectangle(-1, 0, 5, 5, 0xb8d4d0, 0.8);
    const nose = this.add.rectangle(5, 0, 2, 4, 0xf1df9f, 0.8);
    const wheels = [-4, 4].flatMap((x) => [
      this.add.rectangle(x, -4, 3, 2, 0x191919),
      this.add.rectangle(x, 4, 3, 2, 0x191919),
    ]);
    return this.add.container(0, 0, [body, cabin, nose, ...wheels]).setVisible(false);
  }

  private trackPoint(progress: number): Phaser.Math.Vector2 {
    const track =
      RACER_TRACKS[this.levelSettings.mapId as keyof typeof RACER_TRACKS] ??
      RACER_TRACKS["meadow-circuit"];
    const wrapped = ((progress % 1) + 1) % 1;
    const scaled = wrapped * track.length;
    const index = Math.floor(scaled);
    const t = scaled - index;
    const point = (offset: number) => track[(index + offset + track.length) % track.length]!;
    const p0 = point(-1);
    const p1 = point(0);
    const p2 = point(1);
    const p3 = point(2);
    const interpolate = (a: number, b: number, c: number, d: number) =>
      0.5 *
      (2 * b +
        (-a + c) * t +
        (2 * a - 5 * b + 4 * c - d) * t * t +
        (-a + 3 * b - 3 * c + d) * t * t * t);
    return new Phaser.Math.Vector2(
      interpolate(p0.x, p1.x, p2.x, p3.x),
      interpolate(p0.y, p1.y, p2.y, p3.y),
    );
  }

  private trackPose(progress: number, lane = 0): { x: number; y: number; angle: number } {
    const point = this.trackPoint(progress);
    const before = this.trackPoint(progress - 0.001);
    const after = this.trackPoint(progress + 0.001);
    const angle = Phaser.Math.Angle.Between(before.x, before.y, after.x, after.y);
    return {
      x: point.x - Math.sin(angle) * lane,
      y: point.y + Math.cos(angle) * lane,
      angle,
    };
  }

  private animateBackdrop(dt: number): void {
    if (this.skyBackdrop.visible) {
      for (const layer of this.skyParallaxLayers) {
        layer.container.x -= layer.speed * dt;
        if (layer.container.x <= -WIDTH) layer.container.x += WIDTH;
      }
      for (const cloud of this.clouds) {
        cloud.x -= (cloud.getData("drift") as number) * dt;
        if (cloud.x < -20) cloud.x = 340;
      }
    }
    if (this.spaceBackdrop.visible) {
      for (const star of this.stars) {
        star.x -= (star.getData("drift") as number) * dt;
        if (star.x < -2) star.x = WIDTH + 2;
      }
    }
    if (this.submarineBackdrop.visible) {
      for (const layer of this.submarineParallaxLayers) {
        layer.container.x -= layer.speed * dt;
        if (layer.container.x <= -WIDTH) layer.container.x += WIDTH;
      }
      for (const bubble of this.bubbles) {
        bubble.y -= (bubble.getData("rise") as number) * dt;
        if (bubble.y < 12) bubble.y = HEIGHT - 14;
      }
      for (const mote of this.seaMotes) {
        mote.x -= (mote.getData("drift") as number) * dt;
        mote.y -= 0.8 * dt;
        if (mote.x < -2) mote.x = WIDTH + 2;
        if (mote.y < 8) mote.y = HEIGHT - 10;
      }
    }
    if (this.dragonBackdrop.visible) {
      for (const layer of this.dragonParallaxLayers) {
        layer.container.x -= layer.speed * dt;
        if (layer.container.x <= -WIDTH) layer.container.x += WIDTH;
      }
      for (const cloud of this.dragonClouds) {
        cloud.x -= (cloud.getData("drift") as number) * dt;
        if (cloud.x < -22) cloud.x = WIDTH + 22;
      }
      for (const mote of this.dragonMotes) {
        mote.x -= (mote.getData("drift") as number) * dt;
        mote.y += Math.sin(this.elapsed * 2 + (mote.getData("phase") as number)) * dt * 1.3;
        if (mote.x < -2) mote.x = WIDTH + 2;
      }
    }
  }

  private setBackdrop(levelId: LevelId): void {
    this.game.canvas.dataset.level = levelId;
    this.game.canvas.dataset.map = this.levelSettings.mapId;
    const inSpace = levelId === "asteroids";
    const onTrack = levelId === "racer";
    const inHills = levelId === "hill-climber";
    const underwater = levelId === "submarine-dive";
    const dragonSky = levelId === "dragon-flight";
    this.skyBackdrop.setVisible(!inSpace && !onTrack && !inHills && !underwater && !dragonSky);
    this.spaceBackdrop.setVisible(inSpace);
    this.racerBackdrop.setVisible(onTrack);
    this.hillBackdrop.setVisible(inHills);
    this.submarineBackdrop.setVisible(underwater);
    this.dragonBackdrop.setVisible(dragonSky);
    this.shadow.setVisible(!inSpace && !onTrack && !inHills && !underwater && !dragonSky);
    this.player.setVisible(!onTrack && !inHills && !underwater && !dragonSky);
    this.ornithopterPedals.setVisible(
      !inSpace && !onTrack && !inHills && !underwater && !dragonSky,
    );
    this.racerPlayer.setVisible(onTrack);
    for (const [index, rival] of this.raceRivals.entries()) {
      rival.body.setVisible(onTrack && index < this.activeRivalCount());
    }
    this.hillPlayer.setVisible(inHills);
    this.submarinePlayer.setVisible(underwater);
    this.dragonPlayer.setVisible(dragonSky);
  }

  private applyMapTheme(): void {
    this.skyMapOverlay.setFillStyle(0xffffff, 0);
    this.spaceMapOverlay.setFillStyle(0xffffff, 0);
    this.racerMapOverlay.setFillStyle(0xffffff, 0);
    this.hillMapOverlay.setFillStyle(0xffffff, 0);
    this.submarineMapOverlay.setFillStyle(0xffffff, 0);
    this.dragonMapOverlay.setFillStyle(0xffffff, 0);
    if (this.levelSettings.mapId === "sunset-range")
      this.skyMapOverlay.setFillStyle(0xd76e4d, 0.28);
    else if (this.levelSettings.mapId === "moonlit-peaks")
      this.skyMapOverlay.setFillStyle(0x26305f, 0.42);
    else if (this.levelSettings.mapId === "red-nebula")
      this.spaceMapOverlay.setFillStyle(0x751f38, 0.35);
    else if (this.levelSettings.mapId === "ice-nebula")
      this.spaceMapOverlay.setFillStyle(0x254f78, 0.34);
    else if (this.levelSettings.mapId === "desert-circuit")
      this.racerMapOverlay.setFillStyle(0xc6904c, 0.3);
    else if (this.levelSettings.mapId === "night-circuit")
      this.racerMapOverlay.setFillStyle(0x18254d, 0.48);
    else if (this.levelSettings.mapId === "highlands")
      this.hillMapOverlay.setFillStyle(0x385765, 0.2);
    else if (this.levelSettings.mapId === "long-climbs")
      this.hillMapOverlay.setFillStyle(0xd49445, 0.18);
    else if (this.levelSettings.mapId === "midnight-trench")
      this.submarineMapOverlay.setFillStyle(0x101c4e, 0.46);
    else if (this.levelSettings.mapId === "arctic-depths")
      this.submarineMapOverlay.setFillStyle(0x8ad0dd, 0.22);
    else if (this.levelSettings.mapId === "volcanic-sky")
      this.dragonMapOverlay.setFillStyle(0xa63d2c, 0.35);
    else if (this.levelSettings.mapId === "moon-kingdom")
      this.dragonMapOverlay.setFillStyle(0x29305f, 0.46);
  }

  private readonly onStartRun = (event: Event): void => {
    const { profile, demo, mode, levelId, settings } = (event as CustomEvent<StartRunDetail>)
      .detail;
    this.mode = mode;
    this.levelId = levelId;
    this.levelSettings = settings;
    this.applyMapTheme();
    if (levelId === "racer") this.drawRacerTrack();
    this.trainerRun = !demo;
    this.mapper = new EffortMapper(
      profile,
      demo ? 80 : 300,
      demo ? 90 : 55,
      demo ? 0 : 0.15,
      demo ? 1 : 1.35,
    );
    this.velocityResponseMs = demo ? 120 : TRAINER_VELOCITY_RESPONSE_MS;
    this.clearObstacles();
    this.player
      .setPosition(PLAYER_X, 88)
      .setDisplaySize(PLAYER_WIDTH, PLAYER_HEIGHT)
      .setRotation(0);
    this.ornithopterPedals.setPosition(PLAYER_X, 88).setRotation(0).setAlpha(1);
    this.submarinePlayer.setPosition(PLAYER_X, 88).setRotation(0).setAlpha(1);
    this.dragonPlayer.setPosition(PLAYER_X, 88).setRotation(0).setAlpha(1);
    this.racerProgress = 0;
    this.racerSpeed = 0;
    this.racerLane = 0;
    this.racerHardPowerW = profile.hardPowerW;
    this.racerPlayer.setAlpha(1);
    this.positionRaceCar(this.racerPlayer, this.racerProgress, this.racerLane);
    for (const rival of this.raceRivals) {
      rival.progress = rival.startProgress;
      this.positionRaceCar(rival.body, rival.progress, rival.lane);
    }
    this.hillDistance = 0;
    this.hillSpeed = 0;
    this.hillStallElapsed = 0;
    this.hillHardPowerW = profile.hardPowerW;
    this.lastTerrainGradeAt = 0;
    this.hillPlayer.setAlpha(1);
    const hillWorldX = this.hillDistance + HILL_PLAYER_X;
    this.hillPlayer
      .setPosition(HILL_PLAYER_X, hillTerrainY(hillWorldX, this.levelSettings.mapId) - 11)
      .setRotation(Math.atan(hillTerrainDerivative(hillWorldX, this.levelSettings.mapId)));
    this.drawHillLandscape();
    this.setBackdrop(levelId);
    this.velocityY = 0;
    this.rawPlayerY = 88;
    this.powerW = profile.cruisePowerW;
    this.lastTelemetryAt = performance.now();
    this.elapsed = 0;
    this.spawnElapsed = 1;
    this.score = 0;
    this.lastTrajectoryAt = 0;
    this.pausedForSignal = false;
    this.waitingForSignal = false;
    this.running = true;
    emitGameEvent("score", 0);
  };

  private readonly onPreviewLevel = (event: Event): void => {
    if (this.running) return;
    const { levelId, settings } = (event as CustomEvent<PreviewLevelDetail>).detail;
    this.levelId = levelId;
    this.levelSettings = settings;
    this.applyMapTheme();
    if (levelId === "racer") {
      this.drawRacerTrack();
      this.racerProgress = 0;
      this.racerLane = 0;
      this.positionRaceCar(this.racerPlayer, 0, 0);
    } else if (levelId === "hill-climber") {
      this.hillDistance = 0;
      this.drawHillLandscape();
      const worldX = HILL_PLAYER_X;
      this.hillPlayer
        .setPosition(HILL_PLAYER_X, hillTerrainY(worldX, settings.mapId) - 11)
        .setRotation(Math.atan(hillTerrainDerivative(worldX, settings.mapId)));
    }
    this.player.setPosition(PLAYER_X, 88).setRotation(0);
    this.ornithopterPedals.setPosition(PLAYER_X, 88).setRotation(0);
    this.submarinePlayer.setPosition(PLAYER_X, 88).setRotation(0).setAlpha(1);
    this.dragonPlayer.setPosition(PLAYER_X, 88).setRotation(0).setAlpha(1);
    this.setBackdrop(levelId);
  };

  private readonly onTelemetry = (event: Event): void => {
    const detail = (
      event as CustomEvent<{ powerW: number; cadenceRpm?: number; timestamp: number }>
    ).detail;
    this.powerW = detail.powerW;
    this.cadenceRpm = detail.cadenceRpm;
    this.lastTelemetryAt = performance.now();
    if (this.pausedForSignal && this.waitingForSignal) {
      this.waitingForSignal = false;
      emitGameEvent("signal-returned", undefined);
    }
  };

  private readonly onPauseRun = (event: Event): void => {
    if (!this.running) return;
    const detail = (event as CustomEvent<PauseRunDetail>).detail;
    this.pausedForSignal = true;
    this.waitingForSignal = detail?.reason === "signal";
  };

  private readonly onResumeRun = (): void => {
    if (this.running) {
      this.lastTelemetryAt = performance.now();
      this.pausedForSignal = false;
      this.waitingForSignal = false;
    }
  };

  private readonly onStopRun = (): void => {
    this.running = false;
    this.pausedForSignal = false;
    this.waitingForSignal = false;
    this.clearObstacles();
    this.rawPlayerY = 88;
    this.player.setPosition(PLAYER_X, 88).setRotation(0);
    this.ornithopterPedals.setPosition(PLAYER_X, 88).setRotation(0);
    this.cadenceRpm = undefined;
    this.displayedCadenceRpm = 0;
    this.levelId = "ornithopter-run";
    this.setBackdrop(this.levelId);
  };

  private spawnGate(difficulty: number): void {
    const difficultyGap =
      this.levelSettings.difficulty === "relaxed"
        ? 10
        : this.levelSettings.difficulty === "expert"
          ? -8
          : 0;
    const gap = Math.round(
      (this.trainerRun
        ? Phaser.Math.Linear(92, 68, difficulty)
        : Phaser.Math.Linear(72, 52, difficulty)) + difficultyGap,
    );
    const margin = 18;
    const minimumGapY = margin + gap / 2;
    const maximumGapY = HEIGHT - margin - gap / 2 - 18;
    const courseIndex = this.score + this.obstacles.length;
    let gapY: number;
    if (this.levelSettings.optionId === "rolling") {
      gapY = Phaser.Math.Linear(minimumGapY, maximumGapY, (Math.sin(courseIndex * 0.82) + 1) / 2);
    } else if (this.levelSettings.optionId === "alternating") {
      gapY = courseIndex % 2 === 0 ? minimumGapY : maximumGapY;
    } else {
      gapY = Phaser.Math.Between(Math.ceil(minimumGapY), Math.floor(maximumGapY));
    }
    const width = 20;
    const x = WIDTH + width;
    const topHeight = gapY - gap / 2;
    const bottomY = gapY + gap / 2;
    const bottomHeight = HEIGHT - bottomY;
    const color = 0x66513e;
    const capColor = 0xc19a5b;
    const upperGateEnabled = this.levelSettings.modifierId !== "upper-off";
    const top = this.add
      .rectangle(x, topHeight / 2, width, topHeight, color)
      .setVisible(upperGateEnabled);
    const topCap = this.add
      .rectangle(x, topHeight - 3, width + 7, 6, capColor)
      .setVisible(upperGateEnabled);
    this.obstacles.push({
      top,
      bottom: this.add.rectangle(x, bottomY + bottomHeight / 2, width, bottomHeight, color),
      topCap,
      bottomCap: this.add.rectangle(x, bottomY + 3, width + 7, 6, capColor),
      scored: false,
    });
  }

  private spawnAsteroid(): void {
    const [minimumRadius, maximumRadius] =
      this.levelSettings.optionId === "small"
        ? [8, 13]
        : this.levelSettings.optionId === "large"
          ? [15, 22]
          : [10, 19];
    const radius = Phaser.Math.Between(minimumRadius, maximumRadius);
    const body = this.add
      .image(
        WIDTH + radius + 5,
        Phaser.Math.Between(radius + 4, HEIGHT - radius - 4),
        "asteroid-art",
        Phaser.Math.Between(0, 5),
      )
      .setDisplaySize(radius * 2.45, radius * 2.45);
    body.rotation = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
    this.asteroids.push({
      body,
      radius,
      spin: Phaser.Math.FloatBetween(-0.8, 0.8),
      scored: false,
    });
  }

  private spawnSeaObstacle(): void {
    const selectedType =
      this.levelSettings.optionId === "mixed-sea"
        ? Phaser.Math.RND.pick(["mines", "reefs"])
        : this.levelSettings.optionId;
    const isMine = selectedType !== "reefs";
    const radius = isMine ? 10 : 14;
    const frame = isMine ? 0 : Phaser.Math.Between(1, 2);
    const body = this.add
      .image(
        WIDTH + radius + 6,
        Phaser.Math.Between(radius + 12, HEIGHT - radius - 16),
        "sea-art",
        frame,
      )
      .setDisplaySize(radius * 2.5, radius * 2.8);
    this.seaObstacles.push({ body, radius, scored: false });
  }

  private spawnDragonRing(difficulty: number): void {
    const difficultyRadius =
      this.levelSettings.difficulty === "relaxed"
        ? 5
        : this.levelSettings.difficulty === "expert"
          ? -4
          : 0;
    const radius = Math.round(
      (this.trainerRun
        ? Phaser.Math.Linear(34, 27, difficulty)
        : Phaser.Math.Linear(30, 23, difficulty)) + difficultyRadius,
    );
    const minimumY = radius + 7;
    const maximumY = HEIGHT - radius - 12;
    const courseIndex = this.score + this.dragonRings.length;
    let y: number;
    if (this.levelSettings.optionId === "rolling-rings") {
      y = Phaser.Math.Linear(minimumY, maximumY, (Math.sin(courseIndex * 0.78) + 1) / 2);
    } else if (this.levelSettings.optionId === "alternating-rings") {
      y = courseIndex % 2 === 0 ? minimumY : maximumY;
    } else {
      y = Phaser.Math.Between(Math.ceil(minimumY), Math.floor(maximumY));
    }
    const color =
      this.levelSettings.mapId === "volcanic-sky"
        ? 0xffc35d
        : this.levelSettings.mapId === "moon-kingdom"
          ? 0xbad8ff
          : 0xf0d06c;
    const body = this.add
      .circle(WIDTH + radius + 6, y, radius, color, 0.12)
      .setStrokeStyle(5, color);
    this.dragonRings.push({ body, radius, resolved: false });
  }

  /**
   * A rider can hold a non-cruise power for seconds, unlike a keyboard player
   * tapping a key. Treat trainer effort as a requested altitude so flywheel and
   * telemetry lag cannot keep accelerating the aircraft off screen.
   */
  private trainerTargetVelocity(effortVelocity: number): number {
    return trainerAltitudeVelocity(effortVelocity, this.rawPlayerY);
  }

  private collides(): boolean {
    const hitboxWidth = this.trainerRun ? 26 : 34;
    const hitboxHeight =
      this.levelId === "asteroids"
        ? this.trainerRun
          ? 11
          : 16
        : this.levelId === "submarine-dive"
          ? this.trainerRun
            ? 12
            : 15
          : this.levelId === "dragon-flight"
            ? this.trainerRun
              ? 14
              : 18
            : this.trainerRun
              ? 14
              : 20;
    const playerBounds = new Phaser.Geom.Rectangle(
      this.player.x - hitboxWidth / 2,
      this.player.y - hitboxHeight / 2,
      hitboxWidth,
      hitboxHeight,
    );
    const usesFullHeight = ["asteroids", "submarine-dive", "dragon-flight"].includes(this.levelId);
    const bottomBoundary = usesFullHeight ? HEIGHT : HEIGHT - 15;
    const upperBoundaryEnabled =
      this.levelId !== "ornithopter-run" || this.levelSettings.modifierId !== "upper-off";
    if (
      this.levelId !== "asteroids" &&
      this.levelId !== "dragon-flight" &&
      ((upperBoundaryEnabled && playerBounds.top <= 0) || playerBounds.bottom >= bottomBoundary)
    )
      return true;
    if (this.levelId === "asteroids") {
      return this.asteroids.some((asteroid) =>
        Phaser.Geom.Intersects.CircleToRectangle(
          new Phaser.Geom.Circle(asteroid.body.x, asteroid.body.y, asteroid.radius * 0.82),
          playerBounds,
        ),
      );
    }
    if (this.levelId === "submarine-dive") {
      return this.seaObstacles.some((obstacle) =>
        Phaser.Geom.Intersects.CircleToRectangle(
          new Phaser.Geom.Circle(obstacle.body.x, obstacle.body.y, obstacle.radius * 0.78),
          playerBounds,
        ),
      );
    }
    if (this.levelId === "dragon-flight") return false;
    const gateParts = (pair: ObstaclePair) =>
      this.levelSettings.modifierId === "upper-off"
        ? [pair.bottom, pair.bottomCap]
        : [pair.top, pair.bottom, pair.topCap, pair.bottomCap];
    return this.obstacles.some((pair) =>
      gateParts(pair).some((part) =>
        Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, part.getBounds()),
      ),
    );
  }

  private removeOldObstacles(): void {
    const remaining: ObstaclePair[] = [];
    for (const pair of this.obstacles) {
      if (pair.top.x < -30) {
        for (const part of [pair.top, pair.bottom, pair.topCap, pair.bottomCap]) part.destroy();
      } else remaining.push(pair);
    }
    this.obstacles = remaining;
  }

  private removeOldAsteroids(): void {
    const remaining: AsteroidObstacle[] = [];
    for (const asteroid of this.asteroids) {
      if (asteroid.body.x < -asteroid.radius - 5) asteroid.body.destroy();
      else remaining.push(asteroid);
    }
    this.asteroids = remaining;
  }

  private removeOldSeaObstacles(): void {
    const remaining: SeaObstacle[] = [];
    for (const obstacle of this.seaObstacles) {
      if (obstacle.body.x < -obstacle.radius - 8) obstacle.body.destroy();
      else remaining.push(obstacle);
    }
    this.seaObstacles = remaining;
  }

  private removeOldDragonRings(): void {
    const remaining: DragonRing[] = [];
    for (const ring of this.dragonRings) {
      if (!ring.body.active) continue;
      if (ring.body.x < -ring.radius - 8) ring.body.destroy();
      else remaining.push(ring);
    }
    this.dragonRings = remaining;
  }

  private clearObstacles(): void {
    for (const pair of this.obstacles) {
      for (const part of [pair.top, pair.bottom, pair.topCap, pair.bottomCap]) part.destroy();
    }
    this.obstacles = [];
    for (const asteroid of this.asteroids) asteroid.body.destroy();
    this.asteroids = [];
    for (const obstacle of this.seaObstacles) obstacle.body.destroy();
    this.seaObstacles = [];
    for (const ring of this.dragonRings) ring.body.destroy();
    this.dragonRings = [];
  }

  private checkTelemetryHealth(): boolean {
    if (performance.now() - this.lastTelemetryAt <= 2_000) return true;
    this.pausedForSignal = true;
    this.waitingForSignal = true;
    emitGameEvent("signal-stale", undefined);
    return false;
  }

  private endRun(): void {
    this.running = false;
    if (this.levelId === "racer") {
      this.racerPlayer.setAlpha(0.35);
    } else if (this.levelId === "hill-climber") {
      this.hillPlayer.setAlpha(0.35);
    } else if (this.levelId === "submarine-dive") {
      this.submarinePlayer.setAlpha(0.35);
    } else if (this.levelId === "dragon-flight") {
      this.dragonPlayer.setAlpha(0.35);
    } else {
      this.player.setTint(0xc96f51);
      this.time.delayedCall(180, () => this.player.clearTint());
    }
    emitGameEvent("game-over", this.score);
  }
}
