// =============================================================================
// app/settings/page.tsx — Settings (server wrapper)
// =============================================================================
// Reads the current database backend (sqlite/postgres) on the server and the
// current user, then hands off to the client component that renders the full
// panel. Open to everyone; the admin sections are gated by `role` and the
// route handlers behind them.
// =============================================================================

import { readDbConfig } from "@/lib/dbConfig";
import { getCurrentUser } from "@/lib/auth";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const driver = readDbConfig().driver;
  const user = await getCurrentUser();
  return (
    <SettingsClient
      initialDriver={driver}
      user={user ? { id: user.id, username: user.username, role: user.role } : null}
    />
  );
}
