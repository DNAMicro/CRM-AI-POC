import { NextResponse } from "next/server";
import { getIntegrationStatus } from "@/lib/settings";

export async function GET() {
  const status = getIntegrationStatus();
  return NextResponse.json(status);
}
