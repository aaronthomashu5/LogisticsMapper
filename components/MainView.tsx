
import React, { useState, useMemo, useEffect } from 'react';
import type { Layout, StockItem, Shelf, PendingItem } from '../types';
import { 
  Search, X, Package, Warehouse, Layers, MinusCircle, 
  Filter, ChevronLeft, ChevronRight, ArrowUpDown, AlertTriangle, MapPin,
  Home, Grid, List, Pencil, Check, Plus, ArrowRight
} from 'lucide-react';

interface MainViewProps {
  layouts: Layout[];
  items: StockItem[];
  onUnstock: (itemId: string, amount: number) => void;
  onReallocate: (itemId: string, quantity: number, newLocation: StockItem['location']) => void;
  onDirectAdd?: (item: PendingItem, location: StockItem['location']) => void;
  isAdmin?: boolean;
  onUpdateLayout?: (layout: Layout) => void;
}

type SortField = 'name' | 'quantity' | 'location';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10;

export const MainView: React.FC<MainViewProps> = ({ layouts, items, onUnstock, onReallocate, onDirectAdd, isAdmin = false, onUpdateLayout }) => {
  // Search & Filter State
  const [query, setQuery] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  
  // Browsing State
  const [viewPath, setViewPath] = useState<{
    layoutId?: string;
    shelfId?: string;
    rackNumber?: number;
  }>({});

  // Rack Editing State
  const [editingRack, setEditingRack] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  // Add Item State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    quantity: '',
    unit: 'PCS',
    lotNumber: '',
    specification: ''
  });

  // Sort & Pagination State (For Search Results)
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Selection State (For Search Result Detail)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [unstockAmount, setUnstockAmount] = useState<string>('');

  // Reallocate State
  const [reallocateState, setReallocateState] = useState<{
    isOpen: boolean;
    item: StockItem | null;
    quantity: string;
    targetLayoutId: string;
    targetShelfId: string;
    targetRackNumber: number | null;
  }>({
    isOpen: false,
    item: null,
    quantity: '',
    targetLayoutId: '',
    targetShelfId: '',
    targetRackNumber: null
  });

  // --- Helpers ---
  const activeLayout = useMemo(() => 
    layouts.find(l => l.id === viewPath.layoutId), 
  [layouts, viewPath.layoutId]);

  const activeShelf = useMemo(() => {
    if (!activeLayout || !viewPath.shelfId) return undefined;
    // Find shelf by ID since map is keyed by coordinates
    for (const shelf of activeLayout.shelves.values()) {
        if (shelf.id === viewPath.shelfId) return shelf;
    }
    return undefined;
  }, [activeLayout, viewPath.shelfId]);

  const rackItems = useMemo(() => {
    if (!activeLayout || !activeShelf || !viewPath.rackNumber) return [];
    return items.filter(i => 
        i.location.layoutId === activeLayout.id &&
        i.location.shelfId === activeShelf.id &&
        i.location.rackNumber === viewPath.rackNumber
    );
  }, [items, activeLayout, activeShelf, viewPath.rackNumber]);

  // --- Search Logic ---
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const processedItems = useMemo(() => {
    if (!query && !showLowStock) return []; // Only process if searching/filtering

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

    // 2. Filter by Low Stock
    if (showLowStock) {
      result = result.filter(item => item.quantity < 50);
    }

    // 3. Sorting
    result.sort((a, b) => {
      let valA: any = a[sortField as keyof StockItem];
      let valB: any = b[sortField as keyof StockItem];

      if (sortField === 'location') {
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
  }, [items, query, showLowStock, sortField, sortDirection, layouts]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return processedItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [processedItems, currentPage]);

  const totalPages = Math.ceil(processedItems.length / ITEMS_PER_PAGE);

  // --- Handlers ---
  const handleUnstockClick = (item: StockItem) => {
      if (!unstockAmount) return;
      const qty = parseFloat(unstockAmount);
      if (isNaN(qty) || qty <= 0) return;
      if (qty > item.quantity) {
          alert("Cannot unstock more than available quantity.");
          return;
      }
      onUnstock(item.id, qty);
      setUnstockAmount('');
  };

  const openReallocate = (item: StockItem) => {
      setReallocateState({
          isOpen: true,
          item,
          quantity: item.quantity.toString(),
          targetLayoutId: item.location.layoutId,
          targetShelfId: '',
          targetRackNumber: null
      });
  };

  const handleReallocateSubmit = () => {
      const { item, quantity, targetLayoutId, targetShelfId, targetRackNumber } = reallocateState;
      if (!item || !quantity || !targetLayoutId || !targetShelfId || !targetRackNumber) return;
      
      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0 || qty > item.quantity) {
          alert("Invalid quantity");
          return;
      }

      onReallocate(item.id, qty, {
          layoutId: targetLayoutId,
          shelfId: targetShelfId,
          rackNumber: targetRackNumber
      });
      
      setReallocateState({ ...reallocateState, isOpen: false });
  };

  const handleSaveRackLabel = (rackIndex: number) => {
    if (!activeLayout || !activeShelf || !onUpdateLayout) return;

    const newLayout = { ...activeLayout };
    const newShelves = new Map<string, Shelf>(activeLayout.shelves);
    
    // Find shelf key
    let shelfKey = '';
    for (const [key, shelf] of newShelves.entries()) {
        if (shelf.id === activeShelf.id) {
            shelfKey = key;
            break;
        }
    }
    
    if (!shelfKey) return;

    const newShelf = { ...activeShelf };
    
    // Ensure rackLabels array exists and has enough length
    const newRackLabels = [...(newShelf.rackLabels || [])];
    // Fill with defaults if needed
    while (newRackLabels.length < newShelf.rackCount) {
        newRackLabels.push(`Rack ${newRackLabels.length + 1}`);
    }
    
    newRackLabels[rackIndex] = editValue;
    newShelf.rackLabels = newRackLabels;
    
    newShelves.set(shelfKey, newShelf);
    newLayout.shelves = newShelves;
    
    onUpdateLayout(newLayout);
    setEditingRack(null);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.quantity || !onDirectAdd || !activeLayout || !activeShelf || !viewPath.rackNumber) return;

    const newItem: PendingItem = {
      id: `manual-${Date.now()}`,
      name: addForm.name,
      quantity: parseFloat(addForm.quantity),
      unit: addForm.unit,
      lotNumber: addForm.lotNumber,
      specification: addForm.specification,
      source: 'MANUAL'
    };

    const location = {
        layoutId: activeLayout.id,
        shelfId: activeShelf.id,
        rackNumber: viewPath.rackNumber
    };

    onDirectAdd(newItem, location);
    setShowAddModal(false);
    setAddForm({
        name: '',
        quantity: '',
        unit: 'PCS',
        lotNumber: '',
        specification: ''
    });
  };

  // Reset view when searching
  useEffect(() => {
    if (query) {
        setViewPath({});
        setSelectedItem(null);
    }
  }, [query]);

  // --- Renderers ---

  const renderBreadcrumbs = () => (
    <div className="flex items-center gap-2 text-sm text-gray-400 mb-6 bg-gray-800 p-3 rounded-lg shadow-sm overflow-x-auto">
        <button 
            onClick={() => setViewPath({})} 
            className={`flex items-center gap-1 hover:text-white ${!viewPath.layoutId ? 'text-blue-400 font-bold' : ''}`}
        >
            <Home size={14} /> Home
        </button>
        
        {viewPath.layoutId && (
            <>
                <ChevronRight size={14} />
                <button 
                    onClick={() => setViewPath({ layoutId: viewPath.layoutId })}
                    className={`hover:text-white ${!viewPath.shelfId ? 'text-blue-400 font-bold' : ''}`}
                >
                    {activeLayout?.name || 'Unknown Layout'}
                </button>
            </>
        )}

        {viewPath.shelfId && (
            <>
                <ChevronRight size={14} />
                <button 
                    onClick={() => setViewPath({ layoutId: viewPath.layoutId, shelfId: viewPath.shelfId })}
                    className={`hover:text-white ${!viewPath.rackNumber ? 'text-blue-400 font-bold' : ''}`}
                >
                    {activeShelf?.label || viewPath.shelfId}
                </button>
            </>
        )}

        {viewPath.rackNumber && (
            <>
                <ChevronRight size={14} />
                <span className="text-blue-400 font-bold">
                    {activeShelf?.rackLabels?.[viewPath.rackNumber - 1] || `Rack ${viewPath.rackNumber}`}
                </span>
            </>
        )}
    </div>
  );

  return (
    <div className="space-y-6">
      
      {/* Search Header */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <Search className="text-blue-400" /> Stock Locator
            </h1>
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
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items by Name, ID, or Lot Number..."
            className="w-full bg-gray-700 text-white pl-10 pr-10 py-3 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* SEARCH RESULTS MODE */}
      {(query || showLowStock) ? (
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h3 className="font-bold text-gray-200">Search Results</h3>
                <span className="text-xs text-gray-400">{processedItems.length} items found</span>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-900/50 border-b border-gray-700 text-xs uppercase text-gray-400">
                            <th className="p-4 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>Item Details <ArrowUpDown size={10} className="inline"/></th>
                            <th className="p-4 cursor-pointer hover:text-white" onClick={() => handleSort('location')}>Location <ArrowUpDown size={10} className="inline"/></th>
                            <th className="p-4 text-right cursor-pointer hover:text-white" onClick={() => handleSort('quantity')}>Qty <ArrowUpDown size={10} className="inline"/></th>
                            <th className="p-4 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {paginatedItems.map(item => {
                            const lName = layouts.find(l => l.id === item.location.layoutId)?.name;
                            return (
                                <tr key={item.id} className="hover:bg-gray-750">
                                    <td className="p-4">
                                        <div className="font-medium text-white">{item.name}</div>
                                        <div className="text-xs text-gray-500">Lot: {item.lotNumber || '-'}</div>
                                    </td>
                                    <td className="p-4 text-sm text-gray-400">
                                        {lName} / {item.location.shelfId} / R{item.location.rackNumber}
                                    </td>
                                    <td className="p-4 text-right font-mono text-green-400">
                                        {item.quantity} <span className="text-xs text-gray-500">{item.unit}</span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button 
                                            onClick={() => {
                                                setQuery(''); // Clear search to enter browse mode
                                                setViewPath({
                                                    layoutId: item.location.layoutId,
                                                    shelfId: item.location.shelfId,
                                                    rackNumber: item.location.rackNumber
                                                });
                                            }}
                                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded"
                                        >
                                            Locate
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {paginatedItems.length === 0 && (
                            <tr><td colSpan={4} className="p-8 text-center text-gray-500">No items found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {/* Pagination (Simplified) */}
            {totalPages > 1 && (
                <div className="p-4 border-t border-gray-700 flex justify-between items-center bg-gray-800">
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1 rounded hover:bg-gray-700 disabled:opacity-50"><ChevronLeft/></button>
                    <span className="text-sm text-gray-400">Page {currentPage} of {totalPages}</span>
                    <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1 rounded hover:bg-gray-700 disabled:opacity-50"><ChevronRight/></button>
                </div>
            )}
        </div>
      ) : (
        /* BROWSE MODE */
        <div className="animate-in fade-in slide-in-from-bottom-4">
            {renderBreadcrumbs()}

            {/* LEVEL 1: LAYOUT LIST */}
            {!viewPath.layoutId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {layouts.map(layout => (
                        <button 
                            key={layout.id}
                            onClick={() => setViewPath({ layoutId: layout.id })}
                            className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 hover:border-blue-500 hover:bg-gray-750 transition-all text-left group"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-blue-900/30 rounded-lg text-blue-400 group-hover:text-blue-300 group-hover:scale-110 transition-transform">
                                    <Warehouse size={24} />
                                </div>
                                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                                    {layout.rows}x{layout.cols}
                                </span>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-1">{layout.name}</h3>
                            <p className="text-sm text-gray-400">{layout.shelves.size} Shelves Configured</p>
                        </button>
                    ))}
                    {layouts.length === 0 && (
                        <div className="col-span-full text-center p-12 text-gray-500 bg-gray-800/50 rounded-lg border border-dashed border-gray-700">
                            No layouts found. Please create one in Setup.
                        </div>
                    )}
                </div>
            )}

            {/* LEVEL 2: LAYOUT GRID (Select Shelf) */}
            {viewPath.layoutId && !viewPath.shelfId && activeLayout && (
                <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Grid size={18} className="text-blue-400"/> Select a Shelf
                    </h2>
                    <LayoutViewer 
                        layout={activeLayout} 
                        highlightedShelfId={null} 
                        onShelfClick={(shelf) => setViewPath({ ...viewPath, shelfId: shelf.id })} 
                    />
                </div>
            )}

            {/* LEVEL 3: SHELF VIEW (Select Rack) */}
            {viewPath.layoutId && viewPath.shelfId && !viewPath.rackNumber && activeShelf && (
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-2xl mx-auto">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Layers size={24} className="text-blue-400"/> 
                        Shelf {activeShelf.label}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {Array.from({ length: activeShelf.rackCount }).map((_, i) => {
                            const rackNum = i + 1;
                            const label = activeShelf.rackLabels?.[i] || `Rack ${rackNum}`;
                            const isEditing = editingRack === i;
                            
                            // Count items in this rack
                            const itemCount = items.filter(item => 
                                item.location.layoutId === activeLayout?.id &&
                                item.location.shelfId === activeShelf.id &&
                                item.location.rackNumber === rackNum
                            ).length;

                            return (
                                <div
                                    key={rackNum}
                                    className="flex items-center justify-between p-4 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 hover:border-blue-500 transition-all group"
                                >
                                    <div className="flex items-center gap-3 flex-1">
                                        <div 
                                            onClick={() => !isEditing && setViewPath({ ...viewPath, rackNumber: rackNum })}
                                            className={`w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-400 group-hover:text-white group-hover:bg-blue-600 transition-colors ${!isEditing ? 'cursor-pointer' : ''}`}
                                        >
                                            {rackNum}
                                        </div>
                                        
                                        {isEditing ? (
                                            <div className="flex items-center gap-2 flex-1">
                                                <input 
                                                    type="text" 
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    className="w-full bg-gray-900 border border-blue-500 rounded px-2 py-1 text-sm text-white outline-none"
                                                    autoFocus
                                                    onClick={(e) => e.stopPropagation()}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveRackLabel(i);
                                                        if (e.key === 'Escape') setEditingRack(null);
                                                    }}
                                                />
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleSaveRackLabel(i); }}
                                                    className="text-green-400 hover:text-green-300"
                                                >
                                                    <Check size={16} />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setEditingRack(null); }}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div 
                                                className="flex items-center gap-2 flex-1 cursor-pointer" 
                                                onClick={() => setViewPath({ ...viewPath, rackNumber: rackNum })}
                                            >
                                                <span className="font-medium text-gray-200">{label}</span>
                                                {isAdmin && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingRack(i);
                                                            setEditValue(label);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-blue-400 transition-opacity p-1"
                                                        title="Edit Rack Label"
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {!isEditing && (
                                        <span 
                                            className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400 cursor-pointer"
                                            onClick={() => setViewPath({ ...viewPath, rackNumber: rackNum })}
                                        >
                                            {itemCount} Items
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* LEVEL 4: RACK ITEMS */}
            {viewPath.layoutId && viewPath.shelfId && viewPath.rackNumber && (
                <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <div className="p-6 border-b border-gray-700 bg-gray-800">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Package size={24} className="text-blue-400"/>
                            Items on {activeShelf?.rackLabels?.[viewPath.rackNumber - 1] || `Rack ${viewPath.rackNumber}`}
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Located in {activeLayout?.name} &gt; Shelf {activeShelf?.label}
                        </p>
                    </div>
                    
                    <div className="divide-y divide-gray-700">
                        {rackItems.length === 0 ? (
                            <div className="p-12 text-center text-gray-500">
                                <Package size={48} className="mx-auto mb-4 opacity-20"/>
                                <p className="mb-4">This rack is empty.</p>
                                <button 
                                    onClick={() => setShowAddModal(true)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium inline-flex items-center gap-2 transition-colors"
                                >
                                    <Plus size={18} />
                                    Add Material
                                </button>
                            </div>
                        ) : (
                            rackItems.map(item => (
                                <div key={item.id} className="p-4 hover:bg-gray-750 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="font-bold text-white text-lg">{item.name}</h3>
                                        <div className="flex gap-4 text-sm text-gray-400 mt-1">
                                            {item.lotNumber && <span>Lot: <span className="text-gray-300">{item.lotNumber}</span></span>}
                                            {item.specification && <span>Spec: <span className="text-gray-300">{item.specification}</span></span>}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <div className="text-2xl font-mono font-bold text-green-400">
                                                {item.quantity} <span className="text-sm text-gray-500">{item.unit}</span>
                                            </div>
                                            <div className="text-xs text-gray-500">Available</div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                placeholder="Qty"
                                                className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
                                                onChange={(e) => setUnstockAmount(e.target.value)}
                                            />
                                            <button 
                                                onClick={() => handleUnstockClick(item)}
                                                className="bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-3 py-1 rounded text-sm font-medium border border-red-800 hover:border-red-500 transition-colors"
                                            >
                                                Unstock
                                            </button>
                                            <button 
                                                onClick={() => openReallocate(item)}
                                                className="bg-blue-900/50 hover:bg-blue-600 text-blue-200 hover:text-white px-3 py-1 rounded text-sm font-medium border border-blue-800 hover:border-blue-500 transition-colors flex items-center gap-1"
                                                title="Move to another rack"
                                            >
                                                <ArrowRight size={14} /> Reallocate
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
      )}

      {/* Add Material Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Plus size={20} className="text-blue-500"/> 
                        Add Material to Rack {viewPath.rackNumber}
                    </h3>
                    <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleAddSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Item Name / Description <span className="text-red-500">*</span></label>
                        <input 
                            type="text"
                            required
                            autoFocus
                            placeholder="e.g. Welding Electrodes E6013"
                            value={addForm.name}
                            onChange={e => setAddForm({...addForm, name: e.target.value})}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Quantity <span className="text-red-500">*</span></label>
                            <input 
                                type="number"
                                required
                                min="0.01"
                                step="any"
                                placeholder="0"
                                value={addForm.quantity}
                                onChange={e => setAddForm({...addForm, quantity: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Unit</label>
                            <input 
                                list="units-list-main"
                                value={addForm.unit}
                                onChange={e => setAddForm({...addForm, unit: e.target.value.toUpperCase()})}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <datalist id="units-list-main">
                                <option value="PCS" />
                                <option value="KG" />
                                <option value="BOX" />
                                <option value="PKT" />
                                <option value="SET" />
                                <option value="ROLL" />
                                <option value="M" />
                            </datalist>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Lot Number (Optional)</label>
                            <input 
                                type="text"
                                placeholder="e.g. L-2023-01"
                                value={addForm.lotNumber}
                                onChange={e => setAddForm({...addForm, lotNumber: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                             <label className="block text-xs font-medium text-gray-400 mb-1">Specification (Optional)</label>
                            <input 
                                type="text"
                                placeholder="e.g. 2.5mm"
                                value={addForm.specification}
                                onChange={e => setAddForm({...addForm, specification: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button 
                            type="button" 
                            onClick={() => setShowAddModal(false)}
                            className="flex-1 px-4 py-2 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700 font-medium"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            className="flex-1 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2"
                        >
                            <Plus size={18} />
                            Add Item
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Reallocate Modal */}
      {reallocateState.isOpen && reallocateState.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <ArrowRight size={20} className="text-blue-500"/> 
                        Reallocate Stock
                    </h3>
                    <button onClick={() => setReallocateState({ ...reallocateState, isOpen: false })} className="text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Item Summary */}
                    <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-white text-lg">{reallocateState.item.name}</h4>
                                <div className="text-sm text-gray-400">
                                    Current: {layouts.find(l => l.id === reallocateState.item?.location.layoutId)?.name} &gt; Shelf {reallocateState.item.location.shelfId} &gt; Rack {reallocateState.item.location.rackNumber}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm text-gray-400">Available</div>
                                <div className="font-mono text-xl text-green-400">{reallocateState.item.quantity} {reallocateState.item.unit}</div>
                            </div>
                        </div>
                    </div>

                    {/* Quantity Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Quantity to Move</label>
                        <input 
                            type="number"
                            value={reallocateState.quantity}
                            onChange={(e) => setReallocateState({ ...reallocateState, quantity: e.target.value })}
                            max={reallocateState.item.quantity}
                            min={0.01}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>

                    {/* Destination Selection */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-200 border-b border-gray-700 pb-2">Destination</h4>
                        
                        {/* 1. Layout */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Layout / Division</label>
                            <select 
                                value={reallocateState.targetLayoutId}
                                onChange={(e) => setReallocateState({ 
                                    ...reallocateState, 
                                    targetLayoutId: e.target.value,
                                    targetShelfId: '',
                                    targetRackNumber: null
                                })}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="">Select Layout</option>
                                {layouts.map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* 2. Shelf (Visual) */}
                        {reallocateState.targetLayoutId && (
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Shelf</label>
                                <div className="border border-gray-600 rounded-md overflow-hidden">
                                    <LayoutViewer 
                                        layout={layouts.find(l => l.id === reallocateState.targetLayoutId)!}
                                        highlightedShelfId={reallocateState.targetShelfId}
                                        onShelfClick={(shelf) => setReallocateState({
                                            ...reallocateState,
                                            targetShelfId: shelf.id,
                                            targetRackNumber: null
                                        })}
                                    />
                                </div>
                                {reallocateState.targetShelfId && (
                                    <div className="mt-1 text-sm text-blue-400 font-bold">
                                        Selected: Shelf {layouts.find(l => l.id === reallocateState.targetLayoutId)?.shelves.get(reallocateState.targetShelfId)?.label}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 3. Rack */}
                        {reallocateState.targetShelfId && (
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Rack</label>
                                <select 
                                    value={reallocateState.targetRackNumber || ''}
                                    onChange={(e) => setReallocateState({ 
                                        ...reallocateState, 
                                        targetRackNumber: parseInt(e.target.value)
                                    })}
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="">Select Rack</option>
                                    {(() => {
                                        const shelf = layouts.find(l => l.id === reallocateState.targetLayoutId)?.shelves.get(reallocateState.targetShelfId);
                                        if (!shelf) return null;
                                        return Array.from({ length: shelf.rackCount }).map((_, i) => (
                                            <option key={i + 1} value={i + 1}>
                                                {shelf.rackLabels?.[i] || `Rack ${i + 1}`}
                                            </option>
                                        ));
                                    })()}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-700 bg-gray-800 flex justify-end gap-3">
                    <button 
                        onClick={() => setReallocateState({ ...reallocateState, isOpen: false })}
                        className="px-4 py-2 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700 font-medium"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleReallocateSubmit}
                        disabled={!reallocateState.targetRackNumber || !reallocateState.quantity}
                        className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ArrowRight size={18} />
                        Confirm Move
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-components ---

interface LayoutViewerProps {
    layout: Layout;
    highlightedShelfId: string | null;
    onShelfClick: (shelf: Shelf) => void;
}

const LayoutViewer: React.FC<LayoutViewerProps> = ({ layout, highlightedShelfId, onShelfClick }) => {
    return (
        <div className="overflow-auto bg-gray-900/50 p-4 rounded-md shadow-inner custom-scrollbar">
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
                                    className={`w-12 h-12 sm:w-16 sm:h-16 border border-gray-700/50 flex flex-col items-center justify-center text-xs transition-all duration-200 select-none m-0.5 rounded-sm
                                    ${shelf ? 'cursor-pointer shadow-sm' : ''}
                                    ${isHighlighted ? 'bg-green-500 ring-2 ring-green-300 animate-pulse' : shelf ? 'bg-gray-600 hover:bg-blue-600 hover:scale-105 hover:z-10' : 'bg-gray-800/30'}`}
                                    title={shelf ? `Shelf ${shelf.label}` : ''}
                                >
                                    {shelf && (
                                        <>
                                            <span className="font-bold text-white truncate max-w-full px-1">{shelf.label}</span>
                                            <span className="text-[9px] text-gray-300">{shelf.rackCount} Racks</span>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};
