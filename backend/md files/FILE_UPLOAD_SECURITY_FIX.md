# File Upload Security & Performance Fix

## Problem
The previous implementation used Base64 uploads with minimal validation, which posed security risks and performance issues:
- No file content validation (magic bytes checking)
- Base64 encoding increases payload size by ~33%
- No protection against malicious file uploads
- MIME type spoofing vulnerabilities

## Solution Implemented

### 1. Production-Ready Multipart Uploads
- **Endpoint**: `POST /api/upload/single` (multipart/form-data)
- **Endpoint**: `POST /api/upload/multiple` (multipart/form-data)
- Direct buffer uploads to Cloudinary (no base64 conversion)
- Proper file validation with magic bytes checking
- Size limits enforced (5MB per file, 10 files max)

### 2. File Validation Utility (`backend/utils/fileValidation.js`)
- **Magic Bytes Detection**: Validates actual file content, not just MIME type
- **Supported Formats**: JPEG, PNG, GIF, WebP, BMP
- **Security Checks**:
  - File signature validation
  - MIME type mismatch detection
  - Suspicious content pattern detection
  - File size validation
- **Comprehensive Logging**: Security warnings for suspicious uploads

### 3. Enhanced Cloudinary Integration
- **New Functions**:
  - `uploadImageFromBuffer()`: Direct buffer upload (no base64)
  - `uploadMultipleImagesFromBuffers()`: Batch buffer uploads
  - `generateSignedUploadUrl()`: For direct client-to-cloud uploads
- **Performance**: ~33% smaller payloads, faster uploads
- **Reliability**: Circuit breaker and retry logic maintained

### 4. Deprecated Base64 Endpoints
- `/api/upload/base64` - Still works but deprecated
- `/api/upload/multiple-base64` - Still works but deprecated
- Both endpoints now include validation and deprecation warnings
- Backward compatibility maintained for existing clients

### 5. Signed URL Support
- **Endpoint**: `GET /api/upload/signed-url?folder=xxx&filename=xxx`
- Enables direct client-to-cloud uploads (bypasses server)
- Useful for large files or high-volume uploads

## Usage Examples

### Single File Upload (Recommended)
```javascript
// Frontend (React Native)
const formData = new FormData();
formData.append('image', {
  uri: imageUri,
  type: 'image/jpeg',
  name: 'photo.jpg'
});
formData.append('folder', 'buildxpert');

const response = await fetch(`${API_URL}/api/upload/single`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'multipart/form-data',
  },
  body: formData
});
```

### Multiple Files Upload
```javascript
const formData = new FormData();
images.forEach((image, index) => {
  formData.append('images', {
    uri: image.uri,
    type: 'image/jpeg',
    name: `photo-${index}.jpg`
  });
});
formData.append('folder', 'buildxpert');

const response = await fetch(`${API_URL}/api/upload/multiple`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'multipart/form-data',
  },
  body: formData
});
```

### Get Signed URL (Direct Upload)
```javascript
const response = await fetch(
  `${API_URL}/api/upload/signed-url?folder=buildxpert&filename=my-image.jpg`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const { data } = await response.json();
// Use data.uploadUrl to upload directly to Cloudinary
```

## Security Features

1. **Magic Bytes Validation**: Files are validated by their actual content, not just declared MIME type
2. **File Size Limits**: 5MB per file, enforced at multiple levels
3. **Type Restrictions**: Only image formats allowed (JPEG, PNG, GIF, WebP, BMP)
4. **Content Scanning**: Detects suspicious patterns (script tags, executable content)
5. **MIME Type Verification**: Warns when declared type doesn't match actual content
6. **Rate Limiting**: Upload endpoints protected by rate limiting middleware
7. **Authentication**: All upload endpoints require authentication

## Migration Guide

### For Frontend Developers

**Old Way (Base64 - Deprecated):**
```javascript
const base64 = await convertToBase64(imageUri);
const response = await fetch(`${API_URL}/api/upload/base64`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ image: base64, folder: 'buildxpert' })
});
```

**New Way (Multipart - Recommended):**
```javascript
const formData = new FormData();
formData.append('image', {
  uri: imageUri,
  type: 'image/jpeg',
  name: 'photo.jpg'
});

const response = await fetch(`${API_URL}/api/upload/single`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'multipart/form-data',
  },
  body: formData
});
```

## Benefits

1. **Security**: Comprehensive file validation prevents malicious uploads
2. **Performance**: ~33% smaller payloads, faster uploads
3. **Reliability**: Better error handling and validation
4. **Scalability**: Direct buffer uploads reduce server memory usage
5. **Compliance**: Production-ready security standards

## Testing

Test the new endpoints:
```bash
# Single file upload
curl -X POST http://localhost:5000/api/upload/single \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@/path/to/image.jpg" \
  -F "folder=buildxpert"

# Multiple files upload
curl -X POST http://localhost:5000/api/upload/multiple \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg" \
  -F "folder=buildxpert"
```

## Notes

- Base64 endpoints remain functional for backward compatibility
- All uploads are logged for security auditing
- Failed validations are logged with user context
- File validation happens before Cloudinary upload (saves bandwidth)

