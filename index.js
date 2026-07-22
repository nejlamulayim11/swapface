import "dotenv/config";
import express from "express";
import multer from "multer";
import Replicate from "replicate";
import fs from "fs";

const app = express();
const PORT = 3000;

// --- DOSYA DOĞRULAMA (VALIDATION) AYARLARI ---
const upload = multer({ 
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB boyut sınırı (her bir dosya için)
  },
  fileFilter: (req, file, cb) => {
    // Kabul edilen dosya tipleri
    const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Desteklenmeyen format! Sadece JPEG, PNG ve WEBP yükleyebilirsiniz."), false);
    }
  }
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

app.get("/", (req, res) => {
  res.send("Sunucu çalışıyor!");
});

// Listeyi karıştırır, hiç kimse kendisiyle eşleşmeyecek şekilde (derangement)
function shuffleNoSelfMatch(array) {
  let shuffled;
  let isValid = false;
  while (!isValid) {
    shuffled = [...array].sort(() => Math.random() - 0.5);
    isValid = shuffled.every((val, index) => val !== array[index]);
  }
  return shuffled;
}

// Rate limit'i aşmamak için bekleme fonksiyonu
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.post("/swap-group", upload.array("photos", 10), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length < 2) {
      return res.status(400).json({ error: "En az 2 fotoğraf yüklemelisin" });
    }

    console.log(`${files.length} fotoğraf alındı, Replicate'e yükleniyor...`);

    // Tüm fotoğrafları Replicate'e yükle, URL'lerini al
    const uploadedUrls = [];
    for (const file of files) {
      const buffer = fs.readFileSync(file.path);
      const uploaded = await replicate.files.create(buffer);
      uploadedUrls.push(uploaded.urls.get);
    }

    console.log("Tüm dosyalar yüklendi. Eşleştirme yapılıyor...");

    // İndeksleri karıştır (kimin yüzü kime gidecek)
    const indices = files.map((_, i) => i);
    const shuffledIndices = shuffleNoSelfMatch(indices);

    console.log("Eşleştirme:", shuffledIndices);

    // Her kişi için swap işlemini yap
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const swapImageUrl = uploadedUrls[shuffledIndices[i]]; // hangi yüz kullanılacak
      const inputImageUrl = uploadedUrls[i]; // hangi fotoğrafın üzerine konacak

      console.log(`Swap ${i + 1}/${files.length} işleniyor...`);

      const output = await replicate.run(
        "cdingram/face-swap:d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762c71ed111",
        {
          input: {
            swap_image: swapImageUrl,
            input_image: inputImageUrl,
          },
        }
      );

      results.push({
        person: i + 1,
        faceFrom: shuffledIndices[i] + 1,
        resultUrl: typeof output === 'string' ? output : (output.url ? output.url() : output),
      });

      // Son fotoğraf değilse 10 saniye bekle
      if (i < files.length - 1) {
        console.log("Limitleri aşmamak için 10 saniye bekleniyor...");
        await sleep(10000); 
      }
    }

    console.log("Tüm swap işlemleri tamamlandı!");
    res.json({ results });

  } catch (err) {
    console.error("Hata oluştu:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // HATA OLSA DA OLMASA DA KESİN ÇALIŞACAK TEMİZLİK KISMI
    if (req.files && req.files.length > 0) {
      console.log("Geçici dosyalar temizleniyor...");
      for (const file of req.files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`Sunucu temizliği: ${file.path} başarıyla silindi.`);
          }
        } catch (cleanupErr) {
          console.error(`Dosya silinirken hata oluştu: ${file.path}`, cleanupErr);
        }
      }
    }
  }
});

// --- YENİ EKLENEN: HATA YAKALAMA MIDDLEWARE'İ ---
// Multer'dan gelen boyut veya format hatalarını yakalayıp frontend'e temiz bir JSON döner.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Dosya boyutu çok büyük! Her bir fotoğraf en fazla 5MB olabilir." });
    }
  }
  if (err) {
    // Kendi fırlattığımız format hatası buraya düşer
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});