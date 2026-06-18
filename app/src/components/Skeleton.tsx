/* Skeleton loading primitives — shared across admin pages */

function Sk({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#ece8df] ${className}`} />;
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#ece8df] bg-white">
      <div className="flex gap-4 border-b border-[#ece8df] bg-[#fbf9f5] px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Sk key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-[#f5f2ec] px-4 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <Sk key={j} className={`h-3 flex-1 ${j === 0 ? 'max-w-[160px]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-[#ece8df] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <Sk className="h-4 w-36" />
            <Sk className="h-5 w-16 rounded-full" />
          </div>
          <Sk className="mb-2 h-3 w-48" />
          <Sk className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTiles({ count = 4, cols = 4 }: { count?: number; cols?: number }) {
  return (
    <div className={`grid gap-3 grid-cols-2 ${cols === 4 ? 'md:grid-cols-4' : cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border border-[#ece8df] bg-white px-5 py-[18px]">
          <Sk className="mb-2 h-8 w-16" />
          <Sk className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="animate-pulse rounded-lg border border-[#ece8df] bg-white p-5">
      <Sk className="mb-4 h-4 w-32" />
      <Sk className="h-[240px] w-full rounded-lg" />
    </div>
  );
}
