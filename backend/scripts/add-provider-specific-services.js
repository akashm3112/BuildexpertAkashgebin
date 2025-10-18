const { query } = require('../database/connection');
require('dotenv').config({ path: './config.env' });

const addProviderSpecificServices = async () => {
  try {
    console.log('🚀 Adding Provider Specific Services table...');

    // Create provider_specific_services table
    await query(`
      CREATE TABLE IF NOT EXISTS provider_specific_services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_service_id UUID REFERENCES provider_services(id) ON DELETE CASCADE,
        service_name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Provider specific services table created');

    // Create index for better performance
    await query(`CREATE INDEX IF NOT EXISTS idx_provider_specific_services_provider_service_id ON provider_specific_services(provider_service_id);`);
    console.log('✅ Index created for provider specific services');

    // Seed some default service options for different service categories
    console.log('🌱 Seeding default service options...');
    
    // Get all active provider services
    const providerServices = await query(`
      SELECT ps.id, sm.name as service_category
      FROM provider_services ps
      JOIN services_master sm ON ps.service_id = sm.id
      WHERE ps.payment_status = 'active'
    `);

    // Default service options for each category
    const defaultServices = {
      'plumber': [
        'Tap Repair',
        'Pipe Leakage',
        'Bathroom Fitting',
        'Kitchen Sink Installation',
        'Water Heater Installation',
        'Drain Cleaning',
        'Toilet Repair',
        'Shower Installation',
        'Water Tank Installation',
        'Other Plumbing Work'
      ],
      'mason-mastri': [
        'Wall Construction',
        'Foundation Work',
        'Brick Laying',
        'Concrete Work',
        'Plastering',
        'Tiling Work',
        'Flooring',
        'Roof Construction',
        'Boundary Wall',
        'Other Masonry Work'
      ],
      'electrician': [
        'Wiring Installation',
        'Switch & Socket Installation',
        'Fan Installation',
        'Light Installation',
        'MCB Installation',
        'Inverter Setup',
        'Generator Installation',
        'Electrical Repair',
        'Safety Equipment Installation',
        'Other Electrical Work'
      ],
      'carpenter': [
        'Door Installation',
        'Window Installation',
        'Furniture Making',
        'Cabinet Installation',
        'Wooden Flooring',
        'Staircase Construction',
        'Wooden Partition',
        'Furniture Repair',
        'Wooden Ceiling',
        'Other Carpentry Work'
      ],
      'painter': [
        'Interior Painting',
        'Exterior Painting',
        'Wall Texture',
        'Wallpaper Installation',
        'Wood Painting',
        'Metal Painting',
        'Waterproofing',
        'Color Consultation',
        'Paint Repair',
        'Other Painting Work'
      ],
      'painting-cleaning': [
        'House Cleaning',
        'Office Cleaning',
        'Deep Cleaning',
        'Carpet Cleaning',
        'Sofa Cleaning',
        'Kitchen Deep Clean',
        'Bathroom Deep Clean',
        'Window Cleaning',
        'Post Construction Cleanup',
        'Other Cleaning Work'
      ],
      'granite-tiles': [
        'Granite Installation',
        'Tile Installation',
        'Marble Installation',
        'Kitchen Countertop',
        'Bathroom Tiling',
        'Floor Tiling',
        'Wall Tiling',
        'Stone Polishing',
        'Tile Repair',
        'Other Tile Work'
      ],
      'engineer-interior': [
        'Interior Design',
        'Space Planning',
        '3D Visualization',
        'Material Selection',
        'Furniture Design',
        'Lighting Design',
        'Color Scheme Design',
        'Renovation Planning',
        'Project Management',
        'Other Interior Work'
      ],
      'labors': [
        'Loading & Unloading',
        'Material Transportation',
        'Site Cleaning',
        'Demolition Work',
        'Digging Work',
        'Construction Support',
        'Manual Labor',
        'Site Preparation',
        'Waste Removal',
        'Other Labor Work'
      ],
      'interiors-building': [
        'Complete Interior Design',
        'Modular Kitchen',
        'Wardrobe Design',
        'False Ceiling',
        'Wall Paneling',
        'Flooring Solutions',
        'Lighting Solutions',
        'Furniture Installation',
        'Renovation Services',
        'Other Interior Building Work'
      ],
      'stainless-steel': [
        'Kitchen Sink Installation',
        'Staircase Railing',
        'Gate Installation',
        'Window Grill',
        'Balcony Railing',
        'Stainless Steel Fabrication',
        'Kitchen Accessories',
        'Bathroom Accessories',
        'Custom Steel Work',
        'Other Steel Work'
      ],
      'contact-building': [
        'Complete House Construction',
        'Commercial Building',
        'Renovation Services',
        'Extension Work',
        'Structural Work',
        'Foundation Construction',
        'Roof Construction',
        'Building Maintenance',
        'Construction Consultation',
        'Other Building Work'
      ]
    };

    // Add default services for each provider
    for (const providerService of providerServices.rows) {
      const serviceCategory = providerService.service_category;
      const defaultServiceList = defaultServices[serviceCategory] || [];
      
      for (const serviceName of defaultServiceList) {
        // Check if service already exists
        const existingService = await query(`
          SELECT id FROM provider_specific_services 
          WHERE provider_service_id = $1 AND service_name = $2
        `, [providerService.id, serviceName]);
        
        if (existingService.rows.length === 0) {
          await query(`
            INSERT INTO provider_specific_services (provider_service_id, service_name, description)
            VALUES ($1, $2, $3)
          `, [providerService.id, serviceName, `Professional ${serviceName} service`]);
        }
      }
    }

    console.log('✅ Default service options seeded successfully');
    console.log('🎉 Provider specific services setup completed!');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
};

// Run setup if this file is executed directly
if (require.main === module) {
  addProviderSpecificServices()
    .then(() => {
      console.log('Setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { addProviderSpecificServices };
