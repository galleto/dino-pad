export function supportsSpeech() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function speakAlert(alert) {
  if (!supportsSpeech()) return;
  const text = [alert.title, alert.message, alert.action].filter(Boolean).join('. ');
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  const spanishVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('es'));
  if (spanishVoice) utterance.voice = spanishVoice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
