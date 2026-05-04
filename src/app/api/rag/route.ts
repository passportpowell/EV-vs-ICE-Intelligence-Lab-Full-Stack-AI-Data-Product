import { type NextRequest, NextResponse } from "next/server";

import { dataset } from "@/lib/data";
import { buildRagAnswer, retrieveDocuments } from "@/lib/rag";

export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 5);
  const hits = retrieveDocuments(dataset, query, Number.isFinite(limit) ? limit : 5);

  return NextResponse.json({
    query,
    count: hits.length,
    answer: buildRagAnswer(query, hits),
    hits
  });
}
