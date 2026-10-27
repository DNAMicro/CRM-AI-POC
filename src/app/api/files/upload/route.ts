import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { insertAttachment } from "@/lib/db";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = path.extname(file.name) || "";
    const safeFilename = `${id}${ext}`;
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const attachment = insertAttachment({
      id,
      filename: safeFilename,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      url: `/api/files/${id}`,
    });

    return NextResponse.json({
      id: attachment.id,
      filename: attachment.originalName,
      url: attachment.url,
      size: attachment.size,
      mimeType: attachment.mimeType,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
