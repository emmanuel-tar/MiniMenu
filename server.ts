import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { createServer as createViteServer } from "vite"; // Keep this line
import crypto from "crypto";
import net from "net";
import { Server, Socket } from "socket.io";
import iconv from "iconv-lite";
import http from "http";
import { prisma } from "./src/lib/db";
import { hashPassword, comparePassword, generateToken, verifyToken } from "./src/lib/auth";

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
  rowIndex: number;
}

// Global Settings Cache
const settingsCache = new Map<string, any>();

async function syncSettingsCache() {
  try {
    // Check if the table actually exists in the database to prevent startup crashes
    // This is useful right after a 'migrate reset' before the first seed
    const tableExists = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' AND name='SystemSetting'`;
    if (Array.isArray(tableExists) && tableExists.length === 0) return;

    const settings = await prisma.systemSetting.findMany();
    settingsCache.clear();
    settings.forEach(s => {
      let parsedValue: any = s.value;
      if (s.type === 'boolean') parsedValue = s.value === 'true';
      if (s.type === 'number') parsedValue = Number(s.value);
      if (s.type === 'json') {
        try { parsedValue = JSON.parse(s.value); } catch { parsedValue = {}; }
      }
      settingsCache.set(s.key, parsedValue);
    });
    console.log(`[Settings] Cache synchronized: ${settingsCache.size} settings loaded.`);
  } catch (err) {
    console.error("[Settings] Cache sync failed:", err);
  }
}

/**
 * Helper to get settings with type-safety and cache-first logic
 */
