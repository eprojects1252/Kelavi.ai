import AuthForm from "./auth-form";

export default function AuthPage() {
  return (
    <main className="auth-shell">
      <a className="brand auth-brand" href="/"><span className="brand-mark brand-logo-mark"><img src="/k2-brain-logo.png" alt="" /></span> Kilavi<span className="brand-dot">.Ai</span></a>
      <AuthForm />
      <p className="auth-foot">Secure account access · Kilavi.Ai</p>
    </main>
  );
}
