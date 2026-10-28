import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { SPACE_COLORS } from './constants';
import { Space, SpaceColor } from './types';

interface EmojiEntry {
  e: string;
  n: string;
}

interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  emojis: EmojiEntry[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'workspace',
    label: 'Work & Tech',
    icon: '💼',
    emojis: [
      { e: '💼', n: 'briefcase work job office business' },
      { e: '💻', n: 'laptop computer code dev tech' },
      { e: '🖥️', n: 'desktop monitor screen computer' },
      { e: '⌨️', n: 'keyboard typing code' },
      { e: '🚀', n: 'rocket launch startup ship fast' },
      { e: '⚡', n: 'zap lightning bolt power energy' },
      { e: '🛠️', n: 'tools hammer wrench build settings' },
      { e: '⚙️', n: 'gear settings config cog' },
      { e: '🧪', n: 'test tube lab science experiment' },
      { e: '🔬', n: 'microscope research science' },
      { e: '📊', n: 'chart bar analytics data stats' },
      { e: '📈', n: 'chart up growth stocks finance' },
      { e: '📁', n: 'folder file directory project' },
      { e: '🗂️', n: 'dividers files index archive' },
      { e: '📋', n: 'clipboard tasks todo list' },
      { e: '📌', n: 'pushpin pin important' },
      { e: '📎', n: 'paperclip attachment' },
      { e: '🔍', n: 'magnifying glass search find' },
      { e: '💡', n: 'light bulb idea creative tip' },
      { e: '🧠', n: 'brain ai smart knowledge think' },
      { e: '🤖', n: 'robot ai bot automation' },
      { e: '🔒', n: 'lock security private' },
      { e: '🔑', n: 'key access password auth' },
      { e: '🌐', n: 'globe web internet world network' },
      { e: '📡', n: 'satellite dish network signal' },
      { e: '📱', n: 'mobile phone app smartphone' },
      { e: '☁️', n: 'cloud server hosting weather' },
      { e: '🗄️', n: 'file cabinet database storage' },
      { e: '📅', n: 'calendar date schedule plan' },
      { e: '✉️', n: 'envelope mail email message' },
      { e: '💬', n: 'speech bubble chat comunicación' },
      { e: '📣', n: 'megaphone marketing announce' },
    ],
  },
  {
    id: 'media',
    label: 'Fun & Media',
    icon: '🎮',
    emojis: [
      { e: '🎮', n: 'video game controller gaming play' },
      { e: '🕹️', n: 'joystick arcade game' },
      { e: '🎲', n: 'dice game board random' },
      { e: '🧩', n: 'puzzle piece extension logic' },
      { e: '⚔️', n: 'crossed swords combat rpg osrs battle' },
      { e: '🛡️', n: 'shield defense armor rpg' },
      { e: '🏹', n: 'bow and arrow archery ranged' },
      { e: '🪄', n: 'magic wand spell wizard' },
      { e: '👑', n: 'crown king royal achievement' },
      { e: '🏆', n: 'trophy winner award cup' },
      { e: '🎵', n: 'musical note music song audio' },
      { e: '🎶', n: 'musical notes melody playlist' },
      { e: '🎧', n: 'headphones audio podcast listen' },
      { e: '🎤', n: 'microphone voice record stream' },
      { e: '🎬', n: 'clapper board movie film video' },
      { e: '📺', n: 'television tv show stream youtube' },
      { e: '📷', n: 'camera photo photography picture' },
      { e: '🎨', n: 'artist palette art design paint' },
      { e: '🖌️', n: 'paintbrush draw creative' },
      { e: '📚', n: 'books library read study learn' },
      { e: '📖', n: 'open book reading wiki guide' },
      { e: '📰', n: 'newspaper news articles blog' },
      { e: '🎸', n: 'guitar music rock instrument' },
    ],
  },
  {
    id: 'life',
    label: 'Home & Life',
    icon: '🏠',
    emojis: [
      { e: '🏠', n: 'house home personal living' },
      { e: '🏡', n: 'house garden home family' },
      { e: '🛒', n: 'shopping cart buy store groceries' },
      { e: '🛍️', n: 'shopping bags retail fashion' },
      { e: '💰', n: 'money bag finance bank crypto budget' },
      { e: '💳', n: 'credit card payment shopping' },
      { e: '💎', n: 'gem stone diamond luxury' },
      { e: '🍳', n: 'cooking egg pan food recipe kitchen' },
      { e: '☕', n: 'coffee tea drink cafe morning' },
      { e: '🍕', n: 'pizza food lunch dinner' },
      { e: '🍔', n: 'burger food fastfood' },
      { e: '🍣', n: 'sushi food japanese' },
      { e: '🏋️', n: 'weight lifting gym fitness workout' },
      { e: '🏃', n: 'runner running sport exercise' },
      { e: '⚽', n: 'soccer ball football sport' },
      { e: '🏀', n: 'basketball sport' },
      { e: '🧘', n: 'meditation yoga wellness health' },
      { e: '💊', n: 'pill medicine health doctor' },
      { e: '❤️', n: 'red heart love favorite health' },
      { e: '✨', n: 'sparkles stars magic clean new' },
      { e: '🔥', n: 'fire hot trending lit flame' },
      { e: '⭐', n: 'star favorite featured' },
      { e: '🎯', n: 'bullseye target goal focus' },
      { e: '🎁', n: 'gift present wishlist birthday' },
    ],
  },
  {
    id: 'nature',
    label: 'Nature & Travel',
    icon: '🌍',
    emojis: [
      { e: '🌍', n: 'earth globe europe africa world travel' },
      { e: '🌎', n: 'earth globe americas world' },
      { e: '🌏', n: 'earth globe asia australia world' },
      { e: '🌱', n: 'seedling plant sprout growth nature' },
      { e: '🌿', n: 'herb leaf green nature' },
      { e: '🌲', n: 'evergreen tree forest wood' },
      { e: '🌸', n: 'cherry blossom flower spring pink' },
      { e: '🌻', n: 'sunflower flower yellow sun' },
      { e: '🍀', n: 'four leaf clover luck irish' },
      { e: '🐾', n: 'paw prints pet animal dog cat' },
      { e: '🐶', n: 'dog face puppy pet' },
      { e: '🐱', n: 'cat face kitty pet' },
      { e: '🦊', n: 'fox face animal clever' },
      { e: '🐻', n: 'bear face animal' },
      { e: '🐼', n: 'panda face animal' },
      { e: '🦁', n: 'lion face animal' },
      { e: '🐸', n: 'frog face animal' },
      { e: '🦋', n: 'butterfly insect nature' },
      { e: '✈️', n: 'airplane flight travel vacation trip' },
      { e: '🏖️', n: 'beach umbrella vacation summer sea' },
      { e: '🏔️', n: 'mountain snow peak outdoor camp' },
      { e: '🚗', n: 'car automobile drive road' },
      { e: '🚂', n: 'locomotive train travel' },
      { e: '☀️', n: 'sun sunny weather bright' },
      { e: '🌙', n: 'crescent moon night dark sleep' },
      { e: '🌈', n: 'rainbow colorful pride weather' },
      { e: '🌊', n: 'water wave ocean surf sea' },
    ],
  },
  {
    id: 'smileys',
    label: 'Faces & Symbols',
    icon: '😀',
    emojis: [
      { e: '😀', n: 'grinning smile happy face' },
      { e: '😎', n: 'sunglasses cool chill face' },
      { e: '🤓', n: 'nerd glasses study smart' },
      { e: '🥳', n: 'partying celebrate party hat' },
      { e: '🤔', n: 'thinking face hmm question' },
      { e: '😴', n: 'sleeping face tired zzz' },
      { e: '🤯', n: 'exploding head mind blown' },
      { e: '👻', n: 'ghost spooky fun' },
      { e: '👽', n: 'alien space ufo' },
      { e: '👾', n: 'alien monster arcade retro pixel' },
      { e: '👍', n: 'thumbs up good approve' },
      { e: '👋', n: 'waving hand hello welcome' },
      { e: '🙌', n: 'raising hands hooray celebrate' },
      { e: '💜', n: 'purple heart love' },
      { e: '💙', n: 'blue heart love' },
      { e: '💚', n: 'green heart love' },
      { e: '🧡', n: 'orange heart love' },
      { e: '💛', n: 'yellow heart love' },
      { e: '🩷', n: 'pink heart love' },
      { e: '🩵', n: 'light blue cyan heart' },
      { e: '✅', n: 'check mark done complete' },
      { e: '⚠️', n: 'warning alert caution' },
      { e: '🚫', n: 'prohibited block no' },
      { e: '♾️', n: 'infinity forever loop' },
    ],
  },
];

