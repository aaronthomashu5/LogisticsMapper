
# Warehouse Mapper Pro - Backend Implementation Guide

This document outlines the recommended architecture for migrating this React application to a full-stack solution with a persistent database.

## Recommended Stack

1.  **Database**: **PostgreSQL**
    *   *Why?* It offers robust support for complex relationships (layouts -> shelves -> items), transactional integrity (crucial for stock movements), and JSONB support if we need to store flexible item specifications.

2.  **Backend API**: **Node.js with Express** (or NestJS)
    *   *Why?* Allows sharing TypeScript interfaces (`types.ts`) between frontend and backend.
    *   *Alternative*: Python (FastAPI/Django) if you plan to integrate advanced AI/OCR features on the server side later.

3.  **ORM**: **Prisma** or **TypeORM**
    *   *Why?* Provides type safety and easy migration management.

## Database Schema (SQL)

Here is a normalized relational schema designed for PostgreSQL.

### 1. `layouts`
Stores the warehouse floor plans.
```sql
CREATE TABLE layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    rows INTEGER NOT NULL,
    cols INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. `shelves`
Stores the individual grid cells that contain racks.
```sql
CREATE TABLE shelves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id UUID REFERENCES layouts(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL, -- 'row' in frontend
    col_index INTEGER NOT NULL, -- 'col' in frontend
    label VARCHAR(50) NOT NULL, -- e.g. "A-01"
    rack_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(layout_id, row_index, col_index) -- Ensure only one shelf per grid cell
);
```

### 3. `stock_items`
Represents the current inventory state.
```sql
CREATE TABLE stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'PCS',
    lot_number VARCHAR(100),
    specification TEXT,
    
    -- Location Foreign Keys
    layout_id UUID REFERENCES layouts(id),
    shelf_id UUID REFERENCES shelves(id),
    rack_number INTEGER NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster searching
CREATE INDEX idx_stock_name ON stock_items(name);
CREATE INDEX idx_stock_lot ON stock_items(lot_number);
```

### 4. `pending_items`
Stores items from Excel/OCR/Manual entry that haven't been allocated to a shelf yet.
```sql
CREATE TABLE pending_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(20) DEFAULT 'PCS',
    lot_number VARCHAR(100),
    specification TEXT,
    source VARCHAR(20) CHECK (source IN ('EXCEL', 'OCR', 'MANUAL')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 5. `transactions`
The history ledger. This is an append-only table (mostly).
```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_item_id UUID, -- Can be null if item was fully deleted
    item_name_snapshot VARCHAR(255) NOT NULL, -- Store name in case item is deleted
    
    quantity_changed DECIMAL(10, 2) NOT NULL, -- Positive = IN, Negative = OUT
    
    -- Snapshot of location where event happened
    layout_id_snapshot UUID, 
    shelf_id_snapshot UUID,
    rack_number_snapshot INTEGER,

    is_restocked BOOLEAN DEFAULT FALSE, -- Flag for 'Undo' functionality
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## API Endpoints Guide

### Layouts
*   `GET /api/layouts` - Fetch all layouts with shelves.
*   `POST /api/layouts` - Create/Update a layout (accepts nested JSON for shelves).

### Inventory
*   `GET /api/stock` - List items with server-side pagination, sorting, and filtering.
*   `POST /api/stock/allocate` - Move item from `pending_items` to `stock_items`.
    *   *Transaction*: Inside a DB transaction, insert into `stock_items`, delete from `pending_items`, and insert into `transactions`.
*   `POST /api/stock/unstock` - Reduce quantity or delete item.
    *   *Transaction*: Update/Delete `stock_items`, insert into `transactions`.

### Inbound
*   `GET /api/inbound` - Get pending items.
*   `POST /api/inbound/upload` - Endpoint to parse Excel/Images on server (more secure).
*   `POST /api/inbound/manual` - Add single pending item.

### History
*   `GET /api/history` - Get transaction logs.
*   `POST /api/history/{id}/restock` - Reverse a transaction.

## Implementation Steps

1.  **Setup Node.js Project**: Initialize `package.json` and install `express`, `pg` (or ORM of choice), `cors`, `dotenv`.
2.  **Database Migration**: implementation the SQL schema above.
3.  **API Development**: Create routes matching the frontend logic.
4.  **Frontend Integration**: Replace `useState` hooks in `App.tsx` with `useEffect` hooks that call `fetch()` or `axios`.
    *   *Example*: Replace `const [items, setItems] = useState(...)` with a `useQuery` hook (React Query) to fetch from `/api/stock`.
