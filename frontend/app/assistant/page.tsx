"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Message = { id?: string; role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; updated_at: string };

export default function AssistantPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    const supabase = getSupabaseBrowserClient();
    const { data, error: loadError } = await supabase
      .from("kelavi_chat_conversations")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false });
    if (loadError) throw loadError;
    setConversations((data || []) as Conversation[]);
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data, error: authError }) => {
      if (authError || !data.user) {
        router.replace("/auth");
        return;
      }
      try {
        await loadConversations();
      } catch (loadError) {
        console.error("Kilavi chat history load failed:", loadError);
        setError("Chat history could not be loaded. Please refresh and try again.");
      }
      setReady(true);
    }).catch(() => router.replace("/auth"));
  }, [router]);

  useEffect(() => {
    try {
      const element = bottomRef.current;
      if (element && typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    } catch (scrollError) {
      console.warn("Kilavi chat auto-scroll unavailable:", scrollError);
    }
  }, [messages, sending]);

  async function openConversation(conversationId: string) {
    if (sending) return;
    setHistoryLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: messageError } = await supabase
        .from("kelavi_chat_messages")
        .select("id,role,content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (messageError) throw messageError;
      setMessages((data || []) as Message[]);
      setActiveConversation(conversationId);
      setHistoryOpen(false);
    } catch (loadError) {
      console.error("Kilavi conversation open failed:", loadError);
      setError("இந்த Chat-ஐ திறக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function startNewChat() {
    if (sending) return;
    setActiveConversation(null);
    setMessages([]);
    setPrompt("");
    setError("");
    setHistoryOpen(false);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message || sending) return;

    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const token = session?.access_token;
    const userId = session?.user.id;
    const apiUrl = process.env.NEXT_PUBLIC_KELAVI_API_URL?.replace(/\/$/, "");
    if (!token || !userId) { router.replace("/auth"); return; }
    if (!apiUrl) {
      setError("AI service is not connected yet. Backend deployment is the next setup step.");
      return;
    }

    setError("");
    setPrompt("");
    setSending(true);
    let conversationId = activeConversation;
    setMessages((current) => [...current, { role: "user", content: message }]);

    try {
      if (!conversationId) {
        const title = message.length > 48 ? message.slice(0, 48).trim() + "…" : message;
        const { data: created, error: createError } = await supabase
          .from("kelavi_chat_conversations")
          .insert({ user_id: userId, title })
          .select("id,title,updated_at")
          .single();
        if (createError || !created) throw createError || new Error("Could not create chat.");
        conversationId = created.id;
        setActiveConversation(conversationId);
        setConversations((current) => [created as Conversation, ...current]);
      }

      const { error: saveUserError } = await supabase
        .from("kelavi_chat_messages")
        .insert({ conversation_id: conversationId, user_id: userId, role: "user", content: message });
      if (saveUserError) throw saveUserError;

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

      const { error: saveAssistantError } = await supabase
        .from("kelavi_chat_messages")
        .insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: result.reply });
      if (saveAssistantError) throw saveAssistantError;

      setMessages((current) => [...current, { role: "assistant", content: result.reply as string }]);
      await loadConversations();
    } catch (err) {
      console.error("Kilavi chat request failed:", err);
      setError(err instanceof Error ? err.message : "Could not connect to Kilavi.Ai");
    } finally {
      setSending(false);
    }
  }

  if (!ready) return <main className="assistant-loading">Checking your secure session...</main>;

  return (
    <main className="assistant-shell">
      <header className="assistant-topbar">
        <a className="brand" href="/dashboard"><span className="brand-mark">K</span> Kilavi<span className="brand-dot">.Ai</span></a>
        <div className="assistant-top-actions">
          <button className="assistant-history-toggle" type="button" onClick={() => setHistoryOpen((open) => !open)}>☷ History</button>
          <a className="assistant-back" href="/dashboard">← Dashboard</a>
        </div>
      </header>

      {historyOpen && (
        <aside className="assistant-history-panel">
          <div className="assistant-history-heading">
            <strong>Chat History</strong>
            <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history">×</button>
          </div>
          <button className="assistant-new-chat" type="button" onClick={startNewChat}>＋ New Chat</button>
          {historyLoading && <p className="assistant-history-empty">Loading chats...</p>}
          {!historyLoading && conversations.length === 0 && <p className="assistant-history-empty">Your saved chats will appear here.</p>}
          <div className="assistant-history-list">
            {conversations.map((chat) => (
              <button
                className={"assistant-history-item" + (activeConversation === chat.id ? " active" : "")}
                key={chat.id}
                type="button"
                onClick={() => openConversation(chat.id)}
                disabled={historyLoading || sending}
              >
                <span>{chat.title}</span>
                <small>{new Date(chat.updated_at).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
        </aside>
      )}

      <section className="assistant-heading">
        <div className="eyebrow"><span className="pulse" /> KILAVI AI WORKSPACE</div>
        <h1>AI <span>Assistant</span></h1>
        <p>Ask questions, explore ideas and get help in your language.</p>
      </section>
      <section className="assistant-chat" aria-label="Chat messages">
        {messages.length === 0 && (
          <div className="assistant-welcome">
            <span className="assistant-welcome-mark"><img className="assistant-avatar welcome-avatar" src="/k2-brain-logo.png" alt="Kilavi.Ai" /></span>
            <strong>வணக்கம்! நான் Kilavi.Ai.</strong>
            <p>இன்று உங்களுக்கு என்ன உதவி செய்ய வேண்டும்?</p>
          </div>
        )}
        {messages.map((item, index) => (
          <div className={"assistant-message " + item.role} key={item.id || index}>
            <span>{item.role === "assistant" ? <img className={"assistant-avatar" + (sending ? " responding" : "")} src="/k2-brain-logo.png" alt="Kilavi.Ai" /> : "You"}</span><p>{item.content}</p>
          </div>
        ))}
        {sending && <div className="assistant-typing"><img className="assistant-avatar responding" src="/k2-brain-logo.png" alt="" /> <span>Kilavi.Ai is thinking...</span></div>}
        <div ref={bottomRef} />
      </section>
      {error && <p className="assistant-error" role="alert">{error}</p>}
      <form className="assistant-composer" onSubmit={sendMessage}>
        <label className="sr-only" htmlFor="assistant-prompt">Message Kilavi.Ai</label>
        <textarea id="assistant-prompt" rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Message Kilavi.Ai..." maxLength={12000} />
        <div className="assistant-composer-footer">
          <span>AI responses may need verification.</span>
          <button type="submit" disabled={!prompt.trim() || sending}>{sending ? "Sending..." : "Send ↗"}</button>
        </div>
      </form>
    </main>
  );
}
