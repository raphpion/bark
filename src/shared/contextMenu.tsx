import { ComponentChildren, render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export interface ContextMenuItem {
  type?: 'item' | 'divider' | 'header';
  label?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  icon?: ComponentChildren;
  children?: ContextMenuItem[];
  onClick?: () => void;
}

let activeMenuCleanup: (() => void) | null = null;

export function closeActiveContextMenu(): void {
  if (activeMenuCleanup) {
    activeMenuCleanup();
    activeMenuCleanup = null;
  }
}

function MenuLevel({
  items,
  isSubmenu = false,
}: {
  items: ContextMenuItem[];
  isSubmenu?: boolean;
}) {
  return (
    <div class={`bark-ctx-menu${isSubmenu ? ' bark-ctx-submenu' : ''}`}>
      {items.map((item, idx) => {
        if (item.type === 'divider') {
          return <div key={`div-${idx}`} class="bark-ctx-divider" />;
        }
        if (item.type === 'header') {
          return (
            <div key={`hdr-${idx}`} class="bark-ctx-header">
              {item.label || ''}
            </div>
          );
        }

        const hasChildren = !!item.children && item.children.length > 0;

        return (
          <div
            key={`item-${idx}-${item.label}`}
            class={`bark-ctx-item${item.disabled ? ' disabled' : ''}${
              item.danger ? ' danger' : ''
            }`}
            onMouseEnter={(e) => {
              if (!hasChildren || item.disabled) return;
              const row = e.currentTarget as HTMLElement;
              const subMenu = row.querySelector<HTMLElement>(':scope > .bark-ctx-submenu');
              if (!subMenu) return;
              subMenu.style.display = 'flex';
              const rowRect = row.getBoundingClientRect();
              const subRect = subMenu.getBoundingClientRect();
              const vw = window.innerWidth;
              const vh = window.innerHeight;

              if (rowRect.right + subRect.width + 6 <= vw) {
                subMenu.style.left = 'calc(100% - 2px)';
                subMenu.style.right = 'auto';
              } else if (rowRect.left - subRect.width - 6 >= 0) {
                subMenu.style.right = 'calc(100% - 2px)';
                subMenu.style.left = 'auto';
              } else {
                const offsetLeft = Math.max(
                  4 - rowRect.left,
                  vw - rowRect.left - subRect.width - 6
                );
                subMenu.style.left = `${offsetLeft}px`;
                subMenu.style.right = 'auto';
              }

              if (rowRect.top + subRect.height > vh - 6) {
                const shiftUp = Math.max(
                  6 - rowRect.top,
                  vh - rowRect.top - subRect.height - 6
                );
                subMenu.style.top = `${shiftUp}px`;
              } else {
                subMenu.style.top = '-4px';
              }
            }}
            onMouseLeave={(e) => {
              if (!hasChildren) return;
              const row = e.currentTarget as HTMLElement;
              const subMenu = row.querySelector<HTMLElement>(':scope > .bark-ctx-submenu');
              if (subMenu) {
                subMenu.style.display = 'none';
              }
            }}
            onClick={(e) => {
              if (hasChildren) return;
              e.stopPropagation();
              if (item.disabled) return;
              closeActiveContextMenu();
              item.onClick?.();
            }}
          >
            {item.checked !== undefined ? (
              <span class="bark-ctx-check">{item.checked ? '✓' : ''}</span>
            ) : item.icon ? (
              <span class="bark-ctx-icon">{item.icon}</span>
            ) : null}
            <span class="bark-ctx-label">{item.label || ''}</span>
            {hasChildren && (
              <>
                <span class="bark-ctx-arrow">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
                <MenuLevel items={item.children!} isSubmenu />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContextMenuOverlay({
  x,
  y,
  items,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rootMenu = wrapRef.current?.querySelector<HTMLElement>('.bark-ctx-menu');
    if (rootMenu) {
      const rect = rootMenu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const finalLeft = Math.max(6, Math.min(x, vw - rect.width - 6));
      const finalTop = Math.max(6, Math.min(y, vh - rect.height - 6));
      rootMenu.style.left = `${finalLeft}px`;
      rootMenu.style.top = `${finalTop}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={wrapRef}
      class="bark-ctx-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          closeActiveContextMenu();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) {
          closeActiveContextMenu();
        }
      }}
    >
      <MenuLevel items={items} />
    </div>
  );
}

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  closeActiveContextMenu();

  const host = document.createElement('div');
  document.body.appendChild(host);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeActiveContextMenu();
    }
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', closeActiveContextMenu);

  activeMenuCleanup = () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', closeActiveContextMenu);
    render(null, host);
    host.remove();
  };

  render(<ContextMenuOverlay x={x} y={y} items={items} />, host);
}
