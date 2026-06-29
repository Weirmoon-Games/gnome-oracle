// =============================================================================
// app/signup/page.tsx — self-registration page (Server Action)
// =============================================================================
// Creates a 'user' account, opens a session, and redirects home. Honors the
// ALLOW_SIGNUP env flag: when disabled, the form is replaced with a notice.
// Errors (username taken / invalid input) round-trip via `?error=`.
// =============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { createUser, createSession, setSessionCookie, ALLOW_SIGNUP } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function signupAction(formData: FormData): Promise<void> {
  "use server";
  if (!ALLOW_SIGNUP) redirect("/signup?error=disabled");
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    const user = await createUser(username, password, "user");
    const token = await createSession(user.id);
    await setSessionCookie(token);
  } catch (e) {
    const code = (e as Error).message === "username taken" ? "taken" : "invalid";
    redirect(`/signup?error=${code}`);
  }
  redirect("/");
}

const ERROR_TEXT: Record<string, string> = {
  taken: "That username is already taken.",
  invalid: "Username needs 3+ characters and password 6+.",
  disabled: "Sign-ups are currently disabled.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="wrap">
      <div className="topbar">
        <h1 className="title">
          Create account <span className="spark">✨</span>
        </h1>
        <Link className="navlink" href="/">
          ← Back to the Oracle
        </Link>
      </div>

      {ALLOW_SIGNUP ? (
        <>
          <p className="tagline">Make an account to save history and build private personas.</p>
          <form className="panel authform" action={signupAction}>
            <label className="field">
              Username
              <input name="username" autoComplete="username" required minLength={3} />
            </label>
            <label className="field">
              Password
              <input name="password" type="password" autoComplete="new-password" required minLength={6} />
            </label>
            {sp.error && <p className="error">{ERROR_TEXT[sp.error] ?? "Something went wrong."}</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <button type="submit">Create account</button>
            </div>
          </form>
          <p className="persona-desc">
            Already have one? <Link className="navlink" href="/login">Sign in</Link>.
          </p>
        </>
      ) : (
        <p className="persona-desc">Sign-ups are disabled on this Oracle. Ask the admin for an account.</p>
      )}
    </main>
  );
}
