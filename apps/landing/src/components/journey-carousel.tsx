'use client';

import React, { useState, useEffect, useRef } from 'react';

const videos = [
  {
    id: 1,
    title: 'Introduction to Memron',
    url: 'https://www.youtube.com/embed/DvoNCcYJcmA',
  },
  {
    id: 2,
    title: 'How Memory Works',
    url: 'https://www.youtube.com/embed/DvoNCcYJcmA',
  },
  {
    id: 3,
    title: 'Getting Started',
    url: 'https://www.youtube.com/embed/DvoNCcYJcmA',
  },
];

export function VideoCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const total = videos.length;

  const goNext = () => {
    setActiveIndex((prev) => (prev + 1) % total);
  };

  const goPrev = () => {
    setActiveIndex((prev) => (prev - 1 + total) % total);
  };

  const handleManualChange = (index: number) => {
    setActiveIndex(index);
    setIsPaused(true);
  };

  const handleArrowClick = (direction: 'prev' | 'next') => {
    setIsPaused(true);
    if (direction === 'next') {
      goNext();
    } else {
      goPrev();
    }
  };

  const handleVideoClick = () => {
    setIsPaused(true);
  };

  // Auto-scroll effect
  useEffect(() => {
    if (!isPaused) {
      timerRef.current = setInterval(() => {
        setActiveIndex((prev) => (prev + 1) % total);
      }, 5000); // 5 seconds per video
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPaused, total]);

  const current = videos[activeIndex];

  return (
    <div className="video-carousel">
      <div className="video-carousel-header">
        <span className="video-step">{activeIndex + 1}.</span>
        <span className="video-title">{current.title}</span>
      </div>

      <div className="video-carousel-container">
        <button 
          className="video-arrow video-arrow-left" 
          onClick={() => handleArrowClick('prev')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="video-frame" onClick={handleVideoClick}>
          <iframe
            key={current.id}
            src={current.url}
            title={current.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>

        <button 
          className="video-arrow video-arrow-right" 
          onClick={() => handleArrowClick('next')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="video-dots">
        {videos.map((_, index) => (
          <button
            key={index}
            className={`video-dot ${index === activeIndex ? 'active' : ''}`}
            onClick={() => handleManualChange(index)}
          />
        ))}
      </div>
    </div>
  );
}
