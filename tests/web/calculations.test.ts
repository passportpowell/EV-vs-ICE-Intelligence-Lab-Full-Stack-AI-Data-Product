import { describe, expect, it } from "vitest";

import {
  calculateVehicleScenario,
  scenarioToOverrides,
  weightedElectricityPrice
} from "@/lib/calculations";
import { dataset } from "@/lib/data";

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
});
