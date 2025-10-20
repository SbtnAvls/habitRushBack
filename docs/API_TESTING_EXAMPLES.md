# API Testing Examples - Authentication System

Quick reference for testing the new authentication endpoints using cURL, Postman, or any HTTP client.

---

## 📋 Base URL

```
http://localhost:3000  # Development
https://your-api.com   # Production
```

**Note:** Replace with your actual API URL

---

## 🔓 Public Endpoints (No Authentication Required)

### 1. Register New User

**Endpoint:** `POST /auth/register`

**Rate Limit:** 5 requests per 15 minutes per IP

**cURL:**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

**Success Response (201):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMzQ1Njc4LTEyMzQtMTIzNC0xMjM0LTEyMzQ1Njc4OTBhYiIsImlhdCI6MTY5NzU2MjAwMCwiZXhwIjoxNjk3NTYyOTAwfQ.signature",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMzQ1Njc4LTEyMzQtMTIzNC0xMjM0LTEyMzQ1Njc4OTBhYiIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNjk3NTYyMDAwLCJleHAiOjE2OTgxNjY4MDB9.signature",
  "expiresIn": 900
}
```

**Error Response (400):**
```json
{
  "message": "User already exists"
}
```

**Error Response (429 - Rate Limited):**
```json
{
  "message": "Too many authentication attempts from this IP, please try again after 15 minutes"
}
```

---

### 2. Login

**Endpoint:** `POST /auth/login`

**Rate Limit:** 5 requests per 15 minutes per IP

**cURL:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

**Success Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

**Error Response (400):**
```json
{
  "message": "Invalid credentials"
}
```

---

### 3. Refresh Token

**Endpoint:** `POST /auth/refresh`

**Rate Limit:** 10 requests per 15 minutes per IP

**cURL:**
```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Success Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

**Error Responses:**

**401 - Invalid/Expired Token:**
```json
{
  "message": "Invalid or expired refresh token"
}
```

**401 - Token Revoked:**
```json
{
  "message": "Token has been revoked"
}
```

**429 - Rate Limited:**
```json
{
  "message": "Too many token refresh attempts, please try again later"
}
```

---

## 🔒 Protected Endpoints (Authentication Required)

### 4. Get Current User

**Endpoint:** `GET /auth/me`

**Authentication:** Bearer Token (Access Token)

**cURL:**
```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Success Response (200):**
```json
{
  "id": "12345678-1234-1234-1234-1234567890ab",
  "name": "John Doe",
  "email": "john@example.com",
  "lives": 5,
  "max_lives": 5,
  "total_habits": 0,
  "xp": 0,
  "weekly_xp": 0,
  "league": 1,
  "league_week_start": "2025-10-19T00:00:00.000Z",
  "theme": "light",
  "font_size": "medium",
  "created_at": "2025-10-19T12:00:00.000Z",
  "updated_at": "2025-10-19T12:00:00.000Z"
}
```

**Error Response (401):**
```json
{
  "message": "No token provided"
}
```

```json
{
  "message": "Invalid token"
}
```

```json
{
  "message": "Token has been revoked"
}
```

---

### 5. Logout

**Endpoint:** `POST /auth/logout`

**Authentication:** Bearer Token (Access Token)

**Body:** Refresh Token

**cURL:**
```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Success Response (200):**
```json
{
  "message": "Successfully logged out"
}
```

**Error Response (401):**
```json
{
  "message": "Not authenticated"
}
```

---

## 🧪 Complete Testing Flow

### Flow 1: Register → Get User → Logout

```bash
# 1. Register
RESPONSE=$(curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "test123456"
  }')

ACCESS_TOKEN=$(echo $RESPONSE | jq -r '.accessToken')
REFRESH_TOKEN=$(echo $RESPONSE | jq -r '.refreshToken')

echo "Access Token: $ACCESS_TOKEN"
echo "Refresh Token: $REFRESH_TOKEN"

# 2. Get current user
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 3. Logout
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"

# 4. Try to use token again (should fail)
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# Expected: {"message":"Token has been revoked"}
```

---

### Flow 2: Login → Refresh Token → Get User

```bash
# 1. Login
RESPONSE=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456"
  }')

ACCESS_TOKEN=$(echo $RESPONSE | jq -r '.accessToken')
REFRESH_TOKEN=$(echo $RESPONSE | jq -r '.refreshToken')

# 2. Get user with access token
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 3. Wait 16 minutes OR manually expire token, then refresh
# For testing, you can change JWT expiresIn to 10 seconds temporarily

# 4. Refresh token
RESPONSE=$(curl -s -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

NEW_ACCESS_TOKEN=$(echo $RESPONSE | jq -r '.accessToken')
NEW_REFRESH_TOKEN=$(echo $RESPONSE | jq -r '.refreshToken')

# 5. Use new access token
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN"

# 6. Try to use old refresh token (should fail - tokens are rotated)
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
# Expected: {"message":"Invalid or expired refresh token"}
```

---

### Flow 3: Test Rate Limiting

```bash
# Attempt to login 6 times with wrong password
for i in {1..6}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "wrongpassword"
    }'
  echo ""
  echo "---"
done

# The 6th attempt should return 429:
# {"message":"Too many authentication attempts from this IP, please try again after 15 minutes"}
```

---

## 📮 Postman Collection

### Import this JSON into Postman:

