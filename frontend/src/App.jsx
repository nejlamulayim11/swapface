import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE = 'https://hyperfaceswap.com.tr/api';

function App() {
  const [currentSlide, setCurrentSlide] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const totalSlides = 5; 
  const bgColors = ['#050505', '#050505', '#050505', '#050505', '#050505']; 

  const [user, setUser] = useState(null); 
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [sessionWarning, setSessionWarning] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => { setToastMessage(null); }, 3500);
  };

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [swapMode, setSwapMode] = useState('random');
  const [theme, setTheme] = useState('default');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Kullanım Şartları ve Rıza Beyanı State'i
  const [consentChecked, setConsentChecked] = useState(false);
  
  const [results, setResults] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_ITEMS_PER_PAGE = 8;
  
  const [usersList, setUsersList] = useState([]);
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSearchInput, setAdminSearchInput] = useState('');

  const [holdingCard, setHoldingCard] = useState(false);
  const resultRef = useRef(null);
  const fileInputRef = useRef(null);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');

  useEffect(() => {
    checkAuth();
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('reset_token');
    if (tokenFromUrl) {
      setResetToken(tokenFromUrl);
      setAuthMode('reset');
      setAuthModalOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const checkTokenExpiry = () => {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresIn = payload.exp * 1000 - Date.now();
        if (expiresIn < 60000 && expiresIn > 0) {
          setSessionWarning(true);
        } else if (expiresIn <= 0) {
          silentRefresh();
        }
      } catch (e) { console.error(e); }
    };
    const interval = setInterval(checkTokenExpiry, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const silentRefresh = async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) { setUser(null); return; }
      const res = await fetch(`${API_BASE}/refresh`, { 
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }) 
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setSessionWarning(false);
      } else { setUser(null); }
    } catch (e) { setUser(null); }
  };

  useEffect(() => {
    if (user) {
      if (currentSlide === 2) fetchHistory();
      if (currentSlide === 4 && (user.role === 'admin' || user.scopes?.includes('admin:manage_users'))) fetchAdminUsers(adminPage, adminSearch);
    }
  }, [user, currentSlide, adminPage, adminSearch]);

  const fetchWithAuth = async (url, options = {}) => {
    let token = localStorage.getItem('access_token');
    let headers = options.headers || {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!options.body || !(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    let response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        const refreshRes = await fetch(`${API_BASE}/refresh`, { 
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }) 
        });
        const refreshData = await refreshRes.json();
        if (refreshRes.ok && refreshData.success) {
          localStorage.setItem('access_token', refreshData.access_token);
          localStorage.setItem('refresh_token', refreshData.refresh_token);
          headers['Authorization'] = `Bearer ${refreshData.access_token}`;
          setSessionWarning(false);
          response = await fetch(url, { ...options, headers });
        } else {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          setUser(null);
        }
      } else { setUser(null); }
    }
    return response;
  };

  const checkAuth = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/me`, { method: 'GET' });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser({ username: data.username, role: data.role, scopes: data.scopes });
      }
    } catch (err) { setUser(null); }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/history`, { method: 'GET' });
      const data = await res.json();
      if (res.ok && data.success) {
        setHistory(data.history);
        setHistoryPage(1); 
      }
    } catch (err) { console.error(err); }
  };

  const fetchAdminUsers = async (page = 1, search = '') => {
    try {
      const url = `${API_BASE}/admin/users?page=${page}&limit=10&search=${encodeURIComponent(search)}`;
      const res = await fetchWithAuth(url, { method: 'GET' });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsersList(data.users);
        setAdminPage(data.page);
        setAdminTotalPages(data.total_pages);
      }
    } catch (err) { console.error(err); }
  };

  const handleSearchAdmin = () => { setAdminSearch(adminSearchInput); setAdminPage(1); };

  const changeUserRole = async (targetId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Yetkiyi "${newRole.toUpperCase()}" yapmak istiyor musunuz?`)) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/users/${targetId}/role`, {
        method: 'POST', body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (res.ok && data.success) setUsersList(prev => prev.map(u => u.id === targetId ? { ...u, role: newRole } : u));
    } catch (err) { showToast('Sunucu hatası.'); }
  };

  const revokeUserSessions = async (targetId) => {
    if (!window.confirm("Oturumlar sonlandırılsın mı?")) return;
    try {
      await fetchWithAuth(`${API_BASE}/admin/users/${targetId}/revoke-sessions`, { method: 'POST' });
      showToast("Oturumlar kapatıldı.");
    } catch (e) { showToast('Hata.'); }
  };

  const deleteUserAccount = async (targetId) => {
    if (!window.confirm("Kullanıcı silinsin mi?")) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/users/${targetId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) setUsersList(prev => prev.filter(u => u.id !== targetId));
    } catch (err) { showToast('Hata.'); }
  };

  const goToSlide = (index) => {
    setCurrentSlide(Math.max(0, Math.min(totalSlides - 1, index)));
    setMenuOpen(false);
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;
    setFiles(selectedFiles);
    setResults([]);
    setCurrentIndex(0);
    setPreviews(selectedFiles.map(file => URL.createObjectURL(file)));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (droppedFiles.length > 0) {
      setFiles(droppedFiles);
      setResults([]);
      setCurrentIndex(0);
      setPreviews(droppedFiles.map(file => URL.createObjectURL(file)));
    }
  };

  const copyImage = async (url) => {
    try {
      const fullUrl = `${API_BASE}${url}`;
      await navigator.clipboard.writeText(fullUrl);
      showToast("Bağlantı kopyalandı! 📋");
    } catch (err) { showToast("Kopyalanamadı."); }
  };

  const deleteHistoryItem = async (imageUrl) => {
    if (!window.confirm("Bu görsel geçmişten silinsin mi?")) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/delete-history`, {
        method: 'POST', body: JSON.stringify({ image_url: imageUrl })
      });
      const data = await res.json();
      if (res.ok && data.success) setHistory(prev => prev.filter(item => item.image_url !== imageUrl));
    } catch (err) { showToast('Hata.'); }
  };

  const deleteAllHistory = async () => {
    if (!window.confirm("Tüm geçmişinizi kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz! ⚠️")) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/delete-all-history`, { method: 'POST' });
      setHistory([]);
      setHistoryPage(1);
      showToast("Tüm geçmiş başarıyla temizlendi. ✨");
    } catch (err) { 
      setHistory([]);
      showToast("Geçmiş temizlendi."); 
    }
  };

  const handleSwitchMode = (newMode) => {
    setAuthMode(newMode); setEmail(''); setPassword(''); setUsername(''); setNewPassword('');
  };

  const handleAuthSubmit = async (e) => {
    if (e) e.preventDefault();
    if (authMode === 'register' && !username.trim()) { showToast("Kullanıcı adı girin."); return; }
    if ((authMode === 'login' || authMode === 'register' || authMode === 'forgot') && !email.trim()) { showToast("E-posta girin."); return; }
    if ((authMode === 'login' || authMode === 'register') && !password.trim()) { showToast("Şifre girin."); return; }
    if (authMode === 'reset' && !newPassword.trim()) { showToast("Yeni şifre girin."); return; }

    if (authMode === 'forgot') {
      try {
        const response = await fetch(`${API_BASE}/forgot-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (response.ok && data.success) { showToast(data.message); handleSwitchMode('login'); }
      } catch (err) { showToast('Hata.'); }
      return;
    }

    if (authMode === 'reset') {
      try {
        const response = await fetch(`${API_BASE}/reset-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, new_password: newPassword })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          showToast(data.message); handleSwitchMode('login'); setAuthModalOpen(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (err) { showToast('Hata.'); }
      return;
    }

    const endpoint = authMode === 'login' ? '/login' : '/register';
    const formData = new URLSearchParams();
    formData.append('email', email); formData.append('password', password);
    if (authMode === 'register') formData.append('username', username);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData
      });
      const data = await response.json();
      if (response.ok && data.success) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setAuthModalOpen(false);
        setUser({ username: data.username, role: data.role || 'user', scopes: data.scopes });
        showToast(`Giriş yapıldı! ✨ Hoş geldin ${data.username}`);
      } else { showToast(data.error || 'Hata!'); }
    } catch (err) { showToast('Bağlantı hatası.'); }
  };

  const handleLogout = async () => {
    try { await fetchWithAuth(`${API_BASE}/logout`, { method: 'POST' }); } catch (err) {}
    finally {
      localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token');
      setUser(null); setHistory([]); setResults([]); setCurrentIndex(0); setPreviews([]); setUsersList([]); goToSlide(1); 
      showToast("Oturum kapatıldı.");
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (files.length === 0) { showToast("Dosya seçin!"); return; }

    // Rıza ve Kullanım Şartları Onay Kontrolü
    if (!consentChecked) {
      showToast("Lütfen yükleme şartlarını onaylayın.");
      return;
    }

    const formData = new FormData();
    files.forEach(file => formData.append('file', file));
    formData.append('swap_mode', swapMode);
    formData.append('theme', theme); 
    formData.append('mode', theme); // Backend'in beklediği 'mode' parametresini de ekledik!  

    setLoading(true); 
    setErrorMsg(''); 
    setProgress(15); 
    setProgressText('Fotoğraflar sunucuya yükleniyor... %15');

    let currentProgress = 15;
    const progressInterval = setInterval(() => {
      if (currentProgress < 40) {
        currentProgress += 5;
        setProgress(currentProgress);
        setProgressText(`Yüz analizi yapılıyor... %${currentProgress}`);
      } else if (currentProgress < 90) {
        currentProgress += 2;
        setProgress(currentProgress);
        setProgressText(`Yüzler derin öğrenme ile eşleştiriliyor... %${currentProgress}`);
      }
    }, 450);

    try {
      const response = await fetchWithAuth(`${API_BASE}/upload`, { method: 'POST', body: formData });
      const data = await response.json();

      clearInterval(progressInterval);

      if (response.ok && data.success) {
        setProgress(100); 
        setProgressText('Dönüşüm tamamlandı! Hazırlanıyor... %100');
        setTimeout(() => {
          setResults(data.results); 
          setCurrentIndex(0); 
          setLoading(false);
          if (resultRef.current) {
            resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      } else { 
        setLoading(false); 
        setErrorMsg(data.error || "İşlem reddedildi."); 
      }
    } catch (err) { 
      clearInterval(progressInterval);
      setLoading(false); 
      setErrorMsg('Sunucu hatası.'); 
    }
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMessage) {
        showToast("Lütfen tüm alanları doldurun.");
        return;
    }

    try {
      const response = await fetch(`${API_BASE}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: contactName, email: contactEmail, message: contactMessage })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        showToast(`Teşekkürler ${contactName}, mesajınız iletildi!`);
        setContactName(''); 
        setContactEmail(''); 
        setContactMessage('');
      } else {
        showToast(data.error || 'Mesaj gönderilemedi.');
      }
    } catch (err) {
      showToast('Bağlantı hatası.');
    }
  };

  const handlePrev = () => { setCurrentIndex((prev) => (prev === 0 ? results.length - 1 : prev - 1)); };
  const handleNext = () => { setCurrentIndex((prev) => (prev === results.length - 1 ? 0 : prev + 1)); };

  const handleReset = () => {
    setResults([]);
    setFiles([]);
    setPreviews([]);
  };

  const activeResultUrl = results[currentIndex] || '';

  const totalHistoryPages = Math.ceil(history.length / HISTORY_ITEMS_PER_PAGE) || 1;
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const currentHistoryItems = history.slice((safeHistoryPage - 1) * HISTORY_ITEMS_PER_PAGE, safeHistoryPage * HISTORY_ITEMS_PER_PAGE);

  const cyberGridStyle = {
    backgroundColor: '#070707',
    backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
    backgroundSize: '30px 30px'
  };

  return (
    <div style={{ height: '100vh', overflow: 'hidden', position: 'relative' }}>
      
      {toastMessage && (
        <div style={{
          position: 'fixed', top: '25px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15, 15, 15, 0.95)', border: '1px solid var(--lime)', color: '#fff',
          padding: '14px 28px', borderRadius: '30px', zIndex: 9999, fontFamily: 'var(--font-display)',
          fontSize: '15px', letterSpacing: '1px', boxShadow: '0 10px 30px rgba(168,255,120,0.3)',
          display: 'flex', alignItems: 'center', gap: '10px', animation: 'fadeInDown 0.3s ease'
        }}>
          <span style={{ color: 'var(--lime)' }}>✨</span> {toastMessage}
        </div>
      )}

      {sessionWarning && (
        <div style={{ position: 'fixed', top: '60px', left: 0, right: 0, background: 'var(--orange)', color: 'var(--ink)', zIndex: 100, textAlign: 'center', fontFamily: 'var(--font-pixel)', fontSize: '18px', padding: '6px' }}>
          ⚠️ Oturum süresi dolmak üzere. <button onClick={silentRefresh} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Yenile</button>
        </div>
      )}

      {/* ÜST NAVBAR */}
      <header className="topbar" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', zIndex: 50, borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#050505', height: '85px', padding: '0 30px', boxSizing: 'border-box' }}>
        
        {/* SOL: LOGO */}
        <div style={{ justifySelf: 'start' }}>
          <a className="mark" onClick={() => goToSlide(1)} style={{ cursor: 'pointer', fontSize: '22px', whiteSpace: 'nowrap' }}>HYPER <b>FACE</b> SWAP<span className="dot"></span></a>
        </div>
        
        {/* ORTA: MENÜ */}
        <nav style={{ justifySelf: 'center', display: 'flex', gap: '30px', alignItems: 'center', whiteSpace: 'nowrap' }}>
          {[{ id: 0, num: '01', text: 'ANA SAYFA' }, 
            { id: 1, num: '02', text: 'STÜDYO' }, 
            { id: 2, num: '03', text: 'GEÇMİŞ' },
            { id: 3, num: '04', text: 'İLETİŞİM' }].map(item => (
            <button key={item.id} onClick={() => goToSlide(item.id)} 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '17px', letterSpacing: '0.5px', color: currentSlide === item.id ? 'var(--lime)' : 'rgba(255,255,255,0.6)', textShadow: currentSlide === item.id ? '0 0 12px rgba(168,255,120,0.4)' : 'none', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: currentSlide === item.id ? 'var(--lime)' : 'var(--orange)', fontSize: '13px', opacity: 0.8 }}>{item.num}</span> {item.text}
            </button>
          ))}
          {(user?.role === 'admin' || user?.scopes?.includes('admin:manage_users')) && (
            <button onClick={() => goToSlide(4)} 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '17px', color: currentSlide === 4 ? 'var(--lime)' : 'rgba(255,255,255,0.6)', textShadow: currentSlide === 4 ? '0 0 12px rgba(168,255,120,0.4)' : 'none', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: currentSlide === 4 ? 'var(--lime)' : 'var(--orange)', fontSize: '13px', opacity: 0.8 }}>05</span> ADMIN
            </button>
          )}
        </nav>

        {/* SAĞ: KULLANICI BİLGİLERİ, SAYAC VE MENU BUTONU */}
        <div className="topright" style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: '25px', whiteSpace: 'nowrap' }}>
          <div style={{ fontFamily: 'var(--font-pixel)', display: 'flex', alignItems: 'center', gap: '20px' }}>
            {user ? (
              <>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '17px' }}>
                  Hoş geldin, <b style={{color:'var(--lime)', fontSize: '19px'}}>{user.username}</b>
                  {user.role === 'admin' && <span style={{ marginLeft: '10px', fontSize: '12px', background: 'var(--orange)', color: 'var(--ink)', padding: '3px 10px', borderRadius: '12px', fontWeight: 'bold' }}>ADMIN</span>}
                </span>
                <button onClick={handleLogout} style={{ color: 'var(--pink)', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', fontWeight: 'bold' }}>Çıkış</button>
              </>
            ) : (
              <>
                <button onClick={() => { handleSwitchMode('login'); setAuthModalOpen(true); }} className="btn" style={{ padding: '8px 20px', fontSize: '15px', background: 'transparent', border: '2px solid var(--lime)', color: 'var(--lime)', borderRadius: '25px' }}>Giriş Yap</button>
                <button onClick={() => { handleSwitchMode('register'); setAuthModalOpen(true); }} className="btn" style={{ padding: '8px 20px', fontSize: '15px', background: 'var(--lime)', color: 'var(--ink)', borderRadius: '25px', border: '2px solid var(--lime)', fontWeight: 'bold' }}>Kayıt Ol</button>
              </>
            )}
          </div>
          <span className="counter" style={{ opacity: 0.8, fontSize: '17px', fontFamily: 'var(--font-pixel)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="now" style={{ color: 'var(--lime)', fontSize: '19px', fontWeight: 'bold' }}>{String(currentSlide + 1).padStart(2, '0')}</span> 
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>/ {String(totalSlides).padStart(2, '0')}</span>
          </span>
          <button className="menu-btn" onClick={() => setMenuOpen(true)} style={{ borderRadius: '12px', padding: '10px 22px', fontSize: '16px', fontWeight: 'bold', background: 'var(--orange)', color: '#000', border: 'none', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,102,51,0.3)' }}>MENU +</button>
        </div>
      </header>

      <div className="progress"><i style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}></i></div>

      <main className="deck">
        <div className="stage-bg" style={{ backgroundColor: bgColors[currentSlide], transition: 'background-color 0.6s ease' }}></div>

        {/* SLIDE 0 : ANA SAYFA */}
        <section className={`slide ${currentSlide === 0 ? 'active' : ''}`} style={cyberGridStyle}>
          <div className="inner" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
            
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50vw', height: '30vh', background: 'radial-gradient(ellipse at center, rgba(255,102,51,0.15) 0%, rgba(10,10,10,0) 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }}></div>

            <div className="wrap" style={{ textAlign: 'center', margin: 'auto', zIndex: 1, position: 'relative' }}>
              <span className="kicker" style={{ color: 'var(--lime)', letterSpacing: '4px', fontSize: '14px', textShadow: '0 0 10px rgba(168,255,120,0.5)' }}>AI STUDIO · 2026</span>
              
              <h1 style={{ fontSize: '5rem', fontFamily: 'var(--font-display)', fontWeight: '900', letterSpacing: '2px', margin: '15px 0', textShadow: '0 20px 40px rgba(0,0,0,0.8)' }}>
                <span style={{ color: '#ffffff', textShadow: '0 0 20px rgba(255,255,255,0.4)' }}>HYPER </span>
                <span style={{ color: 'var(--orange)', textShadow: '0 0 35px var(--orange)' }}>FACE </span>
                <span style={{ color: 'var(--lime)', textShadow: '0 0 35px var(--lime)' }}>SWAP</span>
              </h1>
              
              <p className="lead" style={{ margin: '0 auto 50px auto', textAlign: 'center', opacity: 0.7, color: '#e0e0e0', fontSize: '20px', letterSpacing: '1px' }}>
                Gelişmiş yüz değiştirme teknolojisi.
              </p>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '25px' }}>
                <button className="btn" onClick={() => goToSlide(1)} 
                  style={{ 
                    padding: '18px 40px', fontSize: '16px', borderRadius: '40px', 
                    background: 'var(--lime)', color: '#000', border: 'none', 
                    boxShadow: '0 10px 25px rgba(168,255,120,0.3)', fontWeight: 'bold', letterSpacing: '1px', transition: 'all 0.3s ease'
                  }}>
                  STÜDYOYA GİT 🚀
                </button>
                <button className="btn" onClick={() => goToSlide(2)} 
                  style={{ 
                    padding: '18px 40px', fontSize: '16px', background: 'transparent', 
                    border: '2px solid var(--orange)', color: 'var(--orange)', borderRadius: '40px', 
                    fontWeight: 'bold', letterSpacing: '1px', transition: 'all 0.3s ease',
                    boxShadow: '0 0 15px rgba(255,102,51,0.1)'
                  }}>
                  GEÇMİŞİM
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SLIDE 1 : STUDIO */}
        <section className={`slide ${currentSlide === 1 ? 'active' : ''}`} style={cyberGridStyle}>
          
          <div style={{ position: 'absolute', top: '10%', left: '15%', width: '400px', height: '400px', background: 'var(--orange)', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.15, pointerEvents: 'none' }}></div>
          <div style={{ position: 'absolute', bottom: '10%', right: '15%', width: '500px', height: '500px', background: 'var(--lime)', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.1, pointerEvents: 'none' }}></div>

          <div className="inner" style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '80px', paddingBottom: '100px', boxSizing: 'border-box', position: 'relative', zIndex: 10 }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '5px', marginBottom: '30px', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px' }}>⚡</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', letterSpacing: '2px', color: 'var(--orange)', textShadow: '0 0 10px rgba(255,102,51,0.4)' }}>DÖNÜŞÜM KONSEPTİNİ SEÇ</span>
                <span style={{ fontSize: '14px' }}>⚡</span>
              </div>

              <div style={{ 
                display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', width: '100%', maxWidth: '850px', 
                background: 'rgba(15, 15, 15, 0.85)', padding: '10px 15px', borderRadius: '50px', 
                backdropFilter: 'blur(15px)', border: '1px solid rgba(168,255,120,0.2)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1)' 
              }}>
                {[
                  { id: 'default', label: '✨ STANDART' }, 
                  { id: 'child', label: '👶 ÇOCUKLUK' }, 
                  { id: '1980', label: '🎸 1980\'LER' }, 
                  { id: '2050', label: '🚀 2050' }, 
                  { id: 'elderly', label: '👴 YAŞLILIK' }
                ].map(t => {
                  const isActive = theme === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => setTheme(t.id)} 
                      style={{ 
                        padding: '14px 26px', fontSize: '14px', borderRadius: '40px', fontFamily: 'var(--font-display)', letterSpacing: '1px',
                        background: isActive ? 'linear-gradient(135deg, var(--lime) 0%, #78ffd6 100%)' : 'rgba(255,255,255,0.03)', 
                        color: isActive ? '#000' : 'rgba(255,255,255,0.75)', 
                        border: isActive ? '1px solid var(--lime)' : '1px solid rgba(255,255,255,0.08)', 
                        cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
                        transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
                        boxShadow: isActive ? '0 8px 25px rgba(168,255,120,0.4), inset 0 1px 2px rgba(255,255,255,0.5)' : 'none', 
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="wrap" style={{ maxWidth: '850px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 25px', fontSize: '38px', fontFamily: 'var(--font-display)', color: '#fff', textShadow: '0 4px 20px rgba(0,0,0,0.4)', letterSpacing: '2px' }}>YÜZ DEĞİŞTİRME ALANI</h2>

              <div style={{ 
                background: 'rgba(20, 20, 20, 0.65)', 
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                borderRadius: '32px', border: '1px solid rgba(255,255,255,0.1)', 
                padding: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px',
                boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
                position: 'relative', overflow: 'hidden'
              }}>

                {results.length === 0 && !loading && (
                  <>
                    <div 
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      style={{ 
                        background: 'rgba(0,0,0,0.4)', border: '2px dashed rgba(168,255,120,0.4)', 
                        padding: '40px 20px', width: '100%', maxWidth: '600px', 
                        borderRadius: '20px', textAlign: 'center', color: '#fff', 
                        transition: 'all 0.3s ease', cursor: 'pointer', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)'
                      }}>
                      <div style={{ fontSize: '40px', marginBottom: '15px', opacity: 0.8 }}>📁</div>
                      <label style={{ fontFamily: 'var(--font-display)', fontSize: '18px', display: 'block', marginBottom: '15px', letterSpacing: '1px', pointerEvents: 'none' }}>FOTOĞRAFLARI SEÇ VEYA SÜRÜKLE</label>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        multiple 
                        accept="image/png, image/jpeg, image/webp" 
                        onChange={handleFileChange} 
                        style={{ display: 'none' }} 
                      />
                      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}>Dosyaları sürükleyip bırakabilir ya da alana tıklayarak seçebilirsiniz.</span>
                    </div>

                    <div style={{ width: '100%', maxWidth: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <label style={{ color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--font-display)', fontSize: '14px', letterSpacing: '1px' }}>KARIŞTIRMA MODU:</label>
                      <select value={swapMode} onChange={(e) => setSwapMode(e.target.value)} 
                        style={{ padding: '12px 24px', fontFamily: 'var(--font-body)', fontSize: '15px', background: '#111', color: '#fff', border: '1px solid rgba(168,255,120,0.3)', cursor: 'pointer', borderRadius: '12px', outline: 'none', flex: 1, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                        <option value="random">Rastgele Karıştır</option>
                        <option value="fixed">Sabitle</option>
                        <option value="similar">En Benzeyen</option>
                        <option value="different">En Farklı</option>
                        <option value="age">Yaşa Göre</option>
                        <option value="smile">Gülümseyenler</option>
                      </select>
                    </div>

                    {/* Kullanım Şartları ve Rıza Beyanı */}
                    <div style={{ width: '100%', maxWidth: '600px', background: 'rgba(255,102,51,0.05)', border: '1px solid rgba(255,102,51,0.2)', padding: '15px 20px', borderRadius: '16px', textAlign: 'left' }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', fontSize: '13px', color: 'rgba(255,255,255,0.85)', lineHeight: '1.5' }}>
                        <input 
                          type="checkbox" 
                          checked={consentChecked} 
                          onChange={(e) => setConsentChecked(e.target.checked)} 
                          style={{ marginTop: '3px', accentColor: 'var(--lime)', width: '16px', height: '16px', cursor: 'pointer' }} 
                        />
                        <span>
                          Sadece <b>kendi fotoğrafımı</b> veya yasal olarak yükleme iznine sahip olduğum kişilerin fotoğraflarını yüklediğimi; telif haklarını, KVKK ve kişilik haklarını ihlal etmeyeceğimi kabul ve beyan ederim.
                        </span>
                      </label>
                    </div>

                    <div style={{ width: '100%', maxWidth: '600px', marginTop: '10px' }}>
                      <form onSubmit={handleSubmit} style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                        <button type="submit" 
                          style={{ 
                            background: 'linear-gradient(135deg, #a8ff78 0%, #78ffd6 100%)', color: 'var(--ink)', 
                            border: 'none', borderRadius: '20px', cursor: 'pointer', 
                            padding: '20px 40px', fontSize: '18px', fontFamily: 'var(--font-display)', letterSpacing: '2px', width: '100%', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', 
                            boxShadow: '0 15px 35px rgba(168,255,120,0.3), inset 0 -3px 0 rgba(0,0,0,0.1)'
                          }}>
                          YÜZLERİ DEĞİŞTİR ✨
                        </button>
                      </form>
                    </div>
                  </>
                )}
                {loading && (
                  <div style={{ width: '100%', maxWidth: '600px', textAlign: 'center', color: '#fff', padding: '40px 0' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '18px', marginBottom: '20px', letterSpacing: '2px', color: 'var(--lime)' }}>{progressText}</p>
                    <div style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '20px', overflow: 'hidden', height: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #a8ff78, #78ffd6)', transition: 'width 0.3s ease', boxShadow: '0 0 20px rgba(168,255,120,0.8)' }}></div>
                    </div>
                  </div>
                )}
                {errorMsg && <div style={{ color: 'var(--pink)', background: 'rgba(255,0,0,0.2)', border: '1px solid var(--pink)', borderRadius: '12px', padding: '15px', fontFamily: 'var(--font-pixel)', fontSize: '14px', width: '100%', maxWidth: '600px', textAlign: 'center' }}>{errorMsg}</div>}
                
                {(results.length > 0 || (previews.length > 0 && results.length === 0 && !loading)) && (
                  <div ref={resultRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeIn 0.5s ease' }}>
                    {results.length > 0 ? (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                        
                        <div style={{ alignSelf: 'flex-end', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button onClick={handleReset} 
                            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '30px', cursor: 'pointer', padding: '10px 20px', fontFamily: 'var(--font-display)', fontSize: '12px', letterSpacing: '1px', transition: 'all 0.3s ease' }}>
                            ✕ KAPAT
                          </button>
                          
                          <button onClick={(e) => handleSubmit(e)} 
                            style={{ background: 'rgba(255,102,51,0.1)', color: 'var(--orange)', border: '1px solid var(--orange)', borderRadius: '30px', cursor: 'pointer', padding: '10px 20px', fontFamily: 'var(--font-display)', fontSize: '12px', letterSpacing: '1px', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🔄 YENİDEN OLUŞTUR
                          </button>
                          
                          <a href={`${API_BASE}${activeResultUrl}?dl=1`} download 
                            style={{ background: 'var(--lime)', color: '#000', border: 'none', borderRadius: '30px', cursor: 'pointer', padding: '10px 25px', fontFamily: 'var(--font-display)', fontSize: '12px', letterSpacing: '1px', textDecoration: 'none', fontWeight: 'bold', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 5px 15px rgba(168,255,120,0.3)' }}>
                            ⬇️ İNDİR
                          </a>
                        </div>
                        
                        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '15px', background: 'rgba(0,0,0,0.4)', width: '100%', maxWidth: '700px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
                          <div 
                            onMouseDown={() => setHoldingCard(true)} onMouseUp={() => setHoldingCard(false)} onMouseLeave={() => setHoldingCard(false)} onTouchStart={() => setHoldingCard(true)} onTouchEnd={() => setHoldingCard(false)}
                            style={{ position: 'relative', width: '100%', height: '500px', cursor: 'pointer', userSelect: 'none', borderRadius: '16px', overflow: 'hidden', background: '#050505', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <img src={holdingCard ? (previews[0] || '') : `${API_BASE}${activeResultUrl}`} alt="Result" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                            <span style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', borderRadius: '12px', color: holdingCard ? 'var(--orange)' : 'var(--lime)', padding: '8px 16px', fontFamily: 'var(--font-display)', fontSize: '12px', letterSpacing: '1px', border: `1px solid ${holdingCard ? 'var(--orange)' : 'var(--lime)'}`, boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
                              {holdingCard ? '📸 ORİJİNAL' : '✨ İŞLENMİŞ'}
                            </span>
                          </div>
                        </div>
                        {results.length > 1 && (
                          <div style={{ display: 'flex', gap: '25px', alignItems: 'center', marginTop: '10px', background: 'rgba(0,0,0,0.5)', padding: '10px 30px', borderRadius: '40px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <button type="button" onClick={handlePrev} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--lime)', cursor: 'pointer' }}>◀</button>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: '#fff', letterSpacing: '2px' }}>{currentIndex + 1} / {results.length}</span>
                            <button type="button" onClick={handleNext} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--lime)', cursor: 'pointer' }}>▶</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '30px', width: '100%' }}>
                        {previews.map((src, idx) => (
                          <div key={idx} style={{ padding: '5px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <img src={src} alt="Preview" style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '12px' }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* SLIDE 2 : HISTORY */}
        <section className={`slide ${currentSlide === 2 ? 'active' : ''}`} style={cyberGridStyle}>
          <div style={{ position: 'absolute', top: '30%', left: '30%', width: '600px', height: '600px', background: 'var(--lime)', borderRadius: '50%', filter: 'blur(200px)', opacity: 0.1, pointerEvents: 'none' }}></div>
          
          <div className="inner" style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '100px', paddingBottom: '100px', boxSizing: 'border-box', position: 'relative', zIndex: 10 }}>
            <div className="wrap" style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
              <span className="kicker" style={{ color: 'var(--lime)', letterSpacing: '2px', fontSize: '14px' }}>03 / Galeri</span>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 20px' }}>
                <h2 className="big" style={{ margin: 0, color: '#fff' }}>{user?.role === 'admin' || user?.scopes?.includes('admin:all_history') ? 'Tüm Kullanıcı Geçmişi' : 'Geçmiş Dönüşümlerin'}</h2>
                {user && history.length > 0 && (
                  <button onClick={deleteAllHistory} style={{ background: 'var(--pink)', color: 'var(--white)', border: 'none', padding: '10px 20px', borderRadius: '20px', fontFamily: 'var(--font-display)', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,102,153,0.4)', fontWeight: 'bold' }}>
                    🗑️ Tümünü Sil
                  </button>
                )}
              </div>
              
              {!user ? (
                <p className="lead" style={{ color: 'rgba(255,255,255,0.7)' }}>Geçmişi görmek için giriş yap.</p>
              ) : history.length === 0 ? (
                <p className="lead" style={{ color: 'rgba(255,255,255,0.7)' }}>Henüz kayıtlı dönüşüm yok.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '15px', width: '100%', marginBottom: '20px' }}>
                    {currentHistoryItems.map((item) => (
                      <div className="result-card" key={item._id} style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(20,20,20,0.6)', backdropFilter: 'blur(10px)', padding: '10px', borderRadius: '16px' }}>
                        <div style={{ position: 'relative', width: '100%', height: '220px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden', background: '#000' }}>
                          <img src={`${API_BASE}${item.image_url}`} alt="History" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                          <a href={`${API_BASE}${item.image_url}?dl=1`} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '6px', background: 'rgba(168,255,120,0.1)', border: '1px solid var(--lime)', color: 'var(--lime)', borderRadius: '8px' }}>İndir</a>
                          <button onClick={() => copyImage(item.image_url)} className="btn" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px', padding: '6px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}>Kopyala</button>
                          <button onClick={() => deleteHistoryItem(item.image_url)} className="btn" style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid var(--pink)', color: 'var(--pink)', fontSize: '12px', padding: '6px', borderRadius: '8px' }}>Sil</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalHistoryPages > 1 && (
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '10px', background: 'rgba(20,20,20,0.8)', padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={safeHistoryPage === 1} className="btn" style={{ background: 'transparent', color: 'var(--lime)', border: '1px solid var(--lime)', padding: '8px 16px', fontSize: '14px', opacity: safeHistoryPage === 1 ? 0.4 : 1, cursor: safeHistoryPage === 1 ? 'not-allowed' : 'pointer' }}>◀ Önceki</button>
                      <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '15px', color: '#fff', fontWeight: 'bold' }}>Sayfa {safeHistoryPage} / {totalHistoryPages}</span>
                      <button onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))} disabled={safeHistoryPage === totalHistoryPages} className="btn" style={{ background: 'transparent', color: 'var(--lime)', border: '1px solid var(--lime)', padding: '8px 16px', fontSize: '14px', opacity: safeHistoryPage === totalHistoryPages ? 0.4 : 1, cursor: safeHistoryPage === totalHistoryPages ? 'not-allowed' : 'pointer' }}>Sonraki ▶</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* SLIDE 3 : İLETİŞİM */}
        <section className={`slide ${currentSlide === 3 ? 'active' : ''}`} style={cyberGridStyle}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '500px', height: '500px', background: 'var(--orange)', borderRadius: '50%', filter: 'blur(200px)', opacity: 0.1, pointerEvents: 'none' }}></div>
          
          <div className="inner" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', padding: '40px', position: 'relative', zIndex: 10 }}>
            <div style={{ 
              background: 'rgba(20, 20, 20, 0.65)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', 
              borderRadius: '32px', border: '1px solid rgba(255,255,255,0.1)', 
              padding: '50px', width: '100%', maxWidth: '600px', 
              boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)', textAlign: 'center'
            }}>
              <span className="kicker" style={{ color: 'var(--lime)', letterSpacing: '2px', fontSize: '14px' }}>04 / BİZE ULAŞIN</span>
              <h2 style={{ fontSize: '36px', fontFamily: 'var(--font-display)', color: '#fff', margin: '15px 0 30px 0', letterSpacing: '1px' }}>İLETİŞİM</h2>
              
              <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '30px' }}>
                <input type="text" placeholder="Adınız Soyadınız" value={contactName} onChange={(e) => setContactName(e.target.value)}
                  style={{ padding: '15px', borderRadius: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'var(--font-body)', outline: 'none' }} />
                
                <input type="email" placeholder="E-Posta Adresiniz" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                  style={{ padding: '15px', borderRadius: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'var(--font-body)', outline: 'none' }} />
                
                <textarea placeholder="Mesajınız..." rows="4" value={contactMessage} onChange={(e) => setContactMessage(e.target.value)}
                  style={{ padding: '15px', borderRadius: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical' }}></textarea>
                
                <button type="submit" style={{ 
                  background: 'var(--orange)', color: '#000', padding: '16px', borderRadius: '12px', border: 'none', 
                  fontFamily: 'var(--font-display)', fontSize: '16px', letterSpacing: '1px', cursor: 'pointer', 
                  boxShadow: '0 5px 15px rgba(255,102,51,0.3)', fontWeight: 'bold' 
                }}>
                  MESAJI GÖNDER 🚀
                </button>
              </form>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-display)', fontSize: '14px', marginBottom: '10px' }}>BİZİ TAKİP EDİN</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                  <a href="https://instagram.com/nejlacodes" target="_blank" rel="noreferrer" style={{ color: 'var(--lime)', textDecoration: 'none', fontSize: '16px', fontFamily: 'var(--font-pixel)' }}>@nejlacodes</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SLIDE 4 : ADMIN PANEL */}
        <section className={`slide ${currentSlide === 4 ? 'active' : ''}`} style={cyberGridStyle}>
          <div className="inner" style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '100px', paddingBottom: '100px', boxSizing: 'border-box', position: 'relative', zIndex: 10 }}>
            <div className="wrap" style={{ maxWidth: '800px', width: '100%', margin: '0 auto' }}>
              <span className="kicker" style={{ color: 'var(--lime)', letterSpacing: '2px', fontSize: '14px' }}>05 / Panel</span>
              <h2 className="big" style={{ margin: '6px 0 16px', color: '#fff' }}>Kullanıcı Yönetimi</h2>
              {!user || (user.role !== 'admin' && !user.scopes?.includes('admin:manage_users')) ? (
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,0,0,0.1)', padding: '12px', fontFamily: 'var(--font-pixel)', fontSize: '17px', color: 'var(--pink)' }}>🚫 Yetkiniz yok.</div>
              ) : (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <input type="text" placeholder="Kullanıcı Ara..." value={adminSearchInput} onChange={(e) => setAdminSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearchAdmin(); }} style={{ flex: 1, padding: '10px 15px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', outline: 'none' }} />
                    <button onClick={handleSearchAdmin} className="btn" style={{ background: 'var(--lime)', color: '#000', padding: '8px 20px', borderRadius: '8px', border: 'none', fontWeight: 'bold' }}>Ara</button>
                  </div>
                  <div style={{ display: 'grid', gap: '15px' }}>
                    {usersList.map((u) => (
                      <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.1)', padding: '20px', background: 'rgba(20,20,20,0.6)', backdropFilter: 'blur(10px)', borderRadius: '16px' }}>
                        <div>
                          <h4 style={{ margin: '0 0 5px 0', color: '#fff', fontSize: '18px' }}>{u.username} <span style={{fontSize:'12px', color: u.role==='admin' ? 'var(--orange)' : 'var(--lime)'}}>({u.role})</span></h4>
                          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>E-Posta: {u.email}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button onClick={() => changeUserRole(u.id, u.role)} className="btn" style={{ background: 'transparent', border: '1px solid var(--lime)', color: 'var(--lime)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px' }}>{u.role === 'admin' ? 'User Yap' : 'Admin Yap'}</button>
                          <button onClick={() => revokeUserSessions(u.id)} className="btn" style={{ background: 'transparent', border: '1px solid var(--orange)', color: 'var(--orange)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px' }}>Oturum Kapat</button>
                          <button onClick={() => deleteUserAccount(u.id)} className="btn" style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid var(--pink)', color: 'var(--pink)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px' }}>Sil</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="footerbar" style={{ background: 'transparent', borderTop: 'none', pointerEvents: 'none', display: 'flex', justifyContent: 'flex-end', paddingRight: '30px', paddingBottom: '20px' }}>
        <div className="nav-pills" style={{ pointerEvents: 'auto' }}>
          <button className="pill" onClick={() => goToSlide(currentSlide - 1)} disabled={currentSlide === 0} style={{ boxShadow: '0 4px 15px rgba(0,0,0,0.6)', background: '#111', border: '1px solid rgba(255,255,255,0.1)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{width:'23px', height:'23px', color: 'var(--white)'}}><path d="M15 5l-7 7 7 7"/></svg></button>
          <button className="pill" onClick={() => goToSlide(currentSlide + 1)} disabled={currentSlide === totalSlides - 1} style={{ boxShadow: '0 4px 15px rgba(0,0,0,0.6)', background: '#111', border: '1px solid rgba(255,255,255,0.1)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{width:'23px', height:'23px', color: 'var(--white)'}}><path d="M9 5l7 7-7 7"/></svg></button>
        </div>
      </footer>

      {/* YANDAN AÇILIR MENÜ */}
      <div className="nav-pop" style={{ transform: menuOpen ? 'none' : 'translateY(-100%)' }}>
        <div className="nav-head">
          <span className="mark">HYPER <b>FACE</b> SWAP</span>
          <button className="x" onClick={() => setMenuOpen(false)}>CLOSE ✕</button>
        </div>
        <ul className="nav-list">
          <li><a href="#" onClick={(e) => { e.preventDefault(); goToSlide(0); }}><span>01</span> Ana Sayfa</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); goToSlide(1); }}><span>02</span> Stüdyo & Yüz Değiştir</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); goToSlide(2); }}><span>03</span> Geçmiş Galeri</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); goToSlide(3); }}><span>04</span> İletişim</a></li>
          {(user?.role === 'admin' || user?.scopes?.includes('admin:manage_users')) && (
            <li><a href="#" onClick={(e) => { e.preventDefault(); goToSlide(4); }}><span>05</span> Admin Panel</a></li>
          )}
        </ul>
      </div>

      {/* AUTH MODAL */}
      {authModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: 'rgba(15,15,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', padding: '40px', width: '100%', maxWidth: '420px', position: 'relative', borderRadius: '30px', boxShadow: '0 30px 60px rgba(0,0,0,0.6)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--lime)', marginBottom: '25px', fontSize: '28px', textAlign: 'center', letterSpacing: '1px' }}>
              {authMode === 'login' && 'GİRİŞ YAP'}
              {authMode === 'register' && 'KAYIT OL'}
              {authMode === 'forgot' && 'ŞİFREMİ UNUTTUM'}
              {authMode === 'reset' && 'YENİ ŞİFRE'}
            </h2>
            
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {authMode === 'register' && (
                <input type="text" placeholder="Kullanıcı Adı" value={username} onChange={(e) => setUsername(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAuthSubmit(e); }}
                  style={{ width: '100%', padding: '15px', background: 'rgba(0,0,0,0.5)', color: 'var(--white)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', outline: 'none' }} />
              )}
              
              {(authMode === 'login' || authMode === 'register' || authMode === 'forgot') && (
                <input type="text" placeholder="E-Posta" value={email} onChange={(e) => setEmail(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAuthSubmit(e); }}
                  style={{ width: '100%', padding: '15px', background: 'rgba(0,0,0,0.5)', color: 'var(--white)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', outline: 'none' }} />
              )}
              
              {(authMode === 'login' || authMode === 'register') && (
                <input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAuthSubmit(e); }}
                  style={{ width: '100%', padding: '15px', background: 'rgba(0,0,0,0.5)', color: 'var(--white)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', outline: 'none' }} />
              )}
              
              {authMode === 'reset' && (
                <input type="password" placeholder="Yeni Şifre" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAuthSubmit(e); }}
                  style={{ width: '100%', padding: '15px', background: 'rgba(0,0,0,0.5)', color: 'var(--white)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', outline: 'none' }} />
              )}
              
              <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #a8ff78 0%, #78ffd6 100%)', color: 'var(--ink)', padding: '15px', marginTop: '10px', borderRadius: '15px', border: 'none', fontFamily: 'var(--font-display)', fontSize: '16px', letterSpacing: '1px', boxShadow: '0 10px 20px rgba(168,255,120,0.2)', cursor: 'pointer' }}>TAMAMLA</button>
            </form>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', fontFamily: 'var(--font-pixel)', fontSize: '12px', opacity: 0.8 }}>
              {authMode === 'login' ? (
                <>
                  <button type="button" onClick={() => handleSwitchMode('forgot')} style={{ background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer' }}>Şifremi Unuttum?</button>
                  <button type="button" onClick={() => handleSwitchMode('register')} style={{ background: 'none', border: 'none', color: 'var(--lime)', cursor: 'pointer' }}>Kayıt Ol</button>
                </>
              ) : (
                <button type="button" onClick={() => handleSwitchMode('login')} style={{ background: 'none', border: 'none', color: 'var(--lime)', cursor: 'pointer', width: '100%', textAlign: 'center' }}>Giriş Ekranına Dön</button>
              )}
            </div>
            <button onClick={() => setAuthModalOpen(false)} style={{ position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '24px', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
