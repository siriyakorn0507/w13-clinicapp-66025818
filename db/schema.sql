-- Cat Hotel / Boarding App — Azure SQL schema
-- Compatible with Azure SQL (uses IDENTITY, NVARCHAR, DATETIME2)

IF OBJECT_ID('bookings', 'U') IS NOT NULL DROP TABLE bookings;
IF OBJECT_ID('rooms',    'U') IS NOT NULL DROP TABLE rooms;

-- 1. ตารางห้องพักน้องแมว (แทน doctors)
CREATE TABLE rooms (
  id              INT             IDENTITY(1,1) PRIMARY KEY,
  name            NVARCHAR(100)   NOT NULL, -- เช่น ห้อง A01, ห้อง VIP 1
  room_type       NVARCHAR(100)   NOT NULL, -- เช่น Standard, Deluxe, VIP
  price_per_night DECIMAL(10, 2)  NOT NULL, -- ราคาต่อคืน เช่น 350.00
  created         DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- 2. ตารางการจองฝากเลี้ยง (แทน appointments)
CREATE TABLE bookings (
  id              INT             IDENTITY(1,1) PRIMARY KEY,
  room_id         INT             NOT NULL,
  cat_name        NVARCHAR(100)   NOT NULL, -- ชื่อน้องแมว
  owner_name      NVARCHAR(100)   NOT NULL, -- ชื่อเจ้าของ
  owner_phone     NVARCHAR(50)    NOT NULL, -- เบอร์ติดต่อฉุกเฉิน
  check_in_date   DATETIME2       NOT NULL, -- วันที่เช็คอิน
  check_out_date  DATETIME2       NOT NULL, -- วันที่เช็คเอาท์
  note            NVARCHAR(500)   NULL,     -- ข้อควรระวัง / ยา / อาหาร
  created         DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_bookings_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON DELETE CASCADE
);

-- สร้าง Index สำหรับช่วยค้นหาวันเช็คอินและเช็คเอาท์ให้เร็วขึ้น
CREATE INDEX ix_bookings_dates ON bookings (check_in_date, check_out_date);