```json
{
  "info": {
    "name": "HabitRush Auth API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000"
    },
    {
      "key": "accessToken",
      "value": ""
    },
    {
      "key": "refreshToken",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "Register",
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "if (pm.response.code === 201) {",
              "    const response = pm.response.json();",
              "    pm.collectionVariables.set('accessToken', response.accessToken);",
              "    pm.collectionVariables.set('refreshToken', response.refreshToken);",
              "}"
            ]
          }
        }
      ],
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "raw",
          "raw": "{\n    \"name\": \"Test User\",\n    \"email\": \"test@example.com\",\n    \"password\": \"test123456\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": "{{baseUrl}}/auth/register"
      }
    },
    {
      "name": "Login",
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "if (pm.response.code === 200) {",
              "    const response = pm.response.json();",
              "    pm.collectionVariables.set('accessToken', response.accessToken);",
              "    pm.collectionVariables.set('refreshToken', response.refreshToken);",
              "}"
            ]
          }
        }
      ],
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "raw",
          "raw": "{\n    \"email\": \"test@example.com\",\n    \"password\": \"test123456\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": "{{baseUrl}}/auth/login"
      }
    },
    {
      "name": "Refresh Token",
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "if (pm.response.code === 200) {",
              "    const response = pm.response.json();",
              "    pm.collectionVariables.set('accessToken', response.accessToken);",
              "    pm.collectionVariables.set('refreshToken', response.refreshToken);",
              "}"
            ]
          }
        }
      ],
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "raw",
          "raw": "{\n    \"refreshToken\": \"{{refreshToken}}\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": "{{baseUrl}}/auth/refresh"
      }
    },
    {
      "name": "Get Current User",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{accessToken}}"
          }
        ],
        "url": "{{baseUrl}}/auth/me"
      }
    },
    {
      "name": "Logout",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{accessToken}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n    \"refreshToken\": \"{{refreshToken}}\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": "{{baseUrl}}/auth/logout"
      }
    }
  ]
}
```

**Features:**
- Automatically saves `accessToken` and `refreshToken` after login/register
- Uses collection variables for easy token management
- Ready to use - just import and test!

---

## 🔍 Debugging Tips

### Check Token Expiration

Decode your JWT token at [jwt.io](https://jwt.io) to see:
- `exp` (expiration timestamp)
- `iat` (issued at timestamp)
- `id` (user ID)
- `type` (for refresh tokens)

### Test Expired Token

Temporarily change token expiration in backend:
```typescript
// src/controllers/auth.controller.ts
const accessToken = jwt.sign(
  { id: user.id },
  process.env.JWT_SECRET || 'your_jwt_secret',
  { expiresIn: '10s' }  // Change to 10 seconds for testing
);
```

Then wait 10 seconds and try using the token - it should fail.

### Verify Tokens in Database

```sql
-- Check refresh tokens
SELECT * FROM REFRESH_TOKENS;

-- Check blacklisted tokens
SELECT * FROM TOKEN_BLACKLIST;

-- Clean up expired tokens
DELETE FROM REFRESH_TOKENS WHERE expires_at <= NOW();
DELETE FROM TOKEN_BLACKLIST WHERE expires_at <= NOW();
```

---

## ⚡ Quick Commands

### Save tokens to environment variables (Linux/Mac)
```bash
# Login and save tokens
export AUTH_RESPONSE=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456"}')

export ACCESS_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.accessToken')
export REFRESH_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.refreshToken')

# Now use them
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### PowerShell (Windows)
```powershell
# Login and save tokens
$response = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","password":"test123456"}'

$env:ACCESS_TOKEN = $response.accessToken
$env:REFRESH_TOKEN = $response.refreshToken

# Now use them
Invoke-RestMethod -Uri "http://localhost:3000/auth/me" `
  -Method Get `
  -Headers @{ Authorization = "Bearer $env:ACCESS_TOKEN" }
```

---

## 📊 Expected Response Times

| Endpoint | Typical Response Time |
|----------|----------------------|
| POST /auth/register | ~200-500ms (bcrypt hashing) |
| POST /auth/login | ~200-500ms (bcrypt comparison) |
| POST /auth/refresh | ~50-100ms |
| GET /auth/me | ~20-50ms |
| POST /auth/logout | ~50-100ms |

**Note:** First request after token blacklist check may be slower due to database query.

---

## 🐛 Common Testing Issues

### Issue: "No token provided" on protected routes

**Cause:** Missing or malformed Authorization header

**Fix:**
```bash
# ❌ Wrong
curl http://localhost:3000/auth/me

# ✅ Correct
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

### Issue: "Invalid token" immediately after login

**Cause:** JWT_SECRET mismatch or malformed token

**Check:**
1. Is `JWT_SECRET` set in `.env`?
2. Did you copy the full token (no truncation)?
3. Is the token a valid JWT format?

---

### Issue: Rate limiting not working

**Cause:** Express app not using the rate limiter

**Check:**
```typescript
// routes/auth.routes.ts should have:
router.post('/login', authRateLimiter, authController.login);
```

---

### Issue: Refresh token not rotating

**Expected behavior:** Each `/auth/refresh` call should return a NEW refresh token and invalidate the old one.

**Test:**
```bash
# 1. Refresh once
RESPONSE=$(curl -s -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

NEW_REFRESH=$(echo $RESPONSE | jq -r '.refreshToken')

# 2. Try using old refresh token (should fail)
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
# Should return: {"message":"Invalid or expired refresh token"}
```

---

Happy testing! 🚀
