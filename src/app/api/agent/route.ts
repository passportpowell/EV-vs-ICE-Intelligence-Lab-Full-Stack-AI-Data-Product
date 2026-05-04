import { type NextRequest, NextResponse } from "next/server";

import { runPortfolioAgent } from "@/lib/agent";
import { dataset } from "@/lib/data";

export function GET(request: NextRequest) {
  const query =
    request.nextUrl.searchParams.get("q") ??
    "Which vehicle is the best balanced choice?";

  return NextResponse.json(runPortfolioAgent(dataset, query));
}
