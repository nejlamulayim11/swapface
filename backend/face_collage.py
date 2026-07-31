import cv2
import numpy as np
import os
import sys
import random
import insightface
from insightface.app import FaceAnalysis

def create_face_collage(image_path):
    if not os.path.exists(image_path):
        print(f"HATA: '{image_path}' bulunamadı! Lütfen uploads klasöründe test.jpg olduğundan emin olun.")
        sys.exit(1)

    img = cv2.imread(image_path)
    if img is None:
        print(f"HATA: '{image_path}' okunamadı, dosya bozuk olabilir.")
        sys.exit(1)
        
    print("1) Grup görseli okundu, boyut:", img.shape)

    print("2) InsightFace modeli yükleniyor...")
    app = FaceAnalysis(name='buffalo_l')
    app.prepare(ctx_id=0, det_size=(1280, 1280))

    faces = app.get(img)
    num_faces = len(faces)
    print(f"3) Bulunan yüz sayısı: {num_faces}")

    if num_faces < 2:
        print(f"HATA: Kolaj için en az 2 yüz gerekiyor ancak fotoğrafta {num_faces} yüz bulundu.")
        print("Lütfen içinde en az 2 net yüz olan bir grup fotoğrafı kullanın.")
        sys.exit(1)

    model_path = os.path.expanduser('~/.insightface/models/inswapper_128.onnx')
    if not os.path.exists(model_path):
        print(f"HATA: '{model_path}' bulunamadı!")
        sys.exit(1)

    swapper = insightface.model_zoo.get_model(model_path, download=False, download_zip=False)

    # Yüzleri soldan sağa sırala
    faces = sorted(faces, key=lambda f: f['bbox'][0])

    # Orijinal yüz kırpıkları
    original_crops = []
    for face in faces:
        bbox = face['bbox'].astype(int)
        x1, y1, x2, y2 = max(0, bbox[0]), max(0, bbox[1]), min(img.shape[1], bbox[2]), min(img.shape[0], bbox[3])
        crop = img[y1:y2, x1:x2]
        if crop.size > 0:
            original_crops.append(cv2.resize(crop, (150, 150)))

    # Rastgele karıştırma
    indices = list(range(num_faces))
    shuffled_indices = indices.copy()
    while any(i == j for i, j in zip(indices, shuffled_indices)):
        random.shuffle(shuffled_indices)

    print("4) Yüzler rastgele değiştiriliyor...")
    swapped_img = img.copy()
    for target_idx, source_idx in zip(indices, shuffled_indices):
        target_face = faces[target_idx]
        source_face = faces[source_idx]
        swapped_img = swapper.get(swapped_img, target_face, source_face, paste_back=True)

    # Değişmiş yüzden yüzleri tekrar tespit et
    swapped_faces_extracted = app.get(swapped_img)
    swapped_faces_extracted = sorted(swapped_faces_extracted, key=lambda f: f['bbox'][0])

    swapped_crops = []
    for face in swapped_faces_extracted:
        bbox = face['bbox'].astype(int)
        x1, y1, x2, y2 = max(0, bbox[0]), max(0, bbox[1]), min(swapped_img.shape[1], bbox[2]), min(swapped_img.shape[0], bbox[3])
        crop = swapped_img[y1:y2, x1:x2]
        if crop.size > 0:
            swapped_crops.append(cv2.resize(crop, (150, 150)))

    min_len = min(len(original_crops), len(swapped_crops))
    print(f"5) Kolaj için eşleşen yüz çifti sayısı: {min_len}")
    
    if min_len == 0:
        print("HATA: Kırpılacak geçerli yüz bulunamadı.")
        return

    cell_w, cell_h = 150, 150
    header_h = 40
    
    collage_width = min_len * cell_w
    collage_height = (cell_h * 2) + (header_h * 2)
    
    collage = np.ones((collage_height, collage_width, 3), dtype=np.uint8) * 240

    cv2.putText(collage, "ONCESI (ORIGINAL)", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (50, 50, 50), 1)
    
    for i in range(min_len):
        x_offset = i * cell_w
        collage[header_h : header_h + cell_h, x_offset : x_offset + cell_w] = original_crops[i]

    after_start_y = header_h + cell_h + header_h
    cv2.putText(collage, "SONRASI (SWAPPED)", (10, after_start_y - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (50, 50, 50), 1)

    for i in range(min_len):
        x_offset = i * cell_w
        collage[after_start_y : after_start_y + cell_h, x_offset : x_offset + cell_w] = swapped_crops[i]

    # Klasörün var olduğundan emin ol
    os.makedirs("uploads", exist_ok=True)
    
    cv2.imwrite("uploads/kolaj_sonuc.jpg", collage)
    cv2.imwrite("uploads/grup_swapped_tam.jpg", swapped_img)
    
    print("6) İşlem başarıyla tamamlandı!")
    print("-> Kaydedilen Konum: uploads/kolaj_sonuc.jpg")

if __name__ == "__main__":
    create_face_collage("uploads/test.jpg")