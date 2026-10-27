import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const contactId = searchParams.get("contactId");
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || 50;

  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const result = db.getSmsByContact(contactId, { page, pageSize });
  return NextResponse.json(result);
}
