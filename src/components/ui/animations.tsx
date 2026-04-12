/**
 * Framer Motion animasyon bileşenleri
 * – PageTransition : sayfa geçişleri
 * – FadeIn         : herhangi bir element için fade + slide
 * – StaggerList    : liste item'larını sırayla göster
 * – ScaleIn        : modal / card pop-in
 */

import { motion, AnimatePresence, type Transition } from 'framer-motion';
import type { ReactNode } from 'react';

const ease = [0.25, 0.1, 0.25, 1] as const;

// ─── Sayfa geçişi ────────────────────────────────────────────────────────────

const inTrans:  Transition = { duration: 0.18, ease };
const outTrans: Transition = { duration: 0.12, ease: 'easeIn' };

const pageVariants = {
  initial:  { opacity: 0, y: 10 },
  animate:  { opacity: 1, y: 0,  transition: inTrans },
  exit:     { opacity: 0, y: -6, transition: outTrans },
};

export function PageTransition({ children, pageKey }: { children: ReactNode; pageKey: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Genel FadeIn ─────────────────────────────────────────────────────────────

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  from?: 'bottom' | 'top' | 'left' | 'right' | 'none';
}

const OFFSETS = {
  bottom: { y: 14 },
  top:    { y: -14 },
  left:   { x: -14 },
  right:  { x: 14 },
  none:   {},
};

export function FadeIn({ children, delay = 0, className, from = 'bottom' }: FadeInProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...OFFSETS[from] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.22, delay, ease } as Transition}
    >
      {children}
    </motion.div>
  );
}

// ─── Stagger container (liste item'ları sırayla) ──────────────────────────────

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.045 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease } as Transition },
};

export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

// ─── Modal / kart pop-in ──────────────────────────────────────────────────────

export function ScaleIn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1,    y: 0 }}
      exit={{    opacity: 0, scale: 0.97, y: 4 }}
      transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ─── Overlay (modal arka planı) ───────────────────────────────────────────────

export function MotionOverlay({ onClick }: { onClick?: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 bg-black/40 z-40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{    opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
    />
  );
}

// ─── AnimatePresence re-export (convenience) ─────────────────────────────────
export { AnimatePresence, motion };
