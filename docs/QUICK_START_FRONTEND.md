# Quick Start Guide - Frontend Authentication Update

**TL;DR:** The authentication system now uses refresh tokens. You need to update your frontend code and use secure storage.

---

## 🚀 Quick Implementation (5 Steps)

### 1. Install Secure Storage

```bash
# For Expo
npx expo install expo-secure-store

# For Bare React Native
npm install react-native-keychain
cd ios && pod install
```

---

### 2. Copy These 3 Files to Your Project

Download from `docs/AUTHENTICATION_UPDATE_FRONTEND.md`:

- ✅ `services/secureStorage.ts` - Secure token storage
- ✅ `services/api.ts` - Axios with auto-refresh
- ✅ `services/auth.ts` - Authentication methods

---

### 3. Update Login/Register Code

**Before:**
```typescript
const response = await axios.post('/auth/login', { email, password });
await AsyncStorage.setItem('token', response.data.token);
```

**After:**
```typescript
import { AuthService } from './services/auth';

await AuthService.login({ email, password });
// That's it! Tokens stored securely automatically
```

---

### 4. Update API Calls

**Before:**
```typescript
const token = await AsyncStorage.getItem('token');
const response = await axios.get('/habits', {
  headers: { Authorization: `Bearer ${token}` }
});
```

**After:**
```typescript
import { api } from './services/api';

const response = await api.get('/habits');
// Token added automatically, auto-refreshes when expired!
```

---

### 5. Update Logout

**Before:**
```typescript
await AsyncStorage.removeItem('token');
```

**After:**
```typescript
import { AuthService } from './services/auth';

await AuthService.logout();
// Tokens invalidated on server + cleared locally
```

---

## 📋 What Changed?

### API Response Format

**Before:**
```json
{
  "token": "eyJhbGc..."
}
```

**After:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "dGhpc...",
  "expiresIn": 900
}
```

### Token Lifespan

- **Access Token:** 15 minutes (was 1 hour)
- **Refresh Token:** 7 days (new)
- **Session Length:** Up to 7 days with auto-renewal

### New Endpoint

```typescript
POST /auth/refresh

Body: { "refreshToken": "..." }

Response: {
  "accessToken": "new...",
  "refreshToken": "new...",
  "expiresIn": 900
}
```

---

## ⚠️ Important Security Changes

### ❌ DO NOT Use AsyncStorage

```typescript
// ❌ WRONG - AsyncStorage is NOT secure
await AsyncStorage.setItem('token', accessToken);

// ✅ CORRECT - Use secure storage
await SecureStorage.setTokens(accessToken, refreshToken);
```

### ✅ Recommended: Secure Storage

**Expo:**
- Uses **iOS Keychain** (encrypted)
- Uses **Android Keystore** (hardware-backed encryption)

**React Native Keychain:**
- Same security features
- Bonus: Biometric authentication support

---

## 🔄 How Auto-Refresh Works

```
1. User logs in
   → Receives: accessToken (15 min) + refreshToken (7 days)

2. User makes API call after 16 minutes
   → Access token expired → Auto refresh triggered

3. Frontend calls /auth/refresh
   → Receives: NEW accessToken + NEW refreshToken

4. Original API call retried automatically
   → User doesn't notice anything!
```

**You don't need to handle this manually!** The `api` service does it automatically.

---

## 🛠️ Minimal Code Example

```typescript
// services/secureStorage.ts
import * as SecureStore from 'expo-secure-store';

export const SecureStorage = {
  setTokens: (accessToken: string, refreshToken: string) => {
    await SecureStore.setItemAsync('accessToken', accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);
  },
  getAccessToken: () => SecureStore.getItemAsync('accessToken'),
  getRefreshToken: () => SecureStore.getItemAsync('refreshToken'),
  clearTokens: () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
  },
};

// services/auth.ts
import { api } from './api';
import { SecureStorage } from './secureStorage';

export const AuthService = {
  login: async (credentials) => {
    const { data } = await api.post('/auth/login', credentials);
    await SecureStorage.setTokens(data.accessToken, data.refreshToken);
    return data;
  },

  logout: async () => {
    const refreshToken = await SecureStorage.getRefreshToken();
    await api.post('/auth/logout', { refreshToken });
    await SecureStorage.clearTokens();
  },
};

// App.tsx
import { AuthService } from './services/auth';
import { api } from './services/api';

// Login
await AuthService.login({ email, password });

// Make authenticated calls (auto-refresh handled!)
const habits = await api.get('/habits');

// Logout
await AuthService.logout();
```

---

## 🚨 Common Issues & Solutions

### Issue: "Too many requests" error

**Cause:** Rate limiting (5 login attempts per 15 minutes)

**Solution:**
```typescript
catch (error) {
  if (error.response?.status === 429) {
    alert('Too many attempts. Wait 15 minutes.');
  }
}
```

---

### Issue: User keeps getting logged out

**Possible causes:**
1. ❌ Not storing refresh token
2. ❌ Not calling `/auth/refresh` on 401
3. ❌ Not updating stored tokens after refresh

**Solution:** Use the provided `api.ts` with interceptors - it handles everything!

---

### Issue: Tokens not persisting after app restart

**Cause:** Using regular variables or AsyncStorage incorrectly

**Solution:** Use `expo-secure-store` or `react-native-keychain`

---

## ✅ Testing Checklist

Quick tests to verify everything works:

- [ ] Login successfully
- [ ] App restart - still logged in
- [ ] Wait 15+ minutes - API calls still work (auto-refresh)
- [ ] Logout - cannot make API calls anymore
- [ ] Login 6 times wrong password - rate limited
- [ ] Check AsyncStorage - no tokens there (should be in secure storage)

---

## 📚 Need More Details?

See the full guide: `docs/AUTHENTICATION_UPDATE_FRONTEND.md`

Includes:
- Complete code examples
- Error handling patterns
- Security best practices
- Biometric authentication
- Full React Native implementation

---

## 🆘 Quick Help

**Problem:** I get 401 errors on all requests

**Check:**
1. Are you using the `api` instance from `services/api.ts`?
2. Are tokens stored in secure storage?
3. Check React Native Debugger network tab

**Problem:** Auto-refresh not working

**Check:**
1. Is the interceptor configured in `api.ts`?
2. Is refresh token stored?
3. Is `/auth/refresh` endpoint accessible?

**Problem:** Tokens in AsyncStorage

**Fix:** Migrate to secure storage immediately! AsyncStorage is NOT encrypted.

---

## 💡 Pro Tips

1. **Test on real device** - Secure storage behaves differently on simulators
2. **Use HTTPS** - Never send tokens over HTTP
3. **Don't log tokens** - Remove all `console.log(token)` in production
4. **Clear tokens on 401** - If refresh fails, logout user
5. **Handle offline mode** - Queue requests when offline, retry when online

---

**Questions?** Read the full documentation or contact backend team!
