import { useQuery } from '@tanstack/react-query';
import { journalService } from '@/services/journalService';

export interface JournalFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useJournalEntries(filters?: JournalFilters) {
  return useQuery({
    queryKey: ['journal-entries', filters],
    queryFn: () => journalService.list(filters),
  });
}
