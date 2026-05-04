import { NextResponse } from "next/server";

import { dataset } from "@/lib/data";
import { uniqueSorted } from "@/lib/vehicles";

export function GET() {
  const makes = uniqueSorted(dataset.vehicles.map((vehicle) => vehicle.make));
  const models = uniqueSorted(dataset.vehicles.map((vehicle) => vehicle.model));
  const years = uniqueSorted(dataset.vehicles.map((vehicle) => vehicle.model_year));

  return NextResponse.json({
    count: dataset.vehicles.length,
    makes,
    models,
    model_years: years,
    vehicles: dataset.vehicles
  });
}
