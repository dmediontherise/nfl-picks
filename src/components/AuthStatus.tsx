import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, LogOut, AlertCircle } from 'lucide-react';

export const AuthStatus: React.FC = () => {
  const { user, signInWithGoogle, logout, demoMode } = useAuth();

  if (demoMode) {
      return (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-xs text-slate-500" title="Add Firebase keys to enable Cloud Sync">
              <AlertCircle className="w-3 h-3" />
              <span>Local Mode</span>
          </div>
      );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2">
            {user.photoURL && (
                <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full border border-slate-600" />
            )}
            <div className="flex flex-col">
                <span className="text-xs font-bold text-white leading-none">{user.displayName}</span>
                <span className="text-[9px] text-slate-500 leading-none">Cloud Sync Active</span>
            </div>
        </div>
        <button 
          onClick={() => logout()}
          className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-red-400 transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signInWithGoogle()}
      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-xs font-bold shadow-lg shadow-blue-900/20 active:scale-95"
    >
      <LogIn className="w-4 h-4" />
      <span className="hidden sm:inline">Sign In</span>
    </button>
  );
};
