import React from 'react';
import './headerLoader.css'

const HeaderLoader = () => {
  return (
    <div className="flex items-center justify-center gap-2 h-20">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="dot animate-fadeMove"
          style={{
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
};

export default HeaderLoader;
