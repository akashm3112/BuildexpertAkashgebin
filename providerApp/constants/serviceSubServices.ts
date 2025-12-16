/**
 * Service Sub-Services Mapping
 * 
 * This file maps each main service category to its related sub-services.
 * Edit this file to add, remove, or modify sub-services for each category.
 * 
 * Format:
 * - Key: Main service category ID (from serviceCategories.ts)
 * - Value: Array of service IDs that are related sub-services
 */

import { SERVICE_CATEGORIES } from './serviceCategories';

// Get all service IDs for reference
const ALL_SERVICE_IDS = SERVICE_CATEGORIES.map(s => s.id);

/**
 * Mapping of main service categories to their related sub-services
 * 
 * Example: If main service is 'painting', sub-services can be:
 * - 'plumber' (for paint-related plumbing work)
 * - 'cleaning' (for paint cleanup)
 * - etc.
 */
export const SERVICE_SUB_SERVICES_MAP: Record<string, string[]> = {
  // Painting related sub-services
  'painting': [
    'Room painting',
    'Fancy wall painting',
    'Wall stricking',
    'Full house painting',
    'wall panelling',
  ],

  // Engineer/Interior related sub-services
  'engineer-interior': [
    '2D planning floor',
    'Structural planning',
    '3D house elevation',
    'Interior design',
    'Shop interior planning/Business plan',
  ],

  // Plumber related sub-services
  'plumber': [
    'Sanatory & pit construction',
    'Fixing & cleaning of bathroom',
    'A to Z plumbing contract',
    'Tap installation',
    'Shower installation',
  ],

  // Granite & Tiles related sub-services
  'granite-tiles': [
    'Wall fitting',
    'Floor fitting',
    'Parking tail fitting',
    'Granite fitting',
    'Brokern tail fitting',
    'Wall stickering',
    'A to Z contract of the building tails fitting',
    ],

  // Contact & Building related sub-services
  'contact-building': [
    'mason-mastri',
    
  ],

  // Labor related sub-services
  'labor': [
    'per hour charges',
  ],

  // Mason/Mastri related sub-services
  'mason-mastri': [
    'Per sqft charges construction',
  ],

  // Interiors of the Building related sub-services
  'interiors-building': [
    'Shop interior',
    'Kitchen interior',
    'Room interior',
    'Top interior',
    'A to Z interior',
  ],

  // Stainless Steel related sub-services
  'stainless-steel': [
    'S.S fitting',
    'M.S fitting',
    'S.S with glass fitting',
  ],

  // Cleaning related sub-services
  'cleaning': [
    'Sump cleaning',
    'Tank cleaning',
    'Bathroom cleaning',
    'Total house cleaning',
  ],

  // Glass & Mirror related sub-services
  'glass-mirror': [
    'glass fitting',
    'mirror fitting',
  ],

  // Borewell related sub-services
  'borewell': [
    'Regular borewell drilling (per sqft charges)',
    'premium borewell drilling (per sqft charges)',
  ],
};

/**
 * Get related sub-services for a main service category
 * @param mainServiceId - The ID of the main service category
 * @returns Array of service IDs that are related sub-services
 */
export const getRelatedSubServices = (mainServiceId: string): string[] => {
  return SERVICE_SUB_SERVICES_MAP[mainServiceId] || [];
};

/**
 * Check if a service is a valid sub-service for a main service
 * @param mainServiceId - The ID of the main service category
 * @param subServiceId - The ID of the potential sub-service
 * @returns true if the sub-service is related to the main service
 */
export const isValidSubService = (mainServiceId: string, subServiceId: string): boolean => {
  const relatedServices = getRelatedSubServices(mainServiceId);
  return relatedServices.includes(subServiceId);
};

/**
 * Get all available sub-services for a main service (excluding the main service itself)
 * @param mainServiceId - The ID of the main service category
 * @returns Array of service objects that can be used as sub-services
 */
export const getAvailableSubServices = (mainServiceId: string) => {
  const relatedServiceIds = getRelatedSubServices(mainServiceId);
  return SERVICE_CATEGORIES.filter(service => 
    relatedServiceIds.includes(service.id) && service.id !== mainServiceId
  );
};

