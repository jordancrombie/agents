/**
 * WSIM (Wallet Simulator) API Client
 * Handles all wallet-related operations for agent commerce
 */

export interface AgentCredentials {
  client_id: string;
  client_secret: string;
}

export interface AccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface SpendingLimits {
  per_transaction: number;
  daily: number;
  daily_remaining: number;
  monthly?: number;
  monthly_remaining?: number;
  currency: string;
}

export interface PaymentTokenRequest {
  amount: number;
  currency: string;
  merchant_id: string;
  session_id: string;
}

export interface PaymentTokenResponse {
  payment_token?: string;
  step_up_required?: boolean;
  step_up_id?: string;
  expires_at?: string;
}

export interface StepUpStatus {
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  payment_token?: string;
  expires_at?: string;
}

export class WsimClient {
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(baseUrl: string, clientId: string, clientSecret: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async ensureAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    // Request new token
    const response = await fetch(`${this.baseUrl}/api/agent/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WSIM OAuth error (${response.status}): ${error}`);
    }

    const token: AccessToken = await response.json();
    this.accessToken = token.access_token;
    this.tokenExpiresAt = Date.now() + token.expires_in * 1000;

    return this.accessToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.ensureAccessToken();
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WSIM API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Get agent's current access token (for SSIM authentication)
   */
  async getAccessToken(): Promise<string> {
    return this.ensureAccessToken();
  }

  /**
   * Get current spending limits
   */
  async getSpendingLimits(): Promise<SpendingLimits> {
    return this.request<SpendingLimits>('/api/agent/v1/limits');
  }

  /**
   * Request a payment token for a transaction
   * Returns token directly if within limits, or step_up_id if approval needed
   */
  async requestPaymentToken(params: PaymentTokenRequest): Promise<PaymentTokenResponse> {
    return this.request<PaymentTokenResponse>('/api/agent/v1/payments/token', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Check status of a step-up approval request
   */
  async getStepUpStatus(stepUpId: string): Promise<StepUpStatus> {
    return this.request<StepUpStatus>(`/api/agent/v1/payments/token/${stepUpId}/status`);
  }

  /**
   * Poll for step-up approval with timeout
   */
  async waitForStepUpApproval(
    stepUpId: string,
    timeoutMs = 900000, // 15 minutes default
    pollIntervalMs = 5000
  ): Promise<StepUpStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getStepUpStatus(stepUpId);

      if (status.status !== 'pending') {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    return { status: 'expired' };
  }
}
