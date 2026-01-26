# Design Document: WSIM Push Notification for Guest Checkout

**Author**: WSIM Team
**Date**: 2026-01-26
**Status**: 🟢 All Teams Aligned - Ready for Implementation
**WSIM Version**: v1.2.5
**Related**: [Gateway v1.4.0 Guest Checkout](./GATEWAY_V1.4_GUEST_CHECKOUT.md)

---

## Executive Summary

This document describes an enhancement to the guest checkout flow that enables **direct push notifications** to users instead of requiring manual code entry. When the Gateway knows the buyer's email, WSIM can look up the user and send a push notification directly to their mobile device. The user taps the notification and lands on the approval screen - no code entry required.

**Benefits:**
- Faster checkout (1 tap vs typing a code)
- Better UX for known users
- Fallback to code entry still available

---

## Architecture Overview

```
┌─────────────────┐                      ┌─────────────────┐
│   AI Agent /    │  1. Checkout with    │     Gateway     │
│   Chat UI       │     buyer email      │                 │
└────────┬────────┘ ──────────────────▶  └────────┬────────┘
         │                                        │
         │                               2. device_authorization
         │                                  + buyer_email
         │                                        │
         │                                        ▼
         │                               ┌─────────────────┐
         │                               │      WSIM       │
         │                               │                 │
         │                               │ 3. Lookup user  │
         │                               │ 4. Send push    │
         │                               └────────┬────────┘
         │                                        │
         │  5. notification_sent: true            │
         │ ◀──────────────────────────────────────┘
         │
         │  6. Show "Check your phone"
         │     (or QR if notification_sent: false)
         ▼
┌─────────────────┐                      ┌─────────────────┐
│   Checkout UI   │                      │    mwsim        │
│   "Check your   │                      │  (Mobile App)   │
│    phone"       │                      │                 │
└─────────────────┘                      │ 7. Push arrives │
                                         │ 8. User taps    │
                                         │ 9. Approval     │
                                         │    screen       │
                                         └─────────────────┘
```

---

## Implementation Status

| Team | Task | Status |
|------|------|--------|
| WSIM | Accept `buyer_email` parameter | ✅ Done (v1.2.5) |
| WSIM | Lookup user by email | ✅ Done (v1.2.5) |
| WSIM | Send push notification | ✅ Done (v1.2.5) |
| WSIM | Return `notification_sent` in response | ✅ Done (v1.2.5) |
| Gateway | Pass `buyer_email` to device_authorization | ⬜ TODO |
| Gateway | Handle `notification_sent` response | ⬜ TODO |
| Gateway | Show conditional UI (push vs QR) | ⬜ TODO |
| mwsim | Handle `device_authorization.payment` notification | ⬜ TODO |
| mwsim | Route to AccessRequestApproval screen (see mwsim Analysis) | ⬜ TODO |
| mwsim | **UX: Add "Authorize" quick action to P2P tab** | ✅ Done (v2.2.0) |
| mwsim | **UX: Pre-fill WSIM- prefix in code entry** | ✅ Done (v2.2.0) |
| mwsim | **UX: Update copy for payment/connection context** | ✅ Done (v2.2.0) |

---

## Part 1: Gateway Team Changes

### 1.1 Updated API Request

When initiating guest checkout, include the buyer's email:

```typescript
// Gateway: initiate device authorization
const response = await fetch(`${WSIM_URL}/api/agent/v1/oauth/device_authorization`, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    agent_name: merchantName,           // e.g., "Demo Store"
    scope: 'purchase',
    spending_limits: {
      per_transaction: amount,          // e.g., 21.46
      currency: 'CAD',
    },
    response_type: 'token',             // Guest checkout mode
    buyer_email: buyerEmail,            // NEW: e.g., "john@example.com"
  }),
});
```

### 1.2 Updated API Response

WSIM now returns additional fields when `buyer_email` is provided:

