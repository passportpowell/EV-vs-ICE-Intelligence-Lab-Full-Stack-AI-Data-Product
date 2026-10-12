import type { FuelPriceSnapshot } from "@/lib/types";

const GOV_FUEL_PAGE =
  "https://www.gov.uk/government/statistics/weekly-road-fuel-prices";
const FALLBACK_CSV_URL =
  "https://assets.publishing.service.gov.uk/media/6ac3b5951ef3e896de979385/CSV__2018_-__.csv";

// Application policy: weekly observations older than 14 days are stale.
const MAX_SOURCE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const FALLBACK_FUEL_PRICES: FuelPriceSnapshot = {
  date: "05/10/2026",
  petrol_p_per_litre: 174.88,
  diesel_p_per_litre: 199.52,
  petrol_gbp_per_litre: 1.7488,
  diesel_gbp_per_litre: 1.9952,
  duty_p_per_litre: 52.95,
  vat_pct: 20,
  source_name: "DESNZ weekly road fuel prices",
  source_url: FALLBACK_CSV_URL,
  fetched_at: "2026-10-12T00:00:00.000Z",
  stale: true,
  note: "Fallback values for week commencing 5 October 2026, checked on 12 October. Live source unavailable or invalid; verify prices before relying on a comparison."
};

export async function fetchLatestFuelPrices(): Promise<FuelPriceSnapshot> {
  try {
    const pageResponse = await fetch(GOV_FUEL_PAGE, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const pageText = pageResponse.ok ? await pageResponse.text() : "";
    const csvUrl = findWeeklyFuelCsvUrl(pageText);
    if (!csvUrl) return fuelFallback("Current GOV.UK CSV could not be identified.");

    const csvResponse = await fetch(csvUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!csvResponse.ok) {
      return fuelFallback("Live CSV request failed.");
    }

    return parseLatestFuelCsv(await csvResponse.text(), csvUrl);
  } catch {
    return fuelFallback("Live GOV.UK fuel-price refresh failed.");
  }
}

export function findWeeklyFuelCsvUrl(html: string): string | null {
  const candidates = [...html.matchAll(/href=["']([^"']+\.csv)["']/gi)]
    .map((match) => {
      try {
        const url = new URL(match[1].replaceAll("&amp;", "&"), GOV_FUEL_PAGE);
        if (url.protocol !== "https:" || url.hostname !== "assets.publishing.service.gov.uk") return null;
        const dated = url.pathname.match(/weekly_road_fuel_prices_(\d{2})(\d{2})(\d{2})\.csv$/i);
        if (dated) {
          const timestamp = fuelDateTimestamp(`${dated[1]}/${dated[2]}/20${dated[3]}`);
          return Number.isFinite(timestamp) ? { url: url.href, timestamp } : null;
        }
        // DESNZ's open-ended current series; closed historical ranges are excluded.
        const series = url.pathname.match(/\/CSV__(\d{4})_-__\.csv$/i);
        return series ? { url: url.href, timestamp: Number.MAX_SAFE_INTEGER - 10000 + Number(series[1]) } : null;
      } catch { return null; }
    })
    .filter((candidate) => candidate !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
  return candidates[0]?.url ?? null;
}

export function parseLatestFuelCsv(
  csvText: string,
  sourceUrl = FALLBACK_CSV_URL
): FuelPriceSnapshot {
  const [rawHeader, ...rawRows] = csvText
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!rawHeader) return fuelFallback("Empty fuel CSV.");
  const headers = splitCsvLine(rawHeader).map(cleanHeader);
  const rows = rawRows.map((row) => {
    const cells = splitCsvLine(row);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
  const dateKey = headers.find((header) => header.toLowerCase() === "date") ?? "Date";
  const petrolKey = headers.find(
    (header) =>
      header.includes("ULSP") &&
      header.toLowerCase().includes("pump price") &&
      header.toLowerCase().includes("pence/litre")
  );
  const dieselKey = headers.find(
    (header) =>
      header.includes("ULSD") &&
      header.toLowerCase().includes("pump price") &&
      header.toLowerCase().includes("pence/litre")
  );
  const dutyKey = headers.find(
    (header) =>
      header.includes("ULSP") &&
      header.toLowerCase().includes("duty rate") &&
      header.toLowerCase().includes("pence/litre")
  );
  const vatKey = headers.find(
    (header) => header.includes("ULSP") && header.toLowerCase().includes("vat")
  );

  const latest = rows.filter((row) => {
    const timestamp = fuelDateTimestamp(row[dateKey]);
    return Number.isFinite(timestamp) && timestamp <= Date.now()
      && Number(row[petrolKey ?? ""]) > 0 && Number.isFinite(Number(row[petrolKey ?? ""]))
      && Number(row[dieselKey ?? ""]) > 0 && Number.isFinite(Number(row[dieselKey ?? ""]));
  }).sort((a, b) => fuelDateTimestamp(b[dateKey]) - fuelDateTimestamp(a[dateKey]))[0];
  if (!latest) return fuelFallback("No valid dated fuel-price rows.");

  const petrolP = Number(latest[petrolKey ?? ""]);
  const dieselP = Number(latest[dieselKey ?? ""]);
  const dutyP = Number(latest[dutyKey ?? ""]) || FALLBACK_FUEL_PRICES.duty_p_per_litre;
  const vatPct = Number(latest[vatKey ?? ""]) || FALLBACK_FUEL_PRICES.vat_pct;

  if (!Number.isFinite(petrolP) || !Number.isFinite(dieselP)) {
    return fuelFallback("Invalid fuel-price values.");
  }

  const stale = Date.now() - fuelDateTimestamp(latest[dateKey]) > MAX_SOURCE_AGE_MS;

  return {
    date: latest[dateKey] ?? FALLBACK_FUEL_PRICES.date,
    petrol_p_per_litre: petrolP,
    diesel_p_per_litre: dieselP,
    petrol_gbp_per_litre: petrolP / 100,
    diesel_gbp_per_litre: dieselP / 100,
    duty_p_per_litre: dutyP,
    vat_pct: vatPct,
    source_name: "DESNZ weekly road fuel prices",
    source_url: sourceUrl,
    fetched_at: new Date().toISOString(),
    stale,
    note: stale
      ? "Source observation is older than this app's 14-day freshness policy; verify prices or enter your own."
      : "Average UK pump prices from GOV.UK. Source observation is within this app's 14-day freshness policy, not a real-time quote."
  };
}

function fuelFallback(reason: string): FuelPriceSnapshot {
  return { ...FALLBACK_FUEL_PRICES, fetched_at: new Date().toISOString(), note: `${reason} ${FALLBACK_FUEL_PRICES.note}` };
}

function fuelDateTimestamp(value: string | undefined): number {
  const parts = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!parts) return NaN;
  const [, day, month, year] = parts.map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? timestamp : NaN;
}

function cleanHeader(value: string): string {
  const mojibakeBom = String.fromCharCode(0xef, 0xbb, 0xbf);
  return value.replace(/^\uFEFF/, "").replace(mojibakeBom, "").trim();
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}
