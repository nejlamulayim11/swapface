import os
import time
import random
import cv2
import insightface
from insightface.app import FaceAnalysis
from werkzeug.utils import secure_filename
import numpy as np
import jwt
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_login import login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from bson.objectid import ObjectId

import config
from models import (
    users_collection, history_collection, token_blacklist, messages_collection,
    User, generate_tokens, check_rate_limit, require_scope, allowed_file,
    DEFAULT_USER_SCOPES, ADMIN_SCOPES
)

api_bp = Blueprint('api', __name__)

# E-posta Gönderme Fonksiyonu
def send_email_notification(name, sender_email, message_content):
    try:
        msg = MIMEMultipart()
        msg['From'] = config.MAIL_USERNAME
        msg['To'] = config.MAIL_USERNAME
        msg['Subject'] = f"🚀 HYPER FACE SWAP - Yeni İletişim Mesajı ({name})"

        body = f"""
        Yeni bir iletişim mesajı aldınız!

        Gönderen Adı: {name}
        E-Posta: {sender_email}
        
        Mesaj İçeriği:
        {message_content}
        """
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        server = smtplib.SMTP(config.MAIL_SERVER, config.MAIL_PORT)
        server.starttls()
        server.login(config.MAIL_USERNAME, config.MAIL_PASSWORD)
        server.sendmail(config.MAIL_USERNAME, config.MAIL_USERNAME, msg.as_string())
        server.quit()
        print("E-posta başarıyla gönderildi!")
        return True
    except Exception as e:
        print(f"E-posta gönderme hatası: {e}")
        return False

# Yapay Zeka Model Yüklemeleri
print("Yapay zeka modeli yükleniyor...")
app_face = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
app_face.prepare(ctx_id=0, det_size=(640, 640))
if hasattr(app_face, 'det_model'):
    app_face.det_model.det_thresh = 0.50

model_path = 'models/inswapper_128.onnx'
swapper = insightface.model_zoo.get_model(model_path, download=False, download_zip=False, providers=['CPUExecutionProvider'])
print("Model hazır!")

@api_bp.route('/register', methods=['POST'])
def register():
    username = request.form.get('username')
    email = request.form.get('email')
    password = request.form.get('password')
    if users_collection.find_one({'email': email}):
        return jsonify({'success': False, 'error': 'Bu e-posta kullanımda!'}), 400
    
    hashed_password = generate_password_hash(password, method='scrypt')
    user_id = users_collection.insert_one({
        'username': username, 
        'email': email, 
        'password': hashed_password, 
        'role': 'user',
        'scopes': DEFAULT_USER_SCOPES,
        'token_version': 0
    }).inserted_id
    
    new_user = User(user_id, username, email, hashed_password, 'user', DEFAULT_USER_SCOPES, 0)
    login_user(new_user)
    
    access_token, refresh_token = generate_tokens(user_id, 'user', DEFAULT_USER_SCOPES, 0)
    
    return jsonify({
        'success': True, 
        'message': 'Kayıt başarılı!', 
        'username': username, 
        'access_token': access_token, 
        'refresh_token': refresh_token
    })

@api_bp.route('/login', methods=['POST'])
def login():
    email = request.form.get('email')
    password = request.form.get('password')
    user_data = users_collection.find_one({'email': email})
    
    if user_data and check_password_hash(user_data['password'], password):
        role = user_data.get('role', 'user')
        scopes = user_data.get('scopes', ADMIN_SCOPES if role == 'admin' else DEFAULT_USER_SCOPES)
        tv = user_data.get('token_version', 0)
        
        user = User(user_data['_id'], user_data['username'], user_data.get('email', ''), user_data['password'], role, scopes, tv)
        login_user(user)
        
        access_token, refresh_token = generate_tokens(user_data['_id'], role, scopes, tv)
        
        return jsonify({
            'success': True, 
            'message': 'Giriş başarılı!', 
            'username': user.username, 
            'role': role, 
            'access_token': access_token, 
            'refresh_token': refresh_token
        })
    return jsonify({'success': False, 'error': 'Geçersiz e-posta veya şifre!'}), 400

