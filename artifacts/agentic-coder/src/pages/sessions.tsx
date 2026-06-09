import { useState } from "react";
import { Link } from "wouter";
import AppLayout from "@/components/layout";
import { 
  useListSessions, 
  useCreateSession, 
  useDeleteSession,
  useListModels,
  useListWorkspaces,
  getListSessionsQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from "date-fns";
import { MessageSquare, Trash2, Plus, ArrowRight, Cpu, FolderOpen } from "lucide-react";

export default function SessionsPage() {
  const { data: sessions, isLoading } = useListSessions();
  const deleteSession = useDeleteSession();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleDelete = (id: number) => {
    if (confirm("Delete this session?")) {
      deleteSession.mutate({ sessionId: id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        }
      });
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden p-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <HistoryIcon /> Sessions
            </h1>
            <p className="text-muted-foreground mt-1 font-mono text-sm">Active combat zones and previous engagements</p>
          </div>
          
          <CreateSessionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        </div>

        <div className="flex-1 overflow-auto pr-4 custom-scrollbar">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-40 rounded-lg border border-border bg-card/50 animate-pulse" />
              ))}
            </div>
          ) : sessions?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 border border-dashed border-border rounded-lg bg-card/20">
              <MessageSquare className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">No active sessions</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">Create a new session to begin delegating tasks to your local model.</p>
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus size={16} /> Initialize Session
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {sessions?.map(session => (
                <div key={session.id} className="group flex flex-col bg-card border border-border hover:border-primary/50 rounded-lg p-5 transition-all duration-200 hover:shadow-[0_0_15px_rgba(0,200,255,0.1)] relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-lg truncate pr-4 text-foreground">{session.name}</h3>
                    <button 
                      onClick={(e) => { e.preventDefault(); handleDelete(session.id); }}
                      className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="space-y-2 mb-6 flex-1">
                    <div className="flex items-center text-sm text-muted-foreground font-mono">
                      <Cpu size={14} className="mr-2 text-primary" />
                      <span className="truncate">{session.model}</span>
                    </div>
                    {session.workspacePath && (
                      <div className="flex items-center text-sm text-muted-foreground font-mono">
                        <FolderOpen size={14} className="mr-2 text-primary" />
                        <span className="truncate">{session.workspacePath}</span>
                      </div>
                    )}
                    <div className="flex items-center text-sm text-muted-foreground font-mono">
                      <MessageSquare size={14} className="mr-2 text-primary" />
                      <span>{session.messageCount} messages</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                    <span className="text-xs text-muted-foreground font-mono opacity-60">
                      {format(new Date(session.updatedAt), "MMM d, HH:mm")}
                    </span>
                    <Link href={`/?session=${session.id}`}>
                      <Button variant="secondary" size="sm" className="gap-2 font-mono text-xs">
                        ENTER <ArrowRight size={14} />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function CreateSessionDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { data: models } = useListModels();
  const { data: workspaces } = useListWorkspaces();
  const createSession = useCreateSession();
  const queryClient = useQueryClient();
  
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [workspace, setWorkspace] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !model) return;
    
    createSession.mutate({ 
      data: { name, model, workspacePath: workspace || undefined } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        onOpenChange(false);
        setName("");
        setModel("");
        setWorkspace("");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-mono shadow-[0_0_15px_rgba(0,200,255,0.2)]">
          <Plus size={16} /> NEW_SESSION
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border-primary/20 shadow-[0_0_40px_rgba(0,200,255,0.1)]">
        <DialogHeader>
          <DialogTitle className="font-mono text-xl flex items-center gap-2">
            <TerminalIcon /> INIT_SESSION
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Designation</label>
            <Input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. Frontend Refactor"
              className="font-mono bg-background"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Model Core</label>
            <Select value={model} onValueChange={setModel} required>
              <SelectTrigger className="font-mono bg-background">
                <SelectValue placeholder="Select model..." />
              </SelectTrigger>
              <SelectContent>
                {models?.map(m => (
                  <SelectItem key={m.name} value={m.name} className="font-mono">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Workspace Target (Optional)</label>
            <Select value={workspace} onValueChange={setWorkspace}>
              <SelectTrigger className="font-mono bg-background">
                <SelectValue placeholder="Select workspace..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {workspaces?.map(w => (
                  <SelectItem key={w.path} value={w.path} className="font-mono">
                    {w.name} ({w.path})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="pt-4 flex justify-end gap-2 border-t border-border">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createSession.isPending} className="font-mono">
              {createSession.isPending ? "INITIALIZING..." : "LAUNCH"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryIcon() {
  return <History className="text-primary" size={28} />;
}
function TerminalIcon() {
  return <Terminal className="text-primary" size={20} />;
}
import { History, Terminal } from "lucide-react";