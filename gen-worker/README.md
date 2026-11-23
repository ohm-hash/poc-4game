# poc-4game-gen (Cloudflare Worker + OpenRouter)

ตัวกลางที่เก็บ OpenRouter API Key ไว้บน Cloudflare หน้าเกมบน GitHub Pages เรียกผ่าน worker นี้ จึงไม่มีใครเห็น Key ใช้รูปแบบเดียวกับ `rutan-go-gen` ของงาน AI Corner แต่แยก worker, KV และโควตากันคนละตัว

- URL: https://poc-4game-gen.rutango-demo.workers.dev
- `POST /gen` สร้างรูปจาก OpenRouter ตามสไตล์ `halloween, santa, hero, space, vampire, chibi, fortune`
- `POST /upload` อัปโหลดภาพที่ระลึกหรือวิดีโอ ไม่เกิน 20 MB เพื่อทำ QR ดาวน์โหลดจริง
- `POST /fortune` ให้ AI แต่งคำทำนาย (topic: love/work/money/luck) จากรูปและวันเกิด แล้ววาดภาพจากฉากที่ AI เขียนให้ตรงกับคำทำนาย (นับโควตารูปด้วย) (โมเดลตั้งที่ `TEXT_MODEL` ตอนนี้ใช้ `anthropic/claude-opus-5.5`) จำกัดวันละ 300 ครั้งที่ `FORTUNE_LIMIT`
- `GET /f/:id` ใช้ดาวน์โหลดไฟล์ ไฟล์เก็บไว้ 24 ชั่วโมงแล้วลบเอง
- จำกัดการสร้างรูป AI วันละ 150 รูป และอัปโหลดวันละ 400 ไฟล์ แก้ได้ใน `wrangler.toml`
- รับคำขอเฉพาะจาก `https://ohm-hash.github.io` และ `http://localhost:8080`
- เปลี่ยนโมเดลได้ที่ `MODEL` ใน `wrangler.toml` แล้วรัน `npx wrangler deploy`

## ใส่ / เปลี่ยน Key (ทำครั้งเดียว)

```bash
cd gen-worker && npx wrangler secret put OPENROUTER_API_KEY
```

ระบบจะให้วาง Key ใน Terminal ตัว Key จะไม่ถูกเก็บในไฟล์ใดๆ แนะนำให้สร้าง Key แยกจากงาน AI Corner และตั้ง Credit limit ไว้ที่ https://openrouter.ai/settings/keys

ตรวจว่าใช้ได้: เปิด URL ของ worker แล้วต้องเห็น `"ai":true`

## Memory Match ใช้กี่รูป

ผู้เล่น 1 คนจะสร้างรูป AI 5 รูปพร้อมกัน (เปลี่ยนได้ที่ `AI_IMAGES` ใน `web/assets/memory.js`) 1 รูปต่อ 1 คู่ ได้การ์ด 5 คู่ (10 ใบ) ส่วนเกมอื่นใช้ 1 รูปต่อผู้เล่น

กด "เล่นอีกครั้ง" จะใช้รูปเดิม ไม่เสียเครดิตเพิ่ม ถ้าจะสร้างรูปใหม่ให้กด Home ไปหน้าเลือกเกม ส่วนรูปตัวอย่างจะสร้างแค่ครั้งแรกครั้งเดียว แล้วเก็บไว้ในเบราว์เซอร์ (IndexedDB)

## ปิดใช้

ตั้ง `GEN_API = ''` ใน `web/assets/config.js` เกมจะกลับไปใช้ภาพจำลองแบบ offline หรือลบ worker ด้วย `npx wrangler delete`
