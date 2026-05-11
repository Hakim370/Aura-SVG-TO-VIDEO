/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { Ticker } from './components/Ticker';
import { VectraTool } from './components/VectraTool';
import { Playground } from './components/Playground';
import { AdminDashboard } from './components/AdminDashboard';
import { Toaster, toast } from 'react-hot-toast';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export type Tab = 'aura' | 'playground' | 'admin';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('aura');
  const [playgroundSVG, setPlaygroundSVG] = useState<string | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Sync user to Firestore
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
            role: 'user',
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            exportCount: 0,
            exportLimit: 5,
            isBlocked: false
          });
        } else {
          await setDoc(userRef, {
            lastLogin: serverTimestamp()
          }, { merge: true });
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSendToAura = useCallback((svg: string) => {
    setPlaygroundSVG(svg);
    setActiveTab('aura');
    toast.success('SVG loaded into AURA!');
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-cyan-glow/20 border-t-cyan-glow rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="app flex flex-col min-h-screen relative z-10 selection:bg-cyan-glow selection:text-black">
      <div className="bg-grid fixed inset-0 pointer-events-none z-[-1]" />
      
      {/* Background Orbs */}
      <div className="orbs fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="orb w-[900px] h-[900px] bg-[radial-gradient(circle_at_40%_40%,rgba(0,150,255,0.12),transparent_70%)] -top-[400px] -left-[300px] animate-[da_22s_ease-in-out_infinite]" />
        <div className="orb w-[700px] h-[700px] bg-[radial-gradient(circle_at_60%_60%,rgba(155,77,255,0.1),transparent_70%)] -bottom-[300px] -right-[200px] animate-[db_18s_ease-in-out_infinite]" />
        <div className="orb w-[500px] h-[500px] bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,157,0.07),transparent_70%)] top-[45%] left-[55%] animate-[dc_14s_ease-in-out_infinite]" />
        <div className="orb w-[300px] h-[300px] bg-[radial-gradient(circle_at_50%_50%,rgba(255,61,127,0.08),transparent_70%)] top-[20%] right-[15%] animate-[dd_10s_ease-in-out_infinite]" />
      </div>

      <Ticker />
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1">
        {activeTab === 'aura' && (
          <VectraTool initialSVG={playgroundSVG} clearInitialSVG={() => setPlaygroundSVG(null)} />
        )}
        {activeTab === 'playground' && (
          <Playground onSendToAura={handleSendToAura} />
        )}
        {activeTab === 'admin' && (
          <AdminDashboard />
        )}
      </main>

      <div className="help-bar bg-[linear-gradient(90deg,rgba(0,212,255,0.08),rgba(155,77,255,0.06),rgba(255,61,127,0.06))] border-t border-border-b1 px-4 md:px-9 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div className="help-text font-mono text-[9px] text-text-dim flex items-center gap-2">
           Need help or see any error? <span className="text-cyan-glow font-bold">Contact us</span> <span className="font-sans text-text-dim">+880 1761 709821</span>
        </div>
        <a 
          href="https://wa.me/8801761709821" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="help-wa flex items-center gap-2 px-4 py-1.5 bg-[#25D366]/10 border border-[#25D366]/20 rounded-full text-[#25D366] font-mono text-[9px] font-bold tracking-wider hover:bg-[#25D366]/20 transition-all animate-[wa-pulse_3s_infinite]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
          GET SUPPORT
        </a>
      </div>

      <footer className="footer-dev text-center py-6 px-5 font-mono text-[10px] text-text-dim border-t border-border-b1 bg-bg/95 backdrop-blur-sm tracking-wider">
        Developed with ❤️ by <b className="text-cyan-glow tracking-[2px]">Hakim Ullah</b> (@hakimullah0370)
      </footer>

      <Toaster 
        position="bottom-right"
        toastOptions={{
          className: 'bg-s1/80 border border-border-b1 text-text-main backdrop-blur-md font-mono text-[10px]',
          style: {
            borderRadius: '12px',
          }
        }} 
      />
    </div>
  );
}