```typescript
interface DeviceAuthorizationResponse {
  // Standard RFC 8628 fields
  device_code: string;                  // Access request ID for polling
  user_code: string;                    // e.g., "WSIM-XY7K9M"
  verification_uri: string;             // e.g., "https://wsim.banksim.ca/m/device"
  verification_uri_complete: string;    // URI with code pre-filled
  expires_in: number;                   // 900 (15 minutes)
  interval: number;                     // 5 (poll interval in seconds)

  // NEW: Push notification status (only present if buyer_email was provided)
  notification_sent?: boolean;          // true if push was delivered
  notification_user_id?: string | null; // User ID if found, null otherwise
}
```

### 1.3 Conditional UI Logic

The Gateway/AI should display different UI based on the response:

```typescript
const deviceAuthResponse = await initiateDeviceAuthorization({
  // ... params
  buyer_email: buyerEmail,
});

if (deviceAuthResponse.notification_sent) {
  // User has the app and will receive a push notification
  return {
    type: 'push_notification_sent',
    message: `We've sent a payment request to your phone. Please check your WSIM app to approve the $${amount} payment.`,
    // Still provide fallback options
    fallback: {
      user_code: deviceAuthResponse.user_code,
      verification_uri: deviceAuthResponse.verification_uri_complete,
      qr_code_data: deviceAuthResponse.verification_uri_complete,
    },
  };
} else {
  // User not found or no device - show QR/code entry
  return {
    type: 'code_entry_required',
    message: `Please scan the QR code or enter code ${deviceAuthResponse.user_code} in your WSIM app to approve the payment.`,
    user_code: deviceAuthResponse.user_code,
    verification_uri: deviceAuthResponse.verification_uri_complete,
    qr_code_data: deviceAuthResponse.verification_uri_complete,
  };
}
```

### 1.4 Chat UI Examples

**When push notification sent:**
```
┌─────────────────────────────────────────────────────────────┐
│  🔔 Payment Request Sent                                    │
│                                                             │
│  We've sent a payment request to your phone.                │
│  Please check your WSIM app to approve the $21.46 payment.  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Didn't receive it?                                  │   │
│  │  • Open WSIM app → Menu → Enter Code                 │   │
│  │  • Enter: WSIM-XY7K9M                                │   │
│  │  • Or scan: [Show QR Code]                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**When code entry required (user not found):**
```
┌─────────────────────────────────────────────────────────────┐
│  📱 Approve Payment in WSIM App                             │
│                                                             │
│  ┌───────────────┐                                         │
│  │   [QR CODE]   │  Scan this QR code with your WSIM app   │
│  │               │  to approve the $21.46 payment.         │
│  │               │                                         │
│  └───────────────┘  Or enter code: WSIM-XY7K9M             │
│                                                             │
│  Don't have the app? Download from App Store / Play Store   │
└─────────────────────────────────────────────────────────────┘
```

### 1.5 QR Code Generation

The Gateway should generate a QR code from `verification_uri_complete`:

```typescript
import QRCode from 'qrcode';

// Generate QR code as data URL for embedding in chat
const qrCodeDataUrl = await QRCode.toDataURL(deviceAuthResponse.verification_uri_complete, {
  width: 200,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#FFFFFF',
  },
});

// Or generate as SVG string
const qrCodeSvg = await QRCode.toString(deviceAuthResponse.verification_uri_complete, {
  type: 'svg',
  width: 200,
});
```

The QR code should encode the full `verification_uri_complete` URL:
```
https://wsim.banksim.ca/m/device?code=WSIM-XY7K9M
```

When scanned, this opens the WSIM web device auth page with the code pre-filled.

---

## Part 2: mwsim Team Changes

### 2.1 New Notification Type

WSIM sends the following push notification payload:

```json
{
  "aps": {
    "alert": {
      "title": "Demo Store wants to pay",
      "body": "Tap to authorize CAD 21.46 payment"
    },
    "sound": "default",
    "badge": 1
  },
  "type": "device_authorization.payment",
  "screen": "DeviceAuthApproval",
  "params": {
    "accessRequestId": "ar_abc123def456"
  },
  "access_request_id": "ar_abc123def456",
  "user_code": "WSIM-XY7K9M",
  "agent_name": "Demo Store",
  "amount": "21.46",
  "currency": "CAD"
}
```

