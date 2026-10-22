import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Icon } from "@/components/app-shell";

const searchSchema = z.object({ redirect: z.string().optional() });

function safePath(p?: string) {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/today";
}

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Instinct Hub" },
      { name: "description", content: "Sign in to your Instinct task dashboard." },
      { property: "og:title", content: "Sign in — Instinct Hub" },
      { property: "og:description", content: "Sign in to your Instinct task dashboard." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safePath(redirect) });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + safePath(redirect) },
        });
        if (error) throw error;
        setSent(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    sessionStorage.setItem("post_auth_redirect", safePath(redirect));
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: safePath(redirect) });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background relative overflow-hidden">
      <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary-soft/60 blur-3xl" />
      <div className="absolute -left-16 bottom-0 h-60 w-60 rounded-full bg-success-glow/20 blur-3xl" />
      <div className="relative w-full max-w-sm card-surface p-6">
        <div className="flex items-center gap-2 text-primary">
          <Icon name="neurology" />
          <span className="label-caps">Instinct Hub</span>
        </div>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight">
          {mode === "in" ? "Welcome back" : "Create your hub"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything you've asked Instinct to do, in one place.</p>

        {sent ? (
          <div className="mt-6 rounded-lg bg-surface-low p-4 text-sm">
            Check your inbox to confirm <b>{email}</b>, then come back to sign in.
          </div>
        ) : (
          <>
            <button
              onClick={google}
              className="mt-6 w-full h-11 rounded-lg border border-input bg-card font-medium text-sm hover:bg-surface-low transition-colors"
            >
              Continue with Google
            </button>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-lg bg-surface-low px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-lg bg-surface-low px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button disabled={busy} className="h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/25 disabled:opacity-60">
                {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
              </button>
            </form>
            <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-sm text-primary font-medium">
              {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
