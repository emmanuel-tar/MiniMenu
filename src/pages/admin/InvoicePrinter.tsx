import React, { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth';

interface PrintableInvoice {
  orderId: string;
  tableNumber: string;
  items: any[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  createdAt: string;
  company: any;
  receiptSettings: any;
  printer: any;
}

const InvoicePrinter: React.FC = () => {
  const socketRef = useRef<Socket | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on("print-invoice", async (invoice: PrintableInvoice) => {
      console.log("[InvoicePrinter] Received Invoice:", invoice);
      if (invoice.printer.type === 'BROWSER') {
        handleBrowserPrint(invoice);
      } else if (invoice.printer.type === 'NETWORK') {
        try {
          const res = await fetch('/api/print/network', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(invoice)
          });
          
          if (res.ok) {
            toast.success(`Invoice printed to ${invoice.printer.name}`);
          } else {
            const err = await res.json();
            toast.error(err.error || 'Network print failed');
          }
        } catch (err) {
          toast.error('Could not reach print proxy');
        }
      }
    });

    return () => { socketRef.current?.disconnect(); };
  }, []);

  const handleBrowserPrint = (invoice: PrintableInvoice) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    const currency = invoice.company.currency || '$';
    const secondaryCurrency = invoice.company.secondaryCurrency;
    const exchangeRate = invoice.company.exchangeRate;

    const totalInSecondary = secondaryCurrency && exchangeRate ? (invoice.totalAmount * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2 }) : null;

    const itemsHtml = invoice.items.map(i => `
      <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
        <span>${i.quantity}x ${i.productName}</span>
        <span>${currency}${(i.price * i.quantity).toLocaleString()}</span>
      </div>
      ${i.modifiers && i.modifiers.length > 0 ? `
        <div style="font-size: 12px; margin-left: 20px; color: #555;">
          ${i.modifiers.map(mod => `+ ${mod.name} (${currency}${mod.price.toLocaleString()})`).join('<br/>')}
        </div>` : ''}
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <style>
            body { font-family: monospace; padding: 20px; width: 300px; margin: 0 auto; color: #000; }
            .header { text-align: center; margin-bottom: 15px; }
            .logo { max-width: 100px; height: auto; margin-bottom: 5px; }
            .breakdown { font-size: 13px; margin-top: 10px; border-top: 1px solid #eee; padding-top: 5px; }
            .row { display: flex; justify-content: space-between; }
            .total { display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px; border-top: 1px dashed #000; padding-top: 10px; font-size: 16px; }
            .footer { text-align: center; margin-top: 20px; font-size: 11px; }
            hr { border: 0; border-top: 1px dashed #000; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            ${invoice.receiptSettings.showLogo && invoice.company.logo ? `<img src="${invoice.company.logo}" class="logo" />` : ''}
            <h2 style="margin: 0;">${invoice.company.name}</h2>
            <p style="margin: 2px 0; font-size: 12px;">${invoice.company.address || ''}</p>
            <p style="margin: 2px 0; font-size: 12px;">Table: ${invoice.tableNumber}</p>
          </div>
          <hr/>
          <div class="items">${itemsHtml}</div>
          <div class="breakdown">
            <div class="row"><span>Subtotal</span><span>${currency}${invoice.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
            ${invoice.receiptSettings.showTax ? `<div class="row"><span>Tax</span><span>${currency}${invoice.taxAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>` : ''}
          </div>
          <div class="total">
            <span>TOTAL</span>
            <span>${currency}${invoice.totalAmount.toLocaleString()}</span>
            ${totalInSecondary ? `
            <span style="font-size: 12px; opacity: 0.7;">(${secondaryCurrency}${totalInSecondary})</span>
            ` : ''}
          </div>
          <div class="footer">
            <p>${invoice.receiptSettings.footerText || 'Thank you!'}</p>
            <p>ID: ${invoice.orderId}</p>
          </div>
          <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return null;
};

export default InvoicePrinter;