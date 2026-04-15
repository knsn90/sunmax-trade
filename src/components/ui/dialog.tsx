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

  return (
    <DialogPortal>
      {/* ── Overlay — desktop only ─────────────────────────────────── */}
      <motion.div
        className="hidden md:block fixed inset-0 z-50 bg-black/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      />

      {/* ── Content wrapper ────────────────────────────────────────── */}
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
          // Mobile: full-screen page
          'fixed inset-0 z-50 w-full h-full',
          // Desktop: centered modal
          'md:inset-auto md:h-auto md:bottom-auto md:left-[50%] md:top-[5vh] md:translate-x-[-50%]',
          size === 'default' && 'md:max-w-[600px]',
          size === 'lg'      && 'md:max-w-[800px]',
          size === 'xl'      && 'md:max-w-[920px]',
          'outline-none',
        )}
        {...props}
      >
        {/* ── Visual / animation wrapper ─────────────────────────── */}
        <motion.div
          className={cn(
            // Mobile: full-screen scrollable page
            'relative h-full overflow-y-auto bg-[#f7f9fc] p-5',
            // Desktop: modal card
            'md:rounded-2xl md:bg-white md:p-6 md:shadow-xl md:max-h-[90vh] md:h-auto',
            className,
          )}
          style={{ paddingBottom: isMobile ? 'calc(env(safe-area-inset-bottom) + 32px)' : undefined }}
          initial={isMobile ? { x: '100%' } : { opacity: 0, y: 40, scale: 0.98 }}
          animate={isMobile ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
          exit={isMobile ? { x: '100%' } : { opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: isMobile ? 0.28 : 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {children}

          {/* X close — desktop only */}
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
 * DialogHeader — on mobile renders a sticky white nav bar with a back-arrow
 * (DialogClose). On desktop keeps the existing compact sticky style.
 */
function DialogHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10',
        // Mobile: full-width white bar, flex row with back arrow
        'bg-white/95 [backdrop-filter:blur(20px)] -mx-5 px-3 -mt-5 pt-1.5 pb-2',
        'flex items-center gap-2',
        'border-b border-gray-100',
        // Desktop: existing compact style
        'md:bg-white md:[backdrop-filter:none] md:-mx-6 md:px-6 md:-mt-6 md:pt-6 md:pb-4 md:border-0 md:block',
        'mb-3',
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

      {/* Title area — takes remaining space on mobile, full width on desktop */}
      <div className="flex-1 min-w-0 md:contents">
        {children}
      </div>
    </div>
  );
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        'text-[15px] font-bold leading-tight',
        // Mobile: tighter
        'md:text-[17px]',
        className,
      )}
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
        // Mobile: full-width stacked buttons
        'flex flex-col gap-2 mt-5 pt-4',
        // Desktop: inline right-aligned
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
