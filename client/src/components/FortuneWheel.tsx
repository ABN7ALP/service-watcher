import { useEffect, useRef, useState } from 'react';
import { WHEEL_SEGMENTS, ANIMATION } from '@shared/constants';
import confetti from 'canvas-confetti';

interface FortuneWheelProps {
  onSpinComplete?: (result: any) => void;
  isSpinning: boolean;
  finalRotation?: number;
  winningSegmentId?: string;
}

export function FortuneWheel({ 
  onSpinComplete, 
  isSpinning, 
  finalRotation = 0,
  winningSegmentId 
}: FortuneWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentRotation, setCurrentRotation] = useState(0);
  const animationRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // رسم العجلة
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    // مسح الـ canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // رسم القطاعات
    const segmentAngle = (2 * Math.PI) / WHEEL_SEGMENTS.length;
    
    WHEEL_SEGMENTS.forEach((segment, index) => {
      const startAngle = index * segmentAngle - Math.PI / 2 + (currentRotation * Math.PI / 180);
      const endAngle = startAngle + segmentAngle;
      
      // رسم القطاع
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      
      // تلوين القطاع
      ctx.fillStyle = segment.color;
      ctx.fill();
      
      // حدود القطاع
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // رسم النص
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + segmentAngle / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = segment.textColor;
      ctx.font = 'bold 20px Arial';
      ctx.fillText(segment.label, radius * 0.65, 0);
      ctx.restore();
    });
    
    // رسم الدائرة المركزية
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#1a202c';
    ctx.fill();
    ctx.strokeStyle = '#d69e2e';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // رسم المؤشر (السهم)
    ctx.save();
    ctx.translate(centerX, centerY - radius - 10);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-15, -30);
    ctx.lineTo(15, -30);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    
  }, [currentRotation]);
  
  // تشغيل صوت tick
  const playTickSound = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.05);
  };
  
  // أنيميشن الدوران
  useEffect(() => {
    if (!isSpinning || finalRotation === 0) return;
    
    const startTime = Date.now();
    const duration = ANIMATION.SPIN_DURATION * 1000; // تحويل إلى ميلي ثانية
    const startRotation = currentRotation;
    
    let lastTickRotation = 0;
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // منحنى التباطؤ (ease-out cubic)
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const newRotation = startRotation + (finalRotation - startRotation) * easeProgress;
      setCurrentRotation(newRotation % 360);
      
      // تشغيل صوت tick كل 30 درجة
      const rotationDiff = Math.abs(newRotation - lastTickRotation);
      if (rotationDiff >= 30) {
        playTickSound();
        lastTickRotation = newRotation;
      }
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // انتهى الدوران
        if (onSpinComplete) {
          onSpinComplete({ rotation: finalRotation });
        }
        
        // تأثير الفوز
        if (winningSegmentId && winningSegmentId !== 'loss') {
          triggerWinEffect(winningSegmentId);
        }
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSpinning, finalRotation]);
  
  // تأثير الفوز
  const triggerWinEffect = (segmentId: string) => {
    if (segmentId === 'jackpot') {
      // تأثير قوي للجاكبوت
      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#d69e2e', '#f6ad55', '#ed8936']
      });
      
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 }
        });
      }, 300);
    } else if (segmentId === 'big_win') {
      // تأثير متوسط للربح الكبير
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ed8936', '#f6ad55']
      });
    } else {
      // تأثير خفيف للأرباح الصغيرة
      confetti({
        particleCount: 50,
        spread: 50,
        origin: { y: 0.6 },
        colors: ['#48bb78', '#4299e1']
      });
    }
  };
  
  return (
    <div className="relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={500}
        height={500}
        className="max-w-full h-auto"
      />
      
      {isSpinning && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-white text-2xl font-bold animate-pulse">
            جاري الدوران...
          </div>
        </div>
      )}
    </div>
  );
}
