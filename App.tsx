
import React, { useState, useCallback, useEffect } from 'react';
import { LayoutSetup } from './components/LayoutSetup';
import { MainView } from './components/MainView';
import { Inbound } from './components/Inbound';
import { StockHistory } from './components/StockHistory';
import { Auth } from './components/Auth';
import { AdminDashboard } from './components/AdminDashboard';
import { NotificationBell } from './components/NotificationBell';
import type { Layout, AppPhase, StockItem, PendingItem, Transaction, Profile } from './types';
import { Truck, Search, Settings, ClipboardList, History, WifiOff, Loader2, LogOut, Shield, Lock } from 'lucide-react';
import { api } from './api';
import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userDivisions, setUserDivisions] = useState<string[]>([]);
  const [authLoading, setAuthLoading] = useState(true);

  // Data State
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // UI State
  const [phase, setPhase] = useState<AppPhase | 'ADMIN'>('SEARCH');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Auth & Initial Data Load ---
  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
          fetchProfile(session.user.id);
      } else {
          setAuthLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
          fetchProfile(session.user.id);
      } else {
          // Clear data on logout
          setProfile(null);
          setLayouts([]);
          setItems([]);
          setPendingItems([]);
          setTransactions([]);
          setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
      try {
          const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();
          
          if (error) {
              console.error("Error fetching profile:", error);
              // Handle case where profile trigger might have failed or delayed
          } else {
              setProfile(data);
              
              // Fetch user divisions
              try {
                  const divisions = await api.getUserDivisions(userId);
                  setUserDivisions(divisions);
              } catch (e) {
                  console.error("Error fetching user divisions:", e);
              }

              if (data.is_approved) {
                  loadAllData();
              }
          }
      } catch (e) {
          console.error(e);
      } finally {
          setAuthLoading(false);
      }
  };

  const loadAllData = async () => {
    setIsLoading(true);
    setError(null);
    try {
        const [l, i, p, t] = await Promise.all([
            api.getLayouts(),
            api.getItems(),
            api.getPendingItems(),
            api.getTransactions()
        ]);
        setLayouts(l);
        setItems(i);
        setPendingItems(p);
        setTransactions(t);
    } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to connect to backend system.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
      await supabase.auth.signOut();
  };

  const handleSaveLayout = useCallback(async (newLayout: Layout) => {
    try {
        await api.saveLayout(newLayout);
        // Refresh layouts to ensure consistency
        const updatedLayouts = await api.getLayouts();
        setLayouts(updatedLayouts);
    } catch (e: any) {
        console.error("Save layout error:", e);
        alert(`Failed to save layout: ${e.message || e}`);
    }
  }, []);

  // --- Inbound Logic ---
  const handleAddPendingItems = async (newItems: PendingItem[]) => {
    try {
        await api.addPendingItems(newItems);
        const updated = await api.getPendingItems();
        setPendingItems(updated);
    } catch (e: any) {
        console.error("Failed to add items:", e);
        alert(`Failed to add items: ${e.message || e}`);
    }
  };

  const handleUpdatePendingItem = (updatedItem: PendingItem) => {
     // For now this is local, in real app we'd have an API endpoint for editing pending
     setPendingItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
  };

  const handleDeletePendingItem = async (id: string) => {
      console.log("Deleting pending item with ID:", id);
      try {
          await api.deletePendingItem(id);
          const updated = await api.getPendingItems();
          setPendingItems(updated);
      } catch (e) {
          console.error("Delete failed:", e);
          alert("Failed to delete item");
      }
  };

  const handleAllocateItem = async (pendingId: string, location: StockItem['location']) => {
    try {
        await api.allocateItem(pendingId, location);
        // Refresh data
        const [i, p, t] = await Promise.all([api.getItems(), api.getPendingItems(), api.getTransactions()]);
        setItems(i);
        setPendingItems(p);
        setTransactions(t);
    } catch (e) {
        alert("Allocation failed");
    }
  };

  // --- Direct Add Logic (from Rack View) ---
  const handleDirectAdd = async (newItems: PendingItem | PendingItem[], location: StockItem['location']) => {
    try {
        const itemsToAdd = Array.isArray(newItems) ? newItems : [newItems];
        
        // 1. Add to pending and get the DB ID
        const addedItems = await api.addPendingItems(itemsToAdd);

        if (addedItems.length === 0) throw new Error("Failed to create pending item");

        // 2. Immediately allocate using the DB ID
        for (const dbItem of addedItems) {
            await api.allocateItem(dbItem.id, location);
        }

        // 3. Refresh data
        const [i, p, t] = await Promise.all([api.getItems(), api.getPendingItems(), api.getTransactions()]);
        setItems(i);
        setPendingItems(p);
        setTransactions(t);
    } catch (e) {
        console.error("Direct add failed:", e);
        alert("Failed to add item directly to rack.");
    }
  };

  // --- Unstock Logic ---
    const handleUnstock = async (itemId: string, qtyToRemove: number, doNumber?: string) => {
      try {
          await api.unstockItem(itemId, qtyToRemove, doNumber);
          const [i, t] = await Promise.all([api.getItems(), api.getTransactions()]);
          setItems(i);
          setTransactions(t);
      } catch (e: any) {
          console.error("Unstock Error:", e);
          alert("Unstock failed: " + (e.message || "Unknown Error"));
      }
    };

    // --- Restock Logic ---
    const handleRestock = async (transactionId: string) => {
      try {
        await api.restockTransaction(transactionId);
        const [i, t] = await Promise.all([api.getItems(), api.getTransactions()]);
        setItems(i);
        setTransactions(t);
    } catch (e) {
        alert("Restock failed");
    }
  };

  // --- Reallocate Logic ---
  const handleReallocate = async (itemId: string, quantity: number, newLocation: StockItem['location']) => {
    try {
        await api.reallocateItem(itemId, quantity, newLocation);
        const [i, t] = await Promise.all([api.getItems(), api.getTransactions()]);
        setItems(i);
        setTransactions(t);
    } catch (e: any) {
        console.error("Reallocate failed:", e);
        alert(`Reallocation failed: ${e.message || e}`);
    }
  };

  // --- Access Control ---
  const accessibleLayouts = React.useMemo(() => {
      if (!profile || profile.role === 'admin') return layouts;
      return layouts.filter(l => 
          !l.divisionIds || l.divisionIds.length === 0 || l.divisionIds.some(id => userDivisions.includes(id))
      );
  }, [layouts, profile, userDivisions]);

  const accessibleItems = React.useMemo(() => {
      if (!profile || profile.role === 'admin') return items;
      const allowedIds = new Set(accessibleLayouts.map(l => l.id));
      return items.filter(i => allowedIds.has(i.location.layoutId));
  }, [items, accessibleLayouts, profile]);

  if (authLoading) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
          </div>
      );
  }

  if (!session) {
      return <Auth />;
  }

  // Pending Approval Screen
  if (profile && !profile.is_approved) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white p-4">
              <div className="bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full border border-gray-700 text-center">
                  <Lock className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
                  <h2 className="text-2xl font-bold mb-2">Access Pending</h2>
                  <p className="text-gray-400 mb-6">
                      Your account is waiting for administrator approval. 
                      Please contact your manager or wait for access to be granted.
                  </p>
                  <div className="bg-gray-900 p-3 rounded text-sm text-gray-500 mb-6">
                      Account: <span className="text-white">{session.user.email}</span>
                  </div>
                  <button 
                      onClick={handleSignOut}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
                  >
                      Sign Out
                  </button>
              </div>
          </div>
      );
  }

  if (isLoading) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
              <div className="text-center">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-blue-500" />
                  <h2 className="text-xl font-bold">Loading Warehouse Data...</h2>
              </div>
          </div>
      );
  }

  if (error) {
      const isTableError = error.includes("Could not find the table") || error.includes("relation") || error.includes("does not exist");
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white p-4">
              <div className="text-center max-w-2xl">
                  <WifiOff className="w-16 h-16 mx-auto mb-4 text-red-500" />
                  <h2 className="text-2xl font-bold mb-2">Connection Error</h2>
                  <p className="text-gray-400 mb-6">{error}</p>
                  
                  {isTableError && (
                      <div className="bg-gray-800 p-4 rounded-lg text-left mb-6 border border-gray-700">
                          <h3 className="text-yellow-400 font-bold mb-2">Database Setup Required</h3>
                          <p className="text-sm text-gray-300 mb-2">
                              The database tables have not been created yet. Please run the SQL from 
                              <code className="bg-gray-900 px-1 py-0.5 rounded mx-1">supabase_schema.sql</code> 
                              in your Supabase SQL Editor.
                          </p>
                      </div>
                  )}

                  <div className="flex justify-center gap-4">
                    <button onClick={loadAllData} className="bg-blue-600 px-6 py-2 rounded font-bold hover:bg-blue-700">
                        Retry Connection
                    </button>
                    <button onClick={handleSignOut} className="px-6 py-2 rounded font-bold text-gray-400 hover:text-white hover:bg-gray-800">
                        Sign Out
                    </button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-20">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Truck className="h-8 w-8 text-blue-400" />
              <span className="ml-3 text-2xl font-bold tracking-tight text-white hidden sm:block">Mapper</span>
              <span className="ml-3 text-xl font-bold tracking-tight text-white sm:hidden">WMP</span>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <NavButton Icon={ClipboardList} label="Inbound" isActive={phase === 'INBOUND'} onClick={() => setPhase('INBOUND')} badge={pendingItems.length || undefined} />
              <NavButton Icon={Search} label="Search" isActive={phase === 'SEARCH'} onClick={() => setPhase('SEARCH')} />
              <NavButton Icon={History} label="History" isActive={phase === 'HISTORY'} onClick={() => setPhase('HISTORY')} />
              <NavButton Icon={Settings} label="Setup" isActive={phase === 'SETUP'} onClick={() => setPhase('SETUP')} />
              
              {profile?.role === 'admin' && (
                  <NavButton Icon={Shield} label="Admin" isActive={phase === 'ADMIN'} onClick={() => setPhase('ADMIN')} />
              )}

              <div className="h-6 w-px bg-gray-700 mx-2"></div>
              
              <NotificationBell />
              
              <button 
                onClick={handleSignOut}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </nav>
      </header>
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        {phase === 'SETUP' && (
          <LayoutSetup onSaveLayout={handleSaveLayout} layouts={layouts} />
        )}
        {phase === 'SEARCH' && (
          <MainView 
            layouts={accessibleLayouts} 
            items={accessibleItems}
            transactions={transactions}
            onUnstock={handleUnstock}
            onReallocate={handleReallocate}
            onDirectAdd={handleDirectAdd}
            isAdmin={profile?.role === 'admin'}
            onUpdateLayout={handleSaveLayout}
          />
        )}
        {phase === 'INBOUND' && (
           <Inbound 
              layouts={layouts} 
              pendingItems={pendingItems} 
              onAddPending={handleAddPendingItems} 
              onUpdatePending={handleUpdatePendingItem}
              onDeletePending={handleDeletePendingItem}
              onAllocate={handleAllocateItem} 
            />
        )}
        {phase === 'HISTORY' && (
           <StockHistory transactions={transactions} onRestock={handleRestock} layouts={layouts} />
        )}
        {phase === 'ADMIN' && profile?.role === 'admin' && (
            <AdminDashboard />
        )}
      </main>
    </div>
  );
};

interface NavButtonProps {
    Icon: React.ElementType;
    label: string;
    isActive: boolean;
    onClick: () => void;
    badge?: number;
}

const NavButton: React.FC<NavButtonProps> = ({ Icon, label, isActive, onClick, badge }) => (
    <button
        onClick={onClick}
        className={`relative flex items-center px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 focus:outline-none ${
            isActive 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
    >
        <Icon className="h-5 w-5 sm:mr-2" />
        <span className="hidden sm:inline">{label}</span>
        {badge ? (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {badge}
            </span>
        ) : null}
    </button>
);


export default App;
