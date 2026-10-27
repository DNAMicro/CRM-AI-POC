import { NextRequest, NextResponse } from "next/server";
import { getRecentActivities, getActivitiesByContact, getActivitiesByDeal, insertActivity } from "@/lib/db";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const contactId = sp.get("contactId");
  const dealId = sp.get("dealId");
  const limit = parseInt(sp.get("limit") || "10", 10);

  if (contactId) return NextResponse.json(getActivitiesByContact(contactId));
  if (dealId) return NextResponse.json(getActivitiesByDeal(dealId));
  return NextResponse.json(getRecentActivities(limit));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.type || !body.contactId || !body.description) {
      return NextResponse.json({ error: "type, contactId, and description are required" }, { status: 400 });
    }
    const activity = insertActivity(body);
    return NextResponse.json(activity, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
