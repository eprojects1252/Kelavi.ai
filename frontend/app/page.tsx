"use client";

import { useState } from "react";

const modes = [
  { icon: "logo", title: "AI Assistant", detail: "Ask questions and get clear answers" },
  { icon: "⌘", title: "Coding AI", detail: "Build, debug and improve your code" },
  { icon: "▤", title: "Project Knowledge", detail: "Work with your project notes and files" },
  { icon: "◉", title: "Vision Research", detail: "Explore coins, stamps and collectibles" },
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState("AI Assistant");

  function startChat() {
    if (!prompt.trim()) return;
    // Chat API connection will be added after authentication and database setup.
    alert("Your prompt is ready. Chat service connection is the next build step.");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Kilavi.Ai home"><span className="brand-mark brand-logo-mark"><img src="/k2-brain-logo.png" alt="" /></span> Kilavi<span className="brand-dot">.Ai</span></a>
        <a className="signin signin-link" href="/auth">Sign in</a>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="pulse" /> YOUR INTELLIGENCE WORKSPACE</div>
        <h1>Ideas into <span>intelligence.</span></h1>
        <p className="intro">One place to think, build, learn and explore with AI.</p>

        <div className="composer">
          <label className="sr-only" htmlFor="prompt">Ask Kilavi.Ai</label>
          <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask anything or describe what you want to build..." rows={3} />
          <div className="composer-bottom">
            <span className="model-label"><img className="inline-k2-logo" src="/k2-brain-logo.png" alt="" /> Kilavi AI</span>
            <button className="send" type="button" onClick={startChat} disabled={!prompt.trim()}>Start ↗</button>
          </div>
        </div>

        <div className="section-heading"><span>EXPLORE WORKSPACES</span><span className="muted">Choose a starting point</span></div>
        <div className="mode-grid">
          {modes.map((mode) => (
            <button className={selected === mode.title ? "mode-card active" : "mode-card"} key={mode.title} onClick={() => setSelected(mode.title)} type="button">
              <span className="mode-icon">{mode.icon === "logo" ? <img className="workspace-k2-logo" src="/k2-brain-logo.png" alt="" /> : mode.icon}</span>
              <span className="mode-title">{mode.title}</span>
              <span className="mode-detail">{mode.detail}</span>
            </button>
          ))}
        </div>
      </section>
      <footer>© 2026 Kilavi.Ai <span>Built for ideas without limits.</span></footer>
    </main>
  );
}
