/**
 * AI Text Loading — shimmering status text that cycles through what the AI is doing.
 * Adapted from kokonutui (MIT, https://kokonutui.com): uses framer-motion (the same library
 * as `motion/react`, already in this app), the theme's own colours so it works in light and
 * dark mode. For people who prefer reduced motion the line does not move or shimmer; it fades
 * gently instead, so it never looks frozen.
 *
 * The shimmer is a CSS animation (`.ai-shimmer` in index.css), not a framer-motion animation of
 * background-position: iOS Safari often stops repainting text with `background-clip: text` when
 * its background is moved from JavaScript, which made the line look frozen on iPhones.
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
    'ai-shimmer bg-[length:200%_100%] bg-gradient-to-r from-foreground via-muted-foreground/40 to-foreground bg-clip-text text-transparent',
    className,
  );

  if (reduce) {
    return (
      <motion.p
        className={cn('m-0', className)}
        aria-live="polite"
        animate={{ opacity: [1, 0.45, 1] }}
        transition={{ duration: 1.8, ease: 'easeInOut', repeat: Number.POSITIVE_INFINITY }}
      >
        {text}
      </motion.p>
    );
  }

  return (
    <div className="relative flex min-h-[1.5em] items-center justify-center" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          className={cn('m-0 whitespace-nowrap', shimmer)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

export default AITextLoading;
