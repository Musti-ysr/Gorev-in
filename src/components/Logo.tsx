import React from 'react';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className = "w-full h-full" }) => {
  return (
    <div className={className}>
      <svg 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <mask id="bubble-gap">
            <rect width="100" height="100" fill="white" />
            {/* Area to cut out from the square border (bubble + padding) */}
            <rect x="52" y="-5" width="53" height="45" rx="12" fill="black" />
            <path d="M75 30 L65 48 L88 35 Z" fill="black" />
          </mask>
        </defs>

        {/* Square with 8px border - Masked to create gap around bubble */}
        <rect 
          x="10" 
          y="15" 
          width="75" 
          height="75" 
          rx="12" 
          fill="white" 
          stroke="#1e3a8a" 
          strokeWidth="8" 
          mask="url(#bubble-gap)"
        />
        
        {/* Checkmark */}
        <polyline 
          points="35,65 45,75 62,48" 
          stroke="#1e3a8a" 
          strokeWidth="8" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />

        {/* Speech Bubble (Enlarged and Overflowing) */}
        <rect 
          x="55" 
          y="0" 
          width="45" 
          height="32" 
          rx="10" 
          fill="#f97316" 
        />
        
        {/* Bubble Tail */}
        <path 
          d="M75 32 L70 42 L82 32 Z" 
          fill="#f97316" 
        />
      </svg>
    </div>
  );
};
