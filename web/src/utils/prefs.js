// web/src/utils/prefs.js
import { reactive, watch } from 'vue';

const LS_THEME = 'animeCatalog.prefs.theme.v1';
const LS_VIBRATION = 'animeCatalog.prefs.vibration.v1';

function readTheme() {
  try {
    const t = String(localStorage.getItem(LS_THEME) || '').trim();
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    // ignore
  }
  return 'system';
}

function readVibration() {
  try {
    const raw = localStorage.getItem(LS_VIBRATION);
    if (raw === null) return true;
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return Boolean(JSON.parse(raw));
  } catch {
    return true;
  }
}

export const prefs = reactive({
  theme: readTheme(),
  vibration: readVibration()
});

watch(
  () => ({ theme: prefs.theme, vibration: prefs.vibration }),
  (v) => {
    try {
      localStorage.setItem(LS_THEME, String(v.theme || 'system'));
      localStorage.setItem(LS_VIBRATION, v.vibration ? '1' : '0');
    } catch {
      // ignore
    }
  }
);

export function vibrate(ms = 50) {
  if (prefs.vibration && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
}
