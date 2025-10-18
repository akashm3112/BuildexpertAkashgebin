# 🚀 Quick Start: Get WebRTC Calling Working

## ⚠️ Important: Expo Go Doesn't Support WebRTC!

The error you're seeing (`"WebRTC not available on web"`) happens because **Expo Go doesn't include react-native-webrtc**. 

You have **2 options**:

---

## ✅ Option 1: Create Custom Development Build (RECOMMENDED)

This is like Expo Go, but with WebRTC support included.

### Step 1: Install EAS CLI
```bash
npm install -g eas-cli
```

### Step 2: Login to EAS
```bash
eas login
```
If you don't have an account, create one at https://expo.dev

### Step 3: Build UserApp
```bash
cd userApp
npx eas-cli build --profile development --platform android
```

**What happens:**
- EAS builds a custom APK in the cloud (~15 minutes)
- Downloads a link when done
- Free for development builds!

### Step 4: Build ProviderApp
```bash
cd providerApp
npx eas-cli build --profile development --platform android
```

### Step 5: Install Both APKs
1. Download APKs from the links provided
2. Transfer to your Android phones
3. Install both apps
4. Allow "Install from unknown sources" if prompted

### Step 6: Run Dev Server & Test
```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - UserApp
cd userApp
npx expo start --dev-client

# Terminal 3 - ProviderApp  
cd providerApp
npx expo start --dev-client
```

**Important**: Use `--dev-client` flag, NOT regular expo start!

### Step 7: Connect & Test
1. Open your custom **UserApp** on phone
2. Scan QR code from Terminal 2
3. Login: `9902958254` / `akash123`

4. Open your custom **ProviderApp** on another phone
5. Scan QR code from Terminal 3
6. Login: `9902898562` / `murthy123`

7. Create booking → Accept → Click Call! 📞

---

## 🔄 Option 2: Use Batch Scripts (Windows)

I've created helper scripts for you:

### UserApp
```bash
cd userApp
build-dev-android.bat
```

### ProviderApp
```bash
cd providerApp
build-dev-android.bat
```

These scripts will guide you through the build process.

---

## ❓ FAQ

### Q: Can I use Expo Go?
**A**: No, Expo Go doesn't support react-native-webrtc. You MUST use a custom development build.

### Q: How long does the build take?
**A**: First build: ~15-20 minutes. After that, rebuilds are faster (~5-10 min).

### Q: Is it free?
**A**: Yes! EAS offers free builds for open source and personal projects.

### Q: Do I need to rebuild every time I change code?
**A**: No! After installing the custom dev client once, it works like Expo Go:
- Hot reload works
- Fast refresh works
- Only rebuild if you change native code or add new native dependencies

### Q: What if I don't want to use EAS?
**A**: You can build locally, but it requires:
- Android Studio installed
- Gradle setup
- Much more complex
- EAS is recommended for beginners

### Q: Can I test on web for now?
**A**: Yes! Web version works for everything EXCEPT calling. To test calling, you need Android/iOS builds.

---

## 🎯 Simplest Path Forward

### For Testing RIGHT NOW:

**Option A: Build with EAS (15 min wait, then works forever)**
```bash
npm install -g eas-cli
eas login
cd userApp
eas build --profile development --platform android
# Wait for build, install APK, test!
```

**Option B: Test everything except calling**
```bash
# Use Expo Go or web for now
# Skip calling feature testing
# Build custom client when ready for call testing
```

---

## 📱 After Custom Build Is Installed

Your workflow becomes:
```bash
# Terminal 1 - Backend
cd backend && npm start

# Terminal 2 - UserApp  
cd userApp && npx expo start --dev-client

# Terminal 3 - ProviderApp
cd providerApp && npx expo start --dev-client
```

Then just scan QR codes with your custom development builds (not Expo Go).

**Everything** will work including WebRTC calling! 🎉

---

## 🆘 If You Get Stuck

### Error: "expo-dev-client not found"
```bash
cd userApp
npm install expo-dev-client
cd ../providerApp
npm install expo-dev-client
```

### Error: "Not logged in to EAS"
```bash
eas login
```

### Error: "Account doesn't exist"
Go to https://expo.dev and sign up (free)

### Build Failed
Check the EAS build logs at: https://expo.dev/accounts/[your-account]/builds

---

## 🎊 Summary

**Problem**: Expo Go doesn't support WebRTC  
**Solution**: Create custom development build with EAS  
**Time**: 15-20 minutes for first build  
**Cost**: FREE  
**Result**: Full WebRTC calling works perfectly!  

Would you like me to guide you through creating the build step-by-step?

