import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetProject, 
  useRunProject, 
  useDeterminismCheck,
  getGetProjectQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Play, Activity, Settings, ArrowLeft, Terminal, Box, ChevronRight, LayoutGrid, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Editor() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [ticks, setTicks] = useState("100");
  const [activeTab, setActiveTab] = useState("console");
  
  const { data: project, isLoading } = useGetProject(projectId || "", {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId || "") }
  });
  
  const runMutation = useRunProject();
  const checkMutation = useDeterminismCheck();
  
  const [lastRun, setLastRun] = useState<any>(null);
  const [lastCheck, setLastCheck] = useState<any>(null);

  if (isLoading || !project) {
    return <div className="h-screen bg-background flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading Project Shell...</div></div>;
  }

  const handleRun = () => {
    const numTicks = parseInt(ticks);
    if (isNaN(numTicks) || numTicks <= 0) return;
    
    setLastCheck(null);
    setActiveTab("console");
    
    runMutation.mutate({ projectId: projectId!, data: { ticks: numTicks } }, {
      onSuccess: (res) => {
        setLastRun(res);
        toast({ title: "Run Complete", description: `Executed ${res.ticks} ticks in ${res.run.durationMs}ms` });
      },
      onError: (err) => {
        toast({ title: "Run Failed", description: err.error, variant: "destructive" });
      }
    });
  };

  const handleDeterminismCheck = () => {
    const numTicks = parseInt(ticks);
    if (isNaN(numTicks) || numTicks <= 0) return;
    
    setLastRun(null);
    setActiveTab("determinism");
    
    checkMutation.mutate({ projectId: projectId!, data: { ticks: numTicks } }, {
      onSuccess: (res) => {
        setLastCheck(res);
        if (res.eventsMatch && res.traceMatch) {
          toast({ title: "Determinism Verified", description: "Runs matched perfectly." });
        } else {
          toast({ title: "Determinism Failed", description: "Mismatch detected between runs.", variant: "destructive" });
        }
      },
      onError: (err) => {
        toast({ title: "Check Failed", description: err.error, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Editor Header / Toolbar */}
      <header className="h-12 bg-card border-b border-border flex items-center px-4 justify-between shrink-0" style={{ borderTop: `2px solid ${project.summary.accentColor}` }}>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="font-semibold tracking-tight">{project.summary.name}</div>
          <Badge variant="outline" className="font-mono text-[10px] bg-background">v{project.summary.pacdataVersion}</Badge>
        </div>
        
        <div className="flex items-center gap-2 bg-background/50 p-1 rounded-md border border-border">
          <div className="flex items-center gap-2 px-2 border-r border-border">
            <Label htmlFor="ticks" className="text-xs text-muted-foreground">Ticks:</Label>
            <Input 
              id="ticks" 
              value={ticks} 
              onChange={e => setTicks(e.target.value)} 
              className="h-6 w-20 text-xs font-mono" 
            />
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 hover:text-green-400 hover:bg-green-400/10" onClick={handleRun} disabled={runMutation.isPending || checkMutation.isPending}>
            <Play className="h-3 w-3" /> Simulate
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 hover:text-blue-400 hover:bg-blue-400/10" onClick={handleDeterminismCheck} disabled={runMutation.isPending || checkMutation.isPending}>
            <Activity className="h-3 w-3" /> Determinism Check
          </Button>
        </div>
      </header>

      {/* Main Workspace */}
      <ResizablePanelGroup direction="vertical" className="flex-1">
        <ResizablePanel defaultSize={70}>
          <ResizablePanelGroup direction="horizontal">
            {/* World Outliner */}
            <ResizablePanel defaultSize={20} minSize={15} className="border-r border-border bg-card flex flex-col">
              <div className="h-8 bg-muted/30 border-b border-border flex items-center px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                Outliner
              </div>
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm p-1 rounded hover:bg-muted/50 cursor-default font-medium">
                    <ChevronRight className="h-3 w-3" /> World
                  </div>
                  <div className="pl-4 space-y-1">
                    {project.entities.map(e => (
                      <div key={e.id} className="flex items-center gap-2 text-xs p-1 rounded hover:bg-muted cursor-default text-muted-foreground">
                        <Box className="h-3 w-3" /> {e.id} <span className="opacity-50">({e.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </ResizablePanel>
            
            <ResizableHandle className="w-1 bg-border hover:bg-primary transition-colors" />
            
            {/* Viewport */}
            <ResizablePanel defaultSize={60} className="bg-background flex flex-col relative overflow-hidden">
              <div className="absolute top-0 w-full h-8 bg-gradient-to-b from-black/50 to-transparent z-10 flex items-center px-4 pointer-events-none">
                <span className="text-[10px] font-mono text-white/50 flex items-center gap-2"><LayoutGrid className="h-3 w-3"/> Orthographic Viewport</span>
              </div>
              
              {/* Pseudo-Viewport Canvas */}
              <div className="flex-1 w-full h-full relative" style={{ 
                backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                backgroundPosition: 'center center'
              }}>
                {project.entities.map((e, i) => {
                  // deterministic random scatter
                  const seed = i * 137.5;
                  const left = 20 + (Math.sin(seed) * 30 + 30);
                  const top = 20 + (Math.cos(seed) * 30 + 30);
                  const isAgent = e.type === 'agent';
                  return (
                    <div 
                      key={e.id}
                      className="absolute p-2 rounded border border-border shadow-md bg-card/80 backdrop-blur text-xs font-mono transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-2"
                      style={{ left: `${left}%`, top: `${top}%` }}
                    >
                      <div className={`w-2 h-2 rounded-full ${isAgent ? 'bg-blue-500' : 'bg-orange-500'}`} />
                      {e.id}
                    </div>
                  );
                })}
              </div>
            </ResizablePanel>

            <ResizableHandle className="w-1 bg-border hover:bg-primary transition-colors" />

            {/* Details Panel */}
            <ResizablePanel defaultSize={20} minSize={15} className="border-l border-border bg-card flex flex-col">
              <div className="h-8 bg-muted/30 border-b border-border flex items-center px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                Details
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-2 border-b border-border pb-1">Project Info</h3>
                    <div className="grid grid-cols-[100px_1fr] gap-y-2 text-xs">
                      <div className="text-muted-foreground">ID</div><div className="font-mono">{project.summary.id}</div>
                      <div className="text-muted-foreground">World Name</div><div>{project.summary.worldName}</div>
                      <div className="text-muted-foreground">File Size</div><div>{project.summary.fileSizeBytes} B</div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium mb-2 border-b border-border pb-1">Conflict Sim</h3>
                    <div className="text-xs flex items-center justify-between">
                      <span className="text-muted-foreground">Enabled</span>
                      <Badge variant={project.conflictSim.enabled ? "default" : "secondary"} className="text-[10px]">
                        {project.conflictSim.enabled ? "True" : "False"}
                      </Badge>
                    </div>
                    {project.conflictSim.enabled && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[10px] text-muted-foreground uppercase">Scenarios</div>
                        {project.conflictSim.scenarios.map(s => (
                          <div key={s.id} className="text-xs bg-background border border-border p-1 rounded">{s.id}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        
        <ResizableHandle className="h-1 bg-border hover:bg-primary transition-colors" />
        
        {/* Bottom Drawer */}
        <ResizablePanel defaultSize={30} minSize={10} className="bg-card flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full">
            <div className="h-9 bg-muted/20 border-b border-border flex items-center px-2 shrink-0">
              <TabsList className="h-7 bg-transparent">
                <TabsTrigger value="console" className="text-xs data-[state=active]:bg-background border border-transparent data-[state=active]:border-border rounded-none h-7 flex items-center gap-2">
                  <Terminal className="h-3 w-3" /> Console
                </TabsTrigger>
                <TabsTrigger value="determinism" className="text-xs data-[state=active]:bg-background border border-transparent data-[state=active]:border-border rounded-none h-7 flex items-center gap-2">
                  <Activity className="h-3 w-3" /> Determinism
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 overflow-hidden relative bg-[#0c0c0c]">
              <TabsContent value="console" className="m-0 h-full p-0 border-none data-[state=active]:flex flex-col">
                {(runMutation.isPending || checkMutation.isPending) && (
                  <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center text-primary text-xs font-mono">
                    Executing Simulation...
                  </div>
                )}
                
                {lastRun ? (
                  <div className="flex flex-col h-full">
                    <div className="shrink-0 p-2 border-b border-border/50 bg-black flex items-center gap-4 text-xs font-mono text-muted-foreground">
                      <span>Duration: <span className="text-foreground">{lastRun.run.durationMs}ms</span></span>
                      <span>Events: <span className="text-foreground">{lastRun.run.eventLineCount}</span></span>
                      <span>Trace Size: <span className="text-foreground">{lastRun.run.traceBytes}B</span></span>
                      <span className="ml-auto text-[10px] opacity-50 truncate max-w-[200px]" title={`Event SHA256: ${lastRun.run.eventLogSha256}`}>Ev: {lastRun.run.eventLogSha256.substring(0,8)}...</span>
                      <span className="text-[10px] opacity-50 truncate max-w-[200px]" title={`Trace SHA256: ${lastRun.run.traceSha256}`}>Tr: {lastRun.run.traceSha256.substring(0,8)}...</span>
                    </div>
                    <ScrollArea className="flex-1 p-4 font-mono text-xs">
                      {lastRun.run.eventLines.map((line: string, i: number) => (
                        <div key={i} className="py-0.5 border-b border-white/5 hover:bg-white/5 text-gray-300">
                          <span className="text-gray-600 mr-4 select-none">{(i+1).toString().padStart(4, '0')}</span>
                          {line}
                        </div>
                      ))}
                      {lastRun.run.eventLines.length === 0 && <div className="text-muted-foreground italic">No events logged.</div>}
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-xs opacity-50">
                    Run simulation to view console output.
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="determinism" className="m-0 h-full p-0 border-none data-[state=active]:flex flex-col">
                {lastCheck ? (
                  <div className="flex flex-col h-full">
                    <div className={`shrink-0 p-3 border-b ${lastCheck.eventsMatch && lastCheck.traceMatch ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'} flex items-center justify-between`}>
                      <div className="flex items-center gap-3">
                        {lastCheck.eventsMatch && lastCheck.traceMatch ? (
                          <><CheckCircle2 className="h-5 w-5 text-green-500" /> <span className="font-semibold text-green-500">Determinism Confirmed</span></>
                        ) : (
                          <><XCircle className="h-5 w-5 text-red-500" /> <span className="font-semibold text-red-500">Divergence Detected</span></>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs font-mono">
                        <span className={lastCheck.eventsMatch ? "text-green-400" : "text-red-400"}>Events: {lastCheck.eventsMatch ? "MATCH" : "DIFF"}</span>
                        <span className={lastCheck.traceMatch ? "text-green-400" : "text-red-400"}>Trace: {lastCheck.traceMatch ? "MATCH" : "DIFF"}</span>
                      </div>
                    </div>
                    
                    <ScrollArea className="flex-1 p-4 font-mono text-xs">
                      {lastCheck.diffLines && lastCheck.diffLines.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-muted-foreground mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500" /> Mismatched lines between Run A and Run B:</div>
                          <div className="grid grid-cols-[60px_1fr_1fr] gap-4 font-semibold text-[10px] uppercase text-muted-foreground pb-2 border-b border-border">
                            <div>Line</div>
                            <div>Run A</div>
                            <div>Run B</div>
                          </div>
                          {lastCheck.diffLines.map((diff: any) => (
                            <div key={diff.index} className="grid grid-cols-[60px_1fr_1fr] gap-4 py-1 border-b border-border/50 bg-red-500/5">
                              <div className="text-gray-500 select-none">{(diff.index + 1).toString().padStart(4, '0')}</div>
                              <div className="text-red-300 break-all">{diff.runA}</div>
                              <div className="text-orange-300 break-all">{diff.runB}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <div className="text-center space-y-2">
                            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                            <div className="text-green-400 font-medium">Runs are bit-exactly identical</div>
                            <div className="text-muted-foreground text-[10px]">
                              Run A SHA: {lastCheck.runA.traceSha256.substring(0,16)}...<br/>
                              Run B SHA: {lastCheck.runB.traceSha256.substring(0,16)}...
                            </div>
                          </div>
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-xs opacity-50">
                    Run Determinism Check to verify engine stability.
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
      
      {/* Footer */}
      <footer className="h-6 bg-card border-t border-border flex items-center px-4 justify-between text-[10px] text-muted-foreground shrink-0 font-mono">
        <div>Project: {project.summary.filename}</div>
        <div>Memory: {(project.summary.fileSizeBytes / 1024).toFixed(2)} KB</div>
      </footer>
    </div>
  );
}