@api_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    email = request.json.get('email') if request.is_json else request.form.get('email')
    user_data = users_collection.find_one({'email': email})
    
    if user_data:
        reset_payload = {
            'exp': time.time() + 900,
            'iat': time.time(),
            'sub': str(user_data['_id']),
            'scopes': ['password:reset'],
            'tv': user_data.get('token_version', 0),
            'jti': str(uuid.uuid4()),
            'type': 'reset_password'
        }
        reset_token = jwt.encode(reset_payload, config.SECRET_KEY, algorithm='HS256')
        reset_link = f"http://localhost:5173?reset_token={reset_token}"
        print(f"\n[MAIL GÖNDERİM SİMÜLASYONU] Alıcı: {email} | Link: {reset_link}\n")

    return jsonify({
        'success': True, 
        'message': 'Eğer bu e-posta adresi sistemimizde kayıtlıysa, şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'
    })

@api_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json() if request.is_json else request.form
    token = data.get('token')
    new_password = data.get('new_password')

    if not token or not new_password:
        return jsonify({'success': False, 'error': 'Eksik parametre!'}), 400

    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=['HS256'])
        if payload.get('type') != 'reset_password' or 'password:reset' not in payload.get('scopes', []):
            return jsonify({'success': False, 'error': 'Geçersiz veya yetkisiz sıfırlama tokeni!'}), 400

        user_id = payload['sub']
        user_data = users_collection.find_one({'_id': ObjectId(user_id)})
        if not user_data:
            return jsonify({'success': False, 'error': 'Kullanıcı bulunamadı!'}), 404

        hashed_password = generate_password_hash(new_password, method='scrypt')
        
        users_collection.update_one(
            {'_id': ObjectId(user_id)}, 
            {'$set': {'password': hashed_password}, '$inc': {'token_version': 1}}
        )

        return jsonify({'success': True, 'message': 'Şifreniz başarıyla değiştirildi. Lütfen yeni şifrenizle giriş yapın.'})
    except jwt.ExpiredSignatureError:
        return jsonify({'success': False, 'error': 'Sıfırlama bağlantısının süresi dolmuş!'}), 400
    except jwt.InvalidTokenError:
        return jsonify({'success': False, 'error': 'Geçersiz token!'}), 400

@api_bp.route('/refresh', methods=['POST'])
def refresh():
    data = request.get_json() or {}
    refresh_token = data.get('refresh_token')
    
    if not refresh_token:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            refresh_token = auth_header.split(" ")[1]

    if refresh_token:
        try:
            payload = jwt.decode(refresh_token, config.SECRET_KEY, algorithms=['HS256'])
            if payload.get('type') != 'refresh':
                return jsonify({'success': False, 'error': 'Geçersiz token tipi'}), 401
            
            if token_blacklist.find_one({'jti': payload['jti']}):
                return jsonify({'success': False, 'error': 'Token kara listede'}), 401

            user_data = users_collection.find_one({'_id': ObjectId(payload['sub'])})
            if user_data:
                current_tv = user_data.get('token_version', 0)
                if payload.get('tv', 0) != current_tv:
                    return jsonify({'success': False, 'error': 'Oturum sürümü geçersiz'}), 401

                role = user_data.get('role', 'user')
                scopes = payload.get('scopes', ADMIN_SCOPES if role == 'admin' else DEFAULT_USER_SCOPES)

                token_blacklist.insert_one({'jti': payload['jti'], 'expires_at': payload['exp']})
                new_access, new_refresh = generate_tokens(payload['sub'], role, scopes, current_tv)
                
                return jsonify({'success': True, 'access_token': new_access, 'refresh_token': new_refresh})
        except:
            return jsonify({'success': False, 'error': 'Token süresi dolmuş veya geçersiz'}), 401
    return jsonify({'success': False, 'error': 'Token sağlanmadı'}), 401

@api_bp.route('/logout', methods=['POST'])
def logout():
    try:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(" ")[1]
            payload = jwt.decode(token, config.SECRET_KEY, algorithms=['HS256'])
            token_blacklist.insert_one({'jti': payload['jti'], 'expires_at': payload['exp']})
    except:
        pass
        
    logout_user()
    return jsonify({'success': True, 'message': 'Çıkış yapıldı'})

