import type { FuelPriceSnapshot } from "@/lib/types";

const GOV_FUEL_PAGE =
  "https://www.gov.uk/government/statistics/weekly-road-fuel-prices";
const FALLBACK_CSV_URL =
  "https://assets.publishing.service.gov.uk/media/69ef7b5ed36883a64473ba42/weekly_road_fuel_prices_270426.csv";

const FALLBACK_FUEL_PRICES: FuelPriceSnapshot = {
  date: "27/04/2026",
  petrol_p_per_litre: 156.99,
  diesel_p_per_litre: 189.81,
  petrol_gbp_per_litre: 1.5699,
  diesel_gbp_per_litre: 1.8981,
  duty_p_per_litre: 52.95,
  vat_pct: 20,
  source_name: "DESNZ weekly road fuel prices",
  source_url: FALLBACK_CSV_URL,
  fetched_at: "2026-04-28T00:00:00.000Z",
  stale: true,
  note: "Fallback value from the GOV.UK CSV published for week commencing 27 April 2026."
};

export async function fetchLatestFuelPrices(): Promise<FuelPriceSnapshot> {
  try {
    const pageResponse = await fetch(GOV_FUEL_PAGE, { cache: "no-store" });
    const pageText = pageResponse.ok ? await pageResponse.text() : "";
    const csvUrl = findWeeklyFuelCsvUrl(pageText) ?? FALLBACK_CSV_URL;

    const csvResponse = await fetch(csvUrl, { cache: "no-store" });
    if (!csvResponse.ok) {
      return {
        ...FALLBACK_FUEL_PRICES,
        fetched_at: new Date().toISOString(),
        stale: true,
        note: "Live CSV request failed; returned the latest checked fallback."
      };
    }

    return {
      ...parseLatestFuelCsv(await csvResponse.text(), csvUrl),
      fetched_at: new Date().toISOString(),
      stale: false
    };
  } catch {
    return {
      ...FALLBACK_FUEL_PRICES,
      fetched_at: new Date().toISOString(),
      stale: true,
      note: "Live GOV.UK fuel-price refresh failed; returned fallback values."
    };
  }
}

export function findWeeklyFuelCsvUrl(html: string): string | null {
  const direct = html.match(
    /https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+weekly_road_fuel_prices_[^"']+\.csv/i
  );
  if (direct?.[0]) {
    return direct[0].replaceAll("&amp;", "&");
  }

  const href = html.match(/href=["']([^"']*weekly_road_fuel_prices_[^"']+\.csv)["']/i);
  if (!href?.[1]) {
    return null;
  }

  return href[1].startsWith("http")
    ? href[1].replaceAll("&amp;", "&")
    : `https://www.gov.uk${href[1]}`.replaceAll("&amp;", "&");
}

export function parseLatestFuelCsv(
  csvText: string,
  sourceUrl = FALLBACK_CSV_URL
): FuelPriceSnapshot {
  const [rawHeader, ...rawRows] = csvText
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const headers = splitCsvLine(rawHeader).map(cleanHeader);
  const rows = rawRows.map((row) => {
    const cells = splitCsvLine(row);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
  const latest = rows.at(-1);

  if (!latest) {
    return FALLBACK_FUEL_PRICES;
  }

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

  const petrolP = Number(latest[petrolKey ?? ""]);
  const dieselP = Number(latest[dieselKey ?? ""]);
  const dutyP = Number(latest[dutyKey ?? ""]) || FALLBACK_FUEL_PRICES.duty_p_per_litre;
  const vatPct = Number(latest[vatKey ?? ""]) || FALLBACK_FUEL_PRICES.vat_pct;

  if (!Number.isFinite(petrolP) || !Number.isFinite(dieselP)) {
    return FALLBACK_FUEL_PRICES;
  }

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
    stale: false,
    note: "Average UK pump prices for unleaded petrol and diesel from GOV.UK."
  };
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
