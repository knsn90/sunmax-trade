import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    className={cn(
      'fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
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
    <DialogOverlay />
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
        // Mobile: bottom sheet anchored to bottom
        'fixed bottom-0 left-0 right-0 z-50 w-full',
        'bg-white rounded-t-2xl p-5 shadow-xl',
        'max-h-[92vh] overflow-y-auto',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        // Desktop: centered dialog
        'md:bottom-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%]',
        'md:rounded-xl md:p-6',
        'md:data-[state=closed]:slide-out-to-bottom-0 md:data-[state=open]:slide-in-from-bottom-0',
        'md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95',
        size === 'default' && 'md:max-w-[600px]',
        size === 'lg' && 'md:max-w-[800px]',
        size === 'xl' && 'md:max-w-[920px]',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-50 hover:opacity-100 transition-opacity">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4', className)} {...props} />;
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
