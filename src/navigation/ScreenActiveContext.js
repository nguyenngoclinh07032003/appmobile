import React from 'react';

export const ScreenActiveCtx = React.createContext(true);
export const useScreenActive = () => React.useContext(ScreenActiveCtx);
