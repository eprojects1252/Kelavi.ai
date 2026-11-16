"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Mode = "login" | "signup";
type LoginMethod = "email" | "mobile";

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("mobile");
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
        const normalizedMobile = mobile.trim().replace(/[\s()-]/g, "");
        if (!/^\+[1-9]\d{7,14}$/.test(normalizedMobile)) {
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
        const loginValue = identifier.trim();
        if (loginMethod === "email") {
          if (!loginValue.includes("@")) throw new Error("Enter a valid email address.");
          const { error: authError } = await supabase.auth.signInWithPassword({
            email: loginValue.toLowerCase(),
            password,
          });
          if (authError) throw authError;
        } else {
          const normalizedMobile = loginValue.replace(/[\\s()-]/g, "");
          if (!/^\\+[1-9]\\d{7,14}$/.test(normalizedMobile)) {
            throw new Error("Enter mobile number with country code, e.g. +919876543210.");
          }
          const apiUrl = process.env.NEXT_PUBLIC_KELAVI_API_URL?.replace(/\\/$/, "");
          if (!apiUrl) throw new Error("Mobile sign-in service is not connected yet.");
          const response = await fetch(apiUrl + "/api/v1/auth/login-mobile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mobile_number: normalizedMobile, password }),
          });
          const result = await response.json().catch(() => ({})) as {
            access_token?: string;
            refresh_token?: string;
            detail?: string;
          };
          if (!response.ok || !result.access_token || !result.refresh_token) {
            throw new Error(typeof result.detail === "string" ? result.detail : "Invalid mobile number or password.");
          }
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
          });
          if (sessionError) throw sessionError;
        }
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
              <small>Include country code. Mobile OTP verification will be enabled later.</small>
            </label>
            <label>Email address
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </label>
          </>
        )}
        {mode === "login" && (
          <>
            <div className="auth-tabs" aria-label="Sign-in method">
              <button type="button" className={loginMethod === "email" ? "auth-tab selected" : "auth-tab"} onClick={() => { setLoginMethod("email"); setIdentifier(""); setError(""); }}>Email</button>
              <button type="button" className={loginMethod === "mobile" ? "auth-tab selected" : "auth-tab"} onClick={() => { setLoginMethod("mobile"); setIdentifier(""); setError(""); }}>Mobile Number</button>
            </div>
            <label>{loginMethod === "mobile" ? "Mobile Number" : "Email address"}
              <input type={loginMethod === "mobile" ? "tel" : "email"} autoComplete="username" inputMode={loginMethod === "mobile" ? "tel" : "email"} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={loginMethod === "mobile" ? "+91 9876543210" : "you@example.com"} required />
            </label>
          </>
        )}
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
