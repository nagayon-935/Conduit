import type { LayoutType, Profile } from '../types';
import './TabBar.css';

export interface Tab {
  id: string;
  host: string;
  port: number;
  user: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  layoutType: LayoutType;
  paneTabIds: (string | null)[];
  onLayoutChange: (layout: LayoutType) => void;
  profiles?: Profile[];
}

function tabLabel(tab: Tab, profiles: Profile[] = []): string {
  const matched = profiles.find(p => p.host === tab.host && p.port === tab.port && p.user === tab.user);
  if (matched) return matched.name;
  const portSuffix = tab.port === 22 ? '' : `:${tab.port}`;
  return `${tab.user}@${tab.host}${portSuffix}`;
}

function LayoutIcon({ type }: { type: LayoutType }) {
  return (
    <span className={`layout-icon layout-icon--${type}`} aria-hidden="true">
      {type === '1' && <span />}
      {type === '2v' && <><span /><span /></>}
      {type === '2h' && <><span /><span /></>}
      {type === '4' && <><span /><span /><span /><span /></>}
    </span>
  );
}

const LAYOUT_BTNS: { key: LayoutType; title: string; minTabs: number }[] = [
  { key: '1',  title: 'Single pane',  minTabs: 1 },
  { key: '2v', title: 'Side by side (Ctrl+D)',       minTabs: 2 },
  { key: '2h', title: 'Top / Bottom (Ctrl+Shift+D)', minTabs: 2 },
  { key: '4',  title: '2×2 grid',     minTabs: 2 },
];

export function TabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
  layoutType,
  paneTabIds,
  onLayoutChange,
  profiles = [],
}: TabBarProps) {
  const isInSplit = layoutType !== '1';

  // Sessions currently shown in split panes (in pane order, skipping nulls)
  const paneSessions = paneTabIds
    .filter((id): id is string => id !== null)
    .map((id) => tabs.find((t) => t.id === id))
    .filter((t): t is Tab => t !== undefined);

  // Tabs NOT assigned to any pane (background sessions)
  const backgroundTabs = tabs.filter((t) => !paneTabIds.includes(t.id));

  return (
    <div className="tab-bar" role="tablist">
      {isInSplit ? (
        <>
          {/* Background tabs (not in any current pane) */}
          {backgroundTabs.map((tab) => (
            <div
              key={tab.id}
              className="tab-item tab-item--bg"
              role="tab"
              aria-selected={false}
              onClick={() => onSelect(tab.id)}
              title={tabLabel(tab, profiles)}
            >
              <span>{tabLabel(tab, profiles)}</span>
              <button
                className="tab-close"
                aria-label={`Close ${tabLabel(tab, profiles)}`}
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              >✕</button>
            </div>
          ))}

          {/* Aggregated chip — all pane sessions in one */}
          {paneSessions.length > 0 && (
            <div className="tab-split-group" title="Split view sessions">
              <span className="tab-split-group-icon" aria-hidden="true">⊞</span>
              {paneSessions.map((tab, i) => (
                <span key={tab.id} className="tab-split-group-entry">
                  {i > 0 && <span className="tab-split-group-sep" aria-hidden="true">│</span>}
                  <span>{tabLabel(tab, profiles)}</span>
                  <button
                    className="tab-close"
                    aria-label={`Close ${tabLabel(tab, profiles)}`}
                    onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                  >✕</button>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Normal mode: all tabs individually */
        tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={`tab-item${isActive ? ' active' : ''}`}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab.id)}
              title={tabLabel(tab, profiles)}
            >
              <span>{tabLabel(tab, profiles)}</span>
              <button
                className="tab-close"
                aria-label={`Close ${tabLabel(tab, profiles)}`}
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              >✕</button>
            </div>
          );
        })
      )}

      {/* + button — stays next to tabs */}
      <button
        className="tab-new-btn"
        aria-label="New connection"
        title="New connection"
        onClick={onNew}
      >+</button>

      {/* Spacer — pushes layout buttons to the right */}
      <div className="tab-bar-spacer" />

      {/* Layout buttons — always right end */}
      <div className="tab-layout-group">
        {LAYOUT_BTNS.map(({ key, title, minTabs }) => (
          <button
            key={key}
            className={`tab-layout-btn${layoutType === key ? ' active' : ''}`}
            title={title}
            onClick={() => onLayoutChange(key)}
            disabled={tabs.length < minTabs}
          >
            <LayoutIcon type={key} />
          </button>
        ))}
      </div>
    </div>
  );
}
