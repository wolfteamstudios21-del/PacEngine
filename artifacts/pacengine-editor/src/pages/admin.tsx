import React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ShieldCheck, Users } from "lucide-react";

interface AdminUser {
  id: string;
  username: string;
  role: "admin" | "user";
  createdAt: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useAdminUsers() {
  return useQuery<{ users: AdminUser[] }>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/users`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });
}

export default function AdminPanel() {
  const { data: authData } = useAuth();
  const { data, isLoading, error } = useAdminUsers();

  if (authData?.user?.role !== "admin") {
    return (
      <div className="h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">
        Access denied — admin only.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      <header className="h-12 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
        <Link href="/">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> Admin Panel
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-6">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Registered Users</h1>
          {data && (
            <Badge variant="secondary" className="ml-2 font-mono text-xs">
              {data.users.length}
            </Badge>
          )}
        </div>

        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading users…</div>
        )}
        {error && (
          <div className="text-sm text-destructive">Failed to load users.</div>
        )}
        {data && (
          <ScrollArea className="h-[calc(100vh-200px)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left py-2 pr-4 font-medium">Username</th>
                  <th className="text-left py-2 pr-4 font-medium">Role</th>
                  <th className="text-left py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2.5 pr-4 font-mono text-xs">{u.username}</td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className="text-[10px] font-mono"
                      >
                        {u.role}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground font-mono">
                      {new Date(u.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
