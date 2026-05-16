import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { buildWebM } from '../lib/webm-muxer';
import * as MP4Muxer from 'mp4-muxer';
import { renderSVGFrame } from '../lib/svg-processor';
import { LucideMonitor, LucidePlay, LucideRotateCcw, LucideDownload, LucideZap, LucideSettings, LucideVideo, LucideHistory, LucideInfo, LucideLock, LucideSave } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType, loginWithGoogle } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, addDoc, collection, onSnapshot } from 'firebase/firestore';

interface VectraToolProps {
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

export function VectraTool({ initialSVG, clearInitialSVG }: VectraToolProps) {
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
  const [engineConfig, setEngineConfig] = useState({ maxDuration: 60, maxFPS: 60 });
  
  // Render Stats
  const [stats, setStats] = useState({
    frames: '—',
    renderTime: '—',
    fileSize: '—',
    fps: '—'
  });

  // Settings
  const [resolution, setResolution] = useState('1920x1080');
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(6);
  const [bg, setBg] = useState('#000000');
  const [quality, setQuality] = useState(95);
  const [format, setFormat] = useState<'webm' | 'mp4'>('mp4');

  const abortRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check block status
  useEffect(() => {
    // Fetch Global Settings
    const settingsRef = doc(db, 'settings', 'global');
    const unsubSettings = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setNews(data.news || null);
        setEngineConfig({
          maxDuration: data.maxDuration || 60,
          maxFPS: data.maxFPS || 60
        });
      }
    }, (error) => {
      console.warn('Global settings restricted:', error.message);
    });

    if (!auth.currentUser) return () => unsubSettings();
    
    let unsubUser = () => {};
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      unsubUser = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setIsBlocked(data.isBlocked || false);
          setUserStats({
            count: data.auraCount || 0,
            limit: data.auraLimit || 50
          });

