import type {
  PowertrainSummary,
  Scenario,
  ScenarioOverrides,
  ScenarioResult,
  Vehicle
} from "@/lib/types";

const MILES_TO_KM = 1.609344;
const ICE_UPSTREAM_MULTIPLIER = 1.18;

export function scenarioToOverrides(scenario: Scenario): ScenarioOverrides {
  return {
    annualMiles: scenario.annual_miles,
    ownershipYears: scenario.ownership_years,
    urbanSharePct: scenario.urban_share_pct,
    motorwaySharePct: scenario.motorway_share_pct,
    petrolGbpPerLitre: scenario.petrol_gbp_per_litre,
    dieselGbpPerLitre: scenario.diesel_gbp_per_litre,
    homeElectricityGbpPerKwh: scenario.home_electricity_gbp_per_kwh,
    publicRapidGbpPerKwh: scenario.public_rapid_gbp_per_kwh,
    homeChargingSharePct: scenario.home_charging_share_pct,
    gridGco2ePerKwh: scenario.grid_gco2e_per_kwh
  };
}

export function weightedElectricityPrice(input: ScenarioOverrides): number {
  const homeShare = input.homeChargingSharePct / 100;
  return (
    homeShare * input.homeElectricityGbpPerKwh +
    (1 - homeShare) * input.publicRapidGbpPerKwh
  );
}

export function adjustedEfficiency(vehicle: Vehicle, input: ScenarioOverrides): number {
  const urbanDelta = (input.urbanSharePct - 42) / 100;
  const motorwayDelta = (input.motorwaySharePct - 34) / 100;
  const factor =
    vehicle.fuel_type === "electric"
      ? 1 - 0.08 * urbanDelta + 0.14 * motorwayDelta
      : 1 + 0.12 * urbanDelta + 0.06 * motorwayDelta;

  return round(Math.max(vehicle.efficiency_value * factor, vehicle.efficiency_value * 0.82), 3);
}

export function depreciationCost(vehicle: Vehicle, ownershipYears: number): number {
  const ownershipFraction =
    1 - Math.pow(1 - vehicle.depreciation_3yr_pct, ownershipYears / 3);
  return vehicle.purchase_price_gbp * Math.min(ownershipFraction, 0.86);
}

export function calculateVehicleScenario(
  vehicle: Vehicle,
  input: ScenarioOverrides,
  scenarioId = "custom"
): ScenarioResult {
  const distanceKm = input.annualMiles * input.ownershipYears * MILES_TO_KM;
  const totalMiles = input.annualMiles * input.ownershipYears;
  const efficiency = adjustedEfficiency(vehicle, input);
  const energyUnits = (distanceKm * efficiency) / 100;

  const isEv = vehicle.fuel_type === "electric";
  const energyCost = isEv
    ? energyUnits * weightedElectricityPrice(input)
    : energyUnits *
      (vehicle.fuel_type === "diesel"
        ? input.dieselGbpPerLitre
        : input.petrolGbpPerLitre);
  const usePhaseKg = isEv
    ? (energyUnits * input.gridGco2ePerKwh) / 1000
    : ((vehicle.tailpipe_gco2_per_km * distanceKm) / 1000) *
      ICE_UPSTREAM_MULTIPLIER;
  const maintenanceCost = vehicle.annual_maintenance_gbp * input.ownershipYears;
  const depreciation = depreciationCost(vehicle, input.ownershipYears);
  const totalCost = depreciation + energyCost + maintenanceCost;
  const lifecycleKg = vehicle.manufacturing_gco2e_kg + usePhaseKg;

  return {
    scenario_id: scenarioId,
    vehicle_id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    model_year: vehicle.model_year,
    available_from_year: vehicle.available_from_year,
    available_to_year: vehicle.available_to_year,
    uk_market_status: vehicle.uk_market_status,
    body_style: vehicle.body_style,
    segment: vehicle.segment,
    powertrain: vehicle.powertrain,
    fuel_type: vehicle.fuel_type,
    annual_miles: input.annualMiles,
    ownership_years: input.ownershipYears,
    adjusted_efficiency: efficiency,
    efficiency_unit: vehicle.efficiency_unit,
    energy_unit: isEv ? "kWh" : "litres",
    energy_units_used: round(energyUnits, 1),
    energy_cost_gbp: round(energyCost, 2),
    maintenance_cost_gbp: round(maintenanceCost, 2),
    depreciation_cost_gbp: round(depreciation, 2),
    total_cost_gbp: round(totalCost, 2),
    total_cost_per_mile_gbp: round(totalCost / totalMiles, 3),
    annual_energy_cost_gbp: round(energyCost / input.ownershipYears, 2),
    use_phase_kgco2e: round(usePhaseKg, 1),
    manufacturing_kgco2e: round(vehicle.manufacturing_gco2e_kg, 1),
    lifecycle_kgco2e: round(lifecycleKg, 1),
    lifecycle_tonnes_co2e: round(lifecycleKg / 1000, 2),
    break_even_miles_vs_segment_ice: null
  };
}

