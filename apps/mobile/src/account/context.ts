import { createContext, useContext } from 'react';
import type { AccountSnapshot } from '@lingvohero/contracts';

export type AccountContext = {
  account: AccountSnapshot | null;
  expired: boolean;
  setExpired: (v: boolean) => void;
  loginScreen: () => void;
  accept: (data: AccountSnapshot & { token?: string; recoveryCode?: string }) => Promise<void>;
  update: (data: AccountSnapshot) => void;
  forget: () => Promise<void>;
};
/* Lives apart from AccountProvider so the welcome screen can use the hook
   without importing the provider that renders it (that was a require cycle). */
export const Context = createContext<AccountContext | null>(null);
export function useAccount() {
  const v = useContext(Context);
  if (!v) throw new Error('AccountProvider missing');
  return v;
}
