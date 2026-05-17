import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  Utensils
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

export default function CustomerMenu() {
  const { tableId } = useParams();
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [company, setCompany] = useState<any>({ name: 'QRMenu' });
  const [search, setSearch] = useState('');
  const [orderComplete, setOrderComplete] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const catRes = await fetch('/api/menu/categories');
      const cats = await catRes.json();
      setCategories(cats);
      if (cats.length > 0) setActiveCategory(cats[0].id);

      const compRes = await fetch('/api/company');
      setCompany(await compRes.json());
    };
    fetchData();
  }, []);

  const addToCart = (product: any) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
    toast.success(`${product.name} added to cart`);
  };

  const removeFromCart = (productId: string) => {
    const item = cart.find(i => i.id === productId);
    if (item.quantity > 1) {
      setCart(cart.map(i => i.id === productId ? { ...i, quantity: i.quantity - 1 } : i));
    } else {
      setCart(cart.filter(i => i.id !== productId));
    }
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const placeOrder = async () => {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: tableId || 'WALK-IN',
          items: cart.map(item => ({ productId: item.id, quantity: item.quantity }))
        }),
      });
      if (res.ok) {
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
        <Button onClick={() => setOrderComplete(false)} variant="outline" className="rounded-2xl border-slate-200">
          Order More
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-24">
      {/* Header */}
      <header className="bg-white px-6 pt-12 pb-6 sticky top-0 z-10 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{company.name}</h1>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">
              Table {tableId || 'Anonymous'}
            </p>
          </div>
          <div className="p-2 bg-slate-900 rounded-2xl text-white">
            <ShoppingBag size={20} />
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
                      <span className="font-bold text-slate-900">${product.price.toFixed(2)}</span>
                      <Button 
                        size="sm" 
                        onClick={() => addToCart(product)} 
                        className="h-8 w-8 rounded-full bg-slate-900 p-0"
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>

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
                  <span className="font-bold text-lg">${cartTotal.toFixed(2)}</span>
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
                          <p className="text-xs text-slate-500">${(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-slate-100" onClick={() => removeFromCart(item.id)}>
                          <Minus size={14} />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-slate-100" onClick={() => addToCart(item)}>
                          <Plus size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Subtotal</span>
                    <span className="font-bold text-slate-900 text-lg">${cartTotal.toFixed(2)}</span>
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
