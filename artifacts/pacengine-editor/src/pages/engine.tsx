import React from "react";
import { useGetEngineInfo } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ArrowLeft, Server, CheckCircle2, XCircle, Info, Terminal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function EngineStatus() {
  const { data, isLoading, error } = useGetEngineInfo();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="h-12 border-b border-border bg-card flex items-center px-4 shrink-0">
        <Link href="/" className="text-muted-foreground hover:text-primary flex items-center gap-2 text-sm font-medium">
          <ArrowLeft className="h-4 w-4" /> Back to Browser
        </Link>
      </header>

      <main className="flex-1 p-8 max-w-4xl mx-auto w-full space-y-8">
        <div className="flex items-center gap-3">
          <Server className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Engine Status</h1>
            <p className="text-sm text-muted-foreground">PacEngine binary health and version information</p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-48 bg-card rounded-md border border-border animate-pulse" />
        ) : error ? (
          <Card className="border-destructive bg-destructive/10">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <XCircle className="h-5 w-5" /> Error Loading Engine Info
              </CardTitle>
              <CardDescription>Could not connect to the API server.</CardDescription>
            </CardHeader>
          </Card>
        ) : data ? (
          <div className="grid gap-6">
            <Card className={data.binaryAvailable ? "border-primary/30" : "border-destructive"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {data.binaryAvailable ? (
                    <><CheckCircle2 className="h-5 w-5 text-primary" /> Engine Binary Available</>
                  ) : (
                    <><XCircle className="h-5 w-5 text-destructive" /> Engine Binary Missing</>
                  )}
                </CardTitle>
                <CardDescription>
                  {data.binaryAvailable 
                    ? "The PacEngine runtime is built and ready to execute projects."
                    : "The PacEngine runtime binary could not be found. Project runs and determinism checks will fail until the engine is built."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-[150px_1fr] gap-2 text-sm">
                  <div className="text-muted-foreground font-medium">Binary Path</div>
                  <div className="font-mono bg-muted px-2 py-1 rounded text-xs truncate" title={data.binaryPath}>
                    {data.binaryPath}
                  </div>
                  
                  <div className="text-muted-foreground font-medium">Engine Version</div>
                  <div className="font-mono">{data.engineVersion}</div>
                  
                  <div className="text-muted-foreground font-medium">PacData Spec</div>
                  <div className="font-mono">v{data.pacdataVersion}</div>
                  
                  <div className="text-muted-foreground font-medium">PacCore Spec</div>
                  <div className="font-mono">v{data.paccoreVersion}</div>
                </div>
              </CardContent>
            </Card>
            
            {!data.binaryAvailable && (
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Terminal className="h-4 w-4" /> Build Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    To build the PacEngine binary, run the following commands in the terminal:
                  </p>
                  <pre className="bg-black p-4 rounded-md font-mono text-xs text-green-400 overflow-x-auto">
                    {`cd pacengine
mkdir -p build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make pacengine_game`}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
