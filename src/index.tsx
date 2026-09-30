// Return to Home — an invisible block. Put it on any screen that shouldn't stay up forever:
// after N minutes with no touch on the wall, the display goes back to the first screen (Home).
import React from 'react';
import type { PluginComponentProps } from './hs-plugin';

const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

// Last time anyone touched the wall itself (phone remotes don't produce these).
let lastTouch = 0;
if (typeof window !== 'undefined' && !(window as any).__rhTouch) {
  (window as any).__rhTouch = true;
  ['pointerdown', 'touchstart'].forEach((e) => window.addEventListener(e, () => { lastTouch = Date.now(); }, { passive: true, capture: true }));
}
let screensCache: string[] | null = null;
const clean = (s: string) => s.replace(/[☾☀️🌙]/gu, '').trim().toLowerCase();

export default function ReturnHome({ config, isEditing }: PluginComponentProps & { isEditing?: boolean }) {
  const minutes = Math.max(1, Number(config.minutes ?? 10));
  const target = Math.max(0, Math.round(Number(config.screenIndex ?? 0)));
  const ref = React.useRef<HTMLDivElement>(null);
  // Target by screen name when given (survives screens being re-ordered or switched off).
  const targetIndex = React.useCallback(async (): Promise<number> => {
    const name = clean(String(config.screenName ?? ''));
    if (!name) return target;
    try {
      if (!screensCache) { const c = await fetch('/api/config').then((r) => r.json()); screensCache = (c.screens ?? []).filter((x: any) => x.enabled !== false).map((x: any) => clean(x.name)); }
      const i = screensCache!.findIndex((n) => n.startsWith(name)); return i >= 0 ? i : target;
    } catch { return target; }
  }, [config.screenName, target]);

  React.useEffect(() => {
    if (isEditing || /\/editor/.test(location.pathname)) return;   // never navigate inside the editor
    let timer = 0;
    const onScreen = () => {
      const el = ref.current; if (!el || !el.isConnected || document.hidden) return false;
      const r = el.getBoundingClientRect();
      // Only the screen actually showing counts (neighbours pre-rendered off-canvas don't).
      return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden';
    };
    const arm = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (onScreen()) targetIndex().then((i) => (window as any).__HS_SDK__?.emit?.({ type: 'navigate', direction: 'screen', screenIndex: i }));
        else arm();
      }, minutes * 60000);
    };
    if (config.mode === 'immediate') {
      // Lock mode — only visible while guest mode is on, so seeing it means someone left the Guests screen.
      //  • left by touching the wall (a guest)       → bounce straight back
      //  • left without a touch (phone remote/app)   → a resident: switch guest mode off in Home Assistant
      const mountedAt = Date.now(); let seenSince = 0; let released = false;
      const sdk = () => (window as any).__HS_SDK__;
      const release = async () => {
        released = true;
        const ent = String(config.releaseEntity || 'input_boolean.guest_mode');
        const haUrl = String(sdk()?.getPluginSettings?.('home-assistant')?.haUrl || '').replace(/\/$/, '');
        if (!haUrl) return;
        try {
          await sdk().pluginFetch('home-assistant', { url: `${haUrl}/api/services/${ent.split('.')[0]}/turn_off`, method: 'POST',
            payload: JSON.stringify({ entity_id: ent }), headers: { 'Content-Type': 'application/json' },
            secretInjections: { header: { Authorization: 'Bearer {{ha_token}}' } } });
        } catch { /* leave it; the wall simply stays where the phone put it */ }
      };
      const id = window.setInterval(async () => {
        if (!onScreen()) { seenSince = 0; return; }
        const now = Date.now(); if (!seenSince) seenSince = now;
        const touched = now - lastTouch < 6000;
        const tgt = await targetIndex();
        if (touched) { sdk()?.emit?.({ type: 'navigate', direction: 'screen', screenIndex: tgt }); return; }
        if (!released && now - seenSince > 2500 && now - mountedAt > 4000) release();
      }, 500);
      return () => clearInterval(id);
    }
    arm();
    ACTIVITY.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    return () => { clearTimeout(timer); ACTIVITY.forEach((e) => window.removeEventListener(e, arm)); };
  }, [minutes, target, isEditing, config.mode, targetIndex, config.releaseEntity]);

  const editor = typeof location !== 'undefined' && /\/editor/.test(location.pathname);
  return (
    <div ref={ref} style={{ width: '100%', height: '100%', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, color: editor ? 'rgba(160,160,160,.8)' : 'transparent', border: editor ? '1px dashed rgba(160,160,160,.5)' : 'none', borderRadius: 6, boxSizing: 'border-box' }}>
      {editor ? (config.mode === 'immediate' ? `🔒 → ${target}` : `⌂ ${minutes}m`) : null}
    </div>
  );
}
