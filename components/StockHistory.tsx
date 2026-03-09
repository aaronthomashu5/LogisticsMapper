
import React, { useState, useMemo } from 'react';
import type { Transaction, Layout } from '../types';
import * as XLSX from 'xlsx';
import { History, RefreshCw, MapPin, Filter, Search, Calendar, ArrowUpDown, X, ArrowRight, FileDown } from 'lucide-react';

interface StockHistoryProps {
  transactions: Transaction[];
  onRestock: (txnId: string) => void;
  layouts: Layout[];
}

type SortOption = 'date_desc' | 'date_asc' | 'qty_desc' | 'qty_asc';

export const StockHistory: React.FC<StockHistoryProps> = ({ transactions, onRestock, layouts }) => {
  // Filter States
  const [itemSearch, setItemSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState(''); // For Shelf/Rack
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>(''); // For "Division"/Layout
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortOption, setSortOption] = useState<SortOption>('date_desc');
  const [showFilters, setShowFilters] = useState(false);

  const getLocationString = (location: Transaction['originalLocation']) => {
      if (!location) return 'Unknown Location';
      const layout = layouts.find(l => l.id === location.layoutId);
      
      let shelf: any = undefined;
      if (layout) {
          for (const s of layout.shelves.values()) {
              if (s.id === location.shelfId) {
                  shelf = s;
                  break;
              }
          }
      }

      const rackLabel = shelf?.rackLabels?.[location.rackNumber - 1] || `Rack ${location.rackNumber}`;
      
      return `${layout?.name || 'Unknown Layout'} > ${shelf?.label || 'Unknown Shelf'} > ${rackLabel}`;
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(txn => {
      // Date Filter
      if (startDate) {
        const start = new Date(startDate).setHours(0, 0, 0, 0);
        if (txn.timestamp < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        if (txn.timestamp > end) return false;
      }

      // Item Filter
      if (itemSearch && 
            !txn.itemName.toLowerCase().includes(itemSearch.toLowerCase()) && 
            !(txn.doNumber && txn.doNumber.toLowerCase().includes(itemSearch.toLowerCase()))
      ) return false;

      // Layout/Division Filter
      if (selectedLayoutId && txn.originalLocation?.layoutId !== selectedLayoutId) return false;

      // Shelf/Rack Filter (Search within the generated location string)
      if (locationSearch) {
         const locString = getLocationString(txn.originalLocation).toLowerCase();
         if (!locString.includes(locationSearch.toLowerCase())) return false;
         // Also search new location if it exists
         if (txn.newLocation) {
             const newLocString = getLocationString(txn.newLocation).toLowerCase();
             if (newLocString.includes(locationSearch.toLowerCase())) return true; // Match found in destination
         }
      }

      return true;
    }).sort((a, b) => {
       // Sorting
       if (sortOption === 'date_desc') return b.timestamp - a.timestamp;
       if (sortOption === 'date_asc') return a.timestamp - b.timestamp;
       if (sortOption === 'qty_desc') return Math.abs(b.quantityChanged) - Math.abs(a.quantityChanged);
       if (sortOption === 'qty_asc') return Math.abs(a.quantityChanged) - Math.abs(b.quantityChanged);
       return 0;
    });
  }, [transactions, startDate, endDate, itemSearch, locationSearch, selectedLayoutId, sortOption, layouts]);

  const clearFilters = () => {
      setItemSearch('');
      setLocationSearch('');
      setSelectedLayoutId('');
      setStartDate('');
      setEndDate('');
      setSortOption('date_desc');
  };

  const hasActiveFilters = itemSearch || locationSearch || selectedLayoutId || startDate || endDate || sortOption !== 'date_desc';

  const handleExportHistory = () => {
      if (!startDate && !endDate) {
          alert("Please set a Start Date or End Date filter first to avoid large data export.");
          setShowFilters(true);
          return;
      }

      const data = filteredTransactions.map(txn => ({
          "Date": new Date(txn.timestamp).toLocaleString(),
          "Item Name": txn.itemName,
          "Quantity": Math.abs(txn.quantityChanged),
          "Type": txn.newLocation ? 'MOVE' : (txn.quantityChanged > 0 ? 'IN' : 'OUT'),
          "DO Number": txn.doNumber || '-',
          "From Location": getLocationString(txn.originalLocation),
          "To Location": txn.newLocation ? getLocationString(txn.newLocation) : '-',
          "Restocked": txn.isRestocked ? 'Yes' : 'No'
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "History");
      XLSX.writeFile(wb, `History_Export_${startDate || 'start'}_to_${endDate || 'now'}.xlsx`);
  };

  return (
    <div className="space-y-6">
       <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <History className="text-blue-400" />
                    Stock Movement History
                </h1>
                <p className="text-gray-400 text-sm">Log of stock movements. Tracks origin location for unstocked items.</p>
            </div>
            <div className="flex gap-2">
                <button 
                  onClick={handleExportHistory}
                  className="flex items-center gap-2 px-3 py-2 rounded-md font-medium transition-colors bg-green-900/50 text-green-200 border border-green-700 hover:bg-green-800"
                  title="Export filtered history to Excel (Requires date range)"
                >
                    <FileDown size={18} />
                    Export
                </button>
                <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${showFilters ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                    <Filter size={18} />
                    Filters & Sort
                    {hasActiveFilters && <span className="w-2 h-2 bg-red-500 rounded-full ml-1"></span>}
                </button>
            </div>
          </div>

          {showFilters && (
              <div className="bg-gray-900/50 p-4 rounded-md border border-gray-700 space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Item/DO Search */}
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">Item Name or DO #</label>
                          <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                              <input 
                                  type="text" 
                                  value={itemSearch}
                                  onChange={(e) => setItemSearch(e.target.value)}
                                  placeholder="Search items or DO#..."
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 pl-9 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                              />
                          </div>
                      </div>

                      {/* Location Search */}
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">Shelf / Rack</label>
                          <div className="relative">
                              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                              <input 
                                  type="text" 
                                  value={locationSearch}
                                  onChange={(e) => setLocationSearch(e.target.value)}
                                  placeholder="Search location..."
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 pl-9 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                              />
                          </div>
                      </div>

                      {/* Layout/Division Filter */}
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">Division / Layout</label>
                          <select 
                              value={selectedLayoutId}
                              onChange={(e) => setSelectedLayoutId(e.target.value)}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                          >
                              <option value="">All Divisions</option>
                              {layouts.map(l => (
                                  <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                          </select>
                      </div>

                      {/* Date Range */}
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">Start Date</label>
                          <div className="relative">
                              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                              <input 
                                  type="date" 
                                  value={startDate}
                                  onChange={(e) => setStartDate(e.target.value)}
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 pl-9 py-2 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                              />
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">End Date</label>
                          <div className="relative">
                              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                              <input 
                                  type="date" 
                                  value={endDate}
                                  onChange={(e) => setEndDate(e.target.value)}
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 pl-9 py-2 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                              />
                          </div>
                      </div>

                      {/* Sorting */}
                      <div>
                          <label className="block text-xs text-gray-400 mb-1">Sort By</label>
                          <div className="relative">
                              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                              <select 
                                  value={sortOption}
                                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 pl-9 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                              >
                                  <option value="date_desc">Date (Newest First)</option>
                                  <option value="date_asc">Date (Oldest First)</option>
                                  <option value="qty_desc">Quantity (High to Low)</option>
                                  <option value="qty_asc">Quantity (Low to High)</option>
                              </select>
                          </div>
                      </div>
                  </div>
                  
                  <div className="flex justify-end pt-2 border-t border-gray-700">
                      <button 
                          onClick={clearFilters}
                          className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                      >
                          <X size={14} /> Clear Filters
                      </button>
                  </div>
              </div>
          )}
       </div>

       <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="divide-y divide-gray-700">
             {filteredTransactions.length === 0 && (
                 <div className="p-8 text-center text-gray-500">
                     {transactions.length === 0 ? "No history available yet." : "No transactions match your filters."}
                 </div>
             )}
             {filteredTransactions.map(txn => (
                 <div key={txn.id} className="p-4 flex items-center justify-between hover:bg-gray-750 transition-colors">
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold px-2 py-0.5 rounded ${txn.newLocation ? 'bg-blue-900 text-blue-200' : (txn.quantityChanged < 0 ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200')}`}>
                                {txn.newLocation ? 'MOVE' : (txn.quantityChanged < 0 ? 'OUT' : 'IN')}
                            </span>
                            <h4 className="font-bold text-white">{txn.itemName}</h4>
                        </div>
                        <div className="text-sm text-gray-400 mt-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <span>{new Date(txn.timestamp).toLocaleString()}</span>
                            <span className="hidden sm:inline">•</span>
                            <span className="font-mono text-gray-300">Qty: {Math.abs(txn.quantityChanged)}</span>
                            {txn.doNumber && (
                                <>
                                    <span className="hidden sm:inline">•</span>
                                    <span className="text-yellow-400 font-mono">DO: {txn.doNumber}</span>
                                </>
                            )}
                            
                            {txn.newLocation ? (
                                <>
                                    <span className="hidden sm:inline">•</span>
                                    <span className="flex items-center gap-1 text-gray-300">
                                        <MapPin size={12} className="text-blue-400" />
                                        {getLocationString(txn.originalLocation)} 
                                        <ArrowRight size={12} className="text-gray-500" /> 
                                        {getLocationString(txn.newLocation)}
                                    </span>
                                </>
                            ) : (
                                txn.originalLocation && (
                                    <>
                                        <span className="hidden sm:inline">•</span>
                                        <span className="flex items-center gap-1 text-blue-400">
                                            <MapPin size={12} />
                                            {getLocationString(txn.originalLocation)}
                                        </span>
                                    </>
                                )
                            )}
                        </div>
                    </div>
                    
                    {!txn.isRestocked && txn.quantityChanged < 0 && !txn.newLocation && (
                        <button 
                            onClick={() => onRestock(txn.id)}
                            className="flex items-center gap-2 bg-gray-700 hover:bg-blue-600 text-gray-200 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-all group"
                        >
                            <RefreshCw size={16} className="group-hover:rotate-180 transition-transform" />
                            Restock
                        </button>
                    )}
                    {txn.isRestocked && (
                        <span className="flex items-center gap-1 text-green-400 text-sm font-medium">
                            <CheckCircleIcon /> Restocked
                        </span>
                    )}
                 </div>
             ))}
          </div>
       </div>
    </div>
  );
};

const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);
