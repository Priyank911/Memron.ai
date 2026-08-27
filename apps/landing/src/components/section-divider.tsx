'use client';

import React from 'react';

interface SectionDividerProps {
  number: string;
  tag: string;
  index: string;
}

export function SectionDivider({ number, tag, index }: SectionDividerProps) {
  return (
    <div className="section-tech-divider">
      <div className="divider-line-inner">
        <div className="divider-tag-left">
          <span className="divider-chevron">›</span>
          <span className="divider-num">{number}</span>
          <span className="divider-slash">{'//'}</span>
          <span className="divider-tag-text">{tag}</span>
        </div>
        <div className="divider-index-right">
          <span className="divider-bracket">[</span>
          <span className="divider-index-num">{index}</span>
          <span className="divider-bracket">]</span>
        </div>
      </div>
      <span className="divider-crosshair left" aria-hidden="true">+</span>
      <span className="divider-crosshair right" aria-hidden="true">+</span>
    </div>
  );
}
