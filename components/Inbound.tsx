
import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Camera, Loader2, ArrowRight, CheckCircle, Pencil, Save, X, Keyboard, Plus, ScanLine, BrainCircuit } from 'lucide-react';
import type { Layout, PendingItem, StockItem, Shelf } from '../types';
import { GoogleGenAI } from "@google/genai";

declare const Tesseract: any;

interface InboundProps {
  layouts: Layout[];
  pendingItems: PendingItem[];
  onAddPending: (items: PendingItem[]) => void;
  onUpdatePending: (item: PendingItem) => void;
  onDeletePending: (id: string) => void;
  onAllocate: (id: string, location: StockItem['location']) => void;
}

export const Inbound: React.FC<InboundProps> = ({ layouts, pendingItems, onAddPending, onAllocate, onUpdatePending, onDeletePending }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Scan Modal State
  const [showScanModal, setShowScanModal] = useState(false);

  // Manual Entry State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: '',
    quantity: '',
    unit: 'PCS',
    lotNumber: '',
    specification: ''
  });

  // --- Excel Handling ---
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // Fixed/known columns that are NOT specification columns
        const FIXED_COLUMNS = new Set(['Product', 'Code', 'UNIT', 'Lot', 'QTY']);

        const parsedItems: PendingItem[] = [];

        for (const row of data as any[]) {
          const productName = (row['Product'] || '').toString().trim();
          if (!productName) continue; // Skip rows with no product name

          const code = (row['Code'] || '').toString().trim();
          // Combine product name and code as: "<Product> Stock Code <Code>"
          const itemName = code
            ? `${productName} Stock Code ${code}`
            : productName;

          const unit = (row['UNIT'] || 'PCS').toString().trim();
          const lotNumber = row['Lot'] ? row['Lot'].toString().trim() || undefined : undefined;

          // Find all specification columns (any column not in FIXED_COLUMNS)
          const specColumns = Object.keys(row).filter(col => !FIXED_COLUMNS.has(col));

          if (specColumns.length > 0) {
            // Preferred format: each spec column (e.g. 2.2, 3.1) creates a separate PendingItem
            for (const specCol of specColumns) {
              const qty = parseFloat(row[specCol]);
              if (!qty || qty <= 0) continue; // Skip if no valid quantity

              parsedItems.push({
                id: `pending-${Math.random().toString(36).substr(2, 9)}`,
                name: itemName,
                quantity: qty,
                unit: unit,
                lotNumber: lotNumber,
                specification: specCol.toString().trim(),
                source: 'EXCEL' as const,
              });
            }
          } else {
            // Fallback format: no spec columns — use QTY column if present
            const qty = parseFloat(row['QTY']);
            if (!qty || qty <= 0) continue; // Skip if no valid QTY

            parsedItems.push({
              id: `pending-${Math.random().toString(36).substr(2, 9)}`,
              name: itemName,
              quantity: qty,
              unit: unit,
              lotNumber: lotNumber,
              source: 'EXCEL' as const,
            });
          }
        }

        if (parsedItems.length === 0) {
          alert("No valid items found in the Excel file. Please check the format:\nOption 1 – Spec columns: Product, Code, UNIT, Lot (optional), then quantity columns named by specification (e.g. 2.2, 3.1)\nOption 2 – QTY column: Product, Code, UNIT, Lot (optional), QTY");
        } else {
          onAddPending(parsedItems);
        }
      } catch (error) {
        console.error("Excel parse error", error);
        alert("Failed to parse Excel file. Check format.");
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- AI Scan Handling with Gemini ---
  const handleGeminiScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setShowScanModal(false);

    try {
        // Convert to Base64
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });

        // Initialize Gemini
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const prompt = `
        Analyze this delivery order image. Extract all items in a structured JSON format.
        Return ONLY a JSON array of objects with the following fields:
        - name (string): Item description or name
        - quantity (number): The quantity has to be extracted based on KGM on priority not if Unit CT and Base unit if unit is PCE.
        - unit (string): The unit of measure (e.g., PCS, KG, BOX, SET). Default to 'PCS' if unsure.
        - lotNumber (string, optional): Lot or batch number if visible
        - specification (string, optional): Any technical specs (e.g., dimensions, material)
        
        Do not include markdown formatting like \`\`\`json. Just the raw JSON array.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: file.type, data: base64Data } },
                    { text: prompt }
                ]
            }
        });

        const responseText = response.text || '[]';
        // Clean up markdown if present (just in case)
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let parsedData: any[] = [];
        try {
            parsedData = JSON.parse(cleanJson);
        } catch (e) {
            console.error("Failed to parse Gemini JSON", e);
            alert("AI could not extract structured data. Please try again or use manual entry.");
            return;
        }

        if (!Array.isArray(parsedData)) {
            parsedData = [parsedData];
        }

        const newItems: PendingItem[] = parsedData.map((item: any) => ({
            id: `ai-${Math.random().toString(36).substr(2, 9)}`,
            name: item.name || 'Unknown Item',
            quantity: parseFloat(item.quantity) || 0,
            unit: (item.unit || 'PCS').toUpperCase(),
            lotNumber: item.lotNumber,
            specification: item.specification,
            source: 'AI' as const
        })).filter((i: PendingItem) => i.quantity > 0);

        if (newItems.length === 0) {
            alert("No valid items found in the image.");
        } else {
            onAddPending(newItems);
        }

    } catch (error) {
        console.error("Gemini Scan Error", error);
        alert("Failed to process image with AI. Check API Key and connection.");
    } finally {
        setIsProcessing(false);
        if (aiInputRef.current) aiInputRef.current.value = '';
    }
  };

  // --- OCR Handling with Tesseract.js ---
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    try {
        // Initialize Tesseract Worker
        const worker = await Tesseract.createWorker('eng');
        const ret = await worker.recognize(file);
        const text = ret.data.text;
        await worker.terminate();

        // Basic parsing logic for raw OCR text
        // Tries to identify format: [Qty] [Unit] [Description] [Lot]
        const lines = text.split('\n');
        const parsedItems: PendingItem[] = [];

        for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.length < 5) continue; // Skip noise

            // Regex Heuristics
            // 1. Find Quantity (First number sequence)
            const qtyMatch = cleanLine.match(/(\d+(\.\d+)?)/);
            const quantity = qtyMatch ? parseFloat(qtyMatch[0]) : 1;

            // 2. Find Unit (Common abbreviations)
            const unitMatch = cleanLine.match(/\b(PCS|PK|BOX|CTN|KG|M|ROLL|SET|PAIR|KGM|EA|PACKET|BAG)\b/i);
            const unit = unitMatch ? unitMatch[0].toUpperCase() : 'PCS';

            // 3. Find Lot Number
            const lotMatch = cleanLine.match(/(?:LOT|BATCH|NO\.)\s*[:#-.]?\s*([A-Z0-9-]+)/i);
            const lotNumber = lotMatch ? lotMatch[1] : undefined;

            // 4. Extract Name (Remove identified parts from string)
            let name = cleanLine;
            if (qtyMatch) name = name.replace(qtyMatch[0], '');
            if (unitMatch) name = name.replace(unitMatch[0], '');
            if (lotMatch) name = name.replace(lotMatch[0], '');
            
            // Cleanup extra chars
            name = name.replace(/[^a-zA-Z0-9\s\-.]/g, ' ').replace(/\s+/g, ' ').trim();

            if (name.length > 2) {
                parsedItems.push({
                    id: `ocr-${Math.random().toString(36).substr(2, 9)}`,
                    name: name,
                    quantity: quantity,
                    unit: unit,
                    lotNumber: lotNumber,
                    source: 'OCR'
                });
            }
        }

        if (parsedItems.length === 0) {
            alert("No recognizable text found. Please ensure the image is clear and contains readable text.");
        } else {
            onAddPending(parsedItems);
        }

    } catch (error) {
        console.error("OCR Error", error);
        alert("Failed to process image with Tesseract.js.");
    } finally {
        setIsProcessing(false);
        if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // --- Manual Entry Logic ---
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.name || !manualForm.quantity) return;

    const newItem: PendingItem = {
      id: `manual-${Date.now()}`,
      name: manualForm.name,
      quantity: parseFloat(manualForm.quantity),
      unit: manualForm.unit,
      lotNumber: manualForm.lotNumber,
      specification: manualForm.specification,
      source: 'MANUAL'
    };

    onAddPending([newItem]);
    
    // Reset minimal fields to allow rapid entry
    setManualForm(prev => ({
        ...prev,
        name: '',
        quantity: '',
        lotNumber: '',
        specification: ''
        // keep Unit same as previous entry as user might be entering many boxes
    }));
    
    // Optional: Close modal if you prefer single entry per click, 
    // but typically manual entry is done in batches, so we keep it open.
    // setShowManualModal(false); 
    
    // Show a small toast or visual feedback could be added here
  };

  // --- Bulk Selection Logic ---
  const allSelected = pendingItems.length > 0 && selectedIds.size === pendingItems.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < pendingItems.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingItems.map(i => i.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClearSelected = () => {
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    ids.forEach(id => onDeletePending(id));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Excel Uploader */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-600 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-800 hover:border-green-500 transition-colors group"
        >
          <FileSpreadsheet className="w-8 h-8 text-green-500 mb-2 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-base">Import Excel</h3>
          <p className="text-gray-400 text-xs text-center mt-1">Bulk upload via .xlsx</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleExcelUpload} 
            accept=".xlsx,.xls,.csv" 
            className="hidden" 
          />
        </div>

        {/* Scan DO Card */}
        <div 
           onClick={() => setShowScanModal(true)}
           className="border-2 border-dashed border-gray-600 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-800 hover:border-blue-500 transition-colors group"
        >
          <ScanLine className="w-8 h-8 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-base">Scan DO</h3>
          <p className="text-gray-400 text-xs text-center mt-1">OCR & AI Scan</p>
          
          {/* Hidden Inputs */}
          <input 
            type="file" 
            ref={imageInputRef} 
            onChange={handleImageUpload} 
            accept="image/*" 
            className="hidden" 
          />
          <input 
            type="file" 
            ref={aiInputRef} 
            onChange={handleGeminiScan} 
            accept="image/*" 
            className="hidden" 
          />
        </div>

        {/* Manual Entry */}
        <div 
           onClick={() => setShowManualModal(true)}
           className="border-2 border-dashed border-gray-600 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-800 hover:border-orange-500 transition-colors group"
        >
          <Keyboard className="w-8 h-8 text-orange-500 mb-2 group-hover:scale-110 transition-transform" />
          <h3 className="font-semibold text-base">Manual Entry</h3>
          <p className="text-gray-400 text-xs text-center mt-1">Type details directly</p>
        </div>
      </div>

      {isProcessing && (
        <div className="flex items-center justify-center p-8 bg-gray-800 rounded-lg">
            <Loader2 className="animate-spin mr-2 text-blue-500" />
            <span>Processing data...</span>
        </div>
      )}

      {/* Scan Method Modal */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <ScanLine size={20} className="text-blue-500"/> 
                        Select Scan Method
                    </h3>
                    <button onClick={() => setShowScanModal(false)} className="text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    <button 
                        onClick={() => {
                            setShowScanModal(false);
                            imageInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-4 p-4 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 hover:border-blue-500 transition-all group"
                    >
                        <div className="p-3 bg-blue-900/30 rounded-full text-blue-400 group-hover:scale-110 transition-transform">
                            <Camera size={24} />
                        </div>
                        <div className="text-left">
                            <h4 className="font-bold text-white">Standard OCR</h4>
                            <p className="text-xs text-gray-400">Best for simple text extraction using Tesseract.js</p>
                        </div>
                    </button>

                    <button 
                        onClick={() => {
                            setShowScanModal(false);
                            aiInputRef.current?.click();
                        }}
                        className="w-full flex items-center gap-4 p-4 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 hover:border-purple-500 transition-all group"
                    >
                        <div className="p-3 bg-purple-900/30 rounded-full text-purple-400 group-hover:scale-110 transition-transform">
                            <BrainCircuit size={24} />
                        </div>
                        <div className="text-left">
                            <h4 className="font-bold text-white">AI Smart Scan (Gemini)</h4>
                            <p className="text-xs text-gray-400">Intelligent extraction of items, quantities & specs</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Keyboard size={20} className="text-orange-500"/> 
                        Add Stock Item
                    </h3>
                    <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleManualSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Item Name / Description <span className="text-red-500">*</span></label>
                        <input 
                            type="text"
                            required
                            autoFocus
                            placeholder="e.g. Welding Electrodes E6013"
                            value={manualForm.name}
                            onChange={e => setManualForm({...manualForm, name: e.target.value})}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-orange-500 outline-none"
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
                                value={manualForm.quantity}
                                onChange={e => setManualForm({...manualForm, quantity: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Unit</label>
                            <input 
                                list="units-list"
                                value={manualForm.unit}
                                onChange={e => setManualForm({...manualForm, unit: e.target.value.toUpperCase()})}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                            />
                            <datalist id="units-list">
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
                                value={manualForm.lotNumber}
                                onChange={e => setManualForm({...manualForm, lotNumber: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                            />
                        </div>
                        <div>
                             <label className="block text-xs font-medium text-gray-400 mb-1">Specification (Optional)</label>
                            <input 
                                type="text"
                                placeholder="e.g. 2.5mm"
                                value={manualForm.specification}
                                onChange={e => setManualForm({...manualForm, specification: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button 
                            type="button" 
                            onClick={() => setShowManualModal(false)}
                            className="flex-1 px-4 py-2 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700 font-medium"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            className="flex-1 px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white font-bold flex items-center justify-center gap-2"
                        >
                            <Plus size={18} />
                            Add to List
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* To Be Allocated List */}
      <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        ref={selectAllRef}
                        checked={allSelected}
                        onChange={handleSelectAll}
                        disabled={pendingItems.length === 0}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Select all"
                    />
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <span className="bg-blue-600 text-xs px-2 py-1 rounded-full text-white">{pendingItems.length}</span>
                        To Be Allocated
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={handleClearSelected}
                    disabled={selectedIds.size === 0}
                    className={`px-3 py-1.5 rounded text-sm font-medium text-white transition-colors ${
                        selectedIds.size > 0
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-red-600 opacity-50 cursor-not-allowed'
                    }`}
                >
                    {selectedIds.size > 0 ? `Clear (${selectedIds.size})` : 'Clear'}
                </button>
            </div>
            <p className="text-sm text-gray-400 mt-1">Assign these received items to a shelf rack. Verify OCR accuracy.</p>
        </div>
        
        <div className="divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
            {pendingItems.length === 0 && !isProcessing && (
                <div className="p-8 text-center text-gray-500">
                    No items pending allocation. Upload a file, scan a document, or enter manually.
                </div>
            )}
            {pendingItems.map(item => (
                <AllocationRow 
                    key={item.id} 
                    item={item} 
                    layouts={layouts} 
                    onAllocate={onAllocate}
                    onUpdate={onUpdatePending}
                    onDelete={onDeletePending}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={() => handleToggleSelect(item.id)}
                />
            ))}
        </div>
      </div>
    </div>
  );
};

const AllocationRow: React.FC<{ 
    item: PendingItem; 
    layouts: Layout[]; 
    onAllocate: (id: string, loc: StockItem['location']) => void;
    onUpdate: (item: PendingItem) => void;
    onDelete: (id: string) => void;
    isSelected: boolean;
    onToggleSelect: () => void;
}> = ({ item, layouts, onAllocate, onUpdate, onDelete, isSelected, onToggleSelect }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValues, setEditValues] = useState<PendingItem>(item);
    
    // Allocation state
    const [selectedLayoutId, setSelectedLayoutId] = useState(layouts[0]?.id || '');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        setEditValues(item);
    }, [item]);
    
    // Helper to find racks based on typing
    const activeLayout = layouts.find(l => l.id === selectedLayoutId);
    const allShelves = activeLayout ? Array.from(activeLayout.shelves.values()) : [];
    
    const matchingLocations = useMemo(() => {
        if (!searchTerm) {
            // If no search term, return nothing to avoid clutter or return all (maybe too many)
            // Let's return empty and ask user to type, or maybe top 10?
            // The existing code showed all shelves if search term was empty (because includes('') is true)
            // But it showed ALL racks for ALL shelves. That might be too much.
            // Let's replicate "show all" behavior but flattened if that was the case, 
            // or just show empty state 'Start typing...'?
            // The previous code: filteredShelves = all.filter(s => s.label.includes('')) -> ALL shelves.
            // And it rendered ALL racks.
            // Let's stick to "filter" logic.
            return []; 
        }

        const term = searchTerm.toLowerCase();
        const matches: { shelf: Shelf; rackIndex: number; rackLabel: string }[] = [];

        for (const shelf of allShelves) {
            for (let i = 0; i < shelf.rackCount; i++) {
                const rackLabel = shelf.rackLabels?.[i] || `Rack ${i + 1}`;
                // Match Shelf Label OR Rack Label
                if (shelf.label.toLowerCase().includes(term) || rackLabel.toLowerCase().includes(term)) {
                    matches.push({
                        shelf,
                        rackIndex: i,
                        rackLabel
                    });
                }
            }
        }
        return matches;
    }, [allShelves, searchTerm]);

    const handleConfirmAllocation = (shelfId: string, rackNum: number) => {
        onAllocate(item.id, {
            layoutId: selectedLayoutId,
            shelfId: shelfId,
            rackNumber: rackNum
        });
        setIsExpanded(false);
    };

    const handleSaveEdit = () => {
        onUpdate(editValues);
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditValues(item);
        setIsEditing(false);
    };

    const handleDelete = () => {
        console.log("Attempting to delete item:", item.id, item.name);
        onDelete(item.id);
    };

    if (isEditing) {
        return (
            <div className="p-4 bg-gray-750 border-b border-gray-600">
                <div className="space-y-3">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-blue-400">Edit Item Details</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Item Name</label>
                            <input 
                                type="text"
                                value={editValues.name}
                                onChange={e => setEditValues({...editValues, name: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                            />
                        </div>
                         <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Quantity</label>
                                <input 
                                    type="number"
                                    value={editValues.quantity}
                                    onChange={e => setEditValues({...editValues, quantity: parseFloat(e.target.value) || 0})}
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Unit</label>
                                <input 
                                    type="text"
                                    value={editValues.unit}
                                    onChange={e => setEditValues({...editValues, unit: e.target.value.toUpperCase()})}
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Lot Number</label>
                            <input 
                                type="text"
                                value={editValues.lotNumber || ''}
                                onChange={e => setEditValues({...editValues, lotNumber: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Specification</label>
                            <input 
                                type="text"
                                value={editValues.specification || ''}
                                onChange={e => setEditValues({...editValues, specification: e.target.value})}
                                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button 
                            onClick={handleCancelEdit}
                            className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-500 rounded flex items-center gap-1"
                        >
                            <X size={14} /> Cancel
                        </button>
                        <button 
                            onClick={handleSaveEdit}
                            className="px-3 py-1 text-sm bg-green-600 hover:bg-green-500 rounded flex items-center gap-1 font-medium"
                        >
                            <Save size={14} /> Save
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 hover:bg-gray-750 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect()}
                        disabled={isEditing}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 cursor-pointer flex-shrink-0"
                    />
                    <div className="flex-1 group">
                        <div className="flex items-center gap-2">
                            <h4 className="font-bold text-white">{item.name}</h4>
                            {item.source === 'OCR' && <span className="text-[10px] bg-purple-900 text-purple-200 px-1 rounded">OCR</span>}
                            {item.source === 'AI' && <span className="text-[10px] bg-indigo-900 text-indigo-200 px-1 rounded flex items-center gap-1"><BrainCircuit size={10}/> AI</span>}
                            {item.source === 'EXCEL' && <span className="text-[10px] bg-green-900 text-green-200 px-1 rounded">XLS</span>}
                            {item.source === 'MANUAL' && <span className="text-[10px] bg-orange-900 text-orange-200 px-1 rounded">MANUAL</span>}
                            <button 
                                onClick={() => setIsEditing(true)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white"
                                title="Edit details"
                            >
                                <Pencil size={14} />
                            </button>
                        </div>
                        <div className="text-sm text-gray-400 mt-1 flex flex-wrap gap-4">
                            <span>Qty: <span className="text-white">{item.quantity} {item.unit}</span></span>
                            {item.lotNumber && <span>Lot: <span className="text-blue-300">{item.lotNumber}</span></span>}
                            {item.specification && <span>Spec: <span className="text-yellow-300">{item.specification}</span></span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete();
                        }}
                        className="p-2 rounded font-medium text-sm transition-colors bg-gray-700 hover:bg-red-900/50 text-gray-400 hover:text-red-200 border border-gray-600 hover:border-red-800 z-10"
                        title="Remove item"
                    >
                        <X size={18} />
                    </button>
                    <button 
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={`px-4 py-2 rounded font-medium text-sm transition-colors ${isExpanded ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isExpanded ? 'Cancel' : 'Allocate >'}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="mt-4 p-4 bg-gray-900 rounded border border-gray-700 animate-in fade-in slide-in-from-top-2">
                    <h5 className="text-sm font-semibold text-gray-300 mb-2">Select Location</h5>
                    <div className="space-y-3">
                        {/* Layout Select (if multiple) */}
                        {layouts.length > 1 && (
                            <select 
                                value={selectedLayoutId} 
                                onChange={(e) => setSelectedLayoutId(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-sm"
                            >
                                {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        )}

                        {/* Shelf Search */}
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Type Shelf or Rack Name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            {!searchTerm && matchingLocations.length === 0 && (
                                <p className="text-xs text-gray-500 mt-1">Start typing to find location...</p>
                            )}
                        </div>

                        {/* Suggestions Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto custom-scrollbar">
                            {matchingLocations.map(({ shelf, rackIndex, rackLabel }) => (
                                <button
                                    key={`${shelf.id}-${rackIndex}`}
                                    onClick={() => handleConfirmAllocation(shelf.id, rackIndex + 1)}
                                    className="p-3 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 hover:border-blue-500 transition-all text-left flex flex-col gap-1"
                                >
                                    <div className="font-bold text-sm text-white">{shelf.label}</div>
                                    <div className="text-xs text-blue-400 font-mono">{rackLabel}</div>
                                </button>
                            ))}
                            {searchTerm && matchingLocations.length === 0 && (
                                <div className="col-span-full p-4 text-center text-gray-500 text-sm italic border border-dashed border-gray-700 rounded">
                                    No matching locations found for "{searchTerm}"
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
