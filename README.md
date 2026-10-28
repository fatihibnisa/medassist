# MedAssist — onlayn tibbiy konsultatsiya platformasi

Bemor tana xaritasida og‘riq joyini belgilaydi. Tizim xavf darajasini qat’iy qoidalar bilan aniqlaydi. Litsenziyali shifokor AI qoralamasini tekshirib tashxis qo‘yadi. Retsept PDF va QR kod bilan beriladi, dorixona uni sayt orqali tekshiradi.

## Nimalar bor

| Qism | Tarkibi |
|---|---|
| **Frontend** | PWA, telefonga o‘rnatiladi. Landing sahifa, bemor, shifokor va admin kabinetlari. Kunduzgi va tungi rejim. |
| **Backend** | Node.js 22, tashqi kutubxonalarsiz. REST API `/api/v1`. |
| **Baza** | SQLite (WAL rejimi). 17 jadval, migratsiyalar, indekslar va foreign key'lar bilan. |
| **Xavfsizlik** | scrypt parol xeshi, JWT (15 daq) va aylanuvchi refresh-token (HttpOnly cookie). |
| | 5 marta xato kiritilsa, akkaunt 15 daqiqaga bloklanadi. Rate limit, CSP va xavfsizlik headerlari bor. |
| | IDOR himoyasi, fayl turini magic-byte orqali tekshirish, audit jurnali. |
| **SMS** | Eskiz.uz (OTP kod, javob tayyorligi haqida xabar). |
| **AI** | Anthropic Claude (ixtiyoriy). Kalit bo‘lmasa, tibbiy qoidalar asosidagi qoralama ishlaydi. |
| **Hujjatlar** | Server tomonda PDF retsept va QR kod (`vendor/` ichida: pdf-lib va QRCode, ikkalasi ham MIT). |

### 2-versiyada qo‘shilganlar

- **Bemor:** sog‘lom tana animatsiyasi bilan bosh ekran; og‘riq joyi bo‘yicha mutaxassis tavsiyasi; reyting bo‘yicha shifokor tanlash; shifokor sahifasi (manzil, Yandex/Google yo‘nalish, narxlar, ish vaqti); klinikaga navbatga yozilish; shifokorni baholash.
- **Dori trekeri:** dorixona QR kodni skanerlab "dori berildi" deb belgilagach, dori ichish jadvali avtomatik tuziladi. Vaqti kelganda ovoz, tebranish va bildirishnoma bilan eslatadi (ilova ochiq yoki o‘rnatilgan bo‘lishi kerak).
- **Yaqin atrofda:** joylashuv bo‘yicha dorixona, shifoxona va poliklinikalarni ko‘rsatadi.
- **Shifokor:** bosh sahifa (xavotirli bemorlar, ish dinamikasi), onlayn/klinikada/mavjud emas holati, jonli qabul navbati, ish jadvali, statistika va hisobot (CSV, chop etish), rasm, klinika, manzil va narxlar bilan tahrirlanadigan profil. Litsenziya yoki mutaxassislik o‘zgarsa, profil qayta tekshiruvga ketadi.
- **Admin:** grafiklar, anomaliyalarni avtomatik aniqlash, bemorlar qoniqishi, baholar, shikoyat va murojaatlarga javob berish, yangi dori qo‘shish va tahrirlash, davr bo‘yicha hisobot, admin profili.
- **Umumiy:** texnik yordam va shikoyatlar (adminga boradi), bildirishnomalar sahifasi, retseptni kamera yoki rasm orqali skanerlash (jsQR, Apache-2.0, `public/vendor/`), parolni ko‘rsatish/yashirish tugmasi, o‘zbek, rus va ingliz tillari.

Kamera va joylashuvni aniqlash faqat HTTPS orqali (yoki `localhost` da) ishlaydi. HTTP orqali QR kodni rasm sifatida yuklash mumkin.

**Asosiy tibbiy qoidalar** `public/shared/clinical.js` faylida. Bu kod server va brauzerda bir xil ishlaydi:

- Qizil holatda AI o‘chadi va bemorga 103 ga qo‘ng‘iroq qilish tavsiya etiladi.
- Sariq holatda AI dori tavsiya qilmaydi.
- Allergiya, yosh, homiladorlik va sutkalik doza har bir retseptda tekshiriladi. Xavfli dori serverda bloklanadi.
- Bemor AI qoralamasini hech qachon ko‘rmaydi. Administrator tibbiy yozuvlarni ko‘ra olmaydi.

## Tez ishga tushirish (lokal)

Node.js **22.5 yoki undan yangi** versiya kerak. `npm install` qilish shart emas.

```bash
cp .env.example .env
# .env faylida NODE_ENV=development, SMS_PROVIDER=console, DEMO_SEED=true qiling
npm start
# → http://localhost:3000
```

Demo akkauntlarning paroli `Demo12345`:

| Rol | Telefon |
|---|---|
| Shifokor (Terapevt) | 90 000 00 01 |
| Shifokor (Nevrolog) | 90 000 00 02 |
| Shifokor (tasdiqlanmagan) | 90 000 00 03 |
| Kardiolog, LOR, Gastroenterolog, Dermatolog, Pediatr | 90 000 00 04 … 90 000 00 08 |
| Bemor | 90 000 00 10 |
| Admin | 90 000 00 99 |

Development rejimida SMS kod ekranda ko‘rsatiladi.

