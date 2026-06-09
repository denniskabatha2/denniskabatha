import { useState, useEffect, useRef } from "react";
import AppLayout from "@/components/layout";
import { useLocation } from "wouter";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  useGetSession, 
  useGetMessages, 
  useGetFileTree,
  useListModels,
  FileTreeNode
} from "@workspace/api-client-react";
import { Terminal, Send, Loader2, ChevronRight, ChevronDown, FileCode2, Folder, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// A recursive component to render the file tree
function FileTreeView({ node, depth = 0 }: { node: FileTreeNode, depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  
  if (node.type === "directory") {
    return (
      <div className="select-none">
        <div 
          className="flex items-center gap-1 py-1 px-2 hover:bg-white/5 cursor-pointer text-muted-foreground hover:text-foreground font-mono text-xs transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} className="text-primary/70" />
          <span className="truncate">{node.name}</span>
        </div>
        {expanded && node.children?.map((child, i) => (
          <FileTreeView key={`${child.path}-${i}`} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }
  
  return (
    <div 
      className="flex items-center gap-2 py-1 px-2 hover:bg-white/5 cursor-pointer text-muted-foreground hover:text-foreground font-mono text-xs transition-colors"
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
    >
      <FileCode2 size={14} />
      <span className="truncate">{node.name}</span>
    </div>
  );
}

export default function ChatPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const sessionIdStr = searchParams.get("session");
  const sessionId = sessionIdStr ? parseInt(sessionIdStr, 10) : undefined;
  
  const { data: session } = useGetSession(sessionId || 0, { query: { enabled: !!sessionId } });
  const { data: messages, refetch: refetchMessages } = useGetMessages(sessionId || 0, { query: { enabled: !!sessionId } });
  const { data: models } = useListModels();
  
  const getFileTreeMutation = useGetFileTree();
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Terminal logs state
  const [terminalLogs, setTerminalLogs] = useState<{text: string, type: 'stdout'|'stderr'}[]>([]);

  // Load file tree if workspace is set
  useEffect(() => {
    if (session?.workspacePath) {
      getFileTreeMutation.mutate({ data: { path: session.workspacePath } }, {
        onSuccess: (data) => setFileTree(data)
      });
    }
  }, [session?.workspacePath]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !sessionId || !session?.model) return;
    
    const messageToSend = input;
    setInput("");
    setIsStreaming(true);
    setStreamedText("");
    
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: messageToSend, model: session.model })
      });
      
      if (!response.body) throw new Error("No response body");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.token) {
                setStreamedText(prev => prev + json.token);
              }
              if (json.done) {
                setIsStreaming(false);
                setStreamedText("");
                refetchMessages();
              }
            } catch (e) {
              console.error("Error parsing SSE JSON", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
      setIsStreaming(false);
    }
  };

  if (!sessionId) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center bg-background">
          <div className="text-center font-mono space-y-4 max-w-md p-8 border border-border rounded-lg bg-card shadow-2xl">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Zap size={32} className="text-primary" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground uppercase">NO ACTIVE PROTOCOL</h2>
            <p className="text-muted-foreground text-sm">Select a session from the history or initialize a new combat zone to proceed.</p>
            <Button onClick={() => window.location.href = '/sessions'} className="w-full mt-4 font-mono font-bold tracking-wider">
              ACCESS LOGS
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ResizablePanelGroup direction="horizontal" className="h-full border-none">
        
        {/* Left Sidebar - File Tree */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-sidebar border-r border-border flex flex-col">
          <div className="p-3 border-b border-border bg-card/50 flex items-center justify-between shrink-0">
            <span className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider">WORKSPACE_TREE</span>
          </div>
          <div className="flex-1 overflow-auto py-2 custom-scrollbar">
             {session?.workspacePath ? (
               fileTree ? (
                 <FileTreeView node={fileTree} />
               ) : (
                 <div className="text-xs font-mono text-muted-foreground italic p-4 text-center">Loading tree...</div>
               )
             ) : (
               <div className="text-xs font-mono text-muted-foreground italic p-4 text-center">No workspace mounted</div>
             )}
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle className="bg-border w-1" />

        {/* Center - Chat & Terminal */}
        <ResizablePanel defaultSize={80}>
          <ResizablePanelGroup direction="vertical">
            
            {/* Chat Area */}
            <ResizablePanel defaultSize={70} className="flex flex-col bg-background">
              <div className="px-4 py-2 border-b border-border bg-card flex justify-between items-center shrink-0">
                <div className="font-mono text-sm font-semibold text-primary uppercase tracking-wider">{session?.name || "Session"}</div>
                <div className="flex items-center gap-2">
                  <Select value={session?.model} disabled>
                    <SelectTrigger className="h-7 w-48 font-mono text-xs bg-sidebar border-border">
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                  </Select>
                </div>
              </div>
              
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-6 pb-20 max-w-4xl mx-auto">
                  {messages?.map((msg, i) => {
                    const isTool = msg.role === 'tool' || msg.toolCalls;
                    if (isTool) {
                      return (
                        <div key={msg.id} className="max-w-[85%] mr-auto">
                          <div className="text-[10px] font-mono text-primary/70 uppercase px-1 mb-1">
                            SYSTEM_OPERATION
                          </div>
                          <div className="p-3 rounded border border-primary/30 bg-primary/5 text-foreground font-mono text-xs overflow-x-auto shadow-sm">
                            <pre className="whitespace-pre-wrap">{msg.content || msg.toolCalls}</pre>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className={cn(
                        "flex flex-col gap-1 max-w-[85%]",
                        msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                      )}>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase px-1">
                          {msg.role}
                        </div>
                        <div className={cn(
                          "p-4 rounded font-mono text-sm whitespace-pre-wrap shadow-sm leading-relaxed",
                          msg.role === "user" 
                            ? "bg-primary/20 border border-primary/30 text-foreground" 
                            : "bg-card border border-border text-foreground"
                        )}>
                          {msg.content}
                        </div>
                      </div>
                    );
                  })}
                  
                  {isStreaming && (
                    <div className="flex flex-col gap-1 max-w-[85%] mr-auto items-start">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase px-1 flex items-center gap-2">
                        assistant <Loader2 size={10} className="animate-spin text-primary" />
                      </div>
                      <div className="p-4 rounded font-mono text-sm whitespace-pre-wrap shadow-sm bg-card border border-primary text-foreground relative">
                        {streamedText}
                        <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse align-middle"></span>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              
              <div className="p-4 border-t border-border bg-card shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.2)] z-10 relative">
                <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative flex items-center">
                  <div className="absolute left-4 text-primary/50 pointer-events-none font-mono">$&gt;</div>
                  <Input 
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="ENTER DIRECTIVE..."
                    className="pl-10 pr-12 py-6 font-mono text-sm bg-background border-border focus-visible:ring-primary shadow-inner uppercase tracking-wider"
                    disabled={isStreaming}
                  />
                  <Button type="submit" size="icon" disabled={!input.trim() || isStreaming} className="absolute right-2 h-8 w-8 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-all">
                    {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </form>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-border h-1" />

            {/* Bottom - Terminal */}
            <ResizablePanel defaultSize={30} className="bg-background flex flex-col border-t border-border">
              <div className="px-3 py-1 bg-sidebar border-b border-border flex items-center gap-2 shrink-0 shadow-sm">
                <Terminal size={14} className="text-muted-foreground" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">STDOUT_STREAM</span>
              </div>
              <div className="flex-1 overflow-auto p-3 font-mono text-xs custom-scrollbar bg-[#050505]">
                {terminalLogs.length === 0 ? (
                  <>
                    <div className="text-primary/70 mb-1">Agentic Coder OS [Version 1.0.0]</div>
                    <div className="text-primary/70 mb-4">(c) Local Inference Environment. All rights reserved.</div>
                    <div className="text-muted-foreground">Waiting for execution...</div>
                  </>
                ) : (
                  terminalLogs.map((log, i) => (
                    <div key={i} className={log.type === 'stderr' ? 'text-destructive' : 'text-foreground/80'}>
                      {log.text}
                    </div>
                  ))
                )}
              </div>
            </ResizablePanel>

          </ResizablePanelGroup>
        </ResizablePanel>

      </ResizablePanelGroup>
    </AppLayout>
  );
}