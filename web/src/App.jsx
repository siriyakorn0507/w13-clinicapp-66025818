import { useEffect, useState, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const ADDON_SERVICES = [
  { id: 'bath', name: '🛁 สปาอาบน้ำ & แปรงขน', price: 150 },
  { id: 'cctv', name: '📹 กล้องส่องเจ้านาย 24 ชม.', price: 50, perDay: true },
  { id: 'snack', name: '🐟 ขนมแมวเลีย/อกไก่ต้มพิเศษ', price: 40, perDay: true },
  { id: 'shuttle', name: '🚗 รถรับ-ส่งถึงคอนโด/บ้าน', price: 120 }
];

export default function App() {
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // State ฟอร์ม
  const [form, setForm] = useState({
    room_id: '',
    cat_name: '',
    owner_name: '',
    owner_phone: '',
    check_in_date: '',
    check_out_date: '',
    note: ''
  });
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  // State ค้นหา & กรอง
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // State ป๊อปอัปใบเสร็จ
  const [receiptData, setReceiptData] = useState(null);

  async function load() {
    try {
      setError(null);
      const [resRooms, resBookings] = await Promise.all([
        fetch(`${API_BASE}/rooms`),
        fetch(`${API_BASE}/bookings`)
      ]);

      const dataRooms = await resRooms.json();
      const dataBookings = await resBookings.json();

      if (!resRooms.ok) throw new Error(dataRooms.error || 'โหลดห้องพักไม่สำเร็จ');
      if (!resBookings.ok) throw new Error(dataBookings.error || 'โหลดรายการจองไม่สำเร็จ');

      const validRooms = Array.isArray(dataRooms) ? dataRooms : [];
      const validBookings = Array.isArray(dataBookings) ? dataBookings : [];

      setRooms(validRooms);
      setBookings(validBookings);

      if (validRooms.length > 0 && !form.room_id) {
        setForm(f => ({ ...f, room_id: validRooms[0].id }));
      }
    } catch (e) {
      console.error(e);
      setError(e.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ฟีเจอร์ 1: คำนวณราคาห้อง + บริการเสริม
  const priceCalculation = useMemo(() => {
    if (!form.check_in_date || !form.check_out_date || !form.room_id) return null;
    const checkIn = new Date(form.check_in_date);
    const checkOut = new Date(form.check_out_date);
    const diffTime = checkOut - checkIn;
    if (diffTime <= 0) return null;
    
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const selectedRoom = rooms.find(r => r.id === Number(form.room_id));
    if (!selectedRoom) return null;

    const roomTotal = days * Number(selectedRoom.price_per_night || 0);

    const addonTotal = selectedAddons.reduce((sum, addonId) => {
      const addon = ADDON_SERVICES.find(a => a.id === addonId);
      if (!addon) return sum;
      return sum + (addon.perDay ? addon.price * days : addon.price);
    }, 0);

    return {
      days,
      roomTotal,
      addonTotal,
      grandTotal: roomTotal + addonTotal,
      roomName: selectedRoom.name
    };
  }, [form.check_in_date, form.check_out_date, form.room_id, selectedAddons, rooms]);

  // ฟีเจอร์ 2: สถิติ Dashboard
  const stats = useMemo(() => {
    const now = new Date();
    let activeCats = 0;
    let totalIncome = 0;

    bookings.forEach(b => {
      const inDate = new Date(b.check_in_date);
      const outDate = new Date(b.check_out_date);
      if (now >= inDate && now <= outDate) activeCats += 1;
      
      const diff = Math.max(1, Math.ceil((outDate - inDate) / (1000 * 60 * 60 * 24)));
      totalIncome += diff * Number(b.price_per_night || 0);
    });

    return {
      totalRooms: rooms.length,
      activeCats,
      totalIncome
    };
  }, [rooms, bookings]);

  // ฟีเจอร์ 3: ตรวจสอบสถานะการเข้าพัก
  const getBookingStatus = (checkIn, checkOut) => {
    const now = new Date();
    const start = new Date(checkIn);
    const end = new Date(checkOut);

    if (now > end) return { text: 'เช็คเอาท์แล้ว', bg: '#F3F4F6', color: '#6B7280' };
    if (now >= start && now <= end) return { text: '🟢 กำลังเข้าพัก', bg: '#DCFCE7', color: '#15803D' };
    return { text: '⏳ จองล่วงหน้า', bg: '#FEF3C7', color: '#B45309' };
  };

  // ฟีเจอร์ 4: กรองและค้นหารายการจอง
  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const matchSearch = (b.cat_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (b.owner_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (b.owner_phone?.includes(searchQuery));
      const matchType = filterType === 'ALL' || b.room_type?.toUpperCase() === filterType;
      return matchSearch && matchType;
    });
  }, [bookings, searchQuery, filterType]);

  const toggleAddon = (addonId) => {
    setSelectedAddons(prev => 
      prev.includes(addonId) ? prev.filter(id => id !== addonId) : [...prev, addonId]
    );
  };

  // เช็กห้องว่างแบบ Real-time ทุกครั้งที่ผู้ใช้เลือกวันเช็คอิน หรือ วันเช็คเอาท์
useEffect(() => {
  async function checkAvailability() {
    if (!form.check_in_date || !form.check_out_date) return;
    if (new Date(form.check_in_date) >= new Date(form.check_out_date)) return;

    try {
      const res = await fetch(`${API_BASE}/rooms?check_in=${form.check_in_date}&check_out=${form.check_out_date}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setRooms(data);

        // ถ้าห้องที่เลือกอยู่ปัจจุบันไม่ว่าง ให้สลับไปเลือกห้องแรกที่ว่างอัตโนมัติ
        const selected = data.find(r => r.id === Number(form.room_id));
        if (selected && selected.is_available === 0) {
          const firstFree = data.find(r => r.is_available === 1);
          setForm(f => ({ ...f, room_id: firstFree ? firstFree.id : '' }));
        }
      }
    } catch (err) {
      console.error('เช็กห้องว่างไม่สำเร็จ', err);
    }
  }

  checkAvailability();
}, [form.check_in_date, form.check_out_date]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!priceCalculation) return;
    setSubmitting(true);
    setError(null);

    // ประกอบข้อความบริการเสริมเข้ากับ Note
    const addonNames = selectedAddons.map(id => ADDON_SERVICES.find(a => a.id === id)?.name).join(', ');
    const finalNote = [
      form.note?.trim(),
      addonNames ? `[บริการเสริม: ${addonNames}]` : ''
    ].filter(Boolean).join(' | ');

    try {
      const payload = { ...form, note: finalNote };
      const res = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'จองไม่สำเร็จ');

      // ฟีเจอร์ 5: เปิดป๊อปอัปใบเสร็จ
      setReceiptData({
        ...payload,
        id: data.id,
        calculation: priceCalculation,
        addons: addonNames
      });

      // รีเซ็ตฟอร์ม
      setForm({
        room_id: rooms[0]?.id || '',
        cat_name: '',
        owner_name: '',
        owner_phone: '',
        check_in_date: '',
        check_out_date: '',
        note: ''
      });
      setSelectedAddons([]);
      await load();
    } catch (e) {
      setError(e.message === 'room_already_booked_in_this_period' 
        ? '😿 ห้องนี้ถูกจองในช่วงวันดังกล่าวแล้ว กรุณาเลือกห้องอื่นหรือช่วงวันใหม่' 
        : (e.message || 'เกิดข้อผิดพลาดในการบันทึก'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel(id) {
    if (!confirm('ยืนยันการยกเลิกรายการนี้หรือไม่? 🐾')) return;
    setCancellingId(id);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('ยกเลิกไม่สำเร็จ');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#FFFBF5',
      fontFamily: "'Prompt', -apple-system, sans-serif",
      color: '#4A5568',
      padding: '2rem 1rem'
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        
        {/* Header */}
        <header style={{
          textAlign: 'center',
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%)',
          padding: '2.5rem 1.5rem',
          borderRadius: 24,
          boxShadow: '0 8px 24px rgba(251, 146, 60, 0.18)'
        }}>
          <span style={{ fontSize: '3.2rem', display: 'inline-block' }}>🐾🐱🏰</span>
          <h1 style={{ margin: '0.5rem 0 0', fontSize: '2.2rem', color: '#9A3412', fontWeight: 800 }}>
            Meow Hotel & Boarding
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: '#C2410C', fontSize: '1.05rem', fontWeight: 600 }}>
            ระบบจัดการโรงแรมและรับฝากเจ้านายระดับพรีเมียม 💖
          </p>
        </header>

        {/* ฟีเจอร์ 2: Dashboard Stat Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{ backgroundColor: '#fff', padding: '1.25rem', borderRadius: 18, border: '1px solid #FED7AA', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ color: '#9A3412', fontSize: '0.9rem', fontWeight: 600 }}>🏠 ห้องพักทั้งหมด</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#EA580C', marginTop: 4 }}>{stats.totalRooms} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#666' }}>ห้อง</span></div>
          </div>
          <div style={{ backgroundColor: '#fff', padding: '1.25rem', borderRadius: 18, border: '1px solid #BBF7D0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ color: '#166534', fontSize: '0.9rem', fontWeight: 600 }}>🐾 แมวที่พักอยู่ตอนนี้</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{stats.activeCats} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#666' }}>ตัว</span></div>
          </div>
          <div style={{ backgroundColor: '#fff', padding: '1.25rem', borderRadius: 18, border: '1px solid #FDE68A', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ color: '#854D0E', fontSize: '0.9rem', fontWeight: 600 }}>💰 ประมาณการค่าห้องรวม</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#CA8A04', marginTop: 4 }}>฿{stats.totalIncome.toLocaleString()}</div>
          </div>
        </div>


        {/* ส่วนแสดงห้องพัก */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem', color: '#1F2937', fontWeight: 700 }}>
            🏠 เลือกห้องพักที่ถูกใจ
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {rooms.map(r => {
              const isSelected = String(form.room_id) === String(r.id);
              return (
                <div
                  key={r.id}
                  onClick={() => setForm(f => ({ ...f, room_id: r.id }))}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 18,
                    padding: '1.25rem',
                    border: isSelected ? '2px solid #FB923C' : '1px solid #E5E7EB',
                    boxShadow: isSelected ? '0 8px 16px rgba(251, 146, 60, 0.2)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: '#FFEDD5', color: '#C2410C' }}>
                    {r.room_type}
                  </span>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', margin: '8px 0 4px', color: '#374151' }}>{r.name}</div>
                  <div style={{ fontSize: '1.2rem', color: '#EA580C', fontWeight: 800 }}>
                    ฿{Number(r.price_per_night).toLocaleString()} <span style={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 400 }}>/ คืน</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ฟอร์มการจอง + บริการเสริม */}
        <section style={{ backgroundColor: '#fff', borderRadius: 20, padding: '2rem', border: '1px solid #E5E7EB', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', marginTop: 0, marginBottom: '1.25rem', color: '#1F2937', fontWeight: 700 }}>
            📝 รายละเอียดการฝากเลี้ยง
          </h2>

          <form onSubmit={onSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: 4, fontSize: '0.9rem' }}>🐾 ชื่อน้องแมว</label>
                <input
                  type="text"
                  value={form.cat_name}
                  onChange={e => setForm(f => ({ ...f, cat_name: e.target.value }))}
                  placeholder="เช่น ส้มส้ม"
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 12, border: '1px solid #D1D5DB', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: 4, fontSize: '0.9rem' }}>👤 ชื่อเจ้าของ</label>
                <input
                  type="text"
                  value={form.owner_name}
                  onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
                  placeholder="เช่น สมชาย ใจดี"
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 12, border: '1px solid #D1D5DB', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: 4, fontSize: '0.9rem' }}>📞 เบอร์โทรฉุกเฉิน</label>
                <input
                  type="tel"
                  value={form.owner_phone}
                  onChange={e => setForm(f => ({ ...f, owner_phone: e.target.value }))}
                  placeholder="เช่น 081-234-5678"
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 12, border: '1px solid #D1D5DB', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: 4, fontSize: '0.9rem' }}>📅 วันเวลาเช็คอิน</label>
                <input
                  type="datetime-local"
                  value={form.check_in_date}
                  onChange={e => setForm(f => ({ ...f, check_in_date: e.target.value }))}
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 12, border: '1px solid #D1D5DB', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: 4, fontSize: '0.9rem' }}>📅 วันเวลาเช็คเอาท์</label>
                <input
                  type="datetime-local"
                  value={form.check_out_date}
                  onChange={e => setForm(f => ({ ...f, check_out_date: e.target.value }))}
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 12, border: '1px solid #D1D5DB', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* ฟีเจอร์ 1: Checkbox บริการเสริม */}
            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 8, fontSize: '0.95rem', color: '#C2410C' }}>
                ✨ บริการดูแลพิเศษเพิ่มเติม (Add-on Services)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {ADDON_SERVICES.map(addon => {
                  const isChecked = selectedAddons.includes(addon.id);
                  return (
                    <label
                      key={addon.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '0.65rem 0.85rem',
                        borderRadius: 12,
                        border: isChecked ? '1.5px solid #FB923C' : '1px solid #E5E7EB',
                        backgroundColor: isChecked ? '#FFF7ED' : '#FAFAFA',
                        cursor: 'pointer',
                        fontSize: '0.88rem'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAddon(addon.id)}
                      />
                      <span>{addon.name}</span>
                      <strong style={{ marginLeft: 'auto', color: '#EA580C' }}>+฿{addon.price}</strong>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 4, fontSize: '0.9rem' }}>หมายเหตุ / พฤติกรรมแมว</label>
              <textarea
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                rows={2}
                placeholder="เช่น ขี้ตกใจ ไม่ชอบให้อุ้ม ทานอาหารเปียกวันละซอง"
                style={{ width: '100%', padding: '0.75rem', borderRadius: 12, border: '1px solid #D1D5DB', boxSizing: 'border-box' }}
              />
            </div>

            {/* กล่องสรุปค่าใช้จ่าย */}
            {priceCalculation && (
              <div style={{
                background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                padding: '1.25rem',
                borderRadius: 16,
                color: '#92400E',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>สรุปยอดคำนวณ: {priceCalculation.days} คืน</div>
                  <div style={{ fontSize: '0.85rem' }}>ค่าห้อง: ฿{priceCalculation.roomTotal.toLocaleString()} | บริการเสริม: ฿{priceCalculation.addonTotal.toLocaleString()}</div>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#B45309' }}>
                  ฿{priceCalculation.grandTotal.toLocaleString()}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !rooms.length}
              style={{
                backgroundColor: '#FB923C',
                color: '#fff',
                border: 'none',
                padding: '1rem',
                borderRadius: 14,
                fontWeight: 800,
                fontSize: '1.05rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 18px rgba(251, 146, 60, 0.3)'
              }}
            >
              {submitting ? 'กำลังบันทึก…' : '🐾 จองห้องพักและออกใบเสร็จ'}
            </button>
          </form>
        </section>

        {/* ฟีเจอร์ 4: ตัวกรองและค้นหา */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.3rem', margin: 0, color: '#1F2937', fontWeight: 700 }}>
              📋 รายการฝากเลี้ยง ({filteredBookings.length})
            </h2>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="🔍 ค้นชื่อแมว / เจ้าของ / เบอร์..."
                style={{ padding: '0.5rem 0.8rem', borderRadius: 10, border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              />
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: 10, border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
              >
                <option value="ALL">ห้องพักทุกประเภท</option>
                <option value="STANDARD">Standard</option>
                <option value="DELUXE">Deluxe</option>
                <option value="VIP">VIP</option>
              </select>
            </div>
          </div>

          {/* ตารางรายการ */}
          <div style={{ backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 700 }}>
                <thead>
                  <tr style={{ backgroundColor: '#FFF7ED', borderBottom: '1px solid #FED7AA' }}>
                    <th style={{ padding: '0.85rem 1rem', color: '#9A3412', fontWeight: 700, whiteSpace: 'nowrap' }}>สถานะ</th>
                    <th style={{ padding: '0.85rem 1rem', color: '#9A3412', fontWeight: 700 }}>น้องแมว</th>
                    <th style={{ padding: '0.85rem 1rem', color: '#9A3412', fontWeight: 700 }}>ห้องพัก</th>
                    <th style={{ padding: '0.85rem 1rem', color: '#9A3412', fontWeight: 700 }}>ช่วงเวลาฝาก</th>
                    <th style={{ padding: '0.85rem 1rem', color: '#9A3412', fontWeight: 700 }}>เจ้าของ</th>
                    <th style={{ padding: '0.85rem 1rem', color: '#9A3412', fontWeight: 700 }}>บริการ & ข้อควรระวัง</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'center', color: '#9A3412', fontWeight: 700 }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map(b => {
                    const status = getBookingStatus(b.check_in_date, b.check_out_date);
                    return (
                      <tr key={b.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: 8,
                            background: status.bg,
                            color: status.color
                          }}>
                            {status.text}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>🐱 {b.cat_name}</td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div>{b.room_name}</div>
                          <small style={{ color: '#9CA3AF' }}>{b.room_type}</small>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                          <div style={{ color: '#059669' }}>เข้า: {new Date(b.check_in_date).toLocaleDateString('th-TH')}</div>
                          <div style={{ color: '#DC2626' }}>ออก: {new Date(b.check_out_date).toLocaleDateString('th-TH')}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div>{b.owner_name}</div>
                          <small style={{ color: '#6B7280' }}>{b.owner_phone}</small>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: '#4B5563', maxWidth: 200 }}>
                          {b.note || '-'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <button
                            onClick={() => onCancel(b.id)}
                            disabled={cancellingId === b.id}
                            style={{
                              backgroundColor: '#FEE2E2',
                              color: '#DC2626',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: 8,
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontSize: '0.75rem'
                            }}
                          >
                            {cancellingId === b.id ? '...' : 'ยกเลิก'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ฟีเจอร์ 5: โมดอลป๊อปอัปใบเสร็จจำลอง (Booking Slip Modal) */}
        {receiptData && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 9999
          }}>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: 24,
              padding: '2rem',
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '3rem' }}>🎉🐾</span>
              <h3 style={{ margin: '0.5rem 0', color: '#9A3412', fontSize: '1.4rem' }}>การจองสำเร็จเรียบร้อย!</h3>
              <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>ใบรับฝากน้องเหมียว #{receiptData.id}</p>

              <div style={{ backgroundColor: '#FFF7ED', padding: '1rem', borderRadius: 14, textAlign: 'left', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                <div><strong>เจ้านาย:</strong> {receiptData.cat_name}</div>
                <div><strong>ห้องพัก:</strong> {receiptData.calculation.roomName}</div>
                <div><strong>ระยะเวลา:</strong> {receiptData.calculation.days} คืน</div>
                {receiptData.addons && <div><strong>บริการเสริม:</strong> {receiptData.addons}</div>}
                <hr style={{ border: 'none', borderTop: '1px dashed #FED7AA', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', color: '#EA580C' }}>
                  <span>ยอดชำระสุทธิ:</span>
                  <span>฿{receiptData.calculation.grandTotal.toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => window.print()}
                  style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
                >
                  🖨️ พิมพ์ใบรับฝาก
                </button>
                <button
                  onClick={() => setReceiptData(null)}
                  style={{ flex: 1, padding: '0.65rem', borderRadius: 10, border: 'none', background: '#FB923C', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ป๊อปอัปแจ้งเตือนเมื่อห้องไม่ว่าง หรือเกิดข้อผิดพลาด */}
        {error && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 99999
          }}>
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              padding: '2rem 1.75rem',
              maxWidth: 400,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(220, 38, 38, 0.15)',
              border: '2px solid #FEE2E2',
              animation: 'popIn 0.25s ease-out'
            }}>
              {/* ไอคอนหน้าน้องแมวร้องไห้ / ตกใจ */}
              <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>😿💔</div>
              
              <h3 style={{ margin: '0 0 0.5rem', color: '#991B1B', fontSize: '1.35rem', fontWeight: 800 }}>
                ขออภัย ห้องพักไม่ว่าง!
              </h3>
              
              <div style={{
                backgroundColor: '#FEF2F2',
                color: '#991B1B',
                padding: '1rem',
                borderRadius: 16,
                fontSize: '0.95rem',
                fontWeight: 600,
                lineHeight: 1.5,
                margin: '1rem 0 1.5rem',
                border: '1px dashed #F87171'
              }}>
                {error}
              </div>

              <button
                onClick={() => setError(null)}
                style={{
                  width: '100%',
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '0.85rem',
                  borderRadius: 14,
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 6px 14px rgba(239, 68, 68, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#DC2626'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = '#EF4444'}
              >
                เข้าใจแล้ว (เลือกวันหรือห้องอื่น) 🐾
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}