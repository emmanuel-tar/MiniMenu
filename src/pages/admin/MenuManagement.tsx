import React, { useEffect, useState } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Utensils, Tag, Layers, Search, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth';

export default function MenuManagement() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
  const [inventoryItems, setInventoryItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [newImage, setNewImage] = useState<File | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);

  const [newCategory, setNewCategory] = useState({ name: '', description: '' });
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    stationId: '',
    inventoryItemId: '',
    groupId: 'default' // Simple group for MVP
  });

  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const catRes = await fetch('/api/menu/categories');
        const prodRes = await fetch('/api/menu/products');
        const statRes = await fetch('/api/stations');
        const invRes = await fetch('/api/inventory', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        setCategories(await catRes.json());
        setProducts(await prodRes.json());
        setStations(await statRes.json());
        setInventoryItems(await invRes.json());
      } catch (err) {
        console.error(err);
      }
    };
    if (token) fetchData();
  }, [token]);

  const handleAddCategory = async () => {
    if (!newCategory.name) return;
    const res = await fetch('/api/menu/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(newCategory),
    });
    if (res.ok) {
      const data = await res.json();
      setCategories([...categories, data]);
      setNewCategory({ name: '', description: '' });
      toast.success('Category created');
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        return data.imageUrl;
      }
      return null;
    } catch (err) {
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.categoryId || !newProduct.stationId) {
      toast.error('Please fill in all required fields');
      return;
    }

    let imageUrl = '';
    if (newImage) {
      const uploaded = await uploadImage(newImage);
      if (uploaded) imageUrl = uploaded;
    }

    const payload = {
      ...newProduct,
      price: parseFloat(newProduct.price),
      image: imageUrl,
      inventoryItemId: newProduct.inventoryItemId || null,
      groupId: 'default' 
    };
    const res = await fetch('/api/menu/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      setProducts([...products, data]);
      setNewProduct({ name: '', description: '', price: '', categoryId: '', stationId: '', inventoryItemId: '', groupId: 'default' });
      setNewImage(null);
      toast.success('Product added to menu');
    }
  };

  const handleEditProduct = async () => {
    if (!editingProduct.name || !editingProduct.categoryId || !editingProduct.stationId) {
      toast.error('Please fill in all required fields');
      return;
    }

    let imageUrl = editingProduct.image;
    if (editImage) {
      const uploaded = await uploadImage(editImage);
      if (uploaded) imageUrl = uploaded;
    }

    const payload = {
      ...editingProduct,
      price: parseFloat(editingProduct.price),
      image: imageUrl,
      inventoryItemId: editingProduct.inventoryItemId || null
    };
    // Remove relation objects before sending to prisma update
    delete (payload as any).category;
    delete (payload as any).station;
    delete (payload as any).group;
    delete (payload as any).inventoryItem;

    const res = await fetch(`/api/menu/products/${editingProduct.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      setProducts(products.map((p: any) => p.id === data.id ? { ...p, ...data } : p));
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      toast.success('Product updated');
    } else {
      toast.error('Failed to update product');
    }
  };

  const openEditDialog = (product: any) => {
    setEditingProduct({ ...product, price: product.price.toString() });
    setIsEditDialogOpen(true);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Menu Management</h2>
          <p className="text-slate-500">Create categories, add products, and route them to stations</p>
        </div>
        
        <div className="flex gap-3">
          <Dialog>
            <DialogTrigger>
              <Button variant="outline" className="rounded-xl border-slate-200">
                <Tag className="mr-2" size={18} /> New Category
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl border-none">
              <DialogHeader>
                <DialogTitle>Add Category</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input 
                    value={newCategory.name} 
                    onChange={e => setNewCategory({...newCategory, name: e.target.value})}
                    placeholder="e.g. Starters"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input 
                    value={newCategory.description} 
                    onChange={e => setNewCategory({...newCategory, description: e.target.value})}
                    placeholder="Optional"
                  />
                </div>
                <Button onClick={handleAddCategory} className="w-full bg-slate-900">Create</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger>
              <Button className="rounded-xl bg-slate-900">
                <Plus className="mr-2" size={18} /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl border-none max-w-lg">
              <DialogHeader>
                <DialogTitle>New Menu Item</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2 space-y-2">
                  <Label>Product Name*</Label>
                  <Input value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Category*</Label>
                  <Select onValueChange={(v: string) => setNewProduct({...newProduct, categoryId: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c: { id: string; name: string }) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Price*</Label>
                  <Input type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Production Station*</Label>
                  <Select onValueChange={(v: string) => setNewProduct({...newProduct, stationId: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Route to..." />
                    </SelectTrigger>
                    <SelectContent>
                      {stations.map((s: { id: string; name: string }) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Track Inventory (Optional)</Label>
                  <Select onValueChange={(v: string) => setNewProduct({...newProduct, inventoryItemId: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select inventory item..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Untracked)</SelectItem>
                      {inventoryItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-emerald-600 font-medium">Auto-deducts stock when this item is ordered</p>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Description</Label>
                  <Input value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Product Image</Label>
                  <Input type="file" accept="image/*" onChange={e => setNewImage(e.target.files?.[0] || null)} className="cursor-pointer" />
                </div>
                <Button onClick={handleAddProduct} disabled={uploading} className="col-span-2 bg-slate-900 mt-4 py-6">
                  {uploading ? 'Uploading...' : 'Save Product'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Products Table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input placeholder="Search menu items..." className="pl-10 h-10 border-slate-100 bg-slate-50/50 rounded-xl max-w-md" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="w-[80px]">Image</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Station</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product: any) => (
                <TableRow key={product.id} className="border-slate-50 hover:bg-slate-50/50">
                  <TableCell>
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-12 h-12 object-cover rounded-lg shadow-sm" />
                    ) : (
                      <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300">
                        <Utensils size={16} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-800">{product.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs border-slate-200 text-slate-500 font-normal">
                      {product.category?.name}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">${product.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                      <Layers size={14} className="text-slate-300" />
                      {product.station?.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={product.available ? "bg-emerald-50 text-emerald-600 border-none px-2 py-0" : "bg-red-50 text-red-600 border-none px-2 py-0"}>
                      {product.available ? "Active" : "Hidden"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="text-slate-400" onClick={() => openEditDialog(product)}>
                      <Edit2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-slate-50 rounded-full">
                        <Utensils className="text-slate-300" size={32} />
                      </div>
                      <p className="text-slate-500 font-medium">Your menu is empty</p>
                      <p className="text-slate-400 text-sm">Start by adding categories and products above</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* Edit Product Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="rounded-2xl border-none max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Menu Item</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label>Product Name*</Label>
              <Input 
                value={editingProduct?.name || ''} 
                onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Category*</Label>
              <Select 
                value={editingProduct?.categoryId ? String(editingProduct.categoryId) : undefined}
                onValueChange={v => setEditingProduct({...editingProduct, categoryId: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c: { id: string; name: string }) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Price*</Label>
              <Input 
                type="number" 
                step="0.01" 
                value={editingProduct?.price || ''} 
                onChange={e => setEditingProduct({...editingProduct, price: e.target.value})} 
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Production Station*</Label>
              <Select 
                value={editingProduct?.stationId ? String(editingProduct.stationId) : undefined}
                onValueChange={v => setEditingProduct({...editingProduct, stationId: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Route to..." />
                </SelectTrigger>
                <SelectContent>
                  {stations.map((s: { id: string; name: string }) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Track Inventory</Label>
              <Select 
                value={editingProduct?.inventoryItemId || 'none'}
                onValueChange={v => setEditingProduct({...editingProduct, inventoryItemId: v === 'none' ? null : v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select inventory item..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Untracked)</SelectItem>
                  {inventoryItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Input 
                value={editingProduct?.description || ''} 
                onChange={e => setEditingProduct({...editingProduct, description: e.target.value})} 
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Update Image</Label>
              <Input type="file" accept="image/*" onChange={e => setEditImage(e.target.files?.[0] || null)} className="cursor-pointer" />
            </div>
            <Button onClick={handleEditProduct} disabled={uploading} className="col-span-2 bg-slate-900 mt-4 py-6">
              {uploading ? 'Uploading...' : 'Update Product'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