### 2.2 Notification Type Reference

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"device_authorization.payment"` - identifies this notification type |
| `screen` | string | `"DeviceAuthApproval"` - target screen name |
| `params.accessRequestId` | string | Access request ID to fetch details |
| `access_request_id` | string | Same as above (for backwards compat) |
| `user_code` | string | The device code (e.g., `"WSIM-XY7K9M"`) |
| `agent_name` | string | Merchant/agent name to display |
| `amount` | string | Payment amount as string |
| `currency` | string | Currency code (e.g., `"CAD"`) |

### 2.3 Notification Handler Update

Add handling for the new notification type in your notification handler:

```typescript
// In useNotificationHandler.ts or similar

import { useNavigation } from '@react-navigation/native';

function handleNotification(notification: RemoteMessage) {
  const { data } = notification;

  switch (data?.type) {
    // ... existing cases ...

    case 'device_authorization.payment':
      // Navigate to device auth approval screen
      navigation.navigate('DeviceAuthApproval', {
        accessRequestId: data.access_request_id,
        // Optional: pre-populate UI with notification data
        agentName: data.agent_name,
        amount: data.amount,
        currency: data.currency,
        userCode: data.user_code,
      });
      break;

    // ... other cases ...
  }
}
```

### 2.4 DeviceAuthApproval Screen Requirements

The `DeviceAuthApproval` screen should support receiving `accessRequestId` directly (not just from code lookup):

```typescript
// Screen params type
type DeviceAuthApprovalParams = {
  // From notification (direct navigation)
  accessRequestId?: string;
  agentName?: string;
  amount?: string;
  currency?: string;
  userCode?: string;

  // From code entry flow (existing)
  code?: string;
};

function DeviceAuthApprovalScreen({ route }) {
  const { accessRequestId, code, agentName, amount, currency } = route.params;

  // If we have accessRequestId, fetch the request directly
  // If we have code, lookup by code first (existing flow)

  useEffect(() => {
    if (accessRequestId) {
      // Direct navigation from push notification
      fetchAccessRequest(accessRequestId);
    } else if (code) {
      // Code entry flow - lookup by code
      lookupByCode(code);
    }
  }, [accessRequestId, code]);

  // ... rest of screen implementation
}
```

### 2.5 Navigation Configuration

Ensure the screen is registered in your navigation config:

```typescript
// In navigation/types.ts
export type RootStackParamList = {
  // ... existing screens ...
  DeviceAuthApproval: {
    accessRequestId?: string;
    code?: string;
    agentName?: string;
    amount?: string;
    currency?: string;
    userCode?: string;
  };
};

// In navigation/linking.ts (for deep links)
const linking = {
  prefixes: ['wsim://', 'https://wsim.banksim.ca'],
  config: {
    screens: {
      // ... existing screens ...
      DeviceAuthApproval: {
        path: 'device-auth/:accessRequestId',
      },
    },
  },
};
```

### 2.6 API Endpoint for Fetching Access Request

The screen should fetch access request details:

```typescript
// GET /api/mobile/access-requests/:id
// Authorization: Bearer <user_token>

const response = await fetch(
  `${WSIM_URL}/api/mobile/access-requests/${accessRequestId}`,
  {
    headers: {
      'Authorization': `Bearer ${userToken}`,
    },
  }
);

// Response:
{
  "id": "ar_abc123def456",
  "status": "pending",
  "agent_name": "Demo Store",
  "agent_description": "Online shopping checkout",
  "requested_permissions": ["purchase"],
  "requested_limits": {
    "per_transaction": "21.46",
    "daily": "200.00",
    "monthly": "1000.00",
    "currency": "CAD"
  },
  "expires_at": "2026-01-26T12:15:00Z",
  "time_remaining_seconds": 842
}
```

### 2.7 Approve/Reject Actions

Use existing endpoints for approval/rejection:

```typescript
// Approve
POST /api/mobile/access-requests/:id/approve
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "consent": true,
  "permissions": ["purchase"],           // Optional: can only reduce from requested
  "spending_limits": {                   // Optional: can only reduce from requested
    "per_transaction": "21.46"
  }
}

