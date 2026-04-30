import React, { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListProjects, 
  useListTemplates, 
  useGetStats, 
  useImportPacExport,
  useInstantiateTemplate
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Activity, FolderOpen, Play, Box, FileJson, Hash, Settings, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import JSZip from "jszip";

/**
 * Try to split two concatenated JSON objects from a single string.
 * Returns [firstDoc, secondDoc] if two root-level objects are found,
 * or [input, ""] if the text is a single valid JSON object,
 * or null if the text cannot be parsed at all.
 */
function trySplitConcatenatedJson(text: string): [string, string] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let splitAt = -1;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) { splitAt = i + 1; break; }
    }
  }

  if (splitAt === -1) return null;

  const first = trimmed.slice(0, splitAt);
  const rest = trimmed.slice(splitAt).trim();

  if (rest === "") return [first, ""];

  // Check if remainder is a valid JSON object (the visual manifest)
  if (rest.startsWith("{")) {
    try {
      JSON.parse(rest);
      return [first, rest];
    } catch {
      // rest is not valid JSON — treat whole text as one doc
    }
  }

  return [first, ""];
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: projectsData, isLoading: loadingProjects } = useListProjects();
  const { data: templatesData, isLoading: loadingTemplates } = useListTemplates();
  const { data: statsData, isLoading: loadingStats } = useGetStats();
  
  const importMutation = useImportPacExport();
  const instantiateMutation = useInstantiateTemplate();
  
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importWorldJson, setImportWorldJson] = useState("");
  const [importVisualJson, setImportVisualJson] = useState("");
  const [zipStatus, setZipStatus] = useState<"idle" | "success" | "error">("idle");
  const [zipError, setZipError] = useState<string>("");
  const [zipFileName, setZipFileName] = useState<string>("");
  const [importError, setImportError] = useState<{ message: string; details?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetImportDialog = () => {
    setImportName("");
    setImportWorldJson("");
    setImportVisualJson("");
    setZipStatus("idle");
    setZipError("");
    setZipFileName("");
    setImportError(null);
  };

  const handleZipUpload = async (file: File) => {
    setZipStatus("idle");
    setZipError("");
    setZipFileName(file.name);

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      setZipStatus("error");
      setZipError("Could not read file as a zip archive.");
      return;
    }

    // Search by basename to handle archives with a top-level folder
    const findByBasename = (name: string) => {
      const entries = Object.values(zip.files).filter(
        (f) => !f.dir && f.name.split("/").pop() === name
      );
      return entries[0] ?? null;
    };

    const worldFile = findByBasename("world.pacdata.json");
    const visualFile = findByBasename("visual_manifest.json");

    if (!worldFile) {
      setZipStatus("error");
      setZipError("world.pacdata.json not found in the archive.");
      return;
    }

    if (!visualFile) {
      setZipStatus("error");
      setZipError("visual_manifest.json not found in the archive.");
      return;
    }

    let worldText: string;
    try {
      worldText = await worldFile.async("string");
      JSON.parse(worldText);
    } catch {
      setZipStatus("error");
      setZipError("world.pacdata.json is present but contains invalid JSON.");
      return;
    }

    let visualText: string;
    try {
      visualText = await visualFile.async("string");
      JSON.parse(visualText);
    } catch {
      setZipStatus("error");
      setZipError("visual_manifest.json is present but contains invalid JSON.");
      return;
    }

    setImportWorldJson(worldText);
    setImportVisualJson(visualText);

    if (!importName) {
      const baseName = file.name.replace(/\.(pacexport|zip)$/i, "");
      if (baseName) setImportName(baseName);
    }

    setZipStatus("success");
  };
  
  const [instantiateOpen, setInstantiateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  const handleImport = () => {
    setImportError(null);

    if (!importName || !importWorldJson) {
      setImportError({ message: "Project name and World PacData JSON are required." });
      return;
    }

    // Detect concatenated JSON documents pasted into the world field and split them.
    let worldJson = importWorldJson;
    let visualJson = importVisualJson;

    if (!visualJson.trim()) {
      const split = trySplitConcatenatedJson(importWorldJson);
      if (split === null) {
        setImportError({ message: "World PacData JSON is not valid JSON.", details: "Check for syntax errors such as missing brackets, commas, or quotes." });
        return;
      }
      const [first, second] = split;
      worldJson = first;
      if (second) {
        visualJson = second;
        setImportWorldJson(first);
        setImportVisualJson(second);
        toast({ title: "Auto-split detected", description: "Found two JSON documents — split into pacdata and visual manifest automatically." });
      }
    }

    const payload: { name: string; worldPacdataJson: string; visualManifestJson?: string } = {
      name: importName,
      worldPacdataJson: worldJson,
    };
    if (visualJson.trim()) {
      payload.visualManifestJson = visualJson;
    }
    
    importMutation.mutate({ data: payload }, {
      onSuccess: (data) => {
        setImportOpen(false);
        resetImportDialog();
        toast({ title: "Import Successful", description: `Project ${data.project.name} imported.` });
        setLocation(`/projects/${data.project.id}`);
      },
      onError: (err: unknown) => {
        // ApiError stores the parsed response body in .data
        const apiData = (err as { data?: { error?: string; details?: string } })?.data;
        const message = apiData?.error ?? (err instanceof Error ? err.message : "Import failed");
        const details = apiData?.details;
        setImportError({ message, details });
      }
    });
  };

  const handleInstantiate = () => {
    if (!selectedTemplate || !projectName) {
      toast({ title: "Validation Error", description: "Project name is required.", variant: "destructive" });
      return;
    }
    
    instantiateMutation.mutate({ templateId: selectedTemplate, data: { name: projectName } }, {
      onSuccess: (data) => {
        setInstantiateOpen(false);
        setSelectedTemplate(null);
        setProjectName("");
        toast({ title: "Template Instantiated", description: `Project ${data.project.name} created.` });
        setLocation(`/projects/${data.project.id}`);
      },
      onError: (err: any) => {
        const errorMsg = (err as { error?: string })?.error || "Unknown error";
        toast({ title: "Instantiation Failed", description: errorMsg, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Topbar */}
      <header className="h-12 border-b border-border bg-card flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight text-sm">PacEngine Browser</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/engine" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            <Settings className="h-4 w-4" /> Engine Status
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Actions</h2>
            <div className="space-y-2">
              <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) resetImportDialog(); }}>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="w-full justify-start gap-2 h-9 text-xs">
                    <FileJson className="h-4 w-4" /> Import PacData
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[560px]">
                  <DialogHeader>
                    <DialogTitle>Import PacData v7 Export</DialogTitle>
                    <DialogDescription>
                      Upload a <code className="text-xs bg-muted px-1 rounded">.pacexport</code> or <code className="text-xs bg-muted px-1 rounded">.zip</code> file, or paste the JSON manually below.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Upload Export File</Label>
                      <div
                        className="border-2 border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const file = e.dataTransfer.files[0];
                          if (file) handleZipUpload(file);
                        }}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pacexport,.zip"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleZipUpload(file);
                            e.target.value = "";
                          }}
                        />
                        {zipStatus === "idle" && (
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Upload className="h-6 w-6" />
                            <span className="text-xs">Click or drag a <strong>.pacexport</strong> / <strong>.zip</strong> file here</span>
                          </div>
                        )}
                        {zipStatus === "success" && (
                          <div className="flex items-center justify-center gap-2 text-green-600 text-xs">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span><strong>{zipFileName}</strong> — files extracted successfully</span>
                          </div>
                        )}
                        {zipStatus === "error" && (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-2 text-destructive text-xs">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              <span><strong>{zipFileName}</strong></span>
                            </div>
                            <p className="text-xs text-destructive">{zipError}</p>
                            <p className="text-xs text-muted-foreground mt-1">Click to try a different file</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="relative flex items-center gap-2">
                      <div className="flex-1 border-t border-border" />
                      <span className="text-xs text-muted-foreground shrink-0">or paste manually</span>
                      <div className="flex-1 border-t border-border" />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="name">Project Name</Label>
                      <Input id="name" value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="e.g. my-imported-sim" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="world-json">
                        World PacData JSON <span className="text-destructive">*</span>
                      </Label>
                      <Textarea 
                        id="world-json" 
                        value={importWorldJson} 
                        onChange={(e) => { setImportWorldJson(e.target.value); setImportError(null); }} 
                        className="font-mono text-xs h-[120px]" 
                        placeholder='{"format": "pacai_pacdata_v7", "entities": [...], ...}'
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="visual-json">
                        Visual Manifest JSON <span className="text-muted-foreground text-xs">(optional)</span>
                      </Label>
                      <Textarea 
                        id="visual-json" 
                        value={importVisualJson} 
                        onChange={(e) => { setImportVisualJson(e.target.value); setImportError(null); }} 
                        className="font-mono text-xs h-[80px]" 
                        placeholder='{"visual_version": "1.0.0", "environment": {...}, ...}'
                      />
                    </div>
                  </div>

                  {importError && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2.5 flex gap-2.5 items-start -mt-1">
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1 min-w-0">
                        <p className="font-medium text-destructive">{importError.message}</p>
                        {importError.details && (
                          <p className="text-destructive/80 font-mono break-all whitespace-pre-wrap">{importError.details}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setImportOpen(false); resetImportDialog(); }}>Cancel</Button>
                    <Button onClick={handleImport} disabled={importMutation.isPending}>
                      {importMutation.isPending ? "Importing..." : "Import Project"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Workspace Stats</h2>
              {loadingStats ? (
                <div className="text-xs text-muted-foreground">Loading stats...</div>
              ) : statsData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-background p-2 rounded border border-border">
                      <div className="text-muted-foreground mb-1">Projects</div>
                      <div className="text-lg font-mono font-medium">{statsData.projectCount}</div>
                    </div>
                    <div className="bg-background p-2 rounded border border-border">
                      <div className="text-muted-foreground mb-1">Templates</div>
                      <div className="text-lg font-mono font-medium">{statsData.templateCount}</div>
                    </div>
                    <div className="bg-background p-2 rounded border border-border">
                      <div className="text-muted-foreground mb-1">Entities</div>
                      <div className="text-lg font-mono font-medium">{statsData.totalEntities}</div>
                    </div>
                    <div className="bg-background p-2 rounded border border-border">
                      <div className="text-muted-foreground mb-1">Agents</div>
                      <div className="text-lg font-mono font-medium">{statsData.totalAgents}</div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">PacData Versions</div>
                    <div className="space-y-1">
                      {statsData.byPacdataVersion.map(v => (
                        <div key={v.version} className="flex justify-between text-xs bg-background p-1.5 rounded border border-border">
                          <span>v{v.version}</span>
                          <span className="font-mono">{v.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <ScrollArea className="flex-1 bg-background">
          <div className="p-8 max-w-6xl mx-auto space-y-12">
            
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" /> Recent Projects
                </h2>
              </div>
              
              {loadingProjects ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1,2,3].map(i => <div key={i} className="h-32 bg-card rounded-md border border-border animate-pulse" />)}
                </div>
              ) : projectsData?.projects.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground">
                  No projects found. Import one or use a template.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projectsData?.projects.map(project => (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer bg-card overflow-hidden group">
                        <div className="h-1 w-full" style={{ backgroundColor: project.accentColor }} />
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            {project.name}
                            <Badge variant="secondary" className="font-mono text-[10px]">{project.fileSizeBytes}B</Badge>
                          </CardTitle>
                          <CardDescription className="text-xs truncate">{project.filename}</CardDescription>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1" title="Entities"><Box className="h-3 w-3"/> {project.entityCount}</span>
                            <span className="flex items-center gap-1" title="Agents"><Activity className="h-3 w-3"/> {project.agentCount}</span>
                            <span className="flex items-center gap-1" title="Scenarios"><Hash className="h-3 w-3"/> {project.scenarioCount}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Play className="h-5 w-5 text-accent" /> Templates
                </h2>
              </div>
              
              {loadingTemplates ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1,2,3].map(i => <div key={i} className="h-40 bg-card rounded-md border border-border animate-pulse" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templatesData?.templates.map(template => (
                    <Card key={template.id} className="h-full flex flex-col bg-card border-border overflow-hidden">
                      <div className="h-1 w-full" style={{ backgroundColor: template.accentColor }} />
                      <CardHeader className="pb-2 flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <Badge className="text-[10px] font-semibold bg-secondary text-secondary-foreground hover:bg-secondary">{template.category}</Badge>
                        </div>
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        <CardDescription className="text-xs text-foreground/70 mt-1">{template.tagline}</CardDescription>
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{template.description}</p>
                      </CardHeader>
                      <CardFooter className="pt-2 pb-4 bg-background/50 border-t border-border flex justify-between items-center">
                        <div className="flex gap-3 text-[10px] text-muted-foreground font-mono">
                          <span>{template.agentCount} Agents</span>
                          <span>{template.scenarioCount} Scen</span>
                        </div>
                        <Dialog open={instantiateOpen && selectedTemplate === template.id} onOpenChange={(open) => {
                          if (open) {
                            setSelectedTemplate(template.id);
                            setInstantiateOpen(true);
                          } else {
                            setInstantiateOpen(false);
                            setSelectedTemplate(null);
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="secondary" className="h-7 text-xs">Use Template</Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>Instantiate {template.name}</DialogTitle>
                              <DialogDescription>Provide a name for your new project.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid gap-2">
                                <Label htmlFor="new-project-name">Project Name</Label>
                                <Input 
                                  id="new-project-name" 
                                  value={projectName} 
                                  onChange={(e) => setProjectName(e.target.value)} 
                                  placeholder={`${template.id}-project`} 
                                  autoFocus
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setInstantiateOpen(false)}>Cancel</Button>
                              <Button onClick={handleInstantiate} disabled={instantiateMutation.isPending}>
                                {instantiateMutation.isPending ? "Creating..." : "Create Project"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </section>
            
          </div>
        </ScrollArea>
      </div>
      
      {/* Status Bar */}
      <footer className="h-6 bg-card border-t border-border flex items-center px-4 justify-between text-[10px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          <span>PacEngine Editor v1.0.0</span>
          <span>Ready</span>
        </div>
        <div>
          Deterministic Execution Engine
        </div>
      </footer>
    </div>
  );
}
