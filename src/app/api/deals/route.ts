import { NextRequest, NextResponse } from "next/server";
import { getAllDeals, getDealsByStage, getDealsByContact, getActiveDeals, insertDeal } from "@/lib/db";
import type { PipelineStage } from "@/types/crm";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const stage = sp.get("stage") as PipelineStage | null;
  const contactId = sp.get("contactId");
  const activeOnly = sp.get("activeOnly");

  if (stage) return NextResponse.json(getDealsByStage(stage));
  if (contactId) return NextResponse.json(getDealsByContact(contactId));
  if (activeOnly === "true") return NextResponse.json(getActiveDeals());
  return NextResponse.json(getAllDeals());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name || !body.company) {
      return NextResponse.json({ error: "name and company are required" }, { status: 400 });
    }
    const deal = insertDeal(body);
    return NextResponse.json(deal, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
