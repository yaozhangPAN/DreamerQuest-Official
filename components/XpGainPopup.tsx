import React, { useEffect } from 'react';
import { Zap } from 'lucide-react';

interface XpGainPopupProps {
  amount: number;
  onComplete: () => void;
}

const XpGainPopup: React.FC<XpGainPopupProps> = ({ amount, onComplete }) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 2200);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="xp-popup-overlay" aria-live="polite">
      <div className="xp-popup-burst" />
      <div className="xp-popup-burst xp-popup-burst-delay" />
      <div className="xp-popup-card">
        <div className="xp-popup-icon">
          <Zap size={28} fill="currentColor" />
        </div>
        <p className="xp-popup-label">XP GAINED</p>
        <p className="xp-popup-amount">+{amount}</p>
        <div className="xp-popup-sparkles">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
};

export default XpGainPopup;
