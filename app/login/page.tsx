// =============================================================================
// app/login/page.tsx — sign-in page (Server Action)
// =============================================================================
// Renders a credentials form whose `action` is a Server Action that verifies
// the password, creates a session row, sets the httpOnly cookie, and redirects.
// On failure it redirects back with `?error=1` (the page reads it from
// searchParams). Asking the Oracle stays open to all; this gate only fronts
// History and the Lab (see middleware.ts).
// =============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import {
  verifyCredentials,
  createSession,
  setSessionCookie,
  ALLOW_SIGNUP,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

async function loginAction(formData: FormData): Promise<void> {
  "use server";
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));
  const user = await verifyCredentials(username, password);
  if (!user) redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  const token = await createSession(user.id);
  await setSessionCookie(token);
  redirect(next);
}

/** Only allow internal redirect targets (no open-redirect to other sites). */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next ?? "/");
  return (
    <main className="wrap">
      <div className="topbar">
        <h1 className="title">
          Sign in <span className="spark">🔑</span>
        </h1>
        <Link className="navlink" href="/">
          ← Back to the Oracle
        </Link>
      </div>
      <p className="tagline">Sign in to keep your history and conjure private personas.</p>

      <form className="panel authform" action={loginAction}>
        <input type="hidden" name="next" value={next} />
        <label className="field">
          Username
          <input name="username" autoComplete="username" required minLength={3} />
        </label>
        <label className="field">
          Password
          <input name="password" type="password" autoComplete="current-password" required minLength={6} />
        </label>
        {sp.error && <p className="error">Wrong username or password.</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <button type="submit">Sign in</button>
        </div>
      </form>

      {ALLOW_SIGNUP && (
        <p className="persona-desc">
          No account? <Link className="navlink" href="/signup">Create one</Link>.
        </p>
      )}
    </main>
  );
}
