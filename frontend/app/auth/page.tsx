import AuthForm from "./auth-form";

export default function AuthPage() {
  return (
    <main className="auth-shell">
      <a className="brand auth-brand" href="/"><span className="brand-mark">K</span> Kelavi<span className="brand-dot">.ai</span></a>
      <AuthForm />
      <p className="auth-foot">Secure account access · Kelavi.ai</p>
    </main>
  );
}
