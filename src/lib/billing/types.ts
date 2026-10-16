export type CheckoutSession = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefillName: string;
  prefillEmail: string;
};
