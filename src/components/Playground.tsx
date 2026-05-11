import { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { LucideTerminal, LucidePlay, LucideTrash2, LucideCopy, LucideRefreshCcw, LucideZap, LucideSend } from 'lucide-react';

interface PlaygroundProps {
  onSendToAura: (svg: string) => void;
}

const PG_SAMPLE = `<svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <rect width="1920" height="1080" fill="#070d14"/>
  
  <g transform="translate(960, 540)">
    <!-- GRID LINES -->
    <path d="M-500,0 L500,0 M0,-500 L0,500" stroke="#00d4ff" stroke-width="1" opacity="0.1"/>
    
    <!-- MAIN CIRCLE -->
    <circle r="200" fill="none" stroke="#00d4ff" stroke-width="2" stroke-dasharray="10, 5">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite"/>
    </circle>
    
    <circle r="180" fill="none" stroke="#9b4dff" stroke-width="1" opacity="0.5">
      <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="20s" repeatCount="indefinite"/>
    </circle>

    <!-- CORE PULSE -->
    <circle r="40" fill="#00d4ff">
      <animate attributeName="r" values="40;60;40" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/>
    </circle>

    <!-- FLOATING BITS -->
    <g>
      <rect x="220" y="-10" width="40" height="20" fill="#ff3d7f">
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite"/>
      </rect>
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite"/>
    </g>
  </g>

  <!-- SCAN LINE -->
  <rect width="1920" height="2" fill="#00d4ff" opacity="0.3">
    <animate attributeName="y" values="0;1080;0" dur="4s" repeatCount="indefinite"/>
  </rect>

  <text x="960" y="850" fill="#e8f4ff" font-family="Outfit" font-size="40" font-weight="bold" text-anchor="middle" letter-spacing="10">
    AURA ENGINE
    <animate attributeName="opacity" values="1;0.5;1" dur="1s" repeatCount="indefinite"/>
  </text>
</svg>`;

export function Playground({ onSendToAura }: PlaygroundProps) {
  const [code, setCode] = useState(PG_SAMPLE);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState(1);
  const [status, setStatus] = useState('IDLE — paste SVG to begin');
  const [isRendered, setIsRendered] = useState(false);
  
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineNumsRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    updateLineNums();
  }, [code]);

  const updateLineNums = () => {
    const lines = code.split('\n').length;
    setLineCount(lines);
  };

  const handleScroll = () => {
    if (editorRef.current && lineNumsRef.current) {
      lineNumsRef.current.scrollTop = editorRef.current.scrollTop;
    }
  };

  const runPreview = () => {
    if (!code.trim()) {
      setStatus('NO SVG CODE — paste something first');
      return;
    }

    if (!code.includes('<svg')) {
      setStatus('INVALID — must contain an <svg> element');
      return;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin:0; padding:0; box-sizing:border-box }
    html, body { width:100%; height:100%; background:#000; display:flex; align-items:center; justify-content:center; overflow:hidden }
    svg { max-width:100%; max-height:100%; width:auto; height:auto }
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
    setStatus('SVG VALID — preview running');
  };

  const clearEditor = () => {
    setCode('');
    setPreviewURL(null);
    setIsRendered(false);
    setStatus('IDLE — paste SVG to begin');
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setStatus('SVG CODE COPIED TO CLIPBOARD');
    setTimeout(() => setStatus('SVG VALID — preview running'), 2000);
  };

  const downloadSVG = () => {
    if (!code.trim()) return;
    const blob = new Blob([code], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aura-design.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('SVG FILE DOWNLOADED');
    setTimeout(() => setStatus('SVG VALID — preview running'), 2000);
  };

  const loadSample = () => {
    setCode(PG_SAMPLE);
    runPreview();
  };

  return (
    <div className="flex flex-col flex-1 h-full">
      <div className="pg-info-row flex gap-2.5 px-4 md:px-9 pt-6 flex-wrap">
        <div className="pg-info-chip flex items-center gap-2 font-mono text-[8px] text-text-dim px-3 py-1.5 bg-cyan-glow/5 border border-border-b1 rounded-lg tracking-wider">
          ✦ <b className="text-cyan-glow uppercase">SVG Playground</b> — write or paste SVG code and see it live
        </div>
        <div className="pg-info-chip flex items-center gap-2 font-mono text-[8px] text-text-dim px-3 py-1.5 bg-cyan-glow/5 border border-border-b1 rounded-lg tracking-wider">
          🎞 <b className="text-cyan-glow uppercase">Animations supported</b> — CSS keyframes & SMIL
        </div>
        <div className="pg-info-chip flex items-center gap-2 font-mono text-[8px] text-text-dim px-3 py-1.5 bg-cyan-glow/5 border border-border-b1 rounded-lg tracking-wider">
          ▶ <b className="text-cyan-glow uppercase">Send to AURA</b> — convert your SVG to WebM video
        </div>
      </div>

      <div className="pg-wrap grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 md:p-9 items-start">
        {/* Editor Panel */}
        <div className="pg-card bg-s1 border border-border-b1 rounded-[18px] overflow-hidden flex flex-col h-[600px] shadow-2xl">
          <div className="pg-card-head px-5 py-3.5 border-b border-border-b1 flex items-center justify-between bg-gradient-to-r from-cyan-glow/5 to-transparent">
            <div className="pg-card-title flex items-center gap-2.5 font-mono text-[8px] font-bold tracking-[3px] text-text-dim uppercase">
              <div className="step-num w-6 h-6 rounded-lg bg-cyan-glow/15 border border-cyan-glow/25 flex items-center justify-center text-cyan-glow">01</div>
              SVG CODE EDITOR
            </div>
            <div className="pg-actions flex items-center gap-2">
              <button onClick={copyCode} className="pg-btn font-mono text-[8px] font-bold tracking-wider px-3 py-1 rounded bg-cyan-glow/5 border border-cyan-glow/25 text-cyan-glow hover:bg-cyan-glow/15 uppercase transition-all">COPY</button>
              <button onClick={clearEditor} className="pg-btn font-mono text-[8px] font-bold tracking-wider px-3 py-1 rounded bg-pink-glow/5 border border-pink-glow/25 text-pink-glow hover:bg-pink-glow/15 uppercase transition-all">CLEAR</button>
              <button onClick={runPreview} className="pg-btn font-mono text-[8px] font-bold tracking-wider px-3 py-1 rounded bg-gradient-to-r from-cyan-glow to-purple-glow text-white shadow-[0_2px_12px_rgba(0,212,255,0.25)] hover:scale-105 uppercase transition-all">▶ RUN</button>
            </div>
          </div>
          
          <div className="pg-editor-wrap flex-1 relative overflow-hidden bg-[#050c14]">
            <div ref={lineNumsRef} className="pg-line-nums absolute left-0 top-0 bottom-0 w-[42px] bg-black/35 border-r border-cyan-glow/10 py-[18px] px-2 font-mono text-xs leading-[1.7] text-cyan-glow/20 text-right select-none pointer-events-none custom-scrollbar overflow-hidden">
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
              className="w-full h-full bg-transparent text-[#a8d8ff] font-mono text-xs leading-[1.7] p-4 pl-[54px] outline-none resize-none tab-[2] custom-scrollbar selection:bg-cyan-glow/20"
              placeholder="Paste or type your SVG code here…"
            />
          </div>

          <div className="pg-status-bar px-4 py-2 border-t border-border-b1 bg-black/30 flex items-center justify-between">
            <div className="pg-status flex items-center gap-2 font-mono text-[8px] text-text-dim tracking-wider uppercase">
              <div className={cn("w-1.5 h-1.5 rounded-full", isRendered ? "bg-green-glow shadow-[0_0_6px_var(--color-green-glow)]" : "bg-text-dim")} />
              {status}
            </div>
            <div className="font-mono text-[8px] text-cyan-glow/30 tracking-widest uppercase">{lineCount} lines</div>
          </div>

          <button 
            onClick={() => onSendToAura(code)}
            className="pg-send-btn w-full py-4 bg-gradient-to-r from-cyan-glow to-purple-glow text-white font-bold text-xs tracking-[2.5px] uppercase hover:tracking-[3.5px] transition-all disabled:opacity-30 disabled:cursor-not-allowed button-shine-effect"
            disabled={!code.trim()}
          >
            ⬡ SEND TO AURA & CONVERT TO VIDEO
          </button>
        </div>

        {/* Live Preview Panel */}
        <div className="pg-card bg-s1 border border-border-b1 rounded-[18px] overflow-hidden flex flex-col h-[600px] shadow-2xl">
          <div className="pg-card-head px-5 py-3.5 border-b border-border-b1 flex items-center justify-between bg-gradient-to-r from-cyan-glow/5 to-transparent">
            <div className="pg-card-title flex items-center gap-2.5 font-mono text-[8px] font-bold tracking-[3px] text-text-dim uppercase">
              <div className="step-num w-6 h-6 rounded-lg bg-cyan-glow/15 border border-cyan-glow/25 flex items-center justify-center text-cyan-glow">02</div>
              LIVE PREVIEW
            </div>
            <div className="pg-actions flex items-center gap-2">
              <button onClick={downloadSVG} className="pg-btn font-mono text-[8px] font-bold tracking-wider px-3 py-1 rounded bg-cyan-glow/5 border border-cyan-glow/25 text-cyan-glow hover:bg-cyan-glow/15 uppercase transition-all">DOWNLOAD SVG</button>
              <button onClick={loadSample} className="pg-btn font-mono text-[8px] font-bold tracking-wider px-3 py-1 rounded bg-cyan-glow/5 border border-cyan-glow/25 text-cyan-glow hover:bg-cyan-glow/15 uppercase transition-all">LOAD SAMPLE</button>
              <button onClick={runPreview} className="pg-btn font-mono text-[8px] font-bold tracking-wider px-3 py-1 rounded bg-gradient-to-r from-cyan-glow to-purple-glow text-white shadow-[0_2px_12px_rgba(0,212,255,0.25)] hover:scale-105 uppercase transition-all">↺ REFRESH</button>
            </div>
          </div>

          <div className="pg-preview-wrap flex-1 bg-black overflow-hidden flex items-center justify-center relative">
            {!isRendered ? (
              <div className="pg-preview-empty flex flex-col items-center gap-3 text-text-dim font-mono text-[9px] tracking-[1px] opacity-50">
                 <LucidePlay size={40} strokeWidth={1} />
                 <span>Click RUN to preview your SVG</span>
              </div>
            ) : (
              <iframe 
                ref={frameRef} 
                src={previewURL || 'about:blank'} 
                className="w-full h-full border-none block"
              />
            )}
          </div>

          <div className="pg-status-bar px-4 py-2 border-t border-border-b1 bg-black/30 flex items-center justify-between">
            <div className="pg-status flex items-center gap-2 font-mono text-[8px] text-text-dim tracking-wider uppercase">
              <div className={cn("w-1.5 h-1.5 rounded-full", isRendered ? "bg-green-glow shadow-[0_0_6px_var(--color-green-glow)]" : "bg-text-dim")} />
              {isRendered ? 'RENDERING LIVE' : 'AWAITING RENDER'}
            </div>
            <div className="font-mono text-[8px] text-cyan-glow/30 tracking-widest uppercase">
              {isRendered ? (code.length / 1024).toFixed(1) + ' KB' : '—'}
            </div>
          </div>
          
          <div className="p-4 bg-black/25 border-t border-border-b1 font-mono text-[8px] text-text-dim leading-[2] tracking-wider">
            💡 <b className="text-cyan-glow">TIP:</b> After previewing, click <b className="text-text-main">"Send to AURA"</b> to instantly load this SVG into the converter and render it as a full WebM video with your chosen resolution & frame rate.
          </div>
        </div>
      </div>
    </div>
  );
}
