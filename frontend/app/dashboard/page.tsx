"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Profile = {
  display_name: string | null;
  role: string | null;
};

const workspaces = [
  { icon: "✦", title: "AI Assistant", description: "Ask questions and work through ideas.", href: "/assistant", ready: true },
  { icon: "⌘", title: "Coding AI", description: "Create, debug and understand code.", href: "#", ready: false },
  { icon: "▤", title: "Project Knowledge", description: "Find answers from your project files.", href: "#", ready: false },
  { icon: "◉", title: "Vision Research", description: "Research coins, stamps and collectibles.", href: "#", ready: false },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        router.replace("/auth");
        return;
      }

      setUser(data.user);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("display_name, role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!active) return;
      setProfile(profileData);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/auth");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function signOut() {
    setSigningOut(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/auth");
  }

  if (loading) {
    return <main className="dashboard-shell"><div className="dashboard-loading">Loading your secure workspace...</div></main>;
  }

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <a className="brand" href="/"><span className="brand-mark">K</span> Kelavi<span className="brand-dot">.ai</span></a>
        <button className="dashboard-logout" onClick={signOut} disabled={signingOut}>
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </header>

      <section className="dashboard-welcome">
        <div className="eyebrow"><span className="pulse" /> YOUR PRIVATE WORKSPACE</div>
        <h1>Welcome, <span>{displayName}</span></h1>
        <p>Your Kelavi.ai workspace is ready. Choose a tool to get started.</p>
        <div className="dashboard-account">
          <div><small>ACCOUNT EMAIL</small><strong>{user?.email}</strong></div>
          <div><small>ACCOUNT ROLE</small><strong>{profile?.role || "user"}</strong></div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div><small>YOUR TOOLS</small><h2>Choose a workspace</h2></div>
          <span>4 workspaces</span>
        </div>
        <div className="dashboard-workspace-grid">
          {workspaces.map((item) => (
            <article className={item.ready ? "dashboard-workspace-card workspace-ready" : "dashboard-workspace-card"} key={item.title}>
              <span className="dashboard-workspace-icon">{item.icon}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              {item.ready ? <a className="workspace-open" href={item.href}>Open workspace ↗</a> : <span className="workspace-coming-soon">Coming next</span>}
            </article>
          ))}
        </div>
      </section>
      <footer className="dashboard-footer">© 2026 Kelavi.ai <span>Private workspace</span></footer>
    </main>
  );
}
