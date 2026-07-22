import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE = 'http://localhost:7860';

function App() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const totalSlides = 4;
  const bgColors = ['var(--ink)', 'var(--orange)', 'var(--lime)', 'var(--pink)'];

  // Auth States
  const [user, setUser] = useState(null); 
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [sessionWarning, setSessionWarning] = useState(false);

  // Form & Process States
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [swapMode, setSwapMode] = useState('random');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const [results, setResults] = useState([]);
  
  // History & Admin States
  const [history, setHistory] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSearchInput, setAdminSearchInput] = useState('');

  const [holdingCard, setHoldingCard] = useState(null);

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
      } catch (e) {
        console.error(e);
      }
    };

    const interval = setInterval(checkTokenExpiry, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const silentRefresh = async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        setUser(null);
        return;
      }

      const res = await fetch(`${API_BASE}/refresh`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }) 
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setSessionWarning(false);
      } else {
        setUser(null);
      }
    } catch (e) {
      setUser(null);
    }
  };

  useEffect(() => {
    if (user) {
      if (currentSlide === 2) fetchHistory();
      if (currentSlide === 3 && (user.role === 'admin' || user.scopes?.includes('admin:manage_users'))) fetchAdminUsers(adminPage, adminSearch);
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
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
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
      } else {
        setUser(null);
      }
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
    } catch (err) {
      setUser(null);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/history`, { method: 'GET' });
      const data = await res.json();
      if (res.ok && data.success) {
        setHistory(data.history);
      }
    } catch (err) {
      console.error("Geçmiş çekilemedi", err);
    }
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
    } catch (err) {
      console.error("Kullanıcılar çekilemedi", err);
    }
  };

  const handleSearchAdmin = () => {
    setAdminSearch(adminSearchInput);
    setAdminPage(1);
  };

  const changeUserRole = async (targetId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Bu kullanıcının yetkisini "${newRole.toUpperCase()}" olarak değiştirmek istiyor musunuz?`)) return;
    
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/users/${targetId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsersList(prev => prev.map(u => u.id === targetId ? { ...u, role: newRole } : u));
      } else {
        alert(data.error || 'Yetki değiştirilemedi!');
      }
    } catch (err) {
      alert('Sunucu hatası.');
    }
  };

  const revokeUserSessions = async (targetId) => {
    if (!window.confirm("Bu kullanıcının aktif tüm cihazlardaki oturumlarını sonlandırmak istediğinize emin misiniz?")) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/users/${targetId}/revoke-sessions`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("Kullanıcının tüm oturumları başarıyla düşürüldü.");
      } else {
        alert(data.error || 'İşlem başarısız.');
      }
    } catch (e) {
      alert('Sunucu hatası.');
    }
  };

  const deleteUserAccount = async (targetId) => {
    if (!window.confirm("DİKKAT: Bu kullanıcıyı kalıcı olarak silmek istediğinize emin misiniz?")) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/users/${targetId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsersList(prev => prev.filter(u => u.id !== targetId));
      } else {
        alert(data.error || 'Silinemedi!');
      }
    } catch (err) {
      alert('Sunucu hatası.');
    }
  };

  const goToSlide = (index) => {
    setCurrentSlide(Math.max(0, Math.min(totalSlides - 1, index)));
    setMenuOpen(false);
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setResults([]);
    const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviews(newPreviews);
  };

  const copyImage = async (url) => {
    try {
      const fullUrl = `${API_BASE}${url}`;
      await navigator.clipboard.writeText(fullUrl);
      alert("Görsel bağlantısı panoya kopyalandı! 📋\n" + fullUrl);
    } catch (err) {
      alert("Kopyalanamadı.");
    }
  };

  const deleteHistoryItem = async (imageUrl) => {
    if (!window.confirm("Bu fotoğrafı geçmişten silmek istediğine emin misin?")) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/delete-history`, {
        method: 'POST',
        body: JSON.stringify({ image_url: imageUrl })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHistory(prev => prev.filter(item => item.image_url !== imageUrl));
      } else {
        alert(data.error || 'Silinemedi!');
      }
    } catch (err) {
      alert('Sunucu bağlantı hatası.');
    }
  };

  // Mod değiştirme ve Input temizleme
  const handleSwitchMode = (newMode) => {
    setAuthMode(newMode);
    setEmail('');
    setPassword('');
    setUsername('');
    setNewPassword('');
  };

  const handleAuthSubmit = async (e) => {
    if (e) e.preventDefault();
    
    if (authMode === 'register' && !username.trim()) { alert("Lütfen kullanıcı adını girin."); return; }
    if ((authMode === 'login' || authMode === 'register' || authMode === 'forgot') && !email.trim()) { alert("Lütfen e-posta adresinizi girin."); return; }
    if ((authMode === 'login' || authMode === 'register') && !password.trim()) { alert("Lütfen şifrenizi girin."); return; }
    if (authMode === 'reset' && !newPassword.trim()) { alert("Lütfen yeni şifrenizi girin."); return; }

    if (authMode === 'forgot') {
      try {
        const response = await fetch(`${API_BASE}/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          alert(data.message);
          handleSwitchMode('login');
        } else {
          alert(data.error || 'Bir hata oluştu!');
        }
      } catch (err) {
        alert('Sunucu bağlantı hatası.');
      }
      return;
    }

    if (authMode === 'reset') {
      try {
        const response = await fetch(`${API_BASE}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, new_password: newPassword })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          alert(data.message);
          handleSwitchMode('login');
          setAuthModalOpen(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          alert(data.error || 'Sıfırlama başarısız!');
        }
      } catch (err) {
        alert('Sunucu bağlantı hatası.');
      }
      return;
    }

    const endpoint = authMode === 'login' ? '/login' : '/register';
    const formData = new URLSearchParams();
    formData.append('email', email);
    formData.append('password', password);
    if (authMode === 'register') formData.append('username', username);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
      const data = await response.json();
      if (response.ok && data.success) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setAuthModalOpen(false);
        setUser({ username: data.username, role: data.role || 'user', scopes: data.scopes });
      } else {
        alert(data.error || 'Bir hata oluştu!');
      }
    } catch (err) {
      alert('Sunucu bağlantı hatası oluştu.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetchWithAuth(`${API_BASE}/logout`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      setUser(null);
      setHistory([]);
      setResults([]);
      setPreviews([]);
      setUsersList([]);
      goToSlide(0); 
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return; 
    if (files.length === 0) {
      alert("Lütfen en az bir dosya seçin!");
      return;
    }

    const formData = new FormData();
    files.forEach(file => formData.append('file', file));
    formData.append('swap_mode', swapMode);

    setLoading(true);
    setErrorMsg('');
    setProgress(20);
    setProgressText('Yüzler analiz ediliyor... %20');

    const timer = setTimeout(() => {
      setProgress(70);
      setProgressText('Yapay zeka işliyor... %70');
    }, 800);

    try {
      const response = await fetchWithAuth(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      clearTimeout(timer);

      if (response.ok && data.success) {
        setProgress(100);
        setProgressText('İşlem Başarılı! %100');
        setTimeout(() => {
          setResults(prev => [...data.results, ...prev]);
          setLoading(false);
        }, 400);
      } else {
        setLoading(false);
        setErrorMsg(data.error || "İşlem reddedildi.");
      }
    } catch (err) {
      clearTimeout(timer);
      setLoading(false);
      setErrorMsg('Sunucu hatası veya oturumunuz koptu.');
    }
  };

  const handleRefreshResult = async () => {
    if (files.length === 0) return;
    const formData = new FormData();
    files.forEach(file => formData.append('file', file));
    formData.append('swap_mode', 'random');

    setLoading(true);
    setProgress(30);
    setProgressText('Yüzler yeniden karıştırılıyor... %30');

    try {
      const response = await fetchWithAuth(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setProgress(100);
        setProgressText('Yenilendi! %100');
        setTimeout(() => {
          setResults(prev => [...data.results, ...prev]);
          setLoading(false);
        }, 400);
      } else {
        setLoading(false);
        alert(data.error || "Yenilenemedi.");
      }
    } catch (err) {
      setLoading(false);
      alert('Sunucu hatası.');
    }
  };

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      
      {sessionWarning && (
        <div style={{ position: 'fixed', top: '60px', left: 0, right: 0, background: 'var(--orange)', color: 'var(--ink)', zIndex: 100, textAlign: 'center', fontFamily: 'var(--font-pixel)', fontSize: '18px', padding: '6px' }}>
          ⚠️ Oturumunuzun süresi birazdan dolacak. <button onClick={silentRefresh} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Hemen Yenile</button>
        </div>
      )}

      <header className="topbar">
        <a className="mark" onClick={() => goToSlide(0)} style={{cursor:'pointer'}}>HYPR<b>LUV</b><span className="dot"></span></a>
        <div className="topright">
          <div style={{ fontFamily: 'var(--font-pixel)', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {user ? (
              <>
                <span>
                  Hoş geldin, <b style={{color:'var(--lime)'}}>{user.username}</b>
                  {user.role === 'admin' && <span style={{ marginLeft: '8px', fontSize: '12px', background: 'var(--orange)', color: 'var(--white)', padding: '2px 6px', borderRadius: '4px' }}>ADMIN</span>}
                </span>
                <button onClick={handleLogout} style={{ color: 'var(--orange)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Çıkış</button>
              </>
            ) : (
              <>
                <button onClick={() => { handleSwitchMode('login'); setAuthModalOpen(true); }} className="btn" style={{ padding: '4px 10px', fontSize: '14px', background: 'var(--lime)' }}>Giriş Yap</button>
                <button onClick={() => { handleSwitchMode('register'); setAuthModalOpen(true); }} className="btn" style={{ padding: '4px 10px', fontSize: '14px', background: 'var(--orange)' }}>Kayıt Ol</button>
              </>
            )}
          </div>
          <span className="counter"><span className="now">{String(currentSlide + 1).padStart(2, '0')}</span> / {String(totalSlides).padStart(2, '0')}</span>
          <button className="menu-btn" onClick={() => setMenuOpen(true)}>MENU +</button>
        </div>
      </header>

      <div className="progress"><i style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}></i></div>

      <main className="deck">
        <div className="stage-bg" style={{ backgroundColor: bgColors[currentSlide] }}></div>

        {/* SLIDE 1 : COVER */}
        <section className={`slide s-ink ${currentSlide === 0 ? 'active' : ''}`}>
          <div className="inner">
            <div className="wrap" style={{ textAlign: 'center', margin: 'auto' }}>
              <span className="kicker hl-lime" style={{ color: 'var(--lime)' }}>AI Studio · 2026</span>
              <h1 className="huge" style={{ margin: '20px 0' }}>HYPR<span style={{ color: 'var(--orange)' }}>LUV</span> SWAP</h1>
              <p className="lead" style={{ margin: '0 auto 30px auto', textAlign: 'center' }}>
                Yüksek performanslı hiperpop estetiğinde çoklu yüz değiştirme stüdyosu. Kompakt Basılı Tut & Gör deneyimi.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                <button className="btn" onClick={() => goToSlide(1)}>Stüdyoya Git 🚀</button>
                <button className="btn" onClick={() => goToSlide(2)} style={{ background: 'var(--orange)' }}>Geçmişim</button>
              </div>
            </div>
          </div>
        </section>

        {/* SLIDE 2 : STUDIO */}
        <section className={`slide s-orange ${currentSlide === 1 ? 'active' : ''}`}>
          <div className="inner" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 100px)', paddingBottom: '50px' }}>
            <div className="wrap" style={{ maxWidth: '850px', margin: '0 auto' }}>
              <span className="kicker">02 / Stüdyo</span>
              <h2 className="big" style={{ margin: '4px 0 12px', textAlign: 'center' }}>YÜZ DEĞİŞTİRME ALANI</h2>

              {!user && (
                <div style={{ border: '3px solid var(--ink)', background: 'rgba(0,0,0,0.1)', padding: '12px', marginBottom: '12px', fontFamily: 'var(--font-pixel)', fontSize: '17px', color: 'var(--ink)' }}>
                  ⚠️ İşlem yapmak ve sonuçları kaydetmek için lütfen sağ üstten <span style={{ color: 'var(--white)' }}>Giriş Yapın</span> veya <span style={{ color: 'var(--lime)' }}>Kayıt Olun</span>.
                </div>
              )}

              <div className="upload-box" style={{ borderColor: 'var(--ink)', padding: '25px', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <form onSubmit={handleSubmit} style={{ textAlign: 'center' }}>
                  
                  <input type="file" multiple accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} style={{ marginBottom: '12px', color: 'var(--ink)' }} disabled={!user} /><br />
                  
                  <div style={{ margin: '10px 0', fontFamily: 'var(--font-pixel)', fontSize: '18px', display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center', color: 'var(--ink)' }}>
                    <label><input type="radio" name="swap_mode" value="random" checked={swapMode === 'random'} onChange={() => setSwapMode('random')} disabled={!user} /> Rastgele Havuz Karıştır</label>
                    <label><input type="radio" name="swap_mode" value="fixed" checked={swapMode === 'fixed'} onChange={() => setSwapMode('fixed')} disabled={!user} /> Bir Yüzü Sabitle</label>
                  </div>

                  {results.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', margin: '20px 0' }}>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '650px', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '16px', color: 'var(--ink)' }}>✨ Sonuç (Basılı Tut & Gör)</span>
                        <button onClick={handleRefreshResult} type="button" disabled={loading} className="btn" style={{ background: 'var(--lime)', color: 'var(--ink)', fontSize: '14px', padding: '8px 16px', border: '3px solid var(--ink)' }}>
                          🔄 Tekrar Karıştır (Refresh)
                        </button>
                      </div>

                      {results.map((url, index) => {
                        const cardKey = 'studio-' + index;
                        const originalSrc = previews[0] || '';
                        const isHolding = holdingCard === cardKey;
                        return (
                          <div key={index} style={{ border: '3px solid var(--ink)', padding: '12px', background: 'rgba(255,255,255,0.2)', width: '100%', maxWidth: '650px' }}>
                            <div 
                              onMouseDown={() => setHoldingCard(cardKey)}
                              onMouseUp={() => setHoldingCard(null)}
                              onMouseLeave={() => setHoldingCard(null)}
                              onTouchStart={() => setHoldingCard(cardKey)}
                              onTouchEnd={() => setHoldingCard(null)}
                              style={{ position: 'relative', width: '100%', height: '380px', cursor: 'pointer', userSelect: 'none', border: '2px solid var(--ink)', overflow: 'hidden', background: '#000' }}
                            >
                              <img 
                                src={isHolding ? originalSrc : `${API_BASE}${url}`} 
                                alt="Result" 
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                              />
                              <span style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'var(--ink)', color: isHolding ? 'var(--orange)' : 'var(--lime)', padding: '4px 10px', fontFamily: 'var(--font-pixel)', fontSize: '13px', border: '2px solid var(--white)' }}>
                                {isHolding ? '📸 ORİJİNAL' : '✨ DEĞİŞMİŞ (Basılı Tut)'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                              <a href={`${API_BASE}${url}?dl=1`} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '13px', padding: '8px', background: 'var(--ink)', color: 'var(--lime)' }}>İndir</a>
                              <button type="button" onClick={() => copyImage(url)} className="btn" style={{ background: 'var(--bone)', color: 'var(--ink)', fontSize: '13px', padding: '8px' }}>Kopyala</button>
                            </div>
                          </div>
                        );
                      })}
                      
                    </div>
                  ) : (
                    <div className="preview-grid" style={{ justifyContent: 'center', display: 'flex', gap: '10px', margin: '20px 0' }}>
                      {previews.map((src, idx) => (
                        <img key={idx} src={src} alt="Preview" className="preview-thumb" style={{ borderColor: 'var(--ink)', width: '90px', height: '90px', objectFit: 'cover' }} />
                      ))}
                    </div>
                  )}

                  {loading && (
                    <div style={{ width: '100%', margin: '20px 0', textAlign: 'center', color: 'var(--ink)' }}>
                      <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '18px', marginBottom: '6px' }}>{progressText}</p>
                      <div style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.1)', border: '2px solid var(--ink)', borderRadius: '4px', overflow: 'hidden', height: '22px' }}>
                        <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'var(--ink)', transition: 'width 0.4s ease' }}></div>
                      </div>
                    </div>
                  )}

                  {errorMsg && <div style={{ color: 'var(--white)', background: 'var(--ink)', padding: '10px', fontFamily: 'var(--font-pixel)', fontSize: '18px', marginTop: '10px' }}>{errorMsg}</div>}

                  <button className="btn" type="submit" disabled={!user || loading} style={{ marginTop: '15px', background: 'var(--ink)', color: 'var(--white)', border: '3px solid var(--white)', opacity: (!user || loading) ? 0.4 : 1, cursor: (!user || loading) ? 'not-allowed' : 'pointer', padding: '10px 20px' }}>
                    {loading ? 'İşleniyor...' : (results.length > 0 ? 'Farklı Fotoğraflarla Yüz Değiştir 🚀' : 'Yüzleri Değiştir 🚀')}
                  </button>
                </form>
              </div>

            </div>
          </div>
        </section>

        {/* SLIDE 3 : HISTORY */}
        <section className={`slide s-lime ${currentSlide === 2 ? 'active' : ''}`}>
          <div className="inner">
            <div className="wrap">
              <span className="kicker">03 / Galeri</span>
              <h2 className="big" style={{ margin: '6px 0 16px' }}>
                {user?.role === 'admin' || user?.scopes?.includes('admin:all_history') ? 'Tüm Kullanıcı Geçmişi (Admin)' : 'Geçmiş Dönüşümlerin'}
              </h2>
              
              {!user ? (
                <p className="lead">Geçmişini görmek ve yönetmek için lütfen giriş yap.</p>
              ) : history.length === 0 ? (
                <p className="lead">Henüz geçmişinde kayıtlı bir dönüşüm bulunmuyor. Stüdyo sekmesinden hemen ilk yüz değiştirmeni yap!</p>
              ) : (
                <div className="results-grid">
                  {history.map((item, index) => {
                    const cardKey = 'history-' + index;
                    const originalSrc = `${API_BASE}${item.original_url || item.image_url}`;
                    const swappedSrc = `${API_BASE}${item.image_url}`;
                    const isHolding = holdingCard === cardKey;

                    return (
                      <div className="result-card" key={item._id} style={{ borderColor: 'var(--ink)' }}>
                        <div 
                          onMouseDown={() => setHoldingCard(cardKey)}
                          onMouseUp={() => setHoldingCard(null)}
                          onMouseLeave={() => setHoldingCard(null)}
                          onTouchStart={() => setHoldingCard(cardKey)}
                          onTouchEnd={() => setHoldingCard(null)}
                          style={{ position: 'relative', width: '1000px', maxWidth: '100%', height: '220px', cursor: 'pointer', userSelect: 'none', border: '3px solid var(--ink)', overflow: 'hidden', background: '#000' }}
                        >
                          <img 
                            src={isHolding ? originalSrc : swappedSrc} 
                            alt="History Result" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                          />
                          <span style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'var(--ink)', color: isHolding ? 'var(--orange)' : 'var(--lime)', padding: '3px 8px', fontFamily: 'var(--font-pixel)', fontSize: '12px', border: '2px solid var(--white)' }}>
                            {isHolding ? '📸 ORİJİNAL' : '✨ DEĞİŞMİŞ (Basılı Tut)'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                          <a href={`${API_BASE}${item.image_url}?dl=1`} className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '6px', background: 'var(--ink)', color: 'var(--lime)' }}>İndir</a>
                          <button onClick={() => copyImage(item.image_url)} className="btn" style={{ background: 'var(--bone)', color: 'var(--ink)', fontSize: '12px', padding: '6px' }}>Kopyala</button>
                          <button onClick={() => deleteHistoryItem(item.image_url)} className="btn" style={{ background: 'var(--pink)', color: 'var(--white)', fontSize: '12px', padding: '6px' }}>Sil</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* SLIDE 4 : ADMIN PANEL */}
        <section className={`slide ${currentSlide === 3 ? 'active' : ''}`} style={{ color: 'var(--ink)' }}>
          <div className="inner">
            <div className="wrap">
              <span className="kicker">04 / Panel</span>
              <h2 className="big" style={{ margin: '6px 0 16px' }}>Kullanıcı Yönetimi & İzin Kapsamları</h2>
              
              {!user || (user.role !== 'admin' && !user.scopes?.includes('admin:manage_users')) ? (
                <div style={{ border: '3px solid var(--ink)', background: 'rgba(0,0,0,0.1)', padding: '12px', fontFamily: 'var(--font-pixel)', fontSize: '17px' }}>
                  🚫 Bu sayfayı görüntülemek için yeterli izin kapsamına (Scope) sahip olmalısınız.
                </div>
              ) : (
                <div style={{ marginTop: '20px' }}>
                  
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <input 
                      type="text" 
                      placeholder="Kullanıcı Adı veya E-Posta Ara..." 
                      value={adminSearchInput}
                      onChange={(e) => setAdminSearchInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSearchAdmin(); }}
                      style={{ flex: 1, padding: '10px', background: 'rgba(0,0,0,0.05)', color: 'var(--ink)', border: '2px solid var(--ink)', fontFamily: 'var(--font-body)', fontSize: '16px' }}
                    />
                    <button onClick={handleSearchAdmin} className="btn" style={{ background: 'var(--ink)', color: 'var(--white)', padding: '8px 20px' }}>Ara</button>
                  </div>

                  <div style={{ display: 'grid', gap: '15px' }}>
                    {usersList.map((u) => (
                      <div key={u.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', border: '3px solid var(--ink)', padding: '15px', background: 'rgba(255,255,255,0.1)' }}>
                        <div>
                          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', margin: '0 0 5px 0' }}>{u.username}</h4>
                          <p style={{ margin: 0, fontFamily: 'var(--font-pixel)', fontSize: '18px' }}>E-Posta: {u.email}</p>
                          <p style={{ margin: 0, fontFamily: 'var(--font-pixel)', fontSize: '18px' }}>
                            Rol: <span style={{ color: u.role === 'admin' ? 'var(--white)' : 'var(--ink)', background: u.role === 'admin' ? 'var(--ink)' : 'transparent', padding: '2px 5px' }}>{u.role.toUpperCase()}</span>
                          </p>
                          <p style={{ margin: '4px 0 0 0', fontFamily: 'var(--font-pixel)', fontSize: '14px', color: 'rgba(0,0,0,0.7)' }}>
                            Scopes: {u.scopes ? u.scopes.join(', ') : 'Yok'}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                          <button onClick={() => changeUserRole(u.id, u.role)} className="btn" style={{ background: 'var(--lime)', padding: '8px 10px', fontSize: '13px' }}>
                            {u.role === 'admin' ? 'User Yap' : 'Admin Yap'}
                          </button>
                          <button onClick={() => revokeUserSessions(u.id)} className="btn" style={{ background: 'var(--orange)', color: 'var(--ink)', padding: '8px 10px', fontSize: '13px' }}>
                            Oturumları Kapat
                          </button>
                          <button onClick={() => deleteUserAccount(u.id)} className="btn" style={{ background: 'var(--pink)', color: 'var(--white)', padding: '8px 10px', fontSize: '13px' }}>
                            Sil
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {usersList.length === 0 && (
                      <div style={{ textAlign: 'center', fontFamily: 'var(--font-pixel)', fontSize: '18px', marginTop: '20px' }}>
                        Sonuç bulunamadı.
                      </div>
                    )}
                  </div>

                  {usersList.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '25px', padding: '15px 0', borderTop: '2px solid rgba(0,0,0,0.1)' }}>
                      <button 
                        disabled={adminPage <= 1} 
                        onClick={() => setAdminPage(prev => prev - 1)}
                        className="btn" 
                        style={{ background: 'var(--ink)', color: 'var(--white)', opacity: adminPage <= 1 ? 0.4 : 1 }}>
                        Önceki
                      </button>
                      
                      <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '20px' }}>
                        Sayfa {adminPage} / {adminTotalPages || 1}
                      </span>
                      
                      <button 
                        disabled={adminPage >= adminTotalPages} 
                        onClick={() => setAdminPage(prev => prev + 1)}
                        className="btn" 
                        style={{ background: 'var(--ink)', color: 'var(--white)', opacity: adminPage >= adminTotalPages ? 0.4 : 1 }}>
                        Sonraki
                      </button>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="footerbar">
        <span className="foot-credit">HYPRLUV EPK &middot; AI Studio TemplateMo</span>
        <div className="nav-pills">
          <button className="pill" onClick={() => goToSlide(currentSlide - 1)} disabled={currentSlide === 0}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{width:'23px', height:'23px'}}><path d="M15 5l-7 7 7 7"/></svg></button>
          <button className="pill" onClick={() => goToSlide(currentSlide + 1)} disabled={currentSlide === totalSlides - 1}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{width:'23px', height:'23px'}}><path d="M9 5l7 7-7 7"/></svg></button>
        </div>
      </footer>

      {/* MENU POPUP */}
      <div className="nav-pop" style={{ transform: menuOpen ? 'none' : 'translateY(-100%)' }}>
        <div className="nav-head">
          <span className="mark">HYPR<b>LUV</b></span>
          <button className="x" onClick={() => setMenuOpen(false)}>CLOSE ✕</button>
        </div>
        <ul className="nav-list">
          <li><a href="#" onClick={(e) => { e.preventDefault(); goToSlide(0); }}><span>01</span> Kapak Sayfası</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); goToSlide(1); }}><span>02</span> Stüdyo & Yüz Değiştir</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); goToSlide(2); }}><span>03</span> Geçmiş Galeri</a></li>
          {(user?.role === 'admin' || user?.scopes?.includes('admin:manage_users')) && (
            <li><a href="#" onClick={(e) => { e.preventDefault(); goToSlide(3); }}><span>04</span> Admin Panel</a></li>
          )}
        </ul>
      </div>

      {/* AUTH & ŞİFRE SIFIRLAMA MODALI */}
      {authModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: 'var(--ink-2)', border: '3px solid var(--lime)', padding: '30px', width: '100%', maxWidth: '420px', position: 'relative' }}>
            
            <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--lime)', marginBottom: '15px', fontSize: '26px' }}>
              {authMode === 'login' && 'Giriş Yap'}
              {authMode === 'register' && 'Kayıt Ol'}
              {authMode === 'forgot' && 'Şifremi Unuttum'}
              {authMode === 'reset' && 'Yeni Şifre Belirle'}
            </h2>

            <div onKeyDown={(e) => { if (e.key === 'Enter') handleAuthSubmit(e); }}>
              
              {/* Tarayıcıların "otomatik doldurma havuzunu" boşaltmaları için gizli tuzak (Honeypot) */}
              <div style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', opacity: 0, top: '-9999px', left: '-9999px', zIndex: -1 }}>
                <input type="text" tabIndex="-1" autoComplete="username" />
                <input type="email" tabIndex="-1" autoComplete="email" />
                <input type="password" tabIndex="-1" autoComplete="current-password" />
              </div>

              {authMode === 'register' && (
                <input 
                  type="text" 
                  placeholder="Kullanıcı Adı" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  name="auth-user-noop"
                  autoComplete="off"
                  data-lpignore="true"
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--lime)', fontFamily: 'var(--font-body)' }} 
                />
              )}
              
              {(authMode === 'login' || authMode === 'register' || authMode === 'forgot') && (
                <input 
                  type="text" 
                  placeholder="E-Posta Adresi" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  name="auth-email-noop"
                  autoComplete="off"
                  data-lpignore="true"
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--lime)', fontFamily: 'var(--font-body)' }} 
                />
              )}

              {(authMode === 'login' || authMode === 'register') && (
                <input 
                  type="password"
                  placeholder="Şifre" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  name="auth-pass-noop"
                  autoComplete="new-password"
                  data-lpignore="true"
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--lime)', fontFamily: 'var(--font-body)' }} 
                />
              )}

              {authMode === 'reset' && (
                <input 
                  type="password"
                  placeholder="Yeni Şifre" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  name="auth-newpass-noop"
                  autoComplete="new-password"
                  data-lpignore="true"
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--lime)', fontFamily: 'var(--font-body)' }} 
                />
              )}

              <button type="button" onClick={handleAuthSubmit} className="btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--lime)', marginBottom: '10px' }}>
                {authMode === 'login' && 'Giriş Yap'}
                {authMode === 'register' && 'Kayıt Ol'}
                {authMode === 'forgot' && 'Sıfırlama Talimatı Gönder'}
                {authMode === 'reset' && 'Şifreyi Güncelle'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontFamily: 'var(--font-pixel)', fontSize: '13px' }}>
              {authMode === 'login' ? (
                <>
                  <button type="button" onClick={() => handleSwitchMode('forgot')} style={{ background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', textDecoration: 'underline' }}>Şifremi Unuttum?</button>
                  <button type="button" onClick={() => handleSwitchMode('register')} style={{ background: 'none', border: 'none', color: 'var(--lime)', cursor: 'pointer', textDecoration: 'underline' }}>Hesabın yok mu? Kayıt Ol</button>
                </>
              ) : (
                <button type="button" onClick={() => handleSwitchMode('login')} style={{ background: 'none', border: 'none', color: 'var(--lime)', cursor: 'pointer', textDecoration: 'underline' }}>← Giriş Ekranına Dön</button>
              )}
            </div>

            <button onClick={() => setAuthModalOpen(false)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--pink)', fontSize: '22px', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;