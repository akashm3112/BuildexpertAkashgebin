/**
 * Test script for LocationIQ reverse geocoding API
 * Usage: node scripts/test-location-api.js [latitude] [longitude]
 * Example: node scripts/test-location-api.js 12.9716 77.5946
 */

const config = require('../utils/config');

// Default coordinates (Bangalore, India)
const defaultLat = 12.9716;
const defaultLon = 77.5946;

const latitude = parseFloat(process.argv[2]) || defaultLat;
const longitude = parseFloat(process.argv[3]) || defaultLon;

async function testLocationAPI() {
  const locationIQConfig = config.getLocationIQConfig();
  const apiKey = locationIQConfig?.apiKey;

  if (!apiKey) {
    console.error('❌ LocationIQ API key not configured in config.env');
    console.log('Please add LOCATIONIQ_API_KEY to your config.env file');
    process.exit(1);
  }

  console.log('🧪 Testing LocationIQ Reverse Geocoding API');
  console.log(`📍 Coordinates: ${latitude}, ${longitude}`);
  console.log('');

  try {
    const url = `https://us1.locationiq.com/v1/reverse.php?key=${apiKey}&lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`;
    
    console.log('📡 Calling LocationIQ API...');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', response.status, response.statusText);
      console.error('Response:', errorText);
      process.exit(1);
    }

    const data = await response.json();
    const address = data.address || {};

    const state = 
      address.state || 
      address.region || 
      address.province || 
      address.state_district || 
      'Unknown';
    
    const city = 
      address.city || 
      address.town || 
      address.village || 
      address.county || 
      address.district || 
      'Unknown';

    console.log('✅ Success!');
    console.log('');
    console.log('📍 Location Details:');
    console.log(`   State: ${state}`);
    console.log(`   City: ${city}`);
    console.log('');
    console.log('📋 Full Address Object:');
    console.log(JSON.stringify(address, null, 2));
    console.log('');
    console.log('✅ Test passed! State and city retrieved correctly.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Use node-fetch if global fetch is not available
let fetch;
if (typeof globalThis.fetch !== 'undefined') {
  fetch = globalThis.fetch;
} else {
  fetch = require('node-fetch');
}

testLocationAPI();

