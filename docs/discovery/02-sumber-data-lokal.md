# Sumber Data Lokal — Indramayu (Riset Awal)

> **Konteks:** data lokal = *moat* utama AgriMind. Model AI (Claude/GPT/Gemini) bisa
> ditiru siapa saja; yang tidak bisa ditiru adalah **akses data lokal + real-time +
> spesifik wilayah**, dan **data jaringan** yang dikumpulkan dari kelompok tani.
>
> **Status:** sebagian sudah **diverifikasi via web (15 Jun 2026)** — lihat checklist
> di bawah. Sisanya masih kandidat yang perlu dicek manual.
>
> **Wilayah/komoditas fokus:** Indramayu — padi (dominan), mangga, pisang, jeruk, dll.

---

## Dua lapis sumber data (strateginya beda)

1. **Data publik** (cuaca, harga nasional, kalender tanam) — mudah, gratis, **tapi
   tidak eksklusif**. Berguna sebagai fondasi untuk value awal, bukan moat.
2. **Data jaringan** (dari penggunaan kelompok tani) — sulit dikumpulkan, **tapi
   eksklusif & makin bernilai seiring waktu**. Ini moat sebenarnya.

> **Strategi:** mulai dari data publik (cepat & gratis), lalu pelan-pelan bangun data
> jaringan lewat penggunaan. Tiap petani yang lapor harga / foto hama = memperkaya data
> yang tak dimiliki orang lain.

---

## 🌧️ 1. Cuaca & iklim — paling mudah, gratis (low-hanging fruit)

| Sumber | Isi | Akses | Catatan |
|--------|-----|-------|---------|
| **BMKG** ✅ | Prakiraan cuaca **per-desa/kelurahan** (3 hari) + peringatan dini | API publik gratis, **60 req/menit/IP** | `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={kode}` — pakai kode wilayah `adm4` (Permendagri 100.1.1-6117/2022). Mencakup seluruh Indonesia termasuk Indramayu. **Wajib cantumkan "BMKG" sebagai sumber.** |
| **Open-Meteo** ✅ | Cuaca forecast (≤16 hari, hourly/daily) + historis, per-koordinat | REST API, **tanpa API key** untuk non-komersial | `GET /v1/forecast?latitude=..&longitude=..` — global, jadi Indramayu pasti tercakup. **Komersial butuh API key berbayar.** |
| **NASA POWER** | Data agroklimat historis (radiasi, suhu, hujan) | Gratis | Cocok untuk model/rekomendasi tanam. *(belum diverifikasi detail)* |

➡️ **Terverifikasi & bisa dipakai hampir hari ini juga, gratis.** Kandidat integrasi
pertama. Untuk BMKG perlu petakan dulu **kode `adm4` desa-desa di Indramayu**; Open-Meteo
cukup lat/long lahan.

## 💰 2. Harga komoditas — sedang

| Sumber | Isi | Catatan |
|--------|-----|---------|
| **Panel Harga Pangan — Bapanas** ✅ | Harga produsen & konsumen, harian, **sampai level kab/kota (514 kab/kota, ~960 enumerator)** | `panelharga.badanpangan.go.id` punya API (dipakai instansi lain via SPLP Komdigi). **Cek apakah API publik/perlu izin & apakah Indramayu termasuk titik survei.** Situs FAQ sempat "dalam pemeliharaan" saat dicek. |
| **PIHPS / Bank Indonesia** (bi.go.id/hargapangan, hargapangan.id) | Harga pangan harian per-provinsi/kota | Sumber alternatif/komplementer ke Bapanas. *(belum diverifikasi detail API)* |
| **Dinas Perdagangan / pasar lokal Indramayu** | Harga riil pasar setempat | Kemungkinan manual / lewat jaringan |
| **Bappebti** | Harga komoditas berjangka | Untuk komoditas ekspor |

➡️ **Catatan penting:** harga *nasional/provinsi* mudah didapat, tapi harga *di
tengkulak Indramayu* (yang paling relevan buat petani) seringnya **tidak ada di data
resmi**. Ini justru kandidat **data jaringan** (lihat §5).

## 🐛 3. Hama, penyakit & info teknis budidaya — sedang–sulit

| Sumber | Isi |
|--------|-----|
| **KATAM Terpadu (Kementan/BRMP)** ⚠️ | Pola tanam, **waktu tanam, rekomendasi varietas & teknologi adaptif per-kecamatan**, seluruh Indonesia; diperbarui tiap ~2 bulan/musim. Kolaborasi dgn BMKG/BPS/BIG. |
| **Kementan / Pusat Penyuluhan** (cybex.pertanian.go.id) | Materi penyuluhan, SOP budidaya, artikel |
| **BSIP / Balai Penelitian** (Balitsa, BB Padi, dll) | Varietas, kalender tanam, pengendalian OPT |
| **SIPERDITAN / laporan OPT dinas** | Data serangan hama per-wilayah |

