# HabitRush Backend Documentation

Welcome to the HabitRush Backend documentation. This directory contains all the technical documentation for the authentication system and API.

---

## 📚 Documentation Index

### For Frontend Developers

1. **[QUICK_START_FRONTEND.md](./QUICK_START_FRONTEND.md)** ⚡
   - **Start here!** Quick implementation guide (5-minute read)
   - TL;DR of what changed and what to do
   - Minimal code examples
   - Common issues and solutions

2. **[AUTHENTICATION_UPDATE_FRONTEND.md](./AUTHENTICATION_UPDATE_FRONTEND.md)** 📖
   - Complete implementation guide (30-minute read)
   - Detailed React Native examples
   - Secure token storage recommendations
   - Migration guide from old system
   - Security best practices
   - Testing checklist

3. **[API_TESTING_EXAMPLES.md](./API_TESTING_EXAMPLES.md)** 🧪
   - cURL examples for all endpoints
   - Postman collection
   - Complete testing flows
   - Debugging tips
   - PowerShell examples (Windows)

---

## 🚀 Quick Links

### I need to...

- **Understand what changed** → [Quick Start](./QUICK_START_FRONTEND.md#-what-changed)
- **Implement in React Native** → [Complete Guide](./AUTHENTICATION_UPDATE_FRONTEND.md#-react-native-implementation)
- **Store tokens securely** → [Secure Storage](./AUTHENTICATION_UPDATE_FRONTEND.md#-secure-token-storage)
- **Test the API** → [API Testing](./API_TESTING_EXAMPLES.md)
- **Handle errors** → [Error Handling](./AUTHENTICATION_UPDATE_FRONTEND.md#-error-handling)
- **Migrate existing app** → [Migration Guide](./AUTHENTICATION_UPDATE_FRONTEND.md#-migration-guide)
- **Test in Postman** → [Postman Collection](./API_TESTING_EXAMPLES.md#-postman-collection)

---

## 🎯 What's New?

### October 19, 2025 - Authentication System v2.0

**🔐 Three Major Security Improvements:**

1. **Refresh Token System**
   - Access tokens: 15 minutes (was 1 hour)
   - Refresh tokens: 7 days
   - Automatic token rotation
   - Seamless user experience

2. **Token Blacklist**
   - Effective logout (tokens invalidated immediately)
   - Server-side token revocation
   - Protection against stolen tokens

3. **Rate Limiting**
   - Login/Register: 5 attempts per 15 minutes
   - Refresh: 10 attempts per 15 minutes
   - Protection against brute force attacks

---

## 📋 Implementation Checklist

### For Frontend Team

- [ ] Read [Quick Start Guide](./QUICK_START_FRONTEND.md)
- [ ] Install secure storage library (`expo-secure-store` or `react-native-keychain`)
- [ ] Copy the 3 service files to your project
- [ ] Update login/register code
- [ ] Update API calls to use new `api` instance
- [ ] Update logout to send refresh token
- [ ] Test all flows thoroughly
- [ ] Remove tokens from AsyncStorage
- [ ] Handle rate limiting errors (429)
- [ ] Test on real devices (not just simulators)

---

## 🔑 Key Concepts

### Refresh Token Flow

```
┌─────────┐                ┌─────────┐                ┌─────────┐
│  Client │                │   API   │                │   DB    │
└────┬────┘                └────┬────┘                └────┬────┘
     │                          │                          │
     │  1. Login                │                          │
     ├─────────────────────────>│                          │
     │                          │  2. Validate credentials │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │  3. Create refresh token │
     │                          ├─────────────────────────>│
     │                          │                          │
     │  4. Return tokens        │                          │
     │<─────────────────────────┤                          │
     │  (access + refresh)      │                          │
     │                          │                          │
     │  --- 15 minutes later ---│                          │
     │                          │                          │
     │  5. API call (expired)   │                          │
     ├─────────────────────────>│                          │
     │                          │                          │
     │  6. 401 Unauthorized     │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │  7. Refresh request      │                          │
     ├─────────────────────────>│                          │
     │  (with refresh token)    │                          │
     │                          │  8. Validate refresh     │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │  9. Rotate tokens        │
     │                          ├─────────────────────────>│
     │                          │                          │
     │  10. New tokens          │                          │
     │<─────────────────────────┤                          │
     │  (new access + refresh)  │                          │
     │                          │                          │
     │  11. Retry original call │                          │
     ├─────────────────────────>│                          │
     │                          │                          │
     │  12. Success!            │                          │
     │<─────────────────────────┤                          │
```

### Token Blacklist Flow

```
┌─────────┐                ┌─────────┐                ┌──────────┐
│  Client │                │   API   │                │ Blacklist│
└────┬────┘                └────┬────┘                └────┬─────┘
     │                          │                          │
     │  1. Logout               │                          │
     ├─────────────────────────>│                          │
     │  (access + refresh)      │                          │
     │                          │  2. Blacklist access     │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │  3. Delete refresh       │
     │                          ├─────────────────────────>│
     │                          │                          │
     │  4. Success              │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │  5. Try using token      │                          │
     ├─────────────────────────>│                          │
     │                          │  6. Check blacklist      │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │  7. Token found!         │
     │                          │<─────────────────────────┤
     │                          │                          │
     │  8. 401 Token revoked    │                          │
     │<─────────────────────────┤                          │
```

---

## 🛠️ Technologies Used

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **TypeScript** - Type safety
- **MySQL** - Database
- **JWT (jsonwebtoken)** - Token generation/verification
- **bcryptjs** - Password hashing
- **express-rate-limit** - Rate limiting

### Recommended Frontend
- **React Native** - Mobile framework
- **expo-secure-store** OR **react-native-keychain** - Secure storage
- **axios** - HTTP client

---

## 🔒 Security Features

| Feature | Implementation | Benefit |
|---------|----------------|---------|
| Password Hashing | bcryptjs (10 rounds) | Passwords never stored in plain text |
| JWT Signing | HS256 algorithm | Tamper-proof tokens |
| Token Expiration | 15 min (access), 7 days (refresh) | Limited attack window |
| Token Rotation | Every refresh | Prevents token replay attacks |
| Token Blacklist | Database-backed | Immediate logout effect |
| Rate Limiting | 5 login attempts / 15 min | Brute force protection |
| Secure Storage | Keychain/Keystore | Protected from device compromise |

---

## 📞 Support

### For Frontend Developers

**Questions about:**
- How to implement in React Native → [Complete Guide](./AUTHENTICATION_UPDATE_FRONTEND.md)
- How to test endpoints → [API Testing](./API_TESTING_EXAMPLES.md)
- Quick answers → [Quick Start](./QUICK_START_FRONTEND.md)

**Still stuck?**
- Check the [Error Handling](./AUTHENTICATION_UPDATE_FRONTEND.md#-error-handling) section
- Review [Common Issues](./QUICK_START_FRONTEND.md#-common-issues--solutions)
- Contact backend team

---

## 📝 Changelog

### v2.0.0 - October 19, 2025

**Added:**
- ✅ Refresh token system
- ✅ Token blacklist for logout
- ✅ Rate limiting on auth endpoints
- ✅ Token rotation on refresh
- ✅ Secure storage recommendations
- ✅ Complete frontend implementation guide

**Changed:**
- 🔄 Access token duration: 1h → 15min
- 🔄 Login/Register response format
- 🔄 Logout now requires refresh token
- 🔄 All protected endpoints check blacklist

**Security:**
- 🔒 Shorter token lifespan
- 🔒 Effective server-side logout
- 🔒 Brute force protection
- 🔒 Token theft mitigation

---

## 🎓 Learning Resources

### Understanding JWT
- [JWT.io Introduction](https://jwt.io/introduction)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

### React Native Security
- [OWASP Mobile Security Guide](https://owasp.org/www-project-mobile-security/)
- [React Native Security Best Practices](https://reactnative.dev/docs/security)

### Token Storage
- [expo-secure-store docs](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [react-native-keychain docs](https://github.com/oblador/react-native-keychain)

---

## ✅ Quick Validation

**After implementing, verify:**

```bash
# 1. Can you login?
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456"}'

# 2. Are tokens in secure storage (not AsyncStorage)?
# Check in React Native Debugger → Storage

# 3. Does auto-refresh work?
# Wait 16 minutes, make an API call - should work!

# 4. Does logout work?
# After logout, old tokens should return 401

# 5. Is rate limiting active?
# Try 6 failed logins - 6th should return 429
```

---

## 🏆 Best Practices

### DO ✅
- Use secure storage for tokens
- Implement automatic token refresh
- Clear tokens on logout
- Handle 429 rate limit errors gracefully
- Use HTTPS in production
- Test on real devices

### DON'T ❌
- Store tokens in AsyncStorage
- Log tokens to console
- Hardcode API credentials
- Ignore 401 errors
- Use HTTP in production
- Store sensitive data unencrypted

---

**Ready to implement?** Start with the [Quick Start Guide](./QUICK_START_FRONTEND.md)!

**Need details?** Read the [Complete Implementation Guide](./AUTHENTICATION_UPDATE_FRONTEND.md)!

**Want to test?** Check out [API Testing Examples](./API_TESTING_EXAMPLES.md)!
