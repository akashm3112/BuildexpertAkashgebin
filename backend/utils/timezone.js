const convertToIST = (utcDate) => {
  if (!utcDate) return null;
  
  try {
    const date = new Date(utcDate);
    
    if (isNaN(date.getTime())) {
      console.error('Invalid date object created from:', utcDate);
      return null;
    }
    
    // Database stores timestamps in IST (Asia/Kolkata timezone)
    // For display, we format them using IST timezone
    // The date object already contains the correct UTC timestamp
    // We just need to format it in IST timezone for display
    return date;
  } catch (error) {
    console.error('Error converting to IST:', error);
    return null;
  }
};

// Format date for display
const formatDate = (date, options = {}) => {
  if (!date) return '';
  
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Kolkata'
    };
    
    return dateObj.toLocaleDateString('en-IN', { ...defaultOptions, ...options });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

// Format time for display
const formatTime = (date, options = {}) => {
  if (!date) return '';
  
  try {
    const dateObj = new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    // Format time directly in IST using toLocaleTimeString
    const istTimeString = dateObj.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    return istTimeString;
  } catch (error) {
    console.error('Error formatting time:', error);
    // Fallback: simple format
    try {
      const dateObj = new Date(date);
      const hours = dateObj.getHours();
      const minutes = dateObj.getMinutes();
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayMinutes = minutes.toString().padStart(2, '0');
      return `${displayHours}:${displayMinutes} ${ampm}`;
    } catch {
      return '';
    }
  }
};

// Format appointment time string (handles null, empty, or "00:00:00")
const formatAppointmentTime = (timeStr) => {
  if (!timeStr || timeStr.trim() === '' || timeStr === '00:00:00' || timeStr === '00:00') {
    return null;
  }
  
  try {
    // Handle different time formats
    let hours, minutes;
    
    // Check if it's already in 12-hour format (e.g., "2:00 PM")
    if (timeStr.includes('AM') || timeStr.includes('PM') || timeStr.includes('am') || timeStr.includes('pm')) {
      return timeStr; // Already formatted
    }
    
    // Parse 24-hour format (e.g., "14:00" or "14:00:00")
    const timeParts = timeStr.split(':');
    if (timeParts.length >= 2) {
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1], 10);
      
      if (isNaN(hours) || isNaN(minutes)) {
        return null;
      }
      
      // Convert to 12-hour format
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayMinutes = minutes.toString().padStart(2, '0');
      
      return `${displayHours}:${displayMinutes} ${ampm}`;
    }
    
    return null;
  } catch (error) {
    console.error('Error formatting appointment time:', error);
    return null;
  }
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
    const dateObj = new Date(utcDate);
    
    if (isNaN(dateObj.getTime())) {
      console.error('Invalid date in formatNotificationTimestamp:', utcDate);
      return null;
    }
    
    // Format directly in IST timezone
    const formattedDate = formatDate(dateObj);
    const formattedTime = formatTime(dateObj);
    const relativeTime = getRelativeTime(dateObj);
    
    return {
      created_at: utcDate, // Keep original timestamp
      formatted_date: formattedDate,
      formatted_time: formattedTime,
      relative_time: relativeTime
    };
  } catch (error) {
    console.error('Error formatting notification timestamp:', error);
    // Fallback to simple formatting
    try {
      const date = new Date(utcDate);
      return {
        created_at: utcDate,
        formatted_date: date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
        formatted_time: date.toLocaleTimeString('en-IN', { 
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
        relative_time: getRelativeTime(date)
      };
    } catch (fallbackError) {
      console.error('Fallback formatting also failed:', fallbackError);
      return {
        created_at: utcDate,
        formatted_date: '',
        formatted_time: '',
        relative_time: 'Recently'
      };
    }
  }
};

module.exports = {
  convertToIST,
  formatDate,
  formatTime,
  formatAppointmentTime,
  getRelativeTime,
  formatNotificationTimestamp
}; 