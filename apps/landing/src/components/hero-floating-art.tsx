'use client';

import React from 'react';
import Image from 'next/image';

export function HeroFloatingArt() {
  return (
    <div className="hero-floating-art-wrapper">
      {/* Subtle atmospheric ambient glow */}
      <div className="hero-art-glow" />

      {/* Floating 3D Character */}
      <div className="hero-art-character">
        <Image
          src="/hero_w.png"
          alt="Memron AI Persistent Memory Robot"
          width={768}
          height={512}
          priority
          className="art-img dark-theme-img"
        />
        <Image
          src="/hero_b.png"
          alt="Memron AI Persistent Memory Robot"
          width={768}
          height={512}
          priority
          className="art-img light-theme-img"
        />
      </div>

      {/* 3D Floating Shadow Below */}
      <div className="hero-art-shadow" />
    </div>
  );
}
