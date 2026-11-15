"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Profile = { display_name: string | null; role: string | null };
type UsageRow = { input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; created_at: string };
type Plan = { name: string; monthly_token_limit: number | null };
type SubscriptionRow = { status: string; plan: Plan | Plan[] | null };

const workspaces = [
  { icon: "✦", title: "AI Assistant", description: "Ask questions and work through ideas.", href: "/assistant", ready: true },
  { icon: "⌘", title: "Coding AI", description: "Create, debug and understand code.", href: "#", ready: false },
  { icon: "▤", title: "Project Knowledge", description: "Find answers from your project files.", href: "#", ready: false },
  { icon: "◉", title: "Vision Research", description: "Research coins, stamps and collectibles.", href: "#", ready: false },
];

function DonutChart({ percent, label, color }: { percent: number; label: string; color: string }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="usage-donut" role="img" aria-label={`${safePercent}% ${label}`}>
      <svg viewBox="0 0 112 112" aria-hidden="true">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="rgba(130,145,180,.19)" strokeWidth="10" />
        <circle cx="56" cy="56" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${circumference * safePercent / 100} ${circumference}`} transform="rotate(-90 56 56)" />
      </svg>
      <div className="usage-donut-center"><strong>{safePercent}%</strong><span>{label}</span></div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState("");
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [plan, setPlan] = useState<Plan>({ name: "Free", monthly_token_limit: 0 });
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;
    async function loadDashboard() {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !authData.user) { router.replace("/auth"); return; }
      const currentUser = authData.user;
      setUser(currentUser);

      const [profileResult, subscriptionResult, usageResult] = await Promise.all([
        supabase.from("profiles").select("display_name, role").eq("id", currentUser.id).maybeSingle(),
        supabase.from("user_subscriptions").select("status, plan:plans(name, monthly_token_limit)").eq("user_id", currentUser.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("usage_logs").select("input_tokens, output_tokens, total_tokens, created_at").eq("user_id", currentUser.id).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()).order("created_at", { ascending: false }).limit(5000),
      ]);
      if (!active) return;
      setProfile(profileResult.data);
      setNameDraft(profileResult.data?.display_name || currentUser.user_metadata?.display_name || "");
      if (subscriptionResult.data?.plan) {
        const selectedPlan = Array.isArray(subscriptionResult.data.plan) ? subscriptionResult.data.plan[0] : subscriptionResult.data.plan;
        if (selectedPlan) setPlan(selectedPlan);
      } else {
        const { data: freePlan } = await supabase.from("plans").select("name, monthly_token_limit").eq("name", "Free").maybeSingle();
        if (active && freePlan) setPlan(freePlan);
      }
      if (usageResult.error) setUsageError("Usage records are not available yet. Please check back later.");
      else setUsageRows((usageResult.data || []) as UsageRow[]);
      setUsageLoading(false);
      setLoading(false);
    }
    loadDashboard();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") router.replace("/auth"); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [router]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const cleanName = nameDraft.trim();
    if (!cleanName) { setProfileNotice("Please enter your display name."); return; }
    setSavingProfile(true); setProfileNotice("");
    const { data, error } = await getSupabaseBrowserClient().from("profiles").update({ display_name: cleanName }).eq("id", user.id).select("display_name, role").single();
    if (error) setProfileNotice("Could not update your profile. Please try again.");
    else { setProfile(data); setEditingProfile(false); setProfileNotice("Profile updated successfully."); }
    setSavingProfile(false);
  }

  async function signOut() {
    setSigningOut(true);
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/auth");
  }

  if (loading) return <main className="dashboard-shell"><div className="dashboard-loading">Loading your secure workspace...</div></main>;

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const requests = usageRows.length;
  const tokens = usageRows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0);
  const limit = Number(plan.monthly_token_limit || 0);
  const usedPercent = limit > 0 ? Math.min(100, Math.round(tokens / limit * 100)) : 0;
  const remaining = Math.max(0, limit - tokens);
  const period = new Date().toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <a className="brand" href="/"><span className="brand-mark">K</span> Kilavi<span className="brand-dot">.Ai</span></a>
        <button className="dashboard-logout" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out..." : "Sign out"}</button>
      </header>

      <section className="dashboard-welcome">
        <div className="eyebrow"><span className="pulse" /> YOUR PRIVATE WORKSPACE</div>
        <h1>Welcome, <span>{displayName}</span></h1>
        <p>Your Kilavi.Ai workspace is ready. Choose a tool to get started.</p>
        <div className="dashboard-account">
          <div><small>ACCOUNT EMAIL</small><strong>{user?.email}</strong></div>
          <div><small>ACCOUNT ROLE</small><strong>{profile?.role || "user"}</strong></div>
          {profile?.role === "admin" && <div><small>ADMIN TOOLS</small><strong><a href="/admin/token-limits">Manage token limits ↗</a></strong></div>}
        </div>

        <section className="dashboard-profile-card">
          <div className="dashboard-profile-heading"><div><small>ACCOUNT SETTINGS</small><h2>Profile Settings</h2></div>
            <button className="dashboard-profile-edit" onClick={() => { setEditingProfile(!editingProfile); setProfileNotice(""); }}>{editingProfile ? "Cancel" : "Edit name"}</button>
          </div>
          {editingProfile ? <form className="dashboard-profile-form" onSubmit={saveProfile}>
            <label htmlFor="profile-display-name">Display name</label>
            <input id="profile-display-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={80} required />
            <button type="submit" disabled={savingProfile}>{savingProfile ? "Saving..." : "Save profile"}</button>
          </form> : <p className="dashboard-profile-name">{displayName}</p>}
          {profileNotice && <p className="dashboard-profile-notice" role="status">{profileNotice}</p>}
        </section>
      </section>

      <section className="dashboard-usage-section">
        <div className="dashboard-section-heading"><div><small>YOUR PLAN</small><h2>Usage Overview</h2></div><span>{plan.name} · {period}</span></div>
        {usageLoading ? <div className="usage-message">Loading usage details...</div> : usageError ? <div className="usage-message">{usageError}</div> : (
          <>
            <div className="usage-grid">
              <article className="usage-card usage-request-card">
                <div><span className="usage-card-kicker">AI REQUESTS</span><strong className="usage-number">{requests.toLocaleString()}</strong><span className="usage-card-caption">Requests this month</span></div>
                <div className="usage-request-icon">✦</div>
              </article>
              <article className="usage-card usage-token-card">
                <div className="usage-card-heading"><div><span className="usage-card-kicker">MONTHLY TOKEN LIMIT</span><strong className="usage-number">{tokens.toLocaleString()}</strong><span className="usage-card-caption">Tokens consumed</span></div><DonutChart percent={usedPercent} label="Used" color="#3988f7" /></div>
                <div className="usage-legend"><span><i className="legend-used" />Used: {tokens.toLocaleString()}</span><span><i className="legend-left" />Left: {remaining.toLocaleString()}</span></div>
                <div className="usage-limit-caption">{limit > 0 ? `${limit.toLocaleString()} tokens included in ${plan.name}` : "Monthly token limit is not configured for this plan."}</div>
              </article>
            </div>
            {limit > 0 && usedPercent >= 80 && <div className={usedPercent >= 100 ? "usage-alert usage-alert-limit" : "usage-alert"} role="status">{usedPercent >= 100 ? "Monthly token limit reached. New AI requests may be restricted." : "You have used 80% or more of your monthly token allowance."}</div>}
            <p className="usage-period-note">Usage is calculated from successful AI requests recorded in {period}. Figures refresh when you reload this dashboard.</p>
          </>
        )}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-heading"><div><small>YOUR TOOLS</small><h2>Choose a workspace</h2></div><span>4 workspaces</span></div>
        <div className="dashboard-workspace-grid">
          {workspaces.map((item) => <article className={item.ready ? "dashboard-workspace-card workspace-ready" : "dashboard-workspace-card"} key={item.title}>
            <span className="dashboard-workspace-icon">{item.icon}</span><h3>{item.title}</h3><p>{item.description}</p>
            {item.ready ? <a className="workspace-open" href={item.href}>Open workspace ↗</a> : <span className="workspace-coming-soon">Coming next</span>}
          </article>)}
        </div>
      </section>
      <footer className="dashboard-footer">© 2026 Kilavi.Ai <span>Private workspace</span></footer>
    </main>
  );
}
