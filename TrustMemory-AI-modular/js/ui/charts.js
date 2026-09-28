/* =========================================================================
   ui/charts.js — sparkline
   ========================================================================= */

function renderSparkline(values, width, height, strokeColor){
  width = width || 80;
  height = height || 24;
  strokeColor = strokeColor || 'var(--brass)';
  if(!values || values.length < 2){
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><line x1="0" y1="${height/2}" x2="${width}" y2="${height/2}" stroke="${strokeColor}" stroke-dasharray="2,2" stroke-width="1.5"/></svg>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  const padding = 2;
  const pts = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((v - min) / range) * (height - 2 * padding);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible; vertical-align:middle;">
    <polyline fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${pts}" />
  </svg>`;
}
