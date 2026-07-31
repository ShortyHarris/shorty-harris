import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOUR_STEPS, type TourStep } from './tourSteps';
import { TourOverlay } from './TourOverlay';

function tourSeenKey(userId: string) {
  return `sh-tour-seen-${userId}`;
}

function hasTourSeen(userId: string): boolean {
  return localStorage.getItem(tourSeenKey(userId)) === '1';
}

function markTourSeen(userId: string) {
  localStorage.setItem(tourSeenKey(userId), '1');
}

interface TourContextValue {
  active: boolean;
  stepIndex: number;
  totalSteps: number;
  currentStep: TourStep | null;
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

export function TourProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-start once, shortly after first mount, for an account that's never
  // seen it — wrapped in setTimeout (not a bare setState-in-effect) so it
  // doesn't fire before the dashboard has settled in.
  useEffect(() => {
    if (!userId || hasTourSeen(userId)) return;
    const t = setTimeout(() => {
      setStepIndex(0);
      setActive(true);
    }, 1000);
    return () => clearTimeout(t);
  }, [userId]);

  const currentStep = active ? (TOUR_STEPS[stepIndex] ?? null) : null;

  // Route-spanning: if the current step lives on a different page, navigate
  // there. currentStep is a stable reference from the TOUR_STEPS array for a
  // given stepIndex, so this only re-fires when the step actually changes.
  useEffect(() => {
    if (currentStep && location.pathname !== currentStep.path) {
      navigate(currentStep.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  function finish() {
    setActive(false);
    markTourSeen(userId);
  }

  function start() {
    setStepIndex(0);
    setActive(true);
  }

  function next() {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      finish();
      return;
    }
    setStepIndex(stepIndex + 1);
  }

  function prev() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function skip() {
    finish();
  }

  return (
    <TourContext.Provider
      value={{ active, stepIndex, totalSteps: TOUR_STEPS.length, currentStep, start, next, prev, skip }}
    >
      {children}
      <TourOverlay />
    </TourContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}
