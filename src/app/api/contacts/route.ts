import { NextRequest, NextResponse } from "next/server";
import { getAllContacts, searchContacts, insertContact } from "@/lib/db";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search");
  const contacts = search ? searchContacts(search) : getAllContacts();
  return NextResponse.json(contacts);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.firstName || !body.lastName || !body.company) {
      return NextResponse.json({ error: "firstName, lastName, and company are required" }, { status: 400 });
    }
    const contact = insertContact(body);
    return NextResponse.json(contact, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