**Testlar:** `npm test` buyrug‘i 21 ta end-to-end API testni ishga tushiradi. Ular haqiqiy server va vaqtinchalik bazada ishlaydi.

## Domenga joylash (Ubuntu server, VPS)

### 1-variant: Docker (eng oson)

```bash
git clone <repo> /opt/medassist && cd /opt/medassist   # yoki zip faylni yuklab oching
cp .env.example .env && nano .env    # JWT_SECRET, PUBLIC_URL, ADMIN_*, ESKIZ_* ni to‘ldiring
docker compose up -d --build
```

### 2-variant: systemd

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs sqlite3
sudo useradd -r -s /usr/sbin/nologin medassist
sudo cp -r . /opt/medassist && sudo mkdir -p /opt/medassist/data && sudo chown -R medassist /opt/medassist/data
sudo cp deploy/medassist.service /etc/systemd/system/ && sudo systemctl enable --now medassist
```

### Nginx va HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/medassist   # domen nomini almashtiring
sudo ln -s /etc/nginx/sites-available/medassist /etc/nginx/sites-enabled/
sudo certbot --nginx -d medassist.uz -d www.medassist.uz
sudo nginx -t && sudo systemctl reload nginx
```

Domen DNS'ida `A` yozuvi server IP manziliga yo‘naltirilgan bo‘lishi kerak.

### Domensiz (faqat IP orqali) sinab ko‘rish

HTTPS bo‘lmaydi, shuning uchun bu usul faqat sinov uchun. Haqiqiy bemorlar ma’lumotini kiritmang.

```bash
# .env: PUBLIC_URL=http://SERVER_IP  (oxirida / yo‘q, http — https emas)
sudo apt install -y nginx
sudo cp deploy/nginx-ip.conf /etc/nginx/sites-available/medassist
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/medassist /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow 80/tcp   # agar ufw yoqilgan bo‘lsa
# → http://SERVER_IP
```

PWA (telefonga o‘rnatish) HTTP'da ishlamaydi. Qolgan funksiyalar ishlaydi. Domen olganingizda `PUBLIC_URL` ni `https://...` ga o‘zgartiring va yuqoridagi `nginx.conf` + certbot qadamlarini bajaring.

### Production uchun majburiy sozlamalar

- `JWT_SECRET` qiymatini `openssl rand -hex 48` buyrug‘i bilan yarating. Bu qiymat bo‘lmasa, server ishga tushmaydi.
- `PUBLIC_URL=https://sizning-domen.uz` qilib qo‘ying. QR kod va SMS havolalari shu manzilga olib boradi.
- `DEMO_SEED=false` bo‘lsin.
- `ADMIN_PHONE` va `ADMIN_PASSWORD` ni kuchli parol bilan to‘ldiring.
- `SMS_PROVIDER=eskiz` qilib qo‘ying. Eskiz kabinetida SMS shablonlari tasdiqlangan bo‘lishi kerak: tasdiqlash kodi, javob tayyorligi va litsenziya tasdiqlanishi haqidagi xabarlar uchun.
- AI kerak bo‘lsa, `ANTHROPIC_API_KEY` ni bering. Model nomini `AI_MODEL` orqali o‘zgartirish mumkin. Batafsil: https://docs.claude.com/en/api/overview
- Kunlik zaxira nusxasi uchun cron'ga qo‘shing: `0 3 * * * /opt/medassist/scripts/backup.sh`

## API (qisqacha)

| Metod | Yo‘l | Kim |
|---|---|---|
| POST | `/auth/otp`, `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/reset` | hamma |
| GET/PUT | `/me`, `/me/profile`, `/me/password`; POST `/me/license` | foydalanuvchi |
| POST | `/consultations`, `/consultations/:id/attachments`, `/consultations/:id/close` | bemor |
| GET | `/consultations/my`, `/consultations/:id` | bemor / shifokor |
| GET/POST | `/consultations/:id/messages` | bemor / shifokor |
| GET | `/doctor/queue?filter=mine\|all\|done` | shifokor |
| POST | `/consultations/:id/assign`, `/ai`, `/ai/reject`, `/diagnosis` | shifokor |
| POST | `/prescriptions/:id/cancel` · GET `/prescriptions/:id/pdf` | shifokor / bemor |
| GET | `/public/verify/:code`, `/catalog`, `/health` | ochiq |
| GET/PATCH | `/admin/stats`, `/admin/doctors`, `/admin/users`, `/admin/medicines`, `/admin/audit` | admin |

Xatolar shu formatda qaytadi: `{ timestamp, status, message, errors }`.

## Muhim eslatma

`src/` va `public/shared/clinical.js` ichidagi dorilar ro‘yxati va dozalari **namunaviy**. Ishga tushirishdan oldin ularni rasmiy yo‘riqnomalar bilan tekshirib chiqing.

Tibbiy ma’lumotlar bilan ishlash qonunga bo‘ysunadi. O‘zbekistonning "Shaxsga doir ma’lumotlar to‘g‘risida"gi qonuniga ko‘ra:

- ma’lumotlarni lokalizatsiya qilish (O‘zbekistondagi serverda saqlash) majburiy;
- ma’lumotlar bazasini ro‘yxatdan o‘tkazish kerak;
- bemordan rozilik olinishi shart.

Ishga tushirishdan oldin yurist bilan maslahatlashing.
