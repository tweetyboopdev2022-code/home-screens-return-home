// Return to Home — an invisible block. Put it on any screen that shouldn't stay up forever:
// after N minutes with no touch on the wall, the display goes back to the first screen (Home).
import React from 'react';
import type { PluginComponentProps } from './hs-plugin';

const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

export default function ReturnHome({ config, isEditing }: PluginComponentProps & { isEditing?: boolean }) {
  const minutes = Math.max(1, Number(config.minutes ?? 10));
  const target = Math.max(0, Math.round(Number(config.screenIndex ?? 0)));
  const ref = React.useRef<HTMLDivElement>(null);

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
        if (onScreen()) (window as any).__HS_SDK__?.emit?.({ type: 'navigate', direction: 'screen', screenIndex: target });
        else arm();
      }, minutes * 60000);
    };
    if (config.mode === 'immediate') {
      // Lock mode (shown only while e.g. guest mode is on): bounce straight back to the target screen.
      const id = window.setInterval(() => { if (onScreen()) (window as any).__HS_SDK__?.emit?.({ type: 'navigate', direction: 'screen', screenIndex: target }); }, 700);
      return () => clearInterval(id);
    }
    arm();
    ACTIVITY.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    return () => { clearTimeout(timer); ACTIVITY.forEach((e) => window.removeEventListener(e, arm)); };
  }, [minutes, target, isEditing, config.mode]);

  const editor = typeof location !== 'undefined' && /\/editor/.test(location.pathname);
  return (
    <div ref={ref} style={{ width: '100%', height: '100%', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, color: editor ? 'rgba(160,160,160,.8)' : 'transparent', border: editor ? '1px dashed rgba(160,160,160,.5)' : 'none', borderRadius: 6, boxSizing: 'border-box' }}>
      {editor ? (config.mode === 'immediate' ? `🔒 → ${target}` : `⌂ ${minutes}m`) : null}
    </div>
  );
}
