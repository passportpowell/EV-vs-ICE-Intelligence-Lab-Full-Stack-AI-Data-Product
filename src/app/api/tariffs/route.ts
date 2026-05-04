import { NextResponse } from "next/server";

import { dataset } from "@/lib/data";

export function GET() {
  return NextResponse.json({
    count: dataset.ev_tariffs.length,
    source_note:
      "Tariff rates are UK references with source dates. Standing charges vary by region and supplier, so user-entered overrides are supported.",
    tariffs: dataset.ev_tariffs
  });
}
