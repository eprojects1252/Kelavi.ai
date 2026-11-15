"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase";

export default function AdminTokenLimitsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [adminReady, setAdminReady] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("10000");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    async function initialise() {
      const [{ data: authData }, { data: profile }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("profiles").select("role").single(),
      ]);
      if (!authData.user) {
        router.replace("/auth");
        return;
      }
      if (profile?.role !== "admin") {
        router.replace("/dashboard");
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      setToken(sessionData.session?.access_token || "");
      setApiUrl((process.env.NEXT_PUBLIC_KELAVI_API_URL || "").replace(/\/$/, ""));
      setTargetUserId(authData.user.id);
      setAdminReady(true);
    }
    initialise().catch(() => router.replace("/dashboard"));
  }, [router]);

  async function saveLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !apiUrl || !targetUserId.trim()) {
      setNotice("API connection or target user ID is missing.");
      return;
    }
    const parsedLimit = Number(monthlyLimit);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1) {
      setNotice("Enter a valid positive whole-number token limit.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(
        apiUrl + "/api/v1/admin/users/" + encodeURIComponent(targetUserId.trim()) + "/token-limit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ enabled: true, monthly_token_limit: parsedLimit }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not save the token limit.");
      setNotice("Custom monthly token limit saved successfully.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the token limit.");
    } finally {
      setSaving(false);
    }
  }

  async function clearLimit() {
    if (!token || !apiUrl || !targetUserId.trim()) {
      setNotice("API connection or target user ID is missing.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(
        apiUrl + "/api/v1/admin/users/" + encodeURIComponent(targetUserId.trim()) + "/token-limit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ enabled: false, monthly_token_limit: null }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not clear the custom limit.");
      setNotice("Custom limit cleared. The user's plan limit will apply.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not clear the custom limit.");
    } finally {
      setSaving(false);
    }
  }

  if (!adminReady) return <main className="dashboard-shell"><div className="dashboard-loading">Checking admin access...</div></main>;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <a className="brand" href="/dashboard"><span className="brand-mark">K</span> Kilavi<span className="brand-dot">.Ai</span></a>
        <a className="dashboard-profile-edit" href="/dashboard">Back to dashboard</a>
      </header>
      <section className="dashboard-welcome">
        <div className="eyebrow"><span className="pulse" /> ADMIN CONTROL</div>
        <h1>Custom <span>Token Limits</span></h1>
        <p>Set a monthly token allowance for an individual account. A custom limit overrides the user's plan limit.</p>
        <section className="dashboard-profile-card">
          <div className="dashboard-profile-heading"><div><small>USER LIMIT SETTINGS</small><h2>Manage monthly allowance</h2></div></div>
          <form className="dashboard-profile-form" onSubmit={saveLimit}>
            <label htmlFor="target-user-id">Target user UUID</label>
            <input id="target-user-id" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} placeholder="Supabase Auth user UUID" required />
            <label htmlFor="monthly-token-limit">Custom monthly token limit</label>
            <input id="monthly-token-limit" type="number" min="1" step="1" value={monthlyLimit} onChange={(event) => setMonthlyLimit(event.target.value)} required />
            <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save custom limit"}</button>
            <button type="button" className="dashboard-profile-edit" onClick={clearLimit} disabled={saving}>Clear custom limit</button>
          </form>
          {notice && <p className="dashboard-profile-notice" role="status">{notice}</p>}
        </section>
      </section>
    </main>
  );
}
