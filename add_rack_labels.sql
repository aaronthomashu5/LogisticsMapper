-- Add rack_labels column to shelves table
ALTER TABLE shelves 
ADD COLUMN IF NOT EXISTS rack_labels TEXT[];

-- Update RLS policies if needed (usually not for adding columns if existing policies cover update)
-- Existing policies for UPDATE on shelves should cover this.
