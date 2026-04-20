import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

type TabOption<T extends string> = {
  value: T;
  label: string;
};

type SettingsShellProps = {
  children: ReactNode;
};

export function SettingsShell({ children }: SettingsShellProps) {
  return <div className="options-shell">{children}</div>;
}

type SettingsHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
};

export function SettingsHeader({ eyebrow, title, subtitle }: SettingsHeaderProps) {
  return (
    <header className="header">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="title">{title}</h1>
      <p className="subtitle">{subtitle}</p>
    </header>
  );
}

type SettingsCardProps = {
  children: ReactNode;
  className?: string;
};

export function SettingsCard({ children, className }: SettingsCardProps) {
  return <section className={className ? `card ${className}` : 'card'}>{children}</section>;
}

type SettingsTabsProps<T extends string> = {
  active: T;
  tabs: ReadonlyArray<TabOption<T>>;
  onChange: (value: T) => void;
};

export function SettingsTabs<T extends string>({ active, tabs, onChange }: SettingsTabsProps<T>) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tab ${isActive ? 'active' : ''}`}
            onClick={() => onChange(tab.value)}
          >
            {isActive && (
              <motion.span
                layoutId="settings-tab-pill"
                className="tab-pill"
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              />
            )}
            <span className="tab-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type CollapseProps = {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
};

export function Collapse({ isOpen, children, className }: CollapseProps) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          className={className}
          style={{ overflow: 'hidden' }}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type SettingsModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function SettingsModal({ open, title, onClose, children, footer }: SettingsModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="modal"
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <div className="modal-head">
              <div className="modal-title">{title}</div>
              <button
                type="button"
                className="modal-close"
                onClick={onClose}
                aria-label="Close modal"
              >
                X
              </button>
            </div>
            {children}
            {footer && <div className="modal-actions">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
