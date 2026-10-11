import { expect, test } from "@playwright/test";

test.describe("Dashboard happy path", () => {
  test("renders headline panels and metric tiles", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "EV vs ICE Intelligence Lab" })
    ).toBeVisible();

    // Live grid CO2 metric tile (driven by /api/prices/carbon-intensity).
    await expect(page.getByText("Live grid CO2")).toBeVisible();
    await expect(page.getByText("Lowest cost")).toBeVisible();
    await expect(page.getByText("Cleanest lifecycle")).toBeVisible();

    // Workspace panels.
    await expect(
      page.getByRole("heading", { name: "Cost vs Lifecycle CO2e" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pick a vehicle & compare" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "UK Charging Coverage" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ask the dataset" })
    ).toBeVisible();
  });

  test("scenario selection updates the URL", async ({ page }) => {
    await page.goto("/");

    const scenarioSelect = page.getByRole("combobox").first();
    await scenarioSelect.selectOption("city_commuter");

    await expect(page).toHaveURL(/scenario=city_commuter/);
    await expect(scenarioSelect).toHaveValue("city_commuter");
  });

  test("agent advisor returns a recommendation", async ({ page }) => {
    await page.goto("/");

    const agentInput = page.getByLabel("Agent question");
    await agentInput.fill("low cost EV for 8000 miles a year");
    await page.getByRole("button", { name: "Ask" }).click();

    // Recommendation card renders within a couple of seconds.
    await expect(page.locator(".agent-answer")).not.toBeEmpty({
      timeout: 5_000,
    });
  });
});

test.describe("API surface", () => {
  test("/api/health returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.vehicle_count).toBeGreaterThan(100);
  });

  test("/api/openapi.json is well-formed OpenAPI 3.1", async ({ request }) => {
    const response = await request.get("/api/openapi.json");
    expect(response.ok()).toBeTruthy();
    const spec = await response.json();
    expect(spec.openapi).toMatch(/^3\.1/);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(10);
    expect(spec.components.schemas.Vehicle).toBeDefined();
  });

  test("/api/charging-stations returns a station list", async ({ request }) => {
    const response = await request.get(
      "/api/charging-stations?minPowerKw=100&limit=10"
    );
    expect(response.ok()).toBeTruthy();
    const feed = await response.json();
    expect(Array.isArray(feed.stations)).toBe(true);
    expect(feed.stations.length).toBeGreaterThan(0);
    expect(feed.stations[0]).toHaveProperty("max_power_kw");
  });
});

test.describe("Per-vehicle pages", () => {
  test("vehicle detail page renders breadcrumb and headline economics", async ({
    page,
  }) => {
    await page.goto("/vehicles/tesla-model-3-rwd");

    await expect(
      page.getByRole("heading", { name: /Tesla Model 3/ })
    ).toBeVisible();
    await expect(page.getByText("Headline economics")).toBeVisible();
    await expect(page.getByText("Engineering")).toBeVisible();
    await expect(page.getByText(/Equivalent .* vehicles/)).toBeVisible();
  });

  test("vehicles index lists makes", async ({ page }) => {
    await page.goto("/vehicles");
    await expect(
      page.getByRole("heading", { name: "UK vehicle catalog" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tesla" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "BYD" })).toBeVisible();
  });
});