@api_bp.route('/me', methods=['GET'])
def get_me():
    if current_user.is_authenticated:
        return jsonify({
            'success': True, 
            'username': current_user.username, 
            'role': current_user.role,
            'scopes': current_user.scopes
        })
    return jsonify({'success': False}), 401

@api_bp.route('/history', methods=['GET'])
@login_required
def get_history():
    user_history = []
    can_see_all = current_user.role == 'admin' or 'admin:all_history' in current_user.scopes
    query = {} if can_see_all else {'user_id': current_user.id}
    
    records = history_collection.find(query).sort('created_at', -1)
    for r in records:
        user_history.append({
            'image_url': r['image_url'],
            'original_url': r.get('original_url', r['image_url']),
            '_id': str(r['_id'])
        })
    return jsonify({'success': True, 'history': user_history})

@api_bp.route('/contact', methods=['POST'])
def contact_message():
    data = request.get_json() if request.is_json else request.form
    name = data.get('name')
    email = data.get('email')
    message = data.get('message')

    if not name or not email or not message:
        return jsonify({'success': False, 'error': 'Tüm alanları doldurun!'}), 400

    messages_collection.insert_one({
        'name': name,
        'email': email,
        'message': message,
        'created_at': time.time()
    })

    send_email_notification(name, email, message)

    return jsonify({'success': True, 'message': 'Mesajınız başarıyla iletildi!'})

