/**
 * SSIM (Store Simulator) API Client
 * Handles all store-related operations for agent commerce
 */

export interface UcpConfig {
  merchant: {
    name: string;
    id: string;
    logo?: string;
  };
  api: {
    base_url: string;
    version: string;
  };
  capabilities: string[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image_url?: string;
  available: boolean;
  category?: string;
}

export interface CartItem {
  product_id: string;
  quantity: number;
  price?: number;
  name?: string;
}

export interface CheckoutSession {
  id: string;
  status: 'cart_building' | 'ready_for_payment' | 'awaiting_authorization' | 'completed' | 'cancelled' | 'expired';
  cart: {
    items: CartItem[];
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
  };
  created_at: string;
  expires_at: string;
}

export interface Order {
  id: string;
  status: string;
  total: number;
  currency: string;
  items: CartItem[];
  created_at: string;
  transaction_id?: string;
}

export class SsimClient {
  private baseUrl: string;
  private agentToken: string;

  constructor(baseUrl: string, agentToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.agentToken = agentToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.agentToken}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SSIM API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Discover store capabilities via UCP
   */
  async discoverStore(storeUrl: string): Promise<UcpConfig> {
    const url = `${storeUrl}/.well-known/ucp`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`UCP discovery failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Browse products in the store
   */
  async browseProducts(query?: string, category?: string, limit = 20): Promise<Product[]> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    params.set('limit', limit.toString());

    const result = await this.request<{ products: Product[] }>(
      `/api/agent/v1/products?${params.toString()}`
    );
    return result.products;
  }

  /**
   * Get a specific product by ID
   */
  async getProduct(productId: string): Promise<Product> {
    return this.request<Product>(`/api/agent/v1/products/${productId}`);
  }

  /**
   * Create a new checkout session
   */
  async createCheckout(items: CartItem[]): Promise<CheckoutSession> {
    return this.request<CheckoutSession>('/api/agent/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  /**
   * Get checkout session details
   */
  async getCheckout(sessionId: string): Promise<CheckoutSession> {
    return this.request<CheckoutSession>(`/api/agent/v1/sessions/${sessionId}`);
  }

  /**
   * Update checkout session (add/remove items)
   */
  async updateCheckout(sessionId: string, items: CartItem[]): Promise<CheckoutSession> {
    return this.request<CheckoutSession>(`/api/agent/v1/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    });
  }

  /**
   * Complete checkout with payment token
   */
  async completeCheckout(sessionId: string, paymentToken: string, mandateId?: string): Promise<Order> {
    return this.request<Order>(`/api/agent/v1/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        payment_token: paymentToken,
        mandate_id: mandateId,
      }),
    });
  }

  /**
   * Cancel a checkout session
   */
  async cancelCheckout(sessionId: string): Promise<void> {
    await this.request<void>(`/api/agent/v1/sessions/${sessionId}/cancel`, {
      method: 'POST',
    });
  }

  /**
   * Get order status
   */
  async getOrder(orderId: string): Promise<Order> {
    return this.request<Order>(`/api/agent/v1/orders/${orderId}`);
  }
}
