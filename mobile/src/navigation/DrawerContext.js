import { createContext, useContext } from 'react';

export const DrawerContext = createContext(null);

export const useDrawer = () => useContext(DrawerContext);
