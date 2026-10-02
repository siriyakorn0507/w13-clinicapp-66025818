import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import { getSqlPool } from './db.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => res.json({ ok: true, service: 'cathotel-api' }));

// 1. ดึงรายการห้องพักทั้งหมด (ถ้าส่ง check_in และ check_out มาด้วย จะตรวจสถานะ is_available ให้)
app.get('/rooms', async (req, res, next) => {
  const { check_in, check_out } = req.query;

  try {
    const pool = await getSqlPool();

    // กรณีไม่ได้ระบุวัน: ดึงข้อมูลห้องทั้งหมดตามปกติ
    if (!check_in || !check_out) {
      const r = await pool.request()
        .query('SELECT id, name, room_type, price_per_night FROM rooms ORDER BY name');
      return res.json(r.recordset);
    }

    // กรณีระบุวัน: ตรวจสอบช่วงวันที่ทับซ้อน (Overlap Check: check_in < check_out_date AND check_out > check_in_date)
    const r = await pool.request()
      .input('check_in', sql.DateTime2, new Date(check_in))
      .input('check_out', sql.DateTime2, new Date(check_out))
      .query(`
        SELECT 
          r.id, 
          r.name, 
          r.room_type, 
          r.price_per_night,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM bookings b
              WHERE b.room_id = r.id
                AND (@check_in < b.check_out_date AND @check_out > b.check_in_date)
            ) THEN 0 
            ELSE 1 
          END AS is_available
        FROM rooms r
        ORDER BY r.name
      `);

    res.json(r.recordset);
  } catch (e) { next(e); }
});

// 2. ดึงรายการจองฝากเลี้ยงทั้งหมดพร้อมข้อมูลห้อง
app.get('/bookings', async (_req, res, next) => {
  try {
    const pool = await getSqlPool();
    const r = await pool.request().query(`
      SELECT 
        b.id, 
        b.room_id,
        b.cat_name, 
        b.owner_name, 
        b.owner_phone, 
        b.check_in_date, 
        b.check_out_date, 
        b.note,
        b.created,
        r.name AS room_name, 
        r.room_type, 
        r.price_per_night
      FROM bookings b 
      JOIN rooms r ON b.room_id = r.id
      ORDER BY b.check_in_date DESC
    `);
    res.json(r.recordset);
  } catch (e) { next(e); }
});

// 3. จองห้องพักฝากเลี้ยงแมว (1 ห้องต่อ 1 ตัวในช่วงวันเดียวกัน)
app.post('/bookings', async (req, res, next) => {
  const { room_id, cat_name, owner_name, owner_phone, check_in_date, check_out_date, note } = req.body || {};

  if (!room_id || !cat_name || !owner_name || !owner_phone || !check_in_date || !check_out_date) {
    return res.status(400).json({ 
      error: 'room_id, cat_name, owner_name, owner_phone, check_in_date, and check_out_date are required' 
    });
  }

  const checkIn = new Date(check_in_date);
  const checkOut = new Date(check_out_date);

  if (checkIn >= checkOut) {
    return res.status(400).json({ error: 'check_out_date must be after check_in_date' });
  }

  try {
    const pool = await getSqlPool();

    // ดึงข้อมูลว่ามีแมวตัวไหนจองทับซ้อนอยู่หรือไม่
    const overlapCheck = await pool.request()
      .input('room_id', sql.Int, Number(room_id))
      .input('check_in', sql.DateTime2, checkIn)
      .input('check_out', sql.DateTime2, checkOut)
      .query(`
        SELECT TOP 1 cat_name, check_in_date, check_out_date 
        FROM bookings
        WHERE room_id = @room_id
          AND (@check_in < check_out_date AND @check_out > check_in_date)
      `);

    if (overlapCheck.recordset.length > 0) {
      const booked = overlapCheck.recordset[0];
      return res.status(409).json({ 
        error: `ห้องนี้ไม่ว่าง! มีน้องแมว "${booked.cat_name}" จองพักอยู่แล้วในช่วงวันที่เลือก` 
      });
    }

    // บันทึกการจอง
    const r = await pool.request()
      .input('room_id', sql.Int, Number(room_id))
      .input('cat_name', sql.NVarChar(100), String(cat_name))
      .input('owner_name', sql.NVarChar(100), String(owner_name))
      .input('owner_phone', sql.NVarChar(50), String(owner_phone))
      .input('check_in_date', sql.DateTime2, checkIn)
      .input('check_out_date', sql.DateTime2, checkOut)
      .input('note', sql.NVarChar(500), note ? String(note) : null)
      .query(`
        INSERT INTO bookings (room_id, cat_name, owner_name, owner_phone, check_in_date, check_out_date, note)
        OUTPUT 
          INSERTED.id, 
          INSERTED.room_id, 
          INSERTED.cat_name, 
          INSERTED.owner_name, 
          INSERTED.owner_phone, 
          INSERTED.check_in_date, 
          INSERTED.check_out_date, 
          INSERTED.note
        VALUES (@room_id, @cat_name, @owner_name, @owner_phone, @check_in_date, @check_out_date, @note)
      `);

    res.status(201).json(r.recordset[0]);
  } catch (e) { next(e); }
});

// 4. ยกเลิกรายการจอง
app.delete('/bookings/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const pool = await getSqlPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM bookings WHERE id = @id');
    if (r.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  if (err.code === 'NO_DB_CONFIG') {
    return res.status(503).json({
      error: 'database_not_configured',
      hint: 'Set AZURE_SQL_CONNECTION_STRING environment variable'
    });
  }
  console.error('unhandled', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`cathotel-api listening on :${PORT}`);
});