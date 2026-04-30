import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Editor from "@/pages/editor";
import EngineStatus from "@/pages/engine";
import Login from "@/pages/login";
import AdminPanel from "@/pages/admin";
import { useAuth } from "@/hooks/useAuth";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Authenticating…</div>
      </div>
    );
  }

  if (error || !data?.user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/admin">
        <AuthGate><AdminPanel /></AuthGate>
      </Route>
      <Route path="/projects/:projectId">
        {() => <AuthGate><Editor /></AuthGate>}
      </Route>
      <Route path="/engine">
        <AuthGate><EngineStatus /></AuthGate>
      </Route>
      <Route path="/">
        <AuthGate><Home /></AuthGate>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
