// =============================================================================
// app/api/admin/db/switch/route.ts — migrate + copy data to Postgres, or revert
// =============================================================================
// POST { url } → provision Postgres, copy all rows, reset sequences, persist the
//                new config, then drop the cached connection so the next request
//                reconnects on Postgres. If SERVICE_AUTORESTART=1, also exits the
//                process shortly after responding so a supervisor (WinSW /
//                systemd) relaunches cleanly.
// POST { revert: true } → rewrite config back to SQLite (file untouched = backup).
// Admin only; the connection string is never logged.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { looksLikePostgresUrl } from "@/lib/dbConfig";
import { switchToPostgres, revertToSqlite } from "@/lib/dbSwitch";
import { closeDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maybeScheduleRestart(): void {
  if (process.env.SERVICE_AUTORESTART === "1") {
    // Give the response time to flush, then exit so the service relaunches.
    setTimeout(() => process.exit(0), 1500);
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { url?: unknown; revert?: unknown };

  // Revert path: just rewrite config + drop the connection.
  if (body.revert) {
    revertToSqlite();
    await closeDb();
    maybeScheduleRestart();
    return NextResponse.json({ ok: true, driver: "sqlite", restart: process.env.SERVICE_AUTORESTART === "1" });
  }

  if (!looksLikePostgresUrl(body.url)) {
    return NextResponse.json({ error: "Enter a valid postgres:// URL" }, { status: 400 });
  }

  try {
    const result = await switchToPostgres(body.url);
    // Drop the cached SQLite connection so the next getDb() reads the new config
    // and reconnects on Postgres (works even without a process restart).
    await closeDb();
    maybeScheduleRestart();
    return NextResponse.json({
      ok: true,
      driver: "postgres",
      copied: result.copied,
      restart: process.env.SERVICE_AUTORESTART === "1",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Switch failed" }, { status: 502 });
  }
}
