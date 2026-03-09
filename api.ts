
import { supabase } from './supabaseClient';
import type { Layout, StockItem, PendingItem, Transaction, SerializedLayout, Shelf, Division } from './types';
import { INITIAL_LAYOUT } from './constants';

// --- HELPER ---
// Convert Backend JSON (Array of shelves) to Frontend Map
const deserializeLayout = (l: any): Layout => ({
  id: l.id,
  name: l.name,
  rows: l.rows,
  cols: l.cols,
  shelves: new Map(l.shelves.map((s: any) => [`${s.row_index}-${s.col_index}`, {
      id: s.id,
      row: s.row_index,
      col: s.col_index,
      label: s.label,
      rackCount: s.rack_count,
      rackLabels: s.rack_labels
  }]))
});

export const api = {
  async getNotifications() {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data;
  },

  async markNotificationAsRead(id: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (error) throw error;
  },

  async getDivisions(): Promise<Division[]> {
    const { data, error } = await supabase.from('divisions').select('*');
    if (error) throw new Error(error.message);
    return data;
  },

  async createDivision(name: string): Promise<Division> {
    const { data, error } = await supabase.from('divisions').insert({ name }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async getUserDivisions(userId: string): Promise<string[]> {
    const { data, error } = await supabase.from('user_divisions').select('division_id').eq('user_id', userId);
    if (error) throw new Error(error.message);
    return data.map((d: any) => d.division_id);
  },

  async setUserDivisions(userId: string, divisionIds: string[]): Promise<void> {
    // 1. Delete existing
    await supabase.from('user_divisions').delete().eq('user_id', userId);
    
    // 2. Insert new
    if (divisionIds.length > 0) {
      const { error } = await supabase.from('user_divisions').insert(
        divisionIds.map(dId => ({ user_id: userId, division_id: dId }))
      );
      if (error) throw new Error(error.message);
    }
  },

  async getLayouts(): Promise<Layout[]> {
    const { data: layouts, error: layoutError } = await supabase
      .from('layouts')
      .select(`
        *,
        layout_divisions (
          division_id
        )
      `);

    if (layoutError) throw new Error(layoutError.message);

    const { data: shelves, error: shelfError } = await supabase
      .from('shelves')
      .select('*');

    if (shelfError) throw new Error(shelfError.message);

    // Group shelves by layout_id
    const shelvesByLayout = new Map<string, any[]>();
    shelves.forEach((s: any) => {
        if (!shelvesByLayout.has(s.layout_id)) {
            shelvesByLayout.set(s.layout_id, []);
        }
        shelvesByLayout.get(s.layout_id)?.push(s);
    });

    return layouts.map((l: any) => ({
        ...deserializeLayout({
            ...l,
            shelves: shelvesByLayout.get(l.id) || []
        }),
        divisionIds: l.layout_divisions?.map((ld: any) => ld.division_id) || []
    }));
  },

  async saveLayout(layout: Layout): Promise<Layout> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("User not authenticated");

    // Validate Layout ID (Ensure it's a UUID)
    let layoutId = layout.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(layoutId)) {
        // Generate new UUID if invalid (e.g. old temp ID)
        layoutId = crypto.randomUUID(); 
    }

    // 1. Upsert Layout
    const { error: layoutError } = await supabase
      .from('layouts')
      .upsert({
        id: layoutId,
        user_id: user.id,
        name: layout.name,
        rows: layout.rows,
        cols: layout.cols
      });

    if (layoutError) throw new Error(layoutError.message);

    // 2. Upsert Divisions (if provided)
    if (layout.divisionIds) {
        // Delete existing
        await supabase.from('layout_divisions').delete().eq('layout_id', layoutId);
        
        // Insert new
        if (layout.divisionIds.length > 0) {
            await supabase.from('layout_divisions').insert(
                layout.divisionIds.map(dId => ({ layout_id: layoutId, division_id: dId }))
            );
        }
    }

    // 3. Handle Shelves (Smart Upsert to avoid Unique Constraint Violation)
    
    // A. Fetch existing shelves to map (row, col) -> id
    const { data: existingShelves, error: fetchError } = await supabase
        .from('shelves')
        .select('id, row_index, col_index')
        .eq('layout_id', layoutId);

    if (fetchError) throw new Error(fetchError.message);

    const existingShelfMap = new Map<string, string>(); // Key: "row-col", Value: uuid
    existingShelves?.forEach((s: any) => {
        existingShelfMap.set(`${s.row_index}-${s.col_index}`, s.id);
    });

    // B. Prepare shelves for upsert
    const shelvesToUpsert = Array.from(layout.shelves.values()).map(s => {
        const isTempId = s.id.length < 30 && s.id.includes('-');
        const coordKey = `${s.row}-${s.col}`;
        
        let shelfId = s.id;

        if (isTempId) {
            // Check if we already have a shelf at this location in DB
            if (existingShelfMap.has(coordKey)) {
                // Use existing ID to trigger UPDATE instead of INSERT
                shelfId = existingShelfMap.get(coordKey)!;
            } else {
                // Truly new shelf, generate new UUID
                shelfId = crypto.randomUUID();
            }
        }
        
        return {
            id: shelfId,
            user_id: user.id,
            layout_id: layoutId,
            row_index: s.row,
            col_index: s.col,
            label: s.label,
            rack_count: s.rackCount,
            rack_labels: s.rackLabels || null
        };
    });

    if (shelvesToUpsert.length > 0) {
        const { error: upsertError } = await supabase
        .from('shelves')
        .upsert(shelvesToUpsert);
        
        if (upsertError) throw new Error(upsertError.message);
    }

    // 4. Delete removed shelves
    const currentShelfIds = new Set(shelvesToUpsert.map(s => s.id));
    const idsToDelete = existingShelves
        .map((s: any) => s.id)
        .filter((id: string) => !currentShelfIds.has(id));
    
    if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
            .from('shelves')
            .delete()
            .in('id', idsToDelete);

        if (deleteError) throw new Error(deleteError.message);
    }

    return { ...layout, id: layoutId };
  },

  async getItems(): Promise<StockItem[]> {
    const { data, error } = await supabase
      .from('stock_items')
      .select(`
        *,
        layout:layouts(id),
        shelf:shelves(id)
      `);

    if (error) throw new Error(error.message);

    return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        lotNumber: item.lot_number,
        specification: item.specification,
        location: {
            layoutId: item.layout_id,
            shelfId: item.shelf_id,
            rackNumber: item.rack_number
        }
    }));
  },

  async getPendingItems(): Promise<PendingItem[]> {
    const { data, error } = await supabase
      .from('pending_items')
      .select('*');

    if (error) throw new Error(error.message);

    return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        lotNumber: item.lot_number,
        specification: item.specification,
        source: item.source
    }));
  },

  async addPendingItems(items: PendingItem[]): Promise<PendingItem[]> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("User not authenticated");

    const itemsToInsert = items.map(item => ({
        // id: item.id, // Let Supabase generate UUID if needed, or use provided ID if it's a UUID
        // If item.id is not a UUID, we might want to omit it and let DB generate.
        // Assuming item.id is generated by frontend as UUID or we want to use it.
        // If frontend generates 'pending-123', it won't work with UUID column.
        // Let's assume we want to let DB generate ID, or we generate UUIDs in frontend.
        // For safety, let's omit ID if it looks like a temp ID, or just map fields.
        user_id: user.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        lot_number: item.lotNumber,
        specification: item.specification,
        source: item.source
    }));

    const { data, error } = await supabase
      .from('pending_items')
      .insert(itemsToInsert)
      .select();

    if (error) throw new Error(error.message);
    
    return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        lotNumber: item.lot_number,
        specification: item.specification,
        source: item.source
    }));
  },

  async deletePendingItem(id: string): Promise<void> {
    const { error } = await supabase
      .from('pending_items')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async allocateItem(pendingId: string, location: StockItem['location']): Promise<void> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("User not authenticated");

    // 1. Get Pending Item
    const { data: pendingItem, error: fetchError } = await supabase
        .from('pending_items')
        .select('*')
        .eq('id', pendingId)
        .single();
    
    if (fetchError || !pendingItem) throw new Error("Pending item not found");

    // 2. Insert into Stock
    const { data: stockItem, error: stockError } = await supabase
        .from('stock_items')
        .insert({
            user_id: user.id,
            name: pendingItem.name,
            quantity: pendingItem.quantity,
            unit: pendingItem.unit,
            lot_number: pendingItem.lot_number,
            specification: pendingItem.specification,
            layout_id: location.layoutId,
            shelf_id: location.shelfId,
            rack_number: location.rackNumber
        })
        .select()
        .single();

    if (stockError) throw new Error(stockError.message);

    // 3. Create Transaction
    const { error: txnError } = await supabase
        .from('transactions')
        .insert({
            user_id: user.id,
            stock_item_id: stockItem.id,
            item_name_snapshot: stockItem.name,
            quantity_changed: stockItem.quantity,
            timestamp: Date.now(),
            layout_id_snapshot: location.layoutId,
            shelf_id_snapshot: location.shelfId,
            rack_number_snapshot: location.rackNumber,
            is_restocked: false
        });

    if (txnError) throw new Error(txnError.message);

    // 4. Delete Pending Item
    const { error: deleteError } = await supabase
        .from('pending_items')
        .delete()
        .eq('id', pendingId);

    if (deleteError) throw new Error(deleteError.message);
  },

  async unstockItem(itemId: string, quantity: number, doNumber?: string): Promise<void> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("User not authenticated");

    // 1. Get Stock Item
    const { data: item, error: fetchError } = await supabase
        .from('stock_items')
        .select('*')
        .eq('id', itemId)
        .single();

    if (fetchError || !item) throw new Error("Item not found");

    // 2. Update Stock or Delete if 0
    const newQuantity = Math.max(0, item.quantity - quantity);
    
    if (newQuantity === 0) {
        const { error: deleteError } = await supabase
            .from('stock_items')
            .delete()
            .eq('id', itemId);
        if (deleteError) throw new Error(deleteError.message);
    } else {
        const { error: updateError } = await supabase
            .from('stock_items')
            .update({ quantity: newQuantity })
            .eq('id', itemId);
        if (updateError) throw new Error(updateError.message);
    }

    // 3. Create Transaction
    const { error: txnError } = await supabase
        .from('transactions')
        .insert({
            user_id: user.id,
            stock_item_id: item.id,
            item_name_snapshot: item.name,
            quantity_changed: -quantity,
            timestamp: Date.now(),
            layout_id_snapshot: item.layout_id,
            shelf_id_snapshot: item.shelf_id,
            rack_number_snapshot: item.rack_number,
            do_number: doNumber,
            is_restocked: false
        });

    if (txnError) throw new Error(txnError.message);
  },

  async reallocateItem(itemId: string, quantity: number, newLocation: StockItem['location']): Promise<void> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("User not authenticated");

    // 1. Get Source Item
    const { data: sourceItem, error: fetchError } = await supabase
        .from('stock_items')
        .select('*')
        .eq('id', itemId)
        .single();

    if (fetchError || !sourceItem) throw new Error("Source item not found");
    if (sourceItem.quantity < quantity) throw new Error("Insufficient quantity");

    // 2. Decrement Source
    const newSourceQty = sourceItem.quantity - quantity;
    if (newSourceQty === 0) {
        await supabase.from('stock_items').delete().eq('id', itemId);
    } else {
        await supabase.from('stock_items').update({ quantity: newSourceQty }).eq('id', itemId);
    }

    // 3. Increment/Create Destination
    let query = supabase.from('stock_items').select('*')
        .eq('layout_id', newLocation.layoutId)
        .eq('shelf_id', newLocation.shelfId)
        .eq('rack_number', newLocation.rackNumber)
        .eq('name', sourceItem.name);
    
    if (sourceItem.lot_number) query = query.eq('lot_number', sourceItem.lot_number);
    else query = query.is('lot_number', null);

    const { data: existingDestItems } = await query;
    const existingDestItem = existingDestItems?.[0];
    let destItemId;

    if (existingDestItem) {
        destItemId = existingDestItem.id;
        await supabase.from('stock_items').update({
            quantity: existingDestItem.quantity + quantity
        }).eq('id', destItemId);
    } else {
        const { data: newItem } = await supabase.from('stock_items').insert({
            user_id: user.id,
            name: sourceItem.name,
            quantity: quantity,
            unit: sourceItem.unit,
            lot_number: sourceItem.lot_number,
            specification: sourceItem.specification,
            layout_id: newLocation.layoutId,
            shelf_id: newLocation.shelfId,
            rack_number: newLocation.rackNumber
        }).select().single();
        destItemId = newItem.id;
    }

    // 4. Log Transaction (Move)
    // Note: Requires new columns in transactions table: new_layout_id, new_shelf_id, new_rack_number
    await supabase.from('transactions').insert({
        user_id: user.id,
        stock_item_id: destItemId,
        item_name_snapshot: sourceItem.name,
        quantity_changed: quantity, // Positive to indicate it exists now? Or maybe 0? Let's use quantity moved.
        timestamp: Date.now(),
        layout_id_snapshot: sourceItem.layout_id,
        shelf_id_snapshot: sourceItem.shelf_id,
        rack_number_snapshot: sourceItem.rack_number,
        new_layout_id: newLocation.layoutId,
        new_shelf_id: newLocation.shelfId,
        new_rack_number: newLocation.rackNumber,
        is_restocked: false
    });
  },

  async getTransactions(): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return data.map((t: any) => ({
        id: t.id,
        itemId: t.stock_item_id,
        itemName: t.item_name_snapshot,
        quantityChanged: t.quantity_changed,
        timestamp: parseInt(t.timestamp),
        originalLocation: {
            layoutId: t.layout_id_snapshot,
            shelfId: t.shelf_id_snapshot,
            rackNumber: t.rack_number_snapshot
        },
        newLocation: t.new_layout_id ? {
            layoutId: t.new_layout_id,
            shelfId: t.new_shelf_id,
            rackNumber: t.new_rack_number
        } : undefined,
        isRestocked: t.is_restocked,
        doNumber: t.do_number
    }));
  },

  async restockTransaction(txnId: string): Promise<void> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("User not authenticated");

    // 1. Get Transaction
    const { data: txn, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', txnId)
        .single();

    if (fetchError || !txn) throw new Error("Transaction not found");

    // 2. Update Stock (or re-create if it was fully deleted? Logic assumes update for now)
    // Check if item exists
    const { data: existingItem } = await supabase
        .from('stock_items')
        .select('*')
        .eq('id', txn.stock_item_id)
        .single();

    const qtyToAdd = Math.abs(txn.quantity_changed);

    if (existingItem) {
        await supabase
            .from('stock_items')
            .update({ quantity: existingItem.quantity + qtyToAdd })
            .eq('id', existingItem.id);
    } else {
        // Re-create item
        await supabase
            .from('stock_items')
            .insert({
                id: txn.stock_item_id, // Try to reuse ID
                user_id: user.id,
                name: txn.item_name_snapshot,
                quantity: qtyToAdd,
                layout_id: txn.layout_id_snapshot,
                shelf_id: txn.shelf_id_snapshot,
                rack_number: txn.rack_number_snapshot
            });
    }

    // 3. Mark Transaction as Restocked
    await supabase
        .from('transactions')
        .update({ is_restocked: true })
        .eq('id', txnId);
  }
};
