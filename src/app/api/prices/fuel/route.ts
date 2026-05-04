import { NextResponse } from "next/server";

import { fetchLatestFuelPrices } from "@/lib/fuel-prices";

export const dynamic = "force-dynamic";

export async function GET() {
  const prices = await fetchLatestFuelPrices();

  return NextResponse.json(prices, {
    headers: {
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400"
    }
  });
}
