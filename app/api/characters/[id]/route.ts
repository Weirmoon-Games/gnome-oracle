import { NextRequest, NextResponse } from "next/server";
import { deleteCharacter } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const result = deleteCharacter(numId);
  switch (result) {
    case "deleted":
      return NextResponse.json({ ok: true });
    case "not_found":
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    case "protected":
      return NextResponse.json(
        { error: "Built-in personas cannot be deleted" },
        { status: 403 }
      );
  }
}
