import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

/** Detects if the current viewport is mobile (<768px). */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/45', className)}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    size?: 'default' | 'lg' | 'xl';
    dismissible?: boolean;
  }
>(({ className, children, size = 'default', dismissible = false, onInteractOutside, onEscapeKeyDown, ...props }, ref) => {
  const isMobile = useIsMobile();

  // Separate DialogHeader (first child) from body so the header is
  // always rendered OUTSIDE the scroll container — on both mobile & desktop.
  // This prevents the header from ever scrolling over form labels.
  const childArray = React.Children.toArray(children);
  const firstIsHeader =
    childArray.length > 0 &&
    React.isValidElement(childArray[0]) &&
    (childArray[0].type as { displayName?: string })?.displayName === 'DialogHeader';

  const headerChild = firstIsHeader ? childArray[0] : null;
  const bodyChildren = firstIsHeader ? childArray.slice(1) : childArray;

  return (
    <DialogPortal>
      {/* Overlay — desktop only */}
      <motion.div
        className="hidden md:block fixed inset-0 z-50 bg-black/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      />

      <DialogPrimitive.Content
        ref={ref}
        onInteractOutside={(e) => {
          if (!dismissible) { e.preventDefault(); return; }
          onInteractOutside?.(e);
        }}
        onEscapeKeyDown={(e) => {
          if (!dismissible) { e.preventDefault(); return; }
          onEscapeKeyDown?.(e);
        }}
        className={cn(
          // Mobile: full-screen
          'fixed inset-0 z-50 w-full h-full',
          // Desktop: centered modal
          'md:inset-auto md:h-auto md:bottom-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%]',
          size === 'default' && 'md:max-w-[600px]',
          size === 'lg'      && 'md:max-w-[800px]',
          size === 'xl'      && 'md:max-w-[920px]',
          'outline-none',
        )}
        {...props}
      >
        {/* Outer shell — flex-col so header never overlaps scrolled content */}
        <motion.div
          className={cn(
            // Mobile: full-screen flex column, gray page background
            'relative flex flex-col h-full bg-[#f7f9fc]',
            // Desktop: rounded modal card, max height, flex column still
            'md:rounded-2xl md:bg-white md:shadow-xl md:max-h-[90vh] md:h-auto',
            className,
          )}
          // Mobile: push content below status bar (safe-area-inset-top)
          style={isMobile ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
          initial={isMobile ? { x: '100%' } : { opacity: 0, y: 40, scale: 0.98 }}
          animate={isMobile ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
          exit={isMobile ? { x: '100%' } : { opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: isMobile ? 0.28 : 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {/* ── Pinned header (never scrolls) ──────────────────────── */}
          {headerChild}

          {/* ── Scrollable body ────────────────────────────────────── */}
          <div
            className="flex-1 overflow-y-auto px-5 pt-3 pb-8 md:px-6 md:pt-2 md:pb-6"
            style={isMobile ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' } : undefined}
          >
            {bodyChildren}
          </div>

          {/* X close — desktop only (absolute in top-right of header area) */}
          <DialogPrimitive.Close className="hidden md:flex absolute right-4 top-4 rounded-sm opacity-50 hover:opacity-100 transition-opacity items-center justify-center">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = 'DialogContent';

/**
 * DialogHeader — rendered OUTSIDE the scroll area by DialogContent,
 * so it never covers scrolled form labels.
 *
 * Mobile: white nav bar with ← back arrow.
 * Desktop: white header row with title + (optional) action buttons.
 */
function DialogHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'shrink-0 flex items-center gap-2',
        // Mobile
        'bg-white/95 [backdrop-filter:blur(20px)] w-full px-3 py-2 border-b border-gray-100',
        // Desktop — no negative margins needed (no parent padding to cancel)
        'md:bg-white md:[backdrop-filter:none] md:px-6 md:pt-6 md:pb-4 md:border-b md:border-gray-100',
        className,
      )}
      {...props}
    >
      {/* Back arrow — mobile only */}
      <DialogPrimitive.Close
        className="md:hidden shrink-0 w-9 h-9 rounded-full hover:bg-black/5 active:bg-black/10 flex items-center justify-center transition-colors"
        aria-label="Geri"
      >
        <ArrowLeft className="h-5 w-5 text-gray-900" />
      </DialogPrimitive.Close>

      {/* Title / action buttons — flex-1 on mobile, contents on desktop */}
      <div className="flex-1 min-w-0 md:contents">
        {children}
      </div>
    </div>
  );
}
DialogHeader.displayName = 'DialogHeader';

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-[15px] font-bold leading-tight md:text-[17px]', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 mt-5 pt-4',
        'md:flex-row md:flex-wrap md:items-center md:justify-end md:gap-2 md:mt-4 md:pt-3 md:border-t md:border-border',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog, DialogTrigger, DialogClose, DialogContent, DialogPortal,
  DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogOverlay,
};
