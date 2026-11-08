/**
 * AI Text Loading — shimmering status text that cycles through what the AI is doing.
 * Adapted from kokonutui (MIT, https://kokonutui.com): uses framer-motion (the same library
 * as `motion/react`, already in this app), the theme's own colours so it works in light and
 * dark mode, and a static line for people who prefer reduced motion.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface AITextLoadingProps {
  texts?: string[];
  className?: string;
  /** Milliseconds each line stays on screen. */
  interval?: number;
  /** Stop on the last line instead of starting again (for steps that happen in order). */
  stopAtEnd?: boolean;
}

export function AITextLoading({
  texts = ['Thinking…', 'Processing…', 'Analyzing…', 'Almost there…'],
  className,
  interval = 1800,
  stopAtEnd = false,
}: AITextLoadingProps) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (stopAtEnd ? Math.min(i + 1, texts.length - 1) : (i + 1) % texts.length));
    }, interval);
    return () => clearInterval(timer);
  }, [interval, texts.length, stopAtEnd]);

  const text = texts[index] ?? '';
  const shimmer = cn(
    'bg-[length:200%_100%] bg-gradient-to-r from-foreground via-muted-foreground/40 to-foreground bg-clip-text text-transparent',
    className,
  );

  if (reduce) return <p className={cn('m-0', className)} aria-live="polite">{text}</p>;

  return (
    <div className="relative flex min-h-[1.5em] items-center justify-center" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          className={cn('m-0 whitespace-nowrap', shimmer)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, backgroundPosition: ['200% center', '-200% center'] }}
          exit={{ opacity: 0, y: -12 }}
          transition={{
            opacity: { duration: 0.3 },
            y: { duration: 0.3 },
            backgroundPosition: { duration: 2.5, ease: 'linear', repeat: Number.POSITIVE_INFINITY },
          }}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

export default AITextLoading;
