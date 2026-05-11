import { Tab } from '../App';
import { cn } from '../lib/utils';
import { auth, loginWithGoogle, logout } from '../lib/firebase';
import { LucideLogOut, LucideLogIn, LucideUser } from 'lucide-react';

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  user: any;
}

export function Header({ activeTab, onTabChange, user }: HeaderProps) {

  return (
    <header className="flex items-center justify-between px-4 md:px-9 py-4 border-b border-border-b2 backdrop-blur-3xl bg-bg/80 sticky top-0 z-[99]">
      <div className="logo flex items-center gap-3.5">
        <div className="lm w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-glow to-purple-glow flex items-center justify-center font-black text-xl text-white shadow-[0_0_30px_rgba(0,212,255,0.35)] relative overflow-hidden logo-shine-animate">
          A
        </div>
        <div className="ln text-base font-black tracking-[4px] bg-gradient-to-br from-text-main to-cyan-glow bg-clip-text text-transparent leading-none">
          AURA <br/> <span className="text-[10px] tracking-[2px] opacity-80">SVG STUDIO</span>
        </div>
        <div className="hbadge hidden sm:block font-mono text-[8px] text-cyan-glow border border-cyan-glow/30 px-2.5 py-1 rounded-full bg-cyan-glow/5 tracking-[2.5px] shadow-[0_0_12px_rgba(0,212,255,0.1)]">
          SVG → WEBM
        </div>
      </div>

      <div className="hright flex items-center gap-4">
        <nav className="pg-nav flex items-center gap-1.5">
          <button 
            type="button"
            onClick={() => onTabChange('aura')}
            className={cn(
              "font-mono text-[9px] font-bold tracking-[2px] px-4 py-2 rounded-full border transition-all uppercase whitespace-nowrap",
              activeTab === 'aura' 
                ? "bg-gradient-to-br from-cyan-glow/20 to-purple-glow/15 border-cyan-glow text-text-main shadow-[0_0_14px_rgba(0,212,255,0.25)]" 
                : "border-border-b2 bg-cyan-glow/5 text-text-dim hover:border-cyan-glow hover:text-cyan-glow"
            )}
          >
            ⬡ AURA STUDIO
          </button>
          <button 
            type="button"
            onClick={() => onTabChange('playground')}
            className={cn(
              "font-mono text-[9px] font-bold tracking-[2px] px-4 py-2 rounded-full border transition-all uppercase whitespace-nowrap",
              activeTab === 'playground' 
                ? "bg-gradient-to-br from-cyan-glow/20 to-purple-glow/15 border-cyan-glow text-text-main shadow-[0_0_14px_rgba(0,212,255,0.25)]" 
                : "border-border-b2 bg-cyan-glow/5 text-text-dim hover:border-cyan-glow hover:text-cyan-glow"
            )}
          >
            ✦ SVG PLAYGROUND
          </button>
          {user?.email === 'hakimmia370@gmail.com' && (
            <button 
              type="button"
              onClick={() => onTabChange('admin')}
              className={cn(
                "font-mono text-[9px] font-bold tracking-[2px] px-4 py-2 rounded-full border transition-all uppercase whitespace-nowrap",
                activeTab === 'admin' 
                  ? "bg-gradient-to-br from-pink-glow/20 to-purple-glow/15 border-pink-glow text-text-main shadow-[0_0_14px_rgba(255,61,127,0.2)]" 
                  : "border-border-b2 bg-pink-glow/5 text-text-dim hover:border-pink-glow hover:text-pink-glow"
              )}
            >
              ⚙ ADMIN CMD
            </button>
          )}
        </nav>

        <div className="user-auth flex items-center gap-3 pl-4 border-l border-border-b1">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-[10px] font-bold text-text-main leading-none">{user.displayName}</span>
                <span className="text-[8px] font-mono text-text-dim mt-1 uppercase tracking-wider">Verified User</span>
              </div>
              <div className="w-8 h-8 rounded-full border border-cyan-glow/30 p-0.5 relative group">
                <img src={user.photoURL || ''} alt="User" className="w-full h-full rounded-full bg-s2" />
                <button 
                  onClick={() => logout()}
                  className="absolute -bottom-1 -right-1 w-5 h-5 bg-s1 border border-border-b2 rounded-full flex items-center justify-center text-text-dim hover:text-pink-glow hover:border-pink-glow/50 transition-all shadow-lg"
                  title="Logout"
                >
                  <LucideLogOut size={10} />
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => loginWithGoogle()}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-border-b1 rounded-full text-[9px] font-bold font-mono text-text-main hover:bg-cyan-glow/10 hover:border-cyan-glow/50 transition-all uppercase tracking-widest"
            >
              <LucideLogIn size={14} className="text-cyan-glow" /> Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
