/**
 * Format numbers in Indian style with abbreviations
 * Examples:
 * - 1000 -> "1k"
 * - 1500 -> "1.5k"
 * - 150000 -> "1.5L"
 * - 1500000 -> "15L"
 * - 10000000 -> "1Cr"
 */
export const formatIndianNumber = (amount: number | string | null | undefined): string => {
  if (amount === null || amount === undefined || amount === '') {
    return '₹0';
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount) || numAmount === 0) {
    return '₹0';
  }

  const absAmount = Math.abs(numAmount);
  const sign = numAmount < 0 ? '-' : '';

  // Crores (1,00,00,000)
  if (absAmount >= 10000000) {
    const crores = absAmount / 10000000;
    return `${sign}₹${crores % 1 === 0 ? crores.toFixed(0) : crores.toFixed(1)}Cr`;
  }

  // Lakhs (1,00,000)
  if (absAmount >= 100000) {
    const lakhs = absAmount / 100000;
    return `${sign}₹${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`;
  }

  // Thousands (1,000)
  if (absAmount >= 1000) {
    const thousands = absAmount / 1000;
    return `${sign}₹${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
  }

  // Less than 1000 - show full number with Indian formatting
  return `${sign}₹${absAmount.toLocaleString('en-IN')}`;
};