@api_bp.route('/upload', methods=['POST'])
def upload_files():
    try:
        # JWT Token tabanlı kullanıcı doğrulama
        auth_header = request.headers.get('Authorization')
        user_id = None
        user_role = "user"
        
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(token, config.SECRET_KEY, algorithms=['HS256'])
                user_id = payload['sub']
                user_role = payload.get('role', 'user')
            except:
                pass
        
        # Eğer token yoksa veya geçersizse Flask-Login'e de bak
        if not user_id and current_user.is_authenticated:
            user_id = current_user.id
            user_role = current_user.role

        if not user_id:
            return jsonify({'success': False, 'error': 'Lütfen giriş yapın!'}), 401

        if user_role != 'admin':
            if not check_rate_limit(user_id, limit=5, window=60):
                return jsonify({'success': False, 'error': 'Hız limiti aşıldı! 1 dakikada en fazla 5 işlem yapabilirsiniz.'}), 429

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Lütfen fotoğraf seçin!'}), 400
        files = request.files.getlist('file')
        
        swap_mode = request.form.get('swap_mode', 'random') 
        theme = request.form.get('theme', 'default')
        
        if not files or files[0].filename == '':
            return jsonify({'success': False, 'error': 'Hiçbir dosya seçilmedi!'}), 400
        
        session_id = f"user_{user_id}_{int(time.time())}_{random.randint(1000, 9999)}"
        session_folder = os.path.join(config.BASE_UPLOAD_FOLDER, session_id)
        os.makedirs(session_folder, exist_ok=True)
        
        face_data, all_faces_pool = [], []
        first_original_url = None
        
        for idx, file in enumerate(files):
            if file and file.filename != '':
                if not allowed_file(file.filename):
                    return jsonify({'success': False, 'error': f"Desteklenmeyen format: '{file.filename}'"}), 400
                filename = secure_filename(file.filename)
                file_path = os.path.join(session_folder, filename)
                file.save(file_path)
                
                rel_orig_url = f"/uploads/{session_id}/{filename}"
                if idx == 0: first_original_url = rel_orig_url
                
                img = cv2.imread(file_path)
                if img is not None:
                    faces_in_img = app_face.get(img)
                    if len(faces_in_img) > 0:
                        for f in faces_in_img:
                            all_faces_pool.append(f)
                        face_data.append({'image': img, 'faces': faces_in_img})

        target_images_data = face_data
        used_theme = False

        def get_sex(f):
            if hasattr(f, 'sex'): return f.sex
            if hasattr(f, 'gender'): return 'M' if f.gender == 1 else 'F'
            return 'M'

        user_gender = 'M'
        if len(all_faces_pool) > 0:
            user_gender = get_sex(all_faces_pool[0])

        if theme != 'default':
            theme_folder = os.path.join(config.THEMES_BASE_FOLDER, theme)
            if os.path.exists(theme_folder):
                theme_files = [f for f in os.listdir(theme_folder) if allowed_file(f)]
                if theme_files:
                    random.shuffle(theme_files)
                    theme_face_data = []
                    
                    for t_file in theme_files:
                        if len(theme_face_data) >= 6:
                            break
                        t_path = os.path.join(theme_folder, t_file)
                        t_img = cv2.imread(t_path)
                        if t_img is not None:
                            t_faces = app_face.get(t_img)
                            if len(t_faces) > 0:
                                matching_faces = [f for f in t_faces if get_sex(f) == user_gender]
                                if matching_faces:
                                    theme_face_data.append({'image': t_img, 'faces': matching_faces})
                    
                    if theme_face_data:
                        target_images_data = theme_face_data
                        used_theme = True

        num_total_faces = len(all_faces_pool)
        
        if not used_theme and num_total_faces < 2:
            return jsonify({'success': False, 'error': f"Standart modda en az 2 yüz olmalı! (Bulunan: {num_total_faces})"}), 400
        if used_theme and len(target_images_data) == 0:
            return jsonify({'success': False, 'error': "Bu konsept klasöründe cinsiyetinize uygun stok fotoğraf bulunamadı!"}), 400

        if swap_mode == 'fixed' and num_total_faces > 0:
            chosen_source_face = all_faces_pool[0]
        else:
            shuffled_pool = all_faces_pool.copy()
            attempts = 0
            while attempts < 100:
                random.shuffle(shuffled_pool)
                if used_theme:
                    break
                if not any(np.array_equal(f.embedding, shuffled_pool[i].embedding) for i, f in enumerate(all_faces_pool)):
                    break
                attempts += 1
            
        def get_cosine_sim(emb1, emb2):
            return np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))

        def get_smile_score(f):
            if hasattr(f, 'kps') and f.kps is not None and len(f.kps) == 5:
                eye_dist = np.linalg.norm(f.kps[0] - f.kps[1])
                mouth_dist = np.linalg.norm(f.kps[3] - f.kps[4])
                return mouth_dist / eye_dist if eye_dist > 0 else 0
            return 0

        saved_results = []
        pool_counter = 0
        
        for idx, data in enumerate(target_images_data):
            swapped_img = data['image'].copy()
            faces_modified = False
            
            for target_face in data['faces']:
                target_sex = get_sex(target_face)
                source_face = None

                if swap_mode == 'fixed':
                    if get_sex(chosen_source_face) == target_sex:
                        source_face = chosen_source_face
                else:
                    candidates = [f for f in shuffled_pool if get_sex(f) == target_sex and not np.array_equal(f.embedding, target_face.embedding)]
                    
                    if used_theme and not candidates:
                        continue

                    if not candidates and not used_theme:
                        candidates = [f for f in shuffled_pool if not np.array_equal(f.embedding, target_face.embedding)]

                    if candidates:
                        if swap_mode == 'similar':
                            source_face = max(candidates, key=lambda c: get_cosine_sim(c.embedding, target_face.embedding))
                        elif swap_mode == 'different':
                            source_face = min(candidates, key=lambda c: get_cosine_sim(c.embedding, target_face.embedding))
                        elif swap_mode == 'age':
                            source_face = min(candidates, key=lambda c: abs(getattr(c, 'age', 0) - getattr(target_face, 'age', 0)))
                        elif swap_mode == 'smile':
                            source_face = max(candidates, key=lambda c: get_smile_score(c))
                        else:
                            source_face = candidates[pool_counter % len(candidates)]

                if source_face is not None:
                    original_embedding = target_face.embedding.copy()
                    target_face.embedding = source_face.embedding
                    swapped_img = swapper.get(swapped_img, target_face, source_face, paste_back=True)
                    target_face.embedding = original_embedding
                    faces_modified = True
                
                pool_counter += 1
            
            if used_theme and not faces_modified:
                continue
                
            res_filename = f"sonuc_{idx}.jpg"
            res_path = os.path.join(session_folder, res_filename)
            cv2.imwrite(res_path, swapped_img)
            rel_url = f"/uploads/{session_id}/{res_filename}"
            saved_results.append(rel_url)
            
            history_collection.insert_one({
                'user_id': user_id,
                'image_url': rel_url,
                'original_url': first_original_url,
                'created_at': time.time()
            })

        return jsonify({'success': True, 'results': saved_results})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Sunucu hatası: {str(e)}'}), 500

