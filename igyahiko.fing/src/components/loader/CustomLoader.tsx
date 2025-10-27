import React from 'react';
import './fingai-loader.css'; // See styles below

const CustomLoader = () => {
  const colors = ['#C95792', '#131313', '#C95792', '#131313', '#C95792']; // FingAI palette

  return (
    <div className="flex gap-2 items-center justify-center h-screen">
      {colors.map((color, i) => (
        <span
          key={i}
          className="loader-dot"
          style={{
            backgroundColor: color,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
};

export default CustomLoader;
