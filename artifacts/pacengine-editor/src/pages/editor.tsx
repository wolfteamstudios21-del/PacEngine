import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { 
  useGetProject, 
  useRunProject, 
  useDeterminismCheck,
  getGetProjectQueryKey,
  useGetRunFrames,
  useDiffRuns,
  useImportPacExport,
  getGetRunFramesQueryKey,
  getDiffRunsQueryKey,
  EntityFrame, 
  TraceFrame, 
  EntityDetail,
  TraceDiffResponse,
  VisualManifest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { 
  Play, 
  Pause, 
  SkipBack, 
  ChevronLeft, 
  ChevronRight, 
  Activity, 
  Settings, 
  ArrowLeft, 
  Terminal, 
  Box, 
  LayoutGrid, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  History,
  Layers,
  Search,
  RefreshCw,
  Upload,
  Sun,
  Lightbulb,
  Sparkles,
  Image as ImageIcon,
  LogOut,
  User,
  ShieldCheck,
  StepForward,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Viewport3D from "@/components/Viewport3D";
import ArtLibrary from "@/components/ArtLibrary";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { rendererBridge } from "@/lib/renderer-bridge";

export default function Editor() {
  const { projectId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: authData } = useAuth();
  const logoutMutation = useLogout();
  
  const [ticks, setTicks] = useState("100");
  const [activeTab, setActiveTab] = useState("console");
  
  // New state for v0.0.5 features
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [currentTick, setCurrentTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedEntityIndex, setSelectedEntityIndex] = useState<number | null>(null);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  
  const { data: project, isLoading } = useGetProject(projectId || "", {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId || "") as unknown as readonly unknown[] }
  });
  
  const runMutation = useRunProject();
  const checkMutation = useDeterminismCheck();
  const importPacExportMutation = useImportPacExport();
  
  const [lastRun, setLastRun] = useState<any>(null);
  const [lastCheck, setLastCheck] = useState<any>(null);

  // Viewport mode toggle (2D orthographic ↔ 3D atmospheric)
  const [viewMode, setViewMode] = useState<"2D" | "3D">("2D");

  // M3: Real-time simulation tick state
  const [simPlaying,         setSimPlaying]         = useState(false);
  const [simTickCount,       setSimTickCount]       = useState(0);
  const [simElapsedSeconds,  setSimElapsedSeconds]  = useState(0);
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SIM_HZ = 20;
  const SIM_DT = 1 / SIM_HZ;

  const handleSimStep = useCallback(() => {
    rendererBridge.simulationStep(SIM_DT)
      .then((r) => { setSimTickCount(r.tickCount); setSimElapsedSeconds(r.elapsedSeconds); })
      .catch(() => {});
  }, []);

  const handleSimPlay = useCallback(() => {
    if (simIntervalRef.current) return;
    rendererBridge.simulationStart(SIM_HZ).catch(() => {});
    setSimPlaying(true);
    simIntervalRef.current = setInterval(() => {
      rendererBridge.simulationStep(SIM_DT)
        .then((r) => { setSimTickCount(r.tickCount); setSimElapsedSeconds(r.elapsedSeconds); })
        .catch(() => {});
    }, 1000 / SIM_HZ);
  }, []);

  const handleSimPause = useCallback(() => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    rendererBridge.simulationStop().catch(() => {});
    setSimPlaying(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
    };
  }, []);

  // Import .pacexport dialog state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showArtLibrary, setShowArtLibrary] = useState(false);
  const [importName, setImportName] = useState("");
  const [importPacdataJson, setImportPacdataJson] = useState("");
  const [importVisualJson, setImportVisualJson] = useState("");

  // Fetch frames for the current run
  const framesWindowSize = 100;
  const currentWindowStart = Math.max(0, Math.floor(currentTick / framesWindowSize) * framesWindowSize);
  
  const { data: framesData } = useGetRunFrames(lastRunId || "", {
    from: currentWindowStart,
    to: currentWindowStart + framesWindowSize + 10, // Buffer
  }, {
    query: { 
      enabled: !!lastRunId,
      queryKey: lastRunId ? getGetRunFramesQueryKey(lastRunId, { from: currentWindowStart, to: currentWindowStart + framesWindowSize + 10 }) as unknown as readonly unknown[] : []
    }
  });

  const currentFrame = useMemo(() => {
    if (!framesData?.frames) return null;
    return (framesData.frames as TraceFrame[]).find((f: TraceFrame) => f.tick === currentTick) || framesData.frames[0];
  }, [framesData, currentTick]);

  // Trail: fetch a small window backwards
  const { data: trailData } = useGetRunFrames(lastRunId || "", {
    from: Math.max(0, currentTick - 8),
    to: currentTick,
  }, {
    query: {
      enabled: !!lastRunId && currentTick > 0,
      queryKey: lastRunId ? getGetRunFramesQueryKey(lastRunId, { from: Math.max(0, currentTick - 8), to: currentTick }) as unknown as readonly unknown[] : []
    }
  });

  // Diff runs for determinism
  const { data: diffData } = useDiffRuns(lastCheck?.runAId || "", lastCheck?.runBId || "", {
    query: { 
      enabled: !!lastCheck?.runAId && !!lastCheck?.runBId,
      queryKey: (lastCheck?.runAId && lastCheck?.runBId) ? getDiffRunsQueryKey(lastCheck.runAId, lastCheck.runBId) as unknown as readonly unknown[] : []
    }
  });

  // Playback timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && lastRunId) {
      interval = setInterval(() => {
        setCurrentTick(prev => {
          const total = framesData?.totalFrames || 0;
          if (prev >= total - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 250); // ~4 ticks per second
    }
    return () => clearInterval(interval);
  }, [isPlaying, lastRunId, framesData?.totalFrames]);

  // NOTE: every hook MUST be declared above the conditional early
  // return below. Adding new hooks after the `if (isLoading) return`
  // block causes "Rendered more hooks than during the previous render"
  // because the loading branch renders fewer hooks than the loaded one.
  const selectedEntity = useMemo(() => {
    if (selectedEntityIndex === null) return null;
    if (currentFrame?.entities) {
      return (currentFrame.entities as EntityFrame[]).find(
        (e: EntityFrame) => e.index === selectedEntityIndex,
      );
    }
    if (!project?.entities) return null;
    const ent = project.entities[selectedEntityIndex] as
      | EntityDetail
      | undefined;
    if (!ent) return null;
    return {
      index: selectedEntityIndex,
      generation: 0,
      pacId: ent.id,
      type: ent.type,
    } as EntityFrame;
  }, [selectedEntityIndex, currentFrame, project?.entities]);

  if (isLoading || !project) {
    return <div className="h-screen bg-background flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading Project Shell...</div></div>;
  }

  const handleRun = () => {
    const numTicks = parseInt(ticks);
    if (isNaN(numTicks) || numTicks <= 0) return;
    
    setLastCheck(null);
    
    runMutation.mutate({ projectId: projectId!, data: { ticks: numTicks } }, {
      onSuccess: (res) => {
        setLastRun(res);
        setLastRunId(res.runId);
        setCurrentTick(0);
        setActiveTab("timeline");
        toast({ title: "Run Complete", description: `Executed ${res.ticks} ticks in ${res.run.durationMs}ms` });
      },
      onError: (err: any) => {
        const errorMsg = (err as { error?: string })?.error || "Unknown error";
        toast({ title: "Run Failed", description: errorMsg, variant: "destructive" });
      }
    });
  };

  const handleDeterminismCheck = () => {
    const numTicks = parseInt(ticks);
    if (isNaN(numTicks) || numTicks <= 0) return;
    
    setLastRun(null);
    setLastRunId(null);
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
      onError: (err: any) => {
        const errorMsg = (err as { error?: string })?.error || "Unknown error";
        toast({ title: "Check Failed", description: errorMsg, variant: "destructive" });
      }
    });
  };

  const handleImportPacExport = () => {
    if (!importName.trim() || !importPacdataJson.trim()) return;
    importPacExportMutation.mutate({
      data: {
        name: importName.trim(),
        worldPacdataJson: importPacdataJson.trim(),
        ...(importVisualJson.trim() ? { visualManifestJson: importVisualJson.trim() } : {}),
      },
    }, {
      onSuccess: (res) => {
        toast({ title: "Package Imported", description: `Created project "${res.project.id}"` });
        setShowImportDialog(false);
        setImportName("");
        setImportPacdataJson("");
        setImportVisualJson("");
        queryClient.invalidateQueries({ queryKey: ["listProjects"] });
      },
      onError: (err: any) => {
        const errorMsg = (err as { error?: string })?.error || "Import failed";
        toast({ title: "Import Failed", description: errorMsg, variant: "destructive" });
      }
    });
  };

  const worldBounds = { min: -5, max: 5 };
  const projectEntities = project.entities;

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
          <div className="flex items-center gap-0.5 bg-muted/40 rounded p-0.5 border border-border ml-1">
            <Button
              size="sm"
              variant={viewMode === "2D" ? "secondary" : "ghost"}
              className="h-5 text-[10px] px-2 gap-1"
              onClick={() => setViewMode("2D")}
            >
              <LayoutGrid className="h-2.5 w-2.5" /> 2D
            </Button>
            <Button
              size="sm"
              variant={viewMode === "3D" ? "secondary" : "ghost"}
              className="h-5 text-[10px] px-2 gap-1"
              onClick={() => setViewMode("3D")}
            >
              <Box className="h-2.5 w-2.5" /> 3D
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-background/50 p-1 rounded-md border border-border">
          {/* M3 Real-time simulation controls */}
          <div className="flex items-center gap-1 px-2 border-r border-border">
            <span className="text-[10px] text-muted-foreground mr-1">Sim:</span>
            {simPlaying ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 text-[10px] px-2 gap-1 bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30"
                onClick={handleSimPause}
                title="Pause simulation"
              >
                <Pause className="h-3 w-3" /> Pause
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2 gap-1 hover:text-green-400 hover:bg-green-400/10"
                onClick={handleSimPlay}
                title="Play simulation at 20 Hz"
              >
                <Play className="h-3 w-3" /> Play
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2 gap-1 hover:text-sky-400 hover:bg-sky-400/10"
              onClick={handleSimStep}
              title="Step one tick (50 ms)"
            >
              <StepForward className="h-3 w-3" /> Step
            </Button>
            <div className="flex items-center gap-1 ml-1 text-[10px] font-mono text-muted-foreground" title="Elapsed sim time / tick count">
              <Clock className="h-2.5 w-2.5" />
              <span>{simElapsedSeconds.toFixed(2)}s</span>
              <span className="opacity-50">#{simTickCount}</span>
            </div>
          </div>

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
          <div className="w-px h-4 bg-border mx-1" />
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 hover:text-purple-400 hover:bg-purple-400/10" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-3 w-3" /> Import .pacexport
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 hover:text-violet-400 hover:bg-violet-400/10" onClick={() => setShowArtLibrary(true)}>
            <Box className="h-3 w-3" /> Art Library
          </Button>
          {authData?.user && (
            <>
              <div className="w-px h-4 bg-border mx-1" />
              {authData.user.role === "admin" && (
                <Link href="/admin">
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 hover:text-primary hover:bg-primary/10">
                    <ShieldCheck className="h-3 w-3" />
                  </Button>
                </Link>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                <User className="h-3 w-3" />
                {authData.user.username}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 hover:text-destructive hover:bg-destructive/10"
                title="Sign out"
                onClick={() => logoutMutation.mutate(undefined, { onSuccess: () => setLocation("/login") })}
              >
                <LogOut className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Import .pacexport Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-purple-400" /> Import .pacexport Package
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Paste the contents of <code className="font-mono bg-muted px-1 rounded">world.pacdata.json</code> and, optionally, <code className="font-mono bg-muted px-1 rounded">visual_manifest.json</code> from your .pacexport folder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="import-name" className="text-xs">Project Name</Label>
              <Input
                id="import-name"
                placeholder="my_imported_world"
                value={importName}
                onChange={e => setImportName(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="import-pacdata" className="text-xs">world.pacdata.json <span className="text-red-400">*</span></Label>
              <Textarea
                id="import-pacdata"
                placeholder='{"pacdata_version": "1.0.0", "world": {...}}'
                value={importPacdataJson}
                onChange={e => setImportPacdataJson(e.target.value)}
                className="h-36 text-xs font-mono resize-none"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="import-visual" className="text-xs">
                visual_manifest.json <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="import-visual"
                placeholder='{"visual_version": "1.0.0", "environment": {"sky_type": "physical", "sun_intensity": 1.2, "fog_enabled": true, "fog_density": 0.015}, "global_illumination": {"gi_type": "probe_grid", "probe_density": "medium"}}'
                value={importVisualJson}
                onChange={e => setImportVisualJson(e.target.value)}
                className="h-28 text-xs font-mono resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowImportDialog(false)}>Cancel</Button>
            <Button
              size="sm"
              className="text-xs gap-1 bg-purple-600 hover:bg-purple-700"
              onClick={handleImportPacExport}
              disabled={!importName.trim() || !importPacdataJson.trim() || importPacExportMutation.isPending}
            >
              <Upload className="h-3 w-3" />
              {importPacExportMutation.isPending ? "Importing..." : "Import Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    {projectEntities.map((e, i) => (
                      <div 
                        key={e.id} 
                        onClick={() => setSelectedEntityIndex(i)}
                        className={cn(
                          "flex items-center gap-2 text-xs p-1 rounded hover:bg-muted cursor-default text-muted-foreground",
                          selectedEntityIndex === i && "bg-primary/20 text-primary"
                        )}
                      >
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

              {/* ── 3D Atmospheric View ─────────────────────────────────── */}
              {viewMode === "3D" && (
                <Viewport3D
                  entities={projectEntities}
                  currentFrameEntities={(currentFrame?.entities as EntityFrame[] | undefined) ?? []}
                  selectedEntityIndex={selectedEntityIndex}
                  onSelectEntity={setSelectedEntityIndex}
                  worldBounds={worldBounds}
                  artLibraryMeshes={(project as any).visualManifest?.art_library_meshes ?? []}
                />
              )}

              {/* ── 2D Orthographic View ─────────────────────────────────── */}
              {viewMode === "2D" && (
                <>
                  <div className="absolute top-0 w-full h-8 bg-gradient-to-b from-black/50 to-transparent z-10 flex items-center px-4 pointer-events-none">
                    {lastRunId ? (
                      <Badge variant="secondary" className="text-[10px] font-mono bg-blue-500/20 text-blue-400 border-blue-500/30 flex items-center gap-2">
                        <History className="h-3 w-3"/> Replay @ tick {currentTick}
                      </Badge>
                    ) : (
                      <span className="text-[10px] font-mono text-white/50 flex items-center gap-2"><LayoutGrid className="h-3 w-3"/> Orthographic Viewport</span>
                    )}
                  </div>

                  <div className="flex-1 w-full h-full relative" style={{ 
                    backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    backgroundPosition: 'center center'
                  }}>
                    {/* Trail rendering */}
                    {trailData?.frames?.map((frame: any) => (
                      frame.tick < currentTick && frame.entities.map((ef: any) => {
                        if (!ef.position) return null;
                        const left = ((ef.position.x - worldBounds.min) / (worldBounds.max - worldBounds.min)) * 100;
                        const top  = ((ef.position.z - worldBounds.min) / (worldBounds.max - worldBounds.min)) * 100;
                        const opacity = 0.1 + (frame.tick - (currentTick - 8)) / 10;
                        return (
                          <div 
                            key={`${frame.tick}-${ef.index}`}
                            className="absolute w-1 h-1 rounded-full bg-primary"
                            style={{ 
                              left: `${Math.max(0, Math.min(100, left))}%`, 
                              top:  `${Math.max(0, Math.min(100, top))}%`,
                              opacity,
                              transform: 'translate(-50%, -50%)'
                            }}
                          />
                        );
                      })
                    ))}

                    {/* Entity markers */}
                    {projectEntities.map((e, i) => {
                      const frameEntity = (currentFrame?.entities as EntityFrame[] | undefined)?.find((fe: EntityFrame) => fe.index === i);
                      let left: number, top: number;

                      if (frameEntity?.position) {
                        left = ((frameEntity.position.x - worldBounds.min) / (worldBounds.max - worldBounds.min)) * 100;
                        top  = ((frameEntity.position.z - worldBounds.min) / (worldBounds.max - worldBounds.min)) * 100;
                      } else {
                        const seed = i * 137.5;
                        left = 20 + (Math.sin(seed) * 30 + 30);
                        top  = 20 + (Math.cos(seed) * 30 + 30);
                      }

                      const isAgent    = e.type === 'agent';
                      const isSelected = selectedEntityIndex === i;

                      return (
                        <div 
                          key={e.id}
                          onClick={() => setSelectedEntityIndex(i)}
                          className={cn(
                            "absolute p-2 rounded border border-border shadow-md bg-card/80 backdrop-blur text-[10px] font-mono transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 cursor-pointer transition-all duration-200",
                            isSelected && "ring-2 ring-primary border-primary z-20"
                          )}
                          style={{ 
                            left: `${Math.max(0, Math.min(100, left))}%`, 
                            top:  `${Math.max(0, Math.min(100, top))}%` 
                          }}
                        >
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            isAgent ? "bg-blue-500" : "bg-orange-500",
                            isSelected && "animate-pulse"
                          )} />
                          {e.id}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </ResizablePanel>

            <ResizableHandle className="w-1 bg-border hover:bg-primary transition-colors" />

            {/* Details Panel */}
            <ResizablePanel defaultSize={20} minSize={15} className="border-l border-border bg-card flex flex-col">
              <div className="h-8 bg-muted/30 border-b border-border flex items-center px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                {selectedEntityIndex !== null ? "Entity Inspector" : "Details"}
              </div>
              <ScrollArea className="flex-1">
                {selectedEntityIndex !== null ? (
                  <div className="p-4 space-y-6 animate-in fade-in slide-in-from-right-2">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] p-0 text-muted-foreground hover:text-foreground" onClick={() => setSelectedEntityIndex(null)}>
                      <ArrowLeft className="h-3 w-3 mr-1" /> Back to Project Info
                    </Button>

                    <div>
                      <h3 className="text-sm font-medium mb-3 border-b border-border pb-1 flex items-center gap-2">
                        <Box className="h-4 w-4" /> {selectedEntity?.pacId || projectEntities[selectedEntityIndex].id}
                      </h3>
                      <div className="grid grid-cols-[100px_1fr] gap-y-2 text-xs">
                        <div className="text-muted-foreground">Slot Index</div><div className="font-mono">{selectedEntity?.index ?? selectedEntityIndex}</div>
                        <div className="text-muted-foreground">Generation</div><div className="font-mono">{selectedEntity?.generation ?? 0}</div>
                        <div className="text-muted-foreground">Type</div><Badge variant="outline" className="w-fit text-[10px] h-4 font-mono">{selectedEntity?.type || projectEntities[selectedEntityIndex].type}</Badge>
                        {selectedEntity?.position && (
                          <>
                            <div className="text-muted-foreground">Position X</div><div className="font-mono text-blue-400">{selectedEntity.position.x.toFixed(3)}</div>
                            <div className="text-muted-foreground">Position Y</div><div className="font-mono text-green-400">{selectedEntity.position.y.toFixed(3)}</div>
                            <div className="text-muted-foreground">Position Z</div><div className="font-mono text-purple-400">{selectedEntity.position.z.toFixed(3)}</div>
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium mb-3 border-b border-border pb-1">Components</h3>
                      <div className="space-y-2">
                        {/* Placeholder for real component data if available in frame */}
                        <div className="p-2 rounded bg-muted/30 border border-border/50">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-between">
                            Transform
                            <Settings className="h-3 w-3" />
                          </div>
                          <div className="mt-1 grid grid-cols-3 gap-1">
                            <div className="bg-black/40 p-1 rounded text-center">
                              <div className="text-[8px] opacity-50">X</div>
                              <div className="text-[10px] font-mono">{selectedEntity?.position?.x.toFixed(2) || "0.00"}</div>
                            </div>
                            <div className="bg-black/40 p-1 rounded text-center">
                              <div className="text-[8px] opacity-50">Y</div>
                              <div className="text-[10px] font-mono">{selectedEntity?.position?.y.toFixed(2) || "0.00"}</div>
                            </div>
                            <div className="bg-black/40 p-1 rounded text-center">
                              <div className="text-[8px] opacity-50">Z</div>
                              <div className="text-[10px] font-mono">{selectedEntity?.position?.z.toFixed(2) || "0.00"}</div>
                            </div>
                          </div>
                        </div>

                        {projectEntities[selectedEntityIndex].type === 'agent' && (
                          <div className="p-2 rounded bg-muted/30 border border-border/50">
                            <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-between">
                              AgentState
                              <Activity className="h-3 w-3" />
                            </div>
                            <div className="mt-1 text-[10px] text-green-400 font-mono italic">
                              Active: true
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 space-y-6">
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

                    {/* Visual Properties — only shown when a visual_manifest.json sidecar exists */}
                    {(project as any).visualManifest ? (
                      <VisualPropertiesPanel manifest={(project as any).visualManifest as VisualManifest} />
                    ) : (
                      <div>
                        <h3 className="text-sm font-medium mb-2 border-b border-border pb-1 flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> Visual Properties
                        </h3>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          No visual_manifest.json found. Use <span className="font-mono text-purple-400">Import .pacexport</span> to attach scene visuals (sky, GI, post-processing, entity meshes) to this project.
                        </p>
                      </div>
                    )}
                  </div>
                )}
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
                <TabsTrigger value="timeline" className="text-xs data-[state=active]:bg-background border border-transparent data-[state=active]:border-border rounded-none h-7 flex items-center gap-2">
                  <History className="h-3 w-3" /> Timeline
                </TabsTrigger>
                <TabsTrigger value="console" className="text-xs data-[state=active]:bg-background border border-transparent data-[state=active]:border-border rounded-none h-7 flex items-center gap-2">
                  <Terminal className="h-3 w-3" /> Console
                </TabsTrigger>
                <TabsTrigger value="determinism" className="text-xs data-[state=active]:bg-background border border-transparent data-[state=active]:border-border rounded-none h-7 flex items-center gap-2">
                  <Activity className="h-3 w-3" /> Determinism
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 overflow-hidden relative bg-[#0c0c0c]">
              <TabsContent value="timeline" className="m-0 h-full p-0 border-none data-[state=active]:flex flex-col">
                {lastRunId ? (
                  <div className="flex flex-col h-full">
                    <div className="shrink-0 p-3 bg-black/40 border-b border-border flex flex-col gap-3">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentTick(0)}>
                            <SkipBack className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentTick(prev => Math.max(0, prev - 1))}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button variant="default" size="icon" className="h-10 w-10 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50" onClick={() => setIsPlaying(!isPlaying)}>
                            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-1" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentTick(prev => Math.min((framesData?.totalFrames || 1) - 1, prev + 1))}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-1">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-mono text-muted-foreground">TICK: <span className="text-foreground">{currentTick}</span></span>
                            <span className="text-[10px] font-mono text-muted-foreground">TOTAL: <span className="text-foreground">{framesData?.totalFrames || 0}</span></span>
                          </div>
                          <Slider 
                            value={[currentTick]} 
                            max={(framesData?.totalFrames || 1) - 1} 
                            step={1}
                            onValueChange={([val]) => setCurrentTick(val)}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                      <div className="flex-1 flex flex-col border-r border-border/30">
                        <div className="h-6 px-3 bg-muted/20 border-b border-border/30 flex items-center text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                          Frame Events
                        </div>
                        <ScrollArea className="flex-1 p-2">
                          {(currentFrame?.events && currentFrame.events.length > 0) ? (
                            <div className="space-y-1">
                              {currentFrame.events.map((ev: string, idx: number) => (
                                <div key={idx} className="text-xs font-mono py-1 px-2 rounded bg-white/5 border-l-2 border-primary/50 text-gray-300">
                                  {ev}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-[10px] italic">
                              No events at this tick
                            </div>
                          )}
                        </ScrollArea>
                      </div>
                      <div className="w-64 flex flex-col bg-black/20">
                        <div className="h-6 px-3 bg-muted/20 border-b border-border/30 flex items-center text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                          Quick Inspector
                        </div>
                        <div className="p-3 space-y-3">
                          <div className="text-[10px] font-mono text-muted-foreground">
                            ACTIVE ENTITIES: <span className="text-foreground">{currentFrame?.entities?.length || 0}</span>
                          </div>
                          <div className="space-y-1">
                            {currentFrame?.entities?.slice(0, 10).map((ef: any) => (
                              <div key={ef.index} className="flex items-center justify-between text-[10px] font-mono p-1 rounded hover:bg-white/5 cursor-pointer" onClick={() => setSelectedEntityIndex(ef.index)}>
                                <span className="text-muted-foreground truncate max-w-[100px]">{ef.pacId || `Entity #${ef.index}`}</span>
                                <span className="text-primary opacity-70">[{ef.position?.x.toFixed(1)}, {ef.position?.z.toFixed(1)}]</span>
                              </div>
                            ))}
                            {(currentFrame?.entities && currentFrame.entities.length > 10) && (
                              <div className="text-[10px] text-muted-foreground text-center italic">+{currentFrame.entities.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-xs opacity-50 flex-col gap-4">
                    <History className="h-12 w-12 opacity-20" />
                    <span>Run simulation to initialize timeline trace.</span>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="console" className="m-0 h-full p-0 border-none data-[state=active]:flex flex-col">
                {(runMutation.isPending || checkMutation.isPending) && (
                  <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center text-primary text-xs font-mono">
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
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
                    <div className={cn(
                      "shrink-0 p-3 border-b flex items-center justify-between",
                      lastCheck.eventsMatch && lastCheck.traceMatch ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'
                    )}>
                      <div className="flex items-center gap-3">
                        {lastCheck.eventsMatch && lastCheck.traceMatch ? (
                          <><CheckCircle2 className="h-5 w-5 text-green-500" /> <span className="font-semibold text-green-500">Determinism Confirmed</span></>
                        ) : (
                          <><XCircle className="h-5 w-5 text-red-500" /> <span className="font-semibold text-red-500">Divergence Detected</span></>
                        )}
                      </div>
                      <div className="flex gap-4 items-center">
                        <div className="flex gap-4 text-xs font-mono">
                          <span className={lastCheck.eventsMatch ? "text-green-400" : "text-red-400"}>Events: {lastCheck.eventsMatch ? "MATCH" : "DIFF"}</span>
                          <span className={lastCheck.traceMatch ? "text-green-400" : "text-red-400"}>Trace: {lastCheck.traceMatch ? "MATCH" : "DIFF"}</span>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 text-[10px] gap-1 border-primary/30 hover:bg-primary/10" 
                          onClick={() => setShowDiffDialog(true)}
                        >
                          <Search className="h-3 w-3" /> Diff Trace
                        </Button>
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
                              Run A ID: {lastCheck.runAId.substring(0,8)}...<br/>
                              Run B ID: {lastCheck.runBId.substring(0,8)}...
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Trace Diff Results section */}
                      {diffData && (
                        <div className="mt-8 border-t border-border pt-4">
                          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <Layers className="h-4 w-4" /> Trace Diff Result
                            <Badge variant={diffData.identical ? "default" : "destructive"} className={cn("text-[10px]", diffData.identical && "bg-green-500 hover:bg-green-600")}>
                              {diffData.identical ? "IDENTICAL" : "DIVERGED"}
                            </Badge>
                          </div>
                          {diffData.firstDivergenceTick !== null && (
                            <div className="text-xs text-red-400 mb-2 font-mono">
                              First divergence at tick: {diffData.firstDivergenceTick}
                            </div>
                          )}
                          <div className="space-y-1">
                            {diffData.entries.slice(0, 20).map((entry: any, i: number) => (
                              <div key={i} className="text-[10px] font-mono p-1 rounded bg-muted/20 border-l border-border flex gap-4">
                                <span className="text-muted-foreground w-12">T{entry.tick}</span>
                                <Badge variant="outline" className="text-[8px] h-3 px-1">{entry.kind}</Badge>
                                <span className="text-gray-300 truncate">{entry.detail}</span>
                              </div>
                            ))}
                            {diffData.entries.length > 20 && <div className="text-[10px] text-muted-foreground italic pl-4">... {diffData.entries.length - 20} more entries</div>}
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
      
      {/* Trace Diff Dialog */}
      <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> Trace v2 Diff Analysis
            </DialogTitle>
            <DialogDescription>
              Comparing frame-by-frame entity state and events between Run A and Run B.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 mt-4 rounded-md border border-border bg-black/50 p-4">
            {diffData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded bg-muted/30 border border-border">
                    <div className="text-[10px] uppercase text-muted-foreground font-bold mb-1">Status</div>
                    <div className={cn("text-lg font-bold", diffData.identical ? "text-green-500" : "text-red-500")}>
                      {diffData.identical ? "PERFECT MATCH" : "DIVERGENCE FOUND"}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-muted/30 border border-border">
                    <div className="text-[10px] uppercase text-muted-foreground font-bold mb-1">Divergence Tick</div>
                    <div className="text-lg font-mono font-bold">
                      {diffData.firstDivergenceTick !== null ? diffData.firstDivergenceTick : "N/A"}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold mb-2 uppercase text-muted-foreground">Diff Entries ({diffData.entries.length})</div>
                  <div className="space-y-1">
                    {diffData.entries.map((entry: any, i: number) => (
                      <div key={i} className="text-xs font-mono p-2 rounded bg-muted/20 border border-border/50 flex items-start gap-4">
                        <span className="text-muted-foreground w-16 shrink-0">Tick {entry.tick}</span>
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <Badge variant="outline" className="w-fit text-[10px] h-4 px-1 bg-primary/5">{entry.kind}</Badge>
                          <span className="text-gray-300 break-words">{entry.detail}</span>
                        </div>
                      </div>
                    ))}
                    {diffData.entries.length === 0 && (
                      <div className="p-8 text-center text-muted-foreground italic text-xs">
                        No differences found in trace data.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground italic animate-pulse">
                Fetching diff data...
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Art Library */}
      <ArtLibrary
        open={showArtLibrary}
        onOpenChange={setShowArtLibrary}
        projectId={projectId}
      />

      {/* Footer */}
      <footer className="h-6 bg-card border-t border-border flex items-center px-4 justify-between text-[10px] text-muted-foreground shrink-0 font-mono">
        <div>Project: {project.summary.filename}</div>
        <div className="flex gap-4">
          {lastRunId && <span>Run: <span className="text-foreground">{lastRunId.substring(0,8)}</span></span>}
          <span>Memory: {(project.summary.fileSizeBytes / 1024).toFixed(2)} KB</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Visual Properties Panel ────────────────────────────────────────────────

function VisualPropertiesPanel({ manifest }: { manifest: VisualManifest }) {
  const env = manifest.environment;
  const gi = manifest.global_illumination;
  const pp = manifest.post_processing;
  const entityOverrides = manifest.entities ?? [];
  const staticMeshes = manifest.static_meshes ?? [];
  const lights = manifest.lights ?? [];
  const cam = manifest.camera_default;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium border-b border-border pb-1 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Visual Properties
        {manifest.visual_version && (
          <Badge variant="outline" className="text-[9px] h-4 ml-auto font-mono">v{manifest.visual_version}</Badge>
        )}
      </h3>

      {/* Environment */}
      {env && (
        <div className="p-2 rounded bg-muted/30 border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-2">
            <Sun className="h-3 w-3 text-yellow-400" /> Environment
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-y-1 text-[11px]">
            {env.sky_type && <><div className="text-muted-foreground">Sky Type</div><div className="font-mono">{env.sky_type}</div></>}
            {env.sun_intensity !== undefined && <><div className="text-muted-foreground">Sun Intensity</div><div className="font-mono text-yellow-300">{env.sun_intensity}</div></>}
            {env.ambient_intensity !== undefined && <><div className="text-muted-foreground">Ambient</div><div className="font-mono">{env.ambient_intensity}</div></>}
            {env.sun_direction && <><div className="text-muted-foreground">Sun Dir.</div><div className="font-mono text-[10px]">[{env.sun_direction.map((v: number) => v.toFixed(2)).join(", ")}]</div></>}
            {env.sun_color && (
              <>
                <div className="text-muted-foreground">Sun Color</div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm border border-border/50" style={{ background: `rgb(${env.sun_color.map((v: number) => Math.round(v * 255)).join(",")})` }} />
                  <span className="font-mono text-[10px]">[{env.sun_color.map((v: number) => v.toFixed(2)).join(", ")}]</span>
                </div>
              </>
            )}
            {env.fog_enabled !== undefined && <><div className="text-muted-foreground">Fog</div><div className="font-mono">{env.fog_enabled ? "enabled" : "disabled"}</div></>}
            {env.fog_density !== undefined && <><div className="text-muted-foreground">Fog Density</div><div className="font-mono text-blue-300">{env.fog_density}</div></>}
            {env.fog_height_falloff !== undefined && <><div className="text-muted-foreground">Fog Falloff</div><div className="font-mono">{env.fog_height_falloff}</div></>}
            {env.fog_color && (
              <>
                <div className="text-muted-foreground">Fog Color</div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm border border-border/50" style={{ background: `rgb(${env.fog_color.map((v: number) => Math.round(v * 255)).join(",")})` }} />
                  <span className="font-mono text-[10px]">[{env.fog_color.map((v: number) => v.toFixed(2)).join(", ")}]</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Global Illumination */}
      {gi && (
        <div className="p-2 rounded bg-muted/30 border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-2">
            <Lightbulb className="h-3 w-3 text-green-400" /> Global Illumination
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-y-1 text-[11px]">
            {gi.gi_type && <><div className="text-muted-foreground">GI Type</div><div className="font-mono">{gi.gi_type}</div></>}
            {gi.probe_density && <><div className="text-muted-foreground">Probe Density</div><div className="font-mono">{gi.probe_density}</div></>}
          </div>
        </div>
      )}

      {/* Post-processing */}
      {pp && (
        <div className="p-2 rounded bg-muted/30 border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-2">
            <Sparkles className="h-3 w-3 text-cyan-400" /> Post-processing
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-y-1 text-[11px]">
            {pp.tonemap && <><div className="text-muted-foreground">Tonemap</div><div className="font-mono">{pp.tonemap}</div></>}
            {pp.exposure !== undefined && <><div className="text-muted-foreground">Exposure</div><div className="font-mono">{pp.exposure}</div></>}
            {pp.bloom_intensity !== undefined && <><div className="text-muted-foreground">Bloom</div><div className="font-mono text-pink-300">{pp.bloom_intensity}</div></>}
            {pp.contrast !== undefined && <><div className="text-muted-foreground">Contrast</div><div className="font-mono">{pp.contrast}</div></>}
            {pp.saturation !== undefined && <><div className="text-muted-foreground">Saturation</div><div className="font-mono">{pp.saturation}</div></>}
          </div>
        </div>
      )}

      {/* Camera default */}
      {cam && (cam.position || cam.target) && (
        <div className="p-2 rounded bg-muted/30 border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-2">
            <Box className="h-3 w-3 text-purple-400" /> Camera Default
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-y-1 text-[11px]">
            {cam.position && <><div className="text-muted-foreground">Position</div><div className="font-mono text-[10px]">[{cam.position.map((v: number) => v.toFixed(1)).join(", ")}]</div></>}
            {cam.target && <><div className="text-muted-foreground">Target</div><div className="font-mono text-[10px]">[{cam.target.map((v: number) => v.toFixed(1)).join(", ")}]</div></>}
          </div>
        </div>
      )}

      {/* Lights summary */}
      {lights.length > 0 && (
        <div className="p-2 rounded bg-muted/30 border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-2">
            <Sun className="h-3 w-3 text-orange-400" /> Lights ({lights.length})
          </div>
          <div className="space-y-1">
            {lights.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                {l.color && <div className="w-3 h-3 rounded-sm border border-border/50 shrink-0" style={{ background: `rgb(${l.color.map((v: number) => Math.round(v * 255)).join(",")})` }} />}
                <span className="text-muted-foreground capitalize">{l.type ?? "light"}</span>
                {l.intensity !== undefined && <span className="font-mono ml-auto">{l.intensity}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entity overrides summary */}
      {entityOverrides.length > 0 && (
        <div className="p-2 rounded bg-muted/30 border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-2">
            <Box className="h-3 w-3 text-blue-400" /> Entity Overrides ({entityOverrides.length})
          </div>
          <div className="space-y-1">
            {entityOverrides.map((e, i) => (
              <div key={i} className="text-[11px] flex items-center gap-2">
                <span className="font-mono text-primary">#{e.id}</span>
                {e.render?.asset && <span className="text-muted-foreground truncate text-[9px]">{e.render.asset}</span>}
                {e.render?.cast_shadows === false && <Badge variant="secondary" className="text-[9px] h-3 px-1">no shadow</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Static meshes summary */}
      {staticMeshes.length > 0 && (
        <div className="p-2 rounded bg-muted/30 border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-2">
            <ImageIcon className="h-3 w-3 text-gray-400" /> Static Meshes ({staticMeshes.length})
          </div>
          <div className="space-y-1">
            {staticMeshes.map((m, i) => (
              <div key={i} className="text-[11px] flex items-center gap-2">
                <span className="font-mono text-muted-foreground">{m.id}</span>
                {m.material_intent && <Badge variant="outline" className="text-[9px] h-3 px-1">{m.material_intent}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
