import type { ScenarioResult, Vehicle } from "@/lib/types";

export function vehicleDisplayName(vehicle: Vehicle | ScenarioResult): string {
  return [vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
}

export function vehicleCatalogLabel(vehicle: Vehicle): string {
  return `${vehicle.model_year} ${vehicle.trim}`;
}

export function uniqueSorted(values: Array<string | number>): string[] {
  return Array.from(new Set(values.map(String))).sort((a, b) =>
    a.localeCompare(b, "en-GB", { numeric: true })
  );
}

export function firstVehicleMatching(
  vehicles: Vehicle[],
  predicate: (vehicle: Vehicle) => boolean
): Vehicle {
  return vehicles.find(predicate) ?? vehicles[0];
}