          // Load saved settings if any
          if (data.lastSettings) {
            const s = data.lastSettings;
            if (s.resolution) setResolution(s.resolution);
            if (s.fps) setFps(s.fps);
            if (s.duration) setDuration(s.duration);
            if (s.bg) setBg(s.bg);
            if (s.quality) setQuality(s.quality);
            if (s.format) setFormat(s.format);
          }
        }
      }, (error) => {
        console.warn('User data restriction:', error.message);
      });
    } catch (e) {
      console.warn('Auth snapshot skipped');
    }

    return () => {
      unsubSettings();
      unsubUser();
    };
  }, [auth.currentUser]);

  useEffect(() => {
    const local = localStorage.getItem('vectra_settings');
    if (local) {
      try {
        const s = JSON.parse(local);
        if (s.resolution) setResolution(s.resolution);
        if (s.fps) setFps(s.fps);
        if (s.duration) setDuration(s.duration);
        if (s.bg) setBg(s.bg);
        if (s.quality) setQuality(s.quality);
        if (s.format) setFormat(s.format);
      } catch (e) {
        console.warn('Failed to parse local settings');
      }
    }
  }, []);

  const saveSettings = async () => {
    const settings = {
      resolution,
      fps,
      duration,
      bg,
      quality,
      format
    };
    
    localStorage.setItem('vectra_settings', JSON.stringify(settings));
    toast.success('Settings saved locally');
    
    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          lastSettings: settings
        });
        toast.success('Synced to cloud');
      } catch (err: any) {
        console.warn('Cloud sync failed:', err.message);
      }
    }
  };

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
      toast.success('SVG loaded successfully');
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
      toast.error('Your access to AURA Engine is restricted');
      return;
    }

    // Relaxed limit check for guest users
    if (!auth.currentUser && userStats.count >= 50) {
      toast.error(`Local export limit reached. Please reload or sign in for more.`);
      return;
    }

    if (auth.currentUser && userStats.count >= userStats.limit) {
      toast.error(`Cloud export limit reached (${userStats.limit}). Contact admin for more.`);
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
    addLog(`Preparing ${totalFrames} frames @ ${fps}fps`, 'info');

    const t0 = performance.now();

    try {
      if (typeof VideoEncoder !== 'undefined' && format === 'mp4') {
        await encodeMP4(W, H, fps, duration, totalFrames, quality / 100, bg, t0);
      } else if (typeof VideoEncoder !== 'undefined') {
        await encodeWithVideoEncoder(W, H, fps, duration, totalFrames, quality / 100, bg, t0);
      } else {
        await encodeWithMediaRecorder(W, H, fps, duration, totalFrames, quality / 100, bg, t0);
      }
    } catch (err: any) {
      if (err.message === 'aborted') {
        addLog('Conversion cancelled', 'detail');
      } else {
        addLog('ERROR: ' + err.message, 'detail');
        toast.error(err.message);
      }
      setIsRendering(false);
    }
  };

  const encodeMP4 = async (W: number, H: number, fps: number, dur: number, total: number, q: number, background: string, t0: number) => {
    let muxer = new MP4Muxer.Muxer({
      target: new MP4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: W,
        height: H
      },
      fastStart: 'in-memory'
    });

    const encoder = new VideoEncoder({
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
      error: (e) => { throw e; }
    });

    encoder.configure({
      codec: 'avc1.64002A', // H.264 High Profile, Level 4.2
      width: W,
      height: H,
      bitrate: Math.round(q * 50000000), // Massive bitrate boost (up to 50Mbps) for Adobe Stock transparency/detail
      framerate: fps,
      avc: { format: 'avc' }
    });

    addLog(`Format: MP4 (H.264 High Profile)`, 'info');

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    for (let f = 0; f < total; f++) {
      if (abortRef.current) throw new Error('aborted');
      
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
      await renderSVGFrame(ctx, svgText!, f / fps, W, H);

      const frame = new VideoFrame(canvas, { 
        timestamp: Math.round(f * (1000000 / fps)), 
        duration: Math.round(1000000 / fps) 
      });
      encoder.encode(frame, { keyFrame: f % 30 === 0 }); // Shorter keyframe interval for stock quality requirements
      frame.close();

      if (f % 5 === 0 || f === total - 1) {
        const p = Math.round((f / total) * 90);
        setProgress(p);
        setStatus(`Encoding MP4… Frame ${f+1}/${total}`);
      }
      if (f % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

    setStatus('Finalizing MP4…');
    await encoder.flush();
    encoder.close();
    muxer.finalize();

    const buffer = (muxer.target as MP4Muxer.ArrayBufferTarget).buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    finalize(blob, t0, total);
  };

  const encodeWithVideoEncoder = async (W: number, H: number, fps: number, dur: number, total: number, q: number, background: string, t0: number) => {
    const chunks: any[] = [];
    const encoder = new VideoEncoder({
      output: (chunk) => {
        const buf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buf);
        chunks.push({ buf, ts: chunk.timestamp, type: chunk.type, dur: chunk.duration });
      },
      error: (e) => { throw e; }
    });

    let codec = 'vp09.00.10.08';
    let codecStr = 'V_VP9';
    try {
      const support = await VideoEncoder.isConfigSupported({ codec, width: W, height: H });
      if (!support.supported) {
        codec = 'vp8';
        codecStr = 'V_VP8';
      }
    } catch {
      codec = 'vp8';
      codecStr = 'V_VP8';
    }

    encoder.configure({
      codec,
      width: W,
      height: H,
      bitrate: Math.round(q * 25000000), // High quality WebM: 25Mbps
      framerate: fps
    });
    addLog(`Codec: ${codecStr}`, 'info');

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    for (let f = 0; f < total; f++) {
      if (abortRef.current) throw new Error('aborted');
      
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
      await renderSVGFrame(ctx, svgText!, f / fps, W, H);

      const frame = new VideoFrame(canvas, { 
        timestamp: Math.round(f * (1000000 / fps)), 
        duration: Math.round(1000000 / fps) 
      });
      encoder.encode(frame, { keyFrame: f % 30 === 0 });
      frame.close();

      if (f % 5 === 0 || f === total - 1) {
        const p = Math.round((f / total) * 90);
        setProgress(p);
        setStatus(`Frame ${f + 1}/${total}`);
      }
      // Mini yield
      if (f % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

    setStatus('Flushing…');
    await encoder.flush();
    encoder.close();

    setStatus('Building…');
    const webm = buildWebM(chunks, W, H, fps, codecStr);
    const blob = new Blob([webm], { type: 'video/webm' });
    finalize(blob, t0, total);
  };

  const encodeWithMediaRecorder = async (W: number, H: number, fps: number, dur: number, total: number, q: number, background: string, t0: number) => {
    // Slower fallback but works in more places
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    
    const mime = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm';
    const stream = canvas.captureStream(fps);
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { 
      mimeType: mime, 
      videoBitsPerSecond: Math.round(q * 25000000) // Fallback high bitrate 
    });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    
    const done = new Promise(resolve => rec.onstop = resolve);
    rec.start();

    for (let f = 0; f < total; f++) {
      if (abortRef.current) { rec.stop(); throw new Error('aborted'); }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
      await renderSVGFrame(ctx, svgText!, f / fps, W, H);
      
      const p = Math.round((f / total) * 90);
      setProgress(p);
      setStatus(`Frame ${f + 1}/${total}`);
      
      await new Promise(r => setTimeout(r, 1000 / fps));
    }

    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: mime });
    finalize(blob, t0, total);
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
    setStatus('✓ Done!');
    setIsRendering(false);
    addLog(`Complete — ${total} frames · ${elapsed}s · ${kb}KB`, 'success');
    
    // Update local counter
    setUserStats(prev => ({ ...prev, count: prev.count + 1 }));

    // Firestore Integration (Optional)
    if (auth.currentUser) {
      try {
        const fileName = svgFile?.name.replace(/\.svg$/i, '') || 'aura';
        
        // Log Export
        await addDoc(collection(db, 'exports'), {
          userId: auth.currentUser.uid,
          fileName,
          fileSize: kb,
          duration,
          fps,
          resolution,
          status: 'completed',
          createdAt: serverTimestamp()
        });

        // Increment User Stats
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          auraCount: increment(1),
          exportCount: increment(1) // Keep global count too
        });
      } catch (err) {
        console.warn('Cloud logging skipped:', err);
      }
    }
    
    const histItem: ExportHistory = {
      name: svgFile?.name.replace(/\.svg$/i, '') || 'aura',
      kb,
      url,
      date: new Date().toLocaleTimeString(),
      format: format
    };
    setHistory(prev => [histItem, ...prev].slice(0, 5));
    toast.success('Conversion complete!');
  };

  return (
    <div className="pg-wrap grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-6 px-4 md:px-9 py-7 items-start">
      {isBlocked && (
        <div className="col-span-full bg-pink-glow/10 border border-pink-glow/30 rounded-2xl p-6 flex items-center gap-6 mb-4 animate-in fade-in slide-in-from-top-4 duration-500">
           <div className="w-14 h-14 bg-pink-glow/20 rounded-full flex items-center justify-center text-pink-glow">
              <LucideLock size={28} />
           </div>
           <div>
             <h3 className="text-pink-glow font-bold text-lg uppercase tracking-widest">ACCESS DENIED</h3>
             <p className="text-text-dim font-mono text-xs mt-1 leading-relaxed">
               Your account has been restricted by system administration. Cloud processing and engine access are disabled. <br/> 
               <span className="text-pink-glow/50">Contact support for clearance: +880 1761 709821</span>
             </p>
           </div>
        </div>
      )}
      <div className="col flex flex-col gap-5">
        {/* Step 1: Upload */}
        <div className="card bg-s1 border border-border-b1 rounded-[18px] overflow-hidden group hover:border-border-b2 hover:shadow-[0_0_40px_rgba(0,212,255,0.05)] transition-all">
          <div className="ch px-5 py-4 border-b border-border-b1 flex items-center justify-between bg-gradient-to-r from-cyan-glow/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="step-num w-6 h-6 rounded-lg bg-cyan-glow/15 border border-cyan-glow/25 flex items-center justify-center font-mono text-[9px] text-cyan-glow font-bold">01</div>
              <span className="ct font-mono text-[8px] font-bold tracking-[3px] text-text-dim uppercase">Upload SVG File</span>
            </div>
            <span className="font-mono text-[8px] text-text-dim tracking-[1.5px]">DRAG & DROP OR CLICK</span>
          </div>
          <div className="cb p-6">
            <input 
              type="file" 
              className="hidden" 
              id="aura-file-input" 
              accept=".svg,image/svg+xml" 
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLoad(file);
              }}
            />
            {!svgFile ? (
              <label 
                htmlFor="aura-file-input"
                className="drop border-2 border-dashed border-cyan-glow/15 rounded-2xl p-12 text-center bg-[radial-gradient(ellipse_at_center,rgba(0,212,255,0.03),transparent_70%)] hover:border-cyan-glow/35 transition-all cursor-pointer block"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ok'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('ok'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('ok');
                  const file = e.dataTransfer.files[0];
                  if (file) handleLoad(file);
                }}
              >
                <div className="di w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-cyan-glow/10 to-purple-glow/10 border border-cyan-glow/20 flex items-center justify-center text-3xl shadow-[0_8px_30px_rgba(0,212,255,0.08)] transition-all group-hover:-translate-y-1">⬡</div>
                <h2 className="text-lg font-bold mb-2">Drop your SVG here</h2>
                <p className="font-mono text-[10px] text-text-dim mb-2">or tap to browse files</p>
                <small className="font-mono text-[8px] text-cyan-glow/40 tracking-[2px]">CSS KEYFRAMES · SMIL · TRANSFORMS · TEXT ANIMATIONS</small>
              </label>
            ) : (
              <div className="fp flex items-center gap-4 bg-green-glow/[0.03] border border-green-glow/15 rounded-xl p-4">
                <div className="fpi2 w-10 h-10 bg-gradient-to-br from-green-glow/10 to-cyan-glow/10 rounded-lg flex items-center justify-center text-xl border border-green-glow/15">⬡</div>
                <div className="fpd flex-1 min-w-0">
                  <div className="fpn font-bold text-sm truncate text-green-glow">{svgFile.name}</div>
                  <div className="fpm font-mono text-[9px] text-text-dim mt-1">{(svgFile.size / 1024).toFixed(1)} KB — Ready to convert</div>
                </div>
                <button 
                  className="fprm w-8 h-8 rounded-lg border border-border-b1 bg-white/5 text-text-dim flex items-center justify-center hover:bg-pink-glow/15 hover:text-pink-glow hover:border-pink-glow/25 transition-all"
                  onClick={clearFile}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Settings */}
        <div className="card bg-s1 border border-border-b1 rounded-[18px] overflow-hidden">
          <div className="ch px-5 py-4 border-b border-border-b1 flex items-center justify-between bg-gradient-to-r from-cyan-glow/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="step-num w-6 h-6 rounded-lg bg-cyan-glow/15 border border-cyan-glow/25 flex items-center justify-center font-mono text-[9px] text-cyan-glow font-bold">02</div>
              <span className="ct font-mono text-[8px] font-bold tracking-[3px] text-text-dim uppercase">Render Settings</span>
            </div>
            <button 
              onClick={saveSettings}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-cyan-glow/20 bg-cyan-glow/5 text-cyan-glow hover:bg-cyan-glow/10 transition-all font-mono text-[8px] uppercase tracking-widest"
              title="Save current settings as default"
            >
              <LucideSave size={12} />
              Save Config
            </button>
          </div>
          <div className="cb p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">Resolution</label>
                <select 
                  value={resolution} 
                  onChange={(e) => setResolution(e.target.value)}
                  className="bg-s2 border border-border-b2 rounded-lg p-2.5 text-text-main font-mono text-[10px] outline-none hover:border-cyan-glow/50 transition-all cursor-pointer"
                >
                  <option value="640x360">640×360 — Fast Test</option>
                  <option value="854x480">854×480 — SD</option>
                  <option value="1280x720">1280×720 — HD</option>
                  <option value="1920x1080">1920×1080 — Full HD</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">Frame Rate</label>
                <select 
                  value={fps} 
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="bg-s2 border border-border-b2 rounded-lg p-2.5 text-text-main font-mono text-[10px] outline-none hover:border-cyan-glow/50 transition-all cursor-pointer"
                >
                  <option value="24">24 fps — Film</option>
                  <option value="30">30 fps — Standard</option>
                  <option value="60">60 fps — Smooth</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">Duration (sec)</label>
                <input 
                  type="number" 
                  value={duration} 
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min={1} max={engineConfig.maxDuration}
                  className="bg-s2 border border-border-b2 rounded-lg p-2.5 text-text-main font-mono text-[10px] outline-none hover:border-cyan-glow/50 transition-all"
                />
                <div className="text-[7px] font-mono text-text-dim mt-1 uppercase tracking-widest">
                  Admin Limit: {engineConfig.maxDuration}s
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">Background</label>
                <select 
                  value={bg} 
                  onChange={(e) => setBg(e.target.value)}
                  className="bg-s2 border border-border-b2 rounded-lg p-2.5 text-text-main font-mono text-[10px] outline-none hover:border-cyan-glow/50 transition-all cursor-pointer"
                >
                  <option value="#000000">Black</option>
                  <option value="#ffffff">White</option>
                  <option value="transparent">Transparent → Black</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">Export Format</label>
                <select 
                  value={format} 
                  onChange={(e) => setFormat(e.target.value as 'webm' | 'mp4')}
                  className="bg-s2 border border-border-b2 rounded-lg p-2.5 text-text-main font-mono text-[10px] outline-none hover:border-cyan-glow/50 transition-all cursor-pointer"
                >
                  <option value="webm">WEBM — High Quality</option>
                  <option value="mp4">MP4 — Adobe Stock / Social</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">Quality</label>
                  <div className="font-mono text-[9px] text-cyan-glow">{quality}% — {(quality / 100 * 50).toFixed(2)} Mbps</div>
                </div>
                <input 
                  type="range" 
                  value={quality} 
                  onChange={(e) => setQuality(Number(e.target.value))}
                  min={1} max={100}
                  className="w-full"
                />
              </div>
            </div>

            <button 
              onClick={doConvert}
              disabled={!svgText || isRendering}
              className="go w-full mt-6 py-4 bg-gradient-to-r from-cyan-glow to-purple-glow rounded-xl text-white font-bold text-sm tracking-[3px] uppercase shadow-[0_4px_25px_rgba(0,212,255,0.25)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,212,255,0.35)] disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none transition-all relative overflow-hidden group"
            >
              <span className="relative z-10">{isRendering ? 'Processing…' : '▶ Convert to Video'}</span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-glow to-pink-glow opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="sh absolute top-0 -left-full w-1/2 h-full bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[sh_3s_infinite] z-20" />
            </button>

            {isRendering && (
              <div className="pr mt-5">
                <div className="flex justify-between mb-2">
                  <span className="font-mono text-[10px] text-text-dim">{status}</span>
                  <span className="font-mono text-xs font-bold text-cyan-glow">{progress}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-transparent animate-[scanline_2s_linear_infinite]" />
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-glow to-purple-glow shadow-[0_0_12px_rgba(0,212,255,0.6)] transition-all duration-100" 
                    style={{ width: `${progress}%` }} 
                  />
                </div>
                <div className="log mt-3 font-mono text-[9px] bg-black/40 border border-border-b1 rounded-xl p-3.5 max-h-24 overflow-y-auto custom-scrollbar leading-relaxed">
                  {log.map((entry, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "before:content-['›_'] before:opacity-50",
                        entry.type === 'info' && "text-cyan-glow",
                        entry.type === 'success' && "text-green-glow",
                        entry.type === 'detail' && "text-text-dim"
                      )}
                    >
                      {entry.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 3: Preview */}
        <div className="card bg-s1 border border-border-b1 rounded-[18px] overflow-hidden">
          <div className="ch px-5 py-4 border-b border-border-b1 flex items-center justify-between bg-gradient-to-r from-cyan-glow/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="step-num w-6 h-6 rounded-lg bg-cyan-glow/15 border border-cyan-glow/25 flex items-center justify-center font-mono text-[9px] text-cyan-glow font-bold">03</div>
              <span className="ct font-mono text-[8px] font-bold tracking-[3px] text-text-dim uppercase">Preview & Export</span>
            </div>
            <span className="font-mono text-[8px] text-text-dim tracking-[1.5px]">{outURL ? 'EXPORT READY' : 'AWAITING FILE'}</span>
          </div>
          <div className="cb p-6">
            <div className="pv bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center relative border border-border-b2 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)] group">
              {!outURL ? (
                <div className="pvph flex flex-col items-center gap-3 text-text-dim font-mono text-[9px] tracking-widest opacity-50">
                  <LucideMonitor size={44} strokeWidth={1} />
                  <span>PREVIEW APPEARS HERE</span>
                </div>
              ) : (
                <video 
                  ref={videoRef}
                  src={outURL} 
                  controls 
                  playsInline 
                  className="w-full h-full object-contain"
                />
              )}
              {svgText && !outURL && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                   <div className="w-full h-full p-4 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: svgText }} />
                </div>
              )}
              <div className="pvbg absolute top-2.5 right-2.5 font-mono text-[8px] tracking-[2px] px-2.5 py-1 rounded-full bg-black/85 border border-border-b2 text-cyan-glow">
                {outURL ? format.toUpperCase() : svgText ? 'SVG' : ''}
              </div>
              <div className="scan-line-animate absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-glow to-transparent opacity-40 pointer-events-none group-hover:block hidden" />
            </div>
            
            {outURL && (
              <div className="ac mt-4 flex gap-2.5">
                <a 
                  href={outURL} 
                  download={`${svgFile?.name.replace(/\.svg$/i, '') || 'aura'}.${format}`}
                  className="ab flex-1 bg-gradient-to-r from-cyan-glow to-purple-glow text-white rounded-xl py-3 font-bold text-xs flex items-center justify-center gap-2 shadow-[0_2px_15px_rgba(0,212,255,0.2)] hover:-translate-y-0.5 hover:shadow-[0_6px_25px_rgba(0,212,255,0.35)] transition-all"
                >
                  <LucideDownload size={14} /> Download
                </a>
                <button 
                  onClick={() => {
                    if (videoRef.current?.paused) videoRef.current.play();
                    else videoRef.current?.pause();
                  }}
                  className="ab flex-1 bg-s2 border border-border-b2 text-text-main rounded-xl py-3 font-bold text-xs flex items-center justify-center gap-2 hover:border-cyan-glow hover:text-cyan-glow transition-all"
                >
                  <LucidePlay size={14} /> Play / Pause
                </button>
                <button 
                  onClick={clearFile}
                  className="ab flex-1 bg-s2 border border-border-b1 text-text-dim rounded-xl py-3 font-bold text-xs flex items-center justify-center gap-2 hover:border-pink-glow hover:text-pink-glow transition-all"
                >
                  <LucideRotateCcw size={14} /> Reset
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar flex flex-col gap-5">
        {/* Render Stats */}
        <div className="card bg-s1 border border-border-b1 rounded-[18px] overflow-hidden">
          <div className="ch px-5 py-4 border-b border-border-b1 bg-gradient-to-r from-cyan-glow/5 to-transparent">
            <span className="ct font-mono text-[8px] font-bold tracking-[3px] text-text-dim uppercase">Render Stats</span>
          </div>
          <div className="cb p-6">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="sc bg-s2 border border-border-b1 rounded-xl p-3.5 relative overflow-hidden group hover:border-border-b2 transition-all">
                <div className="sv text-xl font-black text-cyan-glow tracking-tighter">{stats.frames}</div>
                <div className="sk font-mono text-[8px] text-text-dim tracking-widest uppercase">Frames</div>
              </div>
              <div className="sc bg-s2 border border-border-b1 rounded-xl p-3.5 relative overflow-hidden group hover:border-border-b2 transition-all">
                <div className="sv text-xl font-black text-pink-glow tracking-tighter">{stats.renderTime}</div>
                <div className="sk font-mono text-[8px] text-text-dim tracking-widest uppercase">Time</div>
              </div>
              <div className="sc bg-s2 border border-border-b1 rounded-xl p-3.5 relative overflow-hidden group hover:border-border-b2 transition-all">
                <div className="sv text-xl font-black text-gold-glow tracking-tighter">{stats.fileSize}</div>
                <div className="sk font-mono text-[8px] text-text-dim tracking-widest uppercase">Size</div>
              </div>
              <div className="sc bg-s2 border border-border-b1 rounded-xl p-3.5 relative overflow-hidden group hover:border-border-b2 transition-all">
                <div className="sv text-xl font-black text-green-glow tracking-tighter">{stats.fps}</div>
                <div className="sk font-mono text-[8px] text-text-dim tracking-widest uppercase">Rate</div>
              </div>
            </div>
            
            <div className="limit-card mt-4 p-4 bg-cyan-glow/5 border border-cyan-glow/20 rounded-xl relative overflow-hidden group">
               <div className="flex justify-between items-end mb-2">
                 <span className="font-mono text-[8px] text-text-dim tracking-widest uppercase">Exports Used</span>
                 <span className="font-mono text-xs font-bold text-cyan-glow">{userStats.count} / {userStats.limit}</span>
               </div>
               <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                 <div 
                   className="h-full bg-cyan-glow shadow-[0_0_8px_var(--color-cyan-glow)] transition-all duration-1000"
                   style={{ width: `${Math.min(100, (userStats.count / userStats.limit) * 100)}%` }}
                 />
               </div>
               
               {userStats.count >= userStats.limit ? (
                 <a 
                   href="https://wa.me/8801761709821" 
                   target="_blank"
                   rel="noopener noreferrer"
                   className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-pink-glow/10 border border-pink-glow/20 rounded-xl text-pink-glow font-mono text-[9px] font-bold tracking-[2px] uppercase hover:bg-pink-glow/20 transition-all shadow-[0_0_15px_rgba(255,61,127,0.1)]"
                 >
                   <LucideAlertCircle size={12} />
                   Get Support
                 </a>
               ) : (
                 <p className="mt-3 font-mono text-[7px] text-text-dim tracking-widest uppercase opacity-60">
                   {userStats.limit - userStats.count} Conversions remaining
                 </p>
               )}
            </div>
          </div>
        </div>

        {/* Global News Card */}
        <div className="card bg-[linear-gradient(135deg,rgba(0,212,255,0.05),rgba(155,77,255,0.05))] border border-cyan-glow/20 rounded-[18px] overflow-hidden relative group">
           <div className="px-5 py-4 border-b border-cyan-glow/10 flex items-center gap-2.5 bg-cyan-glow/10">
              <LucideZap size={16} className="text-cyan-glow" />
              <span className="font-bold text-xs tracking-widest text-cyan-glow uppercase tracking-[3px]">Billboard News</span>
           </div>
           <div className="p-5">
              <div className="bg-black/30 border border-cyan-glow/10 rounded-xl p-4 min-h-[100px] flex items-center justify-center text-center">
                 {news ? (
                   <p className="font-mono text-[10px] text-text-dim leading-relaxed whitespace-pre-wrap">{news}</p>
                 ) : (
                   <div className="text-[9px] font-mono text-text-dim/40 italic">Awaiting transmission...</div>
                 )}
              </div>
           </div>
           <div className="scan-line-animate absolute top-0 left-0 right-0 h-[100%] bg-gradient-to-b from-cyan-glow/5 to-transparent pointer-events-none opacity-20" />
        </div>

        {/* History */}
        <div className="card bg-s1 border border-border-b1 rounded-[18px] overflow-hidden">
          <div className="ch px-5 py-4 border-b border-border-b1 flex items-center justify-between bg-gradient-to-r from-cyan-glow/5 to-transparent">
            <span className="ct font-mono text-[8px] font-bold tracking-[3px] text-text-dim uppercase">Recent Exports</span>
            <button 
              onClick={() => setHistory([])}
              className="font-mono text-[8px] text-text-dim hover:text-pink-glow transition-colors tracking-widest uppercase"
            >
              Clear
            </button>
          </div>
          <div className="cb p-6">
            {history.length === 0 ? (
              <div className="py-5 text-center opacity-40 font-mono text-[9px] tracking-widest flex flex-col items-center gap-2">
                <LucideHistory size={20} />
                NO EXPORTS YET
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map((h, i) => (
                   <div key={i} className="hi flex items-center gap-3 p-2.5 bg-s2 border border-border-b1 rounded-xl group hover:border-border-b2 transition-all">
                    <div className="ht w-8 h-5 bg-cyan-glow/15 border border-cyan-glow/10 rounded flex items-center justify-center text-[9px] text-cyan-glow">▶</div>
                    <div className="hin flex-1 min-w-0">
                      <div className="hn text-[10px] font-bold truncate text-text-main">{h.name}.{h.format}</div>
                      <div className="hd font-mono text-[8px] text-text-dim mt-0.5">{h.date} · {h.kb}KB</div>
                    </div>
                    <a 
                      href={h.url} 
                      download={`${h.name}.${h.format}`}
                      className="hb2 w-7 h-7 rounded-lg border border-border-b1 text-text-dim flex items-center justify-center hover:border-cyan-glow hover:text-cyan-glow transition-all"
                    >
                      <LucideDownload size={12} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="card bg-s1 border border-border-b1 rounded-[18px] overflow-hidden">
          <div className="ch px-5 py-4 border-b border-border-b1 bg-gradient-to-r from-cyan-glow/5 to-transparent">
            <span className="ct font-mono text-[8px] font-bold tracking-[3px] text-text-dim uppercase">How It Works</span>
          </div>
          <div className="cb p-6 flex flex-col gap-2.5">
            {[
              { id: '01', text: 'CSS @keyframes animations captured via animation-delay offset per frame' },
              { id: '02', text: 'SMIL animations frozen per-frame with begin offset injection' },
              { id: '03', text: 'Custom WebM EBML muxer — exact duration, proper container' },
              { id: '04', text: 'VideoEncoder API for high-speed local processing' },
            ].map(tip => (
              <div key={tip.id} className="tip flex gap-3 p-2.5 bg-cyan-glow/[0.02] border-l-2 border-cyan-glow/20 rounded-r-lg font-mono text-[9px] text-text-dim leading-relaxed">
                <span className="text-cyan-glow font-bold">{tip.id}</span>
                <span>{tip.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