➡️ **KATAM Terpadu** terkonfirmasi punya data **per-kecamatan** (persis konteks lokal) —
kandidat bahan **RAG** yang kuat. ⚠️ **Tapi:** aksesnya tampak lewat web/PDF/peta
interaktif (Cetak Info-BPP, Cetak Dokumen PDF), **belum jelas ada API terbuka** — mungkin
perlu scrape / unduh manual per musim. Perlu dicek langsung.

## 📚 4. Pengetahuan budidaya — fondasi sudah ada

Knowledge base `.id.md` di repo (`knowledge/`) sudah jadi awal. Bisa diperkaya:
- Publikasi BSIP / Litbang Pertanian (banyak PDF teknis gratis)
- Materi penyuluh setempat
- **Pengetahuan saudara & petani senior** — emas, tidak ada di internet

## 🌟 5. Data yang dikumpulkan sendiri — paling sulit, paling bernilai (MOAT)

Yang membedakan AgriMind dari semua orang:
- Harga jual riil di Indramayu (dari laporan anggota kelompok)
- Foto hama/penyakit lokal + diagnosa → membangun **dataset visual lokal**
- Catatan tanam–panen anggota (kapan tanam, varietas, hasil)
- Praktik yang terbukti berhasil di kondisi tanah/iklim Indramayu

➡️ Data resmi bisa diakses siapa saja. **Data dari jaringan kelompok tani saudara tidak
bisa ditiru kompetitor** — dan makin lama makin bernilai.

---

## Prinsip yang perlu diingat

- Jangan integrasi data sebelum tahu **masalahnya** (lihat
  [01-wawancara-kelompok-tani.md](01-wawancara-kelompok-tani.md)). Percuma integrasi
  harga kalau ternyata masalah utama soal hama.
- Mulai dari **1 sumber data publik** yang paling relevan dengan masalah yang ditemukan
  — buktikan value-nya, baru tambah.
- Setiap fitur yang melibatkan input petani (lapor harga, foto hama) sekaligus
  **menumbuhkan data jaringan** (§5). Desain fitur agar tiap pemakaian memperkaya moat.

---

## Checklist verifikasi (per 15 Jun 2026)

| Sumber | Diverifikasi? | Punya data Indramayu? | Akses | Catatan |
|--------|---------------|------------------------|-------|---------|
| **BMKG** | ✅ web | ✅ (seluruh desa via `adm4`) | API publik gratis, 60 req/mnt/IP | Wajib atribusi "BMKG"; perlu petakan kode `adm4` Indramayu |
| **Open-Meteo** | ✅ web | ✅ (global, by lat/long) | REST, no key (non-komersial) | Komersial = berbayar; perhatikan lisensi saat monetisasi |
| **Panel Harga Pangan (Bapanas)** | ⚠️ sebagian | ✅ sampai kab/kota | API ada (via SPLP) — status publik belum pasti | Konfirmasi izin akses & apakah Indramayu titik survei |
| **KATAM Terpadu** | ⚠️ sebagian | ✅ per-kecamatan | Web/PDF/peta; **API terbuka belum jelas** | Mungkin scrape/unduh manual per musim |
| NASA POWER | ⬜ | ? (global, harusnya ya) | ? | belum dicek detail |
| PIHPS / BI hargapangan | ⬜ | ? | ? | alternatif Bapanas |
| cybex / Pusluh | ⬜ | ? | ? | konten RAG |
| BSIP / Balai Penelitian | ⬜ | ? | ? | konten RAG |
| SIPERDITAN / laporan OPT | ⬜ | ? | ? | data hama per-wilayah |

**Legenda:** ✅ terkonfirmasi · ⚠️ sebagian/ada catatan · ⬜ belum dicek

### Ringkasan temuan
- **Cuaca = aman & gratis.** BMKG (per-desa, perlu kode `adm4`) + Open-Meteo (per-koordinat,
  no key) keduanya siap pakai. Ini integrasi data lokal **paling cepat** kalau nanti
  dibutuhkan.
- **Harga = ada tapi perlu konfirmasi akses.** Bapanas punya data sampai kab/kota, tapi
  status API publik belum pasti. Harga *tengkulak lokal* tetap tak ada di data resmi →
  kandidat data jaringan (§5).
- **Kalender tanam (KATAM) = data bagus, akses ribet.** Per-kecamatan, tapi kemungkinan
  tidak ada API → unduh/scrape manual. Cocok jadi bahan RAG yang di-refresh berkala.
