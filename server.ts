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
    const data = req.body;
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

  // Waiter Requests API
  app.get("/api/admin/waiter-calls", authenticate, (req, res) => {
    res.json(activeWaiterCalls);
  });

  // Handled Waiter Requests API
  app.get("/api/admin/waiter-calls/history", authenticate, (req, res) => {
    res.json(handledWaiterCalls);
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

    // Remove unsupported fields before calling Prisma
    delete data.cost;

    try {
      const product = await prisma.product.create({ data });
      res.json(product);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.put("/api/menu/products/:id", authenticate, async (req, res) => {
    const { id } = req.params;
    const data = req.body as any;

    // Frontend sends `cost`, but Prisma model does not have a `cost` field.
    // Strip it to prevent Prisma validation errors.
    delete data.cost;

    try {
      const product = await prisma.product.update({
        where: { id },
        data
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
    const { status } = req.body;
    try {
      const kot = await prisma.kOT.update({
        where: { id },
        data: { status }
      });

      // Optionally sync order item statuses if needed
      await prisma.orderItem.updateMany({
        where: { kotId: id },
        data: { status }
      });

      res.json(kot);
    } catch (error) {
      res.status(500).json({ error: "Failed to update KOT status" });
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
