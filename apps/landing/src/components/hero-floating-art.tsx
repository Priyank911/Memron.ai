'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

export function HeroFloatingArt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isLoaded, setIsLoaded] = useState(false);

  // In-memory preloaded Image elements
  const imgDarkRef = useRef<HTMLImageElement | null>(null);
  const imgLightRef = useRef<HTMLImageElement | null>(null);
  const isTransitioningRef = useRef(false);
  const currentDisplayedThemeRef = useRef<'dark' | 'light'>('dark');
  const animFrameIdRef = useRef<number>(0);

  // Offscreen canvas for pixelation downsampling
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Draw a crisp image onto the main canvas with given pixelation block size
  const drawPixelated = useCallback(
    (
      img: HTMLImageElement,
      pixelSize: number,
      glitchOffsets?: { y: number; h: number; dx: number }[]
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      if (pixelSize <= 1) {
        // Native full-resolution render
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        // Pixelify downsampling technique:
        // 1. Draw image to tiny offscreen canvas (w / pixelSize, h / pixelSize)
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }
        const offCanvas = offscreenCanvasRef.current;
        const offW = Math.max(1, Math.floor(w / pixelSize));
        const offH = Math.max(1, Math.floor(h / pixelSize));
        offCanvas.width = offW;
        offCanvas.height = offH;
        const offCtx = offCanvas.getContext('2d');
        if (!offCtx) return;

        offCtx.imageSmoothingEnabled = false;
        offCtx.clearRect(0, 0, offW, offH);
        offCtx.drawImage(img, 0, 0, offW, offH);

        // 2. Scale back up to full size without smoothing (chunky retro pixels)
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(offCanvas, 0, 0, offW, offH, 0, 0, w, h);

        // Optional glitch slice displacements
        if (glitchOffsets && glitchOffsets.length > 0) {
          glitchOffsets.forEach((slice) => {
            ctx.drawImage(
              canvas,
              0,
              slice.y,
              w,
              slice.h,
              slice.dx,
              slice.y,
              w,
              slice.h
            );
          });
        }
      }
    },
    []
  );

  // Run the Pixelify Destroy & Reassemble animation
  const runPixelifyTransition = useCallback(
    (fromTheme: 'dark' | 'light', toTheme: 'dark' | 'light') => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const fromImg = fromTheme === 'dark' ? imgDarkRef.current : imgLightRef.current;
      const toImg = toTheme === 'dark' ? imgDarkRef.current : imgLightRef.current;
      if (!fromImg || !toImg) return;

      cancelAnimationFrame(animFrameIdRef.current);
      isTransitioningRef.current = true;

      const w = canvas.width;
      const h = canvas.height;
      const startTime = performance.now();
      const duration = 620; // ms

      // Generate disintegrating pixel particles
      interface PixelParticle {
        x: number;
        y: number;
        vx: number;
        vy: number;
        size: number;
        color: string;
        alpha: number;
      }

      const particles: PixelParticle[] = [];
      const particleColors =
        fromTheme === 'dark'
          ? ['#ffffff', '#a78bfa', '#8b5cf6', '#c4b5fd', '#38bdf8']
          : ['#000000', '#3b82f6', '#6366f1', '#64748b', '#1e293b'];

      for (let i = 0; i < 48; i++) {
        particles.push({
          x: w * (0.2 + Math.random() * 0.6),
          y: h * (0.2 + Math.random() * 0.6),
          vx: (Math.random() - 0.5) * 14,
          vy: (Math.random() - 0.6) * 12,
          size: Math.floor(4 + Math.random() * 8),
          color: particleColors[Math.floor(Math.random() * particleColors.length)],
          alpha: 1,
        });
      }

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);

        if (progress < 0.5) {
          // Phase 1: Outgoing image pixelates / destroys (1px -> 26px)
          const p = progress / 0.5; // 0 to 1
          const pixelSize = Math.round(1 + p * 25);

          // Random glitch slices during destruction
          const glitch =
            p > 0.3 && Math.random() > 0.4
              ? [
                  {
                    y: Math.random() * h * 0.8,
                    h: 12 + Math.random() * 24,
                    dx: (Math.random() - 0.5) * 24,
                  },
                ]
              : undefined;

          drawPixelated(fromImg, pixelSize, glitch);

          // Render bursting pixel particles
          particles.forEach((pt) => {
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.vy += 0.2; // slight gravity
            pt.alpha = Math.max(0, 1 - p * 1.2);

            ctx.fillStyle = pt.color;
            ctx.globalAlpha = pt.alpha;
            ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
          });
          ctx.globalAlpha = 1;
        } else {
          // Phase 2: Incoming image reassembles / resolves (26px -> 1px)
          const p = (progress - 0.5) / 0.5; // 0 to 1
          const pixelSize = Math.max(1, Math.round(26 * (1 - p)));

          const glitch =
            p < 0.6 && Math.random() > 0.5
              ? [
                  {
                    y: Math.random() * h * 0.8,
                    h: 8 + Math.random() * 20,
                    dx: (Math.random() - 0.5) * 14,
                  },
                ]
              : undefined;

          drawPixelated(toImg, pixelSize, glitch);

          // Lingering digital sparkles converging
          particles.forEach((pt) => {
            pt.alpha = Math.max(0, (1 - p) * 0.6);
            if (pt.alpha > 0) {
              ctx.fillStyle = pt.color;
              ctx.globalAlpha = pt.alpha;
              ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
            }
          });
          ctx.globalAlpha = 1;
        }

        if (progress < 1) {
          animFrameIdRef.current = requestAnimationFrame(step);
        } else {
          // Final clean render
          isTransitioningRef.current = false;
          currentDisplayedThemeRef.current = toTheme;
          drawPixelated(toImg, 1);
        }
      };

      animFrameIdRef.current = requestAnimationFrame(step);
    },
    [drawPixelated]
  );

  // Preload images and setup theme observation
  useEffect(() => {
    let loadedCount = 0;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount >= 2) {
        setIsLoaded(true);
      }
    };

    const imgDark = new window.Image();
    imgDark.src = '/hero_w.png';
    imgDark.onload = checkLoaded;
    imgDarkRef.current = imgDark;

    const imgLight = new window.Image();
    imgLight.src = '/hero_b.png';
    imgLight.onload = checkLoaded;
    imgLightRef.current = imgLight;

    // Detect initial theme
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const initTheme = isLight ? 'light' : 'dark';
    setTheme(initTheme);
    currentDisplayedThemeRef.current = initTheme;

    // Watch for theme changes via MutationObserver
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const currentIsLight = document.documentElement.getAttribute('data-theme') === 'light';
          const nextTheme = currentIsLight ? 'light' : 'dark';

          setTheme((prev) => {
            if (prev !== nextTheme) {
              runPixelifyTransition(prev, nextTheme);
            }
            return nextTheme;
          });
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    // Also listen to custom theme-change event
    const handleThemeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<'dark' | 'light'>;
      const nextTheme = customEvent.detail;
      if (nextTheme && nextTheme !== currentDisplayedThemeRef.current) {
        runPixelifyTransition(currentDisplayedThemeRef.current, nextTheme);
        setTheme(nextTheme);
      }
    };

    window.addEventListener('theme-change', handleThemeEvent);

    return () => {
      observer.disconnect();
      window.removeEventListener('theme-change', handleThemeEvent);
      cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [runPixelifyTransition]);

  // Initial draw once images are loaded
  useEffect(() => {
    if (isLoaded) {
      const activeImg = theme === 'dark' ? imgDarkRef.current : imgLightRef.current;
      if (activeImg) {
        drawPixelated(activeImg, 1);
      }
    }
  }, [isLoaded, theme, drawPixelated]);

  // Interactive click on character to toggle day/night directly with pixelify transition
  const handleCharacterClick = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
    window.dispatchEvent(new CustomEvent('theme-change', { detail: nextTheme }));
  };

  return (
    <div className="hero-floating-art-wrapper">
      {/* Subtle atmospheric ambient glow */}
      <div className="hero-art-glow" />

      {/* Floating Pixel Art Character with Interactive Click */}
      <div
        className="hero-art-character"
        onClick={handleCharacterClick}
        title="Click to toggle Day / Night pixel transition"
        style={{ cursor: 'pointer' }}
      >
        <canvas
          ref={canvasRef}
          width={768}
          height={512}
          className="hero-pixel-canvas"
          style={{
            display: isLoaded ? 'block' : 'none',
            maxWidth: '600px',
            width: '100%',
            height: 'auto',
          }}
        />

        {/* Fallback image before canvas initialization */}
        {!isLoaded && (
          <img
            src={theme === 'dark' ? '/hero_w.png' : '/hero_b.png'}
            alt="Memron AI Persistent Memory Robot"
            width={768}
            height={512}
            className="art-img"
            style={{ maxWidth: '600px', width: '100%', height: 'auto' }}
          />
        )}
      </div>

      {/* 3D Floating Shadow Below */}
      <div className="hero-art-shadow" />
    </div>
  );
}
