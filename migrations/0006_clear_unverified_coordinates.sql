-- 0/0 means that map coordinates have not been verified. Address-based
-- navigation remains available without publishing an invented venue marker.
UPDATE events SET latitude=0,longitude=0 WHERE latitude=-2.5042 AND longitude=-44.2976;
