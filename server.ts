import express from "express";
import path from "path";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { prisma } from "./src/lib/db.js";
import { hashPassword, comparePassword, generateToken, verifyToken } from "./src/lib/auth.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }

  app.use(express.json());
  app.use(cors());

  // Serve uploads statically
  app.use('/uploads', express.static(uploadsDir));

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
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: "Invalid token" });
    (req as any).user = decoded;
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
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await comparePassword(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken({ userId: user.id, role: user.role });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  // Setup / Seed (Initial Admin)
  app.post("/api/setup/admin", async (req, res) => {
    const count = await prisma.user.count();
    if (count > 0) return res.status(400).json({ error: 'Admin already exists' });
    const { email, password, name } = req.body;
    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, role: 'ADMIN' }
    });
    res.json({ success: true, userId: user.id });
  });

  // Company Settings
  app.get("/api/company", async (req, res) => {
    const company = await prisma.company.findFirst();
    res.json(company || {});
  });

  app.post("/api/company", authenticate, async (req, res) => {
    if ((req as any).user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
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

  app.get("/api/menu/products", async (req, res) => {
    const products = await prisma.product.findMany({ 
      include: { category: true, group: true, station: true } 
    });
    res.json(products);
  });

  app.post("/api/menu/products", authenticate, async (req, res) => {
    const data = req.body;
    const product = await prisma.product.create({ data });
    res.json(product);
  });

  app.put("/api/menu/products/:id", authenticate, async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
      const product = await prisma.product.update({
        where: { id },
        data
      });
      res.json(product);
    } catch (error) {
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

  // Customer Ordering
  app.post("/api/orders", async (req, res) => {
    const { tableNumber, items } = req.body;
    
    try {
      const order = await prisma.$transaction(async (tx) => {
        let totalAmount = 0;
        const orderItemsData = [];
        
        const stationItemsMap = new Map<string, any[]>();
        
        for (const item of items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (product) {
            totalAmount += product.price * item.quantity;
            const orderItem = {
              productId: product.id,
              quantity: item.quantity,
              price: product.price,
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
            tableNumber,
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

      res.json(order);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to place order" });
    }
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
