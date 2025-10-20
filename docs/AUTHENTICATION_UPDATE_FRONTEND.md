# Authentication System Update - Frontend Implementation Guide

**Last Updated:** October 19, 2025
**Breaking Changes:** Yes
**Migration Required:** Yes

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [What Changed](#what-changed)
3. [API Changes](#api-changes)
4. [Security Improvements](#security-improvements)
5. [React Native Implementation](#react-native-implementation)
6. [Secure Token Storage](#secure-token-storage)
7. [Migration Guide](#migration-guide)
8. [Error Handling](#error-handling)
9. [Testing Checklist](#testing-checklist)

---

## 🎯 Overview

The authentication system has been upgraded with three major security improvements:

1. **Refresh Token System** - Long-lived sessions with short-lived access tokens
2. **Token Blacklist** - Effective logout that immediately invalidates tokens
3. **Rate Limiting** - Protection against brute force attacks

---

## 🔄 What Changed

### Before vs After

| Feature | Before | After |
|---------|--------|-------|
| **Token Duration** | 1 hour (fixed) | 15 minutes (access) + 7 days (refresh) |
| **Response Format** | `{ token }` | `{ accessToken, refreshToken, expiresIn }` |
| **Session Length** | 1 hour max | Up to 7 days (auto-renewable) |
| **Logout** | Client-side only | Server-side token invalidation |
| **Rate Limiting** | None | 5 login attempts per 15 minutes |
| **Token Refresh** | Re-login required | Automatic with refresh token |

### Breaking Changes

⚠️ **IMPORTANT:** These changes require frontend updates!

1. **Response structure changed** for `/auth/login` and `/auth/register`
2. **Token expiration reduced** from 1 hour to 15 minutes
3. **New endpoint** `/auth/refresh` for token renewal
4. **Logout endpoint** now requires `refreshToken` in body

---

## 📡 API Changes

### 1. POST `/auth/register`

**Request:** (unchanged)
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** (changed)
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...",
  "expiresIn": 900
}
```

**Rate Limit:** 5 requests per 15 minutes per IP

---

### 2. POST `/auth/login`

**Request:** (unchanged)
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** (changed)
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...",
  "expiresIn": 900
}
```

**Rate Limit:** 5 requests per 15 minutes per IP

---

### 3. POST `/auth/refresh` (NEW)

**Description:** Obtain a new access token using a refresh token

**Request:**
```json
{
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "bmV3IHJlZnJlc2ggdG9rZW4gKHJvdGF0ZWQp...",
  "expiresIn": 900
}
```

**Rate Limit:** 10 requests per 15 minutes per IP

**Important Notes:**
- This endpoint **rotates** refresh tokens (old token is invalidated, new one issued)
- Both tokens are updated, so you must store both new values
- No authentication header required

**Error Responses:**
```json
// Invalid or expired refresh token
{
  "message": "Invalid or expired refresh token"
}

// Token has been revoked (user logged out)
{
  "message": "Token has been revoked"
}

// Rate limit exceeded
{
  "message": "Too many token refresh attempts, please try again later"
}
```

---

### 4. POST `/auth/logout`

**Request:** (changed)
```json
{
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
}
```

**Headers:** (unchanged)
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "message": "Successfully logged out"
}
```

**Important:** Both access token and refresh token are invalidated and cannot be used again.

---

### 5. Protected Endpoints (all others)

**Headers:**
```
Authorization: Bearer <accessToken>
```

**New Error Response:**
```json
// Token has been blacklisted (user logged out)
{
  "message": "Token has been revoked"
}
```

---

## 🔒 Security Improvements

### 1. Refresh Token System

**Benefits:**
- **Shorter attack window**: Access tokens expire in 15 minutes instead of 1 hour
- **Better UX**: Users stay logged in for up to 7 days
- **Automatic renewal**: No interruption when access token expires

**Token Rotation:**
- Every time you call `/auth/refresh`, you get a NEW refresh token
- The old refresh token is immediately invalidated
- This prevents token theft and replay attacks

---

### 2. Token Blacklist

**Benefits:**
- **Immediate invalidation**: Logout is now effective immediately
- **Security**: Stolen tokens become useless after logout
- **Server-side control**: Backend can revoke tokens at any time

---

### 3. Rate Limiting

**Endpoints Protected:**
- `/auth/register`: 5 attempts per 15 minutes
- `/auth/login`: 5 attempts per 15 minutes
- `/auth/refresh`: 10 attempts per 15 minutes

**Benefits:**
- Protection against brute force attacks
- Prevents credential stuffing
- Reduces server load from malicious traffic

---

## 📱 React Native Implementation

### Recommended Libraries

For **secure token storage**, use one of these:

#### Option 1: Expo Secure Store (if using Expo)
```bash
npx expo install expo-secure-store
```

#### Option 2: React Native Keychain (for bare React Native)
```bash
npm install react-native-keychain
# or
yarn add react-native-keychain

# iOS
cd ios && pod install
```

---

### Complete Implementation Example

#### 1. Install Dependencies

```bash
# Choose one based on your setup:
npx expo install expo-secure-store  # For Expo
# OR
npm install react-native-keychain   # For bare React Native

# Also install axios for API calls
npm install axios
```

---

#### 2. Create Token Storage Service

**For Expo:**

```typescript
// services/secureStorage.ts
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

export const SecureStorage = {
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  },

  async getAccessToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};
```

**For React Native Keychain:**

```typescript
// services/secureStorage.ts
import * as Keychain from 'react-native-keychain';

const ACCESS_TOKEN_SERVICE = 'habitrush_access_token';
const REFRESH_TOKEN_SERVICE = 'habitrush_refresh_token';

export const SecureStorage = {
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Keychain.setGenericPassword('token', accessToken, {
      service: ACCESS_TOKEN_SERVICE,
    });
    await Keychain.setGenericPassword('token', refreshToken, {
      service: REFRESH_TOKEN_SERVICE,
    });
  },

  async getAccessToken(): Promise<string | null> {
    const credentials = await Keychain.getGenericPassword({
      service: ACCESS_TOKEN_SERVICE,
    });
    return credentials ? credentials.password : null;
  },

  async getRefreshToken(): Promise<string | null> {
    const credentials = await Keychain.getGenericPassword({
      service: REFRESH_TOKEN_SERVICE,
    });
    return credentials ? credentials.password : null;
  },

  async clearTokens(): Promise<void> {
    await Keychain.resetGenericPassword({ service: ACCESS_TOKEN_SERVICE });
    await Keychain.resetGenericPassword({ service: REFRESH_TOKEN_SERVICE });
  },
};
```

---

#### 3. Create API Client with Auto-Refresh

```typescript
// services/api.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { SecureStorage } from './secureStorage';

const API_BASE_URL = 'http://your-api-url.com'; // Update this!

// Create axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

// Notify all waiting requests when token is refreshed
const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

// Add waiting requests to queue
const addRefreshSubscriber = (callback: (token: string) => void) => {
  refreshSubscribers.push(callback);
};

// Request interceptor: Add access token to all requests
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const accessToken = await SecureStorage.getAccessToken();

    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // If already refreshing, wait for the new token
        return new Promise((resolve) => {
          addRefreshSubscriber(async (token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Get refresh token
        const refreshToken = await SecureStorage.getRefreshToken();

        if (!refreshToken) {
          // No refresh token, user needs to login
          await SecureStorage.clearTokens();
          // Navigate to login screen (implement based on your navigation)
          // navigationRef.navigate('Login');
          return Promise.reject(error);
        }

        // Call refresh endpoint (without interceptor to avoid infinite loop)
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        // Store new tokens
        await SecureStorage.setTokens(data.accessToken, data.refreshToken);

        // Update header for original request
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        }

        // Notify all waiting requests
        onTokenRefreshed(data.accessToken);

        // Retry original request
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        await SecureStorage.clearTokens();
        // Navigate to login screen
        // navigationRef.navigate('Login');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
```

---

#### 4. Create Authentication Service

```typescript
// services/auth.ts
import { api } from './api';
import { SecureStorage } from './secureStorage';

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const AuthService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login', credentials);

    // Store tokens securely
    await SecureStorage.setTokens(data.accessToken, data.refreshToken);

    return data;
  },

  async register(userData: RegisterData): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/register', userData);

    // Store tokens securely
    await SecureStorage.setTokens(data.accessToken, data.refreshToken);

    return data;
  },

  async logout(): Promise<void> {
    const refreshToken = await SecureStorage.getRefreshToken();

    try {
      // Call logout endpoint to blacklist tokens
      await api.post('/auth/logout', { refreshToken });
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with local cleanup even if server request fails
    } finally {
      // Clear tokens from secure storage
      await SecureStorage.clearTokens();
    }
  },

  async getCurrentUser(): Promise<any> {
    const { data } = await api.get('/auth/me');
    return data;
  },

  async isAuthenticated(): Promise<boolean> {
    const accessToken = await SecureStorage.getAccessToken();
    return !!accessToken;
  },
};
```

---

#### 5. Usage in Components

```typescript
// screens/LoginScreen.tsx
import React, { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import { AuthService } from '../services/auth';

export const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await AuthService.login({ email, password });
      navigation.replace('Home');
    } catch (error: any) {
      if (error.response?.status === 429) {
        Alert.alert(
          'Too Many Attempts',
          'Please wait 15 minutes before trying again'
        );
      } else if (error.response?.status === 400) {
        Alert.alert('Error', 'Invalid credentials');
      } else {
        Alert.alert('Error', 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title="Login" onPress={handleLogin} disabled={loading} />
    </View>
  );
};
```

```typescript
// screens/ProfileScreen.tsx
import React from 'react';
import { View, Button, Alert } from 'react-native';
import { AuthService } from '../services/auth';

export const ProfileScreen = ({ navigation }) => {
  const handleLogout = async () => {
    try {
      await AuthService.logout();
      navigation.replace('Login');
    } catch (error) {
      Alert.alert('Error', 'Failed to logout. Please try again.');
    }
  };

  return (
    <View>
      <Button title="Logout" onPress={handleLogout} />
    </View>
  );
};
```

```typescript
// Making authenticated API calls
import { api } from '../services/api';

// The api instance automatically handles token refresh!
const fetchHabits = async () => {
  try {
    const { data } = await api.get('/habits');
    return data;
  } catch (error) {
    console.error('Error fetching habits:', error);
  }
};
```

---

## 🔐 Secure Token Storage

### Why NOT to use AsyncStorage

❌ **DO NOT** store tokens in AsyncStorage:
- AsyncStorage is NOT encrypted
- Tokens can be read by malicious apps
- Vulnerable to backup theft

### Recommended Solutions

#### For Expo: `expo-secure-store`

✅ **Advantages:**
- Uses iOS Keychain and Android Keystore
- Hardware-backed encryption on supported devices
- Data persists across app updates
- Automatic encryption

**Limitations:**
- 2KB limit per item (sufficient for tokens)
- Unavailable in Expo Go on Android (use development builds)

---

#### For Bare React Native: `react-native-keychain`

✅ **Advantages:**
- More flexible than expo-secure-store
- Supports biometric authentication
- Works on both iOS and Android
- Battle-tested in production apps

**Features:**
```typescript
// Store with biometric protection
await Keychain.setGenericPassword('token', accessToken, {
  service: 'habitrush_access_token',
  accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
});

// Retrieve with biometric prompt
const credentials = await Keychain.getGenericPassword({
  service: 'habitrush_access_token',
  authenticationPrompt: {
    title: 'Authenticate to access HabitRush',
  },
});
```

---

### Security Best Practices

1. **Never log tokens** in console.log()
2. **Use HTTPS only** for API calls
3. **Implement certificate pinning** for production
4. **Store refresh tokens separately** from access tokens
5. **Clear tokens on logout** from both memory and storage
6. **Use biometric authentication** when available

---

## 🚀 Migration Guide

### Step 1: Update Dependencies

```bash
# Choose based on your setup
npx expo install expo-secure-store
# OR
npm install react-native-keychain
```

### Step 2: Create New Services

1. Copy `secureStorage.ts` from examples above
2. Copy `api.ts` with interceptors
3. Copy `auth.ts` service

### Step 3: Update Existing Code

**Before:**
```typescript
// Old login
const response = await axios.post('/auth/login', { email, password });
await AsyncStorage.setItem('token', response.data.token);

// Old API call
const token = await AsyncStorage.getItem('token');
const habits = await axios.get('/habits', {
  headers: { Authorization: `Bearer ${token}` }
});

// Old logout
await AsyncStorage.removeItem('token');
```

**After:**
```typescript
// New login
await AuthService.login({ email, password });
// Tokens automatically stored securely

// New API call
const habits = await api.get('/habits');
// Token automatically added, auto-refreshes on expiry

// New logout
await AuthService.logout();
// Tokens blacklisted on server + cleared locally
```

### Step 4: Handle Rate Limiting

Add error handling for 429 status:

```typescript
catch (error) {
  if (error.response?.status === 429) {
    Alert.alert(
      'Too Many Attempts',
      'Please wait 15 minutes before trying again'
    );
  }
}
```

### Step 5: Test Thoroughly

See [Testing Checklist](#testing-checklist) below.

---

## ⚠️ Error Handling

### Common Errors and Solutions

#### 1. 401 Unauthorized

**Possible Causes:**
- Access token expired
- Token has been blacklisted (user logged out)
- Invalid token

**Solution:**
```typescript
// Auto-handled by interceptor
// User is redirected to login if refresh fails
```

---

#### 2. 429 Too Many Requests

**Cause:** Rate limit exceeded

**Response:**
```json
{
  "message": "Too many authentication attempts from this IP, please try again after 15 minutes"
}
```

**Solution:**
```typescript
if (error.response?.status === 429) {
  // Show user-friendly message
  Alert.alert(
    'Too Many Attempts',
    'Please wait 15 minutes before trying again'
  );

  // Optionally: Implement exponential backoff
}
```

---

#### 3. Invalid or Expired Refresh Token

**Cause:** Refresh token expired or revoked

**Response:**
```json
{
  "message": "Invalid or expired refresh token"
}
```

**Solution:**
```typescript
// Clear tokens and redirect to login
await SecureStorage.clearTokens();
navigation.replace('Login');
```

---

#### 4. Token Has Been Revoked

**Cause:** User logged out from another device

**Response:**
```json
{
  "message": "Token has been revoked"
}
```

**Solution:**
```typescript
// Clear local tokens and redirect to login
await SecureStorage.clearTokens();
Alert.alert(
  'Session Expired',
  'You have been logged out. Please login again.'
);
navigation.replace('Login');
```

---

## ✅ Testing Checklist

### Manual Testing

- [ ] **Login**: Successful login stores both tokens
- [ ] **Register**: Successful registration stores both tokens
- [ ] **Auto-refresh**: Token automatically refreshes after 15 minutes
- [ ] **Logout**: Tokens are cleared and cannot be reused
- [ ] **Rate limiting**: Login blocked after 5 failed attempts
- [ ] **Token rotation**: Refresh endpoint returns new refresh token
- [ ] **Multi-device logout**: Logging out on one device invalidates tokens on all devices
- [ ] **App restart**: Tokens persist after closing and reopening app
- [ ] **Protected endpoints**: All API calls work with new token system

### Edge Cases

- [ ] **Network offline during refresh**: App handles gracefully
- [ ] **Simultaneous requests during refresh**: No duplicate refresh calls
- [ ] **Expired refresh token**: User redirected to login
- [ ] **Invalid credentials**: Clear error message shown
- [ ] **Biometric failure**: Fallback to password (if implemented)

### Security Testing

- [ ] **Tokens not in AsyncStorage**: Verify using React Native Debugger
- [ ] **Tokens encrypted**: Check with device file explorer (requires root/jailbreak)
- [ ] **HTTPS only**: All API calls use HTTPS
- [ ] **Tokens cleared on logout**: Verify secure storage is empty
- [ ] **Old tokens invalid**: Verify old access tokens return 401

---

## 📚 Additional Resources

### Libraries Documentation

- [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [react-native-keychain](https://github.com/oblador/react-native-keychain)
- [axios](https://axios-http.com/docs/intro)

### Security Best Practices

- [OWASP Mobile Security](https://owasp.org/www-project-mobile-security/)
- [React Native Security Guide](https://reactnative.dev/docs/security)

---

## 🆘 Support

If you encounter issues:

1. Check this documentation thoroughly
2. Verify your API endpoint URLs are correct
3. Check network requests in React Native Debugger
4. Verify tokens are stored in secure storage (not AsyncStorage)
5. Test with Postman to isolate frontend vs backend issues

**Backend Team Contact:** [Your contact info here]

---

## 📝 Changelog

### v2.0.0 - October 19, 2025

**Added:**
- Refresh token system
- Token blacklist for effective logout
- Rate limiting on auth endpoints
- Automatic token rotation

**Changed:**
- Access token duration: 1 hour → 15 minutes
- Login/Register response format
- Logout now requires refresh token

**Deprecated:**
- Single-token authentication system

---

## 🎉 Summary

**What frontend needs to do:**

1. ✅ Install `expo-secure-store` or `react-native-keychain`
2. ✅ Update to new response format (`accessToken` + `refreshToken`)
3. ✅ Implement automatic token refresh (use provided interceptor)
4. ✅ Store tokens in secure storage (NOT AsyncStorage)
5. ✅ Send `refreshToken` in logout request body
6. ✅ Handle 429 rate limit errors gracefully

**Benefits for users:**

- ✅ Stay logged in for up to 7 days
- ✅ More secure (shorter access token lifespan)
- ✅ Effective logout across all devices
- ✅ Protection against brute force attacks

**Questions?** Contact the backend team!
