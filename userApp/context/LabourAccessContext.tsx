import React, { createContext, useContext, useState, useEffect } from 'react';
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

  const checkLabourAccess = async () => {
    try {
      console.log('🔍 Checking labour access from context...');
      
      const localAccessData = await AsyncStorage.getItem('labour_access_status');
      if (localAccessData) {
        const parsedData = JSON.parse(localAccessData);
        console.log('📊 Local labour access data:', parsedData);
        
        // Check if access is still valid
        const now = new Date();
        const endDate = new Date(parsedData.endDate);
        
        if (endDate > now) {
          // Update days remaining
          const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          parsedData.daysRemaining = daysRemaining;
          setLabourAccessStatus(parsedData);
          console.log('✅ Labour access is active:', parsedData);
        } else {
          // Access expired, remove from local storage
          await AsyncStorage.removeItem('labour_access_status');
          setLabourAccessStatus(null);
          console.log('❌ Labour access expired');
        }
      } else {
        setLabourAccessStatus(null);
        console.log('❌ No labour access found');
      }
    } catch (error) {
      console.error('❌ Error checking labour access:', error);
      setLabourAccessStatus(null);
    }
  };

  const grantLabourAccess = async () => {
    try {
      console.log('🎉 Granting labour access...');
      
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7); // 7 days from now
      
      const labourAccessData: LabourAccessData = {
        hasAccess: true,
        accessStatus: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        daysRemaining: 7,
        isExpired: false
      };
      
      // Store in AsyncStorage
      await AsyncStorage.setItem('labour_access_status', JSON.stringify(labourAccessData));
      setLabourAccessStatus(labourAccessData);
      
      console.log('✅ Labour access granted successfully!');
    } catch (error) {
      console.error('❌ Error granting labour access:', error);
    }
  };

  const clearLabourAccess = async () => {
    try {
      await AsyncStorage.removeItem('labour_access_status');
      setLabourAccessStatus(null);
      console.log('🗑️ Labour access cleared');
    } catch (error) {
      console.error('❌ Error clearing labour access:', error);
    }
  };

  // Check labour access on mount
  useEffect(() => {
    checkLabourAccess();
  }, []);

  // Check labour access every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      checkLabourAccess();
    }, 30000);

    return () => clearInterval(interval);
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
