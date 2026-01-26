# GPT Actions Validation Checklist

**Purpose**: Pre-commit validation checklist to prevent ChatGPT Custom GPT integration issues.
**Date**: 2026-01-26
**Lessons Learned**: Created after 3 separate integration failures.

---

## Pre-Commit Checklist

Run through this checklist BEFORE committing any changes that affect GPT Actions.

### 1. Version Consistency

- [ ] `mcp-server/package.json` version matches
- [ ] `mcp-server/package-lock.json` version matches (run `npm install` to regenerate)
- [ ] `http-gateway.ts` OpenAPI spec `info.version` matches (appears twice in the file)
- [ ] All `docs/*.md` files reference the correct version
- [ ] `CHANGELOG.md` has entry for new version

### 2. OpenAPI Spec Validation

- [ ] **Description Length**: All `description` fields are under 300 characters
  - ChatGPT truncates longer descriptions silently
  - Use `grep -o 'description:.*' | wc -c` to check lengths

- [ ] **No Reserved Words**: Avoid field names that conflict with OpenAI internals
  - Don't use: `action`, `plugin`, `function`, `tool` as field names

- [ ] **Valid JSON Schema**: Run the spec through a validator
  ```bash
  curl -s https://sacp.banksim.ca/openapi.json | python3 -m json.tool > /dev/null && echo "Valid JSON"
  ```

- [ ] **Endpoint Consistency**: All endpoints in docs match the actual OpenAPI spec

### 3. ChatGPT-Specific Limitations

These are HARD limitations that will silently fail:

| Limitation | Consequence | Workaround |
|------------|-------------|------------|
| **No base64 data URLs** | GPT outputs the string as text instead of rendering image | Host images at HTTP URLs |
| **No data: URIs** | Same as above | Use `https://` URLs only |
| **Image markdown only** | GPT can't use `<img>` tags | Always use `![alt](url)` format |
| **No interactive elements** | GPT can't render buttons/forms | Use text instructions |
| **300 char description limit** | Longer descriptions truncated | Keep descriptions concise |

### 4. Image/QR Code Handling

- [ ] **QR codes use HTTP URLs**, not data URLs
  - ❌ `qr_code_data_url: "data:image/png;base64,..."` - WILL NOT RENDER
  - ✅ `qr_code_url: "https://sacp.banksim.ca/qr/xxx"` - Works correctly

- [ ] **QR endpoint returns proper headers**:
  - `Content-Type: image/png`
  - `Cache-Control: no-cache` (for dynamic codes)

- [ ] **Test QR rendering** in a markdown preview before committing

### 5. Authentication Handling

- [ ] **No auth required for browse/checkout** (guest flow)
- [ ] **OAuth endpoints documented** (if using authenticated flow)
- [ ] **Token handling instructions clear** in GPT Instructions

### 6. Response Field Naming

- [ ] **Consistent field names** across all responses
- [ ] **snake_case** for all JSON fields (not camelCase)
- [ ] **Clear field documentation** in OpenAPI spec

### 6.1 Authorization URL Fields

- [ ] **GPT Instructions use correct URL field** for user-facing links:
  - `authorization_url` - Full URL with code pre-filled (USE THIS for links)
  - `qr_code_url` - HTTP URL serving QR code PNG (USE THIS for images)
  - `verification_uri` - Base URL without code (ONLY for manual entry reference)
- [ ] **Never direct users to `verification_uri`** - they'd have to manually type the code

### 7. Testing Steps

Before committing:

1. **Local test**: `npm run dev:gateway` and test endpoints with curl
2. **OpenAPI validation**: Fetch `/openapi.json` and validate structure
3. **Mock GPT test**: Manually follow the GPT Instructions as if you were the AI
4. **QR code test**: Verify QR codes render in a markdown preview

After deploying:

1. **Fetch fresh schema**: Delete and re-import schema in GPT Builder
2. **Test full flow**: Browse → Checkout → Payment → Confirmation
3. **Verify images render**: QR codes should appear as images, not text

---

## Known OpenAI Platform Issues

### "Duplicate Domains" Error

**Error**: "Action sets cannot have duplicate domains - sacp.banksim.ca already exists on another action"

**Cause**: Known OpenAI platform bug/limitation

**Workarounds**:
1. Delete the existing action set completely, then re-add
2. Wait and retry (sometimes transient)
3. Create a new GPT if the error persists
4. Contact OpenAI support for persistent issues

**Reference**: [OpenAI Community Thread](https://community.openai.com/t/cannot-have-multiple-custom-actions-for-the-same-domain/502341)

### Actions Not Updating

**Symptom**: GPT uses old API behavior after schema update

**Fix**:
1. In GPT Builder, delete the action completely
2. Re-add by importing schema URL fresh
3. Test to verify new behavior

---

## Quick Validation Commands

```bash
# Check version consistency
echo "=== Version Check ===" && \
grep '"version"' mcp-server/package.json && \
grep "version:" mcp-server/src/http-gateway.ts | head -2

# Validate OpenAPI JSON
curl -s https://sacp.banksim.ca/openapi.json | python3 -m json.tool > /dev/null && echo "✅ Valid JSON" || echo "❌ Invalid JSON"

# Check description lengths (should all be < 300)
curl -s https://sacp.banksim.ca/openapi.json | python3 -c "
import json, sys
spec = json.load(sys.stdin)
for path, methods in spec.get('paths', {}).items():
    for method, details in methods.items():
        desc = details.get('description', '')
        if len(desc) > 300:
            print(f'❌ {method.upper()} {path}: {len(desc)} chars')
        else:
            print(f'✅ {method.upper()} {path}: {len(desc)} chars')
"

# Test QR endpoint
curl -s -I https://sacp.banksim.ca/qr/test_123 | grep -E "(HTTP|Content-Type)"
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-26 | Initial checklist after v1.4.6 QR code fix |
| 1.1 | 2026-01-26 | Added URL field guidance for v1.4.7 |

---

## Related Documentation

- [GPT_INSTRUCTIONS.md](GPT_INSTRUCTIONS.md) - Instructions for Custom GPT configuration
- [CHATGPT_QUICK_START.md](CHATGPT_QUICK_START.md) - Quick start guide for testing
- [AI_AGENT_ONBOARDING_PROMPT.md](AI_AGENT_ONBOARDING_PROMPT.md) - Full onboarding prompts
