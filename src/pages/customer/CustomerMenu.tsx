import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { 
  ShoppingBag, 
  Search, 
  ChevronRight, 
  Plus, 
  Minus,
  Info,
  X,
  CreditCard,
  CheckCircle2,
  Utensils,
  ArrowLeft,
  MessageSquare,
  ShoppingCart,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger,
  SheetFooter
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatPrice } from '@/src/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';


export default function CustomerMenu() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [company, setCompany] = useState<any>({ name: 'QRMenu' });
  const [table, setTable] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [orderComplete, setOrderComplete] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productQty, setProductQty] = useState(1);
  const [productNote, setProductNote] = useState('');
  const [isCallWaiterDialogOpen, setIsCallWaiterDialogOpen] = useState(false);
  const [selectedWaiterReason, setSelectedWaiterReason] = useState('Assistance'); // Default reason
  const [customWaiterReason, setCustomWaiterReason] = useState('');
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  const socket = useMemo(() => io(), []);

  useEffect(() => {
    const fetchData = async () => {
      const catRes = await fetch('/api/menu/categories');
      const cats = await catRes.json();
      setCategories(cats);
      if (cats.length > 0) setActiveCategory(cats[0].id);

      const compRes = await fetch('/api/company');
      setCompany(await compRes.json());

      if (tableId) {
        const tablesRes = await fetch('/api/tables');
        const tables = await tablesRes.json();
        const currentTable = tables.find((t: any) => t.id === tableId);
        if (currentTable) setTable(currentTable);
      }
    };
    fetchData();

    socket.on("menu-updated", fetchData);
    return () => { socket.off("menu-updated"); };
  }, [tableId]);

  const callWaiter = (reason: string) => {
    const finalReason = reason === 'Other' ? customWaiterReason || 'Assistance' : reason;
    socket.emit('call-waiter', { 
      tableId: tableId || 'WALK-IN', 
      tableName: table?.name || `Table ${tableId || 'Anonymous'}`,
      reason: finalReason
    });
    toast.success(`Waiter called for: ${finalReason}. Someone will be with you shortly!`);
    setIsCallWaiterDialogOpen(false);
  };

  const handleAddToCart = (product: any, qty: number, note?: string) => {
    const existing = cart.find((item: any) => item.id === product.id && item.note === note);
    if (existing) {
      setCart(cart.map((item: any) => (item.id === product.id && item.note === note) ? { ...item, quantity: item.quantity + qty } : item));
    } else {
      setCart([...cart, { ...product, quantity: qty, note }]);
    }
    toast.success(`${product.name} added to cart`);
    setSelectedProduct(null);
    setProductQty(1);
    setProductNote('');
  };

  const removeFromCart = (productId: string) => {
    const item = cart.find((i: any) => i.id === productId);
    if (item.quantity > 1) {
      setCart(cart.map((i: any) => i.id === productId ? { ...i, quantity: i.quantity - 1 } : i));
    } else {
      setCart(cart.filter((i: any) => i.id !== productId));
    }
  };

  const cartTotal = cart.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);

  const placeOrder = async () => {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableId || 'WALK-IN',
          items: cart.map(item => ({ productId: item.id, quantity: item.quantity, note: item.note }))
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastOrderId(data.id);
        setOrderComplete(true);
        setCart([]);
      }
    } catch (err) {
      toast.error('Could not place order');
    }
  };

  if (orderComplete) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-6"
        >
          <CheckCircle2 size={48} />
        </motion.div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Order Received!</h2>
        <p className="text-slate-500 mb-8">Your food is being prepared. Grab a seat and relax!</p>
        <Button onClick={() => navigate(`/order/${lastOrderId}`)} className="bg-slate-900 rounded-2xl w-full max-w-xs h-14 font-bold">
          Track My Order
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-24">
      {/* Header */}
      <header className="bg-white px-6 pt-12 pb-6 sticky top-0 z-10 border-b border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{company.name}</h1>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">
              {table ? table.name : `Table ${tableId || 'Anonymous'}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setIsCallWaiterDialogOpen(true)} className="rounded-2xl border-slate-200 h-10 w-10">
              <Bell size={20} className="text-slate-600" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigate(`/order/${lastOrderId}`)} className="rounded-2xl border-slate-200 h-10 w-10">
              <ShoppingCart size={20} className="text-slate-600" />
            </Button>
            <div className="p-2 bg-slate-900 rounded-2xl text-white">
              <ShoppingBag size={20} />
            </div>
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input 
            placeholder="Search our menu..." 
            className="pl-10 h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-slate-200"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </header>

      {/* Categories Scroll */}
      <div className="overflow-x-auto no-scrollbar py-4 px-6 flex gap-3">
        {categories.map((cat: any) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "px-5 py-2.5 whitespace-nowrap rounded-2xl text-sm font-bold transition-all duration-300",
              activeCategory === cat.id 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20" 
                : "bg-white text-slate-500 border border-slate-100"
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Menu List */}
      <div className="px-6 space-y-4">
        {categories.filter(c => !activeCategory || c.id === activeCategory).map((cat: any) => (
          <div key={cat.id} className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900 pt-2">{cat.name}</h3>
            <div className="grid grid-cols-1 gap-4">
              {cat.products.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase())).map((product: any) => (
                <motion.div
                  layout
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="bg-white p-4 rounded-3xl border border-slate-100 flex gap-4 items-center shadow-sm"
                >
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="w-20 h-20 object-cover rounded-2xl flex-shrink-0" />
                  ) : (
                    <div className="w-20 h-20 bg-slate-100 rounded-2xl flex-shrink-0 flex items-center justify-center text-slate-300">
                      <Utensils size={24} />
                    </div>
                  )}
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900">{product.name}</h4>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{product.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="font-bold text-slate-900">{formatPrice(product.price, company?.currency).primary}</span>
                      <div className="h-8 w-8 rounded-full bg-slate-900 flex items-center justify-center text-white">
                        <Plus size={16} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Product Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none rounded-t-[2.5rem] bottom-0 top-auto translate-y-0 fixed h-[90vh]">
          {selectedProduct && (
            <div className="flex flex-col h-full bg-white">
              <div className="relative h-64 flex-shrink-0">
                <img src={selectedProduct.image || '/placeholder-food.jpg'} className="w-full h-full object-cover" alt="" />
                <Button variant="secondary" size="icon" className="absolute top-6 right-6 rounded-full bg-white/80 backdrop-blur-sm" onClick={() => setSelectedProduct(null)}>
                  <X size={20} />
                </Button>
              </div>
              <div className="p-8 flex flex-col flex-1 overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-2xl font-bold text-slate-900">{selectedProduct.name}</h2>
                  <span className="text-xl font-bold text-slate-900">{formatPrice(selectedProduct.price, company?.currency).primary}</span>
                </div>
                <p className="text-slate-500 mb-8 leading-relaxed">{selectedProduct.description}</p>
                
                <div className="space-y-4 mb-8">
                  <Label className="text-sm font-bold flex items-center gap-2">
                    <MessageSquare size={16} className="text-slate-400" />
                    Special Instructions
                  </Label>
                  <Input 
                    placeholder="e.g. No onions, extra spicy..." 
                    className="rounded-xl h-12 bg-slate-50 border-none"
                    value={productNote}
                    onChange={e => setProductNote(e.target.value)}
                  />
                </div>

                <div className="mt-auto pt-6 flex flex-col gap-4">
                  <div className="flex items-center justify-center gap-6 bg-slate-50 p-4 rounded-2xl">
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-white" onClick={() => setProductQty(Math.max(1, productQty - 1))}>
                      <Minus size={18} />
                    </Button>
                    <span className="text-xl font-bold w-8 text-center">{productQty}</span>
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-white" onClick={() => setProductQty(productQty + 1)}>
                      <Plus size={18} />
                    </Button>
                  </div>
                  
                  <Button 
                    className="w-full bg-slate-900 rounded-3xl h-16 text-lg font-bold flex justify-between px-8"
                    onClick={() => handleAddToCart(selectedProduct, productQty, productNote)}
                  >
                    <span>Add to Cart</span>
                    <span>{formatPrice(selectedProduct.price * productQty, company?.currency).primary}</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Call Waiter Dialog */}
      <Dialog open={isCallWaiterDialogOpen} onOpenChange={setIsCallWaiterDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl border-none">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Call a Waiter</DialogTitle>
            <DialogDescription>
              Let us know how we can assist you at Table {table?.name || `Table ${tableId || 'Anonymous'}`}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <RadioGroup 
              onValueChange={setSelectedWaiterReason} 
              defaultValue={selectedWaiterReason} 
              className="grid grid-cols-2 gap-3"
            >
              {[
                { value: 'Assistance', label: 'General Assistance' },
                { value: 'Need Water', label: 'Need Water' },
                { value: 'Need Bill', label: 'Need Bill' },
                { value: 'Clean Table', label: 'Clean Table' },
              ].map((option) => (
                <div key={option.value} className="flex items-center space-x-2 border rounded-xl p-3">
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label htmlFor={option.value} className="text-base font-medium">{option.label}</Label>
                </div>
              ))}
               <div className="flex items-center space-x-2 border rounded-xl p-3">
                <RadioGroupItem value="Other" id="Other" />
                <Label htmlFor="Other" className="text-base font-medium">Other</Label>
              </div>
            </RadioGroup>
            {selectedWaiterReason === 'Other' && (
              <Input 
                placeholder="Please specify your request"
                value={customWaiterReason}
                onChange={(e) => setCustomWaiterReason(e.target.value)}
                className="rounded-xl mt-3"
              />
            )}
          </div>
          <DialogFooter>
            <Button 
              onClick={() => callWaiter(selectedWaiterReason)} 
              className="w-full bg-slate-900 rounded-xl h-12 font-bold"
              disabled={selectedWaiterReason === 'Other' && customWaiterReason.trim() === ''}
            >
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cart Drawer */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-6 left-6 right-6 z-20"
          >
            <Sheet>
              <SheetTrigger>
                <div className="bg-slate-900 text-white p-4 rounded-3xl shadow-2xl flex items-center justify-between cursor-pointer active:scale-95 transition-transform">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 w-8 h-8 rounded-xl flex items-center justify-center font-bold">
                      {cart.length}
                    </div>
                    <span className="font-bold">View Cart</span>
                  </div>
                  <span className="font-bold text-lg">{cartTotal.primary}</span>
                </div>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-[2.5rem] p-8 h-[80vh] border-none shadow-2xl">
                <SheetHeader>
                  <SheetTitle className="text-2xl font-bold flex items-center justify-between">
                    Your Order
                    <Badge variant="outline" className="rounded-full px-3 py-1 bg-slate-50 border-none font-bold text-slate-400">
                      T-{tableId || 'ANON'}
                    </Badge>
                  </SheetTitle>
                </SheetHeader>
                
                <div className="flex-1 overflow-y-auto py-8 space-y-6">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-xs font-bold text-slate-400">
                          {item.quantity}x
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{item.name}</p>
                          {item.note && <p className="text-[10px] text-amber-600 italic">"{item.note}"</p>}
                          <p className="text-xs text-slate-500 mt-0.5">{formatPrice(item.price * item.quantity, company?.currency).primary}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-slate-100" onClick={() => removeFromCart(item.id)}>
                          <Minus size={14} />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-slate-100" onClick={() => handleAddToCart(item, 1, item.note)}>
                          <Plus size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Subtotal</span>
                    <span className="font-bold text-slate-900 text-lg">{cartTotal.primary}</span>
                  </div>
                  <Button onClick={placeOrder} className="w-full bg-slate-900 rounded-3xl py-8 text-lg font-bold">
                    Confirm Order
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
