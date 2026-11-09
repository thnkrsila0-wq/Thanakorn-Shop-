# Thanakornshop — online starter

เว็บร้านค้าธีมดำ-ม่วง พร้อม:
- สมัครสมาชิก / เข้าสู่ระบบ (เก็บรหัสผ่านแบบ hash ด้วย bcrypt)
- ฐานข้อมูล SQLite ฝั่งเซิร์ฟเวอร์
- หน้าร้านและสต็อกสินค้า
- ซื้อสินค้าแล้วส่งข้อความส่งมอบไปยังกล่องจดหมายในเว็บไซต์
- กระเป๋าเงินและประวัติรายการ
- หน้า Admin: เพิ่มเครดิตลูกค้า, เพิ่มสินค้า, เติมสต็อก, ดูคำสั่งซื้อ

## ทดลองบนคอมพิวเตอร์
ต้องติดตั้ง Node.js 20 ขึ้นไป

1. แตกไฟล์ ZIP
2. เปิด Terminal ในโฟลเดอร์นี้ แล้วรัน `npm install`
3. คัดลอก `.env.example` เป็น `.env`
4. เปลี่ยน `SESSION_SECRET` เป็นค่าสุ่มยาว ๆ และตั้ง `ADMIN_PASSWORD` เป็นรหัสผ่านที่ไม่ซ้ำกับที่อื่น
5. รัน `npm start`
6. เปิด `http://localhost:3000`

บัญชีแอดมินสร้างจาก `ADMIN_USERNAME` และ `ADMIN_PASSWORD` ใน `.env` เมื่อเซิร์ฟเวอร์เริ่มทำงานครั้งแรก

## นำขึ้นออนไลน์
อัปโหลดโฟลเดอร์นี้ไปยังผู้ให้บริการ Node.js hosting ที่รองรับ Node 20+ และ persistent disk/volume
- Build/install command: `npm install`
- Start command: `npm start`
- ตั้ง Environment Variables จาก `.env.example` ในหน้า Hosting
- ตั้ง `NODE_ENV=production`, ใช้ HTTPS และ `SESSION_SECRET` ที่สุ่มใหม่
- เก็บไฟล์ `thanakornshop.db` บน persistent disk และตั้งระบบ backup

อย่าใช้บริการ static hosting อย่างเดียว เพราะโปรเจกต์นี้ต้องรัน Node.js server และเก็บฐานข้อมูลถาวร

## ข้อจำกัดสำคัญก่อนเปิดรับเงินจริง
- ระบบเติมเงินในชุดนี้เป็นเครดิตที่ Admin เพิ่มให้เท่านั้น ยังไม่มี payment gateway, QR payment หรือ webhook
- อย่าใช้ข้อมูลบัตร/บัญชีธนาคารในฟอร์มธรรมดา ต้องเชื่อมผู้ให้บริการชำระเงินที่ได้รับอนุญาตและตรวจสอบ webhook ฝั่งเซิร์ฟเวอร์
- Session store เริ่มต้นเป็น MemoryStore เหมาะกับเดโม/เริ่มต้นเท่านั้น ควรเปลี่ยนเป็น persistent session store ก่อนใช้งานจริงที่มีผู้ใช้จำนวนมาก
- ควรเพิ่ม CSRF protection, rate limiting, audit log, email/password reset, database backup และนโยบายความเป็นส่วนตัวก่อนเปิดสาธารณะ
- ใส่เฉพาะข้อมูลสินค้าที่คุณมีสิทธิ์จำหน่าย และหลีกเลี่ยงการเก็บรหัสผ่านบัญชีส่วนตัวของลูกค้า/บุคคลอื่นแบบข้อความธรรมดา
