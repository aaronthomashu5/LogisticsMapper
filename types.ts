
export interface Shelf {
  id: string; // "row-col"
  row: number;
  col: number;
  label: string;
  rackCount: number;
  rackLabels?: string[];
}

export interface Division {
  id: string;
  name: string;
}

export interface Layout {
  id: string;
  name: string;
  rows: number;
  cols: number;
  shelves: Map<string, Shelf>;
  divisionIds?: string[]; // Optional for backward compatibility
}

// Helper to serialize Layout for JSON transport (Map -> Array)
export interface SerializedLayout extends Omit<Layout, 'shelves'> {
  shelves: Array<Shelf & { id: string }>;
}

export interface StockItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  lotNumber?: string;
  specification?: string;
  location: {
    layoutId: string;
    shelfId: string;
    rackNumber: number;
  };
}

export interface PendingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  lotNumber?: string;
  specification?: string;
  source: 'EXCEL' | 'OCR' | 'MANUAL' | 'AI';
}

export interface Transaction {
  id: string;
  itemId: string;
  itemName: string;
  quantityChanged: number; 
  timestamp: number;
  originalLocation: {
    layoutId: string;
    shelfId: string;
    rackNumber: number;
  };
  newLocation?: {
    layoutId: string;
    shelfId: string;
    rackNumber: number;
  };
  isRestocked: boolean;
  doNumber?: string;
}

export type AppPhase = 'SETUP' | 'SEARCH' | 'INBOUND' | 'HISTORY';

export interface Profile {
  id: string;
  email: string;
  role: 'user' | 'admin';
  is_approved: boolean;
  created_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
