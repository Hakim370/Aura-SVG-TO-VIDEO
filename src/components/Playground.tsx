import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';
import { 
  LucideTerminal, 
  LucidePlay, 
  LucideTrash2, 
  LucideCopy, 
  LucideRefreshCcw, 
  LucideZap, 
  LucideSend, 
  LucideCode, 
  LucideSparkles,
  LucideEye,
  LucideDownload,
  LucideSettings2,
  LucideType
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PlaygroundProps {
  onSendToAura: (svg: string) => void;
}

const SAMPLES = [
  {
    name: 'Aura Core',
    code: `<svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="800" fill="#020617"/>
  <defs>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#00d4ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="400" cy="400" r="300" fill="url(#aura)">
    <animate attributeName="opacity" values="0.2;0.8;0.2" dur="4s" repeatCount="indefinite"/>
  </circle>
  <g transform="translate(400, 400)">
    <circle r="150" fill="none" stroke="#00d4ff" stroke-width="2" stroke-dasharray="10 5">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite"/>
    </circle>
    <circle r="100" fill="none" stroke="#9b4dff" stroke-width="1">
       <animate attributeName="r" values="100;120;100" dur="3s" repeatCount="indefinite"/>
    </circle>
    <path d="M-50,0 L50,0 M0,-50 L0,50" stroke="#ff3d7f" stroke-width="3">
       <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="4s" repeatCount="indefinite"/>
    </path>
  </g>
</svg>`
  },
  {
    name: 'Data Stream',
    code: `<svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <rect width="1920" height="1080" fill="#000"/>
  <g stroke="#00d4ff" stroke-opacity="0.2">
    <line x1="100" y1="0" x2="100" y2="1080" />
    <line x1="200" y1="0" x2="200" y2="1080" />
    <line x1="300" y1="0" x2="300" y2="1080" />
    <line x1="400" y1="0" x2="400" y2="1080" />
    <line x1="500" y1="0" x2="500" y2="1080" />
    <line x1="600" y1="0" x2="600" y2="1080" />
  </g>
  <rect x="0" y="0" width="1920" height="100" fill="white" opacity="0.1">
    <animate attributeName="y" values="-100;1080" dur="2s" repeatCount="indefinite"/>
  </rect>
  <text x="960" y="540" fill="#00d4ff" font-family="monospace" font-size="200" font-weight="bold" text-anchor="middle" letter-spacing="40" opacity="0.5">
    SYSTEM_ONLINE
    <animate attributeName="opacity" values="0.1;0.6;0.1" dur="1s" repeatCount="indefinite"/>
  </text>
</svg>`
  },
  {
    name: 'Hex Grid',
    code: `<svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="800" fill="#0a0a0a"/>
  <g transform="translate(400, 400)">
    <polygon points="0,-150 130,-75 130,75 0,150 -130,75 -130,-75" fill="none" stroke="#00d4ff" stroke-width="4">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite"/>
    </polygon>
    <polygon points="0,-120 104,-60 104,60 0,120 -104,60 -104,-60" fill="none" stroke="#9b4dff" stroke-width="2" opacity="0.5">
      <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="15s" repeatCount="indefinite"/>
    </polygon>
  </g>
</svg>`
  }
];

export function Playground({ onSendToAura }: PlaygroundProps) {
  const [code, setCode] = useState(SAMPLES[0].code);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState(1);
  const [status, setStatus] = useState('IDLE — READY TO EXPERIMENT');
  const [isRendered, setIsRendered] = useState(false);
  const [autoRun, setAutoRun] = useState(true);
  const [fontSize, setFontSize] = useState(12);
  
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineNumsRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    updateLineNums();
    if (autoRun) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(runPreview, 800);
    }
  }, [code, autoRun]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [previewURL]);

  const updateLineNums = () => {
    const lines = code.split('\n').length;
    setLineCount(lines);
  };

  const handleScroll = () => {
    if (editorRef.current && lineNumsRef.current) {
      lineNumsRef.current.scrollTop = editorRef.current.scrollTop;
    }
  };

  const formatCode = () => {
    try {
      let formatted = code
        .replace(/>\s+</g, '>\n<') // Add newlines between tags
        .replace(/^\s+/gm, ''); // Remove existing indentation
      
      const lines = formatted.split('\n');
      let depth = 0;
      const final = lines.map(line => {
        if (line.match(/<\/\w+/)) depth = Math.max(0, depth - 1);
        const spaced = '  '.repeat(depth) + line;
        if (line.match(/<\w+[^>]*[^\/]>$/)) depth += 1;
        return spaced;
      }).join('\n');
      
      setCode(final);
      toast.success('Code formatted');
    } catch (e) {
      toast.error('Formatting error');
    }
  };

  const runPreview = () => {
    if (!code.trim()) {
      setStatus('IDLE — PASTE SVG');
      return;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin:0; padding:0; box-sizing:border-box }
    html, body { width:100%; height:100%; background:#000; overflow:hidden; display:flex; align-items:center; justify-content:center }
    svg { width: 100%; height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  ${code}
</body>
</html>`;

    if (previewURL) URL.revokeObjectURL(previewURL);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setPreviewURL(url);
    setIsRendered(true);
    setStatus('LIVE — PREVIEW ACTIVE');
  };

  const clearEditor = () => {
    setCode('');
    setPreviewURL(null);
    setIsRendered(false);
    setStatus('CLEARED');
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast.success('Copied to clipboard');
  };

  const downloadSVG = () => {
    if (!code.trim()) return;
    const blob = new Blob([code], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aura-playground-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('SVG Downloaded');
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-[#03070b]">
      {/* Dynamic Header */}
      <div className="pg-controls border-b border-border-b1 bg-s1/30 backdrop-blur-md px-4 md:px-9 py-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-cyan-glow/10 border border-cyan-glow/20 flex items-center justify-center text-cyan-glow shadow-[0_0_20px_rgba(0,212,255,0.05)]">
               <LucideTerminal size={20} />
             </div>
             <div>
               <h2 className="font-bold text-xs tracking-[2px] text-white uppercase leading-none mb-1">SVG Playground</h2>
               <div className="flex items-center gap-2">
                 <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isRendered ? "bg-cyan-glow" : "bg-text-dim")} />
                 <span className="font-mono text-[8px] text-text-dim tracking-widest uppercase">{status}</span>
               </div>
             </div>
          </div>
          
          <div className="h-8 w-px bg-border-b1 hidden md:block" />
          
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
             {SAMPLES.map((s, idx) => (
               <button 
                 key={idx}
                 onClick={() => { setCode(s.code); setStatus(`LOADED: ${s.name}`); }}
                 className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-[9px] font-mono font-bold tracking-wider text-text-dim hover:text-cyan-glow hover:bg-cyan-glow/5 hover:border-cyan-glow/20 transition-all whitespace-nowrap uppercase"
               >
                 {s.name}
               </button>
             ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
           <button 
             onClick={() => setFontSize(prev => prev === 12 ? 14 : 12)}
             className="p-2 rounded-lg bg-white/5 border border-white/10 text-text-dim hover:text-white transition-all group relative"
             title="Toggle Font Size"
           >
             <LucideType size={16} />
             <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black border border-border-b1 px-2 py-1 text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">FONT: {fontSize}px</span>
           </button>
           
           <div className="flex items-center gap-2 px-3 py-2 bg-black/40 border border-border-b1 rounded-xl">
             <span className="font-mono text-[8px] text-text-dim tracking-wider uppercase">Auto-Preview</span>
             <button 
               onClick={() => setAutoRun(!autoRun)}
               className={cn(
                 "w-8 h-4 rounded-full relative transition-all border",
                 autoRun ? "bg-cyan-glow/20 border-cyan-glow/50" : "bg-white/5 border-white/20"
               )}
             >
               <div className={cn(
                 "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                 autoRun ? "left-4.5 bg-cyan-glow shadow-[0_0_8px_rgba(0,212,255,0.8)]" : "left-0.5 bg-text-dim"
               )} />
             </button>
           </div>
        </div>
      </div>

      <div className="pg-workspace grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0 bg-bg">
        {/* Editor Area */}
        <div className="editor-panel flex flex-col border-r border-border-b1 overflow-hidden">
          <div className="panel-header px-6 py-3 border-b border-white/5 flex items-center justify-between bg-black/20">
             <div className="flex items-center gap-2 font-mono text-[9px] font-bold text-text-dim tracking-[2px] uppercase">
               <LucideCode size={14} className="text-cyan-glow" />
               Source Code
             </div>
             <div className="flex items-center gap-2">
               <button onClick={formatCode} className="pg-action-btn flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold text-cyan-glow hover:bg-cyan-glow/10 transition-all uppercase">
                 <LucideSparkles size={12} /> Format
               </button>
               <button onClick={clearEditor} className="pg-action-btn p-2 rounded-lg text-pink-glow hover:bg-pink-glow/10 transition-all uppercase">
                 <LucideTrash2 size={12} />
               </button>
             </div>
          </div>
          
          <div className="flex-1 relative overflow-hidden bg-[#050c14]">
             <div ref={lineNumsRef} className="pg-line-nums absolute left-0 top-0 bottom-0 w-[48px] bg-black/40 border-r border-white/5 py-6 px-2 font-mono text-[10px] leading-[1.8] text-cyan-glow/20 text-right select-none pointer-events-none custom-scrollbar overflow-hidden">
                {Array.from({ length: lineCount }).map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
             </div>
             <textarea 
               ref={editorRef}
               value={code}
               onChange={(e) => setCode(e.target.value)}
               onScroll={handleScroll}
               spellCheck={false}
               className="w-full h-full bg-transparent text-[#a8d8ff] font-mono leading-[1.8] p-6 pl-[64px] outline-none resize-none tab-[2] custom-scrollbar selection:bg-cyan-glow/20 transition-all"
               style={{ fontSize: `${fontSize}px` }}
               placeholder="Paste or type SVG code here…"
             />
          </div>

          <div className="panel-footer p-4 border-t border-white/5 bg-black/20">
             <button 
               onClick={() => onSendToAura(code)}
               className="w-full py-4 bg-gradient-to-r from-cyan-glow/80 to-purple-glow/80 hover:from-cyan-glow hover:to-purple-glow text-white font-bold text-[10px] tracking-[4px] uppercase border border-white/10 rounded-2xl transition-all shadow-[0_10px_30px_rgba(0,0,0,0.3)] flex items-center justify-center gap-3 group"
             >
               <LucideSend size={16} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
               Push to Aura Engine
             </button>
          </div>
        </div>

        {/* Render Panel */}
        <div className="render-panel flex flex-col overflow-hidden bg-black/40">
           <div className="panel-header px-6 py-3 border-b border-white/5 flex items-center justify-between bg-black/20">
             <div className="flex items-center gap-2 font-mono text-[9px] font-bold text-text-dim tracking-[2px] uppercase">
               <LucideEye size={14} className="text-purple-glow" />
               Canvas Preview
             </div>
             <div className="flex items-center gap-2">
               <button onClick={downloadSVG} className="pg-action-btn flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-mono font-bold text-white hover:bg-white/10 transition-all uppercase">
                 <LucideDownload size={12} /> Download
               </button>
               <button onClick={runPreview} className="pg-btn-accent flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-glow to-purple-glow text-white text-[9px] font-mono font-bold hover:scale-105 transition-all shadow-lg uppercase">
                 <LucideRefreshCcw size={12} /> Refresh
               </button>
             </div>
          </div>

          <div className="flex-1 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.03)_0%,transparent_100%)] relative">
             <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:32px_32px]" />
             
             {!isRendered ? (
               <div className="h-full flex flex-col items-center justify-center gap-6 text-text-dim animate-pulse">
                  <div className="w-20 h-20 rounded-3xl border-2 border-dashed border-white/10 flex items-center justify-center">
                    <LucidePlay size={32} />
                  </div>
                  <span className="font-mono text-[9px] tracking-[4px] uppercase opacity-40">Ready to Render</span>
               </div>
             ) : (
               <div className="w-full h-full p-8 flex items-center justify-center relative z-10 group/frame">
                  <div className="w-full h-full bg-[#050c14] rounded-2xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] border border-white/5 overflow-hidden relative">
                    <iframe 
                      src={previewURL || 'about:blank'} 
                      className="w-full h-full border-none block"
                      title="SVG Render View"
                    />
                    
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover/frame:opacity-100 transition-opacity">
                       <div className="px-2 py-1 bg-black/80 backdrop-blur rounded-lg border border-white/10 font-mono text-[8px] text-cyan-glow">
                         {code.length} bytes
                       </div>
                    </div>
                  </div>
               </div>
             )}
          </div>

          <div className="panel-footer p-6 border-t border-white/5 bg-black/40">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="feature-card p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex gap-4 hover:bg-white/[0.04] transition-all">
                   <div className="w-10 h-10 rounded-xl bg-purple-glow/10 flex items-center justify-center text-purple-glow shrink-0">
                     <LucideZap size={18} />
                   </div>
                   <div>
                     <h4 className="text-[10px] font-bold text-white mb-1 uppercase tracking-wider italic">Motion Logic</h4>
                     <p className="text-[9px] text-text-dim leading-relaxed font-mono uppercase tracking-tight">Full SMIL animation support. Test complex transforms & color cycles instantly.</p>
                   </div>
                </div>
                <div className="feature-card p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex gap-4 hover:bg-white/[0.04] transition-all">
                   <div className="w-10 h-10 rounded-xl bg-cyan-glow/10 flex items-center justify-center text-cyan-glow shrink-0">
                     <LucideSettings2 size={18} />
                   </div>
                   <div>
                     <h4 className="text-[10px] font-bold text-white mb-1 uppercase tracking-wider italic">Video Ready</h4>
                     <p className="text-[9px] text-text-dim leading-relaxed font-mono uppercase tracking-tight">Optimized for AURA engine. Resolution, FPS, and Duration are handled after push.</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
