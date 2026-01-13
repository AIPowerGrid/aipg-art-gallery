# Security & Code Quality Audit Report
**Date:** January 12, 2026  
**Auditor:** AI Code Review  
**Project:** AIPG Art Gallery

---

## 🚨 CRITICAL SECURITY VULNERABILITIES

### 1. **EXPOSED PRODUCTION CREDENTIALS IN .env FILE** ⚠️⚠️⚠️
**Severity:** CRITICAL  
**File:** `.env` (lines 42-54)

**Issue:**
Production credentials are hardcoded and committed to the repository:

```
AWS_ACCESS_KEY_ID=60692db35d5f2d82657bc34373a9ff47
AWS_SECRET_ACCESS_KEY=e17c054d255dc6991da3a238e7be45989778066cbba0894be40fe8f199e62a73
SHARED_AWS_ACCESS_ID=60692db35d5f2d82657bc34373a9ff47
SHARED_AWS_ACCESS_KEY=e17c054d255dc6991da3a238e7be45989778066cbba0894be40fe8f199e62a73
POSTGRES_CONN_STR=postgres://aipg:aipg_secure_2026@localhost:5432/aipg_gallery?sslmode=disable
AIPG_API_KEY=CADWOATvdPmE7npsuLv1bQ
```

**Impact:**
- ✅ Cloudflare R2 buckets are fully compromised - anyone can read/write/delete files
- ✅ PostgreSQL database can be accessed by anyone
- ✅ AIPG API key can be used to make unauthorized API calls
- ✅ If this repo is public or was ever pushed to GitHub, these credentials are permanently compromised

**Remediation:**
1. **IMMEDIATELY** rotate ALL these credentials
2. Remove from `.env` file
3. Add `.env` to `.gitignore` (if not already)
4. Use environment variables or secrets management (never commit secrets)
5. Check git history - if committed, consider the secrets permanently leaked

---

### 2. **INSECURE WALLET AUTHENTICATION** ⚠️⚠️⚠️
**Severity:** CRITICAL  
**Files:** 
- `server/internal/app/app.go` (lines 1325, 1374, 1414, 1440)
- `lib/api.ts` (lines 144, 155, 163, 170)

**Issue:**
Authentication is based on an **unsecured HTTP header** `X-Wallet-Address` with **NO cryptographic verification**:

```go
requestWallet := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Wallet-Address")))
```

**Attack Vector:**
Anyone can send this header with ANY wallet address:
```bash
curl -X DELETE https://api.example.com/api/gallery/job123 \
  -H "X-Wallet-Address: 0xVICTIM_ADDRESS"
```

**Impact:**
- ✅ Any user can delete/modify/publish content belonging to OTHER users
- ✅ No proof of wallet ownership required
- ✅ Trivial to exploit with browser dev tools or curl

**Remediation:**
1. Implement signature-based authentication (EIP-191 or EIP-712)
2. Require users to sign a message with their private key
3. Verify the signature on the backend before accepting actions
4. Use short-lived JWT tokens after signature verification

**Example Fix:**
```typescript
// Client side - sign message
const message = `Delete image ${jobId} at ${Date.now()}`;
const signature = await signer.signMessage(message);

// Send to backend
headers: {
  'X-Message': message,
  'X-Signature': signature,
  'X-Wallet-Address': address
}

// Backend - verify signature
func verifySignature(message, signature, address string) bool {
  // Recover signer from signature
  // Compare recovered address with claimed address
}
```

---

### 3. **POSTGRESQL SSL DISABLED**
**Severity:** HIGH  
**File:** `.env` (line 54), `server/internal/config/config.go` (line 75)

**Issue:**
```
sslmode=disable
```

**Impact:**
- Database traffic is unencrypted
- Credentials transmitted in plaintext
- Man-in-the-middle attacks possible

**Remediation:**
Set `sslmode=require` or `sslmode=verify-full`

---

### 4. **SUPABASE ANON KEY EXPOSED**
**Severity:** MEDIUM  
**File:** `.env` (line 3)

**Issue:**
While Supabase anon keys are designed to be public-facing, having them in a committed `.env` file:
- Makes key rotation harder
- Can be used to spam your Supabase API
- Counts against your rate limits

**Remediation:**
- Use `NEXT_PUBLIC_*` prefix (already done, but ensure not in .env)
- Set up Row Level Security (RLS) policies in Supabase
- Monitor usage for abuse

---

### 5. **CORS WILDCARD ALLOWED**
**Severity:** MEDIUM  
**File:** `server/internal/app/app.go` (lines 176-179)

**Issue:**
```go
if len(a.cfg.AllowedOrigins) == 0 {
    return []string{"*"}
}
```

**Impact:**
- Any website can make requests to your API
- Easier to exploit CSRF vulnerabilities
- No origin-based protection

**Remediation:**
Always specify allowed origins explicitly

---

## 🗑️ CODE WASTE & DUPLICATION

### 6. **DUPLICATE SETUP SCRIPTS**
**Severity:** LOW  
**Location:** `scripts/` directory

**Duplicate files serving the same purpose:**
```
scripts/setup-supabase.js
scripts/setup-supabase.ts
scripts/setup-supabase.py
scripts/setup-supabase-api.js
scripts/setup-with-browser.js
scripts/execute-sql-direct.js
scripts/execute-sql-postgres.js
scripts/execute-sql-via-api.js
scripts/execute-sql-with-new-key.js
scripts/run-sql-schema.js
scripts/run-sql-schema-direct.js
```

