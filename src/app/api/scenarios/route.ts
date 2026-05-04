import { NextResponse } from "next/server";

import { dataset } from "@/lib/data";

export function GET() {
  return NextResponse.json({
    count: dataset.scenarios.length,
    scenarios: dataset.scenarios
  });
}
