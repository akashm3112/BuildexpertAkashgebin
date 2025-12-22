/**
 * Service Sub-Services Mapping
 * 
 * This file maps each main service category to its related sub-services.
 * Edit this file to add, remove, or modify sub-services for each category.
 * 
 * Format:
 * - Key: Main service category ID (from serviceCategories.ts)
 * - Value: Array of sub-service objects with id and name
 */

export interface SubServiceOption {
  id: string; // Unique identifier for the sub-service
  name: string; // Display name (English, used as translation key)
}

/**
 * Mapping of main service categories to their related sub-services
 */
export const SERVICE_SUB_SERVICES_MAP: Record<string, SubServiceOption[]> = {
  // Painting related sub-services
  'painting': [
    { id: 'room-painting', name: 'Room painting' },
    { id: 'fancy-wall-painting', name: 'Fancy wall painting' },
    { id: 'wall-striking', name: 'Wall striking' },
    { id: 'full-house-painting', name: 'Full house painting' },
    { id: 'wall-panelling', name: 'Wall panelling' },
  ],

  // Engineer/Interior related sub-services
  'engineer-interior': [
    { id: '2d-planning-floor', name: '2D planning floor' },
    { id: 'structural-planning', name: 'Structural planning' },
    { id: '3d-house-elevation', name: '3D house elevation' },
    { id: 'interior-design', name: 'Interior design' },
    { id: 'shop-interior-planning', name: 'Shop interior planning/Business plan' },
  ],

  // Plumber related sub-services
  'plumber': [
    { id: 'sanitary-pit-construction', name: 'Sanitary & pit construction' },
    { id: 'bathroom-fixing-cleaning', name: 'Fixing & cleaning of bathroom' },
    { id: 'a-to-z-plumbing-contract', name: 'A to Z plumbing contract' },
    { id: 'tap-installation', name: 'Tap installation' },
    { id: 'shower-installation', name: 'Shower installation' },
  ],

  // Granite & Tiles related sub-services
  'granite-tiles': [
    { id: 'wall-fitting', name: 'Wall fitting' },
    { id: 'floor-fitting', name: 'Floor fitting' },
    { id: 'parking-tile-fitting', name: 'Parking tile fitting' },
    { id: 'granite-fitting', name: 'Granite fitting' },
    { id: 'broken-tile-fitting', name: 'Broken tile fitting' },
    { id: 'wall-stickering', name: 'Wall stickering' },
    { id: 'a-to-z-tiles-contract', name: 'A to Z contract of the building tiles fitting' },
  ],

  // Contact & Building related sub-services
  'contact-building': [
    { id: 'general-contractor', name: 'General contractor' },
    { id: 'prime-contractor', name: 'Prime contractor' },
    { id: 'speciality-trade-contractor', name: 'Speciality trade contractor' },
    { id: 'design-build-contractor', name: 'Design & build contractor' },
    { id: 'residential-commercial-contractor', name: 'Residential/commercial contractor' },
  ],

  // Labor related sub-services
  'labor': [
    { id: 'per-hour-charges', name: 'Per hour charges' },
  ],

  // Mason/Mastri related sub-services
  'mason-mastri': [
    { id: 'per-sqft-construction', name: 'Per sqft charges construction' },
  ],

  // Interiors of the Building related sub-services
  'interiors-building': [
    { id: 'shop-interior', name: 'Shop interior' },
    { id: 'kitchen-interior', name: 'Kitchen interior' },
    { id: 'room-interior', name: 'Room interior' },
    { id: 'top-interior', name: 'Top interior' },
    { id: 'a-to-z-interior', name: 'A to Z interior' },
  ],

  // Stainless Steel related sub-services
  'stainless-steel': [
    { id: 'ss-fitting', name: 'S.S fitting' },
    { id: 'ms-fitting', name: 'M.S fitting' },
    { id: 'ss-with-glass-fitting', name: 'S.S with glass fitting' },
  ],

  // Cleaning related sub-services
  'cleaning': [
    { id: 'sump-cleaning', name: 'Sump cleaning' },
    { id: 'tank-cleaning', name: 'Tank cleaning' },
    { id: 'bathroom-cleaning', name: 'Bathroom cleaning' },
    { id: 'total-house-cleaning', name: 'Total house cleaning' },
  ],

  // Glass & Mirror related sub-services
  'glass-mirror': [
    { id: 'glass-fitting', name: 'Glass fitting' },
    { id: 'mirror-fitting', name: 'Mirror fitting' },
  ],

  // Borewell related sub-services
  'borewell': [
    { id: 'regular-borewell-drilling', name: 'Regular borewell drilling (per sqft charges)' },
    { id: 'premium-borewell-drilling', name: 'Premium borewell drilling (per sqft charges)' },
  ],
};

/**
 * Get related sub-services for a main service category
 * @param mainServiceId - The ID of the main service category
 * @returns Array of sub-service options
 */
export const getRelatedSubServices = (mainServiceId: string): SubServiceOption[] => {
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
  return relatedServices.some(service => service.id === subServiceId);
};

/**
 * Get a sub-service option by its ID
 * @param mainServiceId - The ID of the main service category
 * @param subServiceId - The ID of the sub-service
 * @returns The sub-service option or undefined
 */
export const getSubServiceById = (mainServiceId: string, subServiceId: string): SubServiceOption | undefined => {
  const relatedServices = getRelatedSubServices(mainServiceId);
  return relatedServices.find(service => service.id === subServiceId);
};

