
import React from 'react';
import type { Transaction } from '../types';
import { History, RefreshCw, ArrowUpRight } from 'lucide-react';

interface StockHistoryProps {
  transactions: Transaction[];
  onRestock: (txnId: string) => void;
}

export const StockHistory: React.FC<StockHistoryProps> = ({ transactions, onRestock }) => {
  return (
    <div className="space-y-6">
       <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <History className="text-blue-400" />
            Stock Movement History
          </h1>
          <p className="text-gray-400">Log of unstocked items. You can restock items back to their original location.</p>
       </div>

       <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="divide-y divide-gray-700">
             {transactions.length === 0 && (
                 <div className="p-8 text-center text-gray-500">
                     No history available yet. Unstock items from the Search view.
                 </div>
             )}
             {transactions.map(txn => (
                 <div key={txn.id} className="p-4 flex items-center justify-between hover:bg-gray-750 transition-colors">
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold px-2 py-0.5 rounded ${txn.quantityChanged < 0 ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                                {txn.quantityChanged < 0 ? 'OUT' : 'IN'}
                            </span>
                            <h4 className="font-bold text-white">{txn.itemName}</h4>
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                            {new Date(txn.timestamp).toLocaleString()} • Qty: {Math.abs(txn.quantityChanged)}
                        </div>
                    </div>
                    
                    {!txn.isRestocked && txn.quantityChanged < 0 && (
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
