import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getAttachment } from "@/lib/db";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attachment = getAttachment(id);
  if (!attachment) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const filePath = path.join(UPLOAD_DIR, attachment.filename);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "File missing from disk" }, { status: 404 });
  }

  const buffer = await readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.originalName}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
