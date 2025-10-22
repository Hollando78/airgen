-- Migration: Add SnapDraft visualization support
-- Description: Add mode column and PNG file path to support LLM-generated visualizations

-- Add mode column to distinguish between technical drawings and visualizations
ALTER TABLE snapdraft_drawings
ADD COLUMN IF NOT EXISTS mode VARCHAR(50) NOT NULL DEFAULT 'technical_drawing'
CHECK (mode IN ('technical_drawing', 'visualization'));

-- Add PNG file path for DALL-E generated images
ALTER TABLE snapdraft_drawings
ADD COLUMN IF NOT EXISTS png_file_path TEXT;

-- Create index on mode for filtering
CREATE INDEX IF NOT EXISTS idx_snapdraft_mode ON snapdraft_drawings(mode);

-- Update column comments
COMMENT ON COLUMN snapdraft_drawings.mode IS 'Generation mode: technical_drawing (DXF/CAD spec) or visualization (DALL-E PNG or SVG diagram)';
COMMENT ON COLUMN snapdraft_drawings.png_file_path IS 'Path to generated PNG file on disk (for DALL-E visualizations)';
COMMENT ON COLUMN snapdraft_drawings.spec_json IS 'Drawing specification (technical_drawing) or visualization metadata (visualization mode)';