// Reject
POST /api/mobile/access-requests/:id/reject
Authorization: Bearer <user_token>
```

---

## Part 3: User Experience Flows

### 3.1 Happy Path: Push Notification

```
1. User shops on AI-powered site, adds items to cart
2. User proceeds to checkout, enters email
3. AI initiates payment via Gateway
4. Gateway calls WSIM device_authorization with buyer_email
5. WSIM looks up user, sends push notification
6. Gateway receives notification_sent: true
7. AI shows "Check your phone" message
8. User's phone buzzes with payment notification
9. User taps notification → opens WSIM app → DeviceAuthApproval screen
10. User reviews payment details, taps "Approve"
11. Gateway polls token endpoint, receives access_token
12. Payment completes
```

### 3.2 Fallback: Code Entry

```
1-4. Same as above
5. WSIM doesn't find user by email (new user, typo, etc.)
6. Gateway receives notification_sent: false
7. AI shows QR code and manual code
8. User opens WSIM app manually
9. User navigates to "Enter Code" screen
10. User enters WSIM-XY7K9M or scans QR
11-12. Same approval flow
```

### 3.3 Edge Cases

| Scenario | Gateway Response | UI Behavior |
|----------|------------------|-------------|
| User found, push sent | `notification_sent: true` | Show "check your phone" |
| User not found | `notification_sent: false` | Show QR code + manual code |
| User found but no device registered | `notification_sent: false` | Show QR code + manual code |
| Push failed (network error) | `notification_sent: false` | Show QR code + manual code |
| User has app but notifications disabled | `notification_sent: true`* | Show "check your phone" + fallback |

*Note: WSIM can't know if the user has notifications disabled at the OS level. The push is "sent" from WSIM's perspective even if APNs/FCM can't deliver it.

---

## Part 4: Testing Checklist

### Gateway Team

- [ ] Pass `buyer_email` to device_authorization endpoint
- [ ] Handle `notification_sent: true` response - show "check your phone" UI
- [ ] Handle `notification_sent: false` response - show QR code UI
- [ ] Generate QR code from `verification_uri_complete`
- [ ] Display user code as fallback
- [ ] Test with known email (should get push)
- [ ] Test with unknown email (should show QR)
- [ ] Test with empty/null email (should show QR)

### mwsim Team

- [ ] Add handler for `device_authorization.payment` notification type
- [ ] Navigate to `DeviceAuthApproval` screen on notification tap
- [ ] Pass `accessRequestId` to screen
- [ ] Fetch access request details by ID
- [ ] Display approval UI with merchant name, amount, currency
- [ ] Approve action works correctly
- [ ] Reject action works correctly
- [ ] Test cold start (app not running when notification arrives)
- [ ] Test warm start (app in background)
- [ ] Test foreground notification handling

---

## Appendix A: Full API Reference

### Device Authorization Request

```
POST /api/agent/v1/oauth/device_authorization
Authorization: Basic <base64(client_id:client_secret)>
Content-Type: application/json

