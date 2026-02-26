import React, { useState, useEffect, useMemo } from 'react';
import type { Layout, Shelf, Division } from '../types';
import { api } from '../api';
import { Plus, Minus, Save, X, Trash2, LayoutTemplate, PlusCircle, Briefcase } from 'lucide-react';

interface LayoutSetupProps {
  layouts: Layout[];
  onSaveLayout: (layout: Layout) => void;
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const LayoutSetup: React.FC<LayoutSetupProps> = ({ layouts, onSaveLayout }) => {
  const [activeLayoutId, setActiveLayoutId] = useState<string>(layouts[0]?.id || 'NEW');
  const [divisions, setDivisions] = useState<Division[]>([]);

  useEffect(() => {
    api.getDivisions().then(setDivisions).catch(console.error);
  }, []);

  // Find data for the selected layout, or undefined if creating new
  const activeLayoutData = layouts.find(l => l.id === activeLayoutId);

  const handleSaveWrapper = (layout: Layout) => {
    onSaveLayout(layout);
    // After saving, ensure we select the newly saved layout (in case it was 'NEW')
    setActiveLayoutId(layout.id);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
      {/* Sidebar for Layout Selection */}
      <div className="w-full lg:w-72 bg-gray-800 rounded-lg p-4 flex flex-col gap-4 flex-shrink-0 shadow-lg h-full overflow-hidden">
         <div className="flex items-center justify-between pb-2 border-b border-gray-700">
             <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <LayoutTemplate size={20} className="text-blue-400"/>
                Warehouses
             </h2>
             <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">{layouts.length}</span>
         </div>
         
         <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {layouts.map(layout => (
                <button
                    key={layout.id}
                    onClick={() => setActiveLayoutId(layout.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 border border-transparent ${
                        activeLayoutId === layout.id 
                            ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-md' 
                            : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                >
                    <div className="font-semibold truncate text-sm">{layout.name}</div>
                    <div className="text-[10px] uppercase tracking-wider opacity-60 mt-1">
                        {layout.rows}R x {layout.cols}C • {layout.shelves.size} Zones
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {layout.divisionIds?.map(dId => {
                          const divName = divisions.find(d => d.id === dId)?.name;
                          return divName ? (
                              <span key={dId} className="text-[9px] bg-gray-900/50 text-gray-400 px-1.5 py-0.5 rounded border border-gray-600">
                                  {divName}
                              </span>
                          ) : null;
                      })}
                    </div>
                </button>
            ))}
         </div>

         <button
            onClick={() => setActiveLayoutId('NEW')}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed transition-all ${
                activeLayoutId === 'NEW' 
                    ? 'bg-blue-900/20 border-blue-500 text-blue-400' 
                    : 'border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-700/30'
            }`}
         >
            <PlusCircle size={18} />
            <span className="font-medium text-sm">Add New Layout</span>
         </button>
      </div>

      {/* Main Editor Area */}
      <LayoutEditor
        key={activeLayoutId}
        initialLayout={activeLayoutData}
        divisions={divisions}
        onSave={handleSaveWrapper}
      />
    </div>
  );
};

// --- Inner Component: The actual Grid Editor ---

interface LayoutEditorProps {
  initialLayout?: Layout; // Undefined means we are creating a new one
  divisions: Division[];
  onSave: (layout: Layout) => void;
}

const LayoutEditor: React.FC<LayoutEditorProps> = ({ initialLayout, divisions, onSave }) => {
  const [rows, setRows] = useState(initialLayout?.rows || 10);
  const [cols, setCols] = useState(initialLayout?.cols || 15);
  const [shelves, setShelves] = useState<Map<string, Shelf>>(new Map(initialLayout?.shelves));
  const [layoutName, setLayoutName] = useState(initialLayout?.name || 'New Warehouse Floor');
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>(initialLayout?.divisionIds || []);
  
  // Selection & Dragging State
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleMouseUpGlobal = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUpGlobal);
    return () => window.removeEventListener('mouseup', handleMouseUpGlobal);
  }, []);
  
  const handleCellMouseDown = (row: number, col: number) => {
    setIsDragging(true);
    setSelectedCells(new Set([`${row}-${col}`]));
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (isDragging) {
      setSelectedCells(prev => new Set(prev).add(`${row}-${col}`));
    }
  };

  const clearSelection = () => {
    setSelectedCells(new Set());
  };

  const handleSave = () => {
    if (!layoutName.trim()) {
        alert("Please enter a layout name.");
        return;
    }
    const newLayout: Layout = {
      id: initialLayout?.id || generateId(),
      name: layoutName,
      rows,
      cols,
      shelves,
      divisionIds: selectedDivisionIds
    };
    onSave(newLayout);
  };

  const toggleDivision = (divId: string) => {
      setSelectedDivisionIds(prev => 
          prev.includes(divId) ? prev.filter(id => id !== divId) : [...prev, divId]
      );
  };
  
  const updateSelectedShelves = (label: string, rackCount: number, rackLabels?: string[]) => {
    const newShelves = new Map(shelves);
    
    // Smart Renaming Logic
    let prefix = label;
    let startNum = 1;
    let isAutoIncrement = false;
    
    const match = label.match(/^(.*?)(\d+)$/);
    if (match && selectedCells.size > 1) {
        prefix = match[1];
        startNum = parseInt(match[2]);
        isAutoIncrement = true;
    }

    // Sort cells to ensure logical ordering (row-major)
    const sortedCells = Array.from(selectedCells).sort((a: string, b: string) => {
        const [r1, c1] = a.split('-').map(Number);
        const [r2, c2] = b.split('-').map(Number);
        return r1 - r2 || c1 - c2;
    });

    sortedCells.forEach((cellId: string, index: number) => {
        const [row, col] = cellId.split('-').map(Number);
        const existingShelf = newShelves.get(cellId) as Shelf | undefined;
        
        let newLabel = label;
        if (isAutoIncrement) {
            newLabel = `${prefix}${startNum + index}`;
        } else if (!label && existingShelf) {
            newLabel = existingShelf.label;
        } else if (!label) {
            newLabel = `Shelf ${row}-${col}`;
        }

        const newRackCount = rackCount >= 0 ? rackCount : (existingShelf?.rackCount || 0);
        
        // Preserve existing rack labels if count hasn't changed and no new labels provided
        let newRackLabels = rackLabels;
        if (!newRackLabels && existingShelf?.rackLabels && existingShelf.rackCount === newRackCount) {
            newRackLabels = existingShelf.rackLabels;
        }
        // If count changed and no labels provided, reset (or maybe trim/extend?)
        // For simplicity, if count changes, we reset labels unless provided.
        
        newShelves.set(cellId, {
            id: cellId,
            row,
            col,
            label: newLabel,
            rackCount: newRackCount,
            rackLabels: newRackLabels
        });
    });
    setShelves(newShelves);
    clearSelection();
  };

  const deleteSelectedShelves = () => {
    const newShelves = new Map(shelves);
    selectedCells.forEach(cellId => {
        newShelves.delete(cellId);
    });
    setShelves(newShelves);
    clearSelection();
  };
  
  const gridCells = useMemo(() => {
    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const cellId = `${r}-${c}`;
        const shelf = shelves.get(cellId);
        const isSelected = selectedCells.has(cellId);
        return (
          <div
            key={cellId}
            onMouseDown={() => handleCellMouseDown(r, c)}
            onMouseEnter={() => handleCellMouseEnter(r, c)}
            className={`w-12 h-12 sm:w-14 sm:h-14 border border-gray-700/50 flex items-center justify-center text-xs transition-all duration-75 cursor-pointer select-none
              ${ isSelected ? 'bg-blue-500 ring-2 ring-blue-300 ring-offset-1 ring-offset-gray-900 z-10' : shelf ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-800/50 hover:bg-gray-700' }`}
          >
            {shelf && (
              <div className="text-center text-white overflow-hidden w-full px-1">
                <p className="font-bold truncate text-[10px] sm:text-xs">{shelf.label}</p>
                <p className="text-gray-300 text-[9px]">{shelf.rackCount}R</p>
              </div>
            )}
          </div>
        );
      })
    );
  }, [rows, cols, shelves, selectedCells, isDragging]);


  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {/* Editor Header */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 w-full sm:w-auto">
                <label className="block text-xs text-gray-400 mb-1 ml-1">Layout Name</label>
                <input
                    type="text"
                    value={layoutName}
                    onChange={(e) => setLayoutName(e.target.value)}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                    placeholder="e.g. Ground Floor"
                />
            </div>
            
            <div className="flex items-end gap-6">
                <div>
                    <label className="block text-xs text-center text-gray-400 mb-1">Rows</label>
                    <div className="flex items-center gap-1 bg-gray-700 rounded-md p-1">
                        <button onClick={() => setRows(r => Math.max(1, r - 1))} className="p-1 hover:bg-gray-600 rounded"><Minus size={14} /></button>
                        <span className="w-8 text-center font-mono text-sm">{rows}</span>
                        <button onClick={() => setRows(r => r + 1)} className="p-1 hover:bg-gray-600 rounded"><Plus size={14} /></button>
                    </div>
                </div>
                <div>
                    <label className="block text-xs text-center text-gray-400 mb-1">Columns</label>
                    <div className="flex items-center gap-1 bg-gray-700 rounded-md p-1">
                        <button onClick={() => setCols(c => Math.max(1, c - 1))} className="p-1 hover:bg-gray-600 rounded"><Minus size={14} /></button>
                        <span className="w-8 text-center font-mono text-sm">{cols}</span>
                        <button onClick={() => setCols(c => c + 1)} className="p-1 hover:bg-gray-600 rounded"><Plus size={14} /></button>
                    </div>
                </div>
                
                <button onClick={handleSave} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-green-700 transition-colors shadow-lg shadow-green-900/20 h-[38px]">
                    <Save size={18} />
                    <span className="hidden sm:inline">Save Layout</span>
                </button>
            </div>
        </div>

        {/* Division Selection */}
        <div className="border-t border-gray-700 pt-3">
             <label className="block text-xs text-gray-400 mb-2 flex items-center gap-2">
                <Briefcase size={14} /> Assigned Divisions (Access Control)
             </label>
             <div className="flex flex-wrap gap-2">
                {divisions.length === 0 && <span className="text-gray-500 text-xs italic">No divisions configured. Go to Admin to create divisions.</span>}
                {divisions.map(div => (
                    <button
                        key={div.id}
                        type="button"
                        onClick={() => toggleDivision(div.id)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                            selectedDivisionIds.includes(div.id)
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-gray-700 text-gray-400 border-gray-600 hover:border-gray-400 hover:text-gray-200'
                        }`}
                    >
                        {div.name}
                    </button>
                ))}
            </div>
        </div>
      </div>
      
      {/* Editor Grid Area */}
      <div className="flex-1 flex gap-4 min-h-0">
        <div 
            className="flex-1 overflow-auto bg-gray-800 p-4 rounded-lg shadow-inner custom-scrollbar relative" 
            onMouseUp={() => setIsDragging(false)}
        >
           <div className="inline-block border border-gray-700/30">
             {gridCells.map((row, r) => (
               <div key={r} className="flex">
                 {row}
               </div>
             ))}
           </div>
           
           {/* Hint */}
           <div className="absolute top-4 right-4 bg-gray-900/80 backdrop-blur text-gray-400 text-xs px-3 py-1.5 rounded-full pointer-events-none border border-gray-700">
             Drag to select multiple cells
           </div>
        </div>
        
        {/* Floating Property Editor */}
        {selectedCells.size > 0 && (
          <div className="w-64 flex-shrink-0 bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-700 flex flex-col gap-4 animate-in slide-in-from-right-4 fade-in">
             <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                <h3 className="font-bold text-white">{selectedCells.size} Selected</h3>
                <button onClick={clearSelection} className="text-gray-400 hover:text-white"><X size={16}/></button>
             </div>
             
             <div className="space-y-4">
                 <div>
                    <label className="text-xs text-gray-400 font-medium">Shelf Label</label>
                    <input
                        type="text"
                        id="shelfLabelInput"
                        placeholder="e.g. A-01"
                        className="w-full mt-1 bg-gray-900 border border-gray-600 rounded p-2 text-sm focus:border-blue-500 outline-none"
                        onKeyDown={(e) => {
                             if(e.key === 'Enter') {
                                 const racks = (document.getElementById('rackCountInput') as HTMLInputElement).value;
                                 updateSelectedShelves((e.target as HTMLInputElement).value, parseInt(racks) || -1);
                             }
                        }}
                    />
                 </div>
                 <div>
                    <label className="text-xs text-gray-400 font-medium">Rack Count</label>
                    <input
                        type="number"
                        id="rackCountInput"
                        placeholder="e.g. 4"
                        className="w-full mt-1 bg-gray-900 border border-gray-600 rounded p-2 text-sm focus:border-blue-500 outline-none"
                    />
                 </div>
                 
                 <div>
                    <label className="text-xs text-gray-400 font-medium">Rack Labels (Optional, comma separated)</label>
                    <textarea
                        id="rackLabelsInput"
                        placeholder="e.g. Top, Middle, Bottom"
                        className="w-full mt-1 bg-gray-900 border border-gray-600 rounded p-2 text-sm focus:border-blue-500 outline-none h-16 resize-none"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Leave empty to use numbers (1, 2, 3...)</p>
                 </div>
                 
                 <div className="pt-2 space-y-2">
                     <button 
                        onClick={() => {
                             const label = (document.getElementById('shelfLabelInput') as HTMLInputElement).value;
                             const racks = (document.getElementById('rackCountInput') as HTMLInputElement).value;
                             const rackLabelsStr = (document.getElementById('rackLabelsInput') as HTMLTextAreaElement).value;
                             
                             const rackLabels = rackLabelsStr.trim() 
                                ? rackLabelsStr.split(',').map(s => s.trim()).filter(s => s) 
                                : undefined;

                             updateSelectedShelves(label, parseInt(racks) || -1, rackLabels);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-sm font-medium"
                     >
                        Apply Changes
                     </button>
                     <button 
                        onClick={deleteSelectedShelves}
                        className="w-full bg-gray-700 hover:bg-red-900/50 hover:text-red-200 text-gray-300 py-2 rounded text-sm font-medium flex items-center justify-center gap-2"
                     >
                        <Trash2 size={14} /> Clear Cells
                     </button>
                 </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
