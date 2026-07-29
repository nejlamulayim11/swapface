import time
import jwt
import uuid
from flask_login import UserMixin, current_user
from functools import wraps
from flask import jsonify, request
from pymongo import MongoClient
from bson.objectid import ObjectId
import config

client = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=2000)
db = client[config.DB_NAME]
users_collection = db['users']
history_collection = db['history']
token_blacklist = db['token_blacklist']
rate_limits = db['rate_limits']
messages_collection = db['messages']

DEFAULT_USER_SCOPES = ['image:swap', 'history:delete']
ADMIN_SCOPES = ['image:swap', 'history:delete', 'admin:manage_users', 'admin:all_history']

class User(UserMixin):
    def __init__(self, user_id, username, email, password, role='user', scopes=None, token_version=0):
        self.id = str(user_id)
        self.username = username
        self.email = email
        self.password = password
        self.role = role
        self.scopes = scopes or DEFAULT_USER_SCOPES
        self.token_version = token_version

def generate_tokens(user_id, role, scopes, token_version=0):
    jti_access = str(uuid.uuid4())
    jti_refresh = str(uuid.uuid4())
    
    access_payload = {
        'exp': time.time() + 86400,
        'iat': time.time(),
        'sub': str(user_id),
        'role': role,
        'scopes': scopes,
        'tv': token_version,
        'jti': jti_access,
        'type': 'access'
    }
    refresh_payload = {
        'exp': time.time() + 7776000,
        'iat': time.time(),
        'sub': str(user_id),
        'tv': token_version,
        'jti': jti_refresh,
        'type': 'refresh'
    }
    
    access_token = jwt.encode(access_payload, config.SECRET_KEY, algorithm='HS256')
    refresh_token = jwt.encode(refresh_payload, config.SECRET_KEY, algorithm='HS256')
    return access_token, refresh_token

def check_rate_limit(user_id, limit=5, window=60):
    now = time.time()
    rate_limits.delete_many({'timestamp': {'$lt': now - window}})
    count = rate_limits.count_documents({'user_id': user_id, 'timestamp': {'$gte': now - window}})
    if count >= limit:
        return False
    rate_limits.insert_one({'user_id': user_id, 'timestamp': now})
    return True

def require_scope(required_scope):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'success': False, 'error': 'Yetkilendirme gerekiyor!'}), 401
            
            if current_user.role == 'admin' or required_scope in getattr(current_user, 'scopes', []):
                return f(*args, **kwargs)
            
            return jsonify({'success': False, 'error': f"Bu işlem için '{required_scope}' yetkiniz yok!"}), 403
        return decorated_function
    return decorator

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in config.ALLOWED_EXTENSIONS