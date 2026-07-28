interface LoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Loader({ size = 'md', className = '' }: LoaderProps) {
  const sizeMap = {
    sm: { width: '16px', height: '16px', borderWidth: '2px' },
    md: { width: '32px', height: '32px', borderWidth: '3px' },
    lg: { width: '40px', height: '40px', borderWidth: '4px' },
    xl: { width: '64px', height: '64px', borderWidth: '4px' }
  };

  const dimensions = sizeMap[size];

  return (
    <div
      className={className}
      role="status"
      aria-label="Loading"
      style={{
        width: dimensions.width,
        height: dimensions.height,
        border: `${dimensions.borderWidth} solid #d1d5db`,
        borderTopColor: '#3a3a3a',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}
    />
  );
}

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function LoadingState({ message = 'Loading...', size = 'lg' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <Loader size={size} className="mb-4" />
      <p className="text-sm text-[#6b7280] bricolage-grotesque">{message}</p>
    </div>
  );
}
