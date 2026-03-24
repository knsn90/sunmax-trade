-- Rename enum value 'train' → 'railway' in transport_mode type
-- PostgreSQL 10+ supports ALTER TYPE ... RENAME VALUE
ALTER TYPE transport_mode RENAME VALUE 'train' TO 'railway';
