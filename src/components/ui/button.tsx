import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand-500 text-white border border-brand-500 hover:bg-brand-600',
        secondary: 'bg-brand-500 text-white border border-brand-500 hover:bg-brand-600',
        purple: 'bg-purple-600 text-white border border-purple-600 hover:bg-purple-700',
        outline: 'border border-border bg-white text-gray-700 hover:bg-gray-50',
        destructive: 'bg-white text-red-500 border border-red-200 hover:bg-red-50',
        edit: 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100',
        ghost: 'hover:bg-gray-100 text-gray-700',
        link: 'text-brand-500 underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-8 px-3.5 py-1.5',
        sm: 'h-7 px-2.5 py-1 text-[11px]',
        xs: 'h-5 px-1.5 py-0.5 text-[10px] rounded',
        lg: 'h-10 px-5 text-sm',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
