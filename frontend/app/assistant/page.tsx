"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Message = { role: "user" | "assistant"; content: string };

export default function AssistantPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "வணக்கம்! நான் Kelavi.ai. இன்று உங்களுக்கு என்ன உதவி செய்ய வேண்டும்?" },
  ]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data, error: authError }) => {
      if (authError || !data.user) router.replace("/auth");
      else setReady(true);
    }).catch(() => router.replace("/auth"));
  }, [router]);

  useEffect(() => {
    // Guard scrolling: some mobile browsers/webviews can throw during smooth scrolling.
    try {
      const element = bottomRef.current;
      if (element && typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    } catch (scrollError) {
      console.warn("Kelavi chat auto-scroll unavailable:", scrollError);
    }
  }, [messages, sending]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message || sending) return;
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiUrl = process.env.NEXT_PUBLIC_KELAVI_API_URL?.replace(/\/$/, "");
    if (!token) { router.replace("/auth"); return; }
    if (!apiUrl) {
      setError("AI service is not connected yet. Backend deployment is the next setup step.");
      return;
    }
    setError("");
    setPrompt("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setSending(true);
    try {
      const response = await fetch(apiUrl + "/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ message }),
      });
      const rawBody = await response.text();
      let result: { reply?: unknown; detail?: unknown };
      try {
        result = JSON.parse(rawBody) as { reply?: unknown; detail?: unknown };
      } catch {
        throw new Error("AI server returned an unreadable response. Please try again.");
      }
      if (!response.ok) {
        throw new Error(typeof result.detail === "string" ? result.detail : "AI request failed. Please try again.");
      }
      if (typeof result.reply !== "string" || !result.reply.trim()) {
        throw new Error("AI server returned an empty or invalid reply. Please try again.");
      }
      setMessages((current) => [...current, { role: "assistant", content: result.reply as string }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to Kelavi.ai");
    } finally {
      setSending(false);
    }
  }

  if (!ready) return <main className="assistant-loading">Checking your secure session...</main>;
  return (
    <main className="assistant-shell">
      <header className="assistant-topbar">
        <a className="brand" href="/dashboard"><span className="brand-mark">K</span> Kelavi<span className="brand-dot">.ai</span></a>
        <a className="assistant-back" href="/dashboard">← Dashboard</a>
      </header>
      <section className="assistant-heading">
        <div className="eyebrow"><span className="pulse" /> KELAVI AI WORKSPACE</div>
        <h1>AI <span>Assistant</span></h1>
        <p>Ask questions, explore ideas and get help in your language.</p>
      </section>
      <section className="assistant-chat" aria-label="Chat messages">
        {messages.map((item, index) => (
          <div className={"assistant-message " + item.role} key={index}>
            <span>{item.role === "assistant" ? "K" : "You"}</span><p>{item.content}</p>
          </div>
        ))}
        {sending && <div className="assistant-typing">Kelavi.ai is thinking...</div>}
        <div ref={bottomRef} />
      </section>
      {error && <p className="assistant-error" role="alert">{error}</p>}
      <form className="assistant-composer" onSubmit={sendMessage}>
        <label className="sr-only" htmlFor="assistant-prompt">Message Kelavi.ai</label>
        <textarea id="assistant-prompt" rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Message Kelavi.ai..." maxLength={12000} />
        <div className="assistant-composer-footer">
          <span>AI responses may need verification.</span>
          <button type="submit" disabled={!prompt.trim() || sending}>{sending ? "Sending..." : "Send ↗"}</button>
        </div>
      </form>
    </main>
  );
}