export interface SpaceModalResult {
  name: string;
  emoji: string;
  color: SpaceColor;
}

function mountModal(renderContent: (close: () => void) => preact.VNode): void {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const close = () => {
    render(null, host);
    host.remove();
  };
  render(renderContent(close), host);
}

function SpaceModalDialog({
  existing,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  existing?: Space;
  canDelete?: boolean;
  onSave: (result: SpaceModalResult) => void;
  onDelete?: (spaceId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [selectedEmoji, setSelectedEmoji] = useState(existing?.emoji || '🌍');
  const [selectedColor, setSelectedColor] = useState<SpaceColor>(existing?.color || 'purple');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [emojiSearchQuery, setEmojiSearchQuery] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const emojiSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, []);

  useEffect(() => {
    if (pickerOpen) {
      emojiSearchRef.current?.focus();
    }
  }, [pickerOpen]);

  const filteredEmojis = useMemo(() => {
    const q = emojiSearchQuery.trim().toLowerCase();
    const cats =
      activeCategoryId === 'all' || q.length > 0
        ? EMOJI_CATEGORIES
        : EMOJI_CATEGORIES.filter((c) => c.id === activeCategoryId);
    const seen = new Set<string>();
    const list: EmojiEntry[] = [];
    for (const cat of cats) {
      for (const item of cat.emojis) {
        if (seen.has(item.e)) continue;
        if (q && !item.n.includes(q) && !item.e.includes(q)) continue;
        seen.add(item.e);
        list.push(item);
      }
    }
    return list;
  }, [activeCategoryId, emojiSearchQuery]);

  const palette = SPACE_COLORS[selectedColor] || SPACE_COLORS.purple;

  const submit = () => {
    onClose();
    onSave({
      name: name.trim() || 'New Space',
      emoji: selectedEmoji || '🌍',
      color: selectedColor,
    });
  };

  return (
    <div
      class="bark-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="bark-modal">
        <div class="bark-modal-header">
          <h3 class="bark-modal-title">{existing ? 'Edit Space' : 'New Space'}</h3>
          <button
            type="button"
            class="bark-icon-btn bark-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div class="bark-modal-body">
          <div
            class="bark-space-preview"
            style={{ background: palette.cardBg, borderColor: palette.border }}
          >
            <span class="bark-preview-emoji">{selectedEmoji}</span>
            <span class="bark-preview-name">{name.trim() || 'Untitled Space'}</span>
            <span
              class="bark-preview-tag"
              style={{ background: palette.pillBg, color: palette.pillText }}
            >
              {palette.label}
            </span>
          </div>

          <label class="bark-field-label">Space Icon & Name</label>
          <div class="bark-space-name-row">
            <button
              type="button"
              class={`bark-emoji-picker-trigger${pickerOpen ? ' open' : ''}`}
              title="Click to choose emoji"
              onClick={() => setPickerOpen(!pickerOpen)}
            >
              <span class="bark-emoji-trigger-char">{selectedEmoji}</span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <input
              ref={nameInputRef}
              type="text"
              class="bark-text-input"
              placeholder="e.g. Work, Personal, Side projects..."
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                } else if (e.key === 'Escape') {
                  onClose();
                }
              }}
            />
          </div>

          {pickerOpen && (
            <div class="bark-emoji-picker-panel">
              <div class="bark-emoji-picker-top">
                <input
                  ref={emojiSearchRef}
                  type="text"
                  class="bark-text-input bark-emoji-search-input"
                  placeholder="Search emojis (e.g. rocket, game, folder)..."
                  value={emojiSearchQuery}
                  onInput={(e) => setEmojiSearchQuery((e.target as HTMLInputElement).value)}
                />
                <input
                  type="text"
                  class="bark-emoji-input"
                  value={selectedEmoji}
                  maxLength={4}
                  title="Or type/paste any emoji directly"
                  onInput={(e) => {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) setSelectedEmoji(val);
                  }}
                />
              </div>

              <div class="bark-emoji-cat-tabs">
                <button
                  type="button"
                  class={`bark-emoji-cat-tab${activeCategoryId === 'all' ? ' active' : ''}`}
                  onClick={() => setActiveCategoryId('all')}
                >
                  All
                </button>
                {EMOJI_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    class={`bark-emoji-cat-tab${activeCategoryId === cat.id ? ' active' : ''}`}
                    title={cat.label}
                    onClick={() => setActiveCategoryId(cat.id)}
                  >
                    {cat.icon} {cat.label.split(' ')[0]}
                  </button>
                ))}
              </div>

              <div class="bark-emoji-picker-grid">
                {filteredEmojis.length === 0 ? (
                  <div class="bark-emoji-empty">
                    No matching emojis — paste any emoji into the box on the right!
                  </div>
                ) : (
                  filteredEmojis.map((item) => (
                    <button
                      key={item.e}
                      type="button"
                      class={`bark-emoji-btn${selectedEmoji === item.e ? ' active' : ''}`}
                      title={item.n.split(' ').slice(0, 2).join(' ')}
                      onClick={() => {
                        setSelectedEmoji(item.e);
                        setPickerOpen(false);
                      }}
                    >
                      {item.e}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <label class="bark-field-label">Space Theme (Synced with Chrome Tab Group)</label>
          <div class="bark-color-grid">
            {(Object.keys(SPACE_COLORS) as SpaceColor[]).map((colorKey) => {
              const p = SPACE_COLORS[colorKey];
              return (
                <button
                  key={colorKey}
                  type="button"
                  class={`bark-color-swatch${selectedColor === colorKey ? ' active' : ''}`}
                  style={{ '--swatch-color': p.hex } as Record<string, string>}
                  title={p.label}
                  onClick={() => setSelectedColor(colorKey)}
                />
              );
            })}
          </div>
        </div>

        <div class="bark-modal-footer">
          {existing && canDelete && onDelete && (
            <button
              type="button"
              class="bark-btn bark-btn-danger"
              onClick={() => {
                onClose();
                onDelete(existing.id);
              }}
            >
              Delete Space
            </button>
          )}
          <div class="bark-modal-footer-right">
            <button type="button" class="bark-btn bark-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" class="bark-btn bark-btn-primary" onClick={submit}>
              {existing ? 'Save Changes' : 'Create Space'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function openSpaceModal(options: {
  existingSpace?: Space;
  canDelete?: boolean;
  onSave: (result: SpaceModalResult) => void;
  onDelete?: (spaceId: string) => void;
}): void {
  mountModal((close) => (
    <SpaceModalDialog
      existing={options.existingSpace}
      canDelete={options.canDelete}
      onSave={options.onSave}
      onDelete={options.onDelete}
      onClose={close}
    />
  ));
}

function PromptModalDialog({
  title,
  label,
  initialValue = '',
  placeholder = '',
  confirmText = 'Save',
  onConfirm,
  onClose,
}: {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (val: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    onClose();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <div
      class="bark-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="bark-modal">
        <div class="bark-modal-header">
          <h3 class="bark-modal-title">{title}</h3>
          <button
            type="button"
            class="bark-icon-btn bark-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div class="bark-modal-body">
          <label class="bark-field-label">{label}</label>
          <input
            ref={inputRef}
            type="text"
            class="bark-text-input bark-prompt-input"
            placeholder={placeholder}
            value={value}
            onInput={(e) => setValue((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
          />
        </div>
        <div class="bark-modal-footer">
          <div class="bark-modal-footer-right">
            <button type="button" class="bark-btn bark-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" class="bark-btn bark-btn-primary" onClick={submit}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function openPromptModal(options: {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (val: string) => void;
}): void {
  mountModal((close) => <PromptModalDialog {...options} onClose={close} />);
}
