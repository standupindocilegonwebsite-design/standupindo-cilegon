interface Props {
  className?: string;
  count?: number;
}

export function LoadingSkeleton({ className = '', count = 3 }: Props) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="skeleton h-44 w-full rounded-none" />
          <div className="p-4 space-y-3">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
            <div className="flex gap-2 pt-1">
              <div className="skeleton h-8 w-24 rounded-lg" />
              <div className="skeleton h-8 w-24 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
