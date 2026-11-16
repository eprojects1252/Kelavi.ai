"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Mode = "login" | "signup";

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === "signup") {
        const normalizedMobile = mobile.trim().replace(/[\\s()-]/g, "");
        if (!/^\\+[1-9]\\d{7,14}$/.test(normalizedMobile)) {
          throw new Error("Enter mobile number with country code, e.g. +919876543210.");
        }

        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              display_name: name.trim(),
              mobile_number: normalizedMobile,
              mobile_verified: false,
            },
            emailRedirectTo: "https://kelavi-ai.vercel.app/auth",
          },
        });
        if (authError) throw authError;

        if (data.session) {
          window.location.assign("/dashboard");
        } else {
          setNotice("Account created. Check your email and confirm your address, then sign in. Mobile number is not verified yet.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (authError) throw authError;
        window.location.assign("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>

      <div className="auth-tabs">
        <button type="button" className={mode === "login" ? "auth-tab selected" : "auth-tab"} onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Sign in</button>
        <button type="button" className={mode === "signup" ? "auth-tab selected" : "auth-tab"} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create account</button>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {mode === "signup" && (
          <>
            <label>Display name
              <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} required />
            </label>
            <label>Mobile number
              <input type="tel" autoComplete="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 9876543210" maxLength={16} required />
              <small>Include country code. OTP verification will be enabled later.</small>
            </label>
          </>
        )}
        <label>Email address
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </label>
        <label>Password
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
        </label>
        {error && <p className="auth-message error" role="alert">{error}</p>}
        {notice && <p className="auth-message success" role="status">{notice}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in →" : "Create account →"}</button>
      </form>

      <p className="auth-terms">By continuing, you agree to use Kilavi.Ai responsibly.</p>
    </section>
  );
}
