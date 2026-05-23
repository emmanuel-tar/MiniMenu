import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { createServer as createViteServer } from "vite"; // Keep this line
import crypto from "crypto";
import { Server, Socket } from "socket.io";
import http from "http";
import { prisma } from "./src/lib/db.ts"; // Changed from .js to .ts
import { hashPassword, comparePassword, generateToken, verifyToken } from "./src/lib/auth.ts";

// Define a custom interface for requests with authenticated users
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

interface PrintableKotItem {
  quantity: number;
  productName: string;
  notes?: string;
}

interface PrintableKot {
  kotId: string;
  orderId: string;
  tableNumber: string;
  stationName: string;
  items: PrintableKotItem[];
  createdAt: string;
  printer: {
    id: string;
    name: string;
    type: string; // BROWSER, NETWORK, PDF
    ipAddress?: string;
    port?: number;
  };
}

interface PrintableInvoiceItem {
  quantity: number;
  productName: string;
  price: number;
}

interface PrintableInvoice {
  orderId: string;
  tableNumber: string;
  items: PrintableInvoiceItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  createdAt: string;
  company: {
    name: string;
    logo?: string;
    address?: string;
    phone?: string;
    currency: string;
  };
  receiptSettings: {
    footerText?: string;
    showLogo: boolean;
    showTax: boolean;
    paperSize: string;
  };
  printer: {
    id: string;
    name: string;
    type: string;
    ipAddress?: string;
    port?: number;
  };
}

