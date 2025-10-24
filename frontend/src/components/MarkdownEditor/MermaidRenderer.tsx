import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with configuration
// Security: 'strict' prevents XSS via JavaScript execution in SVG diagrams
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',  // ✅ SECURITY: Prevents JavaScript execution in diagrams
  fontFamily: 'inherit'
});

interface MermaidRendererProps {
  chart: string;
  id?: string;
}

export function MermaidRenderer({ chart, id }: MermaidRendererProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef<string>(`mermaid-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    if (elementRef.current && chart) {
      const renderId = id || renderIdRef.current;

      // Render the chart
      mermaid.render(renderId, chart).then(({ svg }) => {
        if (elementRef.current) {
          elementRef.current.innerHTML = svg;
        }
      }).catch((error) => {
        console.error('Mermaid rendering error:', error);
        if (elementRef.current) {
          elementRef.current.innerHTML = `
            <div style="color: #dc2626; padding: 12px; border: 1px solid #fecaca; border-radius: 6px; background: #fef2f2;">
              <strong>Mermaid Syntax Error:</strong>
              <pre style="margin-top: 8px; font-size: 12px; overflow-x: auto;">${error.message || error}</pre>
            </div>
          `;
        }
      });
    }
  }, [chart, id]);

  return (
    <div
      ref={elementRef}
      style={{
        display: 'flex',
        justifyContent: 'center',
        margin: '16px 0',
        overflow: 'auto'
      }}
    />
  );
}
