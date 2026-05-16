import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '../lib/utils';
import { toast } from 'react-hot-toast';
import gifshot from 'gifshot';
import { renderSVGFrame } from '../lib/svg-processor';
import { LucideMonitor, LucidePlay, LucideRotateCcw, LucideDownload, LucideZap, LucideSettings, LucideImage, LucideHistory, LucideInfo, LucideLock } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType, loginWithGoogle } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, addDoc, collection, onSnapshot } from 'firebase/firestore';

interface GiftraToolProps {
  initialSVG: string | null;
  clearInitialSVG: () => void;
}

interface ExportHistory {
  name: string;
  kb: number;
  url: string;
  date: string;
  format: string;
}

export function GiftraTool({ initialSVG, clearInitialSVG }: GiftraToolProps) {
  const [svgFile, setSvgFile] = useState<File | null>(null);
  const [svgText, setSvgText] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing…');
  const [log, setLog] = useState<{ msg: string; type: 'info' | 'success' | 'detail' }[]>([]);
  const [outURL, setOutURL] = useState<string | null>(null);
  const [history, setHistory] = useState<ExportHistory[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [userStats, setUserStats] = useState({ count: 0, limit: 5 });
  const [news, setNews] = useState<string | null>(null);
  
  // Render Stats
  const [stats, setStats] = useState({
    frames: '—',
    renderTime: '—',
    fileSize: '—',
    fps: '—'
  });

  // Settings
  const [resolution, setResolution] = useState('500x500');
  const [fps, setFps] = useState(10);
  const [duration, setDuration] = useState(3);
  const [bg, setBg] = useState('#000000');

  const abortRef = useRef(false);

  // Check block status & Global news
  useEffect(() => {
    // Fetch Global News/Ad
    const newsRef = doc(db, 'settings', 'global');
    const unsubNews = onSnapshot(newsRef, (doc) => {
      if (doc.exists()) {
        setNews(doc.data().news || null);
      }
    }, (error) => {
      console.warn('Global news feed restricted:', error.message);
    });

    if (!auth.currentUser) return () => unsubNews();
    
    let unsubUser = () => {};
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      unsubUser = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setIsBlocked(data.isBlocked || false);
          setUserStats({
            count: data.exportCount || 0,
            limit: data.exportLimit || 100
          });
        }
      }, (error) => {
        console.warn('User data restricted:', error.message);
      });
    } catch (e) {
      console.warn('Auth snapshot skipped');
    }

    return () => {
      unsubNews();
      unsubUser();
    };
  }, [auth.currentUser]);

  const addLog = (msg: string, type: 'info' | 'success' | 'detail' = 'info') => {
    setLog(prev => [...prev, { msg, type }]);
  };

  const handleLoad = useCallback((f: File) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith('.svg') && f.type.indexOf('svg') === -1) {
      toast.error('SVG files only please');
      return;
    }
    setSvgFile(f);
    const r = new FileReader();
    r.onload = (ev) => {
      const text = ev.target.result as string;
      setSvgText(text);
      toast.success('SVG loaded to GIFTRA');
      setOutURL(null);
      setProgress(0);
      setLog([]);
    };
    r.readAsText(f);
  }, []);

  useEffect(() => {
    if (initialSVG) {
      setSvgText(initialSVG);
      setSvgFile(new File([initialSVG], 'playground.svg', { type: 'image/svg+xml' }));
      clearInitialSVG();
    }
  }, [initialSVG, clearInitialSVG]);

  const clearFile = () => {
    setSvgFile(null);
    setSvgText(null);
    setOutURL(null);
    setProgress(0);
    setLog([]);
    setStats({ frames: '—', renderTime: '—', fileSize: '—', fps: '—' });
  };

  const doConvert = async () => {
    if (!svgText || !svgFile) return;

    if (isBlocked) {
      toast.error('Access restricted');
      return;
    }

    if (auth.currentUser && userStats.count >= userStats.limit) {
      toast.error('Export limit reached');
      return;
    }

    // Guest limit
    if (!auth.currentUser && userStats.count >= 50) {
      toast.error('Guest limit reached. Please sign in for more.');
      return;
    }

    setIsRendering(true);
    abortRef.current = false;
    setOutURL(null);
    setProgress(0);
    setLog([]);
    
    const [W, H] = resolution.split('x').map(Number);
    const totalFrames = Math.round(fps * duration);
    
    setStats(prev => ({ ...prev, frames: totalFrames.toString(), fps: fps + 'fps' }));
    addLog(`Generating GIF — ${totalFrames} frames @ ${fps}fps`, 'info');

    const t0 = performance.now();

    try {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      const frames: string[] = [];
      for (let f = 0; f < totalFrames; f++) {
        if (abortRef.current) throw new Error('aborted');
        
        ctx.fillStyle = bg === 'transparent' ? '#000000' : bg;
        ctx.fillRect(0, 0, W, H);
        await renderSVGFrame(ctx, svgText!, f / fps, W, H);
        
        frames.push(canvas.toDataURL('image/png'));
        
        setProgress(Math.round((f / totalFrames) * 50));
        setStatus(`Capturing frame ${f + 1}/${totalFrames}`);
        if (f % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }

      setStatus('Muxing GIF…');
      gifshot.createGIF({
        images: frames,
        gifWidth: W,
        gifHeight: H,
        interval: 1 / fps,
        numFrames: totalFrames,
        frameDuration: 1 / fps,
        sampleInterval: 10,
        numWorkers: 2
      }, (obj: any) => {
        if (obj.error) {
          addLog('GIF Error: ' + obj.errorMsg, 'detail');
          setIsRendering(false);
          return;
        }
        
        const base64 = obj.image;
        fetch(base64)
          .then(res => res.blob())
          .then(blob => {
            finalize(blob, t0, totalFrames);
          });
      });

    } catch (err: any) {
      if (err.message === 'aborted') {
        addLog('Cancelled', 'detail');
      } else {
        addLog('ERROR: ' + err.message, 'detail');
        toast.error(err.message);
      }
      setIsRendering(false);
    }
  };

  const finalize = async (blob: Blob, t0: number, total: number) => {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    const kb = Math.round(blob.size / 1024);
    const url = URL.createObjectURL(blob);
    
    setStats({
      frames: total.toString(),
      renderTime: elapsed + 's',
      fileSize: kb > 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB',
      fps: fps + 'fps'
    });

    setOutURL(url);
    setProgress(100);
    setStatus('✓ GIF Ready!');
    setIsRendering(false);
    addLog(`Complete — ${kb}KB`, 'success');
    
    // Update local counter
    setUserStats(prev => ({ ...prev, count: prev.count + 1 }));

    if (auth.currentUser) {
      try {
        const fileName = svgFile?.name.replace(/\.svg$/i, '') || 'giftra';
        await addDoc(collection(db, 'exports'), {
          userId: auth.currentUser.uid,
          fileName,
          fileSize: kb,
          duration,
          fps,
          resolution,
          status: 'completed',
          createdAt: serverTimestamp(),
          format: 'gif'
        });
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          exportCount: increment(1)
        });
      } catch (err) {
        console.warn('Cloud logging skipped:', err);
      }
    }
    
    setHistory(prev => [{
      name: svgFile?.name.replace(/\.svg$/i, '') || 'giftra',
      kb,
      url,
      date: new Date().toLocaleTimeString(),
      format: 'gif'
    }, ...prev].slice(0, 5));
    toast.success('GIF exported!');
  };

  return (
    <div className="pg-wrap grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-6 px-4 md:px-9 py-7 items-start">
      <div className="col flex flex-col gap-5">
        <div className="card bg-s1 border border-border-b1 rounded-[18px] overflow-hidden">
          <div className="ch px-5 py-4 border-b border-border-b1 flex items-center justify-between bg-gradient-to-r from-pink-glow/5 to-transparent">
             <div className="flex items-center gap-3">
               <div className="step-num w-6 h-6 rounded-lg bg-pink-glow/15 border border-pink-glow/25 flex items-center justify-center font-mono text-[9px] text-pink-glow font-bold">GIF</div>
               <span className="ct font-mono text-[8px] font-bold tracking-[3px] text-text-dim uppercase">SVG TO GIF CONVERTER</span>
             </div>
          </div>
          <div className="cb p-6">
            {!svgFile ? (
              <label 
                className="drop border-2 border-dashed border-pink-glow/15 rounded-2xl p-12 text-center bg-[radial-gradient(ellipse_at_center,rgba(255,61,127,0.03),transparent_70%)] hover:border-pink-glow/35 transition-all cursor-pointer block"
                onClick={() => document.getElementById('giftra-file')?.click()}
              >
                <input type="file" id="giftra-file" hidden accept=".svg" onChange={(e) => e.target.files?.[0] && handleLoad(e.target.files[0])} />
                <div className="di w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-pink-glow/10 to-purple-glow/10 border border-pink-glow/20 flex items-center justify-center text-3xl transition-all group-hover:-translate-y-1">🎞</div>
                <h2 className="text-lg font-bold mb-2">Select SVG for GIF</h2>
                <p className="font-mono text-[10px] text-text-dim mb-2 text-center">Animations will be rendered to frames</p>
              </label>
            ) : (
              <div className="fp flex items-center gap-4 bg-pink-glow/[0.03] border border-pink-glow/15 rounded-xl p-4">
                <div className="fpi2 w-10 h-10 bg-pink-glow/10 rounded-lg flex items-center justify-center text-xl border border-pink-glow/15">🎞</div>
                <div className="fpd flex-1 min-w-0">
                  <div className="fpn font-bold text-sm truncate text-pink-glow">{svgFile.name}</div>
                  <div className="fpm font-mono text-[9px] text-text-dim mt-1">Ready for GIF export</div>
                </div>
                <button className="text-text-dim hover:text-pink-glow transition-all px-2" onClick={clearFile}>✕</button>
              </div>
            )}
          </div>
        </div>

        <div className="card bg-s1 border border-border-b1 rounded-[18px] p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[8px] text-text-dim tracking-widest uppercase">Resolution</label>
              <select value={resolution} onChange={e => setResolution(e.target.value)} className="bg-s2 border border-border-b2 rounded-lg p-2.5 text-text-main font-mono text-[10px] outline-none">
                <option value="250x250">250×250 (Avatar)</option>
                <option value="500x500">500×500 (Standard)</option>
                <option value="800x600">800×600 (Large)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[8px] text-text-dim tracking-widest uppercase">FPS</label>
              <select value={fps} onChange={e => setFps(Number(e.target.value))} className="bg-s2 border border-border-b2 rounded-lg p-2.5 text-text-main font-mono text-[10px] outline-none">
                <option value="5">5 FPS</option>
                <option value="10">10 FPS</option>
                <option value="15">15 FPS</option>
                <option value="20">20 FPS</option>
              </select>
            </div>
          </div>
          <button 
            disabled={!svgText || isRendering} 
            onClick={doConvert}
            className="w-full mt-6 py-4 bg-gradient-to-r from-pink-glow to-purple-glow rounded-xl text-white font-bold text-sm tracking-[3px] uppercase shadow-lg shadow-pink-glow/20 transition-all hover:-translate-y-1 disabled:opacity-30"
          >
            {isRendering ? 'Rendering GIF…' : '▶ Create GIF'}
          </button>
          
          {isRendering && (
            <div className="mt-4">
               <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-pink-glow" style={{ width: `${progress}%` }} />
               </div>
               <div className="text-[9px] font-mono text-center text-text-dim mt-2">{status}</div>
            </div>
          )}
        </div>

        <div className="card bg-s1 border border-border-b1 rounded-[18px] p-6 min-h-[300px] flex items-center justify-center relative overflow-hidden">
           {outURL ? (
             <img src={outURL} className="max-w-full max-h-full object-contain z-10" />
           ) : (
             <div className="text-text-dim opacity-30 flex flex-col items-center gap-3">
               <LucideImage size={40} strokeWidth={1} />
               <span className="font-mono text-[9px] tracking-widest uppercase">Result Preview</span>
             </div>
           )}
           {svgText && !outURL && (
              <div className="absolute inset-0 flex items-center justify-center opacity-40 pointer-events-none" dangerouslySetInnerHTML={{ __html: svgText }} />
           )}
           {outURL && (
             <div className="absolute bottom-4 left-0 right-0 px-6 flex gap-2 z-20">
               <a href={outURL} download="giftra.gif" className="flex-1 bg-pink-glow text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-pink-glow/20">
                 <LucideDownload size={14} /> Download GIF
               </a>
               <button onClick={clearFile} className="bg-s2 border border-border-b2 text-text-dim p-3 rounded-xl hover:text-pink-glow">
                 <LucideRotateCcw size={14} />
               </button>
             </div>
           )}
        </div>
      </div>

      <div className="sidebar flex flex-col gap-5">
        {/* GIF Stats */}
        <div className="card bg-s1 border border-border-b1 rounded-[18px] p-6">
          <span className="font-mono text-[8px] text-text-dim tracking-widest uppercase mb-4 block">GIF STATS</span>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-s2 p-3 rounded-xl border border-border-b1">
              <div className="text-pink-glow font-bold text-lg">{stats.frames}</div>
              <div className="text-[7px] text-text-dim font-mono uppercase">Frames</div>
            </div>
            <div className="bg-s2 p-3 rounded-xl border border-border-b1">
              <div className="text-purple-glow font-bold text-lg">{stats.fileSize}</div>
              <div className="text-[7px] text-text-dim font-mono uppercase">File Size</div>
            </div>
          </div>
        </div>

        {/* Global News Card (Requested by user) */}
        <div className="card bg-[linear-gradient(135deg,rgba(0,212,255,0.05),rgba(155,77,255,0.05))] border border-cyan-glow/20 rounded-[18px] overflow-hidden relative group">
           <div className="px-5 py-4 border-b border-cyan-glow/10 flex items-center gap-2.5 bg-cyan-glow/10">
              <LucideZap size={16} className="text-cyan-glow" />
              <span className="font-bold text-xs tracking-widest text-cyan-glow">STAY UPDATED</span>
           </div>
           <div className="p-5">
              <div className="bg-black/30 border border-cyan-glow/10 rounded-xl p-4 min-h-[100px] flex items-center justify-center text-center">
                 {news ? (
                   <p className="font-mono text-[10px] text-text-dim leading-relaxed whitespace-pre-wrap">{news}</p>
                 ) : (
                   <div className="text-[9px] font-mono text-text-dim/40 italic">Awaiting news from CMD...</div>
                 )}
              </div>
              <div className="mt-4 pt-4 border-t border-cyan-glow/5 flex items-center justify-between">
                <span className="text-[8px] font-mono text-text-dim tracking-widest uppercase">System Status</span>
                <span className="flex items-center gap-1 text-[8px] font-mono text-green-glow">
                   <div className="w-1.5 h-1.5 rounded-full bg-green-glow animate-pulse" />
                   OPERATIONAL
                </span>
              </div>
           </div>
           <div className="scan-line-animate absolute top-0 left-0 right-0 h-[100%] bg-gradient-to-b from-cyan-glow/5 to-transparent pointer-events-none opacity-20" />
        </div>

        {/* History */}
        <div className="card bg-s1 border border-border-b1 rounded-[18px] p-6">
           <div className="flex justify-between items-center mb-4">
              <span className="font-mono text-[8px] text-text-dim tracking-widest uppercase">GIF HISTORY</span>
           </div>
           {history.length === 0 ? (
             <div className="text-center py-6 opacity-30 text-[9px] font-mono tracking-widest flex flex-col items-center gap-2">
               <LucideHistory size={18} />
               EMPTY
             </div>
           ) : (
             <div className="flex flex-col gap-2">
               {history.map((h, i) => (
                 <div key={i} className="flex items-center gap-3 p-2 bg-s2 border border-border-b1 rounded-xl">
                   <div className="w-8 h-8 rounded bg-pink-glow/10 flex items-center justify-center text-[10px]">🎞</div>
                   <div className="flex-1 min-w-0">
                     <div className="text-[10px] font-bold truncate">{h.name}</div>
                     <div className="text-[7px] text-text-dim font-mono">{h.kb}KB</div>
                   </div>
                   <a href={h.url} download={`${h.name}.gif`} className="text-pink-glow"><LucideDownload size={14} /></a>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