{
  "scope": "purchase",
  "agent_name": "Demo Store",
  "agent_description": "Online shopping checkout",
  "spending_limits": {
    "per_transaction": 100.00,
    "daily": 500.00,
    "monthly": 2000.00,
    "currency": "CAD"
  },
  "response_type": "token",
  "buyer_email": "john@example.com"
}
```

### Device Authorization Response

```json
{
  "device_code": "ar_abc123def456",
  "user_code": "WSIM-XY7K9M",
  "verification_uri": "https://wsim.banksim.ca/m/device",
  "verification_uri_complete": "https://wsim.banksim.ca/m/device?code=WSIM-XY7K9M",
  "expires_in": 900,
  "interval": 5,
  "notification_sent": true,
  "notification_user_id": "user_789xyz"
}
```

### Token Polling (unchanged)

```
POST /api/agent/v1/oauth/token
Authorization: Basic <base64(client_id:client_secret)>
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=ar_abc123def456
```

---

## Appendix B: Notification Payload Reference

### APNs Payload (iOS)

```json
{
  "aps": {
    "alert": {
      "title": "Demo Store wants to pay",
      "body": "Tap to authorize CAD 21.46 payment"
    },
    "sound": "default",
    "badge": 1,
    "mutable-content": 1
  },
  "type": "device_authorization.payment",
  "screen": "DeviceAuthApproval",
  "params": {
    "accessRequestId": "ar_abc123def456"
  },
  "access_request_id": "ar_abc123def456",
  "user_code": "WSIM-XY7K9M",
  "agent_name": "Demo Store",
  "amount": "21.46",
  "currency": "CAD"
}
```

### FCM Payload (Android)

```json
{
  "notification": {
    "title": "Demo Store wants to pay",
    "body": "Tap to authorize CAD 21.46 payment"
  },
  "data": {
    "type": "device_authorization.payment",
    "screen": "DeviceAuthApproval",
    "accessRequestId": "ar_abc123def456",
    "access_request_id": "ar_abc123def456",
    "user_code": "WSIM-XY7K9M",
    "agent_name": "Demo Store",
    "amount": "21.46",
    "currency": "CAD"
  }
}
```

---

## Part 5: mwsim Team Analysis (2026-01-26)

### 5.1 Implementation Approach

**Decision: Reuse existing AccessRequestApproval screen**

The `device_authorization.payment` flow returns an `AccessRequestDetail` (same format as agent pairing). Rather than creating a new `DeviceAuthApproval` screen, mwsim will:

1. Add `device_authorization.payment` to notification type handling
2. Map `DeviceAuthApproval` screen name → `AccessRequestApproval`
3. Pass `accessRequestId` as `requestId` parameter

This works because:
- Device code claim returns `{ access_request: AccessRequestDetail }` (same as pairing)
- Approve/reject endpoints are the same: `/mobile/access-requests/:id/approve|reject`
- UI displays the same info: agent name, permissions, spending limits, countdown

### 5.2 Screen Mapping

| WSIM Screen Name | mwsim Screen | Notes |
|------------------|--------------|-------|
| `DeviceAuthApproval` | `AccessRequestApproval` | Map in notification handler |
| `AgentStepUp` | `StepUpApproval` | Already mapped |
| `AgentAccessRequest` | `AccessRequestApproval` | Already mapped |

### 5.3 Required Changes

| File | Change | Effort |
|------|--------|--------|
| `notifications.ts` | Add `device_authorization.payment` type | Low |
| `notifications.ts` | Handle `DeviceAuthApproval` screen name | Low |
| `App.tsx` | No changes needed (AccessRequestApproval already exists) | None |

### 5.4 Notification Handler Addition

```typescript
// In handleNotificationResponse(), add after oauth.authorization handling:

