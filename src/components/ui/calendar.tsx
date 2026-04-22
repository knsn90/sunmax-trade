import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-3',
        month_caption: 'flex justify-center pt-1 relative items-center gap-1',
        caption_label: 'text-[13px] font-bold text-gray-900',
        dropdowns: 'flex gap-2 items-center',
        dropdown: 'text-[12px] font-semibold text-gray-800 bg-gray-100 rounded-lg px-2 py-1 border-0 outline-none cursor-pointer hover:bg-gray-200 transition-colors appearance-none',
        dropdown_root: 'relative',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          'absolute left-1 top-0 h-7 w-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors',
        ),
        button_next: cn(
          'absolute right-1 top-0 h-7 w-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-gray-400 rounded-md w-9 font-bold text-[10px] text-center py-1',
        week: 'flex w-full mt-1',
        day: 'h-9 w-9 text-center text-[13px] p-0 relative focus-within:relative focus-within:z-20',
        day_button: cn(
          'h-9 w-9 p-0 font-medium rounded-full flex items-center justify-center transition-colors w-full',
          'hover:bg-gray-100 text-gray-800',
          'aria-selected:opacity-100',
        ),
        selected: '[&>button]:bg-red-600 [&>button]:text-white [&>button]:font-bold [&>button]:hover:bg-red-700',
        today: '[&>button]:text-red-600 [&>button]:font-bold',
        outside: '[&>button]:text-gray-300 [&>button]:hover:bg-gray-50',
        disabled: '[&>button]:text-gray-200 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
