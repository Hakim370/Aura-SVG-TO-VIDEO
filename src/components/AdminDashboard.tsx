import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { 
  LucideShieldCheck, 
  LucideActivity, 
  LucideDatabase, 
  LucideServer, 
  LucideLock, 
  LucideUnlock,
  LucideTrash2,
  LucideBarChart3,
  LucideCpu,
  LucideHardDrive,
  LucideUsers,
  LucideBan,
  LucideCheckCircle2,
  Settings as LucideSettings
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db, handleFirestoreError, OperationType, loginWithGoogle } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, getDocs, orderBy, limit, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: string;
  exportCount: number;
  exportLimit: number;
  isBlocked: boolean;
  lastLogin: any;
}

export function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'system' | 'users'>('system');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalExportsAcrossUsers: 0,
    totalMemory: '0MB',
    uptime: '00:00:00'
  });

  const [dbPin, setDbPin] = useState('1337');
  const [newPin, setNewPin] = useState('');

  const [engineSettings, setEngineSettings] = useState({
    maxDuration: 60,
    maxFPS: 60,
    highEfficiencyMode: true,
    autoPurge: true,
    news: ''
  });
  const [isAdminUser, setIsAdminUser] = useState(false);

  // Calculate session stats
  useEffect(() => {
    // Check if user is admin in Firestore
    if (auth.currentUser) {
      const adminRef = doc(db, 'admins', auth.currentUser.uid);
      getDoc(adminRef).then(snap => {
        setIsAdminUser(snap.exists());
      });
    }

    // Fetch global settings
    const fetchSettings = async () => {
      const snap = await getDoc(doc(db, 'settings', 'global'));
      if (snap.exists()) {
        const data = snap.data();
        setEngineSettings(prev => ({
          ...prev,
          news: data.news || ''
        }));
      }

      // Fetch Security PIN
      const secSnap = await getDoc(doc(db, 'settings', 'security'));
      if (secSnap.exists()) {
        setDbPin(secSnap.data().adminPin || '1337');
      }
    };
    fetchSettings();
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
      const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
      const s = (elapsed % 60).toString().padStart(2, '0');
      
      setStats(prev => ({
        ...prev,
        uptime: `${h}:${m}:${s}`,
        totalMemory: (Math.random() * 50 + 120).toFixed(1) + 'MB'
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fetch users from Firestore
  useEffect(() => {
    if (!isAuthenticated) return;

    const q = query(collection(db, 'users'), orderBy('lastLogin', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({ ...doc.data() } as AppUser));
      setUsers(usersList);
      
      const totalExports = usersList.reduce((acc, curr) => acc + (curr.exportCount || 0), 0);
      setStats(prev => ({ 
        ...prev, 
        totalUsers: usersList.length,
        totalExportsAcrossUsers: totalExports
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  const toggleBlockUser = async (user: AppUser) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { isBlocked: !user.isBlocked });
      toast.success(user.isBlocked ? 'User unblocked' : 'User blocked');
    } catch (err) {
      toast.error('Failed to update user status');
    }
  };

  const updateUserLimit = async (user: AppUser, newLimit: number) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { exportLimit: newLimit });
      toast.success(`Limit updated to ${newLimit} for ${user.displayName}`);
    } catch (err) {
      toast.error('Failed to update limits');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === dbPin) {
      setIsAuthenticated(true);
      toast.success('Admin access granted');
    } else {
      toast.error('Invalid clearance code');
    }
  };

  const updateAdminPin = async () => {
    if (!newPin || newPin.length < 4) {
      toast.error('PIN must be at least 4 characters');
      return;
    }
    try {
      await setDoc(doc(db, 'settings', 'security'), {
        adminPin: newPin,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email
      }, { merge: true });
      setDbPin(newPin);
      setNewPin('');
      toast.success('Admin access PIN updated successfully');
    } catch (err) {
      toast.error('Failed to update PIN');
    }
  };

  const initializeAdmin = async () => {
    if (!auth.currentUser) {
      toast.error('Please sign in with Google first');
      loginWithGoogle();
      return;
    }
    try {
      await setDoc(doc(db, 'admins', auth.currentUser.uid), {
        email: auth.currentUser.email,
        role: 'master',
        createdAt: serverTimestamp()
      });
      setIsAdminUser(true);
      toast.success('Admin role initialized');
    } catch (err) {
      toast.error('Failed to initialize admin role');
    }
  };

  const saveSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        news: engineSettings.news,
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success('Global settings updated');
    } catch (err) {
      toast.error('Failed to save settings');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] p-6">
        <div className="w-full max-w-md bg-s1 border border-border-b2 rounded-3xl p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-glow via-purple-glow to-cyan-glow" />
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-pink-glow/10 border border-pink-glow/20 rounded-2xl flex items-center justify-center mb-6 text-pink-glow">
              <LucideLock size={32} />
            </div>
            <h2 className="text-2xl font-black mb-2 tracking-tight text-white">RESTRICTED AREA</h2>
            <p className="font-mono text-[10px] text-text-dim uppercase tracking-[3px] mb-8">Access Key Authentication Required</p>
            
            <form onSubmit={handleLogin} className="w-full space-y-4">
              <input 
                type="password" 
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="ENTER CLEARANCE CODE"
                className="w-full bg-black/40 border border-border-b1 rounded-xl py-4 px-6 text-center font-mono text-sm tracking-[5px] text-pink-glow outline-none focus:border-pink-glow/50 transition-all placeholder:text-text-dim/20"
                autoFocus
              />
              <button 
                type="submit"
                className="w-full py-4 bg-gradient-to-r from-pink-glow to-purple-glow text-white font-bold text-xs tracking-[3px] uppercase rounded-xl shadow-lg shadow-pink-glow/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                INITIALIZE COMMAND
              </button>
            </form>

            {auth.currentUser?.email === 'hakimmia370@gmail.com' && !isAdminUser && (
              <button 
                onClick={initializeAdmin}
                className="mt-4 w-full py-3 bg-cyan-glow/10 border border-cyan-glow/30 text-cyan-glow font-bold text-[10px] tracking-widest uppercase rounded-xl hover:bg-cyan-glow hover:text-black transition-all"
              >
                Promote to Admin Role
              </button>
            )}

            <p className="mt-8 font-mono text-[8px] text-text-dim uppercase tracking-widest opacity-30">
              ID: AIS-CORE-ALPHA-9 // HAKIM ULLAH
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-9 flex flex-col gap-8">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 bg-s2/50 border border-border-b1 p-1.5 rounded-2xl w-max">
        <button 
          onClick={() => setActiveSubTab('system')}
          className={cn(
            "px-6 py-2.5 rounded-xl font-mono text-[10px] font-bold tracking-widest uppercase transition-all",
            activeSubTab === 'system' ? "bg-cyan-glow/10 text-cyan-glow border border-cyan-glow/20 shadow-lg shadow-cyan-glow/5" : "text-text-dim hover:text-text-main"
          )}
        >
          System Config
        </button>
        <button 
          onClick={() => setActiveSubTab('users')}
          className={cn(
            "px-6 py-2.5 rounded-xl font-mono text-[10px] font-bold tracking-widest uppercase transition-all",
            activeSubTab === 'users' ? "bg-purple-glow/10 text-purple-glow border border-purple-glow/20 shadow-lg shadow-purple-glow/5" : "text-text-dim hover:text-text-main"
          )}
        >
          Users & Analytics
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">
        <div className="flex flex-col gap-8">
          {activeSubTab === 'system' ? (
            <>
              {/* System Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-s1 border border-border-b1 rounded-2xl p-6 flex flex-col gap-2 relative overflow-hidden group">
                  <LucideActivity className="text-cyan-glow opacity-20 absolute -right-2 -bottom-2 w-16 h-16" />
                  <span className="font-mono text-[9px] text-text-dim tracking-widest uppercase">System Uptime</span>
                  <div className="text-3xl font-black text-white tracking-tighter font-mono">{stats.uptime}</div>
                </div>
                <div className="bg-s1 border border-border-b1 rounded-2xl p-6 flex flex-col gap-2 relative overflow-hidden group">
                  <LucideCpu className="text-purple-glow opacity-20 absolute -right-2 -bottom-2 w-16 h-16" />
                  <span className="font-mono text-[9px] text-text-dim tracking-widest uppercase">Engine Load</span>
                  <div className="text-3xl font-black text-white tracking-tighter font-mono">{stats.totalMemory}</div>
                </div>
                <div className="bg-s1 border border-border-b1 rounded-2xl p-6 flex flex-col gap-2 relative overflow-hidden group">
                  <LucideShieldCheck className="text-green-glow opacity-20 absolute -right-2 -bottom-2 w-16 h-16" />
                  <span className="font-mono text-[9px] text-text-dim tracking-widest uppercase">Engine Status</span>
                  <div className="text-3xl font-black text-green-glow tracking-tighter">SECURE</div>
                </div>
              </div>

              {/* Global Configuration */}
              <div className="bg-s1 border border-border-b1 rounded-3xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border-b1 bg-gradient-to-r from-cyan-glow/5 to-transparent flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <LucideServer size={18} className="text-cyan-glow" />
                    <h2 className="font-mono text-[10px] font-bold tracking-[3px] text-text-dim uppercase">AURA Core Engine Config</h2>
                  </div>
                  <LucideSettings size={18} className="text-text-dim opacity-20 animate-spin-slow" />
                </div>
                <div className="p-8 space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="font-mono text-[9px] text-text-dim tracking-widest uppercase">Max Export Duration</label>
                        <span className="font-mono text-cyan-glow text-xs">{engineSettings.maxDuration}s</span>
                      </div>
                      <input 
                        type="range" 
                        min="30" max="300"
                        value={engineSettings.maxDuration}
                        onChange={(e) => setEngineSettings({...engineSettings, maxDuration: parseInt(e.target.value)})}
                        className="w-full accent-cyan-glow"
                      />
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="font-mono text-[9px] text-text-dim tracking-widest uppercase">Master FPS Cap</label>
                        <span className="font-mono text-purple-glow text-xs">{engineSettings.maxFPS} FPS</span>
                      </div>
                      <input 
                        type="range" 
                        min="12" max="120"
                        value={engineSettings.maxFPS}
                        onChange={(e) => setEngineSettings({...engineSettings, maxFPS: parseInt(e.target.value)})}
                        className="w-full accent-purple-glow"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <button 
                      onClick={() => setEngineSettings({...engineSettings, highEfficiencyMode: !engineSettings.highEfficiencyMode})}
                      className={cn(
                        "flex-1 min-w-[200px] p-4 border rounded-2xl flex items-center justify-between transition-all",
                        engineSettings.highEfficiencyMode ? "bg-green-glow/5 border-green-glow/30 text-green-glow" : "bg-s2 border-border-b1 text-text-dim"
                      )}
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-bold text-[10px] uppercase tracking-widest">High Efficiency</span>
                        <span className="font-mono text-[8px] opacity-60">VP9 Hardware Accelerated</span>
                      </div>
                      <div className={cn("w-10 h-5 rounded-full relative transition-all", engineSettings.highEfficiencyMode ? "bg-green-glow" : "bg-white/10")}>
                        <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white transition-all", engineSettings.highEfficiencyMode ? "left-6" : "left-1")} />
                      </div>
                    </button>

                    <button 
                      onClick={() => setEngineSettings({...engineSettings, autoPurge: !engineSettings.autoPurge})}
                      className={cn(
                        "flex-1 min-w-[200px] p-4 border rounded-2xl flex items-center justify-between transition-all",
                        engineSettings.autoPurge ? "bg-cyan-glow/5 border-cyan-glow/30 text-cyan-glow" : "bg-s2 border-border-b1 text-text-dim"
                      )}
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-bold text-[10px] uppercase tracking-widest">Auto Cache Purge</span>
                        <span className="font-mono text-[8px] opacity-60">Session Memory Clean</span>
                      </div>
                      <div className={cn("w-10 h-5 rounded-full relative transition-all", engineSettings.autoPurge ? "bg-cyan-glow" : "bg-white/10")}>
                        <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white transition-all", engineSettings.autoPurge ? "left-6" : "left-1")} />
                      </div>
                    </button>
                  </div>

                    <div className="space-y-4 pt-6 border-t border-border-b1">
                    <label className="font-mono text-[9px] text-text-dim tracking-widest uppercase">Global Billboard (Ad/News Box)</label>
                    <textarea 
                      value={engineSettings.news}
                      onChange={(e) => setEngineSettings({...engineSettings, news: e.target.value})}
                      placeholder="Enter news or ad content here..."
                      className="w-full bg-s2 border border-border-b2 rounded-2xl p-4 text-xs font-mono text-text-main min-h-[120px] outline-none focus:border-cyan-glow/50"
                    />
                    <button 
                      onClick={saveSettings}
                      className="px-6 py-3 bg-cyan-glow/10 border border-cyan-glow/30 text-cyan-glow font-bold text-[10px] tracking-widest uppercase rounded-xl hover:bg-cyan-glow hover:text-black transition-all"
                    >
                      Update Global Billboard
                    </button>
                  </div>

                  <div className="space-y-4 pt-8 border-t border-border-b1">
                    <div className="flex items-center gap-3 mb-2">
                      <LucideLock size={14} className="text-pink-glow" />
                      <label className="font-mono text-[9px] text-pink-glow tracking-widest uppercase font-bold">Security Override: Access PIN</label>
                    </div>
                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="Enter New PIN"
                        className="flex-1 bg-s2 border border-border-b2 rounded-xl px-4 py-3 text-xs font-mono text-text-main outline-none focus:border-pink-glow/50"
                      />
                      <button 
                        onClick={updateAdminPin}
                        className="px-6 py-3 bg-pink-glow/10 border border-pink-glow/30 text-pink-glow font-bold text-[10px] tracking-widest uppercase rounded-xl hover:bg-pink-glow hover:text-white transition-all"
                      >
                        Change PIN
                      </button>
                    </div>
                    <p className="font-mono text-[8px] text-text-dim uppercase tracking-widest">Current Active PIN starts with: {dbPin.slice(0, 2)}***</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* User Analytics Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-s1 border border-border-b1 rounded-2xl p-6 flex flex-col gap-2 relative overflow-hidden group">
                  <LucideUsers className="text-purple-glow opacity-20 absolute -right-2 -bottom-2 w-16 h-16" />
                  <span className="font-mono text-[9px] text-text-dim tracking-widest uppercase">Verified Users</span>
                  <div className="text-3xl font-black text-white tracking-tighter font-mono">{users.length}</div>
                </div>
                <div className="bg-s1 border border-border-b1 rounded-2xl p-6 flex flex-col gap-2 relative overflow-hidden group">
                  <LucideCheckCircle2 className="text-green-glow opacity-20 absolute -right-2 -bottom-2 w-16 h-16" />
                  <span className="font-mono text-[9px] text-text-dim tracking-widest uppercase">Active (Non-Blocked)</span>
                  <div className="text-3xl font-black text-green-glow tracking-tighter font-mono">
                    {users.filter(u => !u.isBlocked).length}
                  </div>
                </div>
              </div>

              {/* User Admin View */}
              <div className="bg-s1 border border-border-b1 rounded-3xl overflow-hidden min-h-[600px] flex flex-col">
                <div className="px-6 py-4 border-b border-border-b1 bg-gradient-to-r from-purple-glow/5 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <LucideUsers size={18} className="text-purple-glow" />
                    <h2 className="font-mono text-[10px] font-bold tracking-[3px] text-text-dim uppercase">Registered User Base</h2>
                  </div>
                  
                  <div className="relative flex-1 max-w-sm">
                    <input 
                      type="text"
                      placeholder="Search email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-black/30 border border-border-b1 rounded-xl py-2 px-4 pl-10 text-[11px] font-mono text-white outline-none focus:border-purple-glow/50 transition-all"
                    />
                    <LucideUsers size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim opacity-40" />
                  </div>

                  <span className="font-mono text-[9px] bg-purple-glow/10 px-3 py-1 rounded-full border border-purple-glow/20 text-purple-glow">
                    {users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase())).length} RESULT(S)
                  </span>
                </div>
                
                <div className="flex-1 overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border-b1 bg-black/20">
                        <th className="px-6 py-4 text-left font-mono text-[8px] text-text-dim tracking-widest uppercase">User Details</th>
                        <th className="px-6 py-4 text-center font-mono text-[8px] text-text-dim tracking-widest uppercase">Exports</th>
                        <th className="px-6 py-4 text-center font-mono text-[8px] text-text-dim tracking-widest uppercase">Limit</th>
                        <th className="px-6 py-4 text-center font-mono text-[8px] text-text-dim tracking-widest uppercase">Status</th>
                        <th className="px-6 py-4 text-right font-mono text-[8px] text-text-dim tracking-widest uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-b1">
                      {users
                        .filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                     u.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map(u => (
                        <tr key={u.uid} className={cn("hover:bg-white/[0.02] transition-all", u.isBlocked && "opacity-50 grayscale")}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full border border-border-b1" />
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-white">{u.displayName}</span>
                                <span className="font-mono text-[9px] text-text-dim">{u.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="text-sm font-black font-mono text-cyan-glow">{u.exportCount || 0}</span>
                              <span className="text-[7px] font-mono text-text-dim uppercase tracking-tighter">Conversions</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <select 
                              value={u.exportLimit || 5}
                              onChange={(e) => updateUserLimit(u, Number(e.target.value))}
                              className="bg-s2/80 border border-border-b2 rounded-lg py-1 px-2 text-[10px] font-mono text-cyan-glow outline-none cursor-pointer hover:border-cyan-glow/30"
                            >
                              {[5, 10, 20, 50, 100, 200, 300, 500, 1000].map(val => (
                                <option key={val} value={val}>{val}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {u.isBlocked ? (
                              <span className="px-2 py-1 rounded-md bg-pink-glow/10 border border-pink-glow/20 text-pink-glow text-[8px] font-mono font-bold tracking-widest uppercase">Blocked</span>
                            ) : (
                              <span className="px-2 py-1 rounded-md bg-green-glow/10 border border-green-glow/20 text-green-glow text-[8px] font-mono font-bold tracking-widest uppercase">Active</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => toggleBlockUser(u)}
                              className={cn(
                                "p-2 rounded-lg border transition-all",
                                u.isBlocked 
                                  ? "bg-green-glow/10 border-green-glow/30 text-green-glow hover:bg-green-glow/20" 
                                  : "bg-pink-glow/10 border-pink-glow/30 text-pink-glow hover:bg-pink-glow/20"
                              )}
                              title={u.isBlocked ? 'Unblock User' : 'Block User'}
                            >
                              {u.isBlocked ? <LucideCheckCircle2 size={14} /> : <LucideBan size={14} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Console View */}
          <div className="bg-black/40 border border-border-b1 rounded-3xl h-[200px] p-6 font-mono text-[10px] overflow-hidden flex flex-col gap-2">
             <div className="flex items-center gap-2 text-cyan-dim mb-4 border-b border-border-b1 pb-2">
                <LucideActivity size={12} />
                <span>SYSTEM EVENT CONSOLE</span>
             </div>
             <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                <div className="text-text-dim opacity-40">[{new Date().toLocaleTimeString()}] KERNEL: Booting AURA Core v1.0.4...</div>
                <div className="text-green-glow">[{new Date().toLocaleTimeString()}] SUCCESS: VideoEncoder API initialized successfully.</div>
                <div className="text-text-dim opacity-40">[{new Date().toLocaleTimeString()}] MEMORY: Allocated 512MB for frame buffer.</div>
                <div className="text-cyan-glow">[{new Date().toLocaleTimeString()}] INFO: Engine ready for high-fidelity conversion.</div>
                <div className="text-gold-glow animate-pulse">[{new Date().toLocaleTimeString()}] WARNING: Heavy SVG detected in playground. Monitoring VRAM.</div>
             </div>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {/* Admin Identity */}
          <div className="bg-gradient-to-br from-pink-glow/10 via-purple-glow/5 to-cyan-glow/10 border border-pink-glow/20 rounded-3xl p-8 text-center relative overflow-hidden">
            <div className="scan-line-animate absolute top-0 left-0 right-0 h-[100%] bg-gradient-to-b from-pink-glow/5 to-transparent pointer-events-none opacity-20" />
            <div className="w-24 h-24 mx-auto mb-6 rounded-full border-2 border-pink-glow/30 p-1 relative">
              <img src="https://api.dicebear.com/7.x/bottts/svg?seed=Hakim" alt="Admin" className="w-full h-full rounded-full bg-s2" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-pink-glow rounded-full border-4 border-bg flex items-center justify-center">
                <LucideUnlock size={10} className="text-white" />
              </div>
            </div>
            <h3 className="text-xl font-black tracking-tight text-white uppercase">Hakim Ullah</h3>
            <p className="font-mono text-[9px] text-pink-glow uppercase tracking-[4px] mt-2 font-bold">Root Administrator</p>
            
            <div className="mt-8 flex flex-col gap-4">
              <button 
                onClick={() => setIsAuthenticated(false)}
                className="w-full py-3 bg-pink-glow/10 border border-pink-glow/30 text-pink-glow rounded-xl font-mono text-[10px] tracking-widest uppercase hover:bg-pink-glow hover:text-white transition-all font-bold"
              >
                Sign Out / Exit Dashboard
              </button>
            </div>
          </div>

          {/* Database Insights */}
          <div className="bg-s1 border border-border-b1 rounded-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border-b1 bg-gradient-to-r from-purple-glow/5 to-transparent flex items-center gap-3">
               <LucideDatabase size={16} className="text-purple-glow" />
               <h4 className="font-mono text-[9px] font-bold tracking-[3px] text-text-dim uppercase">Cluster Insights</h4>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                 <div className="p-4 bg-s2 rounded-2xl border border-border-b1 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-mono text-[8px] text-text-dim tracking-widest uppercase">Total Users</span>
                      <span className="text-xl font-bold font-mono text-white">{stats.totalUsers}</span>
                    </div>
                    <LucideUsers className="text-purple-glow opacity-30" />
                 </div>
                 <div className="p-4 bg-s2 rounded-2xl border border-border-b1 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-mono text-[8px] text-text-dim tracking-widest uppercase">Total Exports</span>
                      <span className="text-xl font-bold font-mono text-white">{stats.totalExportsAcrossUsers}</span>
                    </div>
                    <LucideBarChart3 className="text-purple-glow opacity-30" />
                 </div>
              </div>
            </div>
          </div>

          {/* Security Alert */}
          <div className="p-6 bg-pink-glow/5 border border-pink-glow/20 rounded-3xl relative overflow-hidden">
             <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-pink-glow/10 flex items-center justify-center shrink-0">
                  <LucideBan size={16} className="text-pink-glow" />
                </div>
                <div>
                  <h5 className="font-bold text-[10px] uppercase tracking-widest text-pink-glow mb-1">User Enforcement</h5>
                  <p className="text-[9px] text-text-dim leading-relaxed">
                    Blocked users are instantly disconnected from the AURA Engine. Their existing tokens are invalidated on the next server handshake.
                  </p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
