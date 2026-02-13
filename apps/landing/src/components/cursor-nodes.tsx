'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  id: number;
}

// Helper function to draw rounded rectangles (polyfill for ctx.roundRect)
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export function CursorNodes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const nodesRef = useRef<Node[]>([]);
  const animationRef = useRef<number | null>(null);
  const connectedNodesRef = useRef<Set<number>>(new Set());

  const initNodes = useCallback((width: number, height: number) => {
    const nodes: Node[] = [];
    const nodeCount = Math.floor((width * height) / 15000); // Adjust density
    
    for (let i = 0; i < Math.min(nodeCount, 100); i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 1.5 + 0.5,
        id: i,
      });
    }
    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initNodes(canvas.width, canvas.height);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    const getTheme = () => {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    };

    const animate = () => {
      const theme = getTheme();
      // Light dots, thin lines for both themes
      const nodeColor = theme === 'light' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.2)';
      const lineColor = theme === 'light' ? 'rgba(0, 0, 0, ' : 'rgba(255, 255, 255, ';
      const cursorColor = theme === 'light' ? 'rgba(0, 0, 0, ' : 'rgba(255, 255, 255, ';
      const textColor = theme === 'light' ? 'rgba(0, 0, 0, ' : 'rgba(255, 255, 255, ';
      const bgColor = theme === 'light' ? 'rgba(255, 255, 255, ' : 'rgba(10, 10, 10, ';

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;
      const nodes = nodesRef.current;
      const connectionDistance = 150;
      const cursorConnectionDistance = 200;
      const navbarZone = 80; // Area where effect fades near navbar

      // Update node positions
      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;

        // Bounce off walls
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;

        // Keep in bounds
        node.x = Math.max(0, Math.min(canvas.width, node.x));
        node.y = Math.max(0, Math.min(canvas.height, node.y));
      });

      // Helper to fade near navbar
      const getNavbarFade = (y: number) => {
        if (y < navbarZone) {
          return y / navbarZone;
        }
        return 1;
      };

      // Draw connections between nodes - thinner lines
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < connectionDistance) {
            const fade = Math.min(getNavbarFade(nodes[i].y), getNavbarFade(nodes[j].y));
            const opacity = (1 - distance / connectionDistance) * 0.12 * fade;
            ctx.beginPath();
            ctx.strokeStyle = lineColor + opacity + ')';
            ctx.lineWidth = 0.4;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Track connected nodes for labels
      const newConnectedNodes = new Set<number>();

      // Draw cursor connections to nearby nodes
      nodes.forEach((node) => {
        const dx = mouse.x - node.x;
        const dy = mouse.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < cursorConnectionDistance) {
          newConnectedNodes.add(node.id);
          const fade = getNavbarFade(node.y) * getNavbarFade(mouse.y);
          const opacity = (1 - distance / cursorConnectionDistance) * 0.45 * fade;
          
          // Draw connection line - slightly more visible
          ctx.beginPath();
          ctx.strokeStyle = cursorColor + opacity + ')';
          ctx.lineWidth = 0.8;
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(node.x, node.y);
          ctx.stroke();

          // Make node slightly brighter when connected to cursor
          ctx.beginPath();
          ctx.fillStyle = cursorColor + (opacity * 0.5) + ')';
          ctx.arc(node.x, node.y, node.radius + 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      connectedNodesRef.current = newConnectedNodes;

      // Draw nodes - light dots
      nodes.forEach((node) => {
        const fade = getNavbarFade(node.y);
        ctx.beginPath();
        ctx.fillStyle = theme === 'light' 
          ? `rgba(0, 0, 0, ${0.2 * fade})` 
          : `rgba(255, 255, 255, ${0.18 * fade})`;
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw "memory" labels on connected nodes
      const connectedArray = Array.from(newConnectedNodes);
      connectedArray.slice(0, 3).forEach((nodeId, index) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        const fade = getNavbarFade(node.y);
        if (fade < 0.5) return;
        
        const labelOpacity = 0.5 * fade;
        
        // Draw small "memory" label box
        ctx.font = '8px ui-monospace, monospace';
        const text = 'memory';
        const textWidth = ctx.measureText(text).width;
        const boxPadding = 3;
        const boxX = node.x + 8;
        const boxY = node.y - 12;
        
        // Background pill
        ctx.beginPath();
        ctx.fillStyle = bgColor + (0.8 * labelOpacity) + ')';
        drawRoundedRect(ctx, boxX - boxPadding, boxY - 8, textWidth + boxPadding * 2, 12, 3);
        ctx.fill();
        
        // Border
        ctx.beginPath();
        ctx.strokeStyle = textColor + (0.2 * labelOpacity) + ')';
        ctx.lineWidth = 0.5;
        drawRoundedRect(ctx, boxX - boxPadding, boxY - 8, textWidth + boxPadding * 2, 12, 3);
        ctx.stroke();
        
        // Text
        ctx.fillStyle = textColor + labelOpacity + ')';
        ctx.fillText(text, boxX, boxY);
      });

      // Draw cursor glow and "AI" label (only if not in navbar zone)
      const cursorFade = getNavbarFade(mouse.y);
      if (cursorFade > 0.3) {
        const cursorGradient = ctx.createRadialGradient(
          mouse.x, mouse.y, 0,
          mouse.x, mouse.y, 45
        );
        cursorGradient.addColorStop(0, cursorColor + (0.12 * cursorFade) + ')');
        cursorGradient.addColorStop(0.5, cursorColor + (0.04 * cursorFade) + ')');
        cursorGradient.addColorStop(1, cursorColor + '0)');
        
        ctx.beginPath();
        ctx.fillStyle = cursorGradient;
        ctx.arc(mouse.x, mouse.y, 45, 0, Math.PI * 2);
        ctx.fill();

        // Draw "AI" label near cursor when connected to nodes
        if (connectedArray.length > 0) {
          const labelOpacity = 0.6 * cursorFade;
          ctx.font = 'bold 7px ui-monospace, monospace';
          const aiText = 'AI';
          const aiWidth = ctx.measureText(aiText).width;
          const aiBoxX = mouse.x + 18;
          const aiBoxY = mouse.y - 4;
          const aiPadding = 3;
          
          // AI label background
          ctx.beginPath();
          ctx.fillStyle = bgColor + (0.9 * labelOpacity) + ')';
          drawRoundedRect(ctx, aiBoxX - aiPadding, aiBoxY - 7, aiWidth + aiPadding * 2, 11, 3);
          ctx.fill();
          
          // AI label border with accent
          ctx.beginPath();
          ctx.strokeStyle = theme === 'light' 
            ? `rgba(139, 92, 246, ${0.4 * labelOpacity})` 
            : `rgba(139, 92, 246, ${0.5 * labelOpacity})`;
          ctx.lineWidth = 0.8;
          drawRoundedRect(ctx, aiBoxX - aiPadding, aiBoxY - 7, aiWidth + aiPadding * 2, 11, 3);
          ctx.stroke();
          
          // AI text
          ctx.fillStyle = theme === 'light' 
            ? `rgba(139, 92, 246, ${labelOpacity})` 
            : `rgba(167, 139, 250, ${labelOpacity})`;
          ctx.fillText(aiText, aiBoxX, aiBoxY);
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initNodes]);

  return (
    <canvas
      ref={canvasRef}
      className="cursor-nodes-canvas"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}
