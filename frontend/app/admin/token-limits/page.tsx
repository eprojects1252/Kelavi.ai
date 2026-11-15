"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase";

type AdminUser = { id: string; display_name: string | null; role: string | null };

export default function AdminTokenLimitsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [adminReady, setAdminReady] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [monthlyLimit, setMonthlyLimit] = useState("10000");
  const [displayName, setDisplayName] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    async function initialise() {
      const [{ data: authData }, { data: profile }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("profiles").select("role").single(),
      ]);
      if (!authData.user) { router.replace("/auth"); return; }
      if (profile?.role !== "admin") { router.replace("/dashboard"); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token || "";
      const backendUrl = (process.env.NEXT_PUBLIC_KELAVI_API_URL || "").replace(/\\/$/, "");
      setToken(accessToken);
      setApiUrl(backendUrl);
      if (!accessToken || !backendUrl) {
        setNotice("Backend API connection is not configured.");
      } else {
        const response = await fetch(backendUrl + "/api/v1/admin/users", {
          headers: { Authorization: "Bearer " + accessToken },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not load user accounts.");
        const loadedUsers = Array.isArray(result.users) ? result.users as AdminUser[] : [];
        setUsers(loadedUsers);
        const selected = loadedUsers.find((item) => item.id === authData.user.id) || loadedUsers[0];
        if (selected) {
          setTargetUserId(selected.id);
          setDisplayName(selected.display_name || "");
        }
      }
      setUsersLoading(false);
      setAdminReady(true);
    }
    initialise().catch(() => router.replace("/dashboard"));
  }, [router]);

  async function requestJson(url: string, method: string, body: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not save account settings.");
    return result;
  }

  async function saveAll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !apiUrl || !targetUserId || !displayName.trim()) {
      setNotice("Select an account and enter a valid display name.");
      return;
    }
    const parsedLimit = Number(monthlyLimit);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1) {
      setNotice("Enter a valid positive whole-number token limit.");
      return;
    }
    setSaving(true);
    setNotice("");
    let nameSaved = false;
    try {
      await requestJson(
        apiUrl + "/api/v1/admin/users/" + encodeURIComponent(targetUserId) + "/account",
        "PATCH",
        { display_name: displayName.trim() },
      );
      nameSaved = true;
      await requestJson(
        apiUrl + "/api/v1/admin/users/" + encodeURIComponent(targetUserId) + "/token-limit",
        "POST",
        { enabled: true, monthly_token_limit: parsedLimit },
      );
      setUsers((current) => current.map((item) => item.id === targetUserId ? { ...item, display_name: displayName.trim() } : item));
      setNotice("Account name and custom monthly token limit saved successfully.");
    } catch (error) {
      setNotice(nameSaved
        ? "Account name was saved, but token limit failed: " + (error instanceof Error ? error.message : "Please try again.")
        : error instanceof Error ? error.message : "Could not save account settings.");
    } finally {
      setSaving(false);
    }
  }

  async function clearLimit() {
    if (!token || !apiUrl || !targetUserId) { setNotice("Select an account first."); return; }
    setSaving(true);
    setNotice("");
    try {
      await requestJson(
        apiUrl + "/api/v1/admin/users/" + encodeURIComponent(targetUserId) + "/token-limit",
        "POST",
        { enabled: false, monthly_token_limit: null },
      );
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
        <h1>Admin <span>Account Controls</span></h1>
        <p>Manage user account names and monthly token allowances. Account changes are restricted to administrators.</p>
        <section className="dashboard-profile-card">
          <div className="dashboard-profile-heading"><div><small>USER LIMIT SETTINGS</small><h2>Manage monthly allowance</h2></div></div>
          <form className="dashboard-profile-form admin-token-form" onSubmit={saveAll}>
            <label htmlFor="target-user-id">Select user account</label>
            <select id="target-user-id" value={targetUserId} onChange={(event) => {
              const id = event.target.value;
              setTargetUserId(id);
              setDisplayName(users.find((item) => item.id === id)?.display_name || "");
            }} required disabled={usersLoading || users.length === 0}>
              {users.length === 0 ? <option value="">No user profiles found</option> : users.map((item) => (
                <option key={item.id} value={item.id}>{item.display_name || "Unnamed user"} · {item.role || "user"}</option>
              ))}
            </select>
            {usersLoading && <p>Loading user accounts...</p>}
            <label htmlFor="account-display-name">Account display name</label>
            <input id="account-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} required />
            <label htmlFor="monthly-token-limit">Custom monthly token limit</label>
            <input id="monthly-token-limit" type="number" min="1" step="1" value={monthlyLimit} onChange={(event) => setMonthlyLimit(event.target.value)} required />
            <div className="admin-token-actions">
              <button type="submit" disabled={saving || usersLoading || !targetUserId}>{saving ? "Saving..." : "Save"}</button>
              <button type="button" className="dashboard-profile-edit" onClick={clearLimit} disabled={saving || !targetUserId}>Clear</button>
            </div>
          </form>
          {notice && <p className="dashboard-profile-notice" role="status">{notice}</p>}
        </section>
      </section>
    </main>
  );
}
