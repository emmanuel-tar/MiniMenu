/*
  Warnings:

  - Added the required column `productName` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "KOT" ADD COLUMN "estimatedReadyTime" DATETIME;
ALTER TABLE "KOT" ADD COLUMN "prepTimeMinutes" INTEGER;

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BROWSER',
    "ipAddress" TEXT,
    "port" INTEGER,
    "stationId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CASHIER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Printer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Printer_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReceiptSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "footerText" TEXT,
    "showTax" BOOLEAN NOT NULL DEFAULT true,
    "paperSize" TEXT NOT NULL DEFAULT '80mm',
    "autoPrint" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ReceiptSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SettingAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SettingAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "customerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "tableId" TEXT,
    "reservationTime" DATETIME NOT NULL,
    "guests" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryAssignTime" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "serviceAssignmentId" TEXT,
    "tipAmount" REAL NOT NULL,
    "givenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "givenByName" TEXT,
    CONSTRAINT "Tip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Tip_serviceAssignmentId_fkey" FOREIGN KEY ("serviceAssignmentId") REFERENCES "ServiceAssignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Category" ("createdAt", "description", "id", "name") SELECT "createdAt", "description", "id", "name" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "secondaryCurrency" TEXT,
    "exchangeRate" REAL DEFAULT 1.0,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "enableServiceCharge" BOOLEAN NOT NULL DEFAULT false,
    "serviceChargeRate" REAL DEFAULT 0,
    "contactEmail" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Company" ("address", "contactEmail", "currency", "id", "logo", "name", "phone", "taxRate", "updatedAt") SELECT "address", "contactEmail", "currency", "id", "logo", "name", "phone", "taxRate", "updatedAt" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT,
    "tableNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalAmount" REAL NOT NULL,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "serviceChargeAmount" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "guestCount" INTEGER NOT NULL DEFAULT 1,
    "waiterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "id", "status", "tableNumber", "totalAmount", "updatedAt") SELECT "createdAt", "id", "status", "tableNumber", "totalAmount", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "kotId" TEXT,
    "quantity" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "prepTimeMinutes" INTEGER,
    "countdownStartedAt" DATETIME,
    "estimatedCompletionTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_kotId_fkey" FOREIGN KEY ("kotId") REFERENCES "KOT" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("createdAt", "id", "kotId", "orderId", "price", "productId", "quantity", "stationId", "status") SELECT "createdAt", "id", "kotId", "orderId", "price", "productId", "quantity", "stationId", "status" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "image" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sku" TEXT,
    "barcode" TEXT,
    "categoryId" TEXT,
    "groupId" TEXT,
    "stationId" TEXT,
    "inventoryItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("available", "categoryId", "createdAt", "description", "groupId", "id", "image", "inventoryItemId", "name", "price", "stationId", "updatedAt") SELECT "available", "categoryId", "createdAt", "description", "groupId", "id", "image", "inventoryItemId", "name", "price", "stationId", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");
CREATE TABLE "new_ProductGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "productionStationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductGroup_productionStationId_fkey" FOREIGN KEY ("productionStationId") REFERENCES "ProductionStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProductGroup" ("createdAt", "id", "name") SELECT "createdAt", "id", "name" FROM "ProductGroup";
DROP TABLE "ProductGroup";
ALTER TABLE "new_ProductGroup" RENAME TO "ProductGroup";
CREATE UNIQUE INDEX "ProductGroup_name_key" ON "ProductGroup"("name");
CREATE TABLE "new_ProductionStation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "printerName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ProductionStation" ("createdAt", "description", "id", "name") SELECT "createdAt", "description", "id", "name" FROM "ProductionStation";
DROP TABLE "ProductionStation";
ALTER TABLE "new_ProductionStation" RENAME TO "ProductionStation";
CREATE UNIQUE INDEX "ProductionStation_name_key" ON "ProductionStation"("name");
CREATE UNIQUE INDEX "ProductionStation_code_key" ON "ProductionStation"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptSetting_companyId_key" ON "ReceiptSetting"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Tip_serviceAssignmentId_key" ON "Tip"("serviceAssignmentId");
