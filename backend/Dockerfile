# Python 3.10 tabanlı hafif bir imaj kullanıyoruz
FROM python:3.10-slim

# Görüntü işleme (OpenCV) için gerekli sistem kütüphaneleri
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces güvenlik gereksinimi: Standart kullanıcı (UID 1000)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Sadece requirements.txt kopyalanıp bağımlılıklar yükleniyor
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Geri kalan tüm proje dosyaları (app.py, templates, models vb.) kopyalanıyor
COPY --chown=user . .

# Flask'ın çalışacağı varsayılan port
EXPOSE 7860

# Uygulamayı başlat
CMD ["python", "app.py"]