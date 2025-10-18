/**
 * Utility functions for timezone handling
 */

// Convert UTC timestamp to IST (India Standard Time)
const convertToIST = (utcDate) => {
  if (!utcDate) return null;
  
  const date = new Date(utcDate);
  
  if (isNaN(date.getTime())) {
    console.error('Invalid date object created from:', utcDate);
    return null;
  }
  
  // IST is UTC+5:30
  const istTime = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
  return istTime;
};

// Format date for display
const formatDate = (date, options = {}) => {
  if (!date) return '';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  
  return date.toLocaleDateString('en-IN', { ...defaultOptions, ...options });
};

// Format time for display
const formatTime = (date, options = {}) => {
  if (!date) return '';
  
  // Extract hours and minutes directly to avoid timezone display
  const hours = date.getHours();
  const minutes = date.getMinutes();
  
  // Convert to 12-hour format
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayMinutes = minutes.toString().padStart(2, '0');
  
  return `${displayHours}:${displayMinutes} ${ampm}`;
};

// Get relative time (e.g., "2 hours ago", "3 days ago")
const getRelativeTime = (date) => {
  if (!date) return '';
  
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) {
    return 'Just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  } else {
    return formatDate(date);
  }
};

// Format notification timestamp with all necessary fields
const formatNotificationTimestamp = (utcDate) => {
  if (!utcDate) return null;
  
  try {
    const istTime = convertToIST(utcDate);
    
    const formattedDate = formatDate(istTime);
    const formattedTime = formatTime(istTime);
    const relativeTime = getRelativeTime(new Date(utcDate));
    
    return {
      created_at: utcDate, // Keep original UTC timestamp
      formatted_date: formattedDate,
      formatted_time: formattedTime,
      relative_time: relativeTime
    };
  } catch (error) {
    console.error('Error formatting notification timestamp:', error);
    // Fallback to simple formatting
    const date = new Date(utcDate);
    return {
      created_at: utcDate,
      formatted_date: date.toLocaleDateString('en-IN'),
      formatted_time: formatTime(date), // Use our custom formatTime function
      relative_time: getRelativeTime(date)
    };
  }
};

module.exports = {
  convertToIST,
  formatDate,
  formatTime,
  getRelativeTime,
  formatNotificationTimestamp
}; 