interface ProductImport {
  name: string;
  description: string | null;
  categoryName: string;
  groupName: string;
  stationName: string;
  price: number;
  sku: string | null;
  barcode: string | null;
  available: boolean;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" }
  });
  const PORT = Number(process.env.PORT || 3000);

  // Verify database connection on startup
  try {
    await prisma.$connect();
    console.log("Successfully connected to the database");
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    process.exit(1);
  }

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }

  app.use(express.json());
  app.use(cors());

  // Serve uploads statically
  app.use('/uploads', express.static(uploadsDir));

  // In-memory storage for active waiter requests
  // For production, this should be moved to a database table
  const activeWaiterCalls: any[] = (globalThis as any).activeWaiterCalls ?? [];
  (globalThis as any).activeWaiterCalls = activeWaiterCalls;

  // In-memory storage for handled waiter calls
  const handledWaiterCalls: any[] = (globalThis as any).handledWaiterCalls ?? [];
  (globalThis as any).handledWaiterCalls = handledWaiterCalls;

  // In-memory storage for active payment selections
  const activePaymentSelections: any[] = (globalThis as any).activePaymentSelections ?? [];
  (globalThis as any).activePaymentSelections = activePaymentSelections;

  // Socket.IO Connection Logic
  io.on("connection", (socket: Socket) => {
    socket.on("join-order", (orderId: string) => {
      socket.join(`order-${orderId}`);
      console.log(`[Socket] Customer joined order tracking: ${orderId}`);
    });

    // Handle waiter calls
    socket.on("call-waiter", (data: { tableId: string; tableName: string }) => {
      const call = {
        id: crypto.randomUUID(),
        tableId: data.tableId,
        tableName: data.tableName,
        createdAt: new Date().toISOString(),
      };
      activeWaiterCalls.push(call);
      console.log(`[Socket] Waiter called to table: ${call.tableName}`);
      io.emit("waiter-requested", call);
    });

    // Handle payment method selection from customer tracking page
    socket.on("payment-method-selected", async (data: { orderId: string; method: string }) => {
      console.log(`[Socket] Payment method ${data.method} selected for order ${data.orderId}`);
      try {
        const order = await prisma.order.findUnique({
          where: { id: data.orderId },
          include: { table: true }
        });

        if (!order) return;

      const selection = {
        id: crypto.randomUUID(),
        orderId: data.orderId,
        method: data.method,
        tableNumber: order.tableNumber || 'Walk-in',
        createdAt: new Date().toISOString()
      };

      const existingIndex = activePaymentSelections.findIndex(s => s.orderId === data.orderId);
      if (existingIndex !== -1) activePaymentSelections.splice(existingIndex, 1);
      activePaymentSelections.push(selection);

      io.emit("payment-method-updated", selection);

        // Find printer assigned to CASHIER role to notify staff of payment request
        const printers = await prisma.printer.findMany({
          where: { active: true, role: 'CASHIER' }
        });

        if (printers.length > 0) {
          const targetPrinter = printers[0];
          const printableKot: PrintableKot = {
            kotId: `PAY-${order.id.slice(0, 5)}`,
            orderId: order.id,
            tableNumber: order.tableNumber || 'Walk-in',
            stationName: "PAYMENT REQUEST",
            items: [{
              quantity: 1,
              productName: `BILLING REQUEST: ${data.method}`,
            }],
            createdAt: new Date().toISOString(),
            printer: {
              id: targetPrinter.id,
              name: targetPrinter.name,
              type: targetPrinter.type,
              ipAddress: targetPrinter.ipAddress || undefined,
              port: targetPrinter.port || undefined,
            }
          };
          io.emit("print-kot", printableKot);
        }
      } catch (err) {
        console.error("Socket Payment Selection Error:", err);
      }
    });

    socket.on("dismiss-waiter-call", (id: string) => {
      const index = activeWaiterCalls.findIndex(c => c.id === id);
      if (index !== -1) {
        const handledCall = {
          ...activeWaiterCalls[index],
          handledAt: new Date().toISOString(),
        };
        activeWaiterCalls.splice(index, 1);
        handledWaiterCalls.unshift(handledCall);
        if (handledWaiterCalls.length > 10) handledWaiterCalls.pop(); // Keep last 10 history items

        io.emit("waiter-call-dismissed", id);
        io.emit("waiter-call-handled", handledCall);
      }
    });

    socket.on("clear-waiter-history", () => {
      handledWaiterCalls.length = 0;
      io.emit("waiter-history-cleared");
      console.log("[Socket] Waiter history cleared");
    });
  });

  // Multer config
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ storage });

  // Middleware for Auth
  const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Upload Route
  app.post("/api/upload", authenticate, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  });

  // Auth Routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const email = req.body.email?.toLowerCase().trim();
      const password = req.body.password?.trim();

      console.log(`[Auth] Login attempt for: ${email}`);
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        console.warn(`[Auth] Login failed: No user found with email "${email}"`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const valid = await comparePassword(password, user.password);
      if (!valid) {
        console.warn(`[Auth] Login failed: Incorrect password for "${email}"`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      console.log(`[Auth] Login successful for: ${email}`);
      const token = generateToken({ userId: user.id, role: user.role });
      res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Setup / Seed (Initial Admin)
  app.post("/api/setup/admin", async (req, res) => {
    try {
      const email = req.body.email?.toLowerCase().trim();
      const password = req.body.password?.trim();
      const { name } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      console.log(`[Setup] Resetting/Creating admin account: ${email}`);
      const hashedPassword = await hashPassword(password);

      const user = await prisma.user.upsert({
        where: { email },
        update: { password: hashedPassword, name, role: 'ADMIN' },
        create: { email, password: hashedPassword, name, role: 'ADMIN' }
      });

      console.log(`[Setup] Admin account synchronized: ${email}`);
      res.json({ success: true, userId: user.id });
    } catch (error) {
      console.error("Admin Setup Error:", error);
      res.status(500).json({ error: "Failed to create admin" });
    }
  });

  // Company Settings
  app.get("/api/company", async (req, res) => {
    const company = await prisma.company.findFirst();
    res.json(company || {});
  });

  app.post("/api/company", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { id, updatedAt, ...data } = req.body;
    const existing = await prisma.company.findFirst();
    if (existing) {
      const updated = await prisma.company.update({
        where: { id: existing.id },
        data
      });
      return res.json(updated);
    }
    const created = await prisma.company.create({ data });
    res.json(created);
  });

  // Printer Management
  app.get("/api/settings/printers", authenticate, async (req, res) => {
    const printers = await prisma.printer.findMany();
    res.json(printers);
  });

  app.post("/api/settings/printers", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const company = await prisma.company.findFirst();
    if (!company) return res.status(400).json({ error: "Company profile must be created first" });
    
    const printer = await prisma.printer.create({
      data: { ...req.body, companyId: company.id }
    });
    res.json(printer);
  });

  // Receipt Settings
  app.get("/api/settings/receipt", async (req, res) => {
    const settings = await prisma.receiptSetting.findFirst();
    res.json(settings || {});
  });

  app.post("/api/settings/receipt", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const company = await prisma.company.findFirst();
    if (!company) return res.status(400).json({ error: "Company profile must be created first" });

    const existing = await prisma.receiptSetting.findFirst();
    if (existing) {
      const { id, companyId, ...data } = req.body;
      const updated = await prisma.receiptSetting.update({
        where: { id: existing.id },
        data
      });
      return res.json(updated);
    }
    const created = await prisma.receiptSetting.create({
      data: { ...req.body, companyId: company.id }
    });
    res.json(created);
  });

  // Cashier Billing & Completion
  app.post("/api/admin/orders/:id/pay", authenticate, async (req, res) => {
    const { id } = req.params;
    const { method, amount, reference } = req.body;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id } });
        if (!order) throw new Error("Order not found");

        const payment = await tx.payment.create({
          data: {
            orderId: id,
            method,
            amount: amount || order.totalAmount,
            reference
          }
        });

        const updatedOrder = await tx.order.update({
          where: { id },
          data: { status: 'PAID' },
          include: { items: true }
        });

        const selectionIndex = activePaymentSelections.findIndex(s => s.orderId === id);
        if (selectionIndex !== -1) {
          activePaymentSelections.splice(selectionIndex, 1);
          io.emit("payment-method-cleared", id);
        }

        // Close the table
        if (order.tableId) {
          await tx.table.update({
            where: { id: order.tableId },
            data: { status: 'AVAILABLE' }
          });
        }

        return { payment, order: updatedOrder };
      });

      // Trigger Auto-Print if configured
      const [company, settings, printers] = await Promise.all([
        prisma.company.findFirst(),
        prisma.receiptSetting.findFirst(),
        prisma.printer.findMany({ where: { role: 'CASHIER', active: true } })
      ]);

      if (settings?.autoPrint && printers.length > 0 && company) {
        const targetPrinter = printers[0];
        const taxRate = company.taxRate || 0;
        const subtotal = result.order.totalAmount / (1 + (taxRate / 100));
        const taxAmount = result.order.totalAmount - subtotal;

        const printableInvoice: PrintableInvoice = {
          orderId: result.order.id,
          tableNumber: result.order.tableNumber || 'Walk-in',
          items: result.order.items.map(i => ({
            quantity: i.quantity,
            productName: i.productName,
            price: i.price
          })),
          subtotal,
          taxAmount,
          totalAmount: result.order.totalAmount,
          createdAt: result.order.createdAt.toISOString(),
          company: {
            name: company.name,
            logo: company.logo || undefined,
            address: company.address || undefined,
            phone: company.phone || undefined,
            currency: company.currency
          },
          receiptSettings: {
            footerText: settings.footerText || undefined,
            showLogo: settings.showLogo,
            showTax: settings.showTax,
            paperSize: settings.paperSize
          },
          printer: {
            id: targetPrinter.id,
            name: targetPrinter.name,
            type: targetPrinter.type,
            ipAddress: targetPrinter.ipAddress || undefined,
            port: targetPrinter.port || undefined
          }
        };
        io.emit("print-invoice", printableInvoice);
      }

      io.emit("order-paid", { orderId: id, tableNumber: result.order.tableNumber });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/orders/:id/complete", authenticate, async (req, res) => {
    const { id } = req.params;
    try {
      const order = await prisma.order.update({
        where: { id },
        data: { status: 'COMPLETED' }
      });
      io.emit("order-completed", id);
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to complete order" });
    }
  });

  // Menu Export/Import
  app.get("/api/menu/export", authenticate, async (req, res) => {
    try {
      const [categories, groups, stations, products] = await Promise.all([
        prisma.category.findMany(),
        prisma.productGroup.findMany(),
        prisma.productionStation.findMany(),
        prisma.product.findMany()
      ]);
      res.json({ categories, groups, stations, products });
    } catch (error) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.post("/api/menu/import", authenticate, async (req, res) => {
    const { categories, groups, stations, products } = req.body;
    
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Process Categories
        const catMap = new Map();
        for (const cat of categories) {
          const upserted = await tx.category.upsert({
            where: { id: cat.id },
            update: { name: cat.name, description: cat.description },
            create: { id: cat.id, name: cat.name, description: cat.description }
          });
          catMap.set(cat.name, upserted.id);
        }

        // 2. Process Groups
        const groupMap = new Map();
        for (const grp of groups) {
          const upserted = await tx.productGroup.upsert({
            where: { id: grp.id },
            update: { name: grp.name },
            create: { id: grp.id, name: grp.name }
          });
          groupMap.set(grp.name, upserted.id);
        }

        // 3. Process Stations
        const stationMap = new Map();
        for (const st of stations) {
          const upserted = await tx.productionStation.upsert({
            where: { id: st.id },
            update: { name: st.name, description: st.description },
            create: { id: st.id, name: st.name, description: st.description }
          });
          stationMap.set(st.name, upserted.id);
        }

        // 4. Process Products
        for (const prod of products) {
          // Strip relations and cost field not in schema
          const { category, group, station, inventoryItem, cost, ...cleanProd } = prod;
          
          await tx.product.upsert({
            where: { id: cleanProd.id },
            update: {
              ...cleanProd,
              updatedAt: new Date()
            },
            create: {
              ...cleanProd,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ error: "Import failed during database transaction" });
    }
  });

  app.post("/api/menu/import/csv", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });

    const csvContent: string = req.body.csv;
    if (!csvContent) return res.status(400).json({ error: "CSV content is required" });

    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return res.status(400).json({ error: "Empty CSV content" });

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const productsToImport: ProductImport[] = [];
    const errors: { row: number; message: string }[] = [];

    // Expected headers for a basic import
    const expectedHeaders = ["name", "description", "category", "group", "location", "price", "sku", "barcode", "available"];
    const headerMap: { [key: string]: number } = {};
    expectedHeaders.forEach(expHeader => {
      const index = headers.indexOf(expHeader);
      if (index !== -1) {
        headerMap[expHeader] = index;
      }
    });

    if (Object.keys(headerMap).length < expectedHeaders.length) {
      return res.status(400).json({ error: `Missing required CSV headers. Expected: ${expectedHeaders.join(', ')}` });
    }

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length !== headers.length) {
        errors.push({ row: i + 1, message: `Row has incorrect number of columns. Expected ${headers.length}, got ${values.length}.` });
        continue;
      }

      try {
        const name = values[headerMap["name"]]?.trim();
        const description = values[headerMap["description"]]?.trim();
        const categoryName = values[headerMap["category"]]?.trim();
        const groupName = values[headerMap["group"]]?.trim();
        const stationName = values[headerMap["location"]]?.trim();
        const price = parseFloat(values[headerMap["price"]]?.trim());
        const sku = values[headerMap["sku"]]?.trim() || null;
        const barcode = values[headerMap["barcode"]]?.trim() || null;
        const available = values[headerMap["available"]]?.trim().toLowerCase() === 'yes';

        if (!name || !categoryName || !groupName || !stationName || isNaN(price)) {
          errors.push({ row: i + 1, message: "Missing required fields (Name, Category, Group, Location, Price) or invalid Price." });
          continue;
        }

        productsToImport.push({
          name, description, categoryName, groupName, stationName, price, sku, barcode, available
        });
      } catch (parseError: any) {
        errors.push({ row: i + 1, message: `Parsing error: ${parseError.message}` });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: "CSV parsing errors", details: errors });
    }

    try {
      await prisma.$transaction(async (tx) => {
        for (const productData of productsToImport) {
          // Find or create Category
          const category = await tx.category.upsert({
            where: { name: productData.categoryName },
            update: {},
            create: { name: productData.categoryName }
          });

          // Find or create ProductionStation
          const station = await tx.productionStation.upsert({
            where: { name: productData.stationName },
            update: {},
            create: { name: productData.stationName }
          });

          // Find or create ProductGroup, linking to station if not already linked
          const group = await tx.productGroup.upsert({
            where: { name: productData.groupName },
            update: {
              productionStationId: station.id // Ensure group is linked to station
            },
            create: {
              name: productData.groupName,
              productionStationId: station.id
            }
          });

          // Upsert Product
          await tx.product.upsert({
            where: { name: productData.name },
            update: {
              name: productData.name,
              description: productData.description,
              price: productData.price,
              available: productData.available,
              categoryId: category.id,
              groupId: group.id,
              stationId: station.id,
              barcode: productData.barcode,
              updatedAt: new Date()
            },
            create: {
              name: productData.name,
              description: productData.description,
              price: productData.price,
              available: productData.available,
              categoryId: category.id,
              groupId: group.id,
              stationId: station.id,
              sku: productData.sku,
              barcode: productData.barcode,
            }
          });
        }
      });
      res.json({ success: true, message: "CSV import completed successfully." });
    } catch (error) {
      console.error("CSV Import error:", error);
      res.status(500).json({ error: "Failed to import CSV data during database transaction", details: (error as Error).message });
    }
  });

  app.delete("/api/menu/clear", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    
    try {
      await prisma.$transaction([
        prisma.orderItem.deleteMany(),
        prisma.kOT.deleteMany(),
        prisma.order.deleteMany(),
        prisma.product.deleteMany(),
        prisma.productGroup.deleteMany(),
        prisma.category.deleteMany(),
      ]);
      console.log(`[Menu] Bulk delete performed by user ${req.user.userId}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Clear menu error:", error);
      res.status(500).json({ error: "Failed to clear menu data" });
    }
  });

  // Waiter Requests API
  app.get("/api/admin/waiter-calls", authenticate, (req, res) => {
    res.json(activeWaiterCalls);
  });

  // Handled Waiter Requests API
  app.get("/api/admin/waiter-calls/history", authenticate, (req, res) => {
    res.json(handledWaiterCalls);
  });

  // Active Payment Selections API
  app.get("/api/admin/payment-selections", authenticate, (req, res) => {
    res.json(activePaymentSelections);
  });

  // Menu Management
  app.get("/api/menu/categories", async (req, res) => {
    const categories = await prisma.category.findMany({ include: { products: true } });
    res.json(categories);
  });

  app.post("/api/menu/categories", authenticate, async (req, res) => {
    const { name, description } = req.body;
    const category = await prisma.category.create({ data: { name, description } });
    res.json(category);
  });

  // Product Groups (Operational Routing Layer)
  app.get("/api/menu/groups", async (req, res) => {
    const groups = await prisma.productGroup.findMany();
    res.json(groups);
  });

  app.post("/api/menu/groups", authenticate, async (req, res) => {
    const { name } = req.body;
    const group = await prisma.productGroup.create({ data: { name } });
    res.json(group);
  });

  app.get("/api/menu/products", async (req, res) => {
    const products = await prisma.product.findMany({ 
      include: { category: true, group: true, station: true } 
    });
    res.json(products);
  });

  app.post("/api/menu/products", authenticate, async (req, res) => {
    // Frontend sends `cost`, but Prisma model uses `inventoryItemId` for costing/tracking.
    // We still allow `cost` in the payload for UI compatibility, and strip it out
    // to prevent Prisma validation errors.
    const data = req.body as any;
    
    // Strip fields not directly in the Product model or handled separately
    const { cost, ...productData } = data;

    // Use productData for Prisma create
    try {
      const product = await prisma.product.create({ data: productData });
      res.json(product);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.patch("/api/menu/products/bulk-status", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { ids, available } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No product IDs provided" });
    }

    try {
      await prisma.product.updateMany({
        where: { id: { in: ids } },
        data: { available }
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Bulk update failed" });
    }
  });

  app.post("/api/menu/products/:id/clone", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    try {
      const source = await prisma.product.findUnique({ where: { id } });
      if (!source) return res.status(404).json({ error: "Product not found" });

      // Destructure and omit fields that must be unique or fresh
      const { id: _, createdAt, updatedAt, sku, barcode, ...rest } = source as any;

      const cloned = await prisma.product.create({
        data: {
          ...rest,
          name: `${source.name} (Copy)`,
          sku: null,    // Clear unique fields to allow manual update later
          barcode: null,
          available: false, // Default to hidden so they can edit before publishing
        },
        include: { category: true, group: true, station: true }
      });
      res.json(cloned);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to clone product" });
    }
  });

  app.put("/api/menu/products/:id", authenticate, async (req, res) => {
    const { id } = req.params;
    const data = req.body as any;

    // Strip fields not directly in the Product model or handled separately
    const { cost, ...productData } = data;

    try {
      const product = await prisma.product.update({
        where: { id },
        data: productData
      });
      res.json(product);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  // Production Stations
  app.get("/api/stations", async (req, res) => {
    const stations = await prisma.productionStation.findMany();
    res.json(stations);
  });

  app.post("/api/stations", authenticate, async (req, res) => {
    const { name, description } = req.body;
    const station = await prisma.productionStation.create({ data: { name, description } });
    res.json(station);
  });

  // Table Management
  app.get("/api/tables", async (req, res) => {
    try {
      const tables = await prisma.table.findMany({
        orderBy: { name: 'asc' }
      });
      res.json(tables);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tables" });
    }
  });

  app.post("/api/tables", authenticate, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    try {
      const table = await prisma.table.create({
        data: { name }
      });
      res.json(table);
    } catch (error) {
      res.status(500).json({ error: "Failed to create table" });
    }
  });

  app.put("/api/tables/:id", authenticate, async (req, res) => {
    const { id } = req.params;
    const data = req.body || {};
    try {
      const table = await prisma.table.update({
        where: { id },
        data: {
          name: data.name,
          status: data.status,
          active: data.active
        }
      });
      res.json(table);
    } catch (error) {
      res.status(404).json({ error: "Table not found or update failed" });
    }
  });


  // Customer Ordering
  app.post("/api/orders", async (req, res) => {
    const { tableId, items } = req.body;
    
    try {
      const order = await prisma.$transaction(async (tx) => {
        let totalAmount = 0;
        let resolvedTableNumber = "WALK-IN";

        if (tableId) {
          const table = await tx.table.findUnique({ where: { id: tableId } });
          if (table) {
            resolvedTableNumber = table.name;
          }
        }

        const orderItemsData = [];
        
        const stationItemsMap = new Map<string, any[]>();
        
        for (const item of items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (product) {
            // Snapshot Architecture: Use current price for this specific order record
            totalAmount += product.price * item.quantity;
            const orderItem = {
              productId: product.id,
              productName: product.name,
              quantity: item.quantity,
              price: product.price,
              // Route via the product's assigned station
              stationId: product.stationId,
              status: 'PENDING'
            };
            orderItemsData.push(orderItem);

            // Group by station for KOT
            const stationItems = stationItemsMap.get(product.stationId) || [];
            stationItems.push(orderItem);
            stationItemsMap.set(product.stationId, stationItems);

            // Automatic Inventory Deduction
            if (product.inventoryItemId) {
              const invItem = await tx.inventoryItem.findUnique({ where: { id: product.inventoryItemId } });
              if (invItem) {
                const newStock = invItem.quantity - item.quantity;
                await tx.inventoryItem.update({
                  where: { id: invItem.id },
                  data: { quantity: newStock }
                });
                await tx.stockLog.create({
                  data: {
                    inventoryItemId: invItem.id,
                    change: -item.quantity,
                    previousStock: invItem.quantity,
                    newStock,
                    reason: `ORDER_DEDUCTION (#${item.productId})`
                  }
                });
              }
            }
          }
        }

        const order = await tx.order.create({
          data: {
            tableId,
            tableNumber: resolvedTableNumber,
            totalAmount,
            status: 'PENDING',
          },
          include: { items: true }
        });

        // Create KOTs and link items
        for (const [stationId, itemsForStation] of stationItemsMap.entries()) {
          await tx.kOT.create({
            data: {
              orderId: order.id,
              stationId,
              status: 'PENDING',
              items: {
                create: itemsForStation.map(i => ({
                  ...i,
                  orderId: order.id
                }))
              }
            }
          });
        }

        return order;
      });

      // Notify all admins in real-time that a new order has arrived
      io.emit("new-order-received", {
        id: order.id,
        tableNumber: order.tableNumber,
        totalAmount: order.totalAmount
      });

      res.json(order);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to place order" });
    }
  });

  // Get single order for status tracking
  app.get("/api/orders/:id", async (req, res) => {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  });

  app.get("/api/admin/orders", authenticate, async (req, res) => {
    const orders = await prisma.order.findMany({
      include: { 
        items: { 
          include: { 
            product: { 
              include: { station: true } 
            } 
          } 
        } 
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  });

  app.put("/api/admin/orders/:id/status", authenticate, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
      const order = await prisma.order.update({
        where: { id },
        data: { status }
      });

      if (['PAID', 'CANCELLED', 'COMPLETED'].includes(status)) {
        const idx = activePaymentSelections.findIndex(s => s.orderId === id);
        if (idx !== -1) {
          activePaymentSelections.splice(idx, 1);
          io.emit("payment-method-cleared", id);
        }
      }

      // Real-time update for the tracking customer
      io.to(`order-${id}`).emit("order-status-updated", { status });
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // KOT Management
  app.get("/api/admin/kots", authenticate, async (req, res) => {
    const kots = await prisma.kOT.findMany({
      include: {
        order: { include: { items: { include: { product: true } } } },
        station: true,
        items: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(kots);
  });

  app.put("/api/admin/kots/:id/status", authenticate, async (req, res) => {
    const { id } = req.params;
    const { status, prepTimeMinutes } = req.body;
    try {
      const updateData: any = { status };
      
      if (status === 'ACCEPTED' && prepTimeMinutes) {
        const readyTime = new Date();
        readyTime.setMinutes(readyTime.getMinutes() + prepTimeMinutes);
        updateData.prepTimeMinutes = prepTimeMinutes;
        updateData.estimatedReadyTime = readyTime;
      }

      const kot = await prisma.kOT.update({
        where: { id },
        data: updateData,
        include: { order: true }
      });

      // Optionally sync order item statuses if needed
      await prisma.orderItem.updateMany({
        where: { kotId: id },
        data: { 
          status,
          ...(status === 'ACCEPTED' && { 
            prepTimeMinutes,
            countdownStartedAt: new Date(),
            estimatedCompletionTime: updateData.estimatedReadyTime 
          })
        }
      });

      if (status === 'ACCEPTED') {
        io.emit("timer-started", {
          kotId: id,
          orderId: kot.orderId,
          estimatedReadyTime: updateData.estimatedReadyTime,
          tableNumber: kot.order.tableNumber
        });
      }

      res.json(kot);
    } catch (error) {
      res.status(500).json({ error: "Failed to update KOT status" });
    }
  });

  app.post("/api/admin/kots/:id/reprint", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    try {
      const kot = await prisma.kOT.findUnique({
        where: { id },
        include: {
          station: { include: { printers: true } },
          order: true,
          items: true
        }
      });

      if (!kot) return res.status(404).json({ error: "KOT not found" });

      const stationPrinters = kot.station.printers.filter(p => 
        p.active && (p.role === 'KITCHEN' || p.role === 'BAR' || p.role === 'GRILL' || p.role === 'SHISHA')
      );

      if (stationPrinters.length > 0) {
        const targetPrinter = stationPrinters[0];
        const printableKot: PrintableKot = {
          kotId: kot.id,
          orderId: kot.orderId,
          tableNumber: kot.order.tableNumber || 'Walk-in',
          stationName: kot.station.name,
          items: kot.items.map(item => ({
            quantity: item.quantity,
            productName: item.productName
          })),
          createdAt: kot.createdAt.toISOString(),
          printer: {
            id: targetPrinter.id,
            name: targetPrinter.name,
            type: targetPrinter.type,
            ipAddress: targetPrinter.ipAddress || undefined,
            port: targetPrinter.port || undefined,
          }
        };

        io.emit("print-kot", printableKot);
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "No active printer found for this station" });
      }
    } catch (error) {
      res.status(500).json({ error: "Reprint failed" });
    }
  });

  // Inventory Management
  app.get("/api/inventory", authenticate, async (req, res) => {
    const items = await prisma.inventoryItem.findMany({
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } }
    });
    res.json(items);
  });

  app.post("/api/inventory", authenticate, async (req, res) => {
    const data = req.body;
    const item = await prisma.inventoryItem.create({ data });
    res.json(item);
  });

  app.patch("/api/inventory/:id/adjust", authenticate, async (req, res) => {
    const { id } = req.params;
    const { change, reason } = req.body;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.findUnique({ where: { id } });
        if (!item) throw new Error("Item not found");
        const newStock = item.quantity + change;
        const updatedItem = await tx.inventoryItem.update({
          where: { id },
          data: { quantity: newStock }
        });
        await tx.stockLog.create({
          data: {
            inventoryItemId: id,
            change,
            previousStock: item.quantity,
            newStock,
            reason
          }
        });
        return updatedItem;
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Adjustment failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handling middleware to catch parsing errors (like Payload Too Large)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: "Payload too large. Please reduce the size of your import file." });
    }
    console.error("[Server Error]", err);
    res.status(500).json({ error: "Internal server error" });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
