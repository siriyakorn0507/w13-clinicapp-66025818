-- Cat Hotel App — seed data (run after schema.sql)
-- 6 sample cat rooms for demo

INSERT INTO rooms (name, room_type, price_per_night) VALUES
  (N'Room 101 - Cozy Box',          N'Standard', 300.00),
  (N'Room 102 - Little Haven',      N'Standard', 300.00),
  (N'Room 201 - Garden View',       N'Deluxe',   450.00),
  (N'Room 202 - Sky Walk Tree',     N'Deluxe',   500.00),
  (N'Room 301 - Penthouse Suite',   N'VIP',      800.00),
  (N'Room 302 - Penthouse Suite',   N'VIP',      800.00);