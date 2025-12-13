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
    'plumber',
    'cleaning',
    'glass-mirror',
    'interiors-building',
  ],

  // Engineer/Interior related sub-services
  'engineer-interior': [
    'plumber',
    'granite-tiles',
    'painting',
    'mason-mastri',
    'stainless-steel',
    'glass-mirror',
    'interiors-building',
    'cleaning',
  ],

  // Plumber related sub-services
  'plumber': [
    'mason-mastri',
    'borewell',
    'cleaning',
    'contact-building',
  ],

  // Granite & Tiles related sub-services
  'granite-tiles': [
    'mason-mastri',
    'plumber',
    'cleaning',
    'interiors-building',
  ],

  // Contact & Building related sub-services
  'contact-building': [
    'mason-mastri',
    'plumber',
    'granite-tiles',
    'painting',
    'stainless-steel',
    'borewell',
  ],

  // Labor related sub-services
  'labor': [
    'mason-mastri',
    'plumber',
    'cleaning',
    'contact-building',
  ],

  // Mason/Mastri related sub-services
  'mason-mastri': [
    'plumber',
    'granite-tiles',
    'painting',
    'contact-building',
    'stainless-steel',
  ],

  // Interiors of the Building related sub-services
  'interiors-building': [
    'painting',
    'glass-mirror',
    'granite-tiles',
    'cleaning',
    'stainless-steel',
  ],

  // Stainless Steel related sub-services
  'stainless-steel': [
    'mason-mastri',
    'plumber',
    'contact-building',
    'cleaning',
  ],

  // Cleaning related sub-services
  'cleaning': [
    'plumber',
    'glass-mirror',
  ],

  // Glass & Mirror related sub-services
  'glass-mirror': [
    'cleaning',
    'interiors-building',
    'painting',
  ],

  // Borewell related sub-services
  'borewell': [
    'plumber',
    'mason-mastri',
    'cleaning',
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

