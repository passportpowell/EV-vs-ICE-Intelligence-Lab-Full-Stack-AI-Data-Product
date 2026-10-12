import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLatestFuelPrices, findWeeklyFuelCsvUrl, parseLatestFuelCsv } from "@/lib/fuel-prices";

const header = "Date,ULSP Pump price in pence/litre,ULSD Pump price in pence/litre";
const currentUrl = "https://assets.publishing.service.gov.uk/media/current/weekly_road_fuel_prices_051026.csv";
const archiveUrl = "https://assets.publishing.service.gov.uk/media/archive/weekly_road_fuel_prices_2003_to_2017.csv";
const csv = `${header}\n05/10/2026,150,160\n28/09/2026,149,159`;

describe("weekly fuel source and freshness", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-12T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("ignores an archive appearing before the current weekly release", () => {
    expect(findWeeklyFuelCsvUrl(`<a href="${archiveUrl}">Archive</a><a href="${currentUrl}">Current</a>`)).toBe(currentUrl);
    expect(findWeeklyFuelCsvUrl(`<a href="${archiveUrl}">Archive</a>`)).toBeNull();
  });
  it("selects the newest dated release regardless of link order", () => {
    const older = currentUrl.replace("051026", "280926");
    expect(findWeeklyFuelCsvUrl(`<a href="${older}">Old</a><a href="${currentUrl}">Current</a>`)).toBe(currentUrl);
  });
  it("supports the current open-ended DESNZ series filename", () => {
    const series = "https://assets.publishing.service.gov.uk/media/current/CSV__2018_-__.csv";
    expect(findWeeklyFuelCsvUrl(`<a href="${archiveUrl}">Archive</a><a href="${series}">Current</a>`)).toBe(series);
    expect(findWeeklyFuelCsvUrl(`<a href="https://example.com/CSV__2018_-__.csv">Other</a>`)).toBeNull();
    const newerSeries = series.replace("2018", "2026");
    expect(findWeeklyFuelCsvUrl(`<a href="${series}">Older series</a><a href="${newerSeries}">New series</a>`)).toBe(newerSeries);
  });
  it("selects the greatest valid source date regardless of row order", () => {
    const parsed = parseLatestFuelCsv(csv, currentUrl);
    expect(parsed.date).toBe("05/10/2026");
    expect(parsed.petrol_gbp_per_litre).toBe(1.5);
    expect(parsed.stale).toBe(false);
  });
  it("flags source data older than the documented 14-day policy", () => {
    expect(parseLatestFuelCsv(`${header}\n25/12/2017,120,123.43`, archiveUrl).stale).toBe(true);
  });
  it.each(["", `${header}\n31/02/2026,150,160`, `${header}\n05/10/2026,,160`, `${header}\n05/10/2026,-1,160`, `${header}\n19/10/2026,150,160`])("returns explicitly stale fallback for invalid input: %s", (input) => {
    expect(parseLatestFuelCsv(input).stale).toBe(true);
  });
  it("preserves stale parser fallback after a successful HTTP request", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(`<a href="${currentUrl}">Current</a>`)).mockResolvedValueOnce(new Response(""));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchLatestFuelPrices()).stale).toBe(true);
  });
  it("does not fetch an archived source when current discovery fails", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(`<a href="${archiveUrl}">Archive</a>`));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchLatestFuelPrices()).stale).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps old source dates stale even when fetched today", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(`<a href="${currentUrl}">Current</a>`)).mockResolvedValueOnce(new Response(`${header}\n25/12/2017,120,123.43`)));
    const snapshot = await fetchLatestFuelPrices();
    expect(snapshot.stale).toBe(true);
    expect(snapshot.fetched_at).toBe("2026-10-12T12:00:00.000Z");
  });
});
