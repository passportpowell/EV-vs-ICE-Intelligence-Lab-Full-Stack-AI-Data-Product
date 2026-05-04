import { describe, expect, it } from "vitest";

import { runPortfolioAgent } from "@/lib/agent";
import { dataset } from "@/lib/data";
import {
  compareDvlaWithCatalog,
  findCatalogMatches,
  normaliseDvlaVehicle
} from "@/lib/dvla";
import { retrieveDocuments } from "@/lib/rag";

describe("RAG and agentic advisor", () => {
  it("retrieves relevant knowledge documents for an emissions query", () => {
    const hits = retrieveDocuments(
      dataset,
      "Which vehicle is cleanest for high mileage emissions?",
      5
    );

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.category === "scenario")).toBe(true);
  });

  it("returns a grounded agent recommendation with reasoning steps", () => {
    const result = runPortfolioAgent(
      dataset,
      "I drive 22000 miles a year and want low running costs"
    );

    expect(result.intent).toBe("cost");
    expect(result.scenario_id).toBe("high_mileage_fleet");
    expect(result.recommendation).not.toBeNull();
    expect(result.steps.length).toBeGreaterThanOrEqual(5);
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it("normalises DVLA registration data while preserving the trim limitation", () => {
    const vehicle = normaliseDvlaVehicle({
      registrationNumber: "AB12CDE",
      make: "VOLKSWAGEN",
      yearOfManufacture: 2021,
      fuelType: "PETROL",
      co2Emissions: 126,
      engineCapacity: 1498
    });

    expect(vehicle.make).toBe("Volkswagen");
    expect(vehicle.model_year).toBe(2021);
    expect(vehicle.trim).toBeNull();
    expect(vehicle.trim_warning).toContain("trim");
  });

  it("keeps conflicting DVLA and catalog values side by side", () => {
    const catalogVehicle = dataset.vehicles.find(
      (vehicle) => vehicle.id === "volkswagen-golf-etsi"
    );
    const dvlaVehicle = normaliseDvlaVehicle({
      registrationNumber: "AB12CDE",
      make: "VOLKSWAGEN",
      yearOfManufacture: 2024,
      fuelType: "PETROL",
      co2Emissions: 140,
      engineCapacity: 1498
    });

    const report = compareDvlaWithCatalog(dvlaVehicle, catalogVehicle);
    const co2 = report.comparisons.find(
      (comparison) => comparison.field === "co2_g_per_km"
    );

    expect(co2?.status).toBe("conflict");
    expect(co2?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "DVLA Vehicle Enquiry API",
          value: 140
        }),
        expect.objectContaining({
          source: "Local UK trim catalog",
          value: 126
        })
      ])
    );
    expect(report.conflicts.length).toBeGreaterThan(0);
  });

  it("ranks likely local trims from imported DVLA values", () => {
    const dvlaVehicle = normaliseDvlaVehicle({
      registrationNumber: "AB12CDE",
      make: "VOLKSWAGEN",
      yearOfManufacture: 2024,
      fuelType: "PETROL",
      co2Emissions: 126,
      engineCapacity: 1498
    });

    const matches = findCatalogMatches(
      dvlaVehicle,
      dataset.vehicles,
      { model: "Golf", trim: "eTSI" },
      3
    );

    expect(matches[0].vehicle_id).toBe("volkswagen-golf-etsi");
    expect(matches[0].confidence).toBeGreaterThanOrEqual(90);
    expect(matches[0].provenance.compared_with?.source).toBe(
      "Local UK trim catalog"
    );
  });
});
