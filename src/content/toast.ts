/**
 * Minimal toast for the content script (runs inside untrusted web pages).
 * Rendered in a closed Shadow DOM so page CSS can't restyle it and page scripts can't
 * reach into it. Built with DOM APIs + textContent only (no innerHTML).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const HOST_ID = 'bark-toast-host';
const VISIBLE_MS = 2000;

const TOAST_CSS = `
:host { all: initial; }
.toast {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translate(-50%, -8px);
  z-index: 2147483647;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 8px 10px;
  border-radius: 999px;
  background: rgba(28, 28, 32, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  color: #f3f4f6;
  font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.toast.success .icon { background: #22c55e; color: #052e16; }
.toast.error .icon { background: #ef4444; color: #fef2f2; }
.icon svg { width: 12px; height: 12px; }
`;

let hideTimer: number | undefined;
let removeTimer: number | undefined;

function createIcon(kind: 'success' | 'error'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const paths = kind === 'success' ? ['M20 6 9 17l-5-5'] : ['M18 6 6 18', 'm6 6 12 12'];
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

export function showToast(message: string, kind: 'success' | 'error' = 'success'): void {
  document.getElementById(HOST_ID)?.remove();
  window.clearTimeout(hideTimer);
  window.clearTimeout(removeTimer);

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = TOAST_CSS;

  const toast = document.createElement('div');
  toast.className = `toast ${kind}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.appendChild(createIcon(kind));

  const label = document.createElement('span');
  label.textContent = message;

  toast.append(icon, label);
  shadow.append(style, toast);
  (document.body || document.documentElement).appendChild(host);

  requestAnimationFrame(() => toast.classList.add('show'));
  hideTimer = window.setTimeout(() => {
    toast.classList.remove('show');
    removeTimer = window.setTimeout(() => host.remove(), 200);
  }, VISIBLE_MS);
}
