-- Drop the single-column constraint
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_ride_key_unique;

-- Add correct multi-column constraint
ALTER TABLE rides
ADD CONSTRAINT rides_user_system_ridekey_unique
UNIQUE (user_id, system, ride_key);