**Remediation:**
- Consolidate to ONE working script
- Delete the rest
- Document the canonical setup process

---

### 7. **BACKUP FILES IN REPOSITORY**
**Severity:** LOW  
**Files:**
```
server/api.backup
server/api.bak
data/gallery.json.backup-*
```

**Issue:**
- Clutters repository
- Takes up space
- Confusing for developers

**Remediation:**
Delete backup files and use git for version control

---

### 8. **POINTLESS WRAPPER COMPONENT**
**Severity:** LOW  
**File:** `components/nav-wallet.tsx`

**Issue:**
Entire file is just:
```typescript
export function NavWallet() {
  return <WalletButton />;
}
```

**Remediation:**
Delete `nav-wallet.tsx` and import `WalletButton` directly

---

### 9. **UNUSED/REDUNDANT CODE**

**Files that appear unused:**
- `components/social-auth.tsx` - no imports found
- `components/network-selector.tsx` - no imports found
- Multiple scripts in `scripts/` folder

**Remediation:**
Remove unused files or document their purpose

---

## 🐛 LOGICAL ISSUES

### 10. **POOR ERROR HANDLING - alert() and confirm()**
**Severity:** LOW  
**Files:** `app/page.tsx`, `app/profile/page.tsx`

**Issue:**
Using browser `alert()` and `confirm()` for user feedback:
```typescript
if (!confirm("Delete this item from the gallery?")) return;
alert(`Failed to delete: ${err.message}`);
```

**Impact:**
- Poor user experience
- Blocks the UI
- Not customizable
- Looks unprofessional

**Remediation:**
Use a toast notification library (you already have `sonner` installed):
```typescript
import { toast } from 'sonner';

toast.error('Failed to delete image');
toast.success('Image deleted successfully');
```

---

### 11. **NO INPUT SANITIZATION ON SEARCH**
**Severity:** MEDIUM  
**Files:** `app/page.tsx` (line 222), `server/internal/app/app.go`

**Issue:**
Search queries passed directly without sanitization:
```typescript
<input
  type="text"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
/>
```

**Potential Impact:**
- SQL injection if queries aren't parameterized in Go backend
- NoSQL injection
- XSS if reflected in responses

**Remediation:**
- Verify Go backend uses parameterized queries
- Implement input validation/sanitization
- Set max length limits
- Rate limit search requests

---

### 12. **NO VISIBLE RATE LIMITING**
**Severity:** MEDIUM  

**Issue:**
No rate limiting visible on API endpoints

**Impact:**
- API abuse
- DDoS vulnerability
- Cost implications for R2 bandwidth

**Remediation:**
Implement rate limiting middleware in Go backend

---

### 13. **INCONSISTENT ERROR HANDLING**
**Severity:** LOW  
**File:** `app/profile/page.tsx` (lines 94, 124)

**Issue:**
Some errors are caught and ignored silently:
```typescript
} catch {
  setLoadingMore(false);
}
```

**Remediation:**
Always log errors for debugging:
```typescript
} catch (err) {
  console.error('Failed to load more:', err);
  setLoadingMore(false);
}
```

---

### 14. **HARDCODED PAGINATION LIMITS**
**Severity:** LOW  
**Files:** Multiple

**Issue:**
Magic numbers everywhere:
```typescript
const INITIAL_PAGE_SIZE = 50;
const PAGE_SIZE = 50;
const response = await fetchGalleryByWallet(walletAddress, 100);
```

**Remediation:**
Extract to configuration file

---

## 📊 SUMMARY

### Critical Issues: 5
1. ✅ Exposed production credentials
2. ✅ Insecure wallet authentication
3. ✅ PostgreSQL SSL disabled
4. ✅ Supabase key exposure
5. ✅ CORS wildcard

### High Priority: 3
6. ✅ No input sanitization
7. ✅ No rate limiting
8. ✅ Poor error handling

### Code Quality: 6
9. ✅ Duplicate scripts
10. ✅ Backup files in repo
11. ✅ Pointless wrapper components
12. ✅ Unused code
13. ✅ Using alert()/confirm()
14. ✅ Magic numbers

---

## 🎯 IMMEDIATE ACTION ITEMS

### Do THIS RIGHT NOW:
1. ✅ **Rotate ALL credentials in .env file**
2. ✅ **Remove credentials from .env and use environment variables**
3. ✅ **Fix wallet authentication to use signature verification**
4. ✅ **Enable PostgreSQL SSL**
5. ✅ **Set explicit CORS origins**

### Do SOON:
6. Replace alert()/confirm() with proper UI components
7. Add rate limiting
8. Clean up duplicate scripts
9. Remove backup files
10. Implement proper input validation

### Do EVENTUALLY:
11. Audit for unused code
12. Extract magic numbers to config
13. Improve error handling consistency
14. Add comprehensive logging

---

## 🏆 GOOD PRACTICES OBSERVED

Despite the issues, some good practices were noted:
- ✅ Using TypeScript
- ✅ Component-based architecture
- ✅ Separation of concerns (frontend/backend)
- ✅ Using environment variables (just not properly secured)
- ✅ React hooks for state management
- ✅ Next.js App Router

---

**End of Report**
