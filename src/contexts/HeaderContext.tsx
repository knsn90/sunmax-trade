import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface HeaderContextValue {
  action: ReactNode | null;
  setAction: (node: ReactNode | null) => void;
}

const HeaderContext = createContext<HeaderContextValue>({
  action: null,
  setAction: () => {},
});

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [action, setActionState] = useState<ReactNode | null>(null);
  const setAction = useCallback((node: ReactNode | null) => setActionState(node), []);
  return (
    <HeaderContext.Provider value={{ action, setAction }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeaderAction() {
  return useContext(HeaderContext);
}