// DEVICE AUTHORIZATION PAYMENT: type is "device_authorization.payment"
if (typeof data.type === 'string' && data.type === 'device_authorization.payment') {
  // Support both accessRequestId and access_request_id
  const requestId = (data.accessRequestId || data.access_request_id) as string;
  if (requestId) {
    console.log('[Notifications] Device auth payment notification, requestId:', requestId);
    return {
      screen: 'AccessRequestApproval',  // Reuse existing screen
      params: { requestId }
    };
  }
  console.warn('[Notifications] device_authorization.payment missing accessRequestId');
}
```

### 5.5 Clarification Questions for WSIM Team

1. **API Response Format**: The doc shows `agentName` (camelCase) but our existing `/mobile/access-requests/:id` endpoint returns `agent_name` (snake_case). Which format will WSIM use?

   **Current mwsim types:**
   ```typescript
   interface AccessRequestDetail {
     id: string;
     agent_name: string;           // snake_case
     agent_description?: string;
     requested_permissions: AgentPermission[];
     requested_limits: SpendingLimits;
     // ...
   }
   ```

2. **Permission Types**: The doc shows `requestedPermissions: ["payment:initiate"]` but mwsim uses `AgentPermission[] = 'browse' | 'cart' | 'purchase' | 'history'`. Is `payment:initiate` a new permission type, or will WSIM translate to our existing types?

3. **Approve Request Body**: The doc shows a different format than our existing API:

   **Doc shows:**
   ```json
   {
     "grantedPermissions": ["payment:initiate"],
     "grantedPerTransaction": 21.46,
     "grantedCurrency": "CAD"
   }
   ```

   **mwsim currently sends:**
   ```typescript
   {
     consent: true,
     permissions?: AgentPermission[],
     spending_limits?: SpendingLimitsInput
   }
   ```

   Which format should mwsim use for device authorization approvals?

### 5.6 Answers to Open Items

1. **Badge count management**: mwsim currently does not actively manage badge count. We can add badge clearing when user views approval screen. **Recommendation**: Clear badge on screen mount.

2. **Notification grouping**: Not currently supported. Multiple requests will show as separate notifications. **Recommendation**: Accept current behavior for v1; grouping can be added later if needed.

3. **Timeout handling**: If request has expired when user taps notification, `AccessRequestApproval` will:
   - Fetch access request details (will show `status: 'expired'`)
   - Display expired state with "This request has expired" message
   - Show "Dismiss" button only (no approve/reject)

   **This is already handled** in our existing AccessRequestApproval screen.

4. **Localization**: Not currently implemented. All strings are English. **Recommendation**: Defer to future release; ensure WSIM notification text is configurable for when we add i18n.

### 5.7 UX Improvements Completed (v2.2.0)

Based on feedback, the following UX improvements were made to the manual code entry flow:

| Change | Before | After |
|--------|--------|-------|
| **Quick access** | Buried in Settings | "Authorize" button on P2P tab (2 taps) |
| **Code input** | User types full code `WSIM-A3J2K9` | `WSIM-` pre-filled, user only enters 6 chars |
| **Screen title** | "Link Device" | "Authorize" |
| **Instructions** | "Connect an AI Assistant" | "Enter Authorization Code" |
| **Settings entry** | "Link Device" | "Enter Code" with "Authorize a payment or AI connection" |

### 5.8 Acknowledgment of WSIM Answers

**All clarification questions resolved.** WSIM confirmed:
- ✅ **snake_case format** - mwsim's existing types are correct, no changes needed
- ✅ **Permission types** - Same as mwsim (`browse`, `cart`, `purchase`, `history`)
- ✅ **Approve body format** - Use mwsim's existing `{ consent: true, ... }` format

**No code changes required** for API compatibility.

### 5.9 mwsim Sign-Off

| Reviewer | Status | Date | Notes |
|----------|--------|------|-------|
| mwsim Team | ✅ Aligned | 2026-01-26 | Will reuse AccessRequestApproval screen; clarification questions above |
| mwsim Team | ✅ WSIM Answers Accepted | 2026-01-26 | No API changes needed; UX improvements completed |

---

## Questions / Open Items

1. **Badge count management**: Should mwsim clear the badge when user views the notification?
   - **mwsim**: Will clear badge on approval screen mount.

2. **Notification grouping**: If multiple payment requests come in, should they be grouped?
   - **mwsim**: Not supported in v1. Accept separate notifications.

3. **Timeout handling**: What should mwsim show if the request has expired when user taps notification?
   - **mwsim**: Already handled - shows expired state with dismiss button.

4. **Localization**: Should notification text be localized based on user preferences?
   - **mwsim**: Defer to future release.

5. **[NEW - mwsim]** API response format - camelCase vs snake_case for access request fields?
   - **WSIM Answer**: WSIM returns **snake_case** (`agent_name`, `agent_description`, `requested_permissions`, `requested_limits`). The doc example at Section 2.6 was incorrect - mwsim's existing types are already correct.

6. **[NEW - mwsim]** Permission types - `payment:initiate` vs existing `AgentPermission[]`?
   - **WSIM Answer**: WSIM uses `browse`, `cart`, `purchase`, `history` - **same as mwsim's existing `AgentPermission[]`**. The doc example showing `payment:initiate` was a documentation error. No changes needed in mwsim.

7. **[NEW - mwsim]** Approve request body format - which format should be used?
   - **WSIM Answer**: Use **mwsim's existing format**:
     ```typescript
     {
       consent: true,
       permissions?: AgentPermission[],  // optional - can only reduce
       spending_limits?: { per_transaction?, daily?, monthly? }  // optional - can only reduce
     }
     ```
     The doc example was showing an internal format. No changes needed.

8. **[NEW - Gateway]** `notification_user_id` - is this field necessary for the Gateway?
   - **WSIM Answer**: **No, it's not necessary.** Gateway is correct that this is information leakage. Gateway should ignore this field. WSIM will consider removing it in a future release, but it's harmless if ignored.

9. **[NEW - Gateway]** Error handling - does WSIM return `notification_sent: false` on push failures, or an error?
   - **WSIM Answer**: **Returns 200 with `notification_sent: false`**. Push failures are caught and logged, but don't affect the response. The user can still enter the code manually. See [agent-oauth.ts:214-217](../../wsim/backend/src/routes/agent-oauth.ts#L214-L217).

---

## Part 6: Gateway Team Review (2026-01-26)

**Reviewer**: Agents Team (Gateway)
**Status**: ✅ Aligned with implementation approach

### 6.1 Questions for WSIM Team

1. **`notification_user_id` privacy**: The response includes `notification_user_id`. Is this field necessary for the Gateway? We only need `notification_sent: true/false` to adjust the UI. Exposing user IDs to the Gateway seems like unnecessary information leakage.
   - **Recommendation**: Gateway will ignore this field; consider removing it from the response if no other consumer needs it.

2. **Merchant name in notification**: Section 1.1 shows `agent_name: merchantName`, but the current Gateway uses `"SACP Gateway Guest Checkout"`. Should we pass the actual store/merchant name for better UX?
   - **Question**: Does `agent_name` appear in the push notification title? If so, we should use the merchant name.
   - **Proposal**: Gateway will use `checkout.merchant?.name` if available from SSIM, falling back to `"SACP Gateway"`.

3. **Error scenarios**: If WSIM fails to send the push (e.g., APNs/FCM error), does it return `notification_sent: false` or an error response?
   - **Clarification needed**: Confirm WSIM returns 200 with `notification_sent: false` rather than a 5xx error.

4. **QR code generation**: Section 1.5 suggests the `qrcode` npm package. Is QR generation required for this iteration?
   - **Gateway proposal**: Defer QR generation to v1.5.0. For now, return `verification_uri_complete` and let the AI/chat UI handle QR rendering if needed.

### 6.2 Implementation Notes

**Buyer email availability**: Confirmed. The Gateway retrieves the checkout from SSIM at [http-gateway.ts:1293](../mcp-server/src/http-gateway.ts#L1293), which includes `checkout.buyer.email` from the earlier PATCH call.

**Proposed Gateway changes** (in `completeCheckout` handler):

```typescript
// Add buyer_email to device_authorization request (~line 1356)
body: JSON.stringify({
  agent_name: checkout.merchant?.name || 'SACP Gateway Guest Checkout',
  agent_description: `Payment authorization for checkout ${session_id}`,
  scope: 'browse cart purchase',
  response_type: 'token',
  spending_limits: {
    per_transaction: checkout.cart.total,
    currency: checkout.cart.currency,
  },
  buyer_email: checkout.buyer?.email,  // NEW
}),
```

**Response handling**:

```typescript
// After deviceAuthResponse.json()
const notificationSent = deviceAuth.notification_sent === true;

