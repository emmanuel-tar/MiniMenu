import React, { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth';

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

const KOTPrinter: React.FC = () => {
  const socketRef = useRef<Socket | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on("print-kot", async (kot: PrintableKot) => {
      console.log("[KOTPrinter] Received KOT for printing:", kot);
      if (kot.printer.type === 'BROWSER') {
        handleBrowserPrint(kot);
      } else if (kot.printer.type === 'NETWORK') {
        try {
          const res = await fetch('/api/print/network', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(kot)
          });
          
          if (res.ok) {
            toast.success(`KOT printed to ${kot.printer.name}`);
          } else {
            const err = await res.json();
            toast.error(err.error || 'Network print failed');
          }
        } catch (err) {
          toast.error('Could not reach print proxy');
        }
      } else {
        toast.warning(`Unsupported printer type for KOT: ${kot.printer.type}`);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const handleBrowserPrint = (kot: PrintableKot) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      toast.error('Failed to open print window. Please allow pop-ups.');
      return;
    }

    const itemsHtml = kot.items.map(item => `
      <div style="display: flex; justify-content: space-between; font-size: 14px;">
        <span>${item.quantity}x ${item.productName}</span>
      </div>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>KOT - ${kot.stationName}</title>
          <style>
            body { font-family: monospace; padding: 10px; width: 300px; margin: 0 auto; }
            h2, h3 { text-align: center; margin-bottom: 5px; }
            hr { border: 0; border-top: 1px dashed #000; margin: 10px 0; }
            .item { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 5px; }
            .item-qty { font-weight: bold; }
            .item-name { flex-grow: 1; margin-left: 10px; }
            .footer { text-align: center; margin-top: 15px; font-size: 12px; }
            @page { size: auto; margin: 0mm; }
            @media print {
              html, body { width: 300px; margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          <h2>KITCHEN ORDER TICKET</h2>
          <p style="text-align: center; font-size: 12px;">${new Date(kot.createdAt).toLocaleString()}</p>
          <hr/>
          <h3>Table: ${kot.tableNumber}</h3>
          <h3>Station: ${kot.stationName}</h3>
          <hr/>
          ${itemsHtml}
          <hr/>
          <div class="footer">Order ID: ${kot.orderId.slice(0, 8)}</div>
          <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return null; // This component doesn't render anything visible
};

export default KOTPrinter;