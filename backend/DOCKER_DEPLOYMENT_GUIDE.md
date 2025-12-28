# Docker Deployment Guide - BuildXpert Backend

## Quick Start

### 1. Build Docker Image

```bash
cd backend
docker build -t buildxpert-api:latest .
```

### 2. Run Docker Container

```bash
docker run -d \
  --name buildxpert-api \
  -p 5000:5000 \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e DATABASE_URL="your_database_url" \
  -e JWT_SECRET="your_jwt_secret" \
  -e ALLOWED_ORIGINS="https://your-domain.com" \
  -e CLOUDINARY_CLOUD_NAME="your_cloudinary_name" \
  -e CLOUDINARY_API_KEY="your_cloudinary_key" \
  -e CLOUDINARY_API_SECRET="your_cloudinary_secret" \
  -e TWILIO_ACCOUNT_SID="your_twilio_sid" \
  -e TWILIO_AUTH_TOKEN="your_twilio_token" \
  -e TWILIO_PHONE_NUMBER="your_twilio_number" \
  -e PAYTM_MID="your_paytm_mid" \
  -e PAYTM_MERCHANT_KEY="your_paytm_key" \
  -e EXPO_ACCESS_TOKEN="your_expo_access_token" \
  buildxpert-api:latest
```

### 3. Using Docker Compose (Easier)

**Create `.env` file:**
```env
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your_secret
ALLOWED_ORIGINS=https://your-domain.com
CLOUDINARY_CLOUD_NAME=your_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_number
PAYTM_MID=your_mid
PAYTM_MERCHANT_KEY=your_key
EXPO_ACCESS_TOKEN=your_expo_access_token
```

**Run:**
```bash
docker-compose up -d
```

---

## Deploy to Cloud Platforms

### Render

1. **Create `render.yaml`:**
```yaml
services:
  - type: web
    name: buildxpert-api
    dockerfilePath: ./backend/Dockerfile
    dockerContext: ./backend
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      # Add all your environment variables
```

2. **Deploy:** Push to GitHub → Auto-deploys

### Railway

1. **Connect GitHub repo**
2. **Select `backend` folder**
3. **Add environment variables**
4. **Deploy**

### AWS ECS / Google Cloud Run / Azure Container Instances

1. **Build image:**
```bash
docker build -t buildxpert-api:latest .
```

2. **Push to container registry:**
```bash
# Tag for your registry
docker tag buildxpert-api:latest your-registry/buildxpert-api:latest

# Push
docker push your-registry/buildxpert-api:latest
```

3. **Deploy using platform-specific tools**

---

## Environment Variables

All environment variables from `config.env` should be set in your hosting platform:

**Required:**
- `NODE_ENV=production`
- `PORT=5000` (or platform default)
- `DATABASE_URL` (your PostgreSQL connection string)
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `PAYTM_MID`
- `PAYTM_MERCHANT_KEY`
- `EXPO_ACCESS_TOKEN` (for push notifications - get from https://expo.dev/accounts/[your-account]/settings/access-tokens)

**Optional:**
- `OTP_EXPIRE=300000`
- `MAX_FILE_SIZE=5242880`
- `RATE_LIMIT_WINDOW_MS=900000`
- `RATE_LIMIT_MAX_REQUESTS=100`

---

## Health Check

The container includes a health check:
```bash
curl http://localhost:5000/health
```

---

## Logs

**View logs:**
```bash
docker logs buildxpert-api
docker logs -f buildxpert-api  # Follow logs
```

**Logs are stored in:** `/app/logs` (inside container)

---

## Database Migrations

Migrations should run automatically on first startup, or run manually:

```bash
docker exec buildxpert-api node migrations/run-all-migrations.js
```

---

## Production Best Practices

✅ **Multi-stage build** - Smaller image size  
✅ **Non-root user** - Security  
✅ **Health checks** - Container orchestration  
✅ **Signal handling** - Graceful shutdowns  
✅ **Environment variables** - No secrets in image  
✅ **Optimized layers** - Faster builds  

---

## Troubleshooting

### Container won't start:
```bash
docker logs buildxpert-api
```

### Check if running:
```bash
docker ps
```

### Restart container:
```bash
docker restart buildxpert-api
```

### Remove and recreate:
```bash
docker stop buildxpert-api
docker rm buildxpert-api
docker-compose up -d
```

---

## Image Size Optimization

Current setup uses:
- **Alpine Linux** (small base image)
- **Multi-stage build** (only production deps)
- **Layer caching** (faster rebuilds)

**Expected size:** ~150-200MB

---

## Security

✅ **Non-root user** - Runs as `nodejs` user  
✅ **Minimal base image** - Alpine Linux  
✅ **No secrets in image** - All via environment variables  
✅ **Health checks** - Monitor container health  
✅ **Signal handling** - Graceful shutdowns  

---

## Next Steps

1. ✅ Build image: `docker build -t buildxpert-api:latest .`
2. ✅ Test locally: `docker-compose up`
3. ✅ Push to registry (if using cloud)
4. ✅ Deploy to hosting platform
5. ✅ Update frontend API URLs
6. ✅ Rebuild APKs with new backend URL

