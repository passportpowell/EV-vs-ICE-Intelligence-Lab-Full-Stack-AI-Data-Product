import { type NextRequest, NextResponse } from "next/server";

import { dataset, getScenario } from "@/lib/data";
import {
  buildEnergyComparisonRows,
  tariffRateInputFromTariff
} from "@/lib/tariffs";
import type { ScenarioOverrides, TariffRateInput } from "@/lib/types";

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const scenario = getScenario(searchParams.get("scenario") ?? undefined);
  const tariff =
    dataset.ev_tariffs.find(
      (item) => item.tariff_id === searchParams.get("tariffId")
    ) ??
    dataset.ev_tariffs.find(
      (item) => item.tariff_id === "intelligent-octopus-go"
    ) ??
    dataset.ev_tariffs[0];
  const selectedVehicle =
    dataset.vehicles.find((vehicle) => vehicle.id === searchParams.get("vehicleId")) ??
    dataset.vehicles[0];

  const tariffInput: TariffRateInput = tariffRateInputFromTariff(tariff);
  assignNumber(searchParams, tariffInput, "offPeakPPerKwh", "offPeakPPerKwh");
  assignNumber(searchParams, tariffInput, "peakPPerKwh", "peakPPerKwh");
  assignNumber(searchParams, tariffInput, "offPeakSharePct", "offPeakSharePct");
  assignNumber(
    searchParams,
    tariffInput,
    "standingChargePPerDay",
    "standingChargePPerDay"
  );
  assignNumber(
    searchParams,
    tariffInput,
    "standingChargeAllocationPct",
    "standingChargeAllocationPct"
  );

  const overrides: ScenarioOverrides = {
    annualMiles: scenario.annual_miles,
    ownershipYears: scenario.ownership_years,
    urbanSharePct: scenario.urban_share_pct,
    motorwaySharePct: scenario.motorway_share_pct,
    petrolGbpPerLitre: scenario.petrol_gbp_per_litre,
    dieselGbpPerLitre: scenario.diesel_gbp_per_litre,
    homeElectricityGbpPerKwh: scenario.home_electricity_gbp_per_kwh,
    publicRapidGbpPerKwh: scenario.public_rapid_gbp_per_kwh,
    homeChargingSharePct: scenario.home_charging_share_pct,
    gridGco2ePerKwh: scenario.grid_gco2e_per_kwh,
    evStandingChargeGbpPerDay: tariffInput.standingChargePPerDay / 100,
    standingChargeAllocationPct: tariffInput.standingChargeAllocationPct
  };
  assignNumber(searchParams, overrides, "annualMiles", "annualMiles");
  assignNumber(searchParams, overrides, "ownershipYears", "ownershipYears");
  assignNumber(
    searchParams,
    overrides,
    "homeChargingSharePct",
    "homeChargingSharePct"
  );
  assignNumber(
    searchParams,
    overrides,
    "publicRapidGbpPerKwh",
    "publicRapidGbpPerKwh"
  );
  assignPencePerLitre(searchParams, overrides, "petrolPPerLitre", "petrolGbpPerLitre");
  assignPencePerLitre(searchParams, overrides, "dieselPPerLitre", "dieselGbpPerLitre");

  return NextResponse.json({
    scenario: scenario.scenario_id,
    selected_tariff: tariff,
    input: {
      tariff: tariffInput,
      annual_miles: overrides.annualMiles,
      home_charging_share_pct: overrides.homeChargingSharePct,
      petrol_gbp_per_litre: overrides.petrolGbpPerLitre,
      diesel_gbp_per_litre: overrides.dieselGbpPerLitre
    },
    results: buildEnergyComparisonRows(
      dataset.vehicles,
      selectedVehicle,
      overrides,
      tariffInput
    )
  });
}

function assignNumber<T, K extends keyof T>(
  searchParams: URLSearchParams,
  target: T,
  queryKey: string,
  targetKey: K
) {
  const raw = searchParams.get(queryKey);
  if (raw === null) {
    return;
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    target[targetKey] = parsed as T[K];
  }
}

function assignPencePerLitre(
  searchParams: URLSearchParams,
  target: ScenarioOverrides,
  queryKey: string,
  targetKey: "petrolGbpPerLitre" | "dieselGbpPerLitre"
) {
  const raw = searchParams.get(queryKey);
  if (raw === null) {
    return;
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    target[targetKey] = parsed / 100;
  }
}
