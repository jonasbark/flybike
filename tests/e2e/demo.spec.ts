import { expect, test } from "@playwright/test";

test("starts a complete demo-mode flight", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FlyBike" })).toBeVisible();
  await expect(page.locator("#game-host canvas")).toHaveAttribute("width", "960");
  await expect(page.locator("#game-host canvas")).toHaveAttribute("height", "540");
  await page.getByRole("button", { name: "Play with keys / touch" }).click();
  await expect(page.getByRole("heading", { name: "Demo controls" })).toBeVisible();
  await page.getByRole("button", { name: "Start flight" }).click();
  await expect(page.getByRole("heading", { name: "Select level" })).toBeVisible();
  await page.getByRole("button", { name: /Ornithopter Run/ }).click();
  await expect(page.getByRole("heading", { name: "Customize level" })).toBeVisible();
  await page.getByLabel("Upper gate").selectOption("upper-off");
  await page.getByRole("button", { name: "Start Ornithopter Run" }).click();
  await expect(page.locator("#hud")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel("Ride statistics")).toBeVisible();
  await expect(page.locator("#run-time")).toHaveText(/^00:0\d$/);
  await expect(page.locator("#session-time")).toHaveText("0");
  await expect(page.locator("#run-distance")).toHaveText(/^0\.0\d$/);
  await expect(page.locator("#session-distance")).toHaveText(/^0\.0\d$/);
  await page.keyboard.down("Space");
  await expect(page.locator("#power-value")).toHaveText("260");
  await page.waitForTimeout(2_500);
  await expect(page.getByRole("heading", { name: "Ornithopter Run over" })).not.toBeVisible();
  await page.keyboard.up("Space");
});

test("returns from level selection to controller setup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play with keys / touch" }).click();
  await page.getByRole("button", { name: "Start flight" }).click();
  await expect(page.getByRole("heading", { name: "Select level" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Demo controls" })).toBeVisible();
});

test("starts the Asteroids level with its own score label", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play with keys / touch" }).click();
  await page.getByRole("button", { name: "Start flight" }).click();
  await page.getByRole("button", { name: /Asteroids/ }).click();
  await expect(page.locator("#game-host canvas")).toHaveAttribute("data-level", "asteroids");
  await page.getByLabel("Map").selectOption("red-nebula");
  await expect(page.locator("#game-host canvas")).toHaveAttribute("data-map", "red-nebula");
  await page.getByLabel("Difficulty").selectOption("expert");
  await page.getByLabel("Rock field").selectOption("large");
  await page.getByRole("button", { name: "Start Asteroids" }).click();
  await expect(page.locator("#hud")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#score-label")).toHaveText("asteroids");
});

test("starts the Racer level with lap scoring", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play with keys / touch" }).click();
  await page.getByRole("button", { name: "Start flight" }).click();
  await page.getByRole("button", { name: /Racer/ }).click();
  await page.getByRole("button", { name: "Start Racer" }).click();
  await expect(page.locator("#hud")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#score-label")).toHaveText("laps");
  await page.keyboard.down("Space");
  await page.waitForTimeout(8_000);
  await page.keyboard.up("Space");
  await expect(page.getByRole("heading", { name: "Racer over" })).not.toBeVisible();
});

test("uses a dedicated game menu separate from trainer status", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play with keys / touch" }).click();
  await page.getByRole("button", { name: "Start flight" }).click();
  await page.getByRole("button", { name: /Racer/ }).click();
  await page.getByRole("button", { name: "Start Racer" }).click();

  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeEnabled({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Trainer connection status" })).toBeDisabled();
  await menu.click();
  await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible();
  await expect(menu).toBeDisabled();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(menu).toBeEnabled({ timeout: 5_000 });
});

test("configures and starts Hill Climber", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play with keys / touch" }).click();
  await page.getByRole("button", { name: "Start flight" }).click();
  await page.getByRole("button", { name: /Hill Climber/ }).click();
  await expect(page.getByRole("heading", { name: "Customize level" })).toBeVisible();
  await page.getByLabel("Course length").selectOption("25");
  await page.getByLabel("Maximum elevation").selectOption("2000");
  await page.getByLabel("Slope character").selectOption("mixed");
  await expect(page.getByLabel("Physical terrain resistance")).toBeDisabled();
  await page.getByRole("button", { name: "Start Hill Climber" }).click();
  await expect(page.locator("#hud")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#score-label")).toHaveText("km");
});

test("configures and starts Submarine Dive", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play with keys / touch" }).click();
  await page.getByRole("button", { name: "Start flight" }).click();
  await page.getByRole("button", { name: /Submarine Dive/ }).click();
  await page.getByLabel("Map").selectOption("midnight-trench");
  await page.getByLabel("Difficulty").selectOption("relaxed");
  await page.getByLabel("Hazards").selectOption("mixed-sea");
  await page.getByRole("button", { name: "Start Submarine Dive" }).click();
  await expect(page.locator("#hud")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#score-label")).toHaveText("hazards");
});

test("configures and starts Dragon Flight", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play with keys / touch" }).click();
  await page.getByRole("button", { name: "Start flight" }).click();
  await page.getByRole("button", { name: /Dragon Flight/ }).click();
  await page.getByLabel("Map").selectOption("moon-kingdom");
  await page.getByLabel("Difficulty").selectOption("relaxed");
  await page.getByLabel("Ring path").selectOption("rolling-rings");
  await page.getByRole("button", { name: "Start Dragon Flight" }).click();
  await expect(page.locator("#hud")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#score-label")).toHaveText("rings");
  if (testInfo.project.name === "chromium")
    await expect(page.locator("#score-value")).toHaveText("1", { timeout: 15_000 });
  else await page.waitForTimeout(12_000);
  await expect(page.getByRole("heading", { name: "Dragon Flight over" })).not.toBeVisible();
});

test("persists the mute preference", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sound on" }).click();
  await expect(page.getByRole("button", { name: "Sound off" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sound off" })).toBeVisible();
});

test("opens ride history and imports and exports JSON", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ride history" }).click();
  await expect(page.getByRole("heading", { name: "Ride history" })).toBeVisible();
  await expect(page.getByText("Today", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  await download;
  await page.locator("#history-import").setInputFiles({
    name: "history.json",
    mimeType: "application/json",
    buffer: Buffer.from("[]"),
  });
  await expect(page.getByText("Imported 0 rides.")).toBeVisible();
});
