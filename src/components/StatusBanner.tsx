interface StatusBannerProps {
  tone: 'success' | 'error' | 'info';
  message: string;
}

export function StatusBanner({ tone, message }: StatusBannerProps): JSX.Element {
  return <div className={`status-banner ${tone}`}>{message}</div>;
}
