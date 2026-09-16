/**
 * Standard Component Contracts and Prop Definitions for Project Atlas.
 * Guarantees visual and functional consistency across platform renderers (Web and Native).
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface BaseButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

export type CardVariant = 'primary' | 'secondary' | 'interactive' | 'statCard';

export interface BaseCardProps {
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  bordered?: boolean;
}

export interface BaseInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
}

export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
  badge?: string | number;
}

export interface BaseTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export type StatusVariant = 'default' | 'positive' | 'negative' | 'warning' | 'info';

export interface BaseBadgeProps {
  variant?: StatusVariant;
  label: string;
  size?: 'sm' | 'md';
}

export interface BaseEmptyStateProps {
  title: string;
  description: string;
  iconName?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface BaseErrorStateProps {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  requestId?: string;
}

export interface BaseStatCardProps {
  label: string;
  value: string;
  subValue?: string;
  changeType?: 'neutral' | 'positive' | 'negative';
  isPlaceholder?: boolean;
}

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}
