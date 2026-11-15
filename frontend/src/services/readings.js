export function sourceLabel(source) {
  if (source === 'simulated' || source === 'simulator' || source === 'simulado') return 'SIMULADO';
  if (source === 'live' || source === 'real' || source === 'hardware') return 'EN VIVO';
  return 'ORIGEN NO INDICADO';
}

export function sourceTagClass(source) {
  if (source === 'simulated' || source === 'simulator' || source === 'simulado') return 'tag-simulated';
  if (source === 'live' || source === 'real' || source === 'hardware') return 'tag-live';
  return '';
}
