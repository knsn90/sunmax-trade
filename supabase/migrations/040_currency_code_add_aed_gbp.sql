-- Migration 040: Add AED and GBP to currency_code enum
ALTER TYPE currency_code ADD VALUE IF NOT EXISTS 'AED';
ALTER TYPE currency_code ADD VALUE IF NOT EXISTS 'GBP';
