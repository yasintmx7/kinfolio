import type Decimal from "decimal.js";

export type TransactionType =
  | "buy"
  | "sell"
  | "mined"
  | "gathered"
  | "crafted"
  | "drop"
  | "reward"
  | "gift"
  | "opening_balance"
  | "adjustment";

export type FeeTargetMode = "simple_add" | "exact_gross_up" | "off";

export type ValuationMethod =
  | "manual"
  | "lowest_active_listing"
  | "median_cheapest_3"
  | "median_recent_sales"
  | "avg_30d";

export type ItemCategory =
  | "tool"
  | "weapon"
  | "resource"
  | "food"
  | "potion"
  | "key"
  | "mount"
  | "pet"
  | "cosmetic"
  | "furniture"
  | "membership"
  | "other";

export type PortfolioTransaction = {
  id: string;
  schemaVersion: number;
  type: TransactionType;
  itemId: string;
  quantity: string;
  transactionAt: string;
  createdAt: string;
  updatedAt: string;

  kinsAmount: string;
  usdAmountAtTransaction: string;
  impliedKinsUsd?: string;

  sellAmountIsNet?: boolean;
  sellFeePercent?: string;

  actualUsdCost?: string;
  actualKinsCost?: string;
  protectedUsdCost?: string;
  protectedKinsCost?: string;

  source?: string;
  location?: string;
  tool?: string;
  durationMinutes?: string;

  rawAlert?: string;
  txHash?: string;
  fingerprint: string;
  note?: string;
};

export type UserSettings = {
  schemaVersion: number;
  defaultSellFeePercent: string;
  feeTargetMode: FeeTargetMode;
  sellAlertsAreNetByDefault: boolean;
  valuationMethod: ValuationMethod;
  currencyUsdPrecision: number;
  currencyKinsPrecision: number;
  theme: "dark" | "light";
  favoriteItemIds: string[];
  optionalWalletAddress?: string;
  manualKinsUsd?: string;
  onboardingComplete: boolean;
  updatedAt: string;
};

export type KintaraItem = {
  id: string;
  name: string;
  slug: string;
  category: ItemCategory;
  imageUrl?: string;
  wikiUrl?: string;
  aliases: string[];
  isFavoriteDefault: boolean;
  isTradeable?: boolean;
  source: "wiki" | "marketplace" | "static_seed";
  updatedAt: string;
};

export type ManualMarketPrice = {
  itemId: string;
  unitPriceKins: string;
  updatedAt: string;
  note?: string;
};

export type InventoryLotState = {
  itemId: string;
  quantity: Decimal;
  usdCostBasis: Decimal;
  kinsCostBasis: Decimal;
  purchasedQuantity: Decimal;
  earnedQuantity: Decimal;
};

export type InventoryPosition = {
  itemId: string;
  quantity: string;
  purchasedQuantity: string;
  earnedQuantity: string;
  usdCostBasis: string;
  kinsCostBasis: string;
  averageUsdPerItem: string;
  averageKinsPerItem: string;
};

export type RealizedSaleResult = {
  transactionId: string;
  itemId: string;
  quantitySold: string;
  netKinsReceived: string;
  netUsdReceived: string;
  usdCostBasisSold: string;
  kinsCostBasisSold: string;
  realizedUsdProfit: string;
  realizedKinsProfit: string;
  usdROI: string;
  kinsROI: string;
  transactionAt: string;
};

export type PortfolioSummary = {
  positions: InventoryPosition[];
  realizedSales: RealizedSaleResult[];
  totalRealizedUsdProfit: string;
  totalRealizedKinsProfit: string;
  totalUsdCostBasis: string;
  totalKinsCostBasis: string;
  totalQuantity: string;
  totalEarnedQuantity: string;
  totalPurchasedQuantity: string;
  totalNetSalesUsd: string;
  totalNetSalesKins: string;
};

export type ApplyTransactionResult =
  | { ok: true; state: Map<string, InventoryLotState> }
  | { ok: false; error: { code: string; message: string } };

export type ParsedTransferLine = {
  direction: "sent" | "received";
  kins: Decimal;
  usd: Decimal;
  counterparty?: string;
  raw: string;
};

export type ParsedAlert = {
  direction: "buy" | "sell" | "mixed" | "unknown";
  sentLines: ParsedTransferLine[];
  receivedLines: ParsedTransferLine[];
  totalSentKins: Decimal;
  totalSentUsd: Decimal;
  totalReceivedKins: Decimal;
  totalReceivedUsd: Decimal;
  txHash?: string;
  warnings: string[];
  rawText: string;
};

export type BackupPayload = {
  app: "kintara-portfolio";
  exportVersion: 1;
  exportedAt: string;
  transactions: PortfolioTransaction[];
  settings: UserSettings;
  customItems: KintaraItem[];
  marketPrices: ManualMarketPrice[];
};
