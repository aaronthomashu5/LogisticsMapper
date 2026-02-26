
import { Layout, StockItem } from './types';

export const DEMO_STOCK_DATA: StockItem[] = [
  { id: 'item-1', name: 'Heavy Duty Bolts - HDB-001', quantity: 500, location: { layoutId: 'main-wh-1', shelfId: '1-1', rackNumber: 3 } },
  { id: 'item-2', name: 'Galvanized Screws - GVS-255', quantity: 1200, location: { layoutId: 'main-wh-1', shelfId: '1-2', rackNumber: 1 } },
  { id: 'item-3', name: 'Copper Wiring - CW-30M', quantity: 150, location: { layoutId: 'main-wh-1', shelfId: '3-4', rackNumber: 5 } },
  { id: 'item-4', name: 'Safety Goggles - SG-PRO', quantity: 250, location: { layoutId: 'main-wh-1', shelfId: '3-1', rackNumber: 2 } },
  { id: 'item-5', name: 'Work Gloves - WG-L', quantity: 300, location: { layoutId: 'main-wh-1', shelfId: '3-1', rackNumber: 4 } },
];

export const INITIAL_LAYOUT: Layout = {
  id: 'main-wh-1',
  name: 'Main Warehouse',
  rows: 5,
  cols: 8,
  shelves: new Map([
    ['1-1', { id: '1-1', row: 1, col: 1, label: 'A-01', rackCount: 5 }],
    ['1-2', { id: '1-2', row: 1, col: 2, label: 'A-02', rackCount: 5 }],
    ['1-4', { id: '1-4', row: 1, col: 4, label: 'B-01', rackCount: 8 }],
    ['1-5', { id: '1-5', row: 1, col: 5, label: 'B-02', rackCount: 8 }],
    ['3-1', { id: '3-1', row: 3, col: 1, label: 'C-01', rackCount: 4 }],
    ['3-2', { id: '3-2', row: 3, col: 2, label: 'C-02', rackCount: 4 }],
    ['3-4', { id: '3-4', row: 3, col: 4, label: 'D-01', rackCount: 6 }],
    ['3-5', { id: '3-5', row: 3, col: 5, label: 'D-02', rackCount: 6 }],
  ])
};
