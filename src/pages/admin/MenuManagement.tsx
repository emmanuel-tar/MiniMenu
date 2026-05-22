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
import { Plus, Utensils, Tag, Layers, Search, Edit2, Download, Upload, Trash2, FileDown, FileUp, Image as ImageIcon, Eye, EyeOff, Copy, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth';

export default function MenuManagement() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [productGroups, setProductGroups] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
  const [inventoryItems, setInventoryItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const jsonFileInputRef = React.useRef<HTMLInputElement>(null);
  const csvFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);
  const [categoryImage, setCategoryImage] = useState<File | null>(null);
  const [newCategory, setNewCategory] = useState({ name: '', description: '' });
  const [newGroup, setNewGroup] = useState({ name: '' });
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: '',
    sku: '',
    cost: '',
    categoryId: '',
    stationId: '',
    groupId: '',
    inventoryItemId: '',
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const catRes = await fetch('/api/menu/categories');
        const groupRes = await fetch('/api/menu/groups');
        const prodRes = await fetch('/api/menu/products');
        const statRes = await fetch('/api/stations');
        const invRes = await fetch('/api/inventory', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        setCategories(await catRes.json());
        setProductGroups(await groupRes.json());
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

    let imageUrl = '';
    if (categoryImage) {
      const uploaded = await uploadImage(categoryImage);
      if (uploaded) imageUrl = uploaded;
    }

    const res = await fetch('/api/menu/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        ...newCategory,
        image: imageUrl,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setCategories([...categories, { ...data, products: [] }]); // Add new category to table data
      setNewCategory({ name: '', description: '' });
      setCategoryImage(null);
      toast.success('Category created');
    } else {
      toast.error('Failed to create category');
    }
  };

  const handleAddGroup = async () => {
    if (!newGroup.name) return;
    const res = await fetch('/api/menu/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(newGroup),
    });
    if (res.ok) {
      const data = await res.json();
      setProductGroups([...productGroups, data]);
      setNewGroup({ name: '' });
      toast.success('Product group created');
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
    if (!newProduct.name || !newProduct.categoryId || !newProduct.groupId || !newProduct.stationId) {
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
      cost: parseFloat(newProduct.cost) || 0,
      image: imageUrl,
      inventoryItemId: newProduct.inventoryItemId || null
    };
    const res = await fetch('/api/menu/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      setProducts([...products, data]);
      setNewProduct({ name: '', description: '', price: '', cost: '', categoryId: '', stationId: '', inventoryItemId: '', groupId: '', sku: '' });
      setNewImage(null);
      toast.success('Product added to menu');
    }
  };

  const handleBulkStatusUpdate = async (available: boolean) => {
    if (selectedIds.length === 0) return;
    
    try {
      const res = await fetch('/api/menu/products/bulk-status', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ ids: selectedIds, available }),
      });

      if (res.ok) {
        setProducts(products.map(p => 
          selectedIds.includes(p.id) ? { ...p, available } : p
        ));
        setSelectedIds([]);
        toast.success(`Updated ${selectedIds.length} items`);
      } else {
        toast.error('Bulk update failed');
      }
    } catch (err) {
      toast.error('Connection error');
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
      cost: parseFloat(editingProduct.cost) || 0,
      image: imageUrl,
      inventoryItemId: editingProduct.inventoryItemId || null
    };

    const res = await fetch(`/api/menu/products/${editingProduct.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload), // Backend now handles stripping relations
    });
    if (res.ok) {
      const data = await res.json();
      setProducts(products.map((p: any) => p.id === data.id ? { ...p, ...data } : p));
      setIsEditDialogOpen(false);
      toast.success('Product updated');
    } else {
      toast.error('Failed to update product');
    }
  };
  const toggleCategoryActive = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/menu/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        setCategories(categories.map(c => c.id === id ? { ...c, active } : c));
        toast.success(`Category ${active ? 'activated' : 'deactivated'}`);
      } else {
        toast.error('Failed to update category status');
      }
    } catch (err) {
      toast.error('Connection error');
    }
  };

  const openEditDialog = (product: any) => {
    setEditingProduct({ ...product, price: product.price.toString(), cost: (product.cost || 0).toString() });
    setIsEditDialogOpen(true);
  };

  const handleCloneProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/menu/products/${id}/clone`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const cloned = await res.json();
        setProducts([...products, cloned]);
        toast.success('Product cloned. Edit the new item to set SKU/Barcode.');
      } else {
        toast.error('Failed to clone product');
      }
    } catch (err) {
      toast.error('Connection error');
    }
  };

  const handleExportMenu = async () => {
    try {
      const res = await fetch('/api/menu/export', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `menu-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      toast.success('Menu exported successfully');
    } catch (err) {
      toast.error('Failed to export menu');
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await fetch('/api/menu/export', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      // Flatten data for Excel-friendly consumption
      const headers = ["ID", "Name", "Description", "Price", "Cost", "Category", "Group", "Station", "Available"];
      const rows = data.products.map((p: { id: string; name: string; description: string; price: number; cost: number; categoryId: string; groupId: string; stationId: string; available: boolean }) => [
        p.id,
        p.name,
        p.description || "",
        p.price,
        p.cost || 0,
        data.categories.find((c: { id: string; name: string }) => c.id === p.categoryId)?.name || "",
        data.groups.find((g: { id: string; name: string }) => g.id === p.groupId)?.name || "",
        data.stations.find((s: { id: string; name: string }) => s.id === p.stationId)?.name || "",
        p.available ? "Yes" : "No"
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row: any[]) => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `menu-products-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };

  const handleImportMenu = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const menuData = JSON.parse(event.target?.result as string);
        const res = await fetch('/api/menu/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(menuData),
        });
        if (res.ok) {
          toast.success('Menu imported successfully');
          window.location.reload();
        }
      } catch (err) {
        toast.error('Invalid menu file or import failed');
      }
    };
    reader.readAsText(file);
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csvContent = event.target?.result as string;
        const res = await fetch('/api/menu/import/csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ csv: csvContent }),
        });
        if (res.ok) {
          toast.success('Menu imported successfully');
          window.location.reload();
        } else {
          const err = await res.json();
          toast.error(err.error || 'Import failed');
        }
      } catch (err) {
        toast.error('Invalid CSV file or import failed');
      }
    };
    reader.readAsText(file);
  };

  const handleClearMenu = async () => {
    try {
      const res = await fetch('/api/menu/clear', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Menu and order history cleared');
        window.location.reload();
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to clear menu');
      }
    } catch (err) {
      toast.error('Connection error');
    } finally {
      setIsClearDialogOpen(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Menu Management</h2>
          <p className="text-slate-500">Create categories, add products, and route them to stations</p>
        </div>
        
        <div className="flex gap-3">
          <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-xl border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="mr-2" size={18} /> Clear Menu
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl border-none max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-red-600">Clear All Menu Data?</DialogTitle>
                <CardDescription>
                  This will permanently delete all products, categories, and groups. This will also clear order history to maintain database integrity.
                </CardDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 pt-4">
                <Button 
                  variant="destructive" 
                  className="rounded-xl bg-red-600 hover:bg-red-700 h-12 font-bold"
                  onClick={handleClearMenu}
                >
                  Yes, Delete Everything
                </Button>
                <Button variant="ghost" className="rounded-xl" onClick={() => setIsClearDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" className="rounded-xl border-slate-200" onClick={handleExportCSV}>
            <FileDown className="mr-2" size={18} /> CSV
          </Button>
          <Button variant="outline" className="rounded-xl border-slate-200" onClick={handleExportMenu}>
            <Download className="mr-2" size={18} /> JSON
          </Button>
          <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => jsonFileInputRef.current?.click()} title="Import JSON">
            <Upload className="mr-2" size={18} /> JSON Import
          </Button>
          <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => csvFileInputRef.current?.click()} title="Import CSV">
            <FileUp className="mr-2" size={18} /> CSV Import
          </Button>
          <input type="file" ref={jsonFileInputRef} className="hidden" accept=".json" onChange={handleImportMenu} />
          <input type="file" ref={csvFileInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
          
          <Dialog>
            <DialogTrigger asChild>
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
                <div className="col-span-2 space-y-2">
                  <Label>Category Image</Label>
                  <Input type="file" accept="image/*" onChange={e => setCategoryImage(e.target.files?.[0] || null)} className="cursor-pointer" />
                </div>
                <Button onClick={handleAddCategory} className="w-full bg-slate-900">Create</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-xl border-slate-200">
                <Layers className="mr-2" size={18} /> New Group
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl border-none">
              <DialogHeader>
                <DialogTitle>Add Operational Group</DialogTitle>
                <CardDescription>Groups like "Kitchen Food" or "Bar Drinks" manage routing.</CardDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Group Name</Label>
                  <Input value={newGroup.name} onChange={e => setNewGroup({name: e.target.value})} placeholder="e.g. Grill" />
                </div>
                <Button onClick={handleAddGroup} className="w-full bg-slate-900">Create Group</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
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
                  <Select onValueChange={(v) => setNewProduct({...newProduct, categoryId: v || ''})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Product Group*</Label>
                  <Select onValueChange={(v) => setNewProduct({...newProduct, groupId: v || ''})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Group" />
                    </SelectTrigger>
                    <SelectContent>
                      {productGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sale Price ($)*</Label>
                  <Input type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input value={newProduct.sku} onChange={e => setNewProduct({...newProduct, sku: e.target.value})} placeholder="Unique identifier" />
                </div>
                <div className="space-y-2">
                  <Label>Unit Cost ($)</Label>
                  <Input type="number" step="0.01" value={newProduct.cost} onChange={e => setNewProduct({...newProduct, cost: e.target.value})} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Production Station*</Label>
                  <Select 
                    value={newProduct.stationId || undefined} 
                    onValueChange={(v: string | null) => setNewProduct({...newProduct, stationId: v || ''})}
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
                  <Label>Track Inventory (Optional)</Label>
                  <Select onValueChange={(v: string | null) => setNewProduct({...newProduct, inventoryItemId: v || ''})}>
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

      {/* Categories Table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-0">
          <CardTitle className="text-xl font-bold text-slate-900">Menu Categories</CardTitle>
          <CardDescription>Organize your menu items into customer-facing categories.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="w-15">Image</TableHead>
                <TableHead>Category Name</TableHead>
                <TableHead>Items Count</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category: any) => (
                <TableRow key={category.id} className="border-slate-50 hover:bg-slate-50/50">
                  <TableCell>
                    {category.image ? (
                      <img src={category.image} alt={category.name} className="w-10 h-10 object-cover rounded-lg shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300">
                        <ImageIcon size={14} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-800">{category.name}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{category.products?.length || 0}</TableCell>
                  <TableCell>
                    <Badge className={category.active ? "bg-emerald-50 text-emerald-600 border-none px-2 py-0" : "bg-red-50 text-red-600 border-none px-2 py-0"}>
                      {category.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {new Date(category.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="text-slate-400" onClick={() => toggleCategoryActive(category.id, !category.active)}>
                      {category.active ? <EyeOff size={16} /> : <Eye size={16} />}
                    </Button>
                    <Button variant="ghost" size="icon" className="text-slate-400" onClick={() => { /* openEditCategoryDialog(category) */ }}>
                      <Edit2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input placeholder="Search menu items..." className="pl-10 h-10 border-slate-100 bg-slate-50/50 rounded-xl" />
            </div>
            
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                <span className="text-sm font-medium text-slate-500 mr-2">
                  {selectedIds.length} selected
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-lg text-emerald-600 border-emerald-100 bg-emerald-50 hover:bg-emerald-100"
                  onClick={() => handleBulkStatusUpdate(true)}
                >
                  <CheckCircle size={14} className="mr-1" /> Make Available
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-lg text-red-600 border-red-100 bg-red-50 hover:bg-red-100"
                  onClick={() => handleBulkStatusUpdate(false)}
                >
                  <XCircle size={14} className="mr-1" /> Hide Items
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300"
                    checked={selectedIds.length === products.length && products.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(products.map(p => p.id));
                      else setSelectedIds([]);
                    }}
                  />
                </TableHead>
                <TableHead className="w-20">Image</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Sale Price</TableHead>
                <TableHead>Station</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product: any) => (
                <TableRow key={product.id} className="border-slate-50 hover:bg-slate-50/50">
                  <TableCell>
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300"
                      checked={selectedIds.includes(product.id)}
                      onChange={() => {
                        if (selectedIds.includes(product.id)) setSelectedIds(selectedIds.filter(id => id !== product.id));
                        else setSelectedIds([...selectedIds, product.id]);
                      }}
                    />
                  </TableCell>
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
                  <TableCell className="text-slate-500 text-sm">${(product.cost || 0).toFixed(2)}</TableCell>
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
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-blue-500" onClick={() => handleCloneProduct(product.id)}>
                      <Copy size={16} />
                    </Button>
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
                onValueChange={v => setEditingProduct({...editingProduct, categoryId: v || ''})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Product Group*</Label>
              <Select 
                value={editingProduct?.groupId || undefined}
                onValueChange={v => setEditingProduct({...editingProduct, groupId: v || ''})}
              >
                <SelectTrigger><SelectValue placeholder="Select Group" /></SelectTrigger>
                <SelectContent>
                  {productGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sale Price ($)*</Label>
              <Input 
                type="number" 
                step="0.01" 
                value={editingProduct?.price || ''} 
                onChange={e => setEditingProduct({...editingProduct, price: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Unit Cost ($)</Label>
              <Input 
                type="number" 
                step="0.01" 
                value={editingProduct?.cost || ''} 
                onChange={e => setEditingProduct({...editingProduct, cost: e.target.value})} 
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Production Station*</Label>
              <Select 
                value={editingProduct?.stationId ? String(editingProduct.stationId) : undefined}
                onValueChange={v => setEditingProduct({...editingProduct, stationId: v || ''})}
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
            {editingProduct?.image && (
              <div className="col-span-2 space-y-2">
                <Label>Current Image</Label>
                <img src={editingProduct.image} alt="Current Product" className="w-24 h-24 object-cover rounded-lg" />
              </div>
            )}
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
