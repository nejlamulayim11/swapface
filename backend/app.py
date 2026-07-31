import os
from flask import Flask
from flask_login import LoginManager
from flask_cors import CORS

import config
from models import users_collection, ObjectId, User, ADMIN_SCOPES, DEFAULT_USER_SCOPES
from routes import api_bp

app = Flask(__name__)
app.config['SECRET_KEY'] = config.SECRET_KEY

# CORS ayarları (Frontend ile haberleşme için tam yetki)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    try:
        user_data = users_collection.find_one({'_id': ObjectId(user_id)})
        if user_data:
            role = user_data.get('role', 'user')
            scopes = user_data.get('scopes', ADMIN_SCOPES if role == 'admin' else DEFAULT_USER_SCOPES)
            return User(
                user_data['_id'], 
                user_data['username'], 
                user_data.get('email', ''), 
                user_data['password'], 
                role,
                scopes,
                user_data.get('token_version', 0)
            )
    except:
        pass
    return None

# Gerekli yükleme ve tema klasörlerinin oluşturulması
os.makedirs(config.BASE_UPLOAD_FOLDER, exist_ok=True)
os.makedirs(config.THEMES_BASE_FOLDER, exist_ok=True)
for theme_name in ['1980', '2050', 'child', 'elderly']:
    os.makedirs(os.path.join(config.THEMES_BASE_FOLDER, theme_name), exist_ok=True)

# Blueprint kaydı (API rotalarını ana uygulamaya bağlar)
app.register_blueprint(api_bp)

@app.route('/')
def index():
    return {"status": "running", "message": "HyperFaceSwap API is online!"}

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=7860)