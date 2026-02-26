import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Profile, Division } from '../types';
import { api } from '../api';
import { Check, X, Shield, ShieldOff, Loader2, User, Filter, Search, Briefcase, Plus, Trash2 } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [userDivisions, setUserDivisions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'pofis'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [newDivisionName, setNewDivisionName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
        const [profilesData, divisionsData] = await Promise.all([
            supabase.from('profiles').select('*').order('created_at', { ascending: false }),
            api.getDivisions()
        ]);

        if (profilesData.error) throw profilesData.error;
        setProfiles(profilesData.data || []);
        setDivisions(divisionsData);

        // Fetch user divisions for all users
        const userDivs: Record<string, string[]> = {};
        await Promise.all(profilesData.data?.map(async (p) => {
            const divs = await api.getUserDivisions(p.id);
            userDivs[p.id] = divs;
        }) || []);
        setUserDivisions(userDivs);

    } catch (error) {
        console.error('Error fetching data:', error);
    } finally {
        setLoading(false);
    }
  };

  const toggleApproval = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: !currentStatus })
      .eq('id', id);

    if (error) {
      alert('Failed to update status');
    } else {
      setProfiles(profiles.map(p => p.id === id ? { ...p, is_approved: !currentStatus } : p));
    }
  };

  const toggleAdmin = async (id: string, currentRole: 'user' | 'admin') => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', id);

    if (error) {
      alert('Failed to update role');
    } else {
      setProfiles(profiles.map(p => p.id === id ? { ...p, role: newRole } : p));
    }
  };

  const handleCreateDivision = async () => {
      if (!newDivisionName.trim()) return;
      try {
          const newDiv = await api.createDivision(newDivisionName);
          setDivisions([...divisions, newDiv]);
          setNewDivisionName('');
      } catch (e) {
          alert("Failed to create division");
      }
  };

  const handleDivisionChange = async (userId: string, divisionId: string, isChecked: boolean) => {
      const currentDivs = userDivisions[userId] || [];
      let newDivs;
      if (isChecked) {
          newDivs = [...currentDivs, divisionId];
      } else {
          newDivs = currentDivs.filter(id => id !== divisionId);
      }
      
      try {
          await api.setUserDivisions(userId, newDivs);
          setUserDivisions({ ...userDivisions, [userId]: newDivs });
      } catch (e) {
          alert("Failed to update user divisions");
      }
  };

  const filteredProfiles = profiles.filter(profile => {
    const matchesSearch = profile.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = 
      filter === 'all' ? true :
      filter === 'pending' ? !profile.is_approved :
      filter === 'pofis' ? profile.email.endsWith('@pofis.ae') : true;
    
    return matchesSearch && matchesFilter;
  });

  const pendingCount = profiles.filter(p => !p.is_approved).length;
  const pofisCount = profiles.filter(p => p.email.endsWith('@pofis.ae')).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-sm">
          <div className="text-gray-400 text-sm font-medium">Total Users</div>
          <div className="text-2xl font-bold text-white mt-1">{profiles.length}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-sm">
          <div className="text-gray-400 text-sm font-medium">Pending Approval</div>
          <div className="text-2xl font-bold text-yellow-500 mt-1">{pendingCount}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-sm">
          <div className="text-gray-400 text-sm font-medium">@pofis.ae Users</div>
          <div className="text-2xl font-bold text-blue-500 mt-1">{pofisCount}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-sm">
          <div className="text-gray-400 text-sm font-medium">Divisions</div>
          <div className="text-2xl font-bold text-purple-500 mt-1">{divisions.length}</div>
        </div>
      </div>

      {/* Division Management */}
      <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden border border-gray-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Briefcase className="text-purple-500" /> Manage Divisions
          </h3>
          <div className="flex gap-2 mb-4">
              <input 
                  type="text" 
                  value={newDivisionName}
                  onChange={(e) => setNewDivisionName(e.target.value)}
                  placeholder="New Division Name (e.g. 'Marketing')"
                  className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white flex-1 focus:ring-2 focus:ring-purple-500 outline-none"
              />
              <button 
                  onClick={handleCreateDivision}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
              >
                  <Plus size={18} /> Add
              </button>
          </div>
          <div className="flex flex-wrap gap-2">
              {divisions.map(div => (
                  <span key={div.id} className="bg-gray-700 text-gray-200 px-3 py-1 rounded-full text-sm border border-gray-600">
                      {div.name}
                  </span>
              ))}
          </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden border border-gray-700">
        <div className="p-6 border-b border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Shield className="text-blue-500" />
              User Administration
            </h2>
            <p className="text-gray-400 mt-1">Manage access, roles, and divisions.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="Search email..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-md text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64"
                />
             </div>
             <div className="flex bg-gray-900 rounded-md p-1 border border-gray-600">
                <button 
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${filter === 'all' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  All
                </button>
                <button 
                  onClick={() => setFilter('pending')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${filter === 'pending' ? 'bg-yellow-900/50 text-yellow-200' : 'text-gray-400 hover:text-white'}`}
                >
                  Pending
                </button>
                <button 
                  onClick={() => setFilter('pofis')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${filter === 'pofis' ? 'bg-blue-900/50 text-blue-200' : 'text-gray-400 hover:text-white'}`}
                >
                  @pofis.ae
                </button>
             </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Divisions</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredProfiles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No users found matching your filters.
                  </td>
                </tr>
              )}
              {filteredProfiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-gray-750 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${profile.email.endsWith('@pofis.ae') ? 'bg-blue-600' : 'bg-gray-600'}`}>
                        {profile.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="font-medium text-white">{profile.email.split('@')[0]}</div>
                            <div className="text-xs text-gray-500">{profile.email}</div>
                        </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${profile.role === 'admin' ? 'bg-purple-900 text-purple-200' : 'bg-gray-700 text-gray-300'}`}>
                      {profile.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                          {divisions.map(div => {
                              const isAssigned = (userDivisions[profile.id] || []).includes(div.id);
                              return (
                                  <label key={div.id} className={`cursor-pointer px-2 py-1 rounded text-xs border ${isAssigned ? 'bg-blue-900/30 border-blue-500 text-blue-200' : 'bg-gray-800 border-gray-600 text-gray-500 hover:border-gray-400'}`}>
                                      <input 
                                          type="checkbox" 
                                          className="hidden"
                                          checked={isAssigned}
                                          onChange={(e) => handleDivisionChange(profile.id, div.id, e.target.checked)}
                                      />
                                      {div.name}
                                  </label>
                              );
                          })}
                      </div>
                  </td>
                  <td className="px-6 py-4">
                    {profile.is_approved ? (
                      <span className="flex items-center gap-1 text-green-400 text-sm">
                        <CheckCircleIcon className="w-4 h-4" /> Approved
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-500 text-sm">
                        <ClockIcon className="w-4 h-4" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => toggleApproval(profile.id, profile.is_approved)}
                      className={`p-2 rounded hover:bg-gray-600 transition-colors ${profile.is_approved ? 'text-red-400 hover:bg-red-900/20' : 'text-green-400 hover:bg-green-900/20'}`}
                      title={profile.is_approved ? "Revoke Access" : "Approve Access"}
                    >
                      {profile.is_approved ? <X size={18} /> : <Check size={18} />}
                    </button>
                    <button
                      onClick={() => toggleAdmin(profile.id, profile.role)}
                      className={`p-2 rounded hover:bg-gray-600 transition-colors ${profile.role === 'admin' ? 'text-gray-400' : 'text-blue-400 hover:bg-blue-900/20'}`}
                      title={profile.role === 'admin' ? "Demote to User" : "Promote to Admin"}
                    >
                      {profile.role === 'admin' ? <ShieldOff size={18} /> : <Shield size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Simple icons for status
const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
