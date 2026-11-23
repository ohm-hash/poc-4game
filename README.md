# POC 4 Game — AI Photo Games สำหรับบูธ / Kiosk

เว็บเกม 4 เกมตาม Flow ในภาพ `image.png` – `image4.png` ใช้ HTML/JS ล้วน ไม่ต้อง build

| เกม | ไฟล์ | Flow |
|---|---|---|
| Memory Match | `web/memory.html` | ถ่ายรูป → เลือก Theme → AI สร้าง 8 คู่ → จับคู่ 90 วิ → เลือกรูป + QR |
| Photohunt | `web/photohunt.html` | Home → ถ่ายรูป → AI ธีมแวมไพร์ → หาจุดต่าง 8 จุด → สรุปคะแนน/ดาว → QR |
| รับของไข่ตก! Catch & Win | `web/catch.html` | ถ่ายรูป → ตัวละคร 2D → เกมรับของ 45 วิ → คะแนน → วิดีโอที่อัดไว้ → QR/แชร์ |
| เปิดดวงแบบขำๆ กับ AI | `web/fortune.html` | เริ่ม → ถ่ายรูป → พูดวันเกิด (th-TH) → AI ประมวลผล → ดวงความรัก + QR |

## วิธีรัน

```bash
cd web && python3 -m http.server 8080
```

เปิด http://localhost:8080 (กล้องและไมค์ใช้ได้เฉพาะ `localhost` หรือ `https`)
ไม่มีกล้องก็กด "รูปตัวอย่าง" หรือ "อัปโหลด" แทนได้

## AI และ QR

- **AI สร้างภาพ**: ใช้ OpenRouter ผ่าน Cloudflare Worker ใน `gen-worker/` ซึ่งเก็บ Key ไว้ฝั่ง server (ดูรายละเอียดใน [gen-worker/README.md](gen-worker/README.md)) ถ้า AI ไม่ตอบหรือยังไม่ได้ใส่ Key เกมจะใช้ภาพจำลองจาก Canvas (`web/assets/ai.js`) แทนอัตโนมัติ
- **QR**: อัปโหลดภาพที่ระลึกหรือวิดีโอขึ้น worker แล้ว QR จะชี้ไปที่ไฟล์จริง ลิงก์ใช้ได้ 24 ชั่วโมง
- ตั้ง `GEN_API = ''` ใน `web/assets/config.js` ถ้าต้องการเล่นแบบ offline ทั้งหมด
- **ฟังเสียง**: ใช้ Web Speech API ของ Chrome ซึ่งต้องต่ออินเทอร์เน็ต ถ้าใช้ไม่ได้จะมีตัวเลือกวัน/เดือน/ปีให้เลือกเอง
- **ดวง**: สุ่มจากชุดข้อความตลก ส่วนราศีคำนวณจากวันเกิดจริง
