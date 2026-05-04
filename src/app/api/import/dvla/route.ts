import { type NextRequest, NextResponse } from "next/server";

import { dataset } from "@/lib/data";
import {
  compareDvlaWithCatalog,
  findCatalogMatches,
  normaliseDvlaVehicle
} from "@/lib/dvla";

const DVLA_URL =
  "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles";

export async function GET(request: NextRequest) {
  const registration = request.nextUrl.searchParams
    .get("registration")
    ?.replace(/\s+/g, "")
    .toUpperCase();
  const apiKey =
    process.env.DVLA_API_KEY ?? process.env.VEHICLE_ENQUIRY_API_KEY ?? "";
  const catalogVehicleId = request.nextUrl.searchParams.get("vehicleId");
  const modelHint = request.nextUrl.searchParams.get("model");
  const trimHint = request.nextUrl.searchParams.get("trim");
  const catalogVehicle = dataset.vehicles.find(
    (vehicle) => vehicle.id === catalogVehicleId
  );

  if (!registration) {
    return NextResponse.json(
      { error: "registration query parameter is required" },
      { status: 400 }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "DVLA_API_KEY is not configured",
        next_step:
          "Add DVLA_API_KEY to the deployment environment to enable live UK registration import."
      },
      { status: 503 }
    );
  }

  const response = await fetch(DVLA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({ registrationNumber: registration }),
    cache: "no-store"
  });

  const payload = await response.json();
  if (!response.ok) {
    return NextResponse.json(payload, { status: response.status });
  }
  const vehicle = normaliseDvlaVehicle(payload);

  return NextResponse.json({
    imported_at: new Date().toISOString(),
    vehicle,
    provenance: compareDvlaWithCatalog(vehicle, catalogVehicle),
    matches: findCatalogMatches(
      vehicle,
      dataset.vehicles,
      {
        model: modelHint ?? catalogVehicle?.model,
        trim: trimHint ?? catalogVehicle?.trim
      },
      5
    )
  });
}
