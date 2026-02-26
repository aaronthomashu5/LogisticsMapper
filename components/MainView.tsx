
import React, { useState, useMemo, useEffect } from 'react';
import type { Layout, StockItem, Shelf } from '../types';
import { 
  Search, X, Package, Warehouse, Layers, MinusCircle, 
  Filter, ChevronLeft, ChevronRight, ArrowUpDown, AlertTriangle, MapPin
} from 'lucide-react';

interface MainViewProps {
  layouts: Layout[];
  items: StockItem[];
  onUnstock: (itemId: string, amount: number) => void;
}

type SortField = 'name' | 'quantity' | 'location';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10;

export const MainView: React.FC<MainViewProps> = ({ layouts, items, onUnstock }) => {
  // Search & Filter State
  const [query, setQuery] = useState('');
  const [layoutFilter, setLayoutFilter] = useState<string>('ALL');
  const [showLowStock, setShowLowStock] = useState(false);
  
  // Sort & Pagination State
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Selection State
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [selectedLayout, setSelectedLayout] = useState<Layout | null>(null);
  const [selectedShelf, setSelectedShelf] = useState<Shelf | null>(null);
  const [unstockAmount, setUnstockAmount] = useState<string>('');

  // --- Logic ---

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const processedItems = useMemo(() => {
    let result = [...items];

    // 1. Filter by Query
    if (query) {
      const lowerQuery = query.toLowerCase();
      result = result.filter(item =>
        item.name.toLowerCase().includes(lowerQuery) || 
        item.lotNumber?.toLowerCase().includes(lowerQuery) ||
        item.id.toLowerCase().includes(lowerQuery)
      );
    }

    // 2. Filter by Layout
    if (layoutFilter !== 'ALL') {
      result = result.filter(item => item.location.layoutId === layoutFilter);
    }

    // 3. Filter by Low Stock (threshold < 50 for demo)
    if (showLowStock) {
      result = result.filter(item => item.quantity < 50);
    }

    // 4. Sorting
    result.sort((a, b) => {
      let valA: any = a[sortField as keyof StockItem];
      let valB: any = b[sortField as keyof StockItem];

      if (sortField === 'location') {
        // Create a comparable string for location
        const layoutA = layouts.find(l => l.id === a.location.layoutId)?.name || '';
        const layoutB = layouts.find(l => l.id === b.location.layoutId)?.name || '';
        valA = `${layoutA}-${a.location.shelfId}-${a.location.rackNumber}`;
        valB = `${layoutB}-${b.location.shelfId}-${b.location.rackNumber}`;
      }

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [items, query, layoutFilter, showLowStock, sortField, sortDirection, layouts]);

  // Pagination Logic
  const totalPages = Math.ceil(processedItems.length / ITEMS_PER_PAGE);
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return processedItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [processedItems, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [query, layoutFilter, showLowStock]);

  // --- Handlers ---

  const handleItemSelect = (item: StockItem) => {
    setSelectedItem(item);
    const layout = layouts.find(l => l.id === item.location.layoutId);
    if (layout) {
        setSelectedLayout(layout);
        const shelf = layout.shelves.get(item.location.shelfId);
        if (shelf) {
            setSelectedShelf(shelf);
        }
    }
    // Smooth scroll to top for details
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const handleUnstockClick = () => {
      if (!selectedItem || !unstockAmount) return;
      const qty = parseFloat(unstockAmount);
      if (isNaN(qty) || qty <= 0) return;
      if (qty > selectedItem.quantity) {
          alert("Cannot unstock more than available quantity.");
          return;
      }
      onUnstock(selectedItem.id, qty);
      setUnstockAmount('');
      // Update selected item reference locally to reflect change immediately in UI
      setSelectedItem(prev => prev ? {...prev, quantity: prev.quantity - qty} : null);
  };

  const clearSelection = () => {
    setSelectedItem(null);
    setSelectedLayout(null);
    setSelectedShelf(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Search and Filters Section */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-lg space-y-4">
        <h1 className="text-2xl font-bold">Stock Locator</h1>
        
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Name, ID, or Lot Number..."
            className="w-full bg-gray-700 text-white pl-10 pr-10 py-3 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Filters & Tools */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-t border-gray-700 pt-4">
            <div className="flex flex-wrap gap-3 w-full md:w-auto">
                <div className="flex items-center gap-2 bg-gray-700 rounded-md px-3 py-2">
                    <Filter size={16} className="text-gray-400" />
                    <select 
                        value={layoutFilter}
                        onChange={(e) => setLayoutFilter(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm text-white cursor-pointer"
                    >
                        <option value="ALL">All Layouts</option>
                        {layouts.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>
                </div>

                <button 
                    onClick={() => setShowLowStock(!showLowStock)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        showLowStock ? 'bg-orange-900/50 text-orange-200 border border-orange-700' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                    <AlertTriangle size={16} />
                    Low Stock
                </button>
            </div>
            
            <div className="text-xs text-gray-400">
                Showing {processedItems.length} items
            </div>
        </div>
      </div>

      {/* Selected Item Detail View (Visible when an item is clicked) */}
      {selectedItem && selectedLayout && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-4">
            <div className="lg:col-span-2 space-y-6">
                {/* Item Controls */}
                <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-blue-500/30 relative">
                    <button onClick={clearSelection} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                    <div className="flex justify-between items-start mb-4 pr-8">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Package className="text-blue-400" />
                                {selectedItem.name}
                            </h2>
                            <div className="mt-1 flex gap-4 text-sm text-gray-400">
                                <span>Lot: <span className="text-gray-200">{selectedItem.lotNumber || 'N/A'}</span></span>
                                <span>Spec: <span className="text-gray-200">{selectedItem.specification || 'N/A'}</span></span>
                            </div>
                        </div>
                        <div className="text-right hidden sm:block">
                            <div className="text-2xl font-bold text-blue-400">{selectedItem.quantity} <span className="text-sm text-gray-400">{selectedItem.unit}</span></div>
                            <div className="text-xs text-gray-500">Available</div>
                        </div>
                    </div>
                    
                    <div className="bg-gray-700/50 p-4 rounded-md border border-gray-600 flex flex-col sm:flex-row gap-4 items-end sm:items-center">
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-medium text-gray-400 mb-1">Unstock Item</label>
                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    value={unstockAmount}
                                    onChange={(e) => setUnstockAmount(e.target.value)}
                                    placeholder="Qty to remove"
                                    className="flex-1 bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-red-500 focus:outline-none"
                                />
                                <button 
                                    onClick={handleUnstockClick}
                                    disabled={!unstockAmount}
                                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
                                >
                                    <MinusCircle size={18} />
                                    Unstock
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Layout Visualizer */}
                <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Warehouse size={20}/> Layout: {selectedLayout.name}</h2>
                    <LayoutViewer layout={selectedLayout} highlightedShelfId={selectedItem.location.shelfId} onShelfClick={setSelectedShelf}/>
                </div>
            </div>
            
            {/* Shelf Detail */}
            {selectedShelf && (
                 <div className="bg-gray-800 p-4 rounded-lg shadow-lg h-fit">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Layers size={20}/> Shelf: {selectedShelf.label}</h2>
                    <ShelfViewer shelf={selectedShelf} highlightedRackNumber={selectedItem.location.rackNumber} />
                 </div>
            )}
        </div>
      )}

      {/* Main Data Table */}
      <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-900/50 border-b border-gray-700 text-xs uppercase text-gray-400">
                        <th className="p-4 cursor-pointer hover:text-white hover:bg-gray-800" onClick={() => handleSort('name')}>
                            <div className="flex items-center gap-1">Item Details <ArrowUpDown size={12}/></div>
                        </th>
                        <th className="p-4 cursor-pointer hover:text-white hover:bg-gray-800" onClick={() => handleSort('location')}>
                             <div className="flex items-center gap-1">Location <ArrowUpDown size={12}/></div>
                        </th>
                        <th className="p-4 cursor-pointer hover:text-white hover:bg-gray-800 text-right" onClick={() => handleSort('quantity')}>
                             <div className="flex items-center justify-end gap-1">Quantity <ArrowUpDown size={12}/></div>
                        </th>
                        <th className="p-4 text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {paginatedItems.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="p-8 text-center text-gray-500">
                                No items found matching your filters.
                            </td>
                        </tr>
                    ) : (
                        paginatedItems.map(item => {
                            const isSelected = selectedItem?.id === item.id;
                            const layoutName = layouts.find(l => l.id === item.location.layoutId)?.name || 'Unknown';
                            const shelf = layouts.find(l => l.id === item.location.layoutId)?.shelves.get(item.location.shelfId);
                            const rackLabel = shelf?.rackLabels?.[item.location.rackNumber - 1] || `Rack ${item.location.rackNumber}`;
                            
                            return (
                                <tr 
                                    key={item.id} 
                                    onClick={() => handleItemSelect(item)}
                                    className={`transition-colors cursor-pointer group ${isSelected ? 'bg-blue-900/20' : 'hover:bg-gray-750'}`}
                                >
                                    <td className="p-4">
                                        <div className="font-semibold text-white group-hover:text-blue-400 transition-colors">{item.name}</div>
                                        <div className="text-xs text-gray-500 flex gap-2">
                                            {item.lotNumber && <span>Lot: {item.lotNumber}</span>}
                                            {item.specification && <span>Spec: {item.specification}</span>}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2 text-sm text-gray-300">
                                            <MapPin size={14} className="text-gray-500"/>
                                            <span>{layoutName}</span>
                                            <span className="text-gray-600">/</span>
                                            <span>{shelf?.label || item.location.shelfId}</span>
                                            <span className="text-gray-600">/</span>
                                            <span className="bg-gray-700 px-1.5 rounded text-xs text-gray-200">{rackLabel}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className={`font-mono font-medium ${item.quantity < 50 ? 'text-orange-400' : 'text-green-400'}`}>
                                            {item.quantity}
                                        </div>
                                        <div className="text-[10px] text-gray-500">{item.unit || 'PCS'}</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button className="text-xs bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white px-3 py-1.5 rounded transition-colors">
                                            View
                                        </button>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-gray-800">
                <div className="text-sm text-gray-400">
                    Page <span className="font-medium text-white">{currentPage}</span> of <span className="font-medium text-white">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};


interface LayoutViewerProps {
    layout: Layout;
    highlightedShelfId: string | null;
    onShelfClick: (shelf: Shelf) => void;
}

const LayoutViewer: React.FC<LayoutViewerProps> = ({ layout, highlightedShelfId, onShelfClick }) => {
    return (
        <div className="overflow-auto bg-gray-900/50 p-2 rounded-md shadow-inner">
            <div className="inline-block">
                {Array.from({ length: layout.rows }).map((_, r) => (
                    <div key={r} className="flex">
                        {Array.from({ length: layout.cols }).map((_, c) => {
                            const cellId = `${r}-${c}`;
                            const shelf = layout.shelves.get(cellId);
                            const isHighlighted = cellId === highlightedShelfId;

                            return (
                                <div
                                    key={cellId}
                                    onClick={() => shelf && onShelfClick(shelf)}
                                    className={`w-12 h-12 border border-gray-700 flex items-center justify-center text-xs transition-all duration-200 select-none
                                    ${shelf ? 'cursor-pointer' : ''}
                                    ${isHighlighted ? 'bg-green-500 ring-2 ring-green-300 animate-pulse' : shelf ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-800'}`}
                                >
                                    {shelf && <span className="font-bold text-white truncate">{shelf.label}</span>}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};


interface ShelfViewerProps {
    shelf: Shelf;
    highlightedRackNumber: number;
}

const ShelfViewer: React.FC<ShelfViewerProps> = ({ shelf, highlightedRackNumber }) => {
    return (
        <div className="space-y-2">
            <p className="text-gray-400">Total Racks: {shelf.rackCount}</p>
            <div className="space-y-1 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {Array.from({ length: shelf.rackCount }).map((_, i) => {
                    const rackNum = i + 1;
                    const isHighlighted = rackNum === highlightedRackNumber;
                    const label = shelf.rackLabels?.[i] || `Rack ${rackNum}`;
                    
                    return (
                        <div key={rackNum}
                            className={`p-3 rounded-md flex justify-between items-center transition-all duration-200
                            ${isHighlighted ? 'bg-green-500 text-white font-bold' : 'bg-gray-700 text-gray-200'}`}
                        >
                            <span>{label}</span>
                            {isHighlighted && (
                                <span className="bg-white text-green-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                    HERE
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
