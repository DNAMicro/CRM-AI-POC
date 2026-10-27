import { NextRequest, NextResponse } from "next/server";
import { typeaheadSearch } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const type = searchParams.get("type") || undefined;

  if (q.length < 1) {
    return NextResponse.json([]);
  }

  const results = typeaheadSearch(q, type);
  return NextResponse.json(results);
}
