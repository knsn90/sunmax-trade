import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

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
>(({ className, children, size = 'default', dismissible = false, onInteractOutside, onEscapeKeyDown, ...props }, ref) => (
  <DialogPortal>
    {/* Overlay — fade */}
    <motion.div
      className="fixed inset-0 z-50 bg-black/45"
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
      asChild
      {...props}
    >
      <motion.div
        className={cn(
          // Mobile: bottom sheet
          'fixed bottom-0 left-0 right-0 z-50 w-full',
          'bg-white rounded-t-2xl p-5 shadow-xl',
          'max-h-[92vh] overflow-y-auto',
          // Desktop: centered
          'md:bottom-auto md:left-[50%] md:top-[5vh] md:translate-x-[-50%]',
          'md:rounded-2xl md:p-6',
          size === 'default' && 'md:max-w-[600px]',
          size === 'lg'      && 'md:max-w-[800px]',
          size === 'xl'      && 'md:max-w-[920px]',
          className,
        )}
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0,  scale: 1,    transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] } }}
        exit={{    opacity: 0, y: 20, scale: 0.97, transition: { duration: 0.15, ease: 'easeIn' } }}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-50 hover:opacity-100 transition-opacity">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </motion.div>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 bg-white',
        '-mx-5 px-5 -mt-5 pt-5 pb-4 md:-mx-6 md:px-6 md:-mt-6 md:pt-6',
        'mb-2',
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-[17px] font-bold', className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 mt-4 pt-3 border-t border-border',
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
