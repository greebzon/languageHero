import { createContext, useContext } from 'react';

/* Opens and closes the side menu from any screen (the ☰ button in the headers). */
export type DrawerControls = { open: () => void; close: () => void };
const Context = createContext<DrawerControls | null>(null);
export const DrawerProvider = Context.Provider;
/** Outside the signed-in app (no menu there) the controls do nothing. */
export function useDrawer(): DrawerControls {
  return useContext(Context) ?? { open: () => {}, close: () => {} };
}
