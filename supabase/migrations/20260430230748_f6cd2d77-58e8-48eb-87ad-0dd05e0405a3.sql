-- Add 'started' to ride_status enum and allow drivers to set it
ALTER TYPE public.ride_status ADD VALUE IF NOT EXISTS 'started' BEFORE 'arrived';