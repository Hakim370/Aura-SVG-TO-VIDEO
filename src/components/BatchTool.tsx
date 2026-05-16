import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { buildWebM } from '../lib/webm-muxer';
import * as MP4Muxer from 'mp4-muxer';
import JSZip from 'jszip';
import { renderSVGFrame } from '../lib/svg-processor';
import { 
  LucideLayoutGrid, 
  LucidePlay, 
  LucideRotateCcw, 
  LucideDownload, 
  LucideZap, 
  LucideSettings, 
  LucideVideo, 
  LucideHistory, 
  LucideFileStack, 
  LucideX, 
  LucideCheckCircle2, 
  LucideLoader2,
  LucideAlertCircle,
  LucideSave,
  LucideArchive
} from 'lucide-react';
import { auth, db, loginWithGoogle } from '../lib/firebase';
import { doc, updateDoc, increment, serverTimestamp, addDoc, collection, onSnapshot } from 'firebase/firestore';

interface BatchFile {
  file: File;
  text: string;
  id: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  resultURL?: string;
  error?: string;
  blob?: Blob;
}

export function BatchTool() {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [userStats, setUserStats] = useState({ count: 0, limit: 5 });
  const [isBlocked, setIsBlocked] = useState(false);
  const [engineConfig, setEngineConfig] = useState({ maxDuration: 60, maxFPS: 60 });
  
  // Settings (Global for batch)
  const [resolution, setResolution] = useState('1920x1080');
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(6);
  const [bg, setBg] = useState('#000000');
  const [quality, setQuality] = useState(95);
  const [format, setFormat] = useState<'webm' | 'mp4'>('mp4');

  const abortRef = useRef(false);

  // Sync user stats
  useEffect(() => {
    // Fetch Global Settings
    const settingsRef = doc(db, 'settings', 'global');
    const unsubSettings = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setEngineConfig({
          maxDuration: data.maxDuration || 60,
          maxFPS: data.maxFPS || 60
        });
      }
    });

    if (!auth.currentUser) return () => unsubSettings();
    
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const unsubUser = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setIsBlocked(data.isBlocked || false);
        setUserStats({
          count: data.batchCount || 0,
          limit: data.batchLimit || 10
        });
      }
    });

    return () => {
      unsubSettings();
      unsubUser();
    };
  }, [auth.currentUser]);

  // Load local settings
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
      } catch (e) {}
    }
  }, []);

  const handleFiles = useCallback(async (newFiles: FileList) => {
    const batchFiles: BatchFile[] = [];
    
    for (const file of Array.from(newFiles)) {
      if (!file.name.toLowerCase().endsWith('.svg') && file.type.indexOf('svg') === -1) {
        toast.error(`${file.name} is not an SVG`);
        continue;
      }
      
      const text = await file.text();
      batchFiles.push({
        file,
        text,
        id: Math.random().toString(36).substr(2, 9),
        status: 'pending',
        progress: 0
      });
    }
    
    setFiles(prev => [...prev, ...batchFiles]);
    toast.success(`${batchFiles.length} files added to queue`);
  }, []);

  const removeFile = (id: string) => {
    setFiles(prev => {
      const filtered = prev.filter(f => f.id !== id);
      const found = prev.find(f => f.id === id);
      if (found?.resultURL) URL.revokeObjectURL(found.resultURL);
      return filtered;
    });
  };

  const clearAll = () => {
    files.forEach(f => f.resultURL && URL.revokeObjectURL(f.resultURL));
    setFiles([]);
    setIsProcessing(false);
    abortRef.current = false;
  };

  const processAll = async () => {
    if (isBlocked) return toast.error('Access restricted');
    if (files.filter(f => f.status === 'pending').length === 0) return toast.error('No pending files');
    
    setIsProcessing(true);
    abortRef.current = false;

    // Check limits upfront (hard check)
    const pendingCount = files.filter(f => f.status === 'pending').length;
    if (userStats.count + pendingCount > userStats.limit) {
      toast.error(`Cloud export limit exceeded. You have ${userStats.limit - userStats.count} exports remaining.`);
      setIsProcessing(false);
      return;
    }

    for (const fileData of files) {
      if (fileData.status !== 'pending') continue;
      if (abortRef.current) break;

      setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, status: 'processing' } : f));

      try {
        const { url, blob } = await batchConvertFile(fileData);
        setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, status: 'done', resultURL: url, blob, progress: 100 } : f));
        
        // Update user stats in state locally
        setUserStats(prev => ({ ...prev, count: prev.count + 1 }));
        
        // Sync to Firebase
        if (auth.currentUser) {
          try {
            await addDoc(collection(db, 'exports'), {
              userId: auth.currentUser.uid,
              fileName: fileData.file.name,
              fileSize: 0, // In batch we omit detailed size for speed
              duration,
              fps,
              resolution,
              status: 'completed',
              isBatch: true,
              createdAt: serverTimestamp()
            });
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
              batchCount: increment(1),
              exportCount: increment(1)
            });
          } catch (e) {}
        }
      } catch (err: any) {
        setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, status: 'error', error: err.message } : f));
      }
    }

    setIsProcessing(false);
    toast.success('Batch processing finished');
  };

  const batchConvertFile = async (f: BatchFile): Promise<{ url: string, blob: Blob }> => {
    const [W, H] = resolution.split('x').map(Number);
    const totalFrames = Math.round(fps * duration);
    const qualityNorm = quality / 100;

    return new Promise(async (resolve, reject) => {
      try {
        if (typeof VideoEncoder !== 'undefined' && format === 'mp4') {
          // MP4 Encoding Logic
          let muxer = new MP4Muxer.Muxer({
            target: new MP4Muxer.ArrayBufferTarget(),
            video: { codec: 'avc', width: W, height: H },
            fastStart: 'in-memory'
          });

          const encoder = new VideoEncoder({
            output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
            error: (e) => reject(e)
          });

          encoder.configure({
            codec: 'avc1.64002A',
            width: W,
            height: H,
            bitrate: Math.round(qualityNorm * 50000000), // Adobe Stock HD Master: 50Mbps
            framerate: fps,
            avc: { format: 'avc' }
          });

          const canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext('2d')!;

          for (let i = 0; i < totalFrames; i++) {
            if (abortRef.current) throw new Error('aborted');
            ctx.fillStyle = bg === 'transparent' ? '#000000' : bg;
            ctx.fillRect(0, 0, W, H);
            await renderSVGFrame(ctx, f.text, i / fps, W, H);

            const frame = new VideoFrame(canvas, { 
              timestamp: Math.round(i * (1000000 / fps)), 
              duration: Math.round(1000000 / fps) 
            });
            encoder.encode(frame, { keyFrame: i % 30 === 0 });
            frame.close();

            if (i % 10 === 0) {
              const p = Math.round((i / totalFrames) * 100);
              setFiles(prev => prev.map(item => item.id === f.id ? { ...item, progress: p } : item));
              await new Promise(r => setTimeout(r, 0));
            }
          }

          await encoder.flush();
          encoder.close();
          muxer.finalize();
          const buffer = (muxer.target as MP4Muxer.ArrayBufferTarget).buffer;
          const blob = new Blob([buffer], { type: 'video/mp4' });
          resolve({ url: URL.createObjectURL(blob), blob });

        } else if (typeof VideoEncoder !== 'undefined') {
          // WebM Logic
          const chunks: any[] = [];
          const encoder = new VideoEncoder({
            output: (chunk) => {
              const buf = new Uint8Array(chunk.byteLength);
              chunk.copyTo(buf);
              chunks.push({ buf, ts: chunk.timestamp, type: chunk.type, dur: chunk.duration });
            },
            error: (e) => reject(e)
          });

          let codec = 'vp09.00.10.08';
          let codecName = 'V_VP9';
          encoder.configure({ 
            codec, 
            width: W, 
            height: H, 
            bitrate: Math.round(qualityNorm * 25000000), // WebM High Quality
            framerate: fps 
          });

          const canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext('2d')!;

          for (let i = 0; i < totalFrames; i++) {
            if (abortRef.current) throw new Error('aborted');
            ctx.fillStyle = bg === 'transparent' ? '#000000' : bg;
            ctx.fillRect(0, 0, W, H);
            await renderSVGFrame(ctx, f.text, i / fps, W, H);

            const frame = new VideoFrame(canvas, { 
              timestamp: Math.round(i * (1000000 / fps)), 
              duration: Math.round(1000000 / fps) 
            });
            encoder.encode(frame, { keyFrame: i % 30 === 0 });
            frame.close();

            if (i % 10 === 0) {
              const p = Math.round((i / totalFrames) * 100);
              setFiles(prev => prev.map(item => item.id === f.id ? { ...item, progress: p } : item));
              await new Promise(r => setTimeout(r, 0));
            }
          }

          await encoder.flush();
          encoder.close();
          const webm = buildWebM(chunks, W, H, fps, codecName);
          const blob = new Blob([webm], { type: 'video/webm' });
          resolve({ url: URL.createObjectURL(blob), blob });
        } else {
          // MediaRecorder (Simple fallback)
          reject(new Error('Hardware acceleration required for batching'));
        }
      } catch (e) {
        reject(e);
      }
    });
  };

  const downloadAllZip = async () => {
    const doneFiles = files.filter(f => f.status === 'done' && f.blob);
    if (doneFiles.length === 0) return;

    setIsZipping(true);
    const zip = new JSZip();
    
    try {
      doneFiles.forEach(f => {
        const fileName = `${f.file.name.replace(/\.svg$/i, '')}.${format}`;
        zip.file(fileName, f.blob!);
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aura_batch_export_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Batch ZIP downloaded');
    } catch (err) {
      toast.error('ZIP creation failed');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="pg-wrap grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 px-4 md:px-9 py-7 items-start h-full max-h-full">
      <div className="col flex flex-col gap-6 h-full">
        {/* Dropzone */}
        <div className="card bg-s1 border border-border-b1 rounded-[24px] overflow-hidden group hover:border-border-b2 hover:shadow-[0_0_50px_rgba(0,212,255,0.08)] transition-all">
          <div className="ch px-6 py-4 border-b border-border-b1 flex items-center justify-between bg-gradient-to-r from-cyan-glow/5 to-transparent">
            <div className="flex items-center gap-3">
              <LucideFileStack size={18} className="text-cyan-glow" />
              <span className="font-mono text-[9px] font-bold tracking-[3px] text-white uppercase">Batch Upload Queue</span>
            </div>
            <div className="font-mono text-[8px] text-text-dim uppercase tracking-widest">{files.length} Files Total</div>
          </div>
          
          <div className="p-6">
             <input 
               type="file" 
               multiple 
               className="hidden" 
               id="batch-input" 
               accept=".svg" 
               onChange={(e) => { if (e.target.files) handleFiles(e.target.files); }}
             />
             <label 
               htmlFor="batch-input"
               className="drop-zone border-2 border-dashed border-cyan-glow/10 rounded-2xl p-10 text-center bg-cyan-glow/[0.02] hover:border-cyan-glow/40 transition-all cursor-pointer block"
             >
                <div className="w-14 h-14 bg-cyan-glow/10 rounded-2xl flex items-center justify-center text-cyan-glow mx-auto mb-4 border border-cyan-glow/20">
                  <LucideFileStack size={28} />
                </div>
                <h3 className="text-white font-bold text-base mb-1">Select Multiple SVG Files</h3>
                <p className="text-text-dim font-mono text-[9px] tracking-widest uppercase">Drag & Drop or Tap to Browse</p>
             </label>
          </div>
        </div>

        {/* Files List */}
        <div className="flex-1 min-h-[300px] flex flex-col bg-s1 border border-border-b1 rounded-[24px] overflow-hidden">
          <div className="px-6 py-4 border-b border-border-b1 bg-black/20 flex justify-between items-center">
             <span className="font-mono text-[9px] font-bold text-text-dim tracking-widest uppercase">Conversion Queue</span>
             <div className="flex items-center gap-3">
               <button 
                 onClick={clearAll}
                 className="text-[9px] font-mono font-bold text-pink-glow hover:bg-pink-glow/10 px-3 py-1 rounded-lg transition-all uppercase"
               >
                 Clear All
               </button>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-3">
             {files.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-text-dim opacity-30 gap-4">
                  <LucideLayoutGrid size={48} strokeWidth={1} />
                  <span className="font-mono text-[9px] tracking-[4px] uppercase">No files in queue</span>
               </div>
             ) : (
               files.map((f) => (
                 <div 
                   key={f.id} 
                   className={cn(
                     "file-item p-4 rounded-xl border flex items-center gap-4 transition-all",
                     f.status === 'pending' && "bg-white/[0.02] border-white/5",
                     f.status === 'processing' && "bg-cyan-glow/5 border-cyan-glow/20",
                     f.status === 'done' && "bg-green-glow/5 border-green-glow/20",
                     f.status === 'error' && "bg-pink-glow/5 border-pink-glow/20"
                   )}
                 >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border",
                      f.status === 'pending' && "bg-white/5 border-white/10 text-text-dim",
                      f.status === 'processing' && "bg-cyan-glow/20 border-cyan-glow/20 text-cyan-glow animate-pulse",
                      f.status === 'done' && "bg-green-glow/20 border-green-glow/20 text-green-glow",
                      f.status === 'error' && "bg-pink-glow/20 border-pink-glow/20 text-pink-glow"
                    )}>
                       {f.status === 'pending' && <LucideFileStack size={18} />}
                       {f.status === 'processing' && <LucideLoader2 size={18} className="animate-spin" />}
                       {f.status === 'done' && <LucideCheckCircle2 size={18} />}
                       {f.status === 'error' && <LucideAlertCircle size={18} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                       <div className="font-bold text-xs truncate text-white">{f.file.name}</div>
                       <div className="flex items-center gap-2 mt-1">
                          <div className="h-1 flex-1 bg-black/40 rounded-full overflow-hidden">
                             <div 
                              className={cn(
                                "h-full transition-all duration-300",
                                f.status === 'error' ? "bg-pink-glow" : "bg-cyan-glow"
                              )}
                               style={{ width: `${f.progress}%` }}
                             />
                          </div>
                          <span className="font-mono text-[8px] text-text-dim">{f.progress}%</span>
                       </div>
                    </div>

                    <div className="flex items-center gap-2">
                       {f.status === 'done' && f.resultURL && (
                         <a 
                           href={f.resultURL} 
                           download={`${f.file.name.replace(/\.svg$/i, '')}.${format}`}
                           className="p-2 rounded-lg bg-green-glow/10 text-green-glow hover:bg-green-glow/20 transition-all"
                         >
                           <LucideDownload size={14} />
                         </a>
                       )}
                       <button 
                         onClick={() => removeFile(f.id)}
                         className="p-2 rounded-lg bg-white/5 text-text-dim hover:text-pink-glow transition-all"
                       >
                         <LucideX size={14} />
                       </button>
                    </div>
                 </div>
               ))
             )}
          </div>

          <div className="p-6 border-t border-border-b1 bg-black/20">
             <button 
               onClick={processAll}
               disabled={isProcessing || files.length === 0}
               className="w-full py-4 bg-gradient-to-r from-cyan-glow to-purple-glow rounded-2xl text-white font-bold text-[11px] tracking-[4px] uppercase shadow-[0_10px_30px_rgba(0,212,255,0.3)] hover:-translate-y-1 transition-all disabled:opacity-30 disabled:grayscale"
             >
                {isProcessing ? 'Batch Processing Active...' : `Start Batch Conversion (${files.filter(f => f.status === 'pending').length} Pending)`}
             </button>
          </div>
        </div>
      </div>

      <aside className="sidebar flex flex-col gap-6">
        {/* Batch Control */}
        <div className="card bg-s1 border border-border-b1 rounded-[24px] overflow-hidden">
          <div className="ch px-6 py-4 border-b border-border-b1 bg-gradient-to-r from-cyan-glow/5 to-transparent">
             <span className="font-mono text-[9px] font-bold tracking-[3px] text-text-dim uppercase">Batch Config</span>
          </div>
          <div className="p-6 space-y-5">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">Resolution</label>
                <select 
                  value={resolution} 
                  onChange={(e) => setResolution(e.target.value)}
                  className="bg-s2 border border-border-b2 rounded-xl p-3 text-white font-mono text-[10px] outline-none hover:border-cyan-glow/30"
                >
                  <option value="640x360">640×360</option>
                  <option value="1280x720">1280×720 — HD</option>
                  <option value="1920x1080">1920×1080 — Full HD</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">FPS</label>
                  <select 
                    value={fps} 
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="bg-s2 border border-border-b2 rounded-xl p-3 text-white font-mono text-[10px] outline-none hover:border-cyan-glow/30"
                  >
                    <option value="24">24</option>
                    <option value="30">30</option>
                    <option value="60">60</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">Secs</label>
                <input 
                  type="number" 
                  value={duration} 
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="bg-s2 border border-border-b2 rounded-xl p-3 text-white font-mono text-[10px] outline-none hover:border-cyan-glow/30"
                />
                <span className="font-mono text-[6px] text-text-dim uppercase tracking-[1px] mt-1">Admin Limit: {engineConfig.maxDuration}s</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[8px] text-text-dim tracking-[2px] uppercase">Format</label>
                <select 
                  value={format} 
                  onChange={(e) => setFormat(e.target.value as 'webm' | 'mp4')}
                  className="bg-s2 border border-border-b2 rounded-xl p-3 text-white font-mono text-[10px] outline-none hover:border-cyan-glow/30"
                >
                  <option value="webm">WEBM</option>
                  <option value="mp4">MP4</option>
                </select>
              </div>
              
              <button 
                onClick={downloadAllZip}
                disabled={files.filter(f => f.status === 'done').length === 0 || isZipping}
                className="w-full py-4 bg-white/5 border border-white/10 rounded-xl text-white font-bold text-[9px] tracking-[3.5px] uppercase hover:bg-cyan-glow/10 hover:border-cyan-glow/30 transition-all disabled:opacity-20 flex items-center justify-center gap-2"
              >
                 {isZipping ? <LucideLoader2 size={14} className="animate-spin" /> : <LucideArchive size={14} />}
                 Download All as ZIP
              </button>
          </div>
        </div>

        {/* Stats */}
        <div className="card bg-s1 border border-border-b1 rounded-[24px] overflow-hidden p-6 relative">
           <div className="limit-card relative z-10">
               <div className="flex justify-between items-end mb-2">
                 <span className="font-mono text-[8px] text-text-dim tracking-widest uppercase">Batch Tokens</span>
                 <span className="font-mono text-xs font-bold text-cyan-glow">{userStats.count} / {userStats.limit}</span>
               </div>
               <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                 <div 
                   className="h-full bg-cyan-glow shadow-[0_0_8px_rgba(0,212,255,0.6)] transition-all duration-1000"
                   style={{ width: `${Math.min(100, (userStats.count / userStats.limit) * 100)}%` }}
                 />
               </div>
               
               {userStats.count >= userStats.limit ? (
                 <a 
                   href="https://wa.me/8801761709821" 
                   target="_blank"
                   rel="noopener noreferrer"
                   className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-purple-glow/10 border border-purple-glow/20 rounded-xl text-purple-glow font-mono text-[9px] font-bold tracking-[2px] uppercase hover:bg-purple-glow/20 transition-all shadow-[0_0_15px_rgba(155,77,255,0.1)]"
                 >
                   <LucideAlertCircle size={12} />
                   Get Support
                 </a>
               ) : (
                 <p className="mt-3 font-mono text-[7px] text-text-dim tracking-widest uppercase opacity-60">
                   {userStats.limit - userStats.count} Cloud exports available
                 </p>
               )}
           </div>
           
           <div className="mt-6 pt-6 border-t border-white/5">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-purple-glow/10 flex items-center justify-center text-purple-glow">
                    <LucideZap size={20} />
                 </div>
                 <div>
                    <h4 className="text-[10px] font-bold text-white uppercase italic tracking-wider leading-none">Turbo Batch</h4>
                    <p className="text-[8px] text-text-dim font-mono uppercase mt-1">Multi-core local encoding enabled</p>
                 </div>
              </div>
           </div>
        </div>

        {/* Help */}
        <div className="card bg-s1 border border-border-b1 rounded-[24px] p-6">
            <h4 className="font-mono text-[8px] font-bold text-text-dim tracking-[3px] uppercase mb-4 border-b border-white/5 pb-2">Batch Logic Tips</h4>
            <div className="space-y-3">
               {[
                 'Processing happens one-by-one to prevent browser crash',
                 'Ensure all SVGs share the same duration for consistent batching',
                 'Large queues (20+) may require high memory devices',
                 'MP4 format requires Chromium-based browsers for batching'
               ].map((tip, i) => (
                 <div key={i} className="flex gap-2 text-[9px] text-text-dim leading-relaxed">
                    <span className="text-cyan-glow">•</span>
                    <span>{tip}</span>
                 </div>
               ))}
            </div>
        </div>
      </aside>
    </div>
  );
}
