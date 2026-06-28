-- Allow 'chatbot' as a valid ticket channel for the chat intake flow
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_channel_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_channel_check CHECK (channel IN ('app', 'admin', 'chatbot'));