return res.status(202).json({
  status: 'authorization_required',
  authorization_url: deviceAuth.verification_uri_complete || deviceAuth.verification_uri,
  user_code: deviceAuth.user_code,
  verification_uri: deviceAuth.verification_uri,
  poll_endpoint: `/checkout/${session_id}/payment-status/${requestId}`,
  expires_in: deviceAuth.expires_in || 300,
  notification_sent: notificationSent,  // NEW: let AI adjust messaging
  message: notificationSent
    ? `We've sent a payment request to your phone. Check your WSIM app to approve the ${checkout.cart.currency} ${(checkout.cart.total / 100).toFixed(2)} payment. If you don't see it, enter code ${deviceAuth.user_code} at ${deviceAuth.verification_uri}.`
    : `To complete your purchase of ${checkout.cart.currency} ${(checkout.cart.total / 100).toFixed(2)}, please enter code ${deviceAuth.user_code} at ${deviceAuth.verification_uri} or open the link in your wallet app.`,
});
```

### 6.3 OpenAPI Spec Update

The `AuthorizationRequired` response schema should be updated to include `notification_sent`:

```yaml
AuthorizationRequired:
  type: object
  properties:
    status:
      type: string
      enum: [authorization_required]
    notification_sent:        # NEW
      type: boolean
      description: True if push notification was sent to user's device
    user_code:
      type: string
    # ... existing fields
