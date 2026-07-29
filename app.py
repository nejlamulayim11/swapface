from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
from bson.objectid import ObjectId
import os
import shutil
import time
import random
import cv2
import insightface
from insightface.app import FaceAnalysis
from werkzeug.utils import secure_filename
import numpy as np

app = Flask(__name__)
app.config['SECRET_KEY'] = 'gizli-anahtar-kelime-12345'

# --- MONGODB BAĞLANTI KONTROLÜ ---
try:
    client = MongoClient("mongodb://face_swap_mongo:27017/", serverSelectionTimeoutMS=2000)
    client.server_info()
    db = client['face_swap_db']
    users_collection = db['users']
    history_collection = db['history']
    print("MongoDB bağlantısı başarılı!")
except Exception as e:
    print(f"MongoDB Bağlantı Hatası: Lütfen MongoDB servisinin açık olduğundan emin olun! Hata: {e}")

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

class User(UserMixin):
    def __init__(self, user_id, username, email, password):
        self.id = str(user_id)
        self.username = username
        self.email = email
        self.password = password

@login_manager.user_loader
def load_user(user_id):
    try:
        user_data = users_collection.find_one({'_id': ObjectId(user_id)})
        if user_data:
            return User(user_data['_id'], user_data['username'], user_data.get('email', ''), user_data['password'])
    except:
        pass
    return None

BASE_UPLOAD_FOLDER = 'uploads'
os.makedirs(BASE_UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

print("Yapay zeka modeli yükleniyor...")
app_face = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
app_face.prepare(ctx_id=0, det_size=(640, 640))

if hasattr(app_face, 'det_model'):
    app_face.det_model.det_thresh = 0.50

model_path = 'models/inswapper_128.onnx'
swapper = insightface.model_zoo.get_model(model_path, download=False, download_zip=False, providers=['CPUExecutionProvider'])
print("Model hazır!")

@app.route('/register', methods=['POST'])
def register():
    username = request.form.get('username')
    email = request.form.get('email')
    password = request.form.get('password')
    
    if users_collection.find_one({'email': email}):
        return jsonify({'success': False, 'error': 'Bu e-posta adresi zaten kullanımda!'}), 400
    
    hashed_password = generate_password_hash(password, method='scrypt')
    user_id = users_collection.insert_one({
        'username': username,
        'email': email,
        'password': hashed_password
    }).inserted_id
    
    new_user = User(user_id, username, email, hashed_password)
    login_user(new_user)
    return jsonify({'success': True, 'message': 'Kayıt başarılı!'})

@app.route('/login', methods=['POST'])
def login():
    email = request.form.get('email')
    password = request.form.get('password')
    
    user_data = users_collection.find_one({'email': email})
    if user_data and check_password_hash(user_data['password'], password):
        user = User(user_data['_id'], user_data['username'], user_data.get('email', ''), user_data['password'])
        login_user(user)
        return jsonify({'success': True, 'message': 'Giriş başarılı!'})
    
    return jsonify({'success': False, 'error': 'Geçersiz e-posta veya şifre!'}), 400

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

@app.route('/')
def index():
    user_history = []
    if current_user.is_authenticated:
        records = history_collection.find({'user_id': current_user.id}).sort('created_at', -1)
        for r in records:
            user_history.append({
                'image_url': r['image_url'],
                'original_url': r.get('original_url', r['image_url'])
            })
    return render_template('index.html', history=user_history)

@app.route('/upload', methods=['POST'])
@login_required
def upload_files():
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Lütfen fotoğraf seçin!'}), 400
        
        files = request.files.getlist('file')
        swap_mode = request.form.get('swap_mode', 'random')
        
        if not files or files[0].filename == '':
            return jsonify({'success': False, 'error': 'Hiçbir dosya seçilmedi!'}), 400
        
        session_id = f"user_{current_user.id}_{int(time.time())}_{random.randint(1000, 9999)}"
        session_folder = os.path.join(BASE_UPLOAD_FOLDER, session_id)
        os.makedirs(session_folder, exist_ok=True)
        
        face_data = [] 
        all_faces_pool = []
        first_original_url = None
        
        for idx, file in enumerate(files):
            if file and file.filename != '':
                if not allowed_file(file.filename):
                    return jsonify({'success': False, 'error': f"Desteklenmeyen format: '{file.filename}'"}), 400
                
                filename = secure_filename(file.filename)
                file_path = os.path.join(session_folder, filename)
                file.save(file_path)
                
                rel_orig_url = f"/uploads/{session_id}/{filename}"
                if idx == 0:
                    first_original_url = rel_orig_url
                
                img = cv2.imread(file_path)
                if img is not None:
                    faces_in_img = app_face.get(img)
                    if len(faces_in_img) > 0:
                        for f in faces_in_img:
                            all_faces_pool.append(f)
                        face_data.append({'image': img, 'faces': faces_in_img})

        num_total_faces = len(all_faces_pool)
        if num_total_faces < 2:
            return jsonify({'success': False, 'error': f"Yüklenen görsellerde toplam en az 2 yüz algılanmalı! (Algılanan: {num_total_faces})"}), 400

        if swap_mode == 'fixed' and num_total_faces > 0:
            chosen_source_face = all_faces_pool[0]
        else:
            shuffled_pool = all_faces_pool.copy()
            attempts = 0
            while attempts < 100:
                random.shuffle(shuffled_pool)
                if not any(np.array_equal(f.embedding, shuffled_pool[i].embedding) for i, f in enumerate(all_faces_pool)):
                    break
                attempts += 1

        saved_results = []
        pool_counter = 0
        
        for idx, data in enumerate(face_data):
            swapped_img = data['image'].copy()
            for target_face in data['faces']:
                if swap_mode == 'fixed':
                    source_face = chosen_source_face
                else:
                    source_face = shuffled_pool[pool_counter % num_total_faces]

                original_embedding = target_face.embedding.copy()
                target_face.embedding = source_face.embedding
                
                swapped_img = swapper.get(swapped_img, target_face, source_face, paste_back=True)
                target_face.embedding = original_embedding
                pool_counter += 1
                
            res_filename = f"sonuc_{idx}.jpg"
            res_path = os.path.join(session_folder, res_filename)
            cv2.imwrite(res_path, swapped_img)
            
            rel_url = f"/uploads/{session_id}/{res_filename}"
            saved_results.append(rel_url)
            
            history_collection.insert_one({
                'user_id': current_user.id,
                'image_url': rel_url,
                'original_url': first_original_url,
                'created_at': time.time()
            })

        return jsonify({
            'success': True,
            'results': saved_results
        })
    except Exception as e:
        print(f"İşlem Hatası: {e}")
        return jsonify({'success': False, 'error': f'Sunucu işleme hatası: {str(e)}'}), 500

@app.route('/delete-history', methods=['POST'])
@login_required
def delete_history():
    data = request.get_json()
    image_url = data.get('image_url')
    
    if not image_url:
        return jsonify({'success': False, 'error': 'Geçersiz görsel!'}), 400
        
    record = history_collection.find_one({'user_id': current_user.id, 'image_url': image_url})
    if record:
        history_collection.delete_one({'_id': record['_id']})
        local_path = image_url.lstrip('/')
        if os.path.exists(local_path):
            os.remove(local_path)
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'error': 'Kayıt bulunamadı!'}), 403

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(BASE_UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7860)