export function calculateFleet(
  vehicles: Vehicle[],
  input: ScenarioOverrides,
  scenarioId = "custom"
): ScenarioResult[] {
  const rows = vehicles.map((vehicle) =>
    calculateVehicleScenario(vehicle, input, scenarioId)
  );

  return addBreakEvenMiles(rows);
}

export function addBreakEvenMiles(rows: ScenarioResult[]): ScenarioResult[] {
  return rows.map((row) => {
    if (row.fuel_type !== "electric") {
      return row;
    }

    const iceReference = rows
      .filter((candidate) => candidate.segment === row.segment)
      .filter((candidate) => candidate.fuel_type !== "electric")
      .sort((a, b) => a.total_cost_per_mile_gbp - b.total_cost_per_mile_gbp)[0];

    if (!iceReference) {
      return row;
    }

    const miles = row.annual_miles * row.ownership_years;
    const evRunningCost =
      (row.energy_cost_gbp + row.maintenance_cost_gbp) / miles;
    const iceRunningCost =
      (iceReference.energy_cost_gbp + iceReference.maintenance_cost_gbp) / miles;
    const saving = iceRunningCost - evRunningCost;
    const capitalDelta =
      row.depreciation_cost_gbp - iceReference.depreciation_cost_gbp;

    return {
      ...row,
      break_even_miles_vs_segment_ice:
        saving > 0 ? Math.max(Math.round(capitalDelta / saving), 0) : null
    };
  });
}

export function summariseByPowertrain(rows: ScenarioResult[]): PowertrainSummary[] {
  const groups = new Map<string, ScenarioResult[]>();
  for (const row of rows) {
    groups.set(row.powertrain, [...(groups.get(row.powertrain) ?? []), row]);
  }

  return Array.from(groups, ([powertrain, group]) => ({
    scenario_id: group[0]?.scenario_id ?? "custom",
    powertrain,
    vehicles: group.length,
    avg_total_cost_per_mile_gbp: average(group, "total_cost_per_mile_gbp"),
    avg_total_cost_gbp: average(group, "total_cost_gbp"),
    avg_lifecycle_tonnes_co2e: average(group, "lifecycle_tonnes_co2e"),
    avg_annual_energy_cost_gbp: average(group, "annual_energy_cost_gbp"),
    avg_use_phase_kgco2e: average(group, "use_phase_kgco2e")
  })).sort(
    (a, b) => a.avg_total_cost_per_mile_gbp - b.avg_total_cost_per_mile_gbp
  );
}

export function bestByCost(rows: ScenarioResult[]): ScenarioResult | undefined {
  return [...rows].sort(
    (a, b) => a.total_cost_per_mile_gbp - b.total_cost_per_mile_gbp
  )[0];
}

export function bestByEmissions(rows: ScenarioResult[]): ScenarioResult | undefined {
  return [...rows].sort(
    (a, b) => a.lifecycle_tonnes_co2e - b.lifecycle_tonnes_co2e
  )[0];
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function average<T extends Record<string, unknown>>(rows: T[], key: keyof T): number {
  return round(
    rows.reduce((total, row) => total + Number(row[key]), 0) / rows.length,
    3
  );
}
