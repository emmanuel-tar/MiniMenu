import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth'; // Assuming useAuth is available

interface Station {
  id: string;
  name: string;
}

interface ProductGroupFormData {
  name: string;
  description?: string;
  productionStationId: string | null;
}

interface ProductGroupFormProps {
  initialData?: ProductGroupFormData;
  onSave: (data: ProductGroupFormData) => void;
  onCancel: () => void;
}

export default function ProductGroupForm({ initialData, onSave, onCancel }: ProductGroupFormProps) {
  const { token } = useAuth();
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  // Initialize with null if no initial station, or the station ID
  const [selectedStationId, setSelectedStationId] = useState<string | null>(initialData?.productionStationId || null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);

  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await fetch('/api/stations', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setStations(await res.json());
        } else {
          toast.error('Failed to load production stations.');
        }
      } catch (error) {
        console.error('Error fetching stations:', error);
        toast.error('Network error while fetching stations.');
      } finally {
        setLoadingStations(false);
      }
    };

    if (token) {
      fetchStations();
    }
  }, [token]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      description: description || undefined,
      productionStationId: selectedStationId, // This will be null if 'None' is selected
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6">
      <div className="space-y-2">
        <Label htmlFor="name">Group Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Appetizers, Main Course" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the product group" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="station">Production Station</Label>
        <Select
          value={selectedStationId || ""} // If selectedStationId is null, use empty string to match "None" option
          onValueChange={(value) => setSelectedStationId(value === "" ? null : value)} // Convert empty string back to null
          disabled={loadingStations}
        >
          <SelectTrigger id="station">
            <SelectValue placeholder="Select a production station (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">None (Unassigned)</SelectItem> {/* The "None" option */}
            {stations.map((station) => (
              <SelectItem key={station.id} value={station.id}>
                {station.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loadingStations && <p className="text-sm text-slate-500">Loading stations...</p>}
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          Save Product Group
        </Button>
      </div>
    </form>
  );
}