function getSetting<T>(key: string, defaultValue: T): T {
  if (settingsCache.has(key)) {
    return settingsCache.get(key) as T;
  }
  return defaultValue;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" }
  });
  const PORT = Number(process.env.PORT || 5000);

  // Verify database connection on startup
  try {
    await prisma.$connect();
    console.log("Successfully connected to the database");
    await syncSettingsCache();
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

  // DB-backed real-time state
  const ACTIVE_TTL_MINUTES = 10;

  // Socket.IO Connection Logic
  io.on("connection", (socket: Socket) => {
    socket.on("join-order", (orderId: string) => {
      socket.join(`order-${orderId}`);
      console.log(`[Socket] Customer joined order tracking: ${orderId}`);
    });

    // Handle waiter calls
    socket.on("call-waiter", async (data: { tableId: string; tableName: string; reason: string }) => {
      try {
        const call = await prisma.waiterCall.create({
          data: {
            tableId: data.tableId,
            tableName: data.tableName,
            reason: data.reason || 'Assistance',
            status: 'ACTIVE'
          }
        });
        console.log(`[Socket] Waiter called to table: ${call.tableName}`);
        io.emit("waiter-requested", call);
      } catch (err) {
        console.error("Socket Waiter Call Error:", err);
      }
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

      const selection = await prisma.paymentSelection.upsert({
        where: { orderId: data.orderId },
        update: { 
          method: data.method,
          tableNumber: order.tableNumber || 'Walk-in'
        },
        create: {
          orderId: data.orderId,
          method: data.method,
          tableNumber: order.tableNumber || 'Walk-in',
        }
      });

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

    socket.on("request-bill", async (data: { orderId: string }) => {
      console.log(`[Socket] Bill requested for order ${data.orderId}`);
      try {
        const [order, company, settings, printers] = await Promise.all([
          prisma.order.findUnique({
            where: { id: data.orderId },
            include: { items: true, table: true }
          }),
          prisma.company.findFirst(),
          prisma.receiptSetting.findFirst(),
          prisma.printer.findMany({ where: { role: 'CASHIER', active: true } })
        ]);

        if (!order || !company) return;

        // Notify admins/staff via existing payment request mechanism
        const selection = await prisma.paymentSelection.upsert({
          where: { orderId: data.orderId },
          update: { 
            method: 'BILL REQUEST' 
          },
          create: {
            orderId: data.orderId,
            method: 'BILL REQUEST',
            tableNumber: order.tableNumber || 'Walk-in',
          }
        });
        io.emit("payment-method-updated", selection);

        if (printers.length > 0) {
          const targetPrinter = printers[0];
          const taxRate = company.taxRate || 0;
          const serviceChargeRate = company.enableServiceCharge ? (company.serviceChargeRate || 0) : 0;
          
          const subtotal = order.totalAmount;
          const taxAmount = (subtotal * taxRate) / 100;
          const serviceChargeAmount = (subtotal * serviceChargeRate) / 100;
          const grandTotal = subtotal + taxAmount + serviceChargeAmount;

          const printableInvoice: PrintableInvoice = {
            orderId: order.id,
            tableNumber: order.tableNumber || 'Walk-in',
            items: order.items.map(i => ({
              quantity: i.quantity,
              productName: i.productName,
              price: i.price
            })),
            subtotal,
            taxAmount,
            totalAmount: grandTotal,
            createdAt: order.createdAt.toISOString(),
            company: {
              name: company.name,
              logo: company.logo || undefined,
              address: company.address || undefined,
              phone: company.phone || undefined,
              currency: company.currency
            },
            receiptSettings: {
              footerText: settings?.footerText || undefined,
              showLogo: settings?.showLogo ?? true,
              showTax: settings?.showTax ?? true,
              paperSize: settings?.paperSize || '80mm'
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
      } catch (err) {
        console.error("Socket Request Bill Error:", err);
      }
    });

    socket.on("dismiss-payment-selection", async (orderId: string) => {
      try {
        await prisma.paymentSelection.deleteMany({ where: { orderId } });
        io.emit("payment-method-cleared", orderId);
      } catch (err) {
        console.error("Socket Dismiss Payment Error:", err);
      }
    });

    socket.on("dismiss-waiter-call", async (id: string) => {
      try {
        const handledCall = await prisma.waiterCall.update({
          where: { id },
          data: {
            status: 'HANDLED',
            handledAt: new Date()
          }
        });
        io.emit("waiter-call-dismissed", id);
        io.emit("waiter-call-handled", handledCall);
      } catch (err) {
        console.error("Socket Dismiss Waiter Call Error:", err);
      }
    });

    socket.on("clear-waiter-history", async () => {
      try {
        await prisma.waiterCall.deleteMany({ where: { status: 'HANDLED' } });
        io.emit("waiter-history-cleared");
        console.log("[Socket] Waiter history cleared");
      } catch (err) {
        console.error("Socket Clear Waiter History Error:", err);
      }
    });
  });

  /**
   * Multer config
   */
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

  // Centralized Settings Management API
  app.get("/api/admin/settings", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
      const settings = await prisma.systemSetting.findMany({
        orderBy: [{ category: 'asc' }, { key: 'asc' }]
      });
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/settings/:key", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { key } = req.params;
    const { value } = req.body;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.systemSetting.findUnique({ where: { key } });
        if (!existing) throw new Error("Setting not found");
        if (!existing.editable) throw new Error("This setting is locked by the system");

        // Log the change
        await tx.settingAudit.create({
          data: {
            userId: req.user!.userId,
            settingKey: key,
            oldValue: existing.value,
            newValue: String(value),
          }
        });

        return await tx.systemSetting.update({
          where: { key },
          data: { value: String(value) }
        });
      });

      // Refresh cache instantly
      await syncSettingsCache();
      
      io.emit("settings-updated", { key, value: settingsCache.get(key) });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Seed Initial Dynamic Settings (One-time or Migration logic)
  app.post("/api/admin/settings/seed", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const initialSettings = [
      { category: 'operations', key: 'enable_qr_ordering', value: 'true', type: 'boolean', description: 'Allow customers to order via QR' },
      { category: 'operations', key: 'enable_split_bill', value: 'true', type: 'boolean', description: 'Enable split billing functionality' },
      { category: 'operations', key: 'enable_reservations', value: 'true', type: 'boolean', description: 'Enable table reservations' },
      { category: 'payment', key: 'enable_cash', value: 'true', type: 'boolean', description: 'Accept cash payments' },
      { category: 'payment', key: 'enable_transfer', value: 'false', type: 'boolean', description: 'Accept bank transfers' },
      { category: 'table', key: 'auto_close_table_minutes', value: '30', type: 'number', description: 'Minutes after payment to auto-available a table' },
    ];

    try {
      for (const s of initialSettings) {
        await prisma.systemSetting.upsert({
          where: { key: s.key },
          update: {},
          create: s
        });
      }
      await syncSettingsCache();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Seeding failed" });
    }
  });

  // Staff Management
  app.get("/api/admin/users", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          stationId: true,
          station: { select: { name: true } },
          createdAt: true
        }
      });
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  app.post("/api/admin/users", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { email, password, name, role, stationId } = req.body;
    try {
      const hashedPassword = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          password: hashedPassword,
          name,
          role,
          stationId: stationId || null
        }
      });
      res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch (error) {
      res.status(500).json({ error: "Failed to create staff account" });
    }
  });

  app.delete("/api/admin/users/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    if (req.user.userId === id) return res.status(400).json({ error: "Cannot delete yourself" });
    try {
      await prisma.user.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete staff member" });
    }
  });

  // Company Settings
  app.get("/api/company", async (req, res) => {
    const company = await prisma.company.findFirst();
    const receiptSettings = await prisma.receiptSetting.findFirst();
    // Merge Dynamic System Settings into the company response for frontend compatibility
    const settings = {
      enableSplitBill: getSetting<boolean>('enable_split_bill', true),
      enableReservations: getSetting<boolean>('enable_reservations', true),
    };
    res.json({ ...(company || {}), ...settings, receiptSettings: receiptSettings || {} });
  });

  app.post("/api/company", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    
    // Sanitize and pick only valid fields for the physical Company model
    const data = {
      name: req.body.name,
      currency: req.body.currency,
      secondaryCurrency: req.body.secondaryCurrency,
      exchangeRate: parseFloat(String(req.body.exchangeRate)) || 1.0,
      taxRate: parseFloat(String(req.body.taxRate)) || 0,
      enableServiceCharge: !!req.body.enableServiceCharge,
      serviceChargeRate: parseFloat(String(req.body.serviceChargeRate)) || 0,
      contactEmail: req.body.contactEmail,
      phone: req.body.phone,
      address: req.body.address,
      bankName: req.body.bankName,
      accountName: req.body.accountName,
      accountNumber: req.body.accountNumber,
    };

    const existing = await prisma.company.findFirst();
    try {
      const result = await prisma.$transaction(async (tx) => {
        let company;
        if (existing) {
          company = await tx.company.update({
            where: { id: existing.id },
            data
          });
        } else {
          company = await tx.company.create({ data });
        }

        // Handle Dynamic Settings as per Architecture Recommendation
        if (req.body.enableSplitBill !== undefined) {
          await tx.systemSetting.upsert({
            where: { key: 'enable_split_bill' },
            update: { value: String(!!req.body.enableSplitBill) },
            create: { key: 'enable_split_bill', value: String(!!req.body.enableSplitBill), category: 'operations', type: 'boolean' }
          });
        }
        if (req.body.enableReservations !== undefined) {
          await tx.systemSetting.upsert({
            where: { key: 'enable_reservations' },
            update: { value: String(!!req.body.enableReservations) },
            create: { key: 'enable_reservations', value: String(!!req.body.enableReservations), category: 'operations', type: 'boolean' }
          });
        }

        return company;
      });

      // Refresh cache instantly to ensure the next GET request sees the updates
      await syncSettingsCache();
      
      res.json(result);
    } catch (error) {
      console.error("Save Company Error:", error);
      res.status(500).json({ error: "Failed to save restaurant profile" });
    }
  });

  app.put("/api/stations/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const { name, description, code, printerName } = req.body;
    try {
      const updated = await prisma.productionStation.update({
        where: { id },
        data: { name, description, code, printerName }
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update station" });
    }
  });

  app.delete("/api/stations/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    try {
      await prisma.productionStation.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete station" });
    }
  });

  app.post("/api/stations/:id/test-print", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    try {
      const station = await prisma.productionStation.findUnique({
        where: { id },
        include: { printers: true }
      });

      if (!station) return res.status(404).json({ error: "Station not found" });

      const activePrinters = station.printers.filter(p => p.active);

      if (activePrinters.length > 0) {
        const targetPrinter = activePrinters[0];
        const testKot: PrintableKot = {
          kotId: `TEST-${station.id.slice(0, 5)}`,
          orderId: "TEST-ORDER",
          tableNumber: "TEST-TABLE",
          stationName: station.name,
          items: [{
            quantity: 1,
            productName: "=== TEST PRINT ===",
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

        io.emit("print-kot", testKot);
        res.json({ success: true, message: `Test print sent to ${targetPrinter.name}` });
      } else {
        res.status(400).json({ error: "No active printer found for this station" });
      }
    } catch (error) {
      console.error("Test Print Error:", error);
      res.status(500).json({ error: "Test print failed" });
    }
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
    
    try {
      const { stationId, port, ...rest } = req.body;
      const printer = await prisma.printer.create({
        data: { 
          ...rest, 
          port: parseInt(String(port)) || 9100,
          stationId: (stationId === "" || stationId === undefined) ? null : stationId,
          companyId: company.id 
        }
      });
      res.json(printer);
    } catch (error) {
      console.error("Create Printer Error:", error);
      res.status(500).json({ error: "Failed to create printer. Ensure station assignment is valid." });
    }
  });

  app.delete("/api/settings/printers/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    try {
      await prisma.printer.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete printer" });
    }
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

    const data = {
      showLogo: !!req.body.showLogo,
      footerText: req.body.footerText,
      showTax: !!req.body.showTax,
      paperSize: req.body.paperSize,
      autoPrint: !!req.body.autoPrint,
      companyId: company.id
    };

    const existing = await prisma.receiptSetting.findFirst();
    try {
      if (existing) {
        const updated = await prisma.receiptSetting.update({
          where: { id: existing.id },
          data
        });
        return res.json(updated);
      }
      const created = await prisma.receiptSetting.create({ data });
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Failed to save receipt settings" });
    }
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

        try {
          await tx.auditLog.create({
            data: {
              userId: (req as AuthenticatedRequest).user?.userId || 'SYSTEM',
              action: `ORDER_PAID_${method}`,
              module: 'ORDERS',
            }
          });
        } catch (e) { }

        const updatedOrder = await tx.order.update({
          where: { id },
          data: { status: 'PAID' },
          include: { items: true }
        });

        await tx.paymentSelection.deleteMany({ where: { orderId: id } });

        // Close the table
        if (order.tableId) {
          const table = await tx.table.update({
            where: { id: order.tableId },
            data: { 
              status: 'AVAILABLE',
              guestCount: 0 
            }
          });
          io.emit("table-status-updated", { tableId: order.tableId, status: 'AVAILABLE', guestCount: 0 });
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
        const serviceChargeRate = company.enableServiceCharge ? (company.serviceChargeRate || 0) : 0;
        
        const subtotal = result.order.totalAmount;
        const taxAmount = (subtotal * taxRate) / 100;
        const serviceChargeAmount = (subtotal * serviceChargeRate) / 100;
        const grandTotal = subtotal + taxAmount + serviceChargeAmount;

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
          totalAmount: grandTotal,
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

  // Split Billing & Partial Payments
  app.get("/api/admin/orders/:id/payments", authenticate, async (req, res) => {
    const { id } = req.params;
    try {
      const order = await prisma.order.findUnique({
        where: { id },
        include: { items: true, payments: true }
      });
      if (!order) return res.status(404).json({ error: "Order not found" });

      const totalPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
      const remainingBalance = Math.max(0, order.totalAmount - totalPaid);

      res.json({
        totalAmount: order.totalAmount,
        totalPaid,
        remainingBalance,
        items: order.items,
        payments: order.payments
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payment status" });
    }
  });

  app.post("/api/admin/orders/:id/payments", authenticate, async (req, res) => {
    const { id } = req.params;
    const { method, amount, itemIds, reference } = req.body;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id },
          include: { items: true, payments: true }
        });

        if (!order) throw new Error("Order not found");

        let paymentAmount = amount;

        // Handle Itemized Splitting: Calculate total from items and mark them paid
        if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
          const itemsToPay = order.items.filter(item => itemIds.includes(item.id));
          paymentAmount = itemsToPay.reduce((sum, item) => sum + (item.price * item.quantity), 0);

          await tx.orderItem.updateMany({
            where: { id: { in: itemIds } },
            data: { status: 'PAID' }
          });
        }

        if (!paymentAmount || paymentAmount <= 0) {
          throw new Error("Invalid payment amount");
        }

        const payment = await tx.payment.create({
          data: {
            orderId: id,
            method,
            amount: paymentAmount,
            reference
          }
        });

        // Check if the bill is now fully settled
        const totalPaid = order.payments.reduce((sum, p) => sum + p.amount, 0) + paymentAmount;
        const isSettled = totalPaid >= order.totalAmount;

        const updatedOrder = await tx.order.update({
          where: { id },
          data: { 
            status: isSettled ? 'PAID' : 'AWAITING_PAYMENT' 
          },
          include: { items: true }
        });

        // Release the table only when the full balance is paid
        if (isSettled && order.tableId) {
          const table = await tx.table.update({
            where: { id: order.tableId },
            data: { 
              status: 'AVAILABLE',
              guestCount: 0 
            }
          });
          io.emit("table-status-updated", { tableId: order.tableId, status: 'AVAILABLE', guestCount: 0 });
        }

        await tx.auditLog.create({
          data: {
            userId: (req as AuthenticatedRequest).user?.userId || 'SYSTEM',
            action: `PAYMENT_${isSettled ? 'SETTLED' : 'PARTIAL'}_${method}`,
            module: 'ORDERS',
          }
        });

        // If the order is paid, clear the payment selection notification
        if (isSettled) {
          await tx.paymentSelection.deleteMany({ where: { orderId: id } });
          io.emit("payment-method-cleared", id);
        }

        return { payment, order: updatedOrder, remainingBalance: Math.max(0, order.totalAmount - totalPaid), isSettled };
      });

      io.emit("order-payment-update", result); // Global broadcast for split billing updates
      if (result.isSettled) io.emit("order-paid", { orderId: id });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/orders/:id/complete", authenticate, async (req, res) => {
    const { id } = req.params;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({
          where: { id },
          data: { status: 'COMPLETED' }
        });

        if (updated.tableId) {
          await tx.table.update({
            where: { id: updated.tableId },
            data: { 
              status: 'AVAILABLE',
              guestCount: 0 
            }
          });
          io.emit("table-status-updated", { tableId: updated.tableId, status: 'AVAILABLE', guestCount: 0 });
        }
        return updated;
      });

      io.emit("order-completed", id);
      io.emit("order-status-updated", { orderId: id, status: 'COMPLETED' });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to complete order" });
    }
  });

  // Manual Table Operations
  app.post("/api/admin/tables/:id/open", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { guestCount } = req.body;
    try {
      const table = await prisma.table.update({
        where: { id },
        data: { 
          status: 'OCCUPIED',
          guestCount: parseInt(String(guestCount)) || 1,
        }
      });
      
      io.emit("table-status-updated", { tableId: id, status: 'OCCUPIED', guestCount: table.guestCount });
      res.json(table);
    } catch (error) {
      res.status(500).json({ error: "Failed to open table" });
    }
  });

  app.post("/api/admin/tables/:id/assign-waiter", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { waiterId } = req.body;
    try {
      await prisma.table.update({
        where: { id },
        data: { 
          // assignedWaiterId: waiterId 
        }
      });
      io.emit("table-status-updated", { tableId: id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Assignment failed" });
    }
  });

  app.post("/api/admin/tables/:id/transfer", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params; // Source
    const { targetTableId } = req.body;
    try {
      await prisma.$transaction(async (tx) => {
        const sourceTable = await tx.table.findUnique({ where: { id } });
        const activeOrders = await tx.order.findMany({
          where: { tableId: id, status: { notIn: ['PAID', 'CANCELLED', 'COMPLETED'] } }
        });

        for (const order of activeOrders) {
          await tx.order.update({
            where: { id: order.id },
            data: { tableId: targetTableId }
          });
        }

        await tx.table.update({ 
          where: { id }, 
          data: { status: 'AVAILABLE', guestCount: 0 } 
        });
        await tx.table.update({ 
          where: { id: targetTableId }, 
          data: { status: 'OCCUPIED', guestCount: sourceTable?.guestCount || 1 } 
        });
      });

      io.emit("table-status-updated", { tableId: id, status: 'AVAILABLE' });
      io.emit("table-status-updated", { tableId: targetTableId, status: 'OCCUPIED' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Transfer failed" });
    }
  });

  app.post("/api/admin/tables/:id/close", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    try {
      // Professional Flow: Occupied -> Cleaning -> Available
      const table = await prisma.table.update({
        where: { id },
        data: { 
          status: 'CLEANING',
          guestCount: 0 
        }
      });
      
      io.emit("table-status-updated", { tableId: id, status: 'CLEANING', guestCount: 0 });
      
      // Auto-revert to available after 5 minutes (simulated)
      setTimeout(async () => {
        await prisma.table.update({ where: { id }, data: { status: 'AVAILABLE' } });
        io.emit("table-status-updated", { tableId: id, status: 'AVAILABLE' });
      }, 300000); 

      res.json({ success: true, table });
    } catch (error) {
      res.status(500).json({ error: "Failed to close table" });
    }
  });

  // Manual Table Release
  app.post("/api/admin/tables/:id/release", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    try {
      const table = await prisma.table.update({
        where: { id },
        data: { 
          status: 'AVAILABLE',
          guestCount: 0 
        }
      });
      io.emit("table-status-updated", { tableId: id, status: 'AVAILABLE', guestCount: 0 });
      res.json({ success: true, table });
    } catch (error) {
      res.status(500).json({ error: "Failed to release table" });
    }
  });

  // Audit Logs
  app.get("/api/admin/audit-logs", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
      const logs = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 100,
        // Note: Assuming a relation exists, otherwise we just show userId
        include: { user: { select: { name: true, email: true } } }
      });
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // Reporting API: Daily Sales Summary
  app.get("/api/admin/reports/daily-sales", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { startDate, endDate } = req.query;

    try {
      const where: any = {
        status: { in: ['PAID', 'COMPLETED'] }
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }

      const orders = await prisma.order.findMany({
        where,
        select: {
          totalAmount: true,
          taxAmount: true,
          serviceChargeAmount: true,
          discountAmount: true,
          createdAt: true
        }
      });

      const dailyStats: Record<string, any> = {};

      orders.forEach(order => {
        const dateKey = order.createdAt.toISOString().split('T')[0];
        if (!dailyStats[dateKey]) {
          dailyStats[dateKey] = {
            date: dateKey,
            netSales: 0,
            totalTax: 0,
            totalServiceCharge: 0,
            totalDiscounts: 0,
            orderCount: 0
          };
        }

        dailyStats[dateKey].netSales += order.totalAmount;
        dailyStats[dateKey].totalTax += order.taxAmount;
        dailyStats[dateKey].totalServiceCharge += order.serviceChargeAmount;
        dailyStats[dateKey].totalDiscounts += order.discountAmount;
        dailyStats[dateKey].orderCount += 1;
      });

      const result = Object.values(dailyStats).sort((a: any, b: any) => b.date.localeCompare(a.date));
      res.json(result);
    } catch (error) {
      console.error("Reporting Error:", error);
      res.status(500).json({ error: "Failed to generate daily sales report" });
    }
  });

  // Reservation Management
  app.get("/api/admin/reservations", authenticate, async (req, res) => {
    try {
      const reservations = await prisma.reservation.findMany({
        include: { table: true },
        orderBy: { reservationTime: 'asc' }
      });
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reservations" });
    }
  });

  app.post("/api/admin/reservations", authenticate, async (req, res) => {
    const { customerName, phone, tableId, reservationTime, guests } = req.body;
    try {
      const reservation = await prisma.reservation.create({
        data: {
          customerName,
          phone,
          tableId,
          reservationTime: new Date(reservationTime),
          guests: parseInt(guests),
          status: 'CONFIRMED'
        }
      });
      res.json(reservation);
    } catch (error) {
      res.status(500).json({ error: "Failed to create reservation" });
    }
  });

  app.put("/api/admin/reservations/:id", authenticate, async (req, res) => {
    const { id } = req.params;
    const { status, tableId, reservationTime, guests } = req.body;
    try {
      const updated = await prisma.reservation.update({
        where: { id },
        data: {
          status,
          tableId,
          reservationTime: reservationTime ? new Date(reservationTime) : undefined,
          guests: guests ? parseInt(guests) : undefined
        }
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update reservation" });
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
        const stationIdMap = new Map<string, string>();
        for (const st of stations) {
          const upserted = await tx.productionStation.upsert({
            where: { id: st.id },
            update: { name: st.name, description: st.description },
            create: { id: st.id, name: st.name, description: st.description }
          });
          stationMap.set(st.name, upserted.id);
          stationIdMap.set(st.name, upserted.id);
        }

        // 4. Process Products
        for (const prod of products) {
          // Ensure stationId and groupId from import are valid based on upserted values
          const resolvedStationId = stationIdMap.get(prod.station.name);
          const resolvedGroupId = groupMap.get(prod.group.name);
          const resolvedCategoryId = catMap.get(prod.category.name);

          // Strip relations and cost field not in schema
          const { category, group, station, inventoryItem, cost, ...cleanProd } = prod;
          
          await tx.product.upsert({
            where: { id: cleanProd.id },
            update: {
              ...cleanProd,
              updatedAt: new Date(),
              // Ensure relations point to existing IDs
              stationId: resolvedStationId,
              groupId: resolvedGroupId,
              categoryId: resolvedCategoryId,
            },
            create: {
              ...cleanProd,
              createdAt: new Date(),
              updatedAt: new Date(),
              stationId: resolvedStationId || '', // Fallback or throw if not found
              groupId: resolvedGroupId || '',
              categoryId: resolvedCategoryId || '',
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

  // Helper function for robust CSV line parsing
  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let inQuote = false;
    let currentField = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuote && nextChar === '"') { // Handle escaped double quote ("")
          currentField += '"';
          i++; // Skip the next quote
        } else {
          inQuote = !inQuote; // Toggle inQuote state
        }
      } else if (char === ',' && !inQuote) {
        result.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    result.push(currentField); // Add the last field
    return result;
  }

  app.post("/api/menu/import/csv", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });

    const csvContent: string = req.body.csv;
    if (!csvContent) return res.status(400).json({ error: "CSV content is required" });

    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return res.status(400).json({ error: "Empty CSV content" });

    const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
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
      const values = parseCsvLine(lines[i]);
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
          name, description, categoryName, groupName, stationName, price, sku, barcode, available,
          rowIndex: i + 1
        });
      } catch (parseError: any) {
        errors.push({ row: i + 1, message: `Parsing error: ${parseError.message}` });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: "CSV parsing errors", details: errors });
    }

    const importErrors: { row: number; message: string }[] = [];
    let successCount = 0;

    for (const productData of productsToImport) {
      try {
        await prisma.$transaction(async (tx) => {
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
            where: { name: productData.groupName || '' }, // Ensure name is not null/undefined
            update: {
              productionStationId: station?.id && station.id !== "" ? station.id : null
            },
            create: {
              name: productData.groupName,
              productionStationId: station?.id && station.id !== "" ? station.id : null
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
              stationId: station.id || null,
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
              stationId: station.id || null,
              sku: productData.sku,
              barcode: productData.barcode,
            }
          });
        });
        successCount++;
      } catch (err: any) {
        importErrors.push({ row: productData.rowIndex, message: err.message });
        console.error(`CSV Import error at row ${productData.rowIndex}:`, err.message);
      }
    }

    if (importErrors.length > 0) {
      return res.json({ 
        success: successCount > 0, 
        message: `Import completed with ${importErrors.length} errors.`,
        details: {
          successCount,
          failCount: importErrors.length,
          errors: importErrors
        }
      });
    }

    res.json({ success: true, message: "CSV import completed successfully." });
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
  app.get("/api/admin/waiter-calls", authenticate, async (req, res) => {
    const calls = await prisma.waiterCall.findMany({ where: { status: 'ACTIVE' } });
    res.json(calls);
  });

  // Handled Waiter Requests API
  app.get("/api/admin/waiter-calls/history", authenticate, async (req, res) => {
    const history = await prisma.waiterCall.findMany({ where: { status: 'HANDLED' }, take: 20, orderBy: { handledAt: 'desc' } });
    res.json(history);
  });

  // Active Payment Selections API
  app.get("/api/admin/payment-selections", authenticate, async (req, res) => {
    const selections = await prisma.paymentSelection.findMany();
    res.json(selections);
  });

  // Menu Management
  app.get("/api/menu/categories", async (req, res) => {
    const categories = await prisma.category.findMany({ include: { products: true } });
    // Sort categories by the 'order' field for consistent display
    res.json(categories.sort((a, b) => a.order - b.order));
  });

  app.put("/api/menu/categories/reorder", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const newOrder = req.body; // Expects an array of { id: string, order: number }

    if (!Array.isArray(newOrder)) {
      return res.status(400).json({ error: "Invalid request body. Expected an array of category order objects." });
    }

    try {
      await prisma.$transaction(
        newOrder.map((category: { id: string; order: number }) =>
          prisma.category.update({ where: { id: category.id }, data: { order: category.order } })
        )
      );
      res.json({ success: true, message: "Categories reordered successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to reorder categories." });
    }
  });

  app.post("/api/menu/categories", authenticate, async (req, res) => {
    const { name, description } = req.body;
    const category = await prisma.category.create({ data: { name, description } });
    res.json(category);
  });

  app.put("/api/menu/categories/:id", authenticate, async (req, res) => {
    const { id } = req.params;
    const { name, description, active, image } = req.body;
    try {
      const updated = await prisma.category.update({
        where: { id },
        data: { name, description, active, image }
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update category" });
    }
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
    const data = req.body;
    const productData: any = {};

    // Sanitize relation IDs - convert empty strings to null to avoid P2003 Foreign Key errors
    Object.keys(data).forEach(key => {
      if (['categoryId', 'groupId', 'stationId', 'inventoryItemId'].includes(key)) {
        productData[key] = (data[key] === "" || data[key] === undefined || data[key] === "none") ? null : data[key];
      } else if (key !== 'cost') {
        productData[key] = data[key];
      }
    });

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
    const data = req.body;
    const productData: any = {};

    Object.keys(data).forEach(key => {
      if (['categoryId', 'groupId', 'stationId', 'inventoryItemId'].includes(key)) {
        productData[key] = (data[key] === "" || data[key] === undefined || data[key] === "none") ? null : data[key];
      } else if (key !== 'cost') {
        productData[key] = data[key];
      }
    });

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
    try {
      const stations = await prisma.productionStation.findMany({
        include: { printers: true }
      });
      res.json(stations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stations" });
    }
  });

  app.post("/api/stations", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const { name, description, code, printerName } = req.body;
    if (!name) return res.status(400).json({ error: "Station name is required" });
    try {
      const station = await prisma.productionStation.create({
        data: {
          name,
          description,
          code: code || null,
          printerName: printerName || null
        },
        include: { printers: true }
      });
      res.json(station);
    } catch (error: any) {
      console.error("Create Station Error:", error.message);
      res.status(500).json({ error: error.message.includes('unique constraint') 
        ? "Station name or code already exists" 
        : "Internal database error during station creation" 
      });
    }
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

  // Table Status (Occupancy Overview with Itemized Breakdown)
  app.get("/api/admin/tables/status", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
      const tables = await prisma.table.findMany({
        include: {
          orders: {
            where: {
              status: {
                notIn: ['PAID', 'CANCELLED', 'COMPLETED']
              }
            },
            include: { items: true },
            orderBy: { createdAt: 'asc' }
          }
        },
        orderBy: { name: 'asc' }
      });

      const [activeCalls, activePayments] = await Promise.all([
        prisma.waiterCall.findMany({ where: { status: 'ACTIVE' } }),
        prisma.paymentSelection.findMany()
      ]);

      const tablesWithContext = tables.map(table => ({
        ...table,
        hasCall: activeCalls.some(call => call.tableId === table.id),
        paymentRequested: table.orders.some(o => activePayments.some(s => s.orderId === o.id))
      }));
      res.json(tablesWithContext);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch table status" });
    }
  });

  // Customer Ordering
  app.post("/api/orders", async (req, res) => {
    const { tableId, items, guestCount } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Order must contain at least one item." });
    }

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

        if (tableId) {
          const table = await tx.table.update({
            where: { id: tableId },
            data: { 
              status: 'OCCUPIED',
              guestCount: parseInt(String(guestCount)) || 1
            }
          });
          io.emit("table-status-updated", { tableId, status: 'OCCUPIED', guestCount: table.guestCount });
        }

        const orderItemsData = [];
        
        const stationItemsMap = new Map<string, any[]>();
        
        for (const item of items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (product) {
            if (!product.available) {
              throw new Error(`Product "${product.name}" is currently unavailable and cannot be ordered.`);
            }

            if (product.price <= 0) {
              throw new Error(`Product "${product.name}" has a price of zero or less and cannot be ordered.`);
            }

            if (item.quantity <= 0) {
              throw new Error(`Invalid quantity for product "${product.name}". Quantity must be greater than zero.`);
            }

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
                if (invItem.quantity < item.quantity) {
                  throw new Error(`Insufficient stock for product "${product.name}". Only ${invItem.quantity} ${invItem.unit} remaining.`);
                }

                const newStock = invItem.quantity - item.quantity;
                await tx.inventoryItem.update({
                  where: { id: invItem.id },
                  data: { quantity: newStock }
                });

                if (newStock <= 0) {
                  await tx.product.updateMany({
                    where: { inventoryItemId: invItem.id },
                    data: { available: false }
                  });
                  io.emit("menu-updated");
                }

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

      try {
        await prisma.auditLog.create({
          data: {
            userId: (req as any).user?.userId || 'SYSTEM',
            action: `ORDER_STATUS_UPDATE_${status}`,
            module: 'ORDERS',
          }
        });
      } catch (e) { }

      if (['PAID', 'CANCELLED', 'COMPLETED'].includes(status)) {
        await prisma.paymentSelection.deleteMany({ where: { orderId: id } });
        io.emit("payment-method-cleared", id);
      }

      // Release table if order is closed
      if (['PAID', 'CANCELLED', 'COMPLETED'].includes(status) && order.tableId) {
        const table = await prisma.table.update({
          where: { id: order.tableId },
          data: { 
            status: 'AVAILABLE',
            guestCount: 0 
          }
        });
        io.emit("table-status-updated", { tableId: order.tableId, status: 'AVAILABLE', guestCount: 0 });
      }

      // Real-time update for the tracking customer
      io.to(`order-${id}`).emit("order-status-updated", { status });
      io.emit("order-status-updated", { orderId: id, status }); // Broadcast globally for admin updates
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

  /**
   * Helper to encode text for thermal printers with proper code page support.
   * Maps common symbols and uses CP858 for accented character support.
   */
  const printerEncode = (text: string): Buffer => {
    // Map unsupported symbols to hardware-compatible equivalents
    const sanitized = text
      .replace(/₦/g, 'N') // Naira symbol is rarely in printer ROMs
      .replace(/€/g, '\xd5') // Map Euro to CP858 specific byte
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");

    return iconv.encode(sanitized, 'cp858');
  };

  // Network Print Proxy
  app.post("/api/print/network", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    const data = req.body;
    if (!data.printer?.ipAddress) return res.status(400).json({ error: "Printer IP is required" });
    const isInvoice = data.subtotal !== undefined;
    const orderSummary = `Order #${data.orderId.slice(0, 8)} - Table ${data.tableNumber}`;

    try {
      const client = new net.Socket();
      const port = data.printer.port || 9100;
      const host = data.printer.ipAddress;

      client.setTimeout(5000);

      client.connect(port, host, async () => {
        // Simple ESC/POS Command Generation
        const ESC = '\x1b';
        const GS = '\x1d';
        const INIT = ESC + '@';
        const CENTER = ESC + 'a' + '\x01';
        const RIGHT = ESC + 'a' + '\x02';
        const LEFT = ESC + 'a' + '\x00';
        const BOLD_ON = ESC + 'E' + '\x01';
        const BOLD_OFF = ESC + 'E' + '\x00';
        const CUT = GS + 'V' + '\x41' + '\x00';
        const SELECT_CP858 = ESC + 't' + '\x13'; // Select PC858 code page

        let buffer = Buffer.concat([
          Buffer.from(INIT + SELECT_CP858 + CENTER + BOLD_ON)
        ]);
        
        if (isInvoice) {
          buffer = Buffer.concat([buffer, printerEncode((data.company?.name || 'INVOICE').toUpperCase() + '\n')]);
          buffer = Buffer.concat([buffer, printerEncode(BOLD_OFF + (data.company?.address || '') + '\n')]);
          buffer = Buffer.concat([buffer, printerEncode(`Table: ${data.tableNumber}\n`)]);
          buffer = Buffer.concat([buffer, printerEncode(`Order: #${data.orderId.slice(0, 8)}\n`)]);
          buffer = Buffer.concat([buffer, printerEncode('--------------------------------\n' + LEFT)]);
          
          data.items.forEach((item: any) => {
            buffer = Buffer.concat([buffer, printerEncode(`${item.quantity}x ${item.productName}\n`)]);
            buffer = Buffer.concat([buffer, printerEncode(RIGHT + `${data.company.currency}${(item.price * item.quantity).toLocaleString()}\n` + LEFT)]);
          });
          
          buffer = Buffer.concat([buffer, printerEncode('--------------------------------\n' + RIGHT)]);
          buffer = Buffer.concat([buffer, printerEncode(`Subtotal: ${data.company.currency}${data.subtotal.toLocaleString()}\n`)]);
          if (data.taxAmount > 0) buffer = Buffer.concat([buffer, printerEncode(`Tax: ${data.company.currency}${data.taxAmount.toLocaleString()}\n`)]);
          buffer = Buffer.concat([buffer, printerEncode(BOLD_ON + `TOTAL: ${data.company.currency}${data.totalAmount.toLocaleString()}\n` + BOLD_OFF)]);
        } else {
          buffer = Buffer.concat([buffer, printerEncode('KITCHEN ORDER TICKET\n')]);
          buffer = Buffer.concat([buffer, printerEncode(`TABLE: ${data.tableNumber}\n`)]);
          buffer = Buffer.concat([buffer, printerEncode(BOLD_OFF + `Station: ${data.stationName}\n`)]);
          buffer = Buffer.concat([buffer, printerEncode(`Order: #${data.orderId.slice(0, 8)}\n`)]);
          buffer = Buffer.concat([buffer, printerEncode('--------------------------------\n' + LEFT)]);
          
          data.items.forEach((item: any) => {
            buffer = Buffer.concat([buffer, printerEncode(`${item.quantity}x ${item.productName}\n`)]);
            if (item.notes) buffer = Buffer.concat([buffer, printerEncode(`  * ${item.notes}\n`)]);
          });
        }
        
        buffer = Buffer.concat([buffer, printerEncode('--------------------------------\n' + CENTER)]);
        buffer = Buffer.concat([buffer, printerEncode(new Date(data.createdAt).toLocaleString() + '\n')]);
        buffer = Buffer.concat([buffer, Buffer.from('\n\n\n\n' + CUT)]);

        client.write(buffer);
        client.end();

        // Log successful print
        try {
          await prisma.printLog.create({
            data: {
              printerId: data.printer.id,
              type: isInvoice ? 'INVOICE' : 'KOT',
              status: 'SUCCESS',
              content: orderSummary
            }
          });
        } catch (logErr) { console.error("[PrintLog] Failed to save success log:", logErr); }

        res.json({ success: true });
      });

      client.on('error', async (err) => {
        console.error("[Printer Error]", err.message);
        
        // Log failed print
        try {
          await prisma.printLog.create({
            data: {
              printerId: data.printer.id,
              type: isInvoice ? 'INVOICE' : 'KOT',
              status: 'FAILED',
              error: err.message,
              content: orderSummary
            }
          });
        } catch (logErr) { console.error("[PrintLog] Failed to save error log:", logErr); }

        res.status(500).json({ error: `Printer connection failed: ${err.message}` });
      });

      client.on('timeout', async () => {
        client.destroy();
        try {
          await prisma.printLog.create({
            data: {
              printerId: data.printer.id,
              type: isInvoice ? 'INVOICE' : 'KOT',
              status: 'FAILED',
              error: 'Connection timeout',
              content: orderSummary
            }
          });
        } catch (logErr) { console.error("[PrintLog] Failed to save timeout log:", logErr); }
        res.status(500).json({ error: "Printer connection timed out" });
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to initialize printer connection" });
    }
  });

  app.get("/api/admin/print-logs", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
      const logs = await prisma.printLog.findMany({
        include: { printer: { select: { name: true } } },
        orderBy: { timestamp: 'desc' },
        take: 100
      });
      res.json(logs);
    } catch (error) {
      console.error("[Prisma Error] Failed to fetch print logs:", error);
      res.status(500).json({ error: "Failed to fetch print logs" });
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

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Server Error] Port ${PORT} is already in use.`);
      console.error(`Suggestions:`);
      console.error(`1. Close other terminal windows running this app.`);
      console.error(`2. Run: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force (PowerShell)`);
      process.exit(1);
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
