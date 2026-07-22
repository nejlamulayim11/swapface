import cv2
import numpy as np
import os
import sys
import random
import insightface
from insightface.app import FaceAnalysis

def swap_multiple_images(image_paths):
    """
    Birden fazla görseldeki tüm yüzleri ortak bir havuzda toplar,
    rastgele karıştırır ve her bir görseli güncelleyerek kaydeder.
    """
    for path in image_paths:
        if not os.path.exists(path):
            print(f"Hata: '{path}' bulunamadı.")
            sys.exit(1)

    print("1) InsightFace modeli yüksek çözünürlükte yükleniyor...")
    app_face = FaceAnalysis(name='buffalo_l')
    app_face.prepare(ctx_id=0, det_size=(1600, 1600))
    
    if hasattr(app_face, 'det_model'):
        app_face.det_model.det_thresh = 0.35

    face_data = []
    all_faces_pool = []

    print("2) Görseller taranıyor ve yüzler ortak havuzda toplanıyor...")
    for path in image_paths:
        img = cv2.imread(path)
        if img is None:
            print(f"UYARI: {path} okunamadı, atlanıyor.")
            continue
            
        faces = app_face.get(img)
        print(f"  -> Dosya: {path} | Bulunan yüz sayısı: {len(faces)}")
        
        if len(faces) > 0:
            for f in faces:
                all_faces_pool.append(f)
            face_data.append({'path': path, 'image': img, 'faces': faces})

    total_faces = len(all_faces_pool)
    print(f"\nToplam ortak havuzdaki yüz sayısı: {total_faces}")

    if total_faces < 2:
        print("HATA: Yüz değiştirmek için toplamda en az 2 yüz bulunmalı!")
        sys.exit(1)

    # 3) Ortak Havuz İçin Rastgele Permütasyon (Hiç kimse kendine denk gelmez)
    indices = list(range(total_faces))
    shuffled_indices = indices.copy()
    while any(i == j for i, j in zip(indices, shuffled_indices)):
        random.shuffle(shuffled_indices)

    print(f"3) {total_faces} yüz ortak havuzdan rastgele karıştırılıyor...")

    os.makedirs("outputs", exist_ok=True)
    pool_counter = 0

    # 4) Yüzleri ilgili görsellere geri işleme
    for idx, data in enumerate(face_data):
        swapped_img = data['image'].copy()
        for target_face in data['faces']:
            source_idx = shuffled_indices[pool_counter]
            source_face = all_faces_pool[source_idx]
            
            swapped_img = swapper_get(swapped_img, target_face, source_face)
            pool_counter += 1
            
        base_name = os.path.basename(data['path'])
        output_path = f"outputs/swapped_{base_name}"
        cv2.imwrite(output_path, swapped_img)
        print(f"  -> Kaydedildi: {output_path}")

    print("\nTAMAMLANDI! Tüm karışık fotoğraflar işlendi.")

# Model nesnesini global olarak veya fonksiyon içinde hızlıca çağırmak için yardımcı swapper fonksiyonu
model_path = os.path.expanduser('~/.insightface/models/inswapper_128.onnx')
swapper_model = insightface.model_zoo.get_model(model_path, download=False, download_zip=False)

def swapper_get(img, target, source):
    return swapper_model.get(img, target, source, paste_back=True)

if __name__ == "__main__":
    # İster tek grup fotoğrafı, ister birden fazla tekli/grup fotoğrafın yolunu buraya ekleyebilirsin:
    sample_images = [
        "uploads/test1.jpg",
        "uploads/test2.jpg"
    ]

    swap_multiple_images(sample_images)
    
    
    