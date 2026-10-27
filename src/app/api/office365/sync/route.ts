import { NextResponse } from "next/server";
import { isOffice365Connected, syncRecentEmails } from "@/lib/office365";

export async function POST() {
  if (!isOffice365Connected()) {
    return NextResponse.json({ error: "Office 365 not connected" }, { status: 400 });
  }

  try {
    const result = await syncRecentEmails();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Office 365 sync error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
