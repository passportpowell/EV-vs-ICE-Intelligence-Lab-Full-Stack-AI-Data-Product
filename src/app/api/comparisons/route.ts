import { type NextRequest, NextResponse } from "next/server";

import { buildComparison, getScenario } from "@/lib/data";
import type { ScenarioOverrides } from "@/lib/types";

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const scenarioId = searchParams.get("scenario") ?? undefined;
  const scenario = getScenario(scenarioId);
  const overrides: Partial<ScenarioOverrides> = {};

  assignNumber(searchParams, overrides, "annualMiles", "annualMiles");
  assignNumber(searchParams, overrides, "ownershipYears", "ownershipYears");
  assignNumber(searchParams, overrides, "urbanSharePct", "urbanSharePct");
  assignNumber(searchParams, overrides, "motorwaySharePct", "motorwaySharePct");
  assignNumber(searchParams, overrides, "petrolGbpPerLitre", "petrolGbpPerLitre");
  assignNumber(searchParams, overrides, "dieselGbpPerLitre", "dieselGbpPerLitre");
  assignNumber(
    searchParams,
    overrides,
    "homeElectricityGbpPerKwh",
    "homeElectricityGbpPerKwh"
  );
  assignNumber(
    searchParams,
    overrides,
    "publicRapidGbpPerKwh",
    "publicRapidGbpPerKwh"
  );
  assignNumber(
    searchParams,
    overrides,
    "homeChargingSharePct",
    "homeChargingSharePct"
  );
  assignNumber(searchParams, overrides, "gridGco2ePerKwh", "gridGco2ePerKwh");

  const segment = searchParams.get("segment");
  const powertrain = searchParams.get("powertrain");
  const rows = buildComparison(scenario.scenario_id, overrides)
    .filter((row) => (segment ? row.segment === segment : true))
    .filter((row) => (powertrain ? row.powertrain === powertrain : true))
    .sort((a, b) => a.total_cost_per_mile_gbp - b.total_cost_per_mile_gbp);

  return NextResponse.json({
    scenario: scenario.scenario_id,
    count: rows.length,
    results: rows
  });
}

function assignNumber<K extends keyof ScenarioOverrides>(
  searchParams: URLSearchParams,
  target: Partial<ScenarioOverrides>,
  queryKey: string,
  targetKey: K
) {
  const raw = searchParams.get(queryKey);
  if (raw === null) {
    return;
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    target[targetKey] = parsed;
  }
}
