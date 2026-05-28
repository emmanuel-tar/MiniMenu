# MiniMenu Modernization TODO

- [ ] Step 0: Identify modernization scope (B/C/D)
- [ ] Step 1: Make active waiter calls + payment selections DB-backed (remove in-memory socket state)
  - [ ] Update `prisma/schema.prisma` with `WaiterCall` and `PaymentSelection` models
  - [ ] Refactor `server.ts` to use DB for create/update/clear/list
  - [ ] Ensure existing socket event names remain unchanged
  - [ ] Add TTL behavior via `expiresAt` + query filtering
- [ ] Step 2: POS UX improvements (reduce polling, prevent duplicate socket listeners, align payment methods to settings)
- [ ] Step 3: Compliance/legal operational readiness (receipt/legal footer + audit coverage, add Terms/Privacy pages)
- [ ] Testing: run `npm run lint` + `npm run build`