```

### 6.4 Testing Checklist Updates

- [ ] Pass `buyer_email` to device_authorization endpoint
- [ ] Handle `notification_sent: true` response - include in API response
- [ ] Handle `notification_sent: false` or absent - include in API response
- [ ] Update message text based on notification status
- [ ] Test with known email (should get `notification_sent: true`)
- [ ] Test with unknown email (should get `notification_sent: false`)
- [ ] Test with empty/null email (should get `notification_sent: false`)
- [ ] Verify AI agents can use `notification_sent` to adjust their messaging

### 6.5 Gateway Sign-Off

| Reviewer | Status | Date | Notes |
|----------|--------|------|-------|
| Gateway Team | ✅ Aligned | 2026-01-26 | Will implement after clarification on questions 1-3; target v1.4.4 |

---

## Part 7: WSIM Team Review & Clarifications (2026-01-26)

**Reviewer**: WSIM Team
**Status**: ✅ All questions answered

### 7.1 Answers to mwsim Questions

| Question | Answer |
|----------|--------|
| **Q5: API response format** | WSIM uses **snake_case**: `agent_name`, `requested_permissions`, `requested_limits`, etc. mwsim's existing types are correct. |
| **Q6: Permission types** | WSIM uses `browse`, `cart`, `purchase`, `history` - **same as mwsim**. The doc incorrectly showed `payment:initiate`. Fixed. |
| **Q7: Approve body format** | Use mwsim's existing format: `{ consent: true, permissions?: [], spending_limits?: {} }`. The doc examples have been corrected. |

### 7.2 Answers to Gateway Questions

| Question | Answer |
|----------|--------|
| **Q8: notification_user_id** | Gateway is correct - this is unnecessary. **Ignore this field.** WSIM may remove it in a future release. |
| **Q9: Error handling** | WSIM returns **200 with `notification_sent: false`** on push failures. Never returns 5xx for push issues. User can still enter code manually. |

### 7.3 Additional Clarifications

**Merchant name in notification**: Yes, Gateway should pass the actual merchant name in `agent_name`. This appears directly in the push notification title:
```
"{agent_name} wants to pay"
```
**Recommendation**: Use `checkout.merchant?.name || 'SACP Gateway'` as Gateway proposed.

**QR code generation**: Not required from WSIM. Gateway receives `verification_uri_complete` and can generate QR client-side if needed. Deferring to v1.5.0 is fine.

### 7.4 Doc Corrections Made

1. Fixed Section 2.6 response example to use snake_case and correct permission types
2. Fixed Section 2.7 approve request body to use `consent: true` format
3. Added WSIM answers to all open questions (Section 7)

### 7.5 WSIM Sign-Off

| Reviewer | Status | Date | Notes |
|----------|--------|------|-------|
| WSIM Team | ✅ Complete | 2026-01-26 | All questions answered, doc corrections applied |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-26 | 1.4 | mwsim update - acknowledged WSIM answers, UX improvements completed (Authorize button, WSIM- prefix, updated copy) |
| 2026-01-26 | 1.3 | WSIM review - answered all questions, fixed doc examples (snake_case, permissions, approve body) |
| 2026-01-26 | 1.2 | Gateway team review - aligned, target v1.4.4; added questions 8-9 |
| 2026-01-26 | 1.1 | mwsim team review - aligned, will reuse AccessRequestApproval screen |
| 2026-01-26 | 1.0 | Initial document - WSIM v1.2.5 implementation complete |
