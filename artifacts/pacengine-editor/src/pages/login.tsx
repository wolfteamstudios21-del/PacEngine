import React, { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin, useRegister } from "@/hooks/useAuth";
import { Box, ShieldCheck } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const isPending = loginMutation.isPending || registerMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const mutation = mode === "login" ? loginMutation : registerMutation;
    mutation.mutate({ username, password }, {
      onSuccess: () => setLocation("/"),
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Something went wrong";
        setError(msg);
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm space-y-6">
        {/* Branding */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Box className="h-5 w-5 text-primary" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">PacEngine Editor</h1>
          <p className="text-xs text-muted-foreground">Wolf Team Studios</p>
        </div>

        <Card className="bg-card border-border shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {mode === "login" ? "Sign in" : "Create account"}
            </CardTitle>
            <CardDescription className="text-xs">
              {mode === "login"
                ? "Enter your credentials to access the editor."
                : "Pick a username and password to get started."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. WolfTeam19"
                  autoComplete="username"
                  disabled={isPending}
                  className="h-8 text-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  disabled={isPending}
                  className="h-8 text-sm"
                  required
                />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full h-8 text-sm" disabled={isPending}>
                {isPending
                  ? mode === "login" ? "Signing in…" : "Creating account…"
                  : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {mode === "login" ? "Don't have an account? Register" : "Already have an account? Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground">
          Wolf Team Studios &copy; 2026 — Deterministic Execution Engine
        </p>
      </div>
    </div>
  );
}
