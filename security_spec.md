# Security Specification — Tabletop Studio Normalized Client Tables

## 1. Data Invariants
1. **Master Gate Sync**: Every subcollection record under `/clientAccounts/{clientId}` (`promotions`, `menuCategories`, `menuItems`, `specials`, `mediaAssets`) requires the parent `/clientAccounts/{clientId}` document to exist (`exists(...)`) and passes authorization (`isAdmin()` or verified owner/contact email match).
2. **Strict RBAC**: Only verified Super Admins (`martynocoaching@gmail.com`, `/admins/{uid}`, or `/adminInvites/{email}`) may create or delete `/clientAccounts/{clientId}` or list all accounts. Verified client owners matching `ownerUid` or `contactEmail` may read and manage their own venue profile and content subcollections without ability to alter billing subscription rates or `createdByUid`.
3. **No Self-Promotion**: Standard users creating `/users/{userId}` can only assign `role: "client"` and cannot mutate `role` on update unless they already hold `isAdmin()`.
4. **Immutable Ownership & Temporal Integrity**: `id`, `clientId`, `createdByUid`, and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
5. **Query Security Without Read Explosions**: Every `allow list` rule evaluates `resource.data` directly against `request.auth.uid`, `request.auth.token.email`, or `isBootstrapAdmin()` with zero `get()`/`exists()` lookups.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. Unauthenticated read/list on `/clientAccounts` or any `/clientAccounts/{clientId}/promotions`.
2. Unverified-email user attempting to create a `/clientAccounts/{id}` or `/clientAccounts/{id}/menuItems/{itemId}` document.
3. Non-admin client attempting to create `/users/{uid}` with `role: "super_admin"`.
4. Non-admin client attempting to update `/clientAccounts/{id}` billing fields (`monthlySubscriptionFee`, `totalMonthlyBill`, `monthlyCredit`) directly.
5. Client A attempting to read or write Client B's `/clientAccounts/{clientB}/promotions/{promoId}`.
6. Writing a promotion/menu/special record referencing a non-existent `clientId` (orphaned record).
7. Attempting to create a subcollection record with a ghost field (`{ isFree: true }`).
8. Attempting to update a record and mutate `createdByUid`, `clientId`, or `createdAt`.
9. Attempting to create a `menuItems` record with negative `price: -5` or oversized `name` (>120 chars).
10. Attempting to create a `promotions` record with invalid `scheduleMode: "hacked"` or `durationSec: 9999`.
11. Attempting to create `mediaAssets` with `url` > 1000 chars or invalid `sourceType`.
12. Non-admin user attempting to delete `/clientAccounts/{id}`.
