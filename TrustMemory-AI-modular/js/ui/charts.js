/* =========================================================================
   ui/charts.js — sparkline / trend-arrow / distribution-bar
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

function renderTrendArrow(current, previous){
  if(previous == null || current === previous){
    return `<span style="color:var(--ink-faint); font-size:12px;">→</span>`;
  }
  if(current > previous){
    return `<span style="color:var(--rust); font-size:12px;">↑ +${current - previous}</span>`;
  }
  return `<span style="color:var(--teal); font-size:12px;">↓ -${previous - current}</span>`;
}

function renderDistributionBar(pct, colorClass){
  const c = colorClass || 'ok';
  const color = c === 'bad' ? 'var(--rust)' : c === 'warn' ? 'var(--brass)' : 'var(--teal)';
  const clamped = clamp(pct, 0, 100);
  return `<div style="background:var(--paper-dim); height:6px; border-radius:3px; overflow:hidden; width:100%;">
    <div style="width:${clamped}%; height:100%; background:${color}; border-radius:3px; transition:width .3s ease;"></div>
  </div>`;
}
