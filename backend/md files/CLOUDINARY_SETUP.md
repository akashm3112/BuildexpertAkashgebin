# Cloudinary Setup Guide

## Overview
This backend now supports Cloudinary for image storage. Images are automatically uploaded to Cloudinary and stored as URLs in the database.

## Current Status
⚠️ **Development Mode**: Currently using mock URLs because Cloudinary credentials are not properly configured.

## Setup Instructions

### 1. Create a Cloudinary Account
1. Go to [Cloudinary.com](https://cloudinary.com)
2. Sign up for a free account
3. Verify your email

### 2. Get Your Credentials
1. Log in to your Cloudinary dashboard
2. Go to the "Dashboard" section
3. Copy your credentials:
   - **Cloud Name** (e.g., `my-cloud-name`)
   - **API Key** (e.g., `123456789012345`)
   - **API Secret** (e.g., `abcdefghijklmnopqrstuvwxyz`)

### 3. Update Configuration
Edit `backend/config.env` and replace the placeholder values:

```env
# File Upload Configuration
CLOUDINARY_CLOUD_NAME=your_actual_cloud_name
CLOUDINARY_API_KEY=your_actual_api_key
CLOUDINARY_API_SECRET=your_actual_api_secret
```

### 4. Test the Setup
Run the test script to verify everything works:

```bash
cd backend
node test-cloudinary.js
```

You should see:
- ✅ Single image upload successful
- ✅ Multiple images upload successful
- ✅ Single image deletion successful
- ✅ Multiple images deletion successful

## Features

### Image Upload Endpoints
- `POST /api/upload/single` - Upload single image
- `POST /api/upload/multiple` - Upload multiple images
- `POST /api/upload/base64` - Upload base64 image
- `POST /api/upload/multiple-base64` - Upload multiple base64 images

### Automatic Image Handling
The following features automatically upload images to Cloudinary:

1. **Profile Pictures** - When users update their profile
2. **Working Proof Images** - When providers register/update services
3. **Engineering Certificates** - When providers upload certificates

### Image Deletion
Images are automatically deleted from Cloudinary when:
- Services are cancelled/deleted
- User accounts are deleted
- Images are replaced with new ones

## Folder Structure
Images are organized in Cloudinary folders:
- `buildxpert/profile-pictures/` - User profile pictures
- `buildxpert/working-proofs/` - Service working proof images
- `buildxpert/certificates/` - Engineering certificates
- `buildxpert/test/` - Test images

## Fallback System
If Cloudinary is not configured or fails:
- Mock URLs are generated for development
- App continues to work normally
- No errors are thrown to the frontend

## Security
- All upload endpoints require authentication
- File size limit: 5MB per image
- Only image files are allowed
- Images are optimized automatically

## Troubleshooting

### "Invalid cloud_name" Error
- Check that your cloud name is correct and lowercase
- Ensure you're using the cloud name, not the full URL

### "Invalid API key" Error
- Verify your API key is correct
- Check that your account is active

### "Upload failed" Error
- Check your internet connection
- Verify Cloudinary service status
- Check file size and format

### Mock URLs in Production
If you see mock URLs in production:
1. Check your Cloudinary credentials
2. Verify the config.env file is loaded
3. Restart your server after updating credentials

## Migration from Local Storage
If you have existing images stored locally:
1. Upload them to Cloudinary using the upload endpoints
2. Update the database URLs
3. Remove local image files

## Cost Considerations
- Cloudinary free tier: 25 GB storage, 25 GB bandwidth/month
- Additional usage: $0.04/GB storage, $0.04/GB bandwidth
- Monitor usage in your Cloudinary dashboard 