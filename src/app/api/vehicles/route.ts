import { NextResponse } from "next/server";

import { dataset } from "@/lib/data";

export function GET() {
  return NextResponse.json({
    count: dataset.vehicles.length,
    vehicles: dataset.vehicles
  });
}
