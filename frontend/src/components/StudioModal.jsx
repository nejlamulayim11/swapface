import React, { useState } from 'react';

function StudioModal({ originalImage, resultImage }) {
  const [sliderPosition, setSliderPosition] = useState(50); // Yüzde olarak slider konumu

  const handleSliderChange = (e) => {
    setSliderPosition(e.target.value);
  };

  return (
    <div style={{ marginTop: '30px', textAlign: 'center' }}>
      <h2>Yüz Değiştirme Stüdyosu</h2>
      
      <div style={{ position: 'relative', width: '400px', height: '400px', margin: '0 auto', overflow: 'hidden', borderRadius: '8px' }}>
        {/* Hedef / Sonuç Görseli (Altta) */}
        <img 
          src={resultImage} 
          alt="Result" 
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} 
        />

        {/* Orijinal Görsel (Üstte, clip-path ile kesiliyor) */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`
          }}
        >
          <img 
            src={originalImage} 
            alt="Original" 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          />
        </div>
      </div>

      {/* Slider Kontrol Çubuğu */}
      <div style={{ marginTop: '15px' }}>
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={sliderPosition} 
          onChange={handleSliderChange} 
          style={{ width: '400px', cursor: 'pointer' }}
        />
        <p style={{ fontSize: '14px', color: '#666' }}>Öncesi / Sonrası Karşılaştırma</p>
      </div>
    </div>
  );
}

export default StudioModal;