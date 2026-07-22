import React from 'react';

function ImageUpload({ label, onChange, preview }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontWeight: 'bold', color: '#333' }}>{label}</label>
      <input 
        type="file" 
        accept="image/*" 
        onChange={onChange}
        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
      />
      {preview && (
        <div style={{ marginTop: '5px' }}>
          <img 
            src={URL.createObjectURL(preview)} 
            alt="Önizleme" 
            style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '4px' }} 
          />
        </div>
      )}
    </div>
  );
}

export default ImageUpload;