@api_bp.route('/delete-history', methods=['POST'])
@login_required
@require_scope('history:delete')
def delete_history():
    data = request.get_json()
    image_url = data.get('image_url')
    if not image_url: return jsonify({'success': False, 'error': 'Geçersiz görsel!'}), 400
        
    record = history_collection.find_one({'image_url': image_url})
    if record:
        can_delete = current_user.role == 'admin' or record['user_id'] == current_user.id
        if can_delete:
            history_collection.delete_one({'_id': record['_id']})
            local_path = image_url.lstrip('/')
            if os.path.exists(local_path):
                os.remove(local_path)
            return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Kayıt bulunamadı veya yetkisiz!'}), 403

@api_bp.route('/admin/users', methods=['GET'])
@login_required
@require_scope('admin:manage_users')
def get_all_users():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    search = request.args.get('search', '').strip()
    
    query = {}
    if search:
        query = {
            '$or': [
                {'username': {'$regex': search, '$options': 'i'}},
                {'email': {'$regex': search, '$options': 'i'}}
            ]
        }
        
    total_users = users_collection.count_documents(query)
    skip = (page - 1) * limit
    
    users_list = []
    for u in users_collection.find(query).sort('_id', -1).skip(skip).limit(limit):
        users_list.append({
            'id': str(u['_id']),
            'username': u.get('username', ''),
            'email': u.get('email', ''),
            'role': u.get('role', 'user'),
            'scopes': u.get('scopes', DEFAULT_USER_SCOPES)
        })
        
    return jsonify({
        'success': True, 
        'users': users_list,
        'total': total_users,
        'page': page,
        'total_pages': (total_users + limit - 1) // limit
    })

@api_bp.route('/admin/users/<target_user_id>/role', methods=['POST'])
@login_required
@require_scope('admin:manage_users')
def update_user_role(target_user_id):
    data = request.get_json()
    new_role = data.get('role')
    if new_role not in ['user', 'admin']:
        return jsonify({'success': False, 'error': 'Geçersiz rol!'}), 400
        
    new_scopes = ADMIN_SCOPES if new_role == 'admin' else DEFAULT_USER_SCOPES

    users_collection.update_one(
        {'_id': ObjectId(target_user_id)}, 
        {'$set': {'role': new_role, 'scopes': new_scopes}}
    )
    return jsonify({'success': True, 'message': 'Kullanıcı yetkisi ve kapsamları güncellendi.'})

@api_bp.route('/admin/users/<target_user_id>/revoke-sessions', methods=['POST'])
@login_required
@require_scope('admin:manage_users')
def revoke_user_sessions(target_user_id):
    users_collection.update_one(
        {'_id': ObjectId(target_user_id)}, 
        {'$inc': {'token_version': 1}}
    )
    return jsonify({'success': True, 'message': 'Kullanıcının tüm aktif oturumları kapatıldı.'})

@api_bp.route('/admin/users/<target_user_id>', methods=['DELETE'])
@login_required
@require_scope('admin:manage_users')
def delete_user(target_user_id):
    if target_user_id == current_user.id:
        return jsonify({'success': False, 'error': 'Kendinizi silemezsiniz!'}), 400
        
    users_collection.delete_one({'_id': ObjectId(target_user_id)})
    records = history_collection.find({'user_id': target_user_id})
    for record in records:
        local_path = record['image_url'].lstrip('/')
        if os.path.exists(local_path):
            try:
                os.remove(local_path)
            except:
                pass
    history_collection.delete_many({'user_id': target_user_id})
    return jsonify({'success': True, 'message': 'Kullanıcı ve tüm geçmişi silindi.'})

@api_bp.route('/uploads/<path:filename>')
def uploaded_file(filename):
    if request.args.get('dl') == '1':
        return send_from_directory(config.BASE_UPLOAD_FOLDER, filename, as_attachment=True)
    return send_from_directory(config.BASE_UPLOAD_FOLDER, filename)