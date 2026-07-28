import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock } from 'lucide-react';

interface OfferExpiryTimerProps {
  createdAt?: string;
  onExpire: () => void;
}

export function OfferExpiryTimer({ createdAt, onExpire }: OfferExpiryTimerProps) {
  const calculateSecondsLeft = useCallback(() => {
    if (!createdAt) return 600;
    const createdTime = new Date(createdAt).getTime();
    if (isNaN(createdTime)) return 600;
    const elapsed = (Date.now() - createdTime) / 1000;
    return Math.max(0, 600 - Math.floor(elapsed));
  }, [createdAt]);

  const [secondsLeft, setSecondsLeft] = useState(() => calculateSecondsLeft());
  const [isExpired, setIsExpired] = useState(false);
  const hasCalledExpire = useRef(false);

  const handleExpiration = useCallback(() => {
    if (!hasCalledExpire.current) {
      hasCalledExpire.current = true;
      setIsExpired(true);
      onExpire();
    }
  }, [onExpire]);

  useEffect(() => {
    const updateTimer = () => {
      const currentSeconds = calculateSecondsLeft();
      setSecondsLeft(currentSeconds);
      if (currentSeconds <= 0) {
        handleExpiration();
      }
    };

    updateTimer();
    if (hasCalledExpire.current) return;

    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [calculateSecondsLeft, handleExpiration]);

  if (isExpired) {
    return (
      <div className="relative group flex items-center gap-1 cursor-default">
        <Clock className="h-3 w-3 text-red-700" />
        <span className="font-mono text-[10px] font-bold text-red-700 uppercase tracking-wider">
          EXPIRED
        </span>
        <div className="absolute left-0 top-full mt-1 px-2 py-1 bg-black text-white text-[10px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-100 pointer-events-none z-50">
          Offer expired
        </div>
      </div>
    );
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="relative group flex items-center gap-1 cursor-default">
      <Clock className="h-3 w-3 text-black/60" />
      <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${secondsLeft <= 60 ? 'text-red-700' : secondsLeft <= 180 ? 'text-orange-600' : 'text-black/70'
        }`}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      <div className="absolute left-0 top-full mt-1 px-2 py-1 bg-black text-white text-[10px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-100 pointer-events-none z-50">
        Offer expires in
      </div>
    </div>
  );
}

interface CountdownTimerProps {
  endDate: string | null | undefined;
}

export function CountdownTimer({ endDate }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [status, setStatus] = useState<'loading' | 'valid' | 'expired' | 'invalid'>('loading');

  useEffect(() => {
    if (!endDate) {
      setStatus('invalid');
      return;
    }

    const endTime = new Date(endDate).getTime();

    if (isNaN(endTime)) {
      setStatus('invalid');
      return;
    }

    const calculateTimeLeft = () => {
      const now = Date.now();
      const difference = endTime - now;

      if (difference <= 0) {
        setStatus('expired');
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setStatus('valid');
      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / (1000 * 60)) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [endDate]);

  if (status === 'expired' || status === 'invalid') {
    if (endDate) {
      const daysUntil = Math.ceil(
        (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntil > 0) {
        return (
          <span className={`font-mono text-xs font-bold uppercase tracking-wider ${daysUntil <= 3 ? 'text-red-700' : 'text-black/70'}`}>
            {daysUntil}D LEFT
          </span>
        );
      }
    }
    return (
      <span className="font-mono text-xs font-bold text-red-700 uppercase tracking-wider">CLOSED</span>
    );
  }

  return (
    <div className="relative group flex items-center gap-1 font-mono text-xs font-bold text-black tracking-wider cursor-default">
      <span className="bg-black text-white px-1.5 py-0.5">{String(timeLeft.days).padStart(2, '0')}D</span>
      <span className="text-black/30">:</span>
      <span className="bg-black text-white px-1.5 py-0.5">{String(timeLeft.hours).padStart(2, '0')}H</span>
      <span className="text-black/30">:</span>
      <span className="bg-black text-white px-1.5 py-0.5">{String(timeLeft.minutes).padStart(2, '0')}M</span>
      <span className="text-black/30">:</span>
      <span className="bg-black text-white px-1.5 py-0.5">{String(timeLeft.seconds).padStart(2, '0')}S</span>
      <div className="absolute left-0 top-full mt-1 px-2 py-1 bg-black text-white text-[10px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-100 pointer-events-none z-50">
        Market expires in
      </div>
    </div>
  );
}