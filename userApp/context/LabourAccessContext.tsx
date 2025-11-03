import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface LabourAccessData {
  hasAccess: boolean;
  accessStatus: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  isExpired: boolean;
}

interface LabourAccessContextType {
  labourAccessStatus: LabourAccessData | null;
  setLabourAccessStatus: (status: LabourAccessData | null) => void;
  checkLabourAccess: () => Promise<void>;
  grantLabourAccess: () => Promise<void>;
  clearLabourAccess: () => Promise<void>;
}

const LabourAccessContext = createContext<LabourAccessContextType | undefined>(undefined);

export const useLabourAccess = () => {
  const context = useContext(LabourAccessContext);
  if (!context) {
    throw new Error('useLabourAccess must be used within a LabourAccessProvider');
  }
  return context;
};

export const LabourAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [labourAccessStatus, setLabourAccessStatus] = useState<LabourAccessData | null>(null);
  const appState = useRef(AppState.currentState);

  const checkLabourAccess = async () => {
    try {
      const localAccessData = await AsyncStorage.getItem('labour_access_status');
      if (localAccessData) {
        const parsedData = JSON.parse(localAccessData);
        const now = new Date();
        const endDate = new Date(parsedData.endDate);
        if (endDate > now) {
          const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          parsedData.daysRemaining = daysRemaining;
          setLabourAccessStatus(parsedData);
        } else {
          await AsyncStorage.removeItem('labour_access_status');
          setLabourAccessStatus(null);
        }
      } else {
        setLabourAccessStatus(null);
      }
    } catch (error) {
      console.error('Error checking labour access:', error);
      setLabourAccessStatus(null);
    }
  };

  const grantLabourAccess = async () => {
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      const labourAccessData: LabourAccessData = {
        hasAccess: true,
        accessStatus: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        daysRemaining: 7,
        isExpired: false
      };
      await AsyncStorage.setItem('labour_access_status', JSON.stringify(labourAccessData));
      setLabourAccessStatus(labourAccessData);
    } catch (error) {
      console.error('Error granting labour access:', error);
    }
  };

  const clearLabourAccess = async () => {
    try {
      await AsyncStorage.removeItem('labour_access_status');
      setLabourAccessStatus(null);
    } catch (error) {
      console.error('Error clearing labour access:', error);
    }
  };

  useEffect(() => {
    checkLabourAccess();
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      checkLabourAccess();
    }
    appState.current = nextAppState;
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);

  const value: LabourAccessContextType = {
    labourAccessStatus,
    setLabourAccessStatus,
    checkLabourAccess,
    grantLabourAccess,
    clearLabourAccess,
  };

  return (
    <LabourAccessContext.Provider value={value}>
      {children}
    </LabourAccessContext.Provider>
  );
};
