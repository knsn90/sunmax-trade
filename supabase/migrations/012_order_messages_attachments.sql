-- Add attachment support to order_messages
ALTER TABLE order_messages
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type  TEXT,   -- 'image' | 'audio' | 'file'
  ADD COLUMN IF NOT EXISTS attachment_name  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size  INTEGER;

-- Create public chat-attachments storage bucket
-- Allows ALL file types, 100 MB limit per file
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  104857600,   -- 100 MB (100 * 1024 * 1024)
  NULL         -- NULL = tüm MIME türlerine izin ver
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = 104857600,
      allowed_mime_types = NULL;

-- Allow authenticated users to upload
CREATE POLICY "chat_attach_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to read
CREATE POLICY "chat_attach_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
