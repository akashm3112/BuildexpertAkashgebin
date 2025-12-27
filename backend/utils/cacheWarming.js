/**
 * Cache Warming Utility
 * 
 * Pre-loads frequently accessed data into cache on application startup
 * This improves initial response times and reduces database load
 */

const { CacheKeys, cacheQuery } = require('./cacheIntegration');
const { caches } = require('./cacheManager');
const { getRow, getRows } = require('../database/connection');
const logger = require('./logger');

/**
 * Warm static data cache (services, mappings, descriptions)
 */
async function warmStaticCache() {
  try {
    logger.info('Warming static cache...');
    
    // Warm services list (first page)
    await cacheQuery(CacheKeys.servicesList(1, 50), async () => {
      const countResult = await getRow(`SELECT COUNT(*) as total FROM services_master`);
      const total = parseInt(countResult?.total || 0, 10);
      const services = await getRows(`
        SELECT id, name, is_paid, created_at
        FROM services_master 
        ORDER BY name
        LIMIT 50 OFFSET 0
      `);
      
      return {
        status: 'success',
        data: { 
          services,
          pagination: {
            currentPage: 1,
            totalPages: Math.ceil(total / 50),
            total,
            limit: 50,
            hasMore: total > 50
          }
        }
      };
    }, { cacheType: 'static', ttl: 3600000 });
    
    // Warm service count
    await cacheQuery(CacheKeys.servicesCount(), async () => {
      const countResult = await getRow(`SELECT COUNT(*) as total FROM services_master`);
      return parseInt(countResult?.total || 0, 10);
    }, { cacheType: 'static', ttl: 3600000 });
    
    // Warm all services for quick lookup
    const allServices = await getRows(`
      SELECT id, name, is_paid, created_at
      FROM services_master 
      ORDER BY name
    `);
    
    allServices.forEach(service => {
      const cacheKey = CacheKeys.serviceById(service.id);
      caches.static.set(cacheKey, {
        status: 'success',
        data: { service }
      }, { ttl: 3600000 });
    });
    
    logger.info('Static cache warmed', { 
      servicesCount: allServices.length 
    });
  } catch (error) {
    logger.error('Error warming static cache', { error: error.message });
  }
}

/**
 * Warm service mappings and descriptions (static data)
 */
async function warmServiceMappings() {
  try {
    // Service category mappings are static - cache them
    const serviceMappings = {
      'labor': 'labors',
      'plumber': 'plumber',
      'mason-mastri': 'mason-mastri',
      'painting-cleaning': 'painting',
      'painting': 'painting',
      'cleaning': 'cleaning',
      'granite-tiles': 'granite-tiles',
      'engineer-interior': 'engineer-interior',
      'electrician': 'electrician',
      'carpenter': 'carpenter',
      'painter': 'painting',
      'interiors-building': 'interiors-building',
      'stainless-steel': 'stainless-steel',
      'contact-building': 'contact-building',
      'glass-mirror': 'glass-mirror',
      'borewell': 'borewell'
    };
    
    caches.static.set(CacheKeys.serviceMappings(), serviceMappings, { ttl: 3600000 });
    
    // Service descriptions
    const serviceDescriptions = {
      'labors': 'Construction Labor, Brick Loading, Cement Mixing, Site Preparation, Foundation Work',
      'plumber': 'Tap Repair, Pipe Leakage, Bathroom Fitting, Water Tank Installation, Drainage Work',
      'electrician': 'Wiring Installation, Switch & Socket Installation, Fan Installation, MCB Installation',
      'carpenter': 'Door Installation, Window Installation, Furniture Making, Wood Work',
      'painter': 'Interior Painting, Exterior Painting, Wall Texture, Color Consultation',
      'painting': 'Interior Painting, Exterior Painting, Wall Texture, Color Consultation',
      'cleaning': 'House Cleaning, Office Cleaning, Deep Cleaning, Post Construction Cleaning',
      'mason-mastri': 'Brick Work, Cement Work, Wall Construction, Foundation Work',
      'granite-tiles': 'Floor Tiling, Wall Tiling, Granite Installation, Marble Work',
      'engineer-interior': 'Interior Design, Space Planning, 3D Visualization, Project Management',
      'interiors-building': 'Interior Design, Furniture Arrangement, Lighting Design, Color Schemes',
      'stainless-steel': 'Kitchen Sink Installation, Railing Work, Gate Installation, Fabrication',
      'contact-building': 'Complete Construction, Building Work, Project Management, Quality Control',
      'borewell': 'Borewell Drilling, Pump Installation, Maintenance, Water Testing'
    };
    
    caches.static.set(CacheKeys.serviceDescriptions(), serviceDescriptions, { ttl: 3600000 });
    
    logger.info('Service mappings cache warmed');
  } catch (error) {
    logger.error('Error warming service mappings cache', { error: error.message });
  }
}

/**
 * Warm all caches on application startup
 */
async function warmAllCaches() {
  try {
    logger.info('Starting cache warming...');
    
    // Warm in parallel for faster startup
    await Promise.all([
      warmStaticCache(),
      warmServiceMappings()
    ]);
    
    logger.info('Cache warming completed');
  } catch (error) {
    logger.error('Error during cache warming', { error: error.message });
    // Don't throw - cache warming failure shouldn't prevent app startup
  }
}

module.exports = {
  warmStaticCache,
  warmServiceMappings,
  warmAllCaches
};

