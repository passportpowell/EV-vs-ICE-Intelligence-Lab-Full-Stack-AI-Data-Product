import { describe, expect, it } from "vitest";

import {
  calculateVehicleScenario,
  scenarioToOverrides,
  weightedElectricityPrice
} from "@/lib/calculations";
import { dataset } from "@/lib/data";
import { parseLatestFuelCsv } from "@/lib/fuel-prices";
import {
  blendedHomeTariffGbpPerKwh,
  buildEnergyComparisonRows,
  tariffRateInputFromTariff
} from "@/lib/tariffs";

describe("vehicle comparison calculations", () => {
  const scenario = dataset.scenarios.find(
    (item) => item.scenario_id === "mixed_household"
  );
  const mg4 = dataset.vehicles.find((vehicle) => vehicle.id === "mg4-ev-long-range");
  const golf = dataset.vehicles.find((vehicle) => vehicle.id === "volkswagen-golf-etsi");

  it("keeps EV use-phase emissions below comparable petrol use-phase emissions", () => {
    expect(scenario).toBeDefined();
    expect(mg4).toBeDefined();
    expect(golf).toBeDefined();

    const overrides = scenarioToOverrides(scenario!);
    const ev = calculateVehicleScenario(mg4!, overrides);
    const petrol = calculateVehicleScenario(golf!, overrides);

    expect(ev.use_phase_kgco2e).toBeLessThan(petrol.use_phase_kgco2e);
  });

  it("responds to home charging mix changes", () => {
    const base = scenarioToOverrides(scenario!);
    const mostlyHome = weightedElectricityPrice({
      ...base,
      homeChargingSharePct: 90
    });
    const mostlyPublic = weightedElectricityPrice({
      ...base,
      homeChargingSharePct: 15
    });

    expect(mostlyHome).toBeLessThan(mostlyPublic);
  });

  it("calculates tariff-aware EV energy costs with standing charges", () => {
    const tariff = dataset.ev_tariffs.find(
      (item) => item.tariff_id === "intelligent-octopus-go"
    );
    expect(tariff).toBeDefined();

    const input = tariffRateInputFromTariff(tariff!);
    const rows = buildEnergyComparisonRows(dataset.vehicles, mg4, {
      ...scenarioToOverrides(scenario!),
      petrolGbpPerLitre: 1.57,
      dieselGbpPerLitre: 1.9,
      homeElectricityGbpPerKwh: blendedHomeTariffGbpPerKwh(input),
      evStandingChargeGbpPerDay: input.standingChargePPerDay / 100,
      standingChargeAllocationPct: input.standingChargeAllocationPct
    }, input);
    const ev = rows.find((row) => row.fuel_type === "electric");

    expect(ev?.annual_standing_cost_gbp).toBeGreaterThan(0);
    expect(ev?.pence_per_mile).toBeGreaterThan(0);
  });

  it("parses the latest GOV.UK weekly fuel CSV row", () => {
    const parsed = parseLatestFuelCsv(
      [
        "Date,ULSP (Ultra low sulphur unleaded petrol) Pump price in pence/litre,ULSD (Ultra low sulphur diesel) Pump price in pence/litre,ULSP (Ultra low sulphur unleaded petrol) Duty rate in pence/litre,ULSP (Ultra low sulphur unleaded petrol) VAT percentage rate",
        "20/04/2026,155.10,188.20,52.95,20",
        "27/04/2026,156.99,189.81,52.95,20"
      ].join("\n")
    );

    expect(parsed.date).toBe("27/04/2026");
    expect(parsed.petrol_gbp_per_litre).toBeCloseTo(1.5699);
    expect(parsed.diesel_gbp_per_litre).toBeCloseTo(1.8981);